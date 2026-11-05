// Toutes les routes /api. Les routes metier vont dans lib/<domaine>.js (un fichier par domaine).
const express = require('express');
const auth = require('./auth');
const { db } = require('./db');
const { httpError, str, asyncHandler } = require('./util');

function router() {
  const r = express.Router();

  // ---------- Compte ----------
  r.get('/auth/state', (req, res) => res.json({ setup: !auth.hasAccount(), setupToken: !auth.hasAccount() && !!auth.setupToken(), user: req.user || null }));

  r.post('/auth/setup', asyncHandler(async (req, res) => {
    if (auth.hasAccount()) throw httpError(409, 'Un compte existe déjà. Connectez-vous.');
    const b = req.body || {};
    if (auth.setupToken() && b.setupToken !== auth.setupToken()) throw httpError(403, 'Code d’installation incorrect.');
    const login = str(b.login, 120);
    if (login.length < 3) throw httpError(400, 'Identifiant trop court (3 caractères minimum).');
    const hash = await auth.hashPassword(b.password);
    db.prepare('INSERT INTO account (id, name, login, password_hash, created_at) VALUES (1, ?, ?, ?, ?)').run(str(b.name, 80) || login, login, hash, Date.now());
    auth.createSession(req, res);
    res.json({ ok: true });
  }));

  r.post('/auth/login', asyncHandler(async (req, res) => {
    if (auth.blocked()) throw httpError(429, 'Trop d’échecs, réessayez dans quelques minutes.');
    const a = db.prepare('SELECT login, password_hash FROM account').get();
    const b = req.body || {};
    const ok = await auth.verifyPassword(b.password, a && a.password_hash) && a.login.toLowerCase() === str(b.login, 120).toLowerCase();
    if (!ok) {
      auth.recordFailure();
      await new Promise((t) => setTimeout(t, auth.failureDelay()));
      throw httpError(401, 'Identifiant ou mot de passe incorrect.');
    }
    auth.failures.clear();
    auth.createSession(req, res);
    res.json({ ok: true });
  }));

  r.post('/auth/logout', (req, res) => { auth.destroySession(req, res); res.json({ ok: true }); });

  // Tout ce qui suit exige une session.
  r.use(auth.requireAuth);
  /* @module-routes */

  r.post('/account/password', asyncHandler(async (req, res) => {
    const b = req.body || {};
    const a = db.prepare('SELECT password_hash FROM account').get();
    if (!(await auth.verifyPassword(b.current, a.password_hash))) throw httpError(403, 'Mot de passe actuel incorrect.');
    db.prepare('UPDATE account SET password_hash = ?').run(await auth.hashPassword(b.password));
    res.json({ ok: true });
  }));

  // ---------- Exemple de ressource (a remplacer) ----------
  r.get('/items', (req, res) => res.json(db.prepare('SELECT id, title, done FROM items ORDER BY id DESC').all()));
  r.post('/items', (req, res) => {
    const title = str((req.body || {}).title, 200);
    if (!title) throw httpError(400, 'Titre requis.');
    const info = db.prepare('INSERT INTO items (title, created_at) VALUES (?, ?)').run(title, Date.now());
    res.status(201).json({ id: Number(info.lastInsertRowid), title, done: 0 });
  });
  r.patch('/items/:id', (req, res) => {
    db.prepare('UPDATE items SET done = ? WHERE id = ?').run((req.body || {}).done ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });
  r.delete('/items/:id', (req, res) => { db.prepare('DELETE FROM items WHERE id = ?').run(Number(req.params.id)); res.json({ ok: true }); });

  return r;
}

module.exports = { router };
