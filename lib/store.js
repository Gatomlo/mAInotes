// Stockage des données dans un fichier JSON (un seul utilisateur, quelques milliers
// de notes au plus). Aucune dépendance native : l'hébergement mutualisé Infomaniak ne
// garantit pas la compilation de modules comme better-sqlite3. Les médias sont des
// fichiers à part dans data/media/.
//
// Écriture atomique (fichier temporaire puis renommage) et sérialisée : une écriture
// interrompue ne peut pas corrompre db.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  maxVoiceSec: 120,
  maxImageMb: 8,
  reduceImage: true,
  providers: { classif: 'infomaniak', transcr: 'infomaniak', vision: 'infomaniak', synth: 'infomaniak', enrich: 'infomaniak' },
  trigger: { classif: 'auto', transcr: 'auto', vision: 'demand', enrich: 'demand' },
  recours: 'never',
  propose: { notebook: false, tag: false },
  defaultNotebook: '',
  budgets: { infomaniak: 10, gemini: 0, claude: 0 },
  enabled: { infomaniak: true, gemini: false, claude: false },
  models: {
    infomaniak: { chat: 'mistral24b', vision: 'mistral24b', audio: 'whisper' },
    gemini: { chat: 'gemini-3.5-flash-lite', vision: 'gemini-3.5-flash-lite', audio: 'gemini-3.5-flash-lite' },
    claude: { chat: 'claude-haiku-5-5', vision: 'claude-haiku-5-5' }
  },
  infomaniak: { productId: '', baseUrl: 'https://api.infomaniak.com/2/ai/{product_id}/openai/v1' },
  synthMaxNotes: 200,
  synthMaxWords: 30000,
  historyMax: 30,
  context: ''
};

const SEED_NOTEBOOKS = [
  { name: 'Travail', desc: 'Réunions, projets, échanges professionnels', color: 'blue' },
  { name: 'Maison', desc: 'Travaux, rendez-vous, vie quotidienne', color: 'amber' },
  { name: 'Idées', desc: 'Projets, inspirations, envies', color: 'purple' },
  { name: 'Administratif', desc: 'Factures, courriers, démarches', color: 'rose' }
];
const SEED_TAGS = ['devis', 'réunion', 'facture', 'inspiration', 'à rappeler'];

const uid = () => crypto.randomBytes(9).toString('base64url');

function emptyDb() {
  return {
    version: 1,
    user: null,
    sessions: [],
    notebooks: [],
    tags: [],
    notes: [],
    retris: [],
    syntheses: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    keys: {},
    usage: {},
    log: [],
    modelLists: {}
  };
}

// Modèles retirés par les fournisseurs : remplacés au chargement s'ils n'ont pas été
// choisis autrement par l'utilisateur.
const RETIRED_MODELS = {
  gemini: { 'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite' }
};

function migrateModels(settings) {
  for (const provider of Object.keys(RETIRED_MODELS)) {
    const models = settings.models && settings.models[provider];
    if (!models) continue;
    for (const k of Object.keys(models)) {
      const next = RETIRED_MODELS[provider][models[k]];
      if (next) models[k] = next;
    }
  }
}

// Complète les réglages d'une base existante avec les nouvelles valeurs par défaut.
function mergeDefaults(target, defaults) {
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    if (target[k] === undefined) target[k] = JSON.parse(JSON.stringify(d));
    else if (d && typeof d === 'object' && !Array.isArray(d) && typeof target[k] === 'object') mergeDefaults(target[k], d);
  }
  return target;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.mediaDir = path.join(dir, 'media');
    fs.mkdirSync(this.mediaDir, { recursive: true });
    this.db = this._load();
  }

  _load() {
    for (const f of [this.file, this.file + '.bak']) {
      if (!fs.existsSync(f)) continue;
      try {
        const db = JSON.parse(fs.readFileSync(f, 'utf8'));
        const base = emptyDb();
        for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k];
        mergeDefaults(db.settings, DEFAULT_SETTINGS);
        migrateModels(db.settings);
        return db;
      } catch (e) {
        console.error(`mAInotes : ${f} illisible (${e.message}), essai de la sauvegarde.`);
      }
    }
    return emptyDb();
  }

  // Écrit immédiatement (synchrone) : appelé après chaque modification. Le volume reste
  // petit pour un seul utilisateur ; la simplicité prime.
  save() {
    const tmp = this.file + '.tmp';
    const data = JSON.stringify(this.db);
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    if (fs.existsSync(this.file)) {
      try { fs.copyFileSync(this.file, this.file + '.bak'); } catch (e) { /* sauvegarde facultative */ }
    }
    fs.renameSync(tmp, this.file);
  }

  // Remet la base à zéro (suppression du compte) en gardant le fichier secret.
  reset() {
    this.db = emptyDb();
    fs.rmSync(this.mediaDir, { recursive: true, force: true });
    fs.mkdirSync(this.mediaDir, { recursive: true });
    this.save();
  }

  seedStructure() {
    const db = this.db;
    if (db.notebooks.length || db.tags.length) return;
    db.notebooks = SEED_NOTEBOOKS.map((n, i) => ({ id: uid(), ...n, order: i }));
    db.tags = SEED_TAGS.map((name) => ({ id: uid(), name, desc: '' }));
  }

  notebook(id) { return this.db.notebooks.find((n) => n.id === id) || null; }
  tag(id) { return this.db.tags.find((t) => t.id === id) || null; }
  note(id) { return this.db.notes.find((n) => n.id === id) || null; }

  mediaPath(file) {
    const safe = path.basename(file);
    return path.join(this.mediaDir, safe);
  }
}

module.exports = { Store, uid, DEFAULT_SETTINGS };
