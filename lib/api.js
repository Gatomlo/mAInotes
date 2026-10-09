// Routes de l'API (toutes protégées par la session).
const express = require('express');
const fs = require('fs');
const { uid } = require('./store');
const { encrypt } = require('./secrets');
const { buildPdf } = require('./pdf');

const COLORS = ['blue', 'amber', 'purple', 'green', 'rose'];
const TRASH_DAYS = 30;

const AUDIO_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac' };
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };

function bad(res, msg, code = 400) { return res.status(code).json({ error: msg }); }
const str = (v, max) => String(v == null ? '' : v).slice(0, max);

module.exports = function createApi(store, ai, pipeline, auth) {
  const db = () => store.db;
  const r = express.Router();
  r.use(auth.requireAuth);

  const touch = (n) => { n.updatedAt = Date.now(); };
  let lastMerge = null;

  const publicSettings = () => db().settings;

  // ---------- État complet (synchronisation entre appareils) ----------
  r.get('/state', (req, res) => {
    const d = db();
    res.json({
      serverTime: Date.now(),
      notebooks: d.notebooks.slice().sort((a, b) => a.order - b.order),
      tags: d.tags,
      notes: d.notes,
      settings: publicSettings(),
      providers: ai.summary(),
      retri: d.retris[0] || null,
      synthesesCount: d.syntheses.length
    });
  });

  // ---------- Notes ----------
  r.post('/notes', (req, res) => {
    const { clientId, type, content, notebookId, dur, createdAt, enrich, read } = req.body || {};
    if (!['text', 'voice', 'image'].includes(type)) return bad(res, 'Type de note inconnu.');
    if (clientId) {
      const existing = db().notes.find((n) => n.clientId === clientId);
      if (existing) return res.json({ note: existing, duplicate: true });
    }
    const nb = notebookId ? store.notebook(notebookId) : null;
    const now = Date.now();
    const created = Number(createdAt) && Number(createdAt) < now + 60000 ? Number(createdAt) : now;
    const n = {
      id: uid(),
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

  function findNote(req, res) {
    const n = store.note(req.params.id);
    if (!n) { bad(res, 'Note introuvable.', 404); return null; }
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
    const m = n && n.media.find((x) => x.id === req.params.mediaId);
    if (!m) return bad(res, 'Fichier introuvable.', 404);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(m.mime).sendFile(store.mediaPath(req.query.ai && m.aiFile ? m.aiFile : m.file));
  });

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
      n.notebookId = nb ? nb.id : null;
      n.locked = true;
      n.ai = false;
      n.needsReview = !n.notebookId;
    }
    if (Array.isArray(b.tagIds)) {
      n.tagIds = [...new Set(b.tagIds.filter((id) => store.tag(id)))];
      n.locked = true;
      n.ai = false;
    }
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
    const list = db().notes.filter((n) => !n.trashedAt && (n.status === 'pending' || n.status === 'error'));
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
      let nb = db().notebooks.find((c) => c.name.toLowerCase() === sg.notebook.toLowerCase());
      if (!nb) {
        nb = { id: uid(), name: sg.notebook, desc: '', color: COLORS[db().notebooks.length % COLORS.length], order: db().notebooks.length, needsDesc: true };
        db().notebooks.push(nb);
      }
      n.notebookId = nb.id;
      n.needsReview = false;
      delete sg.notebook;
    } else if (action === 'tag' && sg.tag) {
      let t = db().tags.find((x) => x.name.toLowerCase() === sg.tag.toLowerCase());
      if (!t) { t = { id: uid(), name: sg.tag, desc: '' }; db().tags.push(t); }
      if (!n.tagIds.includes(t.id)) n.tagIds.push(t.id);
      delete sg.tag;
    } else if (action === 'ignore') {
      n.suggestion = null;
    }
    if (n.suggestion && !n.suggestion.notebook && !n.suggestion.tag) n.suggestion = null;
    touch(n);
    store.save();
    res.json({ note: n, notebooks: db().notebooks, tags: db().tags });
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
    if (req.query.purge) purgeNote(n);
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
    db().notes.filter((n) => n.trashedAt).forEach(purgeNote);
    store.save();
    res.json({ ok: true });
  });

  // ---------- Carnets ----------
  function cleanNotebook(b, nb) {
    if (b.name !== undefined) {
      const name = str(b.name, 40).trim();
      if (!name) return 'Le nom est obligatoire.';
      if (db().notebooks.some((c) => c !== nb && c.name.toLowerCase() === name.toLowerCase())) return 'Ce carnet existe déjà.';
      nb.name = name;
    }
    if (b.desc !== undefined) { nb.desc = str(b.desc, 400); nb.needsDesc = false; }
    if (b.color !== undefined && COLORS.includes(b.color)) nb.color = b.color;
    return null;
  }

  r.post('/notebooks', (req, res) => {
    const nb = { id: uid(), name: '', desc: '', color: 'green', order: db().notebooks.length };
    const err = cleanNotebook({ desc: '', ...req.body }, nb);
    if (err) return bad(res, err);
    db().notebooks.push(nb);
    store.save();
    res.json({ notebook: nb });
  });

  r.patch('/notebooks/:id', (req, res) => {
    const nb = store.notebook(req.params.id);
    if (!nb) return bad(res, 'Carnet introuvable.', 404);
    const err = cleanNotebook(req.body || {}, nb);
    if (err) return bad(res, err);
    store.save();
    res.json({ notebook: nb });
  });

  // Suppression : les notes passent « à vérifier » (F46), le défaut revient à l'IA (F48).
  r.delete('/notebooks/:id', (req, res) => {
    const nb = store.notebook(req.params.id);
    if (!nb) return bad(res, 'Carnet introuvable.', 404);
    let k = 0;
    db().notes.forEach((n) => {
      if (n.notebookId === nb.id) { n.notebookId = null; n.notebookChosen = false; n.needsReview = true; touch(n); k++; }
    });
    db().notebooks = db().notebooks.filter((c) => c !== nb);
    if (db().settings.defaultNotebook === nb.id) db().settings.defaultNotebook = '';
    store.save();
    res.json({ moved: k });
  });

  // Fusion (F47) : annulable juste après via /merge/undo.
  r.post('/notebooks/merge', (req, res) => {
    const { from, to } = req.body || {};
    const a = store.notebook(from);
    const b = store.notebook(to);
    if (!a || !b || a === b) return bad(res, 'Choisissez deux carnets différents.');
    const ids = [];
    db().notes.forEach((n) => { if (n.notebookId === a.id) { n.notebookId = b.id; ids.push(n.id); touch(n); } });
    const wasDefault = db().settings.defaultNotebook === a.id;
    if (wasDefault) db().settings.defaultNotebook = b.id;
    db().notebooks = db().notebooks.filter((c) => c !== a);
    lastMerge = { kind: 'notebook', item: a, to: b.id, ids, wasDefault, at: Date.now() };
    store.save();
    res.json({ moved: ids.length });
  });

  // ---------- Tags ----------
  function cleanTagName(v) { return str(v, 30).trim().replace(/^#/, ''); }

  r.post('/tags', (req, res) => {
    const name = cleanTagName((req.body || {}).name);
    if (!name) return bad(res, 'Le nom est obligatoire.');
    const exists = db().tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.json({ tag: exists, existed: true });
    const t = { id: uid(), name, desc: str((req.body || {}).desc, 300) };
    db().tags.push(t);
    store.save();
    res.json({ tag: t });
  });

  r.patch('/tags/:id', (req, res) => {
    const t = store.tag(req.params.id);
    if (!t) return bad(res, 'Tag introuvable.', 404);
    const b = req.body || {};
    if (b.name !== undefined) {
      const name = cleanTagName(b.name);
      if (!name) return bad(res, 'Le nom est obligatoire.');
      if (db().tags.some((x) => x !== t && x.name.toLowerCase() === name.toLowerCase())) return bad(res, 'Ce tag existe déjà : utilisez la fusion.');
      t.name = name;
    }
    if (b.desc !== undefined) t.desc = str(b.desc, 300);
    store.save();
    res.json({ tag: t });
  });

  r.delete('/tags/:id', (req, res) => {
    const t = store.tag(req.params.id);
    if (!t) return bad(res, 'Tag introuvable.', 404);
    let k = 0;
    db().notes.forEach((n) => { if (n.tagIds.includes(t.id)) { n.tagIds = n.tagIds.filter((x) => x !== t.id); touch(n); k++; } });
    db().tags = db().tags.filter((x) => x !== t);
    store.save();
    res.json({ removed: k });
  });

  r.post('/tags/merge', (req, res) => {
    const { from, to } = req.body || {};
    const a = store.tag(from);
    const b = store.tag(to);
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
    lastMerge = { kind: 'tag', item: a, to: b.id, ids, hadBoth, at: Date.now() };
    store.save();
    res.json({ moved: ids.length });
  });

  r.post('/merge/undo', (req, res) => {
    const m = lastMerge;
    if (!m || Date.now() - m.at > 10 * 60 * 1000) return bad(res, 'Plus rien à annuler.');
    if (m.kind === 'notebook') {
      db().notebooks.push(m.item);
      m.ids.forEach((id) => { const n = store.note(id); if (n && n.notebookId === m.to) { n.notebookId = m.item.id; touch(n); } });
      if (m.wasDefault) db().settings.defaultNotebook = m.item.id;
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
    const b = req.body || {};
    const PROV = ['infomaniak', 'gemini', 'claude'];
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
    }
    if (['never', 'fail', 'ask'].includes(b.recours)) s.recours = b.recours;
    if (b.propose) {
      if (b.propose.notebook !== undefined) s.propose.notebook = !!b.propose.notebook;
      if (b.propose.tag !== undefined) s.propose.tag = !!b.propose.tag;
    }
    if (b.defaultNotebook !== undefined) s.defaultNotebook = store.notebook(b.defaultNotebook) ? b.defaultNotebook : '';
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
    if (b.synthMaxNotes !== undefined) s.synthMaxNotes = Math.min(1000, Math.max(5, Number(b.synthMaxNotes) || 200));
    if (b.synthMaxWords !== undefined) s.synthMaxWords = Math.min(200000, Math.max(500, Number(b.synthMaxWords) || 30000));
    if (b.context !== undefined) s.context = str(b.context, 1500).trim();
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
    res.json({ settings: publicSettings(), providers: ai.summary() });
  });

  // Les clés ne sont jamais renvoyées : on peut seulement les remplacer ou les effacer.
  r.put('/keys/:provider', (req, res) => {
    const p = req.params.provider;
    if (!ai.PROVIDERS[p]) return bad(res, 'Fournisseur inconnu.');
    const k = str((req.body || {}).key, 500).trim();
    if (k) db().keys[p] = encrypt(req.app.locals.masterKey, k);
    else delete db().keys[p];
    store.save();
    res.json({ providers: ai.summary() });
  });

  r.post('/keys/:provider/test', async (req, res) => {
    try {
      const out = await ai.test(req.params.provider);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

  r.get('/log', (req, res) => res.json({ log: db().log.slice(0, 200), usage: db().usage }));

  // ---------- Re-tri ----------
  r.get('/retri/estimate', (req, res) => res.json(pipeline.retriEstimate(req.query.scope === 'all' ? 'all' : 'unlocked')));
  r.post('/retri', (req, res) => {
    const running = db().retris.find((x) => x.status === 'running');
    if (running) return res.json({ retri: running });
    res.json({ retri: pipeline.startRetri((req.body || {}).scope === 'all' ? 'all' : 'unlocked') });
  });
  r.get('/retri/:id', (req, res) => {
    const op = db().retris.find((x) => x.id === req.params.id);
    if (!op) return bad(res, 'Re-tri introuvable.', 404);
    res.json({ retri: op });
  });
  r.post('/retri/:id/undo', (req, res) => {
    const op = db().retris.find((x) => x.id === req.params.id);
    if (!op) return bad(res, 'Re-tri introuvable.', 404);
    pipeline.undoRetri(op, (req.body || {}).noteId);
    res.json({ retri: op });
  });

  // ---------- Synthèses ----------
  const MODES = Object.keys(pipeline.MODES);
  r.post('/syntheses/estimate', (req, res) => {
    const { ids, mode } = req.body || {};
    if (!Array.isArray(ids) || !MODES.includes(mode)) return bad(res, 'Requête invalide.');
    res.json(pipeline.synthEstimate(ids, mode));
  });

  r.post('/syntheses', async (req, res) => {
    const { ids, mode, label } = req.body || {};
    if (!Array.isArray(ids) || !MODES.includes(mode)) return bad(res, 'Requête invalide.');
    try {
      res.json({ synthesis: await pipeline.synthesize(ids, mode, label) });
    } catch (err) {
      res.status(err.budget ? 402 : err.quota ? 429 : 400).json({ error: String(err.message || err) });
    }
  });

  r.get('/syntheses', (req, res) => res.json({ syntheses: db().syntheses }));

  r.patch('/syntheses/:id', (req, res) => {
    const x = db().syntheses.find((s) => s.id === req.params.id);
    if (!x) return bad(res, 'Synthèse introuvable.', 404);
    const b = req.body || {};
    if (b.title !== undefined) x.title = str(b.title, 120).trim() || x.title;
    if (b.pinned !== undefined) x.pinned = !!b.pinned;
    pipeline.purgeHistory();
    store.save();
    res.json({ synthesis: x });
  });

  r.delete('/syntheses/:id', (req, res) => {
    db().syntheses = db().syntheses.filter((s) => s.id !== req.params.id);
    store.save();
    res.json({ ok: true });
  });

  r.get('/syntheses/:id/pdf', (req, res) => {
    const x = db().syntheses.find((s) => s.id === req.params.id);
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
    const x = db().syntheses.find((s) => s.id === req.params.id);
    if (!x) return bad(res, 'Synthèse introuvable.', 404);
    const now = Date.now();
    const n = {
      id: uid(), clientId: null, type: 'synthesis', title: x.title, titleManual: true, content: x.text, transcript: '', description: '', lang: 'fr',
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
    const out = {
      exportedAt: new Date().toISOString(),
      application: 'mAInotes',
      user: { name: d.user.name, login: d.user.login, createdAt: d.user.createdAt },
      notebooks: d.notebooks,
      tags: d.tags,
      notes: d.notes.map((n) => ({
        ...n,
        media: n.media.map((m) => {
          let data = null;
          try { data = fs.readFileSync(store.mediaPath(m.file)).toString('base64'); } catch (e) { /* fichier manquant */ }
          return { id: m.id, mime: m.mime, size: m.size, dur: m.dur, base64: data };
        })
      })),
      syntheses: d.syntheses,
      settings: d.settings,
      log: d.log
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
