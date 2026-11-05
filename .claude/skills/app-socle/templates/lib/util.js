// Utilitaires communs : erreurs HTTP, lecture des saisies, limiteur de debit.
const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max = 200) => (v == null ? '' : String(v).trim()).slice(0, max);
const asyncHandler = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

// Compteur d'evenements par cle sur une fenetre glissante (echecs de connexion...).
function limiter(windowMs) {
  const hits = new Map();
  const recent = (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };
  return { count: (key) => recent(key).length, hit: (key) => { hits.set(key, recent(key).concat(Date.now())); }, clear: () => hits.clear() };
}

module.exports = { httpError, str, asyncHandler, limiter };
