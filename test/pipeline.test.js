// Nettoyage de la dictée : local (gratuit) et par l'IA dans l'appel de classement, avec retour à l'original.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');
const createPipeline = require('../lib/pipeline');
const { cleanSpeech } = require('../lib/speech');

test('nettoyage local : hésitations retirées, espaces et majuscules', () => {
  assert.strictEqual(cleanSpeech('Alors, est-ce que tu pourrais prévoir une liste pour euh mardi prochain ? Il me faut euh un pain.'), 'Alors, est-ce que tu pourrais prévoir une liste pour mardi prochain ? Il me faut un pain.');
  assert.strictEqual(cleanSpeech('euh bonjour, hum, je voulais euh... dire que'), 'Bonjour, je voulais... dire que');
  assert.strictEqual(cleanSpeech('Un texte propre.'), 'Un texte propre.');
});

test('dictée nettoyée par l\'IA dans le même appel, original gardé ; une seule fois ; jamais si transcription corrigée à la main', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainotes-pipe-'));
  const store = new Store(dir);
  store.db.users.push({ id: 'u', name: 'Moi', login: 'moi', role: 'admin', password: 'x', createdAt: 1 });
  const prompts = [];
  const ai = { call: async (fn, kind, req) => { prompts.push(req.prompt); return { text: JSON.stringify({ titre: 'Courses', carnet: null, tags: [], confiance: 0.9, texte_propre: 'Liste de courses pour mardi : un pain.' }), provider: 'fake' }; } };
  const pipeline = createPipeline(store, ai);
  const mk = (id, extra) => { const n = { id, ownerId: 'u', shares: [], type: 'voice', title: id, content: '', transcript: 'Alors euh voici ma liste, un pain.', description: '', status: 'pending', media: [], links: [], todos: [], tagIds: [], notebookId: null, createdAt: 1, updatedAt: 1, ...extra }; store.db.notes.push(n); return n; };
  const wait = async (n) => { for (let i = 0; i < 50 && n.status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 50)); assert.strictEqual(n.status, 'ready'); };

  const a = mk('a');
  pipeline.schedule(a, { force: true });
  await wait(a);
  assert.match(prompts[0], /texte_propre/);
  assert.strictEqual(a.transcript, 'Liste de courses pour mardi : un pain.');
  assert.strictEqual(a.transcriptRaw, 'Alors euh voici ma liste, un pain.');
  assert.strictEqual(a.cleanedAi, true);
  // Une seule fois : un nouveau classement ne redemande pas le nettoyage.
  prompts.length = 0;
  pipeline.schedule(a, { force: true });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!/texte_propre/.test(prompts[0] || ''), 'pas de second nettoyage');
  // Transcription corrigée à la main : jamais touchée.
  const b = mk('b', { transcriptEdited: true });
  prompts.length = 0;
  pipeline.schedule(b, { force: true });
  await wait(b);
  assert.ok(!/texte_propre/.test(prompts[0]));
  assert.strictEqual(b.transcript, 'Alors euh voici ma liste, un pain.');
  // Réglage désactivé : pas de champ demandé.
  store.db.settings.trigger.clean = 'off';
  const c = mk('c');
  prompts.length = 0;
  pipeline.schedule(c, { force: true });
  await wait(c);
  assert.ok(!/texte_propre/.test(prompts[0]));
  fs.rmSync(dir, { recursive: true, force: true });
});
