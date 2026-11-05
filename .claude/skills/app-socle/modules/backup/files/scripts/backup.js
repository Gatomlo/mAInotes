// Sauvegarde coherente de la base dans data/backups/__SLUG__-AAAA-MM-JJ.db (30 plus recentes gardees).
// A lancer chaque jour : npm run backup
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('../lib/db');

const dir = path.join(DATA_DIR, 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `__SLUG__-${new Date().toISOString().slice(0, 10)}.db`);
if (fs.existsSync(file)) fs.rmSync(file);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
fs.readdirSync(dir).filter((f) => /^__SLUG__-.*\.db$/.test(f)).sort().slice(0, -30).forEach((f) => fs.rmSync(path.join(dir, f)));
console.log(`Sauvegarde : ${file}`);
