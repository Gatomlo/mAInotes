// Chiffrement des cles API (AES-256-GCM). Cle maitre : __ENV___SECRET, sinon data/secret.key
// (creee au premier usage, lisible par le seul proprietaire). A sauvegarder avec data/ :
// sans elle, les cles enregistrees sont illisibles.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./db');

let master = null;
function masterKey() {
  if (master) return master;
  if (process.env.__ENV___SECRET) return (master = crypto.createHash('sha256').update(process.env.__ENV___SECRET).digest());
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  return (master = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64'));
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(blob) {
  if (!blob) return '';
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
