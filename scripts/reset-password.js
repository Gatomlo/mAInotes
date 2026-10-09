// Réinitialise le mot de passe du compte, à lancer sur le serveur (SSH) en cas d'oubli :
//   npm run reset-password
// ou, si les données sont ailleurs :
//   MAINOTES_DATA_DIR=/chemin/vers/data npm run reset-password
// Toutes les sessions sont fermées : il faudra se reconnecter sur chaque appareil.
// Redémarrez ensuite l'application (ou la passerelle) pour qu'elle relise le compte.
const path = require('path');
const readline = require('readline');
const { Store } = require('../lib/store');
const { hashPassword } = require('../lib/secrets');
const { MIN_PASSWORD } = require('../lib/auth');

const dir = path.resolve(process.env.MAINOTES_DATA_DIR || path.join(__dirname, '..', 'data'));
const store = new Store(dir);
if (!store.db.user) {
  console.log(`Aucun compte dans ${dir} : ouvrez l'application pour le créer.`);
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Compte : ${store.db.user.login} (${dir})`);
rl.question(`Nouveau mot de passe (${MIN_PASSWORD} caractères au moins) : `, (pw) => {
  rl.close();
  if (!pw || pw.length < MIN_PASSWORD) {
    console.error('Mot de passe trop court, rien n\'a été changé.');
    process.exit(1);
  }
  store.db.user.password = hashPassword(pw);
  store.db.user.passwordChangedAt = Date.now();
  store.db.sessions = [];
  store.save();
  console.log('Mot de passe changé. Redémarrez l\'application, puis reconnectez-vous.');
});
