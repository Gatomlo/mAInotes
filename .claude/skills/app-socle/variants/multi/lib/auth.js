// Comptes multiples : e-mail + mot de passe (scrypt), session de 90 jours en base, cookie limite
// au chemin de montage. Le premier compte cree est administrateur ; les suivants arrivent par
// invitation (lien transmis a la main, 7 jours, usage unique). Aucun e-mail envoye par defaut.
const crypto = require('crypto');
const { promisify } = require('util');
const { db, getSetting } = require('./db');
const { httpError, limiter } = require('./util');

const COOKIE = '__SLUG___session';
const SESSION_TTL = 90 * 24 * 3600 * 1000;
const INVITE_TTL = 7 * 24 * 3600 * 1000;
const MIN_PASSWORD = 10;
const scrypt = promisify(crypto.scrypt);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

function rootPath(req) {
  const m = req.app && req.app.mountpath;
  return typeof m === 'string' && m !== '/' ? m : '';
}

// Adresse publique pour les liens d'invitation : __ENV___PUBLIC_URL, sinon reglage « public_url »,
// sinon deduite de la requete (l'en-tete Host peut etre falsifie : a fixer en production).
function publicUrl(req) {
  const fixed = String(process.env.__ENV___PUBLIC_URL || getSetting('public_url') || '').replace(/\/+$/, '');
  if (fixed) return fixed;
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('host')}${rootPath(req)}`;
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

function createSession(req, res, memberId) {
  const token = newToken();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, member_id, device, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), memberId, String(req.headers['user-agent'] || '').slice(0, 120), Date.now(), Date.now() + SESSION_TTL);
  setCookie(req, res, token, SESSION_TTL);
}
function destroySession(req, res) {
  const token = readCookie(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(req, res, '', 0);
}

const hasAccount = () => !!db.prepare('SELECT 1 FROM members').get();

// Renseigne req.user = { id, name, email, isAdmin } si la session est valide.
function loadUser(req, res, next) {
  const token = readCookie(req);
  if (token) {
    const row = db.prepare(`SELECT m.id, m.name, m.email, m.is_admin, s.expires_at FROM sessions s
      JOIN members m ON m.id = s.member_id WHERE s.token_hash = ?`).get(sha256(token));
    if (row && row.expires_at > Date.now()) req.user = { id: row.id, name: row.name, email: row.email, isAdmin: !!row.is_admin };
  }
  next();
}
const requireAuth = (req, res, next) => (req.user ? next() : next(httpError(401, 'Connexion requise.')));
const admin = (req, res, next) => (req.user && req.user.isAdmin ? next() : next(httpError(403, 'Réservé à l’administrateur.')));

// ---------- Invitations ----------
function createInvitation({ email, isAdmin, invitedBy }) {
  const token = newToken();
  db.prepare('DELETE FROM invitations WHERE expires_at < ?').run(Date.now() - 24 * 3600 * 1000);
  db.prepare('INSERT INTO invitations (token_hash, email, is_admin, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), email || null, isAdmin ? 1 : 0, invitedBy, Date.now() + INVITE_TTL);
  return token;
}
function findInvitation(token) {
  const row = db.prepare('SELECT * FROM invitations WHERE token_hash = ?').get(sha256(String(token || '')));
  if (!row || row.used_at || row.expires_at < Date.now()) throw httpError(400, 'Invitation expirée ou déjà utilisée. Demandez-en une nouvelle.');
  return row;
}
const useInvitation = (token) => db.prepare('UPDATE invitations SET used_at = ? WHERE token_hash = ?').run(Date.now(), sha256(String(token)));

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
const DUMMY = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`; // meme duree si l'adresse est inconnue
async function verifyPassword(p, stored) {
  const [, salt, hash] = String(stored || DUMMY).split('$');
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(String(p || ''), Buffer.from(salt, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual) && !!stored;
}

// 8 echecs par adresse -> blocage 15 min ; au-dela de 40 au total, reponses ralenties.
const failures = limiter(15 * 60 * 1000);
const blocked = (email) => failures.count('u:' + email) >= 8;
const recordFailure = (email) => { failures.hit('u:' + email); failures.hit('*'); };
const failureDelay = () => (failures.count('*') >= 40 ? 3000 : 600);

module.exports = {
  rootPath, publicUrl, createSession, destroySession, loadUser, requireAuth, admin, hasAccount,
  createInvitation, findInvitation, useInvitation, hashPassword, verifyPassword, blocked, recordFailure, failureDelay, failures, sha256,
};
