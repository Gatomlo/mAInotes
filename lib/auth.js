// Compte utilisateur unique : création à la première ouverture, connexion par
// identifiant et mot de passe, sessions par appareil, édition du compte.
const express = require('express');
const crypto = require('crypto');
const { hashPassword, verifyPassword, sha256 } = require('./secrets');
const { uid } = require('./store');

const COOKIE = 'mainotes_sid';
const SESSION_DAYS = 180;
const MIN_PASSWORD = 10;

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function cookieHeader(req, value, maxAgeSec) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, `Path=${req.mountBase || '/'}`, 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSec !== undefined) parts.push(`Max-Age=${maxAgeSec}`);
  if (req.secure) parts.push('Secure');
  return parts.join('; ');
}

// Limite les essais de mot de passe : 5 échecs par adresse IP, puis 15 minutes d'attente.
const attempts = new Map();
function throttled(ip) {
  const a = attempts.get(ip);
  return a && a.count >= 5 && Date.now() < a.until;
}
function failed(ip) {
  const a = attempts.get(ip) || { count: 0, until: 0 };
  if (Date.now() > a.until) a.count = 0;
  a.count++;
  a.until = Date.now() + 15 * 60 * 1000;
  attempts.set(ip, a);
}

function deviceLabel(ua) {
  ua = String(ua || '');
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navigateur';
  return `${os} · ${br}`;
}

function publicUser(u) {
  return u ? { name: u.name, login: u.login, createdAt: u.createdAt, passwordChangedAt: u.passwordChangedAt } : null;
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Le mot de passe doit compter au moins ${MIN_PASSWORD} caractères.`;
  if (pw.length > 200) return 'Mot de passe trop long.';
  return null;
}
function checkLogin(login) {
  login = String(login || '').trim();
  if (login.length < 3 || login.length > 120) return 'L\'identifiant doit compter entre 3 et 120 caractères.';
  return null;
}

module.exports = function createAuth(store) {
  const db = () => store.db;

  function openSession(req, res) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    db().sessions.push({ id: uid(), hash: sha256(token), createdAt: now, lastSeen: now, device: deviceLabel(req.headers['user-agent']) });
    store.save();
    res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_DAYS * 86400));
  }

  function currentSession(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token || !db().user) return null;
    const h = sha256(token);
    const s = db().sessions.find((x) => x.hash === h);
    if (!s) return null;
    if (Date.now() - s.lastSeen > SESSION_DAYS * 86400 * 1000) return null;
    if (Date.now() - s.lastSeen > 3600 * 1000) { s.lastSeen = Date.now(); store.save(); }
    return s;
  }

  // Middleware : toutes les routes /api sauf /api/auth/* exigent une session.
  function requireAuth(req, res, next) {
    const s = currentSession(req);
    if (!s) return res.status(401).json({ error: db().user ? 'Session expirée, reconnectez-vous.' : 'Aucun compte : créez-le d\'abord.', setup: !db().user });
    req.session = s;
    next();
  }

  const r = express.Router();

  r.get('/auth/state', (req, res) => {
    const s = currentSession(req);
    res.json({
      setup: !db().user,
      setupTokenRequired: !db().user && !!process.env.MAINOTES_SETUP_TOKEN,
      user: s ? publicUser(db().user) : null
    });
  });

  // Création du compte : possible une seule fois, tant qu'aucun compte n'existe.
  r.post('/auth/setup', (req, res) => {
    if (db().user) return res.status(409).json({ error: 'Un compte existe déjà. Connectez-vous.' });
    const { name, login, password, setupToken } = req.body || {};
    const expected = process.env.MAINOTES_SETUP_TOKEN;
    if (expected && setupToken !== expected) return res.status(403).json({ error: 'Code d\'installation incorrect.' });
    const err = checkLogin(login) || checkPassword(password);
    if (err) return res.status(400).json({ error: err });
    const now = Date.now();
    db().user = {
      id: uid(),
      name: String(name || '').trim().slice(0, 80) || String(login).trim(),
      login: String(login).trim(),
      password: hashPassword(password),
      createdAt: now,
      passwordChangedAt: now
    };
    store.seedStructure();
    openSession(req, res);
    res.json({ user: publicUser(db().user) });
  });

  r.post('/auth/login', (req, res) => {
    const ip = req.ip;
    if (throttled(ip)) return res.status(429).json({ error: 'Trop d\'essais. Réessayez dans 15 minutes.' });
    const { login, password } = req.body || {};
    const u = db().user;
    const ok = u && String(login || '').trim().toLowerCase() === u.login.toLowerCase() && verifyPassword(password || '', u.password);
    if (!ok) {
      failed(ip);
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }
    attempts.delete(ip);
    openSession(req, res);
    res.json({ user: publicUser(u) });
  });

  r.post('/auth/logout', (req, res) => {
    const s = currentSession(req);
    if (s) { db().sessions = db().sessions.filter((x) => x !== s); store.save(); }
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
    res.json({ ok: true });
  });

  // ---------- Édition du compte (session obligatoire) ----------
  const acc = express.Router();
  acc.use(requireAuth);

  acc.get('/account', (req, res) => {
    res.json({
      user: publicUser(db().user),
      sessions: db().sessions
        .map((s) => ({ id: s.id, device: s.device, createdAt: s.createdAt, lastSeen: s.lastSeen, current: s === req.session }))
        .sort((a, b) => b.lastSeen - a.lastSeen)
    });
  });

  acc.patch('/account', (req, res) => {
    const u = db().user;
    const { name, login, currentPassword } = req.body || {};
    if (name !== undefined) u.name = String(name).trim().slice(0, 80) || u.name;
    if (login !== undefined && String(login).trim() !== u.login) {
      const err = checkLogin(login);
      if (err) return res.status(400).json({ error: err });
      if (!verifyPassword(currentPassword || '', u.password)) return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
      u.login = String(login).trim();
    }
    store.save();
    res.json({ user: publicUser(u) });
  });

  acc.post('/account/password', (req, res) => {
    const u = db().user;
    const { current, next, logoutOthers } = req.body || {};
    if (!verifyPassword(current || '', u.password)) return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
    const err = checkPassword(next);
    if (err) return res.status(400).json({ error: err });
    u.password = hashPassword(next);
    u.passwordChangedAt = Date.now();
    if (logoutOthers !== false) db().sessions = db().sessions.filter((s) => s === req.session);
    store.save();
    res.json({ ok: true });
  });

  acc.delete('/account/sessions/:id', (req, res) => {
    db().sessions = db().sessions.filter((s) => s.id !== req.params.id || s === req.session);
    store.save();
    res.json({ ok: true });
  });

  acc.post('/account/sessions/revoke-others', (req, res) => {
    db().sessions = db().sessions.filter((s) => s === req.session);
    store.save();
    res.json({ ok: true });
  });

  // Suppression complète (RGPD) : notes, médias, réglages, clés et compte.
  // L'application revient à l'écran de création de compte.
  acc.delete('/account', (req, res) => {
    const { password, confirm } = req.body || {};
    if (confirm !== 'SUPPRIMER') return res.status(400).json({ error: 'Tapez SUPPRIMER pour confirmer.' });
    if (!verifyPassword(password || '', db().user.password)) return res.status(403).json({ error: 'Mot de passe incorrect.' });
    store.reset();
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
    res.json({ ok: true });
  });

  return { router: r, accountRouter: acc, requireAuth };
};

module.exports.MIN_PASSWORD = MIN_PASSWORD;
