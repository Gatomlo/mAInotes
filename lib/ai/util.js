// En-têtes de limites renvoyés par un fournisseur (ratelimit, retry-after).
function rateHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const each = typeof headers.forEach === 'function' ? (fn) => headers.forEach((v, k) => fn(v, k)) : (fn) => Object.keys(headers).forEach((k) => fn(headers[k], k));
  each((v, k) => { if (/ratelimit|retry-after/i.test(k)) out[k.toLowerCase()] = String(v); });
  return out;
}

// « 37s », « 1.5s » ou un nombre de secondes → millisecondes.
function toMs(v) {
  if (v === undefined || v === null || v === '') return null;
  const m = String(v).match(/^([\d.]+)\s*s?$/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}

function quotaError(who, provider, message, retryMs, extra) {
  const err = new Error(`${who} : ${message}${retryMs ? ` Nouvel essai dans ${fmtDelay(retryMs)}.` : ''}`);
  err.status = 429;
  err.quota = { provider, retryMs: retryMs || null, ...(extra || {}) };
  return err;
}

function fmtDelay(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
}

async function readJsonResponse(res, who, provider) {
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = raw; }
  const limits = rateHeaders(res.headers);
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error.description || data.error)) || (typeof data === 'string' ? data.slice(0, 200) : '') || res.statusText;
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (res.status === 429 && provider) {
      const err = quotaError(who, provider, 'limite de requêtes atteinte chez le fournisseur.', toMs(limits['retry-after']));
      err.data = data;
      err.limits = limits;
      err.detail = text;
      throw err;
    }
    const err = new Error(`${who} : erreur ${res.status} – ${text}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (data && typeof data === 'object' && Object.keys(limits).length) Object.defineProperty(data, '__limits', { value: limits });
  return data;
}

// Extrait le premier objet JSON d'une réponse de modèle (avec ou sans bloc de code).
function parseJsonLoose(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Réponse de l\'IA illisible (JSON attendu).');
  return JSON.parse(s.slice(start, end + 1));
}

module.exports = { readJsonResponse, parseJsonLoose, rateHeaders, toMs, quotaError, fmtDelay };
