// Derriere node-gateway, c'est elle qui authentifie : le premier visiteur (anonyme ou simple membre) ne peut plus creer
// le premier compte et s'approprier l'outil ; l'admin de la passerelle le peut. Hors passerelle : comportement inchange.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-setup-'));
process.env.MAINOTES_DATA_DIR = dataDir;
delete process.env.MAINOTES_SETUP_TOKEN;
const app = require('../server');
const gw = (role, user) => ({ 'x-test-gateway': JSON.stringify({ app: 'mainotes', role, user: user === undefined ? { login: 'anim', name: 'Anim', email: 'anim@exemple.be', isSuper: false } : user }) });

test('creation du premier compte derriere la passerelle', async () => {
  const outer = express();
  outer.use((req, res, next) => { const h = req.get('x-test-gateway'); if (h) req.gateway = JSON.parse(h); next(); });
  outer.use('/mainotes', app);
  const srv = http.createServer(outer);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const setup = (h) => fetch(`http://127.0.0.1:${srv.address().port}/mainotes/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Mainotes': '1', ...h }, body: JSON.stringify({ name: 'Thomas', login: 'thomas', password: 'motdepasse-solide' }) });
  try {
    assert.equal((await setup(gw(null, null))).status, 403, 'anonyme');
    assert.equal((await setup(gw('member'))).status, 403, 'simple membre');
    assert.equal((await setup(gw('admin'))).status, 200, 'admin de la passerelle');
    assert.equal((await setup(gw('admin'))).status, 409, 'un seul premier compte');
  } finally { srv.close(); fs.rmSync(dataDir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); }
});
