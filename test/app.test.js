// Test de bout en bout : l'app est montée sous /mainotes comme dans node-gateway, et
// un faux serveur compatible OpenAI remplace Infomaniak.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-test-'));
process.env.MAINOTES_DATA_DIR = dataDir;
process.env.MAINOTES_ALLOW_PRIVATE_LINKS = '1';
delete process.env.MAINOTES_SETUP_TOKEN;

let gateway, mock, base, mockUrl;
const calls = [];
const gemini = { calls: 0, fail: 0 };
const mistral = { calls: 0, auth: '' };
const ENRICH = (u) => ({
  explication: 'Weber-Wulff et al. (2023) ont testé 14 outils de détection de textes générés par IA : aucun n\'est fiable.',
  pistes: ['Comparer avec les études plus récentes.'],
  recherches: ['Weber-Wulff 2023 testing of detection tools'],
  liens: [{ titre: 'Article', url: u + '/page' }, { titre: 'Inventé', url: u + '/introuvable' }]
});

function listen(app) {
  return new Promise((resolve) => { const s = http.createServer(app).listen(0, '127.0.0.1', () => resolve(s)); });
}

before(async () => {
  const m = express();
  m.use(express.json({ limit: '5mb' }));
  m.post('/ai/:pid/v1/chat/completions', (req, res) => {
    calls.push(req.body);
    const prompt = JSON.stringify(req.body.messages);
    let content;
    if (prompt.includes('Range cette note')) {
      const nbCode = /C(\d) Maison/.exec(prompt);
      const out = { titre: 'Devis du plombier', carnet: nbCode ? 'C' + nbCode[1] : null, tags: ['T1'], confiance: 0.9 };
      if (prompt.includes('enrichissement')) out.enrichissement = ENRICH(mockUrl);
      if (prompt.includes('Propriétés à remplir')) out.proprietes = { P1: 'En cours', P2: '2026-12-20', P3: 'pas utilisé' };
      if (prompt.includes('Notes existantes proches')) out.liees = ['N1'];
      if (prompt.includes('L1 ')) out.liens = { L1: 'Fiche d\'un robinet thermostatique vendu par un magasin de bricolage.' };
      content = JSON.stringify(out);
    } else if (prompt.includes('liste des tâches à faire')) {
      content = JSON.stringify({ taches: ['Appeler le plombier', 'Payer la facture', 'Appeler le plombier'] });
    } else if (prompt.includes('Propose un complément')) {
      content = JSON.stringify({ enrichissement: ENRICH(mockUrl) });
    } else {
      content = '## Maison\n- Relancer le plombier pour le **devis** [1]';
    }
    res.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  });
  m.get('/page', (req, res) => res.type('html').send('<html><head><meta charset="utf-8"><title>Robinet &amp; mitigeur</title><meta property="og:site_name" content="Brico"><meta name="description" content="Mitigeur thermostatique chromé."></head><body><script>x()</script><p>Prix : 89 €</p></body></html>'));
  m.get('/redir', (req, res) => res.redirect('/page'));
  // Faux Gemini : la première requête dépasse le quota (réponse au format de Google).
  m.post('/gemini/models/:rest', (req, res) => {
    gemini.calls++;
    if (gemini.fail > 0) {
      gemini.fail--;
      return res.status(429).json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota.', details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.5-flash-lite' }, quotaValue: '20' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2s' }
      ] } });
    }
    res.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ titre: 'Classée par Gemini', carnet: null, tags: [], confiance: 0.9 }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
  });
  // Faux Claude : les réponses portent les en-têtes de limites d'Anthropic.
  m.post('/anthropic/v1/messages', (req, res) => {
    res.set({ 'anthropic-ratelimit-requests-limit': '50', 'anthropic-ratelimit-requests-remaining': '49', 'anthropic-ratelimit-requests-reset': new Date(Date.now() + 60000).toISOString(), 'request-id': 'req_test' });
    res.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: JSON.stringify({ titre: 'Classée par Claude', carnet: null, tags: [], confiance: 0.9 }) }], usage: { input_tokens: 12, output_tokens: 6 } });
  });
  // Faux Mistral : format OpenAI, liste de modèles avec capacités.
  m.post('/mistral/chat/completions', (req, res) => {
    mistral.calls++;
    mistral.auth = req.get('authorization');
    res.set({ 'x-ratelimit-limit-requests': '60', 'x-ratelimit-remaining-requests': '59' });
    res.json({ choices: [{ message: { content: JSON.stringify({ titre: 'Classée par Mistral', carnet: null, tags: [], confiance: 0.9 }) } }], usage: { prompt_tokens: 20, completion_tokens: 8 } });
  });
  m.get('/mistral/models', (req, res) => res.json({ data: [
    { id: 'mistral-small-latest', capabilities: { completion_chat: true, vision: true } },
    { id: 'mistral-tiny-latest', capabilities: { completion_chat: true, vision: false } },
    { id: 'mistral-embed', capabilities: { completion_chat: false, vision: false } },
    { id: 'voxtral-mini-transcribe-latest', capabilities: { completion_chat: false, audio_transcription: true } }
  ] }));
  m.get('/ai/:pid/v1/models', (req, res) => res.json({ data: [{ id: 'mistral24b' }, { id: 'whisper' }, { id: 'bge_multilingual_gemma2' }] }));
  mock = await listen(m);
  mockUrl = `http://127.0.0.1:${mock.address().port}`;
  process.env.MAINOTES_GEMINI_URL = mockUrl + '/gemini';
  process.env.ANTHROPIC_BASE_URL = mockUrl + '/anthropic';
  process.env.MAINOTES_MISTRAL_URL = mockUrl + '/mistral';

  const app = require('../server');
  const g = express();
  g.use('/mainotes', app);
  gateway = await listen(g);
  base = `http://127.0.0.1:${gateway.address().port}/mainotes/`;
});

