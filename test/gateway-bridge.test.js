// Pont avec la connexion centralisee de node-gateway : req.gateway (pose par la passerelle) ouvre une
// session locale COURTE pour le compte de meme identifiant, sans jamais creer de compte. Hors passerelle : inchange.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-gw-'));
process.env.MAINOTES_DATA_DIR = dataDir;
delete process.env.MAINOTES_SETUP_TOKEN;
const app = require('../server');

let srv, base;
const gw = (login, role = 'member') => ({ 'x-test-gateway': JSON.stringify({ app: 'mainotes', role, user: { login, name: login, email: null, isSuper: false } }) });
const state = (headers = {}) => fetch(base + '/api/auth/state', { headers });

before(async () => {
  const outer = express();
  outer.use((req, res, next) => { const h = req.get('x-test-gateway'); if (h) req.gateway = JSON.parse(h); next(); });
  outer.use('/mainotes', app);
  srv = http.createServer(outer);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}/mainotes`;
  try {
    const r = await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Mainotes': '1' }, body: JSON.stringify({ name: 'Thomas', login: 'thomas', password: 'motdepasse-solide' }) });
    assert.ok(r.status < 300, 'setup ' + r.status);
  } catch (e) { srv.close(); throw e; }
});
after(() => { srv.close(); fs.rmSync(dataDir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); });

test('identifiant de la passerelle -> compte local de meme identifiant (session courte, limitee au chemin)', async () => {
  const r = await state(gw('THOMAS'));
  const j = await r.json();
  assert.ok(j.user, 'utilisateur connecte');
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /Path=\/mainotes/);
  assert.match(cookie, /Max-Age=7200\b/);
  assert.match(cookie, /HttpOnly/);
  // la session locale suffit ensuite, sans repasser par la passerelle
  const again = await fetch(base + '/api/auth/state', { headers: { cookie: cookie.split(';')[0] } });
  assert.ok((await again.json()).user);
});

test('aucun compte cree : inconnu, anonyme ou sans droit => pas connecte', async () => {
  for (const h of [gw('inconnu'), {}, { 'x-test-gateway': JSON.stringify({ app: 'mainotes', role: null, user: { login: 'thomas' } }) }]) {
    assert.equal((await (await state(h)).json()).user, null);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, fs.readdirSync(dataDir).find((f) => f.endsWith('.json'))), 'utf8')).users.length, 1);
});
