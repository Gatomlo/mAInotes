async function readJsonResponse(res, who) {
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = raw; }
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error.description || data.error)) || (typeof data === 'string' ? data.slice(0, 200) : '') || res.statusText;
    const err = new Error(`${who} : erreur ${res.status} – ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.status = res.status;
    throw err;
  }
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

module.exports = { readJsonResponse, parseJsonLoose };