after(() => { gateway.close(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

let cookie = '';
async function call(method, p, body, opts = {}) {
  const headers = { 'X-Mainotes': '1', Cookie: cookie };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + 'api/' + p, { method, headers: { ...headers, ...(opts.headers || {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await wait(100); }
  throw new Error('délai dépassé');
}

test('page servie sous /mainotes/ avec chemins relatifs', async () => {
  const r = await fetch(base.slice(0, -1), { redirect: 'manual' });
  assert.strictEqual(r.status, 301);
  assert.strictEqual(r.headers.get('location'), '/mainotes/');
  const html = await (await fetch(base)).text();
  assert.match(html, /src="js\/core.js"/);
  assert.doesNotMatch(html, /(src|href)="\//);
  const manifest = await (await fetch(base + 'manifest.json')).json();
  assert.strictEqual(manifest.icons[0].src, 'icons/icon-192.png');
  assert.strictEqual(manifest.display, 'fullscreen');
  assert.ok(manifest.shortcuts.every((x) => x.url.startsWith('./?action=new')), 'raccourcis relatifs');
  const mnew = await (await fetch(base + 'manifest-new.json')).json();
  assert.strictEqual(mnew.start_url, './?action=new');
  assert.notStrictEqual(mnew.id, manifest.id, 'deux applications distinctes');
  for (const icon of [...manifest.icons, ...mnew.icons]) {
    const res = await fetch(base + icon.src);
    assert.strictEqual(res.status, 200, icon.src);
  }
});

test('création du compte à la première ouverture, une seule fois', async () => {
  let r = await call('GET', 'auth/state');
  assert.strictEqual(r.data.setup, true);
  r = await call('GET', 'state');
  assert.strictEqual(r.status, 401);
  r = await call('POST', 'auth/setup', { name: 'Thomas', login: 'moi@example.be', password: 'court' });
  assert.strictEqual(r.status, 400);
  r = await call('POST', 'auth/setup', { name: 'Thomas', login: 'moi@example.be', password: 'une phrase longue' });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Path=\/mainotes; HttpOnly; SameSite=Lax/);
  const saved = cookie;
  cookie = '';
  r = await call('POST', 'auth/setup', { login: 'autre', password: 'une autre phrase' });
  assert.strictEqual(r.status, 409);
  cookie = saved;
  r = await call('GET', 'state');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.notebooks.length, 4);
});

test('protection CSRF : écriture refusée sans en-tête', async () => {
  const res = await fetch(base + 'api/notes', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"type":"text","content":"x"}' });
  assert.strictEqual(res.status, 403);
});

test('note texte : classement par le fournisseur Infomaniak', async () => {
  let r = await call('PATCH', 'settings', { infomaniak: { productId: '123', baseUrl: mockUrl + '/ai/{product_id}/v1' } });
  assert.strictEqual(r.status, 200);
  r = await call('PUT', 'keys/infomaniak', { key: 'secret-infomaniak' });
  assert.strictEqual(r.data.providers[0].hasKey, true);
  const raw = fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8');
  assert.ok(!raw.includes('secret-infomaniak'), 'la clé doit être chiffrée');
  r = await call('POST', 'keys/infomaniak/test', {});
  assert.deepStrictEqual(r.data.models.chat, ['mistral24b']);
  assert.deepStrictEqual(r.data.models.audio, ['whisper']);
  const listed = await call('GET', 'state');
  assert.deepStrictEqual(listed.data.providers[0].models.chat, ['mistral24b'], 'liste gardée pour les menus des réglages');

  r = await call('POST', 'notes', { clientId: 'c1', type: 'text', content: 'Relancer le plombier jeudi pour le devis de la salle de bain.' });
  const id = r.data.note.id;
  const dup = await call('POST', 'notes', { clientId: 'c1', type: 'text', content: 'doublon' });
  assert.strictEqual(dup.data.note.id, id, 'pas de doublon après un renvoi');
  const note = await until(async () => { const s = await call('GET', 'state'); const n = s.data.notes.find((x) => x.id === id); return n.status === 'ready' && n; });
  const st = await call('GET', 'state');
  const maison = st.data.notebooks.find((n) => n.name === 'Maison');
  assert.strictEqual(note.title, 'Devis du plombier');
  assert.strictEqual(note.notebookId, maison.id);
  assert.strictEqual(note.tagIds.length, 1);
  assert.strictEqual(note.provider.classif, 'infomaniak');
  assert.ok(st.data.providers[0].usage.calls >= 1);
});

test('carnet choisi à la création jamais modifié par l\'IA', async () => {
  const st = await call('GET', 'state');
  const travail = st.data.notebooks.find((n) => n.name === 'Travail');
  const r = await call('POST', 'notes', { type: 'text', content: 'Plombier pour le bureau', notebookId: travail.id });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(n.notebookId, travail.id);
});

test('à lire / lu : choisi à la création, gardé après l\'analyse, modifiable', async () => {
  const r = await call('POST', 'notes', { type: 'text', content: 'Article à lire https://example.org/article', read: 'todo' });
  assert.strictEqual(r.data.note.read, 'todo');
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(n.read, 'todo', 'l\'IA ne touche pas à l\'état de lecture');
  let p = await call('PATCH', 'notes/' + n.id, { read: 'done' });
  assert.strictEqual(p.data.note.read, 'done');
  assert.ok(p.data.note.readAt);
  assert.strictEqual(p.data.note.locked, n.locked, 'marquer comme lu ne verrouille pas le classement');
  p = await call('PATCH', 'notes/' + n.id, { read: null });
  assert.strictEqual(p.data.note.read, null);
  assert.strictEqual(p.data.note.readAt, null);
  p = await call('PATCH', 'notes/' + n.id, { read: 'peut-être' });
  assert.strictEqual(p.status, 400);
  const plain = await call('POST', 'notes', { type: 'text', content: 'Liste de courses' });
  assert.strictEqual(plain.data.note.read, null);
});

test('mode manuel : aucune analyse sans clic', async () => {
  await call('PATCH', 'settings', { trigger: { classif: 'manual' } });
  const before = calls.length;
  const r = await call('POST', 'notes', { type: 'text', content: 'Idée en attente' });
  assert.strictEqual(r.data.note.status, 'pending');
  await wait(300);
  assert.strictEqual(calls.length, before);
  await call('POST', 'notes/' + r.data.note.id + '/analyze', {});
  await until(async () => { const s = await call('GET', 'state'); return s.data.notes.find((y) => y.id === r.data.note.id).status === 'ready'; });
  await call('PATCH', 'settings', { trigger: { classif: 'auto' } });
});

test('plafond mensuel : blocage et note mise en attente', async () => {
  await call('PATCH', 'settings', { budgets: { infomaniak: 0.0000001 } });
  const r = await call('POST', 'notes', { type: 'text', content: 'Note au-delà du plafond' });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'pending' && x; });
  assert.strictEqual(n.pendingReason, 'budget');
  await call('PATCH', 'settings', { budgets: { infomaniak: 10 } });
});

test('vocal : envoi du fichier, transcription manuelle, limite de durée', async () => {
  await call('PATCH', 'settings', { trigger: { transcr: 'manual' } });
  let r = await call('POST', 'notes', { type: 'voice', dur: 300 });
  const tooLong = r.data.note.id;
  let up = await fetch(base + `api/notes/${tooLong}/media?slot=0`, { method: 'POST', headers: { Cookie: cookie, 'X-Mainotes': '1', 'Content-Type': 'audio/webm' }, body: Buffer.from('abc') });
  assert.strictEqual(up.status, 400);
  r = await call('POST', 'notes', { type: 'voice', dur: 12 });
  up = await fetch(base + `api/notes/${r.data.note.id}/media?slot=0`, { method: 'POST', headers: { Cookie: cookie, 'X-Mainotes': '1', 'Content-Type': 'audio/webm' }, body: Buffer.from('fake-audio') });
  assert.strictEqual(up.status, 200);
  r = await call('POST', `notes/${r.data.note.id}/submit`, {});
  assert.strictEqual(r.data.note.status, 'pending');
  const media = r.data.note.media[0];
  const file = await fetch(base + `api/media/${r.data.note.id}/${media.id}`, { headers: { Cookie: cookie } });
  assert.strictEqual(await file.text(), 'fake-audio');
  await call('PATCH', 'settings', { trigger: { transcr: 'auto' } });
});

test('re-tri annulable et synthèse avec historique et PDF', async () => {
  let r = await call('GET', 'retri/estimate?scope=unlocked');
  assert.ok(r.data.count >= 1);
  r = await call('POST', 'retri', { scope: 'unlocked' });
  const op = await until(async () => { const x = await call('GET', 'retri/' + r.data.retri.id); return x.data.retri.status === 'done' && x.data.retri; });
  assert.ok(op.done >= 1);

  const st = await call('GET', 'state');
  const ids = st.data.notes.filter((n) => n.status === 'ready').map((n) => n.id);
  r = await call('POST', 'syntheses/estimate', { ids, mode: 'short' });
  assert.strictEqual(r.data.calls, 1);
  r = await call('POST', 'syntheses', { ids, mode: 'short', label: 'Tous les carnets' });
  assert.strictEqual(r.status, 200);
  const sid = r.data.synthesis.id;
  r = await call('POST', 'syntheses/estimate', { ids, mode: 'short' });
  assert.strictEqual(r.data.duplicateId, sid, 'synthèse identique signalée');
  const pdf = await fetch(base + `api/syntheses/${sid}/pdf`, { headers: { Cookie: cookie } });
  assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await pdf.arrayBuffer());
  assert.strictEqual(buf.slice(0, 8).toString(), '%PDF-1.4');
  r = await call('PATCH', 'syntheses/' + sid, { title: 'Ma synthèse', pinned: true });
  assert.strictEqual(r.data.synthesis.title, 'Ma synthèse');
});

test('fusion de carnets et annulation', async () => {
  let st = await call('GET', 'state');
  const [a, b] = st.data.notebooks;
  await call('PATCH', 'settings', { defaultNotebook: a.id });
  let r = await call('POST', 'notebooks/merge', { from: a.id, to: b.id });
  assert.strictEqual(r.status, 200);
  st = await call('GET', 'state');
  assert.strictEqual(st.data.settings.defaultNotebook, b.id);
  r = await call('POST', 'merge/undo', {});
  st = await call('GET', 'state');
  assert.ok(st.data.notebooks.find((n) => n.id === a.id));
  assert.strictEqual(st.data.settings.defaultNotebook, a.id);
});

test('édition du compte : nom, identifiant, mot de passe, sessions', async () => {
  let r = await call('PATCH', 'account', { name: 'Thomas B.' });
  assert.strictEqual(r.data.user.name, 'Thomas B.');
  r = await call('PATCH', 'account', { login: 'nouveau@example.be', currentPassword: 'faux' });
  assert.strictEqual(r.status, 403);
  r = await call('PATCH', 'account', { login: 'nouveau@example.be', currentPassword: 'une phrase longue' });
  assert.strictEqual(r.data.user.login, 'nouveau@example.be');

  const mine = cookie;
  cookie = '';
  r = await call('POST', 'auth/login', { login: 'nouveau@example.be', password: 'une phrase longue' });
  assert.strictEqual(r.status, 200);
  const other = cookie;
  cookie = mine;
  r = await call('GET', 'account');
  assert.strictEqual(r.data.sessions.length, 2);

  r = await call('POST', 'account/password', { current: 'une phrase longue', next: 'encore plus longue phrase' });
  assert.strictEqual(r.status, 200);
  cookie = other;
  r = await call('GET', 'state');
  assert.strictEqual(r.status, 401, 'autres appareils déconnectés');
  cookie = '';
  r = await call('POST', 'auth/login', { login: 'nouveau@example.be', password: 'une phrase longue' });
  assert.strictEqual(r.status, 401);
  cookie = mine;
  r = await call('GET', 'export');
  assert.strictEqual(r.data.user.login, 'nouveau@example.be');
  assert.ok(!JSON.stringify(r.data).includes('scrypt$'));
});

test('suppression du compte : retour à la création', async () => {
  let r = await call('DELETE', 'account', { password: 'encore plus longue phrase', confirm: 'non' });
  assert.strictEqual(r.status, 400);
  r = await call('DELETE', 'account', { password: 'encore plus longue phrase', confirm: 'SUPPRIMER' });
  assert.strictEqual(r.status, 200);
  r = await call('GET', 'auth/state');
  assert.strictEqual(r.data.setup, true);
  assert.deepStrictEqual(fs.readdirSync(path.join(dataDir, 'media')), []);
});

test('modèle Gemini retiré remplacé au chargement', () => {
  const { Store } = require('../lib/store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-mig-'));
  const s1 = new Store(dir);
  s1.db.settings.models.gemini = { chat: 'gemini-2.5-flash-lite', vision: 'mon-modele', audio: 'gemini-2.5-flash-lite' };
  s1.save();
  const s2 = new Store(dir);
  assert.deepStrictEqual(s2.db.settings.models.gemini, { chat: 'gemini-3.5-flash-lite', vision: 'mon-modele', audio: 'gemini-3.5-flash-lite' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('lien collé : aperçu lu sur la page et descriptif rédigé dans l\'appel de classement', async () => {
  // Le compte a été supprimé par le test précédent : on le recrée.
  let r = await call('POST', 'auth/setup', { login: 'liens', password: 'une phrase longue' });
  assert.strictEqual(r.status, 200);
  await call('PATCH', 'settings', { infomaniak: { productId: '123', baseUrl: mockUrl + '/ai/{product_id}/v1' } });
  await call('PUT', 'keys/infomaniak', { key: 'k' });
  const before = calls.length;
  r = await call('POST', 'notes', { type: 'text', content: `À commander : ${mockUrl}/redir.` });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(calls.length - before, 1, 'un seul appel IA');
  assert.strictEqual(n.links.length, 1);
  const l = n.links[0];
  assert.strictEqual(l.url, mockUrl + '/redir');
  assert.strictEqual(l.title, 'Robinet & mitigeur');
  assert.strictEqual(l.site, 'Brico');
  assert.strictEqual(l.summary, 'Mitigeur thermostatique chromé.');
  assert.match(l.excerpt, /Prix : 89 €/);
  assert.ok(!/x\(\)/.test(l.excerpt), 'scripts retirés');
  assert.strictEqual(l.aiDescription, true);
  assert.match(l.description, /robinet thermostatique/);
});

test('lien vers une adresse interne refusé', async () => {
  const { fetchPreview, extractUrls, isPrivateIp } = require('../lib/links');
  delete process.env.MAINOTES_ALLOW_PRIVATE_LINKS;
  const l = await fetchPreview(mockUrl + '/page');
  process.env.MAINOTES_ALLOW_PRIVATE_LINKS = '1';
  assert.strictEqual(l.error, 'adresse interne');
  assert.strictEqual(l.summary, '');
  assert.ok(isPrivateIp('192.168.1.4') && isPrivateIp('::1') && !isPrivateIp('83.166.133.1'));
  assert.deepStrictEqual(extractUrls('voir www.exemple.be/a. et https://x.org/b), puis ftp://non'), ['https://www.exemple.be/a', 'https://x.org/b']);
});

test('enrichissement à la demande : liens vérifiés, recherches, un seul appel', async () => {
  const r = await call('POST', 'notes', { type: 'text', content: 'Weber-Wulff 2023 teste 14 outils de détection d\'IA' });
  await until(async () => { const s = await call('GET', 'state'); return s.data.notes.find((y) => y.id === r.data.note.id).status === 'ready'; });
  let st = await call('GET', 'state');
  assert.strictEqual(st.data.notes.find((y) => y.id === r.data.note.id).enrichment, undefined, 'pas d\'enrichissement par défaut');
  const before = calls.length;
  const e = await call('POST', `notes/${r.data.note.id}/enrich`, {});
  assert.strictEqual(e.status, 200);
  assert.strictEqual(calls.length - before, 1);
  const en = e.data.note.enrichment;
  assert.match(en.explanation, /14 outils/);
  assert.strictEqual(en.links.length, 1, 'lien inventé écarté');
  assert.strictEqual(en.links[0].url, mockUrl + '/page');
  assert.strictEqual(en.rejected, 1);
  assert.match(en.searches[0].scholar, /^https:\/\/scholar\.google\.com\/scholar\?q=Weber-Wulff/);
  const d = await call('DELETE', `notes/${r.data.note.id}/enrichment`);
  assert.strictEqual(d.data.note.enrichment, null);
});

test('enrichissement automatique : dans l\'appel de classement, jamais au re-tri', async () => {
  await call('PATCH', 'settings', { trigger: { enrich: 'auto' } });
  const before = calls.length;
  const r = await call('POST', 'notes', { type: 'text', content: 'Étude sur les détecteurs de textes IA' });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(calls.length - before, 1, 'aucun appel en plus');
  assert.ok(n.enrichment && n.enrichment.links.length === 1);
  const op = await call('POST', 'retri', { scope: 'all' });
  await until(async () => (await call('GET', 'retri/' + op.data.retri.id)).data.retri.status === 'done');
  const last = calls[calls.length - 1];
  assert.ok(!JSON.stringify(last.messages).includes('enrichissement'), 're-tri sans enrichissement');
  await call('PATCH', 'settings', { trigger: { enrich: 'off' } });
  const off = await call('POST', `notes/${r.data.note.id}/enrich`, {});
  assert.strictEqual(off.status, 400);
});

test('case « Enrichir cette note » et description du carnet de notes', async () => {
  await call('PATCH', 'settings', { trigger: { enrich: 'demand' }, context: 'Enseignante, je note mes lectures sur l\'IA en éducation.' });
  let before = calls.length;
  let r = await call('POST', 'notes', { type: 'text', content: 'Lire Weber-Wulff 2023', enrich: true });
  let n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(calls.length - before, 1, 'enrichi dans l\'appel de classement');
  assert.ok(n.enrichment, 'case cochée : note enrichie');
  const prompt = JSON.stringify(calls[calls.length - 1].messages);
  assert.ok(prompt.includes('Enseignante, je note mes lectures'), 'description transmise au classement');

  // Consigne par type : envoyée seulement avec les notes du type concerné.
  await call('PATCH', 'settings', { instructions: { text: 'CONSIGNE-TEXTE', voice: 'CONSIGNE-VOCALE' } });
  before = calls.length;
  r = await call('POST', 'notes', { type: 'text', content: 'Note avec consigne' });
  await until(async () => (await call('GET', 'state')).data.notes.find((y) => y.id === r.data.note.id).status === 'ready');
  const withIns = JSON.stringify(calls[calls.length - 1].messages);
  assert.ok(withIns.includes('CONSIGNE-TEXTE') && !withIns.includes('CONSIGNE-VOCALE'), 'consigne du type texte seule');
  const st = (await call('GET', 'state')).data.settings;
  assert.ok(/livre/.test(st.instructions.image), 'consigne image par défaut : couverture de livre');
  await call('PATCH', 'settings', { instructions: { text: '', voice: '' } });

  await call('PATCH', 'settings', { trigger: { enrich: 'auto' } });
  r = await call('POST', 'notes', { type: 'text', content: 'Autre lecture', enrich: false });
  n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.ok(!n.enrichment, 'case décochée : pas d\'enrichissement malgré le mode automatique');
  await call('PATCH', 'settings', { trigger: { enrich: 'demand' }, context: '' });
});

test('quota Gemini dépassé : note en attente, pas d\'appel pendant le délai, reprise automatique', async () => {
  await call('PATCH', 'settings', { enabled: { gemini: true }, providers: { classif: 'gemini' }, trigger: { enrich: 'off' } });
  await call('PUT', 'keys/gemini', { key: 'g' });
  gemini.fail = 1;
  const before = gemini.calls;
  const a = await call('POST', 'notes', { type: 'text', content: 'Première note Gemini' });
  const na = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === a.data.note.id); return x.status === 'pending' && x; });
  assert.strictEqual(na.pendingReason, 'quota');
  assert.match(na.error, /quota gratuit atteint \(20 requêtes par jour, gemini-3\.5-flash-lite\)/);
  assert.ok(na.retryAt > Date.now());
  const b = await call('POST', 'notes', { type: 'text', content: 'Deuxième note pendant le délai' });
  await until(async () => { const s = await call('GET', 'state'); return s.data.notes.find((y) => y.id === b.data.note.id).pendingReason === 'quota'; });
  assert.strictEqual(gemini.calls - before, 1, 'aucun appel pendant le délai demandé par Google');
  let st = await call('GET', 'state');
  assert.ok(st.data.providers.find((p) => p.id === 'gemini').quota.lastQuota.freeTier);
  const done = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === a.data.note.id); return x.status === 'ready' && x; }, 9000);
  assert.strictEqual(done.title, 'Classée par Gemini');
});

