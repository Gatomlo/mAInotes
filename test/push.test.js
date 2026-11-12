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
