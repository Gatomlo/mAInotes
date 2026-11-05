#!/usr/bin/env node
// Genere un nouveau projet depuis templates/ (aucune dependance).
// Usage : node scaffold.js <dossier-cible> --name "Mon App" [--slug mon-app] [--desc "..."] [--color "#c4492a"] [--git]
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const name = opt('name');
if (!target || !name) { console.error('Usage : node scaffold.js <dossier> --name "Nom" [--slug s] [--desc d] [--color #hex] [--git]'); process.exit(1); }

const slug = (opt('slug') || name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const vars = {
  __NAME__: name,
  __SLUG__: slug,
  __ENV__: slug.toUpperCase().replace(/-/g, '_'),
  __DESC__: opt('desc') || `${name} — application web (PWA).`,
  __COLOR__: opt('color') || '#c4492a',
  __INITIAL__: name.trim()[0].toUpperCase(),
};

const SRC = path.join(__dirname, '..', 'templates');
if (fs.existsSync(target) && fs.readdirSync(target).some((f) => f !== '.git')) { console.error(`Dossier non vide : ${target}`); process.exit(1); }

function copy(dir, rel = '') {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { copy(dir, r); continue; }
    let text = fs.readFileSync(path.join(dir, r), 'utf8');
    for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
    const out = path.join(target, r);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  }
}
copy(SRC);
if (args.includes('--git')) { // depot local pret a pousser (premier commit a faire apres npm install, pour inclure package-lock.json)
  const { spawnSync } = require('child_process');
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: target });
  console.log('Dépôt git initialisé (branche main). Après npm install : git add -A && git commit -m "Squelette".');
}
console.log(`Projet « ${name} » créé dans ${target} (slug : ${slug}).\nSuite : cd ${target} && npm install && npm test && npm start`);
