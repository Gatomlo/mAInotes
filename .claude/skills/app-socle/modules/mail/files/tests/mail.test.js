const test = require('node:test');
const assert = require('node:assert');
process.env.__ENV___MAIL = 'log';
require('./helpers');

test('mail : mode log', async () => {
  const mailer = require('../lib/mailer');
  await mailer.send({ to: 'a@exemple.be', subject: 'Essai', text: 'Bonjour' });
  assert.strictEqual(mailer.outbox.length, 1);
  assert.strictEqual(mailer.outbox[0].to, 'a@exemple.be');
});
