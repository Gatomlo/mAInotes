// Secours : redefinit le mot de passe d'un compte depuis le serveur (sessions fermees).
// Usage : npm run set-password -- <e-mail> <mot de passe>
const { db } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) { console.error('Usage : npm run set-password -- <e-mail> <mot de passe>'); process.exit(1); }
  const m = db.prepare('SELECT id FROM members WHERE email = ?').get(email.toLowerCase());
  if (!m) { console.error(`Aucun compte pour ${email}.`); process.exit(1); }
  try {
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(await hashPassword(password), m.id);
    db.prepare('DELETE FROM sessions WHERE member_id = ?').run(m.id);
  } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`Mot de passe de ${email} mis à jour.`);
})();
