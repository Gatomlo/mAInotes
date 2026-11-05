// En-tetes de securite + CSP de la page (aucun script ni onclick en ligne).
function headers(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function pagePolicy(res) {
  res.set('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:", "connect-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  ].join('; '));
}

// POST/PUT/PATCH/DELETE en JSON seulement (avec SameSite=Lax : protection CSRF).
function jsonOnly(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || req.is('application/json')) return next();
  // Depot de photo (module photos) : corps image/* (un formulaire d'un autre site ne peut pas l'envoyer sans CORS).
  if (req.method === 'POST' && req.path === '/photos' && req.is(['image/jpeg', 'image/png', 'image/webp'])) return next();
  res.status(415).json({ error: 'Requête JSON attendue.' });
}

module.exports = { headers, pagePolicy, jsonOnly };
