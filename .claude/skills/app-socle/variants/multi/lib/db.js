// Base SQLite unique data/__SLUG__.db (node:sqlite, integre a Node >= 22.5 : aucun module
// natif a compiler sur l'hebergement). __ENV___DATA_DIR change le dossier (tests).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.__ENV___DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const conn = new DatabaseSync(path.join(DATA_DIR, '__SLUG__.db'));
conn.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

const statements = new Map();
const db = {
  prepare(sql) {
    let st = statements.get(sql);
    if (!st) { st = conn.prepare(sql); statements.set(sql, st); }
    return st;
  },
  exec: (sql) => conn.exec(sql),
};

// Transaction ; une transaction deja ouverte est reutilisee.
let depth = 0;
function tx(fn) {
  if (depth) return fn();
  conn.exec('BEGIN IMMEDIATE');
  depth++;
  try { const r = fn(); conn.exec('COMMIT'); return r; }
  catch (err) { conn.exec('ROLLBACK'); throw err; }
  finally { depth--; }
}

// Chaque entree n'est jouee qu'une fois (PRAGMA user_version). Ne JAMAIS modifier une
// entree deja deployee : en ajouter une nouvelle.
const MIGRATIONS = [
  `CREATE TABLE members (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
     device TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
   );
   -- Invitation a rejoindre l'app (lien a transmettre a la main). email NULL = ouverte a n'importe qui.
   CREATE TABLE invitations (
     token_hash TEXT PRIMARY KEY,
     email TEXT COLLATE NOCASE,
     is_admin INTEGER NOT NULL DEFAULT 0,
     invited_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
     expires_at INTEGER NOT NULL,
     used_at INTEGER
   );
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
   CREATE TABLE items (
     id INTEGER PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
     created_by INTEGER REFERENCES members(id) ON DELETE SET NULL, created_at INTEGER NOT NULL
   );`,
];

const current = conn.prepare('PRAGMA user_version').get().user_version;
MIGRATIONS.slice(current).forEach((sql, i) => {
  tx(() => { conn.exec(sql); conn.exec(`PRAGMA user_version = ${current + i + 1}`); });
});

const getSetting = (k) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value || null;
const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

module.exports = { db, tx, getSetting, setSetting, DATA_DIR };
