// Photos deposees depuis le telephone ou l'ordinateur : le navigateur reduit l'image (JPEG ~1280 px)
// puis l'envoie telle quelle (corps binaire). Fichiers dans data/photos/<32 hex>.<ext>, servis
// derriere la session par GET /api/photos/<nom>. Type reel verifie sur les premiers octets.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { DATA_DIR } = require('./db');
const { httpError } = require('./util');

const DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(DIR, { recursive: true });
const MAX_BYTES = 3 * 1024 * 1024;
const NAME = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

function kind(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function save(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpError(400, 'Image manquante.');
  if (buf.length > MAX_BYTES) throw httpError(413, 'Image trop lourde (3 Mo maximum).');
  const ext = kind(buf);
  if (!ext) throw httpError(415, 'Format d’image non reconnu (JPEG, PNG ou WebP).');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(DIR, name), buf);
  return `photos/${name}`;
}

function remove(p) {
  const name = String(p || '').replace(/^photos\//, '');
  if (NAME.test(name)) fs.rmSync(path.join(DIR, name), { force: true });
}

function routes(r) {
  r.post('/photos', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_BYTES + 1024 }), (req, res) => {
    res.status(201).json({ path: save(req.body) });
  });
  r.get('/photos/:name', (req, res) => {
    if (!NAME.test(req.params.name)) throw httpError(404, 'Photo introuvable.');
    res.set('Cache-Control', 'private, max-age=31536000, immutable').sendFile(path.join(DIR, req.params.name), (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'Photo introuvable.' }); });
  });
}

module.exports = { save, remove, routes, DIR };
