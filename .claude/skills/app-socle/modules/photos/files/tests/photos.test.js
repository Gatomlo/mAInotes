const test = require('node:test');
const assert = require('node:assert');
const { start, client, base, PASSWORD } = require('./helpers');

test('photos : type vérifié, accès derrière la session', async (t) => {
  const server = await start();
  t.after(() => server.close());
  const c = client();
  await c.post('/api/auth/setup', { name: 'Moi', login: 'moi', email: 'moi@exemple.be', password: PASSWORD });

  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
  const up = await c.raw('POST', '/api/photos', jpeg, 'image/jpeg');
  assert.strictEqual(up.status, 201);
  assert.match(up.data.path, /^photos\/[0-9a-f]{32}\.jpg$/);

  assert.strictEqual((await c.raw('POST', '/api/photos', Buffer.from('pas une image'), 'image/jpeg')).status, 415);
  assert.strictEqual((await c.raw('POST', '/api/photos', jpeg, 'text/plain')).status, 415);

  const ok = await fetch(`${base()}/api/${up.data.path}`, { headers: { cookie: c.cookie() } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await fetch(`${base()}/api/${up.data.path}`)).status, 401);
  assert.strictEqual((await c.get('/api/photos/../../etc/passwd')).status, 404);
});
