const test = require('node:test');
const assert = require('node:assert');
const { start, client, PASSWORD } = require('./helpers');

test('premier compte admin, invitation, rôles', async (t) => {
  const server = await start();
  t.after(() => server.close());
  const admin = client();
  const lea = client();

  assert.strictEqual((await admin.get('/api/items')).status, 401);
  assert.strictEqual((await admin.get('/api/auth/state')).data.setup, true);
  assert.strictEqual((await admin.post('/api/auth/setup', { name: 'Thomas', email: 'thomas@exemple.be', password: PASSWORD })).status, 200);
  assert.strictEqual((await admin.post('/api/auth/setup', { email: 'autre@exemple.be', password: PASSWORD })).status, 409);

  const inv = await admin.post('/api/invitations', { email: 'lea@exemple.be' });
  assert.strictEqual(inv.status, 200);
  const token = new URL(inv.data.url).searchParams.get('invite');
  assert.strictEqual((await lea.get(`/api/auth/invite?token=${token}`)).data.email, 'lea@exemple.be');
  assert.strictEqual((await lea.post('/api/auth/register', { invite: token, email: 'intrus@exemple.be', password: PASSWORD })).status, 400);
  assert.strictEqual((await lea.post('/api/auth/register', { invite: token, name: 'Léa', email: 'lea@exemple.be', password: PASSWORD })).status, 200);
  assert.strictEqual((await lea.post('/api/auth/register', { invite: token, email: 'lea@exemple.be', password: PASSWORD })).status, 400); // usage unique

  assert.strictEqual((await lea.post('/api/invitations', {})).status, 403);
  assert.strictEqual((await lea.get('/api/members')).status, 403);
  assert.strictEqual((await admin.get('/api/members')).data.length, 2);

  assert.strictEqual((await lea.post('/api/items', { title: 'Essai' })).status, 201);
  assert.strictEqual((await admin.get('/api/items')).data.length, 1);

  await lea.post('/api/auth/logout');
  assert.strictEqual((await lea.post('/api/auth/login', { email: 'LEA@exemple.be', password: 'faux-mot-de-passe' })).status, 401);
  assert.strictEqual((await lea.post('/api/auth/login', { email: 'LEA@exemple.be', password: PASSWORD })).status, 200);

  const id = (await admin.get('/api/members')).data.find((m) => m.email === 'lea@exemple.be').id;
  assert.strictEqual((await admin.del(`/api/members/${id}`)).status, 200);
  assert.strictEqual((await lea.get('/api/items')).status, 401);
});
