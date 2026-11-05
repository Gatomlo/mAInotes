// Serveur sur une base temporaire (chaque fichier de test = un processus) + client avec cookie.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.__ENV___DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), '__SLUG__-test-'));
const app = require('../server');

let base = '';
async function start() {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return server;
}

function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), patch: (u, b) => call('PATCH', u, b || {}), del: (u) => call('DELETE', u) };
}

module.exports = { start, client, PASSWORD: 'motdepasse1' };
