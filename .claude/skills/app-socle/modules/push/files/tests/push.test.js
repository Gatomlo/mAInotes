const test = require('node:test');
const assert = require('node:assert');
process.env.__ENV___PUSH = 'log';
const { start, client, PASSWORD } = require('./helpers');

test('push : clé publique, abonnement, envoi simulé', async (t) => {
  const server = await start();
  t.after(() => server.close());
  const c = client();
  assert.strictEqual((await c.get('/api/push/key')).status, 401);
  await c.post('/api/auth/setup', { name: 'Moi', login: 'moi', email: 'moi@exemple.be', password: PASSWORD });
  assert.ok((await c.get('/api/push/key')).data.key.length > 40);
  assert.strictEqual((await c.post('/api/push/subscribe', { endpoint: 'http://non-https', keys: {} })).status, 400);
  assert.strictEqual((await c.post('/api/push/subscribe', { endpoint: 'https://push.exemple.be/1', keys: { p256dh: 'a', auth: 'b' } })).status, 200);
  const push = require('../lib/push');
  await push.sendAll({ title: 'Essai' });
  assert.strictEqual(push.outbox.length, 1);
});
