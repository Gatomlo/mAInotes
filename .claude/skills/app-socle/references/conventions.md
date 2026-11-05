# Conventions communes (relevées dans 15 dépôts Gatomlo)

## Stack (constante partout)
- Node ≥ 22.5, Express 4 (^4.19 à ^4.22), `node:sqlite` (`DatabaseSync`, WAL, `busy_timeout`, `foreign_keys`) — 10 dépôts sur 15 (CahierMalin, Lexiquest, MyLittleLibraryV2, Phoenix-Quest-V2, TheBigTeamQuiz-V2, Watch-It, defifous, feelezcomptes, kdo, listes-courses). Autres : localStorage (Fretly), JSON (Répétito, mAInotes), stockage propre (CarboNum, Crazy-Farming) ; Socket.IO : Crazy-Farming, TheBigTeamQuiz-V2. Vérifié par recherche dans le code (2026-11).
- Front : JS vanilla, modules ES (`public/app/*.js`) ou un seul `app.js`/`index.html` ; **pas de framework ni de build**. Rendu par `h()`/chaînes HTML + délégation d'événements (`data-action`). Routeur par hash `#/vue`.
- PWA : `manifest.json` (`start_url: "./"`, `scope: "./"`), `sw.js` réseau-d'abord (3 s) + copie gardée, API jamais en cache, `VERSION` à incrémenter si `FILES` change. Hors ligne : copie `localStorage` + file d'attente de synchro.
- Thème : jetons CSS dans `:root`, sombre/clair (réglage Auto/Clair/Sombre dans `localStorage`), polices Google (Bricolage Grotesque, Nunito Sans/Manrope), cibles tactiles ≥ 44 px, `viewport-fit=cover`.

## Structure type
```
server.js            exporte app ; listen si require.main === module
lib/ (ou src/)       db.js auth.js api.js security.js util.js + un fichier par domaine
public/              index.html style.css sw.js manifest.json icon*.png app/*.js
scripts/             set-password.js backup.js make-icons.py demo.js
tests/ (ou test/)    helpers.js (+ base temporaire via <APP>_DATA_DIR) *.test.js
docs/                cahier-des-charges.md (+ ARCHITECTURE.md si gros)
maquette/            index.html interactive (avant codage, artefact Claude) — ne plus modifier ensuite
.claude/launch.json  démarrage de démo (port 3100)
CLAUDE.md            objectif, stack, fichiers clés, modèle de données non évident, règles
```

## Statut de ces constats
Relevés dans les `CLAUDE.md` et le code de 15 dépôts (clonés le 2026-11-05) ; chiffres et chemins recoupés par recherche. À réviser quand un projet change de stack.

## Méthode de travail
Maquette HTML interactive → `CAHIER_DES_CHARGES.md` (étapes numérotées §) → codage étape par étape → `CLAUDE.md` tenu à jour avec un bloc « État (au AAAA-MM-JJ) ». Les maquettes figées après le codage ; le comportement de référence devient celui de l'app.

## Auth & comptes
- Compte unique créé à la 1ʳᵉ ouverture (`/api/auth/setup`, 409 ensuite), code d'installation optionnel `<APP>_SETUP_TOKEN`.
- scrypt natif (`scrypt$sel$hash`) dans les apps récentes ; bcryptjs + `express-session` dans les plus anciennes (Fée Lezcomptes, Watch-It, Phoenix-Quest-V2, CarboNum) — pour du neuf, prendre scrypt. Comparaison `timingSafeEqual`, empreinte factice si compte inconnu, blocage 8 échecs/15 min.
- Session : jeton aléatoire, **hash SHA-256 en base**, cookie `<app>_session` HttpOnly SameSite=Lax 90 j, `Path` = montage, `Secure` si HTTPS/`x-forwarded-proto`. 401 = non connecté ; 403 = mauvais mot de passe actuel/droit.
- Multi-utilisateurs (Cabas, Kdo, Fretly, MyLittleLibraryV2) : premier compte = admin, ensuite invitation par lien ; rôles + « garde » d'accès centralisée (`lib/access.js` de Kdo). Aucun e-mail obligatoire (lien copiable à la main) ; e-mail via SMTP/sendmail en option.
- Secours : `npm run set-password -- <id> <mdp>`.

## Données
- `PRAGMA user_version` + tableau `MIGRATIONS`. Transactions `tx()` imbriquables. Requêtes préparées gardées.
- Modèle « état complet JSON + `version` » (Fée Lezcomptes, Watch-It) : `GET/PUT /api/state`, `X-State-Version` / `X-Base-Version`, 409 + état courant en cas de conflit.
- Suppression douce (`active=0`/corbeille) quand l'historique compte. Export/sauvegarde : `scripts/backup.js`, export JSON dans l'onglet Compte.
- Entrées utilisateur : `str(v,max)`, `webUrl()` (http/https seulement), ids entiers pour `IN (...)`, garde SSRF pour tout `fetch` d'URL saisie.

## Sécurité
CSP stricte (aucun script inline), `nosniff`, `Referrer-Policy: no-referrer`, `jsonOnly` (CSRF avec SameSite), `x-powered-by` désactivé, limites `express.json({limit})`, textes insérés via `textContent`/`h()` (jamais `innerHTML` brut non échappé).

## IA (mAInotes, Watch-It, CahierMalin, Fretly)
Interface commune de fournisseurs (`lib/ai/index.js` : infomaniak/claude/gemini/mistral), clés chiffrées AES-256-GCM (clé maître `<APP>_SECRET` ou `data/secret.key`), plafond mensuel + alerte 80 %, cache des réponses, classement sur texte seul, suggestions jamais appliquées sans clic.

## Pièges rencontrés
- Chemins absolus `/…` dans le HTML/JS → cassent sous `/<slug>/`.
- `npm install` interrompu sur hébergement mutualisé → `repair-modules.js`, verrou `.installing` (node-gateway, Lexiquest).
- Ne jamais renommer des identifiants techniques déjà en prod (clés localStorage, tags push, contexte de chiffrement).
- Windows (poste de dev) : jonctions vers `node-gateway/apps/<slug>` ; tuer le process du port 3000 avant de relancer la passerelle ; scripts d'icônes via Python/Pillow.
- Branches/variantes : éviter les copies (Phoenix-Quest-V2 n'exporte pas son app sur `main` et appelle `listen` sans condition : version montable sur la branche `gateway`) ; préférer un seul code qui s'adapte au montage.
- `node --test` sous Node 22 : cibler les fichiers (`tests/app.test.js`), pas le dossier.