test('quota du jour saisi dans les réglages : l\'application s\'arrête avant le fournisseur', async () => {
  let st = await call('GET', 'state');
  const today = st.data.providers.find((p) => p.id === 'gemini').quota.today;
  assert.ok(today >= 2);
  await call('PATCH', 'settings', { quotas: { gemini: { perDay: today } } });
  const before = gemini.calls;
  const r = await call('POST', 'notes', { type: 'text', content: 'Au-delà du quota du jour' });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'pending' && x; });
  assert.match(n.error, /quota indiqué dans les réglages atteint/);
  assert.strictEqual(gemini.calls, before, 'aucun appel envoyé');
  await call('PATCH', 'settings', { quotas: { gemini: { perDay: '' } } });
  st = await call('GET', 'state');
  assert.strictEqual(st.data.settings.quotas.gemini.perDay, null);
});

test('limites annoncées par Claude relevées à chaque appel', async () => {
  await call('PATCH', 'settings', { enabled: { claude: true }, providers: { classif: 'claude' } });
  await call('PUT', 'keys/claude', { key: 'sk-test' });
  const r = await call('POST', 'notes', { type: 'text', content: 'Note pour Claude' });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(n.title, 'Classée par Claude');
  const st = await call('GET', 'state');
  const obs = st.data.providers.find((p) => p.id === 'claude').quota.observed;
  assert.strictEqual(obs.headers['anthropic-ratelimit-requests-limit'], '50');
  assert.strictEqual(obs.headers['anthropic-ratelimit-requests-remaining'], '49');
  await call('PATCH', 'settings', { providers: { classif: 'infomaniak' } });
});

