// Analyse des notes en tâche de fond : transcription, description d'image, puis
// classement sur le texte seul. Re-tri et synthèse passent aussi par ici.
const fs = require('fs');
const crypto = require('crypto');
const { uid } = require('./store');
const { parseJsonLoose } = require('./ai/util');
const { extractUrls, refreshLinks, linksText } = require('./links');

const TYPE_LABEL = { text: 'Texte', voice: 'Note vocale', image: 'Image', synthesis: 'Synthèse' };
const MAX_CLASSIF_CHARS = 4000;

function baseText(n) {
  return [n.content, n.transcript, n.description].filter((s) => s && String(s).trim()).join('\n\n');
}

// Texte complet de la note, aperçus des liens compris (recherche, re-tri, synthèse).
function noteText(n) {
  return [baseText(n), linksText(n)].filter(Boolean).join('\n\n');
}

function linksStale(n) {
  const urls = extractUrls(n.content);
  const have = (n.links || []).map((l) => l.url);
  return urls.length !== have.length || urls.some((u) => !have.includes(u));
}

function words(s) {
  return String(s || '').split(/\s+/).filter(Boolean).length;
}

module.exports = function createPipeline(store, ai) {
  const db = () => store.db;
  const queue = [];
  let running = false;

  function touch(n) { n.updatedAt = Date.now(); }

  // ---------- Prompt de classement ----------
  // Liens dont le petit descriptif reste à rédiger : il est demandé dans le même appel
  // que le classement (une ligne de plus dans la réponse, aucun appel supplémentaire).
  function linksToDescribe(n) {
    return (n.links || []).filter((l) => !l.aiDescription);
  }

  function classifPrompt(n, { withNotebook }) {
    const s = db().settings;
    const nbs = db().notebooks;
    const tags = db().tags;
    const lines = [];
    lines.push('Range cette note personnelle. Réponds uniquement par un objet JSON.');
    if (withNotebook) {
      lines.push('\nCarnets (un seul par note) :');
      nbs.forEach((c, i) => lines.push(`C${i + 1} ${c.name}${c.desc ? ' : ' + c.desc : ''}`));
    }
    lines.push('\nTags (zéro, un ou plusieurs) :');
    tags.forEach((t, i) => lines.push(`T${i + 1} ${t.name}${t.desc ? ' : ' + t.desc : ''}`));
    lines.push('\nNote :\n"""\n' + baseText(n).slice(0, MAX_CLASSIF_CHARS) + '\n"""');
    const pending = linksToDescribe(n);
    (n.links || []).filter((l) => l.aiDescription).forEach((l) => lines.push(`Lien : ${l.title} — ${l.description} (${l.url})`));
    if (pending.length) {
      lines.push('\nLiens présents dans la note (aperçu lu sur la page) :');
      pending.forEach((l, i) => {
        lines.push(`L${i + 1} ${l.url}`);
        if (l.title) lines.push(`  Titre : ${l.title}`);
        if (l.summary) lines.push(`  Résumé de la page : ${l.summary}`);
        if (l.excerpt) lines.push(`  Extrait : ${l.excerpt.slice(0, 500)}`);
        if (l.error && !l.title) lines.push('  (page illisible : déduis-le de l\'adresse)');
      });
    }
    const fields = ['"titre": titre court et parlant (8 mots max), en français'];
    if (withNotebook) fields.push('"carnet": code du carnet (ex. "C2") ou null si aucun ne convient');
    fields.push('"tags": liste de codes de tags (ex. ["T1"]), seulement s\'ils conviennent vraiment');
    fields.push('"confiance": nombre entre 0 et 1');
    // En mode strict, ces lignes sont omises : consigne plus courte, moins de jetons (F51).
    if (withNotebook && s.propose.notebook) fields.push('"nouveau_carnet": nom d\'un carnet à créer si aucun ne convient, sinon null');
    if (s.propose.tag) fields.push('"nouveau_tag": nom d\'un tag utile qui n\'existe pas, sinon null');
    if (pending.length) fields.push('"liens": objet {"L1": "une phrase en français (20 mots max) qui dit à quoi correspond ce lien"} pour chaque lien');
    lines.push('\nChamps attendus :\n' + fields.map((f) => '- ' + f).join('\n'));
    return lines.join('\n');
  }

  function parseClassif(text, { withNotebook }) {
    const j = parseJsonLoose(text);
    const nbs = db().notebooks;
    const tags = db().tags;
    const code = (v, prefix, list) => {
      const m = String(v || '').match(new RegExp('^' + prefix + '(\\d+)$', 'i'));
      return m ? (list[Number(m[1]) - 1] || null) : null;
    };
    const nb = withNotebook ? code(j.carnet, 'C', nbs) : null;
    const tagIds = Array.isArray(j.tags) ? [...new Set(j.tags.map((t) => code(t, 'T', tags)).filter(Boolean).map((t) => t.id))] : [];
    const conf = Math.max(0, Math.min(1, Number(j.confiance)));
    const sugg = {};
    const s = db().settings;
    const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : '');
    if (s.propose.notebook && withNotebook && clean(j.nouveau_carnet) && !nbs.some((c) => c.name.toLowerCase() === clean(j.nouveau_carnet).toLowerCase())) sugg.notebook = clean(j.nouveau_carnet);
    if (s.propose.tag && clean(j.nouveau_tag) && !tags.some((t) => t.name.toLowerCase() === clean(j.nouveau_tag).toLowerCase())) sugg.tag = clean(j.nouveau_tag).replace(/^#/, '');
    const linkDescriptions = {};
    if (j.liens && typeof j.liens === 'object') {
      Object.keys(j.liens).forEach((k) => {
        const m = String(k).match(/^L(\d+)$/i);
        if (m && typeof j.liens[k] === 'string' && j.liens[k].trim()) linkDescriptions[Number(m[1]) - 1] = j.liens[k].trim().slice(0, 240);
      });
    }
    return {
      linkDescriptions,
      title: String(j.titre || '').trim().slice(0, 120),
      notebookId: nb ? nb.id : null,
      tagIds,
      confidence: Number.isFinite(conf) ? conf : 0.5,
      suggestion: sugg.notebook || sugg.tag ? sugg : null
    };
  }

  async function classify(n, opts = {}) {
    const withNotebook = !n.notebookChosen && (!n.locked || opts.includeLocked);
    const r = await ai.call('classif', 'chat', {
      system: 'Tu classes des notes personnelles en français. Tu ne réponds que par du JSON valide.',
      prompt: classifPrompt(n, { withNotebook }),
      maxTokens: 1500,
      json: true
    }, opts);
    const pending = linksToDescribe(n);
    return { ...parseClassif(r.text, { withNotebook }), provider: r.provider, pendingLinks: pending };
  }

  function applyLinkDescriptions(n, c) {
    (c.pendingLinks || []).forEach((l, i) => {
      if (c.linkDescriptions[i]) { l.description = c.linkDescriptions[i]; l.aiDescription = true; }
    });
  }

  function applyClassif(n, c) {
    applyLinkDescriptions(n, c);
    if (!n.titleManual && c.title) n.title = c.title;
    if (!n.notebookChosen) n.notebookId = c.notebookId;
    n.tagIds = c.tagIds;
    n.confidence = c.confidence;
    n.suggestion = c.suggestion;
    n.ai = true;
    n.provider = { ...(n.provider || {}), classif: c.provider };
    n.needsReview = !n.notebookId || c.confidence < 0.4;
  }

  // ---------- Plan d'analyse d'une note ----------
  function plan(n, opts) {
    const t = db().settings.trigger;
    const force = !!opts.force;
    const steps = [];
    if (n.type === 'voice' && !n.transcript && n.media.length && (force || t.transcr === 'auto')) steps.push('transcr');
    if (n.type === 'image' && !n.description && n.media.length && t.vision !== 'off') {
      if (opts.describe || t.vision === 'auto' || (force && !String(n.content || '').trim())) steps.push('vision');
    }
    if (force || t.classif === 'auto') steps.push('classif');
    return steps;
  }

  // Lecture des pages liées (sans IA) en arrière-plan, quand le texte a changé.
  function updateLinks(n) {
    if (!linksStale(n)) return Promise.resolve();
    return refreshLinks(n).then(() => { touch(n); store.save(); }, () => {});
  }

  function schedule(n, opts = {}) {
    const steps = plan(n, opts);
    const willHaveText = noteText(n) || steps.includes('transcr') || steps.includes('vision');
    if (!steps.length || (steps.length === 1 && steps[0] === 'classif' && !willHaveText)) {
      n.status = 'pending';
      n.pendingReason = n.type === 'image' && !n.description && !noteText(n) ? 'vision' : 'manual';
      touch(n);
      store.save();
      updateLinks(n);
      return false;
    }
    n.status = 'queued';
    n.pendingReason = null;
    n.error = null;
    touch(n);
    store.save();
    queue.push({ id: n.id, opts, steps });
    pump();
    return true;
  }

  async function runSteps(n, steps, opts) {
    const media = n.media[0];
    await updateLinks(n);
    for (const step of steps) {
      if (step === 'transcr' && !n.transcript) {
        const audio = fs.readFileSync(store.mediaPath(media.file));
        const r = await ai.call('transcr', 'transcribe', { audio, mime: media.mime, filename: media.file, durationSec: media.dur }, opts);
        n.transcript = r.text;
        n.lang = r.lang || 'fr';
        n.provider = { ...(n.provider || {}), transcr: r.provider };
      } else if (step === 'vision' && !n.description) {
        const f = media.aiFile || media.file;
        const image = fs.readFileSync(store.mediaPath(f));
        const r = await ai.call('vision', 'vision', {
          prompt: 'Décris cette image en français en 3 à 6 phrases : contenu de la scène, texte visible recopié tel quel, contexte probable. Pas d\'introduction.',
          image,
          mime: media.aiFile ? 'image/jpeg' : media.mime
        }, opts);
        n.description = r.text.trim();
        n.provider = { ...(n.provider || {}), vision: r.provider };
      } else if (step === 'classif') {
        if (!noteText(n)) continue;
        if (n.locked) { n.needsReview = !n.notebookId; continue; }
        applyClassif(n, await classify(n, opts));
      }
      touch(n);
      store.save();
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift();
      const n = store.note(job.id);
      if (!n || n.trashedAt) continue;
      n.status = 'analyzing';
      touch(n);
      store.save();
      try {
        await runSteps(n, job.steps, job.opts);
        // Sans classement (mode manuel), la note reste « À analyser » même transcrite.
        n.status = job.steps.includes('classif') && noteText(n) ? 'ready' : 'pending';
        if (n.status === 'pending') n.pendingReason = n.type === 'image' && !noteText(n) ? 'vision' : 'manual';
        else n.error = null;
        n.attempts = 0;
      } catch (err) {
        if (err.budget || err.config) {
          // Plafond atteint ou IA non configurée : la note attend, sans perte ni relance.
          n.status = 'pending';
          n.pendingReason = err.budget ? 'budget' : 'config';
          n.error = err.message;
        } else {
          n.attempts = (n.attempts || 0) + 1;
          n.error = String(err.message || err).slice(0, 300);
          if (n.attempts < 2) {
            // Une relance automatique, puis statut « erreur » avec bouton de relance.
            n.status = 'queued';
            setTimeout(() => { queue.push(job); pump(); }, 5000);
          } else {
            n.status = 'error';
          }
        }
      }
      touch(n);
      store.save();
    }
    running = false;
  }

  // Au démarrage, les analyses interrompues reprennent.
  function resume() {
    db().notes.filter((n) => n.status === 'queued' || n.status === 'analyzing').forEach((n) => schedule(n, { force: true }));
  }

  // ---------- Re-tri ----------
  function retriTargets(scope) {
    return db().notes.filter((n) => !n.trashedAt && n.status === 'ready' && n.type !== 'synthesis' && noteText(n) && (scope === 'all' || !n.locked));
  }

  function retriEstimate(scope) {
    const list = retriTargets(scope);
    return { count: list.length, calls: list.length, words: list.reduce((a, n) => a + Math.min(words(noteText(n)), 700), 0) };
  }

  function startRetri(scope) {
    const list = retriTargets(scope);
    const op = { id: uid(), date: Date.now(), scope, status: 'running', total: list.length, done: 0, items: [], error: null };
    db().retris.unshift(op);
    db().retris = db().retris.slice(0, 10);
    store.save();
    (async () => {
      for (const n of list) {
        if (n.trashedAt) { op.done++; continue; }
        const from = { notebookId: n.notebookId, tagIds: n.tagIds.slice() };
        try {
          const c = await classify(n, { includeLocked: scope === 'all' });
          applyLinkDescriptions(n, c);
          // Le re-tri ajoute des tags mais n'en retire jamais : un tag posé à la main reste.
          const to = { notebookId: n.notebookChosen ? n.notebookId : c.notebookId, tagIds: [...new Set(from.tagIds.concat(c.tagIds))] };
          const changed = to.notebookId !== from.notebookId || to.tagIds.slice().sort().join() !== from.tagIds.slice().sort().join();
          if (changed) {
            op.items.push({ noteId: n.id, title: n.title, from, to, undone: false });
            n.notebookId = to.notebookId;
            n.tagIds = to.tagIds;
            n.ai = true;
            n.needsReview = !n.notebookId || c.confidence < 0.4;
            n.confidence = c.confidence;
            touch(n);
          }
        } catch (err) {
          if (err.budget) { op.status = 'stopped'; op.error = err.message; break; }
          op.error = String(err.message).slice(0, 300);
        }
        op.done++;
        store.save();
      }
      if (op.status === 'running') op.status = 'done';
      store.save();
    })();
    return op;
  }

  function undoRetri(op, noteId) {
    op.items.filter((it) => !it.undone && (!noteId || it.noteId === noteId)).forEach((it) => {
      const n = store.note(it.noteId);
      if (n) {
        n.notebookId = it.from.notebookId;
        n.tagIds = it.from.tagIds.filter((id) => store.tag(id));
        n.needsReview = !n.notebookId;
        touch(n);
      }
      it.undone = true;
    });
    store.save();
  }

  // ---------- Synthèse ----------
  const MODES = {
    short: { label: 'Synthèse courte', ratio: 0.25, instr: 'Rédige une SYNTHÈSE COURTE : une vue d\'ensemble en 2 ou 3 phrases, puis les points clés regroupés par carnet (titres de niveau 2), puis les tags les plus fréquents, puis une partie « À rappeler » avec les notes marquées « à rappeler » ou qui contiennent une action à faire.' },
    full: { label: 'Document complet', ratio: 1, instr: 'Rédige un DOCUMENT COMPLET qui réorganise tout le contenu des notes : un sommaire, une partie par carnet (titres de niveau 2), et dans chaque partie les notes dans l\'ordre chronologique avec leur titre (niveau 3), leur type, leur date et leurs tags, puis leur contenu. Termine par un index des tags. Ne supprime aucune information.' },
    prose: { label: 'Texte rédigé', ratio: 0.5, instr: 'Rédige un TEXTE SUIVI et structuré : une introduction, une partie par carnet (titres de niveau 2) en phrases enchaînées, et une conclusion qui reprend les points à rappeler.' }
  };

  function synthHash(ids, mode) {
    const notes = ids.map((id) => store.note(id)).filter(Boolean);
    const sig = mode + '|' + notes.map((n) => n.id + ':' + n.updatedAt).sort().join(',');
    return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 24);
  }

  function synthNotes(ids) {
    return ids.map((id) => store.note(id)).filter((n) => n && !n.trashedAt && n.status === 'ready' && n.type !== 'synthesis');
  }

  function synthEstimate(ids, mode) {
    const notes = synthNotes(ids);
    const w = notes.reduce((a, n) => a + words(n.title) + words(noteText(n)), 0);
    const hash = synthHash(notes.map((n) => n.id), mode);
    const dup = db().syntheses.find((x) => x.hash === hash);
    return { count: notes.length, excluded: ids.length - notes.length, words: w, produced: Math.round(w * MODES[mode].ratio), calls: 1, provider: db().settings.providers.synth, duplicateId: dup ? dup.id : null };
  }

  async function synthesize(ids, mode, label) {
    const s = db().settings;
    const notes = synthNotes(ids).sort((a, b) => a.createdAt - b.createdAt);
    if (!notes.length) throw new Error('Aucune note analysée à résumer.');
    const est = synthEstimate(ids, mode);
    if (notes.length > s.synthMaxNotes || est.words > s.synthMaxWords) {
      throw new Error(`Trop de contenu pour une synthèse (${notes.length} notes, ${est.words} mots ; limite ${s.synthMaxNotes} notes et ${s.synthMaxWords} mots). Resserrez les filtres ou faites une synthèse par carnet.`);
    }
    const fmt = (ts) => new Date(ts).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
    const body = notes.map((n, i) => {
      const nb = store.notebook(n.notebookId);
      const tags = n.tagIds.map((id) => store.tag(id)).filter(Boolean).map((t) => '#' + t.name).join(' ');
      return `[${i + 1}] ${n.title}\nCarnet : ${nb ? nb.name : 'à vérifier'} · ${TYPE_LABEL[n.type]} · ${fmt(n.createdAt)}${tags ? ' · ' + tags : ''}\n${noteText(n)}`;
    }).join('\n\n');
    const m = MODES[mode];
    const prompt = `${m.instr}\n\nRègles : écris en français, en Markdown simple (## et ### pour les titres, « - » pour les listes, **gras** permis). Après chaque point, cite la ou les notes d'origine par leur numéro entre crochets, par exemple [3] ou [2][5]. N'invente rien qui ne figure pas dans les notes.\n\nNotes :\n\n${body}`;
    const maxTokens = Math.min(32000, Math.max(1500, Math.round(est.words * m.ratio * 2.2) + 800));
    const r = await ai.call('synth', 'chat', { system: 'Tu rédiges des synthèses fidèles de notes personnelles.', prompt, maxTokens, long: true });

    const nbNames = [...new Set(notes.map((n) => (store.notebook(n.notebookId) || { name: 'À vérifier' }).name))];
    const tc = {};
    notes.forEach((n) => n.tagIds.forEach((id) => { const t = store.tag(id); if (t) tc[t.name] = (tc[t.name] || 0) + 1; }));
    const topTags = Object.keys(tc).sort((a, b) => tc[b] - tc[a]).slice(0, 6);
    const entry = {
      id: uid(),
      date: Date.now(),
      mode,
      title: `${m.label} · ${nbNames.slice(0, 2).join(', ')}${nbNames.length > 2 ? ` et ${nbNames.length - 2} autre${nbNames.length > 3 ? 's' : ''}` : ''}`,
      notebooks: nbNames,
      tags: topTags,
      label: String(label || '').slice(0, 300),
      count: notes.length,
      noteIds: notes.map((n) => n.id),
      hash: synthHash(notes.map((n) => n.id), mode),
      text: r.text.trim(),
      provider: r.provider,
      pinned: false
    };
    db().syntheses.unshift(entry);
    purgeHistory();
    store.save();
    return entry;
  }

  // Garde les N dernières synthèses ; les épinglées échappent à la purge (F61).
  function purgeHistory() {
    const max = db().settings.historyMax || 30;
    let kept = 0;
    db().syntheses = db().syntheses.filter((x) => x.pinned || ++kept <= max);
  }

  return { schedule, updateLinks, resume, retriEstimate, startRetri, undoRetri, synthEstimate, synthesize, purgeHistory, noteText, MODES, TYPE_LABEL };
};
