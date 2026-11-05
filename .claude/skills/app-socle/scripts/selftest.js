#!/usr/bin/env node
// Auto-test du skill : genere un projet (compte unique, puis multi-comptes), ajoute tous les modules,
// installe, lance npm test et l'audit (0 erreur attendue). A lancer apres toute modification du skill.
// Usage : node selftest.js [--keep]   (--keep garde les dossiers temporaires)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-socle-selftest-'));
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, out: `${r.stdout}\n${r.stderr}` };
};
let failed = 0;
const step = (label, r) => { console.log(`${r.ok ? '✓' : '✗'} ${label}`); if (!r.ok) { failed++; console.log(r.out.split('\n').slice(-25).join('\n')); } return r.ok; };

const modules = fs.readdirSync(path.join(SKILL, 'modules'));
for (const variant of ['single', 'multi']) {
  const dir = path.join(tmp, variant);
  console.log(`\n== ${variant} ==`);
  if (!step('scaffold', run(process.execPath, [path.join(SKILL, 'scripts', 'scaffold.js'), dir, '--name', `Essai ${variant}`, ...(variant === 'multi' ? ['--multi'] : [])], tmp))) continue;
  for (const m of modules) step(`add-module ${m}`, run(process.execPath, [path.join(SKILL, 'scripts', 'add-module.js'), m, dir], tmp));
  if (!step('npm install', run('npm', ['install', '--no-audit', '--no-fund', '--silent'], dir))) continue;
  const t = run('npm', ['test'], dir);
  const m = /# pass (\d+)/.exec(t.out);
  step(`npm test (${m ? m[1] : 0} test(s) verts)`, t);
  step('audit', run(process.execPath, [path.join(SKILL, 'scripts', 'audit.js'), dir], tmp));
}
if (!process.argv.includes('--keep')) fs.rmSync(tmp, { recursive: true, force: true }); else console.log(`\nDossiers : ${tmp}`);
console.log(failed ? `\n${failed} étape(s) en échec` : '\nTout est vert');
process.exit(failed ? 1 : 0);
