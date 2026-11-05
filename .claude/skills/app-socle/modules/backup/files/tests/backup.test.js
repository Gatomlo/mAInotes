const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { start, client, PASSWORD } = require('./helpers');

test('backup : copie cohérente de la base', async (t) => {
  const server = await start();
  t.after(() => server.close());
  await client().post('/api/auth/setup', { name: 'Moi', login: 'moi', email: 'moi@exemple.be', password: PASSWORD });
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'backup.js')], { env: process.env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const dir = path.join(process.env.__ENV___DATA_DIR, 'backups');
  assert.ok(fs.readdirSync(dir).some((f) => f.endsWith('.db')));
});
