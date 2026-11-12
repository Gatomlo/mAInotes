// Notifications à la date d'une note ou d'une tâche (Web Push, appli fermée comprise).
// Une seule notification par jour et par personne, à l'heure choisie : un résumé des tâches
// à faire ce jour-là et des notes dont la date limite tombe ce jour-là. Aucun appel IA.
// `web-push` est chargé à la demande : s'il manque (npm install pas relancé), seules les
// notifications sont indisponibles, l'application démarre normalement.
let webpushLib = null;
const webpush = () => webpushLib || (webpushLib = require('web-push'));
const createAccess = require('./access');

const TZ = 'Europe/Brussels';
const MAX_DEVICES = 8;

// Date (AAAA-MM-JJ) et heure en Belgique, pour comparer aux échéances.
function brussels(t) {
  const o = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t || Date.now())).forEach((x) => { o[x.type] = x.value; });
  return { date: `${o.year}-${o.month}-${o.day}`, hour: Number(o.hour) };
}

// `sender` est remplaçable (tests) ; par défaut, l'envoi réel via web-push.
module.exports = function createPush(store, { sender } = {}) {
  const db = () => store.db;
  const access = createAccess(store);

  // Clés VAPID : créées une fois, gardées dans la base (la clé privée ne quitte jamais le serveur).
  function keys() {
    if (!db().push || !db().push.publicKey) {
      db().push = webpush().generateVAPIDKeys();
      store.save();
    }
    return db().push;
  }
  const send = sender || ((sub, payload) => {
    const k = keys();
    return webpush().sendNotification(sub, payload, {
      vapidDetails: { subject: 'mailto:notifications@mainotes.invalid', publicKey: k.publicKey, privateKey: k.privateKey },
      TTL: 6 * 3600
    });
  });

  const settingsOf = (u) => {
    const n = u.notify || {};
    return { enabled: n.enabled !== false, hour: Number.isInteger(n.hour) && n.hour >= 0 && n.hour <= 23 ? n.hour : 8 };
  };

  // Ce qui est dû ce jour-là pour une personne : ses tâches (assignées à elle, ou non
  // assignées sur une note qu'elle voit) et les notes dont la date limite est ce jour-là.
  function dueFor(userId, date) {
    const tasks = [], notes = [];
    for (const n of access.visibleNotes(userId)) {
      if (n.trashedAt || n.type === 'synthesis') continue;
      for (const t of n.todos || []) {
        const due = t.due || n.due;
        if (t.done || due !== date) continue;
        if (t.assignee ? t.assignee === userId : true) tasks.push({ text: t.text, note: n.title });
      }
      const open = (n.todos || []).some((t) => !t.done);
      // Une note dont la date vient de ses tâches ne double pas la liste des tâches.
      if (n.due === date && (!(n.todos || []).length || !open)) notes.push(n.title);
    }
    return { tasks, notes };
  }

  function payloadFor(date, due) {
    const parts = [];
    if (due.tasks.length) parts.push(`${due.tasks.length} tâche${due.tasks.length > 1 ? 's' : ''} : ` + due.tasks.slice(0, 3).map((t) => t.text).join(', ') + (due.tasks.length > 3 ? '…' : ''));
    if (due.notes.length) parts.push(`${due.notes.length > 1 ? 'Notes' : 'Note'} : ` + due.notes.slice(0, 2).join(', ') + (due.notes.length > 2 ? '…' : ''));
    return JSON.stringify({ title: 'mAInotes · à faire aujourd\'hui', body: parts.join(' — '), tag: 'due-' + date, tasks: due.tasks.length > 0 });
  }

  // Envoie le résumé du jour aux personnes concernées, une fois par jour, à partir de leur heure.
  async function runDue(now) {
    const { date, hour } = brussels(now);
    let sent = 0;
    for (const u of db().users.slice()) {
      const s = settingsOf(u);
      if (!s.enabled || !(u.pushSubs || []).length || hour < s.hour || u.lastDigest === date) continue;
      const due = dueFor(u.id, date);
      u.lastDigest = date;
      store.save();
      if (!due.tasks.length && !due.notes.length) continue;
      const payload = payloadFor(date, due);
      for (const sub of (u.pushSubs || []).slice()) {
        try {
          await send(sub, payload);
          sent++;
        } catch (err) {
          // Abonnement expiré ou révoqué par le navigateur : on l'oublie.
          if (err && (err.statusCode === 404 || err.statusCode === 410)) { u.pushSubs = u.pushSubs.filter((x) => x.endpoint !== sub.endpoint); store.save(); }
        }
      }
    }
    return sent;
  }

  function subscribe(u, sub, device) {
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
    u.pushSubs = (u.pushSubs || []).filter((x) => x.endpoint !== sub.endpoint);
    u.pushSubs.push({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, device: String(device || '').slice(0, 60), createdAt: Date.now() });
    u.pushSubs = u.pushSubs.slice(-MAX_DEVICES);
    store.save();
    return true;
  }
  function unsubscribe(u, endpoint) {
    u.pushSubs = (u.pushSubs || []).filter((x) => x.endpoint !== endpoint);
    store.save();
  }
  async function test(u) {
    let ok = 0;
    for (const sub of (u.pushSubs || []).slice()) {
      try { await send(sub, JSON.stringify({ title: 'mAInotes', body: 'Les notifications fonctionnent sur cet appareil.', tag: 'test' })); ok++; } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) u.pushSubs = u.pushSubs.filter((x) => x.endpoint !== sub.endpoint);
      }
    }
    store.save();
    return ok;
  }

  let timer = null;
  function start() {
    if (timer) return;
    timer = setInterval(() => runDue().catch((e) => console.error('mAInotes notifications :', e.message)), 60 * 1000);
    if (timer.unref) timer.unref();
  }
  return { keys, settingsOf, runDue, dueFor, subscribe, unsubscribe, test, start, brussels };
};
