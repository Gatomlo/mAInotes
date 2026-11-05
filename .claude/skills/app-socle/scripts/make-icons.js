#!/usr/bin/env node
// Genere les icones PWA (PNG) depuis public/icon.svg avec Chrome/Edge sans fenetre (aucune dependance).
// Produit : icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-32.png
// puis complete manifest.json et index.html. Usage : node make-icons.js [dossier-projet]
// Navigateur : variable CHROME_PATH, sinon Chrome/Chromium/Edge usuels (Windows, macOS, Linux).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.resolve(process.argv[2] || '.');
const pub = path.join(target, 'public');
const svgFile = path.join(pub, 'icon.svg');
if (!fs.existsSync(svgFile)) { console.error(`Introuvable : ${svgFile}`); process.exit(1); }

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium',
].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) { console.error('Chrome/Edge introuvable : définir CHROME_PATH.'); process.exit(1); }

const svg = fs.readFileSync(svgFile, 'utf8');
const bg = (svg.match(/fill="(#[0-9a-fA-F]{3,8})"/) || [, '#c4492a'])[1];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
const svgData = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

function render(out, size, { maskable = false } = {}) {
  const html = path.join(tmp, `${path.basename(out)}.html`);
  const inner = maskable ? Math.round(size * 0.8) : size; // zone de securite des icones maskable
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;background:${maskable ? bg : 'transparent'};display:flex;align-items:center;justify-content:center}img{width:${inner}px;height:${inner}px}</style><img src="${svgData}">`);
  const r = spawnSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${size},${size}`, `--screenshot=${path.join(pub, out)}`, ...(maskable ? [] : ['--default-background-color=00000000']), 'file://' + html.replace(/\\/g, '/')], { encoding: 'utf8' });
  if (!fs.existsSync(path.join(pub, out))) { console.error(`Échec ${out} : ${r.stderr}`); process.exit(1); }
  console.log(`+ public/${out}`);
}
render('icon-192.png', 192);
render('icon-512.png', 512);
render('icon-maskable-512.png', 512, { maskable: true });
render('apple-touch-icon.png', 180, { maskable: true }); // iOS n'aime pas la transparence
render('favicon-32.png', 32);

const mf = path.join(pub, 'manifest.json');
if (fs.existsSync(mf)) {
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  m.icons = [
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n');
}
const ix = path.join(pub, 'index.html');
if (fs.existsSync(ix)) {
  let t = fs.readFileSync(ix, 'utf8');
  if (!t.includes('apple-touch-icon')) t = t.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', '<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">');
  fs.writeFileSync(ix, t);
}
const sw = path.join(pub, 'sw.js');
if (fs.existsSync(sw)) {
  let t = fs.readFileSync(sw, 'utf8');
  if (!t.includes('icon-192.png')) { t = t.replace("'icon.svg',", "'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png',"); fs.writeFileSync(sw, t); }
}
console.log('Icônes générées ; incrémenter VERSION dans public/sw.js si l\'app est déjà déployée.');
