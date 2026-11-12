// Notifications à la date d'une note ou d'une tâche : sélection, une fois par jour, nettoyage des abonnements.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');
const createPush = require('../lib/push');

test('résumé du jour : tâches et notes dues, une seule fois par jour, abonnement expiré retiré', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-push-'));
  const store = new Store(dir);
  const sent = [];
  let fail410 = false;
  const push = createPush(store, { sender: async (sub, payload) => { if (fail410 && sub.endpoint.endsWith('/old')) { const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push({ sub, payload: JSON.parse(payload) }); } });
  const now = new Date('2026-11-17T09:30:00+01:00').getTime();
  const today = push.brussels(now).date;
  assert.strictEqual(today, '2026-11-17');
  const mk = (id, name) => ({ id, name, login: id, role: id === 'a' ? 'admin' : 'user', password: 'x', createdAt: 1 });
  store.db.users.push(mk('a', 'Alice'), mk('b', 'Bob'));
  const note = (id, owner, extra) => ({ id, ownerId: owner, shares: [], type: 'text', title: id, todos: [], tagIds: [], media: [], notebookId: null, ...extra });
  store.db.notes.push(
    note('courses', 'a', { title: 'Liste de courses', due: today, shares: [{ userId: 'b', role: 'edit' }], todos: [
      { id: 't1', text: 'Pain', done: false, due: null, assignee: null },
      { id: 't2', text: 'Oeufs', done: true, due: null, assignee: null },
      { id: 't3', text: 'Confiture pour Bob', done: false, due: null, assignee: 'b' }] }),
    note('rdv', 'a', { title: 'Rendez-vous dentiste', due: today }),
    note('demain', 'a', { title: 'Pas aujourd\'hui', due: '2026-11-18' }),
    note('corbeille', 'a', { title: 'Supprimée', due: today, trashedAt: 1 }),
    note('privee', 'b', { title: 'Privée de Bob', due: today }));
  const subA = { endpoint: 'https://push.example/a', keys: { p256dh: 'k', auth: 'a' } };
  const subOld = { endpoint: 'https://push.example/old', keys: { p256dh: 'k', auth: 'a' } };
  assert.ok(push.subscribe(store.db.users[0], subA, 'Chrome'));
  assert.ok(push.subscribe(store.db.users[0], subOld, 'Vieux téléphone'));
  assert.ok(push.subscribe(store.db.users[1], { endpoint: 'https://push.example/b', keys: { p256dh: 'k', auth: 'a' } }, 'Firefox'));
  assert.ok(!push.subscribe(store.db.users[0], { endpoint: 'http://non-https', keys: { p256dh: 'k', auth: 'a' } }), 'abonnement non sécurisé refusé');

  // Avant l'heure choisie (8 h par défaut) : rien.
  assert.strictEqual(await push.runDue(new Date('2026-11-17T07:00:00+01:00').getTime()), 0);
  fail410 = true;
  assert.strictEqual(await push.runDue(now), 2, 'un envoi pour Alice (appareil valide) et un pour Bob');
  const alice = sent.find((s) => s.sub.endpoint.endsWith('/a')).payload;
  assert.match(alice.body, /1 tâche : Pain/, 'Alice : la tâche non assignée, pas celle de Bob ni la tâche cochée');
  assert.match(alice.body, /Notes? : Rendez-vous dentiste/, 'note datée sans tâches ouvertes');
  assert.ok(!/corbeille|Supprimée|Pas aujourd/.test(alice.body));
  const bob = sent.find((s) => s.sub.endpoint.endsWith('/b')).payload;
  assert.match(bob.body, /2 tâches : (Pain, Confiture pour Bob|Confiture pour Bob, Pain)/, 'Bob : non assignée + assignée à lui');
  assert.ok(!/Privée de Bob/.test(alice.body), 'les notes privées des autres ne sont pas annoncées');
  assert.strictEqual(store.db.users[0].pushSubs.length, 1, 'abonnement expiré (410) retiré');
  // Une seule fois par jour.
  assert.strictEqual(await push.runDue(now + 3600e3), 0);
  // Le lendemain, l'envoi reprend ; désactivé, plus rien.
  store.db.users[1].notify = { enabled: false, hour: 8 };
  store.db.notes.find((n) => n.id === 'demain').due = '2026-11-18';
  assert.strictEqual(await push.runDue(new Date('2026-11-18T08:00:00+01:00').getTime()), 1, 'Alice seulement : Bob a désactivé');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rappels à l\'heure : une fois, délai avant, heure d\'été, hors résumé du matin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-rem-'));
  const store = new Store(dir);
  const sent = [];
  const push = createPush(store, { sender: async (sub, payload) => { sent.push(JSON.parse(payload)); } });
  // Heure belge → UTC : hiver (+1) et été (+2).
  assert.strictEqual(new Date(push.brusselsToMs('2026-11-17', '14:00')).toISOString(), '2026-11-17T13:00:00.000Z');
  assert.strictEqual(new Date(push.brusselsToMs('2026-07-01', '14:00')).toISOString(), '2026-07-01T12:00:00.000Z');
  store.db.users.push({ id: 'a', name: 'Alice', login: 'a', role: 'admin', password: 'x', createdAt: 1, notify: { enabled: true, hour: 8, lead: 60 } });
  push.subscribe(store.db.users[0], { endpoint: 'https://push.example/a', keys: { p256dh: 'k', auth: 'a' } }, 'x');
  store.db.notes.push({ id: 'n', ownerId: 'a', shares: [], type: 'text', title: 'Rendez-vous dentiste', due: '2026-11-17', dueTime: '14:00', todos: [{ id: 't', text: 'Prendre la carte', done: false, due: null, time: null }, { id: 'u', text: 'Appeler avant', done: false, due: null, time: '10:00' }], tagIds: [], media: [], notebookId: null });
  // Le résumé du matin ne reprend pas ce qui a une heure.
  const due = push.dueFor('a', '2026-11-17');
  assert.deepStrictEqual([due.tasks.length, due.notes.length], [0, 0]);
  const at = (hhmm) => new Date(`2026-11-17T${hhmm}:00+01:00`).getTime();
  assert.strictEqual(await push.runReminders(at('08:30')), 0, 'trop tôt');
  assert.strictEqual(await push.runReminders(at('09:05')), 1, '10 h − 1 h : rappel « Appeler avant »');
  assert.match(sent[0].title, /^À 10 h · Rendez-vous dentiste/);
  assert.match(sent[0].body, /Appeler avant/);
  assert.strictEqual(await push.runReminders(at('09:30')), 0, 'une seule fois');
  assert.strictEqual(await push.runReminders(at('13:10')), 1, '14 h − 1 h : « Prendre la carte »');
  assert.match(sent[1].body, /Prendre la carte/);
  assert.strictEqual(await push.runReminders(at('15:30')), 0, 'trop tard : plus de rappel');
  store.db.users[0].notify.lead = 0;
  store.db.users[0].sentRem = {};
  assert.strictEqual(await push.runReminders(at('13:00')), 0, 'délai 0 : pas avant l\'heure');
  assert.strictEqual(await push.runReminders(at('14:00')), 1, 'délai 0 : à l\'heure');
  fs.rmSync(dir, { recursive: true, force: true });
});
