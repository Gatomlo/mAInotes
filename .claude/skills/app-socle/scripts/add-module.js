#!/usr/bin/env node
// Ajoute un module optionnel a un projet genere par scaffold.js.
// Usage : node add-module.js <backup|push|mail> [dossier-projet]   (defaut : dossier courant)
const fs = require('fs');
const path = require('path');

const MODULES = path.join(__dirname, '..', 'modules');
const [name, dirArg] = process.argv.slice(2);
const target = path.resolve(dirArg || '.');
if (!name || !fs.existsSync(path.join(MODULES, name))) {
  console.error(`Modules disponibles : ${fs.readdirSync(MODULES).join(', ')}\nUsage : node add-module.js <module> [dossier]`);
  process.exit(1);
}
const pkgFile = path.join(target, 'package.json');
if (!fs.existsSync(pkgFile)) { console.error(`Pas de package.json dans ${target}`); process.exit(1); }
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const slug = pkg.name;
const vars = { __SLUG__: slug, __ENV__: slug.toUpperCase().replace(/-/g, '_'), __NAME__: slug };
const sub = (t) => Object.entries(vars).reduce((s, [k, v]) => s.split(k).join(v), t);
const mod = JSON.parse(sub(fs.readFileSync(path.join(MODULES, name, 'module.json'), 'utf8')));
const read = (f) => fs.readFileSync(f, 'utf8');
const done = [];

// 1. fichiers
const filesDir = path.join(MODULES, name, 'files');
(function copy(rel = '') {
  for (const e of fs.readdirSync(path.join(filesDir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { copy(r); continue; }
    if (e.name.endsWith('.txt')) continue; // extraits geres plus bas
    const out = path.join(target, r);
    if (fs.existsSync(out)) { done.push(`⚠ ${r} existe déjà : conservé`); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, sub(read(path.join(filesDir, r))));
    done.push(`+ ${r}`);
  }
})();

// 2. package.json (dependances et scripts)
Object.assign((pkg.dependencies ||= {}), mod.deps || {});
Object.assign((pkg.scripts ||= {}), mod.scripts || {});
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

// 3. migration (ajoutee en fin du tableau MIGRATIONS)
if (mod.migration) {
  const f = path.join(target, 'lib', 'db.js');
  let t = read(f);
  if (!t.includes(mod.migration)) {
    t = t.replace(/\n\];\n/, `\n  \`${mod.migration}\`,\n];\n`);
    fs.writeFileSync(f, t);
    done.push('+ migration ajoutée à lib/db.js');
  }
}

// 4. routes (au marqueur de lib/api.js)
if (mod.routes) {
  const f = path.join(target, 'lib', 'api.js');
  let t = read(f);
  if (!t.includes(mod.routes)) {
    if (!t.includes('/* @module-routes */')) done.push(`⚠ marqueur /* @module-routes */ absent de lib/api.js : ajouter à la main → ${mod.routes}`);
    else { t = t.replace('/* @module-routes */', `${mod.routes}\n  /* @module-routes */`); fs.writeFileSync(f, t); done.push('+ routes branchées dans lib/api.js'); }
  }
}

// 5. extrait de service worker
if (mod.sw) {
  const f = path.join(target, 'public', 'sw.js');
  const snippet = sub(read(path.join(filesDir, mod.sw)));
  if (fs.existsSync(f) && !read(f).includes(snippet.trim().split('\n')[1])) { fs.appendFileSync(f, snippet); done.push('+ gestionnaires push ajoutés à public/sw.js'); }
}

console.log(`Module « ${name} » : ${mod.description}\n${done.join('\n')}`);
(mod.notes || []).forEach((n) => console.log(`→ ${n}`));
console.log('→ npm install, puis npm test');
