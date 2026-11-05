# Lien avec GitHub

Compte : `Gatomlo` (`github.com/Gatomlo/<slug>`). Un dépôt par app ; `node-gateway` les assemble dans `apps/<slug>` au déploiement.

## 1. Créer le dépôt d'un nouveau projet
1. `node scripts/scaffold.js <dossier> --name "Nom" --git` (ajoute `.gitattributes`, `.github/workflows/test.yml`, modèle de PR).
2. `cd <dossier> && npm install` (crée `package-lock.json`, requis par `npm ci` en CI) puis `npm test`.
3. Premier commit, puis création du dépôt :
   - **Poste local** : `gh repo create Gatomlo/<slug> --private --source . --push` (public seulement si rien de personnel).
   - **Session Claude Code cloud** : l'outil `create_repository` n'est pas disponible. Demander à l'utilisateur de créer le dépôt vide sur github.com, puis `mcp__claude-code-remote__add_repo` (access `push`), cloner dans le chemin indiqué et y copier le projet.
4. Renseigner la description et les sujets du dépôt ; vérifier que `.gitignore` exclut `data/`, `node_modules/`, `.env` (le script `audit.js` le contrôle).

## 2. Lire les dépôts de référence sans tout explorer
- Lister : `mcp__claude-code-remote__list_repos` (filtre `query`), ou `gh repo list Gatomlo --limit 100`.
- Lecture seule d'un dépôt public : `git clone --depth 1 https://github.com/Gatomlo/<dépôt> <dossier>/<dépôt>` (un clone à la fois, délai généreux), puis ne lire que le fichier cité dans `modules-reutilisables.md`.
- Chercher une fonction : `gh api -X GET search/code -f q='<terme> user:Gatomlo' --paginate`.
- Dépôt privé ou écriture : `add_repo` avec `access: "push"`. Refus d'accès → l'utilisateur reconnecte GitHub (claude.ai › connecteurs).

## 3. Branches, commits, PR
- Une branche par sujet, `claude/<sujet>` quand Claude travaille ; jamais de push direct sur `main` d'une app déployée.
- Un commit par étape du cahier des charges, message court en français à l'impératif (« Ajoute… », « Corrige… »).
- `npm test` vert avant de pousser. **Créer une PR seulement si on le demande** ; reprendre les rubriques de `.github/pull_request_template.md`.
- Pour une PR ouverte : l'abonner (`subscribe_pr_activity`) afin de traiter commentaires et échecs de CI ; ne jamais désactiver ni sauter un test pour passer au vert.
- Branche déjà fusionnée : repartir de `origin/main` (`git checkout -B <branche> origin/main`), ne pas empiler sur l'historique fusionné.

## 4. Intégration continue
`.github/workflows/test.yml` : Node 22, `npm ci`, `npm test` sur push `main` et sur chaque PR. Les tests utilisent une base temporaire (`<APP>_DATA_DIR`), aucun secret n'est requis ; ne jamais mettre de clé API réelle dans le dépôt ni dans le workflow.

## 5. Déploiement depuis GitHub
- Serveur Infomaniak : `cd node-gateway/apps && git clone https://github.com/Gatomlo/<slug>.git <slug>` puis `npm install` à la racine de la passerelle ; mise à jour : `git pull`, `npm install --omit=dev` si `package*.json` ont changé, redémarrer le site Node. Dépôt privé : clé de déploiement (lecture seule) ou jeton.
- Sans Git sur le serveur : SFTP de `lib/ public/ server.js package*.json`, jamais `data/`.
- Avant de déployer : `node scripts/audit.js . --test`.

## 6. Garder le skill lui-même à jour
Le skill vit dans `.claude/skills/app-socle/`. Pour l'avoir partout : le placer dans un dépôt dédié (ex. `Gatomlo/app-socle`) et le cloner dans `~/.claude/skills/app-socle` (ou le copier) ; `git pull` pour le mettre à jour. Après chaque projet : consigner les nouveaux pièges dans `references/conventions.md` et les nouveaux modules réutilisables dans `modules-reutilisables.md`.
