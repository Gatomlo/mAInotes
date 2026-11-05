// Notifications sur le telephone (Web Push). Cles VAPID creees au premier usage, gardees en
// base (settings « vapid »). Abonnement refuse par le service (404/410) = supprime.
// __ENV___PUSH=log : rien n'est envoye, messages gardes dans `outbox` (tests).
const webpush = require('web-push');
const { db, getSetting, setSetting } = require('./db');
const { httpError } = require('./util');

const outbox = [];

function keys() {
  const saved = getSetting('vapid');
  if (saved) return JSON.parse(saved);
  const k = webpush.generateVAPIDKeys();
  setSetting('vapid', JSON.stringify(k));
  return k;
}

function subscribe(sub) {
  const endpoint = String((sub && sub.endpoint) || '');
  const k = (sub && sub.keys) || {};
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !k.p256dh || !k.auth) throw httpError(400, 'Abonnement invalide.');
  db.prepare(`INSERT INTO push_subs (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(endpoint, String(k.p256dh).slice(0, 200), String(k.auth).slice(0, 100), Date.now());
}

// payload : { title, body, url } (url = '#/...', ouverte dans l'app au toucher).
async function sendAll(payload) {
  const subs = db.prepare('SELECT * FROM push_subs').all();
  if (!subs.length) return;
  if (process.env.__ENV___PUSH === 'log') { outbox.push(payload); return; }
  const k = keys();
  const opts = { TTL: 3 * 24 * 3600, vapidDetails: { subject: process.env.__ENV___PUSH_CONTACT || 'mailto:__SLUG__@localhost', publicKey: k.publicKey, privateKey: k.privateKey } };
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), opts);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE id = ?').run(s.id);
      else console.error('Notification non envoyée', e.statusCode || e.message);
    }
  }));
}

// Routes (derriere la session) : GET push/key, POST push/subscribe, DELETE push/subscribe.
function routes(r) {
  r.get('/push/key', (req, res) => res.json({ key: keys().publicKey }));
  r.post('/push/subscribe', (req, res) => { subscribe(req.body); res.json({ ok: true }); });
  r.delete('/push/subscribe', (req, res) => {
    db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(String((req.body || {}).endpoint || ''));
    res.json({ ok: true });
  });
}

module.exports = { sendAll, subscribe, routes, outbox };
