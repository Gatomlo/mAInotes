const test = require('node:test');
const assert = require('node:assert');
const { start, client, base, PASSWORD } = require('./helpers');

test('qr : SVG pour un lien http(s) seulement', async (t) => {
  const server = await start();
  t.after(() => server.close());
  const c = client();
  await c.post('/api/auth/setup', { name: 'Moi', login: 'moi', email: 'moi@exemple.be', password: PASSWORD });
  const ok = await fetch(`${base()}/api/qr?text=${encodeURIComponent('https://exemple.be/app/')}`, { headers: { cookie: c.cookie() } });
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /<svg/);
  assert.strictEqual((await c.get('/api/qr?text=javascript:alert(1)')).status, 400);
});
