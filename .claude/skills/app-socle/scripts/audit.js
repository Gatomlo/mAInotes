#!/usr/bin/env node
// Audit statique d'une app de la famille (mode « améliorer »). Aucune dependance.
// Usage : node audit.js [dossier-projet] [--test]   (--test lance aussi npm test)
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const out = [];
const add = (level, msg) => out.push({ level, msg });
const exists = (...p) => fs.existsSync(path.join(dir, ...p));
const read = (...p) => (exists(...p) ? fs.readFileSync(path.join(dir, ...p), 'utf8') : '');
const walk = (d, ok) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return ['node_modules', '.git', 'data', 'vendor'].includes(e.name) ? [] : walk(p, ok);
  return ok(p) ? [p] : [];
}) : [];

// --- package.json / entree
let pkg = {};
try { pkg = JSON.parse(read('package.json')); } catch { add('ko', 'package.json absent ou invalide'); }
const main = [pkg.main, 'server.js', 'src/server.js', 'server/index.js'].filter(Boolean).find((f) => exists(f));
if (!main) add('ko', 'fichier d\'entrée introuvable (server.js)');
else {
  const s = read(main);
  /module\.exports\s*=/.test(s) ? add('ok', `${main} exporte l'app`) : add('ko', `${main} : pas de module.exports = app (non montable dans node-gateway)`);
  /require\.main\s*===\s*module/.test(s) ? add('ok', 'listen protégé par require.main === module') : add('ko', 'listen non protégé par require.main === module');
  /app\.listen\(/.test(s) && !/require\.main/.test(s) && add('ko', 'app.listen() appelé sans condition');
}
pkg.scripts && pkg.scripts.test ? add('ok', 'script npm test présent') : add('ko', 'script npm test manquant');
const uses = (re) => walk(dir, (f) => /\.js$/.test(f)).some((f) => re.test(fs.readFileSync(f, 'utf8')));
if (uses(/node:sqlite/) && !(pkg.engines && /22\.[5-9]|2[3-9]|[3-9]\d/.test(pkg.engines.node || ''))) add('wa', 'node:sqlite utilisé : engines.node devrait être >=22.5');
if (pkg.dependencies && pkg.dependencies.express && !/^[\^~]?4\./.test(pkg.dependencies.express)) add('wa', `Express ${pkg.dependencies.express} : la famille est alignée sur Express 4 (node-gateway)`);

// --- git / donnees
const gi = read('.gitignore');
/(^|\n)data\/?(\n|$)/.test(gi) ? add('ok', 'data/ ignoré par git') : add('ko', 'data/ absent de .gitignore');
/node_modules/.test(gi) ? add('ok', 'node_modules ignoré') : add('ko', 'node_modules absent de .gitignore');
if (exists('.env') && !/\.env/.test(gi)) add('ko', '.env présent et non ignoré');

// --- front : chemins absolus, scripts en ligne
const front = walk(path.join(dir, 'public'), (f) => /\.(html|js|css|json)$/.test(f) && !/sw\.js$|vendor/.test(f));
const abs = /(?:src|href|action)=["']\/(?!\/)|fetch\(\s*[`'"]\/(?!\/)|url\(\s*["']?\/(?!\/)|import\s[^;]*from\s*["']\/(?!\/)/;
const bad = front.filter((f) => abs.test(fs.readFileSync(f, 'utf8')));
bad.length ? add('ko', `chemins absolus (cassent sous /<slug>/) : ${bad.map((f) => path.relative(dir, f)).join(', ')}`) : add('ok', 'aucun chemin absolu côté navigateur');
const inl = front.filter((f) => /\.html$/.test(f)).filter((f) => /<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(fs.readFileSync(f, 'utf8')) || /\son(click|change|submit|load)=/.test(fs.readFileSync(f, 'utf8')));
inl.length && add('wa', `scripts ou gestionnaires en ligne (incompatibles avec une CSP stricte) : ${inl.map((f) => path.relative(dir, f)).join(', ')}`);

// --- PWA
const pub = ['public', '.'].find((d) => exists(d, 'manifest.json'));
if (pub) {
  try {
    const m = JSON.parse(read(pub, 'manifest.json'));
    /^\.?\/?$|^\.\//.test(m.start_url || '') && !String(m.start_url).startsWith('/') ? add('ok', 'manifest : start_url relatif') : add('ko', `manifest : start_url "${m.start_url}" doit être relatif ("./")`);
    (m.icons || []).some((i) => i.purpose === 'maskable') || add('wa', 'manifest : pas d\'icône maskable (node scripts/make-icons.js)');
  } catch { add('ko', 'manifest.json invalide'); }
  const sw = read(pub, 'sw.js');
  if (!sw) add('wa', 'pas de service worker (sw.js)');
  else {
    /const VERSION\s*=/.test(sw) ? add('ok', 'sw.js : VERSION présent') : add('wa', 'sw.js : pas de constante VERSION');
    const list = (sw.match(/const FILES\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
    const missing = list.map((s) => s.slice(1, -1)).filter((f) => f !== './' && !exists(pub, f));
    missing.length ? add('ko', `sw.js : fichiers absents du disque (le cache échouerait) : ${missing.join(', ')}`) : list.length && add('ok', `sw.js : ${list.length} fichiers du cache existent`);
  }
} else add('wa', 'pas de manifest.json (PWA)');

// --- migrations : jamais de modification d'une entree deployee
const dbf = ['lib/db.js', 'src/db.js', 'server/db.js'].find((f) => exists(f));
if (dbf && exists('.git')) {
  try {
    const diff = execSync(`git diff -U0 HEAD -- ${dbf}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    removed.length ? add('wa', `${dbf} : ${removed.length} ligne(s) supprimée(s)/modifiée(s) non commitées : vérifier qu'aucune migration déployée n'est modifiée`) : add('ok', `${dbf} : aucune ligne existante retirée`);
  } catch { /* pas de depot exploitable */ }
}
dbf && !/user_version/.test(read(dbf)) && add('wa', `${dbf} : pas de migrations par PRAGMA user_version`);

// --- secrets
const srcs = walk(dir, (f) => /\.(js|json|html|md)$/.test(f) && !/package-lock/.test(f));
const leaks = srcs.filter((f) => /(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(fs.readFileSync(f, 'utf8')));
leaks.length ? add('ko', `secret probable dans : ${leaks.map((f) => path.relative(dir, f)).join(', ')}`) : add('ok', 'aucun secret évident dans le code');

// --- documentation / tests
exists('CLAUDE.md') ? add('ok', 'CLAUDE.md présent') : add('ko', 'CLAUDE.md manquant');
const tdir = ['tests', 'test'].find((d) => exists(d));
tdir && fs.readdirSync(path.join(dir, tdir)).some((f) => /\.test\.js$/.test(f)) ? add('ok', `tests dans ${tdir}/`) : add('ko', 'aucun fichier *.test.js');
exists('.github', 'workflows') || add('wa', 'pas d\'intégration continue (.github/workflows/test.yml)');
if (args.includes('--test')) {
  const r = spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8', shell: true });
  r.status === 0 ? add('ok', 'npm test vert') : add('ko', 'npm test en échec :\n' + (r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
}

const icon = { ok: '✓', ko: '✗', wa: '⚠' };
console.log(out.map((o) => `${icon[o.level]} ${o.msg}`).join('\n'));
const ko = out.filter((o) => o.level === 'ko').length;
console.log(`\n${ko} erreur(s), ${out.filter((o) => o.level === 'wa').length} avertissement(s)`);
process.exit(ko ? 1 : 0);
