// Compte utilisateur unique : création à la première ouverture, connexion par
// identifiant et mot de passe, sessions par appareil, édition du compte.
const express = require('express');
const crypto = require('crypto');
const { hashPassword, verifyPassword, sha256 } = require('./secrets');
const { uid } = require('./store');
const bridge = require('./gateway-bridge');

const COOKIE = 'mainotes_sid';
const SESSION_DAYS = 180;
// Session ouverte par la connexion centralisee de la passerelle : courte (jamais prolongee), recreee en
// silence tant que la session de la passerelle est valide (un compte desactive la-bas perd vite l'acces ici).
const BRIDGE_MS = 2 * 3600 * 1000;
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
  return u ? { id: u.id, name: u.name, login: u.login, role: u.role || 'user', createdAt: u.createdAt, passwordChangedAt: u.passwordChangedAt, mustChangePassword: !!u.mustChangePassword } : null;
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

  function openSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    db().sessions.push({ id: uid(), userId, hash: sha256(token), createdAt: now, lastSeen: now, device: deviceLabel(req.headers['user-agent']) });
    store.save();
    res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_DAYS * 86400));
  }

  // Session locale valide, sinon (si `res` est fourni) session courte ouverte pour l'utilisateur
  // authentifie par la passerelle. Compte local = meme identifiant ; aucun compte n'est cree.
  function currentSession(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token && db().users.length) {
      const h = sha256(token);
      const s = db().sessions.find((x) => x.hash === h);
      if (s && s.bridge && Date.now() - s.createdAt <= BRIDGE_MS) return s;
      if (s && !s.bridge && Date.now() - s.lastSeen <= SESSION_DAYS * 86400 * 1000) {
        if (Date.now() - s.lastSeen > 3600 * 1000) { s.lastSeen = Date.now(); store.save(); }
        return s;
      }
    }
    return res ? bridgeSession(req, res) : null;
  }

  function bridgeSession(req, res) {
    const id = bridge.identity(req);
    if (!id) return null;
    const u = bridge.matchLocal(id, db().users, { email: null, login: 'login' });
    if (!u) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const s = { id: uid(), userId: u.id, hash: sha256(token), createdAt: now, lastSeen: now, device: 'passerelle', bridge: true };
    db().sessions = db().sessions.filter((x) => !(x.bridge && now - x.createdAt > BRIDGE_MS));
    db().sessions.push(s);
    store.save();
    res.setHeader('Set-Cookie', cookieHeader(req, token, BRIDGE_MS / 1000));
    return s;
  }

  // Middleware : toutes les routes /api sauf /api/auth/* exigent une session.
  function requireAuth(req, res, next) {
    const s = currentSession(req, res);
    const u = s && db().users.find((x) => x.id === s.userId);
    if (!s || !u) return res.status(401).json({ error: db().users.length ? 'Session expirée, reconnectez-vous.' : 'Aucun compte : créez-le d\'abord.', setup: !db().users.length });
    req.session = s;
    req.user = u;
    next();
  }

  const r = express.Router();

  r.get('/auth/state', (req, res) => {
    const s = currentSession(req, res);
    res.json({
      setup: !db().users.length,
      setupTokenRequired: !db().users.length && !!process.env.MAINOTES_SETUP_TOKEN,
      user: s ? publicUser(db().users.find((x) => x.id === s.userId)) : null
    });
  });

  // Création du compte : possible une seule fois, tant qu'aucun compte n'existe.
  r.post('/auth/setup', (req, res) => {
    if (db().users.length) return res.status(409).json({ error: 'Un compte existe déjà. Connectez-vous.' });
    const { name, login, password, setupToken } = req.body || {};
    const expected = process.env.MAINOTES_SETUP_TOKEN;
    if (expected && setupToken !== expected) return res.status(403).json({ error: 'Code d\'installation incorrect.' });
    const err = checkLogin(login) || checkPassword(password);
    if (err) return res.status(400).json({ error: err });
    const now = Date.now();
    const user = {
      id: uid(),
      role: 'admin',
      defaultNotebook: '',
      name: String(name || '').trim().slice(0, 80) || String(login).trim(),
      login: String(login).trim(),
      password: hashPassword(password),
      createdAt: now,
      passwordChangedAt: now
    };
    db().users.push(user);
    store.seedStructure(user.id);
    openSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  });

  r.post('/auth/login', (req, res) => {
    const ip = req.ip;
    if (throttled(ip)) return res.status(429).json({ error: 'Trop d\'essais. Réessayez dans 15 minutes.' });
    const { login, password } = req.body || {};
    const u = db().users.find((x) => String(login || '').trim().toLowerCase() === x.login.toLowerCase());
    const ok = u && verifyPassword(password || '', u.password);
    if (!ok) {
      failed(ip);
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }
    attempts.delete(ip);
    openSession(req, res, u.id);
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
      user: publicUser(req.user),
      sessions: db().sessions.filter((s) => s.userId === req.user.id)
        .map((s) => ({ id: s.id, device: s.device, createdAt: s.createdAt, lastSeen: s.lastSeen, current: s === req.session }))
        .sort((a, b) => b.lastSeen - a.lastSeen)
    });
  });

  acc.patch('/account', (req, res) => {
    const u = req.user;
    const { name, login, currentPassword } = req.body || {};
    if (name !== undefined) u.name = String(name).trim().slice(0, 80) || u.name;
    if (login !== undefined && String(login).trim() !== u.login) {
      const err = checkLogin(login);
      if (err) return res.status(400).json({ error: err });
      if (!verifyPassword(currentPassword || '', u.password)) return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
      if (db().users.some((x) => x !== u && x.login.toLowerCase() === String(login).trim().toLowerCase())) return res.status(409).json({ error: 'Cet identifiant est déjà pris.' });
      u.login = String(login).trim();
    }
    store.save();
    res.json({ user: publicUser(u) });
  });

  acc.post('/account/password', (req, res) => {
    const u = req.user;
    const { current, next, logoutOthers } = req.body || {};
    if (!verifyPassword(current || '', u.password)) return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
    const err = checkPassword(next);
    if (err) return res.status(400).json({ error: err });
    u.password = hashPassword(next);
    u.passwordChangedAt = Date.now();
    u.mustChangePassword = false;
    if (logoutOthers !== false) db().sessions = db().sessions.filter((s) => s === req.session || s.userId !== u.id);
    store.save();
    res.json({ ok: true });
  });

  acc.delete('/account/sessions/:id', (req, res) => {
    db().sessions = db().sessions.filter((s) => s.id !== req.params.id || s === req.session || s.userId !== req.user.id);
    store.save();
    res.json({ ok: true });
  });

  acc.post('/account/sessions/revoke-others', (req, res) => {
    db().sessions = db().sessions.filter((s) => s === req.session || s.userId !== req.user.id);
    store.save();
    res.json({ ok: true });
  });

  // Suppression de son compte (RGPD) : notes, médias et compte de la personne. Pour
  // l'administrateur seul, c'est la suppression complète (réglages et clés compris) et
  // l'application revient à l'écran de création de compte ; s'il reste d'autres comptes,
  // il doit d'abord les supprimer ou passer le rôle à quelqu'un.
  acc.delete('/account', (req, res) => {
    const { password, confirm } = req.body || {};
    if (confirm !== 'SUPPRIMER') return res.status(400).json({ error: 'Tapez SUPPRIMER pour confirmer.' });
    if (!verifyPassword(password || '', req.user.password)) return res.status(403).json({ error: 'Mot de passe incorrect.' });
    const others = db().users.filter((u) => u !== req.user);
    if (!others.length) store.reset();
    else {
      if (req.user.role === 'admin' && !others.some((u) => u.role === 'admin')) return res.status(409).json({ error: 'Vous êtes le seul administrateur : nommez-en un autre avant de supprimer votre compte.' });
      store.removeUser(req.user.id);
      store.save();
    }
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
    res.json({ ok: true });
  });

  // ---------- Annuaire et gestion des utilisateurs ----------
  // Annuaire : nom et identifiant des autres comptes, pour choisir avec qui partager.
  acc.get('/directory', (req, res) => {
    res.json({ users: db().users.map((u) => ({ id: u.id, name: u.name, login: u.login })) });
  });
  const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Réservé à l\'administrateur.' }));
  acc.get('/users', adminOnly, (req, res) => {
    res.json({ users: db().users.map((u) => ({ ...publicUser(u), notes: db().notes.filter((n) => n.ownerId === u.id).length })) });
  });
  acc.post('/users', adminOnly, (req, res) => {
    const { name, login, password, role } = req.body || {};
    const err = checkLogin(login) || checkPassword(password);
    if (err) return res.status(400).json({ error: err });
    if (db().users.some((u) => u.login.toLowerCase() === String(login).trim().toLowerCase())) return res.status(409).json({ error: 'Cet identifiant est déjà pris.' });
    const now = Date.now();
    const user = { id: uid(), role: role === 'admin' ? 'admin' : 'user', defaultNotebook: '', name: String(name || '').trim().slice(0, 80) || String(login).trim(), login: String(login).trim(), password: hashPassword(password), createdAt: now, passwordChangedAt: now, mustChangePassword: true };
    db().users.push(user);
    store.seedStructure(user.id);
    store.save();
    res.json({ user: publicUser(user) });
  });
  acc.patch('/users/:id', adminOnly, (req, res) => {
    const u = store.user(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const { name, role, password } = req.body || {};
    if (name !== undefined) u.name = String(name).trim().slice(0, 80) || u.name;
    if (role !== undefined && ['admin', 'user'].includes(role) && role !== u.role) {
      if (u.role === 'admin' && !db().users.some((x) => x !== u && x.role === 'admin')) return res.status(409).json({ error: 'Il faut au moins un administrateur.' });
      u.role = role;
    }
    if (password !== undefined) {
      const err = checkPassword(password);
      if (err) return res.status(400).json({ error: err });
      u.password = hashPassword(password);
      u.passwordChangedAt = Date.now();
      u.mustChangePassword = u !== req.user;
      db().sessions = db().sessions.filter((s) => s.userId !== u.id || s === req.session);
    }
    store.save();
    res.json({ user: publicUser(u) });
  });
  acc.delete('/users/:id', adminOnly, (req, res) => {
    const u = store.user(req.params.id);
    if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (u === req.user) return res.status(409).json({ error: 'Pour supprimer votre propre compte, utilisez l\'onglet Compte.' });
    store.removeUser(u.id);
    store.save();
    res.json({ ok: true });
  });

  return { router: r, accountRouter: acc, requireAuth };
};

module.exports.MIN_PASSWORD = MIN_PASSWORD;
