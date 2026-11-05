// Toutes les routes /api. Les routes metier vont dans lib/<domaine>.js (un fichier par domaine).
const express = require('express');
const auth = require('./auth');
const { db, tx } = require('./db');
const { httpError, str, asyncHandler } = require('./util');

const email = (v) => {
  const e = str(v, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw httpError(400, 'Adresse e-mail invalide.');
  return e;
};

function router() {
  const r = express.Router();
  const member = (id) => db.prepare('SELECT id, name, email, is_admin AS isAdmin FROM members WHERE id = ?').get(id);

  // ---------- Comptes ----------
  r.get('/auth/state', (req, res) => res.json({ setup: !auth.hasAccount(), user: req.user || null }));

  // Premier compte : libre, devient administrateur (une seule fois).
  r.post('/auth/setup', asyncHandler(async (req, res) => {
    if (auth.hasAccount()) throw httpError(409, 'Un compte existe déjà. Connectez-vous.');
    const b = req.body || {};
    const e = email(b.email);
    const hash = await auth.hashPassword(b.password);
    const id = Number(db.prepare('INSERT INTO members (name, email, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)').run(str(b.name, 80) || e, e, hash, Date.now()).lastInsertRowid);
    auth.createSession(req, res, id);
    res.json({ ok: true });
  }));

  // Adresse reservee par une invitation (pour pre-remplir l'ecran d'inscription).
  r.get('/auth/invite', (req, res) => { const i = auth.findInvitation(req.query.token); res.json({ email: i.email }); });

  r.post('/auth/register', asyncHandler(async (req, res) => {
    const b = req.body || {};
    const inv = auth.findInvitation(b.invite);
    const e = email(b.email || inv.email);
    if (inv.email && inv.email.toLowerCase() !== e) throw httpError(400, 'Cette invitation est réservée à une autre adresse.');
    if (db.prepare('SELECT 1 FROM members WHERE email = ?').get(e)) throw httpError(409, 'Un compte existe déjà avec cette adresse.');
    const hash = await auth.hashPassword(b.password);
    const id = tx(() => {
      auth.useInvitation(b.invite);
      return Number(db.prepare('INSERT INTO members (name, email, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)').run(str(b.name, 80) || e, e, hash, inv.is_admin, Date.now()).lastInsertRowid);
    });
    auth.createSession(req, res, id);
    res.json({ ok: true });
  }));

  r.post('/auth/login', asyncHandler(async (req, res) => {
    const b = req.body || {};
    const e = str(b.email, 200).toLowerCase();
    if (auth.blocked(e)) throw httpError(429, 'Trop d’échecs, réessayez dans quelques minutes.');
    const m = db.prepare('SELECT id, password_hash FROM members WHERE email = ?').get(e);
    if (!(await auth.verifyPassword(b.password, m && m.password_hash))) {
      auth.recordFailure(e);
      await new Promise((t) => setTimeout(t, auth.failureDelay()));
      throw httpError(401, 'Adresse ou mot de passe incorrect.');
    }
    auth.failures.clear();
    auth.createSession(req, res, m.id);
    res.json({ ok: true });
  }));

  r.post('/auth/logout', (req, res) => { auth.destroySession(req, res); res.json({ ok: true }); });

  // Tout ce qui suit exige une session.
  r.use(auth.requireAuth);
  /* @module-routes */

  r.get('/me', (req, res) => res.json(member(req.user.id)));
  r.post('/account/password', asyncHandler(async (req, res) => {
    const b = req.body || {};
    const m = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(req.user.id);
    if (!(await auth.verifyPassword(b.current, m.password_hash))) throw httpError(403, 'Mot de passe actuel incorrect.');
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(await auth.hashPassword(b.password), req.user.id);
    res.json({ ok: true });
  }));

  // ---------- Administration des membres ----------
  r.get('/members', auth.admin, (req, res) => res.json(db.prepare('SELECT id, name, email, is_admin AS isAdmin FROM members ORDER BY id').all()));
  r.post('/invitations', auth.admin, (req, res) => {
    const b = req.body || {};
    const token = auth.createInvitation({ email: b.email ? email(b.email) : null, isAdmin: !!b.admin, invitedBy: req.user.id });
    res.json({ url: `${auth.publicUrl(req)}/?invite=${token}` });
  });
  r.delete('/members/:id', auth.admin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw httpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
    db.prepare('DELETE FROM members WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ---------- Exemple de ressource partagee (a remplacer) ----------
  r.get('/items', (req, res) => res.json(db.prepare('SELECT id, title, done FROM items ORDER BY id DESC').all()));
  r.post('/items', (req, res) => {
    const title = str((req.body || {}).title, 200);
    if (!title) throw httpError(400, 'Titre requis.');
    const info = db.prepare('INSERT INTO items (title, created_by, created_at) VALUES (?, ?, ?)').run(title, req.user.id, Date.now());
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
