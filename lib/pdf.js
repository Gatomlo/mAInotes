// Générateur PDF minimal (texte seul, A4, Helvetica) pour exporter les synthèses
// côté serveur, sans dépendance ni nouvel appel IA (F56). Comprend le Markdown
// simple produit par la synthèse : titres ##/###, listes « - », **gras** retiré.

const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'Œ': 0x8c, 'œ': 0x9c, 'Ÿ': 0x9f, ' ': 0x20, ' ': 0x20 };

function toWinAnsi(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (WIN[ch] !== undefined) out.push(WIN[ch]);
    else if (c >= 0x20 && c <= 0x7e) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

function wrap(text, size, width) {
  const maxChars = Math.max(10, Math.floor(width / (size * 0.5)));
  const lines = [];
  String(text).split(/\n/).forEach((para) => {
    let line = '';
    para.split(/\s+/).forEach((w) => {
      if (!w) return;
      while (w.length > maxChars) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, maxChars)); w = w.slice(maxChars); }
      if ((line + ' ' + w).trim().length > maxChars) { lines.push(line); line = w; } else line = (line ? line + ' ' : '') + w;
    });
    lines.push(line);
  });
  return lines;
}

function buildPdf({ title, subtitle, text }) {
  const W = 595, H = 842, M = 56, LW = W - 2 * M;
  const blocks = [];
  blocks.push({ font: 'F2', size: 18, text: title, after: 4 });
  if (subtitle) blocks.push({ font: 'F1', size: 9, text: subtitle, after: 12 });
  String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
    const l = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s+$/, '');
    if (/^#{1,2}\s/.test(l)) blocks.push({ font: 'F2', size: 14, text: l.replace(/^#+\s*/, ''), before: 10, after: 4 });
    else if (/^#{3,}\s/.test(l)) blocks.push({ font: 'F2', size: 12, text: l.replace(/^#+\s*/, ''), before: 6, after: 2 });
    else if (/^\s*[-*]\s+/.test(l)) blocks.push({ font: 'F1', size: 11, text: l.replace(/^\s*[-*]\s+/, ''), bullet: true, after: 2 });
    else if (!l.trim()) blocks.push({ gap: 6 });
    else blocks.push({ font: 'F1', size: 11, text: l, after: 2 });
  });

  const pages = [];
  let ops = [];
  let y = H - M;
  const newPage = () => { pages.push(ops); ops = []; y = H - M; };
  blocks.forEach((b) => {
    if (b.gap) { y -= b.gap; return; }
    y -= b.before || 0;
    const indent = b.bullet ? 14 : 0;
    const lines = wrap(b.text, b.size, LW - indent);
    lines.forEach((ln, i) => {
      const lead = b.size * 1.35;
      if (y - lead < M) newPage();
      y -= lead;
      if (b.bullet && i === 0) ops.push({ font: 'F1', size: b.size, x: M, y, s: '•' });
      ops.push({ font: b.font, size: b.size, x: M + indent, y, s: ln });
    });
    y -= b.after || 0;
  });
  pages.push(ops);

  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const f1 = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  const f2 = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  const kids = [];
  pages.forEach((pOps, idx) => {
    const parts = [];
    pOps.forEach((o) => parts.push(Buffer.from(`BT /${o.font} ${o.size} Tf ${o.x.toFixed(1)} ${o.y.toFixed(1)} Td <${toWinAnsi(o.s).toString('hex')}> Tj ET\n`)));
    parts.push(Buffer.from(`BT /F1 8 Tf ${W - M - 40} 30 Td <${toWinAnsi(`${idx + 1} / ${pages.length}`).toString('hex')}> Tj ET\n`));
    const stream = Buffer.concat(parts);
    const content = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]));
    kids.push(add(Buffer.from(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`)));
  });
  objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objs[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let pos = chunks[0].length;
  objs.forEach((body, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    chunks.push(b);
    pos += b.length;
  });
  const xref = ['xref', `0 ${objs.length + 1}`, '0000000000 65535 f '].concat(offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n ')).join('\n');
  chunks.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

module.exports = { buildPdf };
