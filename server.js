// mAInotes – carnet de notes intelligent.
//
// Fonctionne seul (`npm start`) ou monté par node-gateway : ce fichier exporte l'app
// Express et n'appelle app.listen() que lorsqu'il est lancé directement. Côté
// navigateur, tous les chemins sont relatifs, donc l'app marche à la racine comme
// sous /mainotes.
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Store } = require('./lib/store');
const { loadMasterKey } = require('./lib/secrets');
const createAuth = require('./lib/auth');
const createAI = require('./lib/ai');
const createPipeline = require('./lib/pipeline');
const createApi = require('./lib/api');

// Données hors du dossier de l'app conseillées en production (voir
// docs/deploiement-infomaniak.md) : un redéploiement qui remplace apps/mainotes ne
// doit pas emporter les notes.
const DATA_DIR = path.resolve(process.env.MAINOTES_DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

const store = new Store(DATA_DIR);
const masterKey = loadMasterKey(DATA_DIR);
const ai = createAI(store, masterKey);
const pipeline = createPipeline(store, ai);
const auth = createAuth(store);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.locals.masterKey = masterKey;

app.use((req, res, next) => {
  // Préfixe de montage réel (« /mainotes » sous la passerelle, « » seul), pour le
  // chemin du cookie de session.
  req.mountBase = req.baseUrl || '/';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// /mainotes sans barre finale : les chemins relatifs du navigateur seraient faux.
app.use((req, res, next) => {
  if (req.baseUrl && req.originalUrl === req.baseUrl) return res.redirect(301, req.baseUrl + '/');
  if (req.baseUrl && req.originalUrl.startsWith(req.baseUrl + '?')) return res.redirect(301, req.baseUrl + '/' + req.originalUrl.slice(req.baseUrl.length));
  next();
});

const api = express.Router();
api.use(express.json({ limit: '2mb' }));
// Protection CSRF : toute écriture doit porter l'en-tête X-Mainotes, qu'un autre
// site ne peut pas ajouter sans autorisation CORS (jamais accordée ici).
api.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-Mainotes') !== '1') {
    return res.status(403).json({ error: 'Requête refusée.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});
api.use(auth.router);
api.use(auth.accountRouter);
api.use(createApi(store, ai, pipeline, auth));
api.use((req, res) => res.status(404).json({ error: 'Route inconnue.' }));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Fichier trop volumineux.' });
  console.error('mAInotes :', err);
  res.status(500).json({ error: 'Erreur du serveur.' });
});
app.use('/api', api);

app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  setHeaders(res, file) {
    if (/\b(sw\.js|index\.html|manifest\.json)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  }
}));

pipeline.resume();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`mAInotes disponible sur http://localhost:${PORT}`));
}

module.exports = app;
