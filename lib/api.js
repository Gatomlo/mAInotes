// Routes de l'API (toutes protégées par la session).
const express = require('express');
const fs = require('fs');
const { uid } = require('./store');
const { encrypt } = require('./secrets');
const { buildPdf } = require('./pdf');
const createAccess = require('./access');

const COLORS = ['blue', 'amber', 'purple', 'green', 'rose'];
const TRASH_DAYS = 30;
const PROP_TYPES = ['text', 'number', 'date', 'select', 'checkbox', 'url'];
const MAX_PROPS = 12;

const AUDIO_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac' };
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };

function bad(res, msg, code = 400) { return res.status(code).json({ error: msg }); }
const str = (v, max) => String(v == null ? '' : v).slice(0, max);

module.exports = function createApi(store, ai, pipeline, auth, push) {
  const db = () => store.db;
  const access = createAccess(store);
  const r = express.Router();
  r.use(auth.requireAuth);
  const me = (req) => req.user.id;
  const isAdmin = (req) => req.user.role === 'admin';
  const adminOnly = (req, res, next) => (isAdmin(req) ? next() : bad(res, 'Réservé à l\'administrateur.', 403));
  // Mes carnets / mes tags (ceux dont je suis propriétaire).
  const myNotebooks = (req) => db().notebooks.filter((c) => c.ownerId === me(req));
  const myTags = (req) => db().tags.filter((t) => t.ownerId === me(req));
  const ownNotebook = (req, id) => { const c = store.notebook(id); return c && c.ownerId === me(req) ? c : null; };
  const ownTag = (req, id) => { const t = store.tag(id); return t && t.ownerId === me(req) ? t : null; };
  const nameOf = (id) => { const u = store.user(id); return u ? u.name : ''; };

  const touch = (n) => { n.updatedAt = Date.now(); };
  let lastMerge = null;

  // Réglages vus par une personne : les globaux, plus son carnet par défaut et sa description.
  const settingsFor = (req) => ({ ...db().settings, defaultNotebook: req.user.defaultNotebook || '', context: req.user.context || '' });

  // ---------- État complet (synchronisation entre appareils) ----------
  r.get('/state', (req, res) => {
    const d = db();
    const u = me(req);
    const notes = access.visibleNotes(u).map((n) => {
      const role = access.noteRole(u, n);
      const participants = access.participants(n);
      return role === 'owner' ? { ...n, participants } : { ...n, role, ownerName: nameOf(n.ownerId), participants };
    });
    // Carnets : les miens et ceux qu'on m'a ouverts, plus ceux qui contiennent une note partagée avec moi.
    const nbIds = new Set(notes.map((n) => n.notebookId).filter(Boolean));
    const notebooks = d.notebooks.filter((c) => access.notebookRole(u, c) || nbIds.has(c.id)).sort((a, b) => a.order - b.order).map((c) => {
      const role = access.notebookRole(u, c);
      return role === 'owner' ? c : { ...c, role: role || 'read', ownerName: nameOf(c.ownerId), shares: undefined };
    });
    const tagIds = new Set(notes.flatMap((n) => n.tagIds || []));
    const tags = d.tags.filter((t) => t.ownerId === u || tagIds.has(t.id));
    res.json({
      serverTime: Date.now(),
      notebooks,
      tags,
      notes,
      users: d.users.map((x) => ({ id: x.id, name: x.name, login: x.login })),
      notify: { ...push.settingsOf(req.user), devices: (req.user.pushSubs || []).length },
      settings: settingsFor(req),
      providers: ai.summary(),
      retri: d.retris.find((x) => x.ownerId === u) || null,
      synthesesCount: d.syntheses.filter((x) => x.ownerId === u).length
    });
  });

  // ---------- Notes ----------
  r.post('/notes', (req, res) => {
    const { clientId, type, content, notebookId, dur, createdAt, enrich, read, todos } = req.body || {};
    if (!['text', 'voice', 'image'].includes(type)) return bad(res, 'Type de note inconnu.');
    if (clientId) {
      const existing = db().notes.find((n) => n.clientId === clientId && n.ownerId === me(req));
      if (existing) return res.json({ note: existing, duplicate: true });
    }
    let nb = notebookId ? store.notebook(notebookId) : null;
    if (nb && !access.allows(access.notebookRole(me(req), nb), 'edit')) nb = null;
    const now = Date.now();
    const created = Number(createdAt) && Number(createdAt) < now + 60000 ? Number(createdAt) : now;
    const n = {
      id: uid(),
      ownerId: me(req),
      shares: [],
      clientId: clientId ? str(clientId, 64) : null,
      type,
      title: '',
      titleManual: false,
      content: str(content, 100000),
      transcript: '',
      description: '',
      lang: null,
      status: type === 'text' ? 'queued' : 'uploading',
      pendingReason: null,
      needsReview: false,
      notebookId: nb ? nb.id : null,
      notebookChosen: !!nb,
      tagIds: [],
      locked: false,
      ai: false,
      confidence: null,
      provider: {},
      suggestion: null,
      media: [],
      links: [],
      todos: (Array.isArray(todos) ? todos : []).map((t) => str(t, 300).trim()).filter(Boolean).slice(0, 30).map((text) => ({ id: uid(), text, done: false, due: null, doneAt: null })),
      props: {},
      enrich: typeof enrich === 'boolean' ? enrich : null,
      // Lecture : null (non concernée), 'todo' (à lire), 'done' (lue). Jamais modifiée par l'IA.
      read: read === 'todo' ? 'todo' : null,
      readAt: null,
      dur: Math.max(0, Math.round(Number(dur) || 0)),
      error: null,
      attempts: 0,
      createdAt: created,
      updatedAt: now,
      trashedAt: null
    };
    if (type === 'text' && !n.content.trim()) return bad(res, 'La note est vide.');
    n.title = provisionalTitle(n);
    db().notes.push(n);
    store.save();
    if (type === 'text') pipeline.schedule(n);
    res.json({ note: n });
  });

  function provisionalTitle(n) {
    if (n.type === 'voice') return `Note vocale · ${Math.floor(n.dur / 60)}:${String(n.dur % 60).padStart(2, '0')}`;
    const t = String(n.content || '').trim().split(/[.\n!?]/)[0].trim();
    if (!t) return n.type === 'image' ? 'Image' : 'Note sans titre';
    return t.length > 60 ? t.slice(0, 57) + '…' : t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Note demandée, si la personne a le droit voulu : « read », « edit » (défaut) ou « owner ».
  function findNote(req, res, need = 'edit') {
    const n = store.note(req.params.id);
    const role = n && access.noteRole(me(req), n);
    if (!n || !role) { bad(res, 'Note introuvable.', 404); return null; }
    if (!access.allows(role, need)) { bad(res, need === 'owner' ? 'Seule la personne qui a écrit la note peut faire cela.' : 'Cette note est en lecture seule pour vous.', 403); return null; }
    return n;
  }

  // Envoi d'un média en binaire brut (Content-Type = type du fichier).
  r.post('/notes/:id/media', express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    const s = db().settings;
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const kind = req.query.kind === 'ai' ? 'ai' : 'original';
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return bad(res, 'Fichier vide.');
    let ext;
    if (n.type === 'voice') {
      ext = AUDIO_EXT[mime];
      if (!ext) return bad(res, `Format audio non pris en charge (${mime}).`);
      if (n.dur > s.maxVoiceSec + 2) return bad(res, `Vocal trop long : ${s.maxVoiceSec} secondes maximum.`);
    } else if (n.type === 'image') {
      ext = IMAGE_EXT[mime];
      if (!ext) return bad(res, `Format d'image non pris en charge (${mime}).`);
      if (kind === 'original' && buf.length > s.maxImageMb * 1024 * 1024) return bad(res, `Image trop lourde : ${s.maxImageMb} Mo maximum.`);
    } else return bad(res, 'Cette note n\'accepte pas de média.');

    const file = `${n.id}-${uid()}.${ext}`;
    fs.writeFileSync(store.mediaPath(file), buf);
    if (kind === 'ai') {
      const m = n.media[n.media.length - 1];
      if (!m) { fs.rmSync(store.mediaPath(file), { force: true }); return bad(res, 'Envoyez d\'abord l\'image d\'origine.'); }
      if (m.aiFile) fs.rmSync(store.mediaPath(m.aiFile), { force: true });
      m.aiFile = file;
    } else {
      // Un même envoi rejoué (file hors connexion) remplace le précédent.
      const replay = req.query.slot !== undefined ? n.media.find((m) => m.slot === Number(req.query.slot)) : null;
      if (replay) {
        fs.rmSync(store.mediaPath(replay.file), { force: true });
        if (replay.aiFile) fs.rmSync(store.mediaPath(replay.aiFile), { force: true });
        n.media = n.media.filter((m) => m !== replay);
      }
      n.media.push({ id: uid(), slot: Number(req.query.slot) || 0, file, mime, size: buf.length, dur: n.type === 'voice' ? n.dur : undefined });
    }
    touch(n);
    store.save();
    res.json({ note: n });
  });

  // Fin de l'envoi : l'analyse démarre selon les réglages.
  r.post('/notes/:id/submit', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    if (n.status === 'uploading') {
      if (!n.media.length) return bad(res, 'Aucun fichier reçu.');
      pipeline.schedule(n);
    }
    res.json({ note: n });
  });

  r.get('/media/:noteId/:mediaId', (req, res) => {
    const n = store.note(req.params.noteId);
    const m = n && access.noteRole(me(req), n) && n.media.find((x) => x.id === req.params.mediaId);
    if (!m) return bad(res, 'Fichier introuvable.', 404);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(m.mime).sendFile(store.mediaPath(req.query.ai && m.aiFile ? m.aiFile : m.file));
  });

  // Valeurs des propriétés du carnet de la note (null ou vide : valeur retirée).
  function applyProps(n, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Propriétés invalides.';
    const nb = store.notebook(n.notebookId);
    const defs = (nb && nb.properties) || [];
    n.props = n.props || {};
    for (const [id, raw] of Object.entries(input)) {
      const p = defs.find((x) => x.id === id);
      if (!p) return 'Propriété inconnue pour le carnet de cette note.';
      if (n.propsAi) delete n.propsAi[id]; // une valeur saisie à la main n'est plus « proposée par l'IA »
      if (raw === null || raw === '' || raw === undefined || (p.type === 'checkbox' && raw === false)) { delete n.props[id]; continue; }
      if (p.type === 'text' || p.type === 'url') n.props[id] = str(raw, 500);
      else if (p.type === 'number') {
        const v = Number(raw);
        if (!Number.isFinite(v)) return `« ${p.name} » doit être un nombre.`;
        n.props[id] = v;
      } else if (p.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw)) || isNaN(Date.parse(raw))) return `« ${p.name} » doit être une date.`;
        n.props[id] = String(raw);
      } else if (p.type === 'select') {
        if (!p.options.includes(raw)) return `Option inconnue pour « ${p.name} ».`;
        n.props[id] = raw;
      } else if (p.type === 'checkbox') n.props[id] = !!raw;
    }
    return null;
  }

  const timeOf = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null);
  const todoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v)) ? String(v) : null);
  r.patch('/notes/:id', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    const b = req.body || {};
    if (b.title !== undefined) { n.title = str(b.title, 200); n.titleManual = true; }
    if (b.content !== undefined) { n.content = str(b.content, 100000); pipeline.updateLinks(n); }
    if (b.transcript !== undefined) { n.transcript = str(b.transcript, 100000); n.transcriptEdited = true; }
    if (b.description !== undefined) { n.description = str(b.description, 100000); n.descriptionEdited = true; }
    // Toute correction du classement le verrouille (F10).
    if (b.notebookId !== undefined) {
      const nb = b.notebookId ? store.notebook(b.notebookId) : null;
      if (nb && !access.allows(access.notebookRole(me(req), nb), 'edit')) return bad(res, 'Vous ne pouvez pas ranger de note dans ce carnet.', 403);
      n.notebookId = nb ? nb.id : null;
      n.locked = true;
      n.ai = false;
      n.needsReview = !n.notebookId;
    }
    if (Array.isArray(b.tagIds)) {
      n.tagIds = [...new Set(b.tagIds.filter((id) => { const t = store.tag(id); return t && (t.ownerId === me(req) || t.ownerId === n.ownerId); }))];
      n.locked = true;
      n.ai = false;
    }
    if (b.props !== undefined) {
      const err = applyProps(n, b.props);
      if (err) return bad(res, err);
    }
    if (b.dismissRelated) {
      n.related = (n.related || []).filter((id) => id !== b.dismissRelated);
      n.relatedOff = [...new Set([...(n.relatedOff || []), String(b.dismissRelated)])].slice(-50);
    }
    if (b.due !== undefined) n.due = todoDate(b.due);
    if (b.dueTime !== undefined) n.dueTime = timeOf(b.dueTime);
    if (!n.due) n.dueTime = null;
    // Retour à la transcription d'origine après un nettoyage par l'IA : elle n'est plus nettoyée ensuite.
    if (b.restoreRaw && n.transcriptRaw) { n.transcript = n.transcriptRaw; n.cleanedAi = false; n.transcriptEdited = true; }
    if (b.locked !== undefined) n.locked = !!b.locked;
    if (b.read !== undefined) {
      if (![null, 'todo', 'done'].includes(b.read)) return bad(res, 'État de lecture inconnu.');
      n.read = b.read;
      n.readAt = b.read === 'done' ? Date.now() : null;
    }
    touch(n);
    store.save();
    res.json({ note: n });
  });

  // ---------- Tâches (cases à cocher d'une note) ----------
  const MAX_TODOS = 100;
  // Une tâche ne s'assigne qu'à une personne qui voit la note.
  const assigneeOf = (n, v) => (v && access.participants(n).includes(String(v)) ? String(v) : null);
  function findTodo(n, req, res) {
    const t = (n.todos || []).find((x) => x.id === req.params.tid);
    if (!t) { bad(res, 'Tâche introuvable.', 404); return null; }
    return t;
  }
  r.post('/notes/:id/todos', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    // Une tâche (text) ou plusieurs d'un coup (texts), par exemple après une extraction par l'IA.
    const texts = (Array.isArray(req.body && req.body.texts) ? req.body.texts : [req.body && req.body.text]).map((t) => str(t, 300).trim()).filter(Boolean);
    if (!texts.length) return bad(res, 'La tâche est vide.');
    n.todos = n.todos || [];
    // Identifiant choisi par l'appareil (ajout hors connexion) : un renvoi ne crée pas de doublon.
    const cid = req.body && /^[A-Za-z0-9_-]{6,24}$/.test(String(req.body.id || '')) ? String(req.body.id) : null;
    if (cid && texts.length === 1 && n.todos.some((t) => t.id === cid)) return res.json({ note: n });
    if (n.todos.length + texts.length > MAX_TODOS) return bad(res, `Une note contient ${MAX_TODOS} tâches au plus.`);
    const assignee = assigneeOf(n, req.body && req.body.assignee);
    texts.forEach((text) => n.todos.push({ id: cid && texts.length === 1 ? cid : uid(), text, done: false, due: todoDate(req.body.due), time: timeOf(req.body.time), assignee, doneAt: null }));
    touch(n);
    store.save();
    res.json({ note: n });
  });
  r.patch('/notes/:id/todos/:tid', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    const t = findTodo(n, req, res);
    if (!t) return;
    const b = req.body || {};
    if (b.text !== undefined) {
      const text = str(b.text, 300).trim();
      if (!text) return bad(res, 'La tâche est vide.');
      t.text = text;
    }
    if (b.done !== undefined) { t.done = !!b.done; t.doneAt = t.done ? Date.now() : null; }
    if (b.due !== undefined) t.due = todoDate(b.due);
    if (b.time !== undefined) t.time = timeOf(b.time);
    if (b.assignee !== undefined) { t.assignee = assigneeOf(n, b.assignee); delete t.suggest; }
    touch(n);
    store.save();
    res.json({ note: n });
  });
  // Suggestion d'assignation de l'IA (« dis à Bob de… ») : un clic de l'auteur de la note. Accepter partage la
  // note avec la personne (modification) et lui assigne la tâche ; refuser retire la suggestion.
  r.post('/notes/:id/todos/:tid/suggest', (req, res) => {
    const n = findNote(req, res, 'owner');
    if (!n) return;
    const t = findTodo(n, req, res);
    if (!t) return;
    const uid2 = t.suggest;
    if (!uid2 || !store.user(uid2)) { delete t.suggest; store.save(); return res.json({ note: n }); }
    if (req.body && req.body.accept) {
      if (!access.participants(n).includes(uid2)) n.shares = access.cleanShares((n.shares || []).concat([{ userId: uid2, role: 'edit' }]), n.ownerId);
      t.assignee = uid2;
    }
    delete t.suggest;
    touch(n);
    store.save();
    res.json({ note: n });
  });
  // Annule un ajout automatique à une liste (« ajoute du lait à ma liste ») : les éléments repartent, la note d'origine revient.
  r.post('/notes/:id/undo-append', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    const entry = (n.appended || []).find((a) => a.noteId === (req.body && req.body.noteId));
    if (!entry) return bad(res, 'Rien à annuler.', 404);
    n.todos = (n.todos || []).filter((t) => !entry.ids.includes(t.id));
    n.appended = n.appended.filter((a) => a !== entry);
    const src = store.note(entry.noteId);
    if (src) { src.trashedAt = null; src.mergedInto = null; touch(src); }
    touch(n);
    store.save();
    res.json({ note: n, restored: src ? src.id : null });
  });
  r.delete('/notes/:id/todos/:tid', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    // Déjà supprimée (renvoi après coupure) : rien à faire.
    if (!(n.todos || []).some((x) => x.id === req.params.tid)) return res.json({ note: n });
    n.todos = n.todos.filter((x) => x.id !== req.params.tid);
    touch(n);
    store.save();
    res.json({ note: n });
  });

  // ---------- Notifications à la date d'une note ou d'une tâche ----------
  r.get('/notify', (req, res) => {
    let publicKey;
    try { publicKey = push.keys().publicKey; } catch (e) { return bad(res, 'Notifications indisponibles sur ce serveur (module web-push absent : lancez npm install).', 503); }
    res.json({ publicKey, ...push.settingsOf(req.user), devices: (req.user.pushSubs || []).length });
  });
  r.patch('/notify', (req, res) => {
    const b = req.body || {};
    const cur = push.settingsOf(req.user);
    if (b.enabled !== undefined) cur.enabled = !!b.enabled;
    if (b.hour !== undefined) { const h = Number(b.hour); if (!Number.isInteger(h) || h < 0 || h > 23) return bad(res, 'Heure invalide.'); cur.hour = h; }
    if (b.lead !== undefined) { const l = Number(b.lead); if (![0, 15, 30, 60, 120].includes(l)) return bad(res, 'Délai invalide.'); cur.lead = l; }
    req.user.notify = cur;
    req.user.lastDigest = null;
    store.save();
    res.json({ ...cur, devices: (req.user.pushSubs || []).length });
  });
  r.post('/notify/subscribe', (req, res) => {
    if (!push.subscribe(req.user, req.body && req.body.subscription, req.body && req.body.device)) return bad(res, 'Abonnement invalide.');
    res.json({ ...push.settingsOf(req.user), devices: req.user.pushSubs.length });
  });
  r.post('/notify/unsubscribe', (req, res) => {
    push.unsubscribe(req.user, String((req.body && req.body.endpoint) || ''));
    res.json({ ...push.settingsOf(req.user), devices: (req.user.pushSubs || []).length });
  });
  r.post('/notify/test', async (req, res) => {
    const ok = await push.test(req.user);
    if (!ok) return bad(res, 'Aucun appareil abonné (ou abonnement expiré) : activez les notifications sur cet appareil.');
    res.json({ sent: ok });
  });

  // ---------- Partage ----------
  // Carnet : seul son propriétaire partage ; les notes et tâches qu'il contient suivent.
  r.put('/notebooks/:id/shares', (req, res) => {
    const nb = ownNotebook(req, req.params.id);
    if (!nb) return bad(res, 'Carnet introuvable.', 404);
    nb.shares = access.cleanShares(req.body && req.body.shares, nb.ownerId);
    store.save();
    res.json({ notebook: nb });
  });
  // Note : seule la personne qui l'a écrite la partage.
  r.put('/notes/:id/shares', (req, res) => {
    const n = findNote(req, res, 'owner');
    if (!n) return;
    n.shares = access.cleanShares(req.body && req.body.shares, n.ownerId);
    // Une tâche assignée à quelqu'un qui n'a plus accès redevient non assignée.
    const ok = new Set(access.participants(n));
    (n.todos || []).forEach((t) => { if (t.assignee && !ok.has(t.assignee)) t.assignee = null; });
    touch(n);
    store.save();
    res.json({ note: n });
  });

  r.post('/notes/:id/analyze', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    if (n.status === 'queued' || n.status === 'analyzing') return res.json({ note: n });
    const { describe, provider } = req.body || {};
    n.attempts = 0;
    pipeline.schedule(n, { force: true, describe: !!describe, provider: provider || undefined });
    res.json({ note: n });
  });

  r.post('/notes-analyze-all', (req, res) => {
    const list = db().notes.filter((n) => n.ownerId === me(req) && !n.trashedAt && (n.status === 'pending' || n.status === 'error'));
    list.forEach((n) => { n.attempts = 0; pipeline.schedule(n, { force: true }); });
    res.json({ count: list.length });
  });

  r.post('/notes/:id/enrich', async (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    if (db().settings.trigger.enrich === 'off') return bad(res, 'L\'enrichissement est désactivé dans les réglages.');
    try {
      await pipeline.enrichNote(n, { provider: (req.body || {}).provider || undefined });
      res.json({ note: n, empty: !n.enrichment });
    } catch (err) {
      res.status(err.budget ? 402 : err.quota ? 429 : 400).json({ error: String(err.message || err) });
    }
  });

  // ---------- Fonctions IA sur les notes : transformer, interroger ----------
  const aiErr = (res, err) => res.status(err.budget ? 402 : err.quota ? 429 : 400).json({ error: String(err.message || err) });
  r.post('/notes/:id/transform', async (req, res) => {
    const n = findNote(req, res, 'read');
    if (!n) return;
    if (db().settings.features.ai === false) return bad(res, 'Les fonctions IA sur les notes sont désactivées dans les réglages.');
    try { res.json({ result: await pipeline.transformNote(n, (req.body || {}).action) }); } catch (err) { aiErr(res, err); }
  });
  r.post('/ask', async (req, res) => {
    if (db().settings.features.ai === false) return bad(res, 'Les fonctions IA sur les notes sont désactivées dans les réglages.');
    const q = str(req.body && req.body.question, 300).trim();
    if (!q) return bad(res, 'La question est vide.');
    try { res.json(await pipeline.askNotes(q, me(req))); } catch (err) { aiErr(res, err); }
  });

  r.delete('/notes/:id/enrichment', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    n.enrichment = null;
    touch(n);
    store.save();
    res.json({ note: n });
  });

  r.post('/notes/:id/suggestion', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    const action = (req.body || {}).action;
    const sg = n.suggestion || {};
    if (action === 'notebook' && sg.notebook) {
      const own = db().notebooks.filter((c) => c.ownerId === n.ownerId);
      let nb = own.find((c) => c.name.toLowerCase() === sg.notebook.toLowerCase());
      if (!nb) {
        nb = { id: uid(), ownerId: n.ownerId, shares: [], name: sg.notebook, desc: '', color: COLORS[own.length % COLORS.length], order: db().notebooks.length, needsDesc: true };
        db().notebooks.push(nb);
      }
      n.notebookId = nb.id;
      n.needsReview = false;
      delete sg.notebook;
    } else if (action === 'tag' && sg.tag) {
      let t = db().tags.find((x) => x.ownerId === n.ownerId && x.name.toLowerCase() === sg.tag.toLowerCase());
      if (!t) { t = { id: uid(), ownerId: n.ownerId, name: sg.tag, desc: '' }; db().tags.push(t); }
      if (!n.tagIds.includes(t.id)) n.tagIds.push(t.id);
      delete sg.tag;
    } else if (action === 'ignore') {
      n.suggestion = null;
    }
    if (n.suggestion && !n.suggestion.notebook && !n.suggestion.tag) n.suggestion = null;
    touch(n);
    store.save();
    res.json({ note: n, notebooks: myNotebooks(req), tags: myTags(req) });
  });

  function purgeNote(n) {
    n.media.forEach((m) => {
      fs.rmSync(store.mediaPath(m.file), { force: true });
      if (m.aiFile) fs.rmSync(store.mediaPath(m.aiFile), { force: true });
    });
    db().notes = db().notes.filter((x) => x !== n);
  }

  r.delete('/notes/:id', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    if (req.query.purge) { if (n.ownerId !== me(req)) return bad(res, 'Seule la personne qui a écrit la note peut la supprimer définitivement.', 403); purgeNote(n); }
    else { n.trashedAt = Date.now(); touch(n); }
    store.save();
    res.json({ ok: true });
  });

  r.post('/notes/:id/restore', (req, res) => {
    const n = findNote(req, res);
    if (!n) return;
    n.trashedAt = null;
    touch(n);
    store.save();
    res.json({ note: n });
  });

  r.post('/trash/empty', (req, res) => {
    db().notes.filter((n) => n.trashedAt && n.ownerId === me(req)).forEach(purgeNote);
    store.save();
    res.json({ ok: true });
  });

  // ---------- Carnets ----------
  function cleanNotebook(b, nb) {
    if (b.name !== undefined) {
      const name = str(b.name, 40).trim();
      if (!name) return 'Le nom est obligatoire.';
      if (db().notebooks.some((c) => c !== nb && c.ownerId === nb.ownerId && c.name.toLowerCase() === name.toLowerCase())) return 'Ce carnet existe déjà.';
      nb.name = name;
    }
    if (b.desc !== undefined) { nb.desc = str(b.desc, 400); nb.needsDesc = false; }
    if (b.color !== undefined && COLORS.includes(b.color)) nb.color = b.color;
    if (b.properties !== undefined) {
      if (!Array.isArray(b.properties)) return 'Propriétés invalides.';
      if (b.properties.length > MAX_PROPS) return `Un carnet a ${MAX_PROPS} propriétés au plus.`;
      const old = nb.properties || [];
      const out = [];
      for (const p of b.properties) {
        const name = str(p && p.name, 30).trim();
        if (!name) return 'Chaque propriété doit avoir un nom.';
        if (out.some((x) => x.name.toLowerCase() === name.toLowerCase())) return `La propriété « ${name} » existe déjà.`;
        const type = PROP_TYPES.includes(p.type) ? p.type : 'text';
        const prev = p.id && old.find((x) => x.id === p.id);
        const prop = { id: prev ? prev.id : uid(), name, type };
        if (p.ai) prop.ai = true;
        if (type === 'select') {
          const opts = Array.isArray(p.options) ? p.options : String(p.options || '').split(',');
          prop.options = [...new Set(opts.map((o) => str(o, 30).trim()).filter(Boolean))].slice(0, 20);
          if (!prop.options.length) return `La propriété « ${name} » a besoin d'au moins une option.`;
        }
        out.push(prop);
      }
      // Les valeurs d'une propriété supprimée (ou dont le type a changé) sont retirées des notes.
      const keep = new Set(out.filter((p) => { const o = old.find((x) => x.id === p.id); return !o || o.type === p.type; }).map((p) => p.id));
      db().notes.forEach((n) => {
        if (n.notebookId !== nb.id || !n.props) return;
        for (const k of Object.keys(n.props)) {
          const p = out.find((x) => x.id === k);
          if (!keep.has(k) || (p && p.type === 'select' && !p.options.includes(n.props[k]))) delete n.props[k];
        }
      });
      nb.properties = out;
    }
    return null;
  }

  r.post('/notebooks', (req, res) => {
    const nb = { id: uid(), ownerId: me(req), shares: [], name: '', desc: '', color: 'green', order: db().notebooks.length };
    const err = cleanNotebook({ desc: '', ...req.body }, nb);
    if (err) return bad(res, err);
    db().notebooks.push(nb);
    store.save();
    res.json({ notebook: nb });
  });

  r.patch('/notebooks/:id', (req, res) => {
    const nb = ownNotebook(req, req.params.id);
    if (!nb) return bad(res, 'Carnet introuvable.', 404);
    const err = cleanNotebook(req.body || {}, nb);
    if (err) return bad(res, err);
    store.save();
    res.json({ notebook: nb });
  });

  // Suppression : les notes passent « à vérifier » (F46), le défaut revient à l'IA (F48).
  r.delete('/notebooks/:id', (req, res) => {
    const nb = ownNotebook(req, req.params.id);
    if (!nb) return bad(res, 'Carnet introuvable.', 404);
    let k = 0;
    db().notes.forEach((n) => {
      if (n.notebookId === nb.id) { n.notebookId = null; n.notebookChosen = false; n.needsReview = true; touch(n); k++; }
    });
    db().notebooks = db().notebooks.filter((c) => c !== nb);
    db().users.forEach((u) => { if (u.defaultNotebook === nb.id) u.defaultNotebook = ''; });
    store.save();
    res.json({ moved: k });
  });

  // Fusion (F47) : annulable juste après via /merge/undo.
  r.post('/notebooks/merge', (req, res) => {
    const { from, to } = req.body || {};
    const a = ownNotebook(req, from);
    const b = ownNotebook(req, to);
    if (!a || !b || a === b) return bad(res, 'Choisissez deux carnets différents.');
    const ids = [];
    db().notes.forEach((n) => { if (n.notebookId === a.id) { n.notebookId = b.id; ids.push(n.id); touch(n); } });
    const wasDefault = req.user.defaultNotebook === a.id;
    if (wasDefault) req.user.defaultNotebook = b.id;
    db().notebooks = db().notebooks.filter((c) => c !== a);
    lastMerge = { by: me(req), kind: 'notebook', item: a, to: b.id, ids, wasDefault, at: Date.now() };
    store.save();
    res.json({ moved: ids.length });
  });

  // ---------- Tags ----------
  function cleanTagName(v) { return str(v, 30).trim().replace(/^#/, ''); }

  r.post('/tags', (req, res) => {
    const name = cleanTagName((req.body || {}).name);
    if (!name) return bad(res, 'Le nom est obligatoire.');
    const exists = myTags(req).find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.json({ tag: exists, existed: true });
    const t = { id: uid(), ownerId: me(req), name, desc: str((req.body || {}).desc, 300) };
    db().tags.push(t);
    store.save();
    res.json({ tag: t });
  });

  r.patch('/tags/:id', (req, res) => {
    const t = ownTag(req, req.params.id);
    if (!t) return bad(res, 'Tag introuvable.', 404);
    const b = req.body || {};
    if (b.name !== undefined) {
      const name = cleanTagName(b.name);
      if (!name) return bad(res, 'Le nom est obligatoire.');
      if (myTags(req).some((x) => x !== t && x.name.toLowerCase() === name.toLowerCase())) return bad(res, 'Ce tag existe déjà : utilisez la fusion.');
      t.name = name;
    }
    if (b.desc !== undefined) t.desc = str(b.desc, 300);
    store.save();
    res.json({ tag: t });
  });

  r.delete('/tags/:id', (req, res) => {
    const t = ownTag(req, req.params.id);
    if (!t) return bad(res, 'Tag introuvable.', 404);
    let k = 0;
    db().notes.forEach((n) => { if (n.tagIds.includes(t.id)) { n.tagIds = n.tagIds.filter((x) => x !== t.id); touch(n); k++; } });
    db().tags = db().tags.filter((x) => x !== t);
    store.save();
    res.json({ removed: k });
  });

  r.post('/tags/merge', (req, res) => {
    const { from, to } = req.body || {};
    const a = ownTag(req, from);
    const b = ownTag(req, to);
    if (!a || !b || a === b) return bad(res, 'Choisissez deux tags différents.');
    const ids = [];
    const hadBoth = [];
    db().notes.forEach((n) => {
      if (!n.tagIds.includes(a.id)) return;
      ids.push(n.id);
      if (n.tagIds.includes(b.id)) hadBoth.push(n.id);
      n.tagIds = [...new Set(n.tagIds.map((x) => (x === a.id ? b.id : x)))];
      touch(n);
    });
    db().tags = db().tags.filter((x) => x !== a);
    lastMerge = { by: me(req), kind: 'tag', item: a, to: b.id, ids, hadBoth, at: Date.now() };
    store.save();
    res.json({ moved: ids.length });
  });

  r.post('/merge/undo', (req, res) => {
    const m = lastMerge;
    if (!m || m.by !== me(req) || Date.now() - m.at > 10 * 60 * 1000) return bad(res, 'Plus rien à annuler.');
    if (m.kind === 'notebook') {
      db().notebooks.push(m.item);
      m.ids.forEach((id) => { const n = store.note(id); if (n && n.notebookId === m.to) { n.notebookId = m.item.id; touch(n); } });
      if (m.wasDefault) req.user.defaultNotebook = m.item.id;
    } else {
      db().tags.push(m.item);
      m.ids.forEach((id) => {
        const n = store.note(id);
        if (!n) return;
        if (!m.hadBoth.includes(id)) n.tagIds = n.tagIds.filter((x) => x !== m.to);
        if (!n.tagIds.includes(m.item.id)) n.tagIds.push(m.item.id);
        touch(n);
      });
    }
    lastMerge = null;
    store.save();
    res.json({ ok: true });
  });

  // ---------- Réglages et clés ----------
  r.patch('/settings', (req, res) => {
    const s = db().settings;
    // Chacun règle son carnet par défaut ; le reste (IA, budget, clés) est réservé à l'administrateur.
    if (req.body && req.body.defaultNotebook !== undefined) {
      const c = req.body.defaultNotebook ? store.notebook(req.body.defaultNotebook) : null;
      req.user.defaultNotebook = c && access.allows(access.notebookRole(me(req), c), 'edit') ? c.id : '';
    }
    if (req.body && req.body.context !== undefined) req.user.context = str(req.body.context, 1500).trim();
    if (!isAdmin(req)) { store.save(); return res.json({ settings: settingsFor(req), providers: ai.summary() }); }
    const b = req.body || {};
    const PROV = Object.keys(ai.PROVIDERS);
    if (b.maxVoiceSec !== undefined) s.maxVoiceSec = Math.min(120, Math.max(30, Number(b.maxVoiceSec) || 120));
    if (b.maxImageMb !== undefined) s.maxImageMb = Math.min(30, Math.max(1, Number(b.maxImageMb) || 8));
    if (b.reduceImage !== undefined) s.reduceImage = !!b.reduceImage;
    if (b.providers) {
      for (const fn of ['classif', 'transcr', 'vision', 'synth', 'enrich']) {
        const p = b.providers[fn];
        if (p && PROV.includes(p) && ai.PROVIDERS[p].supports[fn]) s.providers[fn] = p;
      }
    }
    if (b.trigger) {
      if (['auto', 'manual'].includes(b.trigger.classif)) s.trigger.classif = b.trigger.classif;
      if (['auto', 'manual'].includes(b.trigger.transcr)) s.trigger.transcr = b.trigger.transcr;
      if (['off', 'demand', 'auto'].includes(b.trigger.vision)) s.trigger.vision = b.trigger.vision;
      if (['off', 'demand', 'auto'].includes(b.trigger.enrich)) s.trigger.enrich = b.trigger.enrich;
      if (['off', 'auto'].includes(b.trigger.todos)) s.trigger.todos = b.trigger.todos;
      if (['off', 'auto'].includes(b.trigger.clean)) s.trigger.clean = b.trigger.clean;
    }
    if (['never', 'fail', 'ask'].includes(b.recours)) s.recours = b.recours;
    if (b.propose) {
      if (b.propose.notebook !== undefined) s.propose.notebook = !!b.propose.notebook;
      if (b.propose.tag !== undefined) s.propose.tag = !!b.propose.tag;
    }

    if (b.budgets) PROV.forEach((p) => { if (b.budgets[p] !== undefined) s.budgets[p] = b.budgets[p] === '' || b.budgets[p] === null ? null : Math.max(0, Number(b.budgets[p]) || 0); });
    if (b.enabled) PROV.forEach((p) => { if (b.enabled[p] !== undefined) s.enabled[p] = !!b.enabled[p]; });
    if (b.models) PROV.forEach((p) => {
      if (!b.models[p]) return;
      Object.keys(s.models[p]).forEach((k) => { if (b.models[p][k]) s.models[p][k] = str(b.models[p][k], 80).trim(); });
    });
    if (b.infomaniak) {
      if (b.infomaniak.productId !== undefined) s.infomaniak.productId = str(b.infomaniak.productId, 30).replace(/\D/g, '');
      if (b.infomaniak.baseUrl && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(b.infomaniak.baseUrl)) s.infomaniak.baseUrl = str(b.infomaniak.baseUrl, 200).trim();
    }
    if (b.features) ['tasks', 'props', 'views', 'links', 'templates', 'ai'].forEach((k) => { if (b.features[k] !== undefined) s.features[k] = !!b.features[k]; });
    if (b.synthMaxNotes !== undefined) s.synthMaxNotes = Math.min(1000, Math.max(5, Number(b.synthMaxNotes) || 200));
    if (b.synthMaxWords !== undefined) s.synthMaxWords = Math.min(200000, Math.max(500, Number(b.synthMaxWords) || 30000));
    if (b.instructions) ['text', 'voice', 'image', 'link'].forEach((k) => { if (b.instructions[k] !== undefined) s.instructions[k] = str(b.instructions[k], 800).trim(); });
    if (b.quotas) PROV.forEach((p) => {
      const q = b.quotas[p];
      if (!q) return;
      ['perMinute', 'perDay'].forEach((k) => {
        if (q[k] === undefined) return;
        const v = q[k] === '' || q[k] === null ? null : Math.floor(Number(q[k]));
        s.quotas[p][k] = v && v > 0 ? Math.min(v, 1e7) : null;
      });
    });
    if (b.historyMax !== undefined) { s.historyMax = Math.min(200, Math.max(5, Number(b.historyMax) || 30)); pipeline.purgeHistory(); }
    store.save();
    res.json({ settings: settingsFor(req), providers: ai.summary() });
  });

  // Les clés ne sont jamais renvoyées : on peut seulement les remplacer ou les effacer.
  r.put('/keys/:provider', adminOnly, (req, res) => {
    const p = req.params.provider;
    if (!ai.PROVIDERS[p]) return bad(res, 'Fournisseur inconnu.');
    const k = str((req.body || {}).key, 500).trim();
    if (k) db().keys[p] = encrypt(req.app.locals.masterKey, k);
    else delete db().keys[p];
    store.save();
    res.json({ providers: ai.summary() });
  });

  r.post('/keys/:provider/test', adminOnly, async (req, res) => {
    try {
      const out = await ai.test(req.params.provider);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

  r.get('/log', adminOnly, (req, res) => res.json({ log: db().log.slice(0, 200), usage: db().usage }));

  // ---------- Re-tri ----------
  r.get('/retri/estimate', (req, res) => res.json(pipeline.retriEstimate(req.query.scope === 'all' ? 'all' : 'unlocked', me(req))));
  r.post('/retri', (req, res) => {
    const running = db().retris.find((x) => x.status === 'running' && x.ownerId === me(req));
    if (running) return res.json({ retri: running });
    res.json({ retri: pipeline.startRetri((req.body || {}).scope === 'all' ? 'all' : 'unlocked', me(req)) });
  });
  r.get('/retri/:id', (req, res) => {
    const op = db().retris.find((x) => x.id === req.params.id && x.ownerId === me(req));
    if (!op) return bad(res, 'Re-tri introuvable.', 404);
    res.json({ retri: op });
  });
  r.post('/retri/:id/undo', (req, res) => {
    const op = db().retris.find((x) => x.id === req.params.id && x.ownerId === me(req));
    if (!op) return bad(res, 'Re-tri introuvable.', 404);
    pipeline.undoRetri(op, (req.body || {}).noteId);
    res.json({ retri: op });
  });

  // ---------- Synthèses ----------
  const MODES = Object.keys(pipeline.MODES);
  r.post('/syntheses/estimate', (req, res) => {
    const { ids, mode } = req.body || {};
    if (!Array.isArray(ids) || !MODES.includes(mode)) return bad(res, 'Requête invalide.');
    res.json(pipeline.synthEstimate(ids, mode, me(req)));
  });

  r.post('/syntheses', async (req, res) => {
    const { ids, mode, label } = req.body || {};
    if (!Array.isArray(ids) || !MODES.includes(mode)) return bad(res, 'Requête invalide.');
    try {
      res.json({ synthesis: await pipeline.synthesize(ids, mode, label, me(req)) });
    } catch (err) {
      res.status(err.budget ? 402 : err.quota ? 429 : 400).json({ error: String(err.message || err) });
    }
  });

  r.get('/syntheses', (req, res) => res.json({ syntheses: db().syntheses.filter((x) => x.ownerId === me(req)) }));

  r.patch('/syntheses/:id', (req, res) => {
    const x = db().syntheses.find((s) => s.id === req.params.id && s.ownerId === me(req));
    if (!x) return bad(res, 'Synthèse introuvable.', 404);
    const b = req.body || {};
    if (b.title !== undefined) x.title = str(b.title, 120).trim() || x.title;
    if (b.pinned !== undefined) x.pinned = !!b.pinned;
    pipeline.purgeHistory(me(req));
    store.save();
    res.json({ synthesis: x });
  });

  r.delete('/syntheses/:id', (req, res) => {
    db().syntheses = db().syntheses.filter((s) => s.id !== req.params.id || s.ownerId !== me(req));
    store.save();
    res.json({ ok: true });
  });

  r.get('/syntheses/:id/pdf', (req, res) => {
    const x = db().syntheses.find((s) => s.id === req.params.id && s.ownerId === me(req));
    if (!x) return bad(res, 'Synthèse introuvable.', 404);
    const date = new Date(x.date).toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short' });
    const text = x.text.replace(/\[(\d+)\]/g, '');
    const pdf = buildPdf({ title: x.title, subtitle: `Générée par l'IA (${x.provider}) le ${date} à partir de ${x.count} note(s). ${x.label || ''} Vérifiez les points importants dans les notes d'origine.`, text });
    const name = x.title.normalize('NFD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'synthese';
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    res.type('application/pdf').send(pdf);
  });

  // Enregistrer une synthèse comme note (F38), sans appel IA.
  r.post('/syntheses/:id/note', (req, res) => {
    const x = db().syntheses.find((s) => s.id === req.params.id && s.ownerId === me(req));
    if (!x) return bad(res, 'Synthèse introuvable.', 404);
    const now = Date.now();
    const n = {
      id: uid(), ownerId: me(req), shares: [], clientId: null, type: 'synthesis', title: x.title, titleManual: true, content: x.text, transcript: '', description: '', lang: 'fr',
      status: 'ready', pendingReason: null, needsReview: false, notebookId: null, notebookChosen: false, tagIds: [], locked: true, ai: false,
      confidence: null, provider: { synth: x.provider }, suggestion: null, media: [], dur: 0, error: null, attempts: 0, createdAt: now, updatedAt: now, trashedAt: null
    };
    db().notes.push(n);
    store.save();
    res.json({ note: n });
  });

  // ---------- Export (F20, RGPD) ----------
  r.get('/export', (req, res) => {
    const d = db();
    const u = req.user;
    const out = {
      exportedAt: new Date().toISOString(),
      application: 'mAInotes',
      user: { name: u.name, login: u.login, createdAt: u.createdAt },
      notebooks: myNotebooks(req),
      tags: myTags(req),
      notes: d.notes.filter((n) => n.ownerId === u.id).map((n) => ({
        ...n,
        media: n.media.map((m) => {
          let data = null;
          try { data = fs.readFileSync(store.mediaPath(m.file)).toString('base64'); } catch (e) { /* fichier manquant */ }
          return { id: m.id, mime: m.mime, size: m.size, dur: m.dur, base64: data };
        })
      })),
      syntheses: d.syntheses.filter((x) => x.ownerId === u.id),
      ...(isAdmin(req) ? { settings: d.settings, log: d.log } : {})
    };
    res.setHeader('Content-Disposition', `attachment; filename="mainotes-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.type('application/json').send(JSON.stringify(out, null, 1));
  });

  // Purge de la corbeille après 30 jours.
  function purgeTrash() {
    const limit = Date.now() - TRASH_DAYS * 86400 * 1000;
    const old = db().notes.filter((n) => n.trashedAt && n.trashedAt < limit);
    if (old.length) { old.forEach(purgeNote); store.save(); }
  }
  purgeTrash();
  setInterval(purgeTrash, 6 * 3600 * 1000).unref();

  return r;
};
