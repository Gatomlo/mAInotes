// Compte unique : cree a la premiere ouverture (/api/auth/setup, une seule fois),
// connexion identifiant + mot de passe (scrypt), session de 90 jours en base,
// cookie limite au chemin de montage. Modifiable dans l'onglet Compte.
const crypto = require('crypto');
const { promisify } = require('util');
const { db } = require('./db');
const { httpError, limiter } = require('./util');

const COOKIE = '__SLUG___session';
const SESSION_TTL = 90 * 24 * 3600 * 1000;
const MIN_PASSWORD = 10;
const scrypt = promisify(crypto.scrypt);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Chemin de montage (/__SLUG__ dans la passerelle, '' seul).
function rootPath(req) {
  const m = req.app && req.app.mountpath;
  return typeof m === 'string' && m !== '/' ? m : '';
}

function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(req, res, value, maxAge) {
  const secure = req.secure || String(req.get('x-forwarded-proto') || '').startsWith('https');
  const parts = [`${COOKIE}=${value}`, `Path=${rootPath(req)}/`, `Max-Age=${Math.floor(maxAge / 1000)}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function createSession(req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, device, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), String(req.headers['user-agent'] || '').slice(0, 120), Date.now(), Date.now() + SESSION_TTL);
  setCookie(req, res, token, SESSION_TTL);
}

function destroySession(req, res) {
  const token = readCookie(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(req, res, '', 0);
}

const hasAccount = () => !!db.prepare('SELECT 1 FROM account').get();

// Renseigne req.user ({ name, login }) si la session est valide.
function loadUser(req, res, next) {
  const token = readCookie(req);
  if (token) {
    const s = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (s && s.expires_at > Date.now()) {
      const a = db.prepare('SELECT name, login FROM account').get();
      if (a) req.user = a;
    }
  }
  next();
}

const requireAuth = (req, res, next) => (req.user ? next() : next(httpError(401, 'Connexion requise.')));

// ---------- Mots de passe : scrypt$<sel hex>$<empreinte hex> ----------
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw httpError(400, `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`);
  if (p.length > 200) throw httpError(400, 'Mot de passe trop long.');
}
async function hashPassword(p) {
  checkPassword(p);
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scrypt(p, salt, 64)).toString('hex')}`;
}
const DUMMY = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`; // meme duree si le compte n'existe pas
async function verifyPassword(p, stored) {
  const [, salt, hash] = String(stored || DUMMY).split('$');
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(String(p || ''), Buffer.from(salt, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual) && !!stored;
}

// 8 echecs -> blocage 15 min ; au-dela de 40 au total, reponses ralenties.
const failures = limiter(15 * 60 * 1000);
const blocked = () => failures.count('login') >= 8;
const recordFailure = () => { failures.hit('login'); failures.hit('*'); };
const failureDelay = () => (failures.count('*') >= 40 ? 3000 : 600);

// Code d'installation facultatif : ferme la fenetre de creation avant la premiere visite.
const setupToken = () => process.env.__ENV___SETUP_TOKEN || null;

module.exports = {
  rootPath, createSession, destroySession, loadUser, requireAuth, hasAccount, setupToken,
  hashPassword, verifyPassword, blocked, recordFailure, failureDelay, failures, sha256,
};
