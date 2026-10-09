// Liens collés dans une note : le serveur lit la page une fois pour en tirer un aperçu
// (titre, site, résumé annoncé par la page, court extrait). Aucun appel IA ici ; le
// petit descriptif rédigé vient du même appel que le classement.
//
// Garde-fous : http(s) seulement, adresses internes refusées (le serveur ne doit pas
// servir à sonder le réseau d'Infomaniak), 5 secondes et 512 Ko au plus par page.
const dns = require('dns').promises;
const net = require('net');

const MAX_LINKS = 3;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi;

function extractUrls(text) {
  const out = [];
  (String(text || '').match(URL_RE) || []).forEach((raw) => {
    let u = raw.replace(/[.,;:!?)\]}”’]+$/, '');
    if (/^www\./i.test(u)) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      if (!/^https?:$/.test(parsed.protocol)) return;
      const href = parsed.href;
      if (!out.includes(href)) out.push(href);
    } catch (e) { /* adresse invalide */ }
  });
  return out.slice(0, MAX_LINKS);
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublic(url) {
  if (process.env.MAINOTES_ALLOW_PRIVATE_LINKS === '1') return;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$/i.test(host) || /\.local$/i.test(host)) throw new Error('adresse interne');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivateIp)) throw new Error('adresse interne');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', euro: '€', middot: '·' };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (x) { return m; }
    }
    return ENTITIES[e.toLowerCase()] !== undefined ? ENTITIES[e.toLowerCase()] : m;
  });
}
const clean = (s, max) => decodeEntities(s).replace(/\s+/g, ' ').trim().slice(0, max);

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`, 'i');
    const tag = html.match(re);
    if (tag) {
      const c = tag[0].match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
      if (c) return c[2] !== undefined ? c[2] : c[3];
    }
  }
  return '';
}

function parseHtml(html) {
  const title = metaContent(html, ['og:title', 'twitter:title']) || ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const summary = metaContent(html, ['og:description', 'description', 'twitter:description']);
  const site = metaContent(html, ['og:site_name', 'application-name']);
  const body = (html.match(/<body[\s\S]*$/i) || [html])[0]
    .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return { title: clean(title, 200), summary: clean(summary, 400), site: clean(site, 80), excerpt: clean(body, 600) };
}

async function readLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= MAX_BYTES) { reader.cancel().catch(() => {}); break; }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function fetchPreview(url) {
  const link = { url, title: '', site: new URL(url).hostname.replace(/^www\./, ''), summary: '', excerpt: '', description: '', aiDescription: false, error: null, fetchedAt: Date.now() };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let current = url;
    let res;
    for (let i = 0; i < 4; i++) {
      await assertPublic(current);
      res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mAInotes; aperçu de lien)', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'fr-BE,fr;q=0.9,en;q=0.5' }
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).href;
        continue;
      }
      break;
    }
    if (!res.ok) throw new Error(`erreur ${res.status}`);
    const type = String(res.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('html')) {
      const kind = type.includes('pdf') ? 'Document PDF' : type.startsWith('image/') ? 'Image' : type.startsWith('video/') ? 'Vidéo' : 'Fichier';
      link.title = decodeURIComponent(new URL(current).pathname.split('/').pop() || link.site);
      link.summary = kind;
      res.body && res.body.cancel && res.body.cancel().catch(() => {});
      return link;
    }
    const buf = await readLimited(res);
    let charset = (type.match(/charset=([\w-]+)/) || [])[1];
    if (!charset) charset = (buf.slice(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
    let html;
    try { html = new TextDecoder(charset || 'utf-8').decode(buf); } catch (e) { html = buf.toString('utf8'); }
    Object.assign(link, parseHtml(html));
    if (!link.title) link.title = link.site;
  } catch (err) {
    link.error = err.name === 'AbortError' ? 'page trop lente' : String(err.message || err).slice(0, 120);
    link.title = link.title || link.site;
  } finally {
    clearTimeout(timer);
  }
  return link;
}

// Met à jour n.links selon les adresses présentes dans le texte de la note : les
// nouvelles sont lues, celles qui ont disparu sont retirées, les autres gardées.
async function refreshLinks(n) {
  const urls = extractUrls(n.content);
  const known = (n.links || []).filter((l) => urls.includes(l.url));
  const fresh = await Promise.all(urls.filter((u) => !known.some((l) => l.url === u)).map(fetchPreview));
  n.links = urls.map((u) => known.find((l) => l.url === u) || fresh.find((l) => l.url === u));
  return n.links;
}

function linksText(n) {
  return (n.links || []).map((l) => `Lien : ${[l.title, l.description || l.summary].filter(Boolean).join(' — ')} (${l.url})`).join('\n');
}

module.exports = { extractUrls, refreshLinks, linksText, fetchPreview, isPrivateIp };