test('Mistral : inactif par défaut, test de connexion, classement des notes', async () => {
  let st = await call('GET', 'state');
  const p0 = st.data.providers.find((p) => p.id === 'mistral');
  assert.ok(p0, 'Mistral figure dans la liste des fournisseurs');
  assert.strictEqual(p0.enabled, false);
  assert.strictEqual(p0.supports.transcr, true);
  assert.deepStrictEqual(st.data.settings.models.mistral, { chat: 'mistral-small-latest', vision: 'mistral-small-latest', audio: 'voxtral-mini-latest' });

  await call('PUT', 'keys/mistral', { key: 'mk-test' });
  let r = await call('POST', 'keys/mistral/test', {});
  assert.deepStrictEqual(r.data.models.chat, ['mistral-small-latest', 'mistral-tiny-latest']);
  assert.deepStrictEqual(r.data.models.vision, ['mistral-small-latest']);
  assert.deepStrictEqual(r.data.models.audio, ['voxtral-mini-transcribe-latest']);

  // Inactif : le classement ne part pas chez Mistral.
  r = await call('PATCH', 'settings', { providers: { classif: 'mistral' } });
  assert.strictEqual(r.data.settings.providers.classif, 'mistral');
  const before = mistral.calls;
  const off = await call('POST', 'notes', { type: 'text', content: 'Note avant activation de Mistral' });
  const pending = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === off.data.note.id); return x.status !== 'processing' && x.status !== 'new' && x; });
  assert.notStrictEqual(pending.status, 'ready');
  assert.strictEqual(mistral.calls, before, 'rien ne part tant que Mistral n\'est pas activé');

  await call('PATCH', 'settings', { enabled: { mistral: true }, trigger: { enrich: 'off' } });
  const a = await call('POST', 'notes', { type: 'text', content: 'Note pour Mistral' });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === a.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(n.title, 'Classée par Mistral');
  assert.strictEqual(n.provider.classif, 'mistral');
  assert.strictEqual(mistral.auth, 'Bearer mk-test');
  st = await call('GET', 'state');
  const p = st.data.providers.find((x) => x.id === 'mistral');
  assert.ok(p.usage.calls >= 1);
  assert.strictEqual(p.quota.observed.headers['x-ratelimit-limit-requests'], '60');
  const raw = fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8');
  assert.ok(!raw.includes('mk-test'), 'la clé doit être chiffrée');
  await call('PATCH', 'settings', { providers: { classif: 'infomaniak' } });
});

