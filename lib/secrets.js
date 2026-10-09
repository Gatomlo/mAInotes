// Mots de passe (scrypt) et chiffrement des clés API (AES-256-GCM).
//
// La clé maîtresse vient de la variable d'environnement MAINOTES_SECRET si elle est
// définie ; sinon elle est générée au premier démarrage et rangée dans
// data/secret.key (lisible par le seul propriétaire). Sans elle, les clés API
// enregistrées sont illisibles : à sauvegarder avec le dossier data/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadMasterKey(dataDir) {
  if (process.env.MAINOTES_SECRET) {
    return crypto.createHash('sha256').update(process.env.MAINOTES_SECRET).digest();
  }
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
}

function encrypt(master, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', master, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(master, blob) {
  if (!blob) return '';
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', master, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(expected, got);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { loadMasterKey, encrypt, decrypt, hashPassword, verifyPassword, sha256 };
