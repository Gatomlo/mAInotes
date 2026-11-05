const test = require('node:test');
const assert = require('node:assert');
const { start, client, PASSWORD } = require('./helpers');

test('compte unique, session, ressource', async (t) => {
  const server = await start();
  t.after(() => server.close());
  const c = client();

  assert.strictEqual((await c.get('/api/items')).status, 401);
  assert.strictEqual((await c.get('/api/auth/state')).data.setup, true);

  assert.strictEqual((await c.post('/api/auth/setup', { login: 'moi', password: 'court' })).status, 400);
  assert.strictEqual((await c.post('/api/auth/setup', { name: 'Moi', login: 'moi', password: PASSWORD })).status, 200);
  assert.strictEqual((await c.post('/api/auth/setup', { login: 'x1x', password: PASSWORD })).status, 409);

  const created = await c.post('/api/items', { title: 'Essai' });
  assert.strictEqual(created.status, 201);
  assert.strictEqual((await c.get('/api/items')).data.length, 1);

  await c.post('/api/auth/logout');
  assert.strictEqual((await c.get('/api/items')).status, 401);
  assert.strictEqual((await c.post('/api/auth/login', { login: 'moi', password: 'faux-mot-de-passe' })).status, 401);
  assert.strictEqual((await c.post('/api/auth/login', { login: 'MOI', password: PASSWORD })).status, 200);
});
