// QR code (SVG) d'un lien : invitation a scanner, lien de partage.
const qrcode = require('qrcode-generator');
const { httpError } = require('./util');

function svg(text) {
  const t = String(text || '');
  if (!/^https?:\/\//.test(t) || t.length > 500) throw httpError(400, 'Lien invalide.');
  const q = qrcode(0, 'M');
  q.addData(t);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function routes(r) {
  r.get('/qr', (req, res) => res.type('image/svg+xml').send(svg(req.query.text)));
}

module.exports = { svg, routes };
