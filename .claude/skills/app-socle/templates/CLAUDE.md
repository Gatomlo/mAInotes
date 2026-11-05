# __NAME__

## Objectif
__DESC__

## Stack
Node >= 22.5 (`node:sqlite`), Express 4, front en modules ES sans framework ni build (`public/app/`). PWA (`sw.js`). Interface et réponses en français (Belgique) ; commentaires de code sans accents.

## Fichiers clés
- `server.js` : exporte `app` (listen seulement si lancé directement, `PORT`), page `index.html` avec `{{ROOT}}` -> `<base href>`, API sur `/api`.
- `lib/db.js` : `data/__SLUG__.db`, `MIGRATIONS` (`PRAGMA user_version` ; ne jamais modifier une entrée déployée). `lib/auth.js` : compte unique (scrypt, session 90 j, cookie `__SLUG___session`). `lib/api.js` : routes. `lib/security.js` : en-têtes + CSP. `lib/util.js`.
- `public/app/` : `main.js` (cadre), `api.js` (URL relatives), `ui.js`. `public/sw.js` : changer `VERSION` quand `FILES` change.
- `tests/` : `npm test` (base temporaire) — à garder vert.

## Règles
- Chemins navigateur toujours relatifs (montage sous `/__SLUG__` dans node-gateway).
- Le compte unique est créé à la première ouverture après déploiement ; `npm run set-password -- <identifiant> <mot de passe>` en secours.
- `data/` jamais déployé ni versionné (à sauvegarder séparément).
- Données : voir les migrations dans `lib/db.js`.
