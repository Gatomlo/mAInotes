// __NAME__ : serveur Express. Seul (npm start, PORT) ou monte dans node-gateway sur
// /__SLUG__ : le module exporte l'app et n'ecoute un port ou n'installe de gestionnaire
// global que s'il est lance directement.
const fs = require('fs');
const path = require('path');
const express = require('express');
const security = require('./lib/security');
const auth = require('./lib/auth');
const { router } = require('./lib/api');

if (require.main === module) {
  const fatal = (kind) => (err) => { console.error(`${kind} :`, err); process.exit(1); };
  process.on('uncaughtException', fatal('Erreur non interceptee'));
  process.on('unhandledRejection', fatal('Promesse rejetee non geree'));
}

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

app.disable('x-powered-by');
app.use(security.headers);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

app.use('/api', auth.loadUser, security.jsonOnly, router());
app.use('/api', (req, res) => res.status(404).json({ error: 'Adresse inconnue.' }));
app.use('/api', (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur interne du serveur.' : err.message });
});

// Page unique : {{ROOT}} -> <base href> (chemins relatifs valables seuls et sous /__SLUG__).
app.get('/', (req, res) => {
  security.pagePolicy(res);
  const root = auth.rootPath(req).replace(/[<>"&]/g, '');
  res.set('Cache-Control', 'no-cache').type('html').send(INDEX.replace(/\{\{ROOT\}\}/g, root));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`__NAME__ : http://localhost:${PORT}/`));
}

module.exports = app;
