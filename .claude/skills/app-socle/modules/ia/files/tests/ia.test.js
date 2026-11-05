const test = require('node:test');
const assert = require('node:assert');
process.env.__ENV___AI = 'fake';
const { start, client, PASSWORD } = require('./helpers');

test('IA : réglages, clés jamais exposées, cache, plafond mensuel', async (t) => {
  const server = await start();
  t.after(() => server.close());
  const c = client();
  await c.post('/api/auth/setup', { name: 'Moi', login: 'moi', email: 'moi@exemple.be', password: PASSWORD });

  assert.strictEqual((await c.put('/api/ai/key', { provider: 'claude', key: 'sk-ant-secret-12345' })).status, 200);
  const s = (await c.get('/api/ai/settings')).data;
  assert.strictEqual(s.providers.find((p) => p.id === 'claude').hasKey, true);
  assert.ok(!JSON.stringify(s).includes('secret-12345'));

  const ai = require('../lib/ai');
  const a = await ai.complete({ prompt: 'bonjour' });
  const b = await ai.complete({ prompt: 'bonjour' });
  assert.strictEqual(a.cached, false);
  assert.strictEqual(b.cached, true);

  await c.put('/api/ai/settings', { budgets: { infomaniak: 0.0001 } });
  await assert.rejects(ai.complete({ prompt: 'autre texte' }), (e) => e.budget === true);
  assert.strictEqual((await c.post('/api/ai/test', { provider: 'infomaniak' })).status >= 400, true);
});
