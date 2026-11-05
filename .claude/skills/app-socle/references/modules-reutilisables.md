# Où trouver chaque brique (dépôts `github.com/Gatomlo/<dépôt>`)

**D'abord les briques déjà dans le skill** : `templates/` (compte unique), `variants/multi/` (comptes + invitations, `scaffold --multi`), `modules/` via `add-module.js` : `backup`, `push`, `mail`, `ia`, `photos`, `qr`, `maquette`. Le tableau ci-dessous sert pour le reste ou pour des variantes plus riches.

Cloner à la demande : `git clone --depth 1 https://github.com/Gatomlo/<dépôt> /tmp/x` puis lire **uniquement** le fichier cité.

| Besoin | Dépôt : fichier | Remarques |
|---|---|---|
| Compte unique + sessions | `kdo/lib/auth.js` (modèle), `defifous/server/auth.js` (sans BDD, cookie HMAC), `mAInotes/lib/auth.js` (JSON, appareils, édition du compte) | modèle déjà dans `templates/` |
| Multi-comptes, rôles, invitations | `kdo/lib/{auth,circle,access}.js`, `Fretly/lib/auth.js` | premier compte = admin |
| Migrations / `tx` SQLite | `kdo/lib/db.js` | dans `templates/lib/db.js` |
| État JSON versionné + conflit 409 | `feelezcomptes/src/{server,db}.js`, `Watch-It/src/` | synchro multi-appareils |
| Multi-bases (une par entité) | `MyLittleLibraryV2/lib/db.js` | `inLibrary(id, fn)` |
| Chiffrement des clés API | `mAInotes/lib/secrets.js`, `Watch-It/src/cryptoBox.js` | AES-256-GCM |
| Fournisseurs IA (Infomaniak, Claude, Gemini, Mistral) | `mAInotes/lib/ai/*`, `Watch-It/src/ai.js`, `CahierMalin/lib/forms.js` | pipeline : `mAInotes/lib/pipeline.js` |
| Web Push (VAPID, JS pur) | `Lexiquest/lib/webpush.js` (sans dépendance), `kdo/lib/push.js`, `Watch-It/src/push.js`, `feelezcomptes/src/push.js` | clés VAPID en base |
| Service worker + push + clic notif | `kdo/public/sw.js` | |
| E-mail (SMTP/sendmail, mode `log` en test) | `kdo/lib/mailer.js`, `Repetito/mailer.js`, `MyLittleLibraryV2/lib/mail.js` | |
| Aperçu de lien (Open Graph), garde SSRF | `kdo/lib/preview.js`, `MyLittleLibraryV2/lib/net.js` | |
| Dépôt de photos / fichiers | `kdo/lib/photos.js` | type vérifié, noms aléatoires |
| QR code (SVG) | `kdo/lib/qr.js` (`qrcode-generator`), `Phoenix-Quest-V2` | |
| Import/export (CSV, ZIP, Excel, epub) | `MyLittleLibraryV2/lib/{zip,ebooks}.js`, `Lexiquest` (CSV), `listes-courses/lib/{receipts,csvimport}.js` (tickets : pdfjs + OCR tesseract) | |
| TTS 100 % Node hors ligne | `Repetito/{tts,piper-engine}.js` | gros, `vendor/` |
| Temps réel (Socket.IO) | `Crazy-Farming/`, `TheBigTeamQuiz-V2/`, hook `attachToServer` de node-gateway | |
| Rappels / tâches planifiées | `MyLittleLibraryV2/lib/reminders.js`, `Lexiquest/lib/reminders.js`, `feelezcomptes/src/push.js` (intervalle) | |
| Anti-spoiler / vues filtrées | `kdo/lib/access.js` | |
| Sauvegarde, démo, icônes | `kdo/scripts/{backup,demo,make-icons}`, `feelezcomptes/scripts/make-icons.py` | |
| Réparation node_modules mutualisé | `node-gateway/scripts/repair-modules.js`, `Lexiquest/lib/repair-modules.js` | |
| Tests e2e serveur | `kdo/tests/helpers.js` (modèle dans `templates/tests/`) | `<APP>_DATA_DIR` temporaire |
| Thème sombre/clair, jetons CSS | `Watch-It/public/styles.css`, `Phoenix-Quest-V2/public/admin.css` | |
| Routeur hash + vues `mount()` | `Fretly/public/js/app.js` (vues avec nettoyage), `kdo/public/app/router.js` | |

Apps « jeu / éducatif » : `CahierMalin` (10 jeux, profils enfants), `Lexiquest` (compagnon, bons), `Phoenix-Quest-V2` (escape game, scénarios sur fichiers), `Crazy-Farming`, `defifous` (scoring).