test('tâches : ajout, coche, échéance, suppression et réglage d\'activation', async () => {
  const r = await call('POST', 'notes', { type: 'text', content: 'Préparer la réunion de quartier' });
  const id = r.data.note.id;
  assert.deepStrictEqual(r.data.note.todos, []);
  let p = await call('POST', 'notes/' + id + '/todos', { text: 'Réserver la salle', due: '2026-11-19' });
  assert.strictEqual(p.data.note.todos.length, 1);
  assert.strictEqual(p.data.note.todos[0].due, '2026-11-19');
  p = await call('POST', 'notes/' + id + '/todos', { text: 'Imprimer l\'ordre du jour', due: 'pas une date' });
  assert.strictEqual(p.data.note.todos[1].due, null, 'une date invalide est ignorée');
  assert.strictEqual((await call('POST', 'notes/' + id + '/todos', { text: '   ' })).status, 400);
  const [t1, t2] = p.data.note.todos;
  p = await call('PATCH', 'notes/' + id + '/todos/' + t1.id, { done: true });
  assert.strictEqual(p.data.note.todos[0].done, true);
  assert.ok(p.data.note.todos[0].doneAt);
  assert.strictEqual(p.data.note.locked, false, 'cocher une tâche ne verrouille pas le classement');
  p = await call('PATCH', 'notes/' + id + '/todos/' + t2.id, { text: 'Imprimer', due: '2026-11-20' });
  assert.strictEqual(p.data.note.todos[1].text, 'Imprimer');
  assert.strictEqual((await call('PATCH', 'notes/' + id + '/todos/inconnue', { done: true })).status, 404);
  p = await call('DELETE', 'notes/' + id + '/todos/' + t1.id);
  assert.strictEqual(p.data.note.todos.length, 1);
  const st = await call('GET', 'state');
  assert.strictEqual(st.data.settings.features.tasks, true);
  const s = await call('PATCH', 'settings', { features: { tasks: false } });
  assert.strictEqual(s.data.settings.features.tasks, false);
  const kept = (await call('GET', 'state')).data.notes.find((n) => n.id === id);
  assert.strictEqual(kept.todos.length, 1, 'désactiver la fonction ne supprime aucune donnée');
  await call('PATCH', 'settings', { features: { tasks: true } });
});

