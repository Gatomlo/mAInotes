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
delete process.env.MAINOTES_SETUP_TOKEN;

let gateway, mock, base, mockUrl;
const calls = [];

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
      content = JSON.stringify({ titre: 'Devis du plombier', carnet: nbCode ? 'C' + nbCode[1] : null, tags: ['T1'], confiance: 0.9 });
    } else {
      content = '## Maison\n- Relancer le plombier pour le **devis** [1]';
    }
    res.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  });
  m.get('/ai/:pid/v1/models', (req, res) => res.json({ data: [{ id: 'mistral24b' }] }));
  mock = await listen(m);
  mockUrl = `http://127.0.0.1:${mock.address().port}`;

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
  assert.deepStrictEqual(r.data.models, ['mistral24b']);

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
