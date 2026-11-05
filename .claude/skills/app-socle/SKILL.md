---
name: app-socle
description: Socle commun des apps web de Gatomlo (Node + Express + SQLite natif, PWA vanilla sans build, compte unique, montage node-gateway/Infomaniak, tout en français). À utiliser pour créer un nouveau projet d'app, ajouter une fonction classique (compte, push, IA, e-mail, import, sauvegarde, PWA hors ligne) ou améliorer/déboguer une app existante de cette famille, afin de réutiliser le code et les décisions déjà éprouvés au lieu de tout ré-explorer.
---

# Socle des apps Gatomlo

Toutes les apps (Cabas, Kdo, Fée Lezcomptes, Watch-It, Fretly, Lexiquest, Répétito, MyLittleLibraryV2, defifous, CahierMalin, Phoenix-Quest-V2, mAInotes…) partagent le même socle. **Ne pas le redécouvrir : l'appliquer.**

## Créer une app (≈ 1 commande)
1. **Questions initiales** (obligatoires pour un nouveau projet, voir `references/questions.md`) : avec l'outil `AskUserQuestion`, en une ou deux séries de 4 questions max, **sauter toute question dont la réponse figure déjà dans la demande**. Première option = défaut recommandé. Puis résumer les choix en 5 lignes et attendre le « ok » avant de générer ou de rédiger `docs/cahier-des-charges.md` (objectif, écrans, modèle de données, étapes numérotées).
2. Générer le squelette :
   ```bash
   node <ce-skill>/scripts/scaffold.js <dossier> --name "Nom" --desc "..." --color "#hex" --git
   cd <dossier> && npm install && npm test
   ```
   Fournit : `server.js` exportable, compte unique (scrypt, session 90 j), SQLite + migrations, CSP, PWA + service worker, front en modules ES, test de bout en bout, `CLAUDE.md`, `.claude/launch.json`, CI GitHub et modèle de PR.
3. Ajouter les fonctions cochées, une commande chacune : `node <ce-skill>/scripts/add-module.js <backup|push|mail> [dossier]` (fichiers, dépendances, migration, routes, service worker). Autres besoins (IA, photos, QR, temps réel…) : `references/modules-reutilisables.md`.
4. Icônes PWA : `node <ce-skill>/scripts/make-icons.js [dossier]` (PNG, maskable, iOS, depuis `public/icon.svg`).
5. Remplacer la ressource d'exemple (`items` dans `lib/api.js`, migration 1 dans `lib/db.js`, vue dans `public/app/main.js`) puis ajouter les domaines un par un (`lib/<domaine>.js`). Adapter `CLAUDE.md` et le garder à jour.
6. GitHub : créer le dépôt, pousser, brancher la CI → `references/github.md`. Avant chaque déploiement : `node <ce-skill>/scripts/audit.js . --test`.

## Améliorer une app existante
Lancer d'abord `node <ce-skill>/scripts/audit.js <dossier>` (chemins absolus, export de l'app, migrations, service worker, secrets, tests, CI), lire son `CLAUDE.md` (et le cahier des charges s'il existe), jamais tout le code. Pour une fonction classique, **copier le module de référence** indiqué dans `references/modules-reutilisables.md` (dépôt + fichier précis) au lieu de le réécrire : `git clone --depth 1 https://github.com/Gatomlo/<dépôt>` puis lire seulement le fichier visé.

## Règles non négociables
- `server.js` : `module.exports = app` ; `listen`/handlers globaux seulement si `require.main === module`.
- Chemins navigateur **relatifs** (`api/...`, `app/...`, `<base href="{{ROOT}}/">`), cookie `Path=<montage>/`.
- Aucune dépendance native ni étape de build. Express 4 (aligné sur node-gateway). `node:sqlite` si Node ≥ 22.5, sinon JSON dans `data/`.
- Migrations additives (`PRAGMA user_version`), ne jamais modifier une entrée déployée. `data/` jamais déployé ni versionné.
- Secrets/clés API : seulement côté serveur, chiffrés (AES-256-GCM, `references/modules-reutilisables.md`), jamais dans une variable d'env en clair côté client.
- Interface en français (Belgique), mobile d'abord, thème clair/sombre par jetons CSS ; commentaires de code sans accents ; réponses à l'utilisateur concises.
- `npm test` vert avant tout commit ; test de bout en bout sur base temporaire.

## Économie de tokens
- Ne pas relire des fichiers qu'on vient d'écrire ; ne lire que la partie utile (`offset/limit`).
- Une seule vérification de bout en bout (test + un `curl`) plutôt que des captures.
- Itérer par petites étapes numérotées du cahier des charges ; un commit par étape.

Détails : `references/conventions.md` (architecture, décisions, pièges) · `references/questions.md` (questionnaire initial) · `references/modules-reutilisables.md` (où trouver chaque brique) · `references/deploiement.md` (node-gateway / Infomaniak) · `references/github.md` (dépôt, branches, PR, CI, déploiement depuis GitHub).