test('propriétés de carnet : définition, valeurs typées, nettoyage et réglages', async () => {
  const nbs = (await call('GET', 'state')).data.notebooks;
  const c = nbs[0];
  let p = await call('PATCH', 'notebooks/' + c.id, { properties: [
    { name: 'Statut', type: 'select', options: 'À lire, En cours, Lu' },
    { name: 'Échéance', type: 'date' },
    { name: 'Note', type: 'number' }
  ] });
  assert.strictEqual(p.status, 200);
  const [st, due, note] = p.data.notebook.properties;
  assert.deepStrictEqual(st.options, ['À lire', 'En cours', 'Lu']);
  assert.strictEqual((await call('PATCH', 'notebooks/' + c.id, { properties: [{ name: 'A', type: 'text' }, { name: 'a', type: 'text' }] })).status, 400, 'noms en double refusés');
  assert.strictEqual((await call('PATCH', 'notebooks/' + c.id, { properties: [{ name: 'S', type: 'select', options: '' }] })).status, 400, 'sélection sans option refusée');
  const n = (await call('POST', 'notes', { type: 'text', content: 'Roman à lire', notebookId: c.id })).data.note;
  assert.deepStrictEqual(n.props, {});
  p = await call('PATCH', 'notes/' + n.id, { props: { [st.id]: 'En cours', [due.id]: '2026-12-20', [note.id]: '4' } });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.data.note.props[st.id], 'En cours');
  assert.strictEqual(p.data.note.props[note.id], 4);
  assert.strictEqual(p.data.note.locked, false, 'une propriété ne verrouille pas le classement');
  assert.strictEqual((await call('PATCH', 'notes/' + n.id, { props: { [st.id]: 'Inconnue' } })).status, 400);
  assert.strictEqual((await call('PATCH', 'notes/' + n.id, { props: { [due.id]: 'demain' } })).status, 400);
  assert.strictEqual((await call('PATCH', 'notes/' + n.id, { props: { xyz: 'a' } })).status, 400);
  p = await call('PATCH', 'notes/' + n.id, { props: { [note.id]: null } });
  assert.strictEqual(p.data.note.props[note.id], undefined, 'valeur retirée');
  // Retirer une propriété nettoie les valeurs des notes ; retirer une option aussi.
  await call('PATCH', 'notebooks/' + c.id, { properties: [{ id: st.id, name: 'Statut', type: 'select', options: ['À lire', 'Lu'] }, { id: due.id, name: 'Échéance', type: 'date' }] });
  const after = (await call('GET', 'state')).data.notes.find((x) => x.id === n.id);
  assert.strictEqual(after.props[st.id], undefined, 'option supprimée : valeur retirée');
  assert.strictEqual(after.props[due.id], '2026-12-20');
  const s = await call('PATCH', 'settings', { features: { props: false, views: false } });
  assert.deepStrictEqual(s.data.settings.features, { tasks: true, props: false, views: false, links: true, templates: true, ai: true });
  const kept = (await call('GET', 'state')).data.notes.find((x) => x.id === n.id);
  assert.strictEqual(kept.props[due.id], '2026-12-20', 'désactiver ne supprime aucune donnée');
  await call('PATCH', 'settings', { features: { props: true, views: true } });
});

