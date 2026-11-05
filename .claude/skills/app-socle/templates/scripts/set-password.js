// Secours : redefinit identifiant et mot de passe depuis le serveur.
// Usage : npm run set-password -- <identifiant> <mot de passe>
const { db } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

(async () => {
  const [login, password] = process.argv.slice(2);
  if (!login || !password) { console.error('Usage : npm run set-password -- <identifiant> <mot de passe>'); process.exit(1); }
  try {
    const hash = await hashPassword(password);
    if (db.prepare('SELECT 1 FROM account').get()) db.prepare('UPDATE account SET login = ?, password_hash = ?').run(login, hash);
    else db.prepare('INSERT INTO account (id, name, login, password_hash, created_at) VALUES (1, ?, ?, ?, ?)').run(login, login, hash, Date.now());
    db.prepare('DELETE FROM sessions').run();
  } catch (e) { console.error(e.message); process.exit(1); }
  console.log('Compte mis à jour (sessions fermées).');
})();