test('modèle de note : tâches de départ à la création, réglages liens et modèles', async () => {
  const r = await call('POST', 'notes', { type: 'text', content: 'Liste de courses', todos: ['Pain', '  ', 'Lait'] });
  assert.deepStrictEqual(r.data.note.todos.map((t) => t.text), ['Pain', 'Lait']);
  assert.ok(r.data.note.todos.every((t) => t.done === false && t.id));
  const plain = await call('POST', 'notes', { type: 'text', content: 'Sans modèle' });
  assert.deepStrictEqual(plain.data.note.todos, []);
  const s = await call('PATCH', 'settings', { features: { links: false, templates: false } });
  assert.strictEqual(s.data.settings.features.links, false);
  assert.strictEqual(s.data.settings.features.templates, false);
  await call('PATCH', 'settings', { features: { links: true, templates: true } });
});

test('fonctions IA sur les notes : extraire des tâches, reformuler, interroger, réglage', async () => {
  const n = (await call('POST', 'notes', { type: 'text', content: 'Penser à appeler le plombier et à payer la facture de gaz.' })).data.note;
  await until(async () => (await call('GET', 'state')).data.notes.find((x) => x.id === n.id).status === 'ready');
  const before = calls.length;
  let r = await call('POST', 'notes/' + n.id + '/transform', { action: 'todos' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.result.kind, 'todos');
  assert.deepStrictEqual(r.data.result.todos, ['Appeler le plombier', 'Payer la facture']);
  assert.strictEqual(calls.length, before + 1, 'un seul appel IA');
  r = await call('POST', 'notes/' + n.id + '/transform', { action: 'summary' });
  assert.strictEqual(r.data.result.kind, 'text');
  assert.ok(r.data.result.text.length > 0);
  assert.strictEqual((await call('POST', 'notes/' + n.id + '/transform', { action: 'inconnue' })).status, 400);
  const c0 = calls.length;
  r = await call('POST', 'ask', { question: 'Que dois-je faire pour la facture de gaz ?' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(calls.length, c0 + 1);
  assert.ok(r.data.answer && r.data.sources.length >= 1 && r.data.sources[0].id);
  r = await call('POST', 'ask', { question: 'zébrures astronomiques quantiques' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(calls.length, c0 + 1, 'aucune note proche : aucun appel IA');
  await call('PATCH', 'settings', { features: { ai: false } });
  assert.strictEqual((await call('POST', 'ask', { question: 'facture' })).status, 400);
  assert.strictEqual((await call('POST', 'notes/' + n.id + '/transform', { action: 'todos' })).status, 400);
  await call('PATCH', 'settings', { features: { ai: true } });
});

test('F99 et F104 : propriétés et notes liées proposées dans l\'appel de classement', async () => {
  const c = (await call('POST', 'notebooks', { name: 'Lectures', desc: 'Livres', properties: [
    { name: 'Statut', type: 'select', options: 'À lire, En cours, Lu', ai: true },
    { name: 'Échéance', type: 'date', ai: true },
    { name: 'Auteur', type: 'text' }
  ] })).data.notebook;
  assert.ok(c.properties[0].ai && c.properties[1].ai && !c.properties[2].ai);
  const [st, due, aut] = c.properties;
  await call('POST', 'notes', { type: 'text', content: 'Atelier du potier : argile et émaux, cuisson à 1200 degrés.', notebookId: c.id });
  await wait(300);
  const before = calls.length;
  const r = await call('POST', 'notes', { type: 'text', content: 'Rendre le livre sur la cuisson des émaux avant le 20 décembre.', notebookId: c.id });
  const n = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === r.data.note.id); return x.status === 'ready' && x; });
  assert.strictEqual(calls.length, before + 1, 'un seul appel : classement, propriétés et liens ensemble');
  const prompt = JSON.stringify(calls[calls.length - 1].messages);
  assert.ok(prompt.includes('Propriétés à remplir') && prompt.includes('Statut') && !prompt.includes('Auteur'), 'seules les propriétés marquées IA sont demandées');
  assert.strictEqual(n.props[st.id], 'En cours');
  assert.strictEqual(n.props[due.id], '2026-12-20');
  assert.strictEqual(n.props[aut.id], undefined, 'valeur invalide ou non demandée ignorée');
  assert.ok(n.propsAi[st.id] && n.propsAi[due.id]);
  assert.strictEqual(n.related.length, 1, 'note liée proposée');
  // Une valeur saisie à la main n'est plus marquée IA et n'est jamais écrasée.
  let p = await call('PATCH', 'notes/' + n.id, { props: { [st.id]: 'Lu' } });
  assert.strictEqual(p.data.note.propsAi[st.id], undefined);
  await call('POST', 'notes/' + n.id + '/analyze', {});
  const again = await until(async () => { const s = await call('GET', 'state'); const x = s.data.notes.find((y) => y.id === n.id); return x.status === 'ready' && x; });
  assert.strictEqual(again.props[st.id], 'Lu', 'la valeur choisie à la main reste');
  // Ignorer une suggestion de lien.
  p = await call('PATCH', 'notes/' + n.id, { dismissRelated: n.related[0] });
  assert.deepStrictEqual(p.data.note.related, []);
  assert.ok(p.data.note.relatedOff.includes(n.related[0]));
});

test('tâches hors connexion : identifiant fourni par l\'appareil, renvois sans doublon', async () => {
  const n = (await call('POST', 'notes', { type: 'text', content: 'Note pour tâches hors ligne' })).data.note;
  let p = await call('POST', 'notes/' + n.id + '/todos', { text: 'Ajoutée sans réseau', id: 'local-abc123' });
  assert.strictEqual(p.data.note.todos[0].id, 'local-abc123');
  p = await call('POST', 'notes/' + n.id + '/todos', { text: 'Ajoutée sans réseau', id: 'local-abc123' });
  assert.strictEqual(p.data.note.todos.length, 1, 'renvoi : pas de doublon');
  p = await call('PATCH', 'notes/' + n.id + '/todos/local-abc123', { done: true });
  assert.strictEqual(p.data.note.todos[0].done, true);
  p = await call('DELETE', 'notes/' + n.id + '/todos/local-abc123');
  assert.strictEqual(p.status, 200);
  p = await call('DELETE', 'notes/' + n.id + '/todos/local-abc123');
  assert.strictEqual(p.status, 200, 'suppression déjà faite : sans erreur');
  p = await call('POST', 'notes/' + n.id + '/todos', { text: 'x', id: 'a b' });
  assert.notStrictEqual(p.data.note.todos[0].id, 'a b', 'identifiant invalide ignoré');
});
