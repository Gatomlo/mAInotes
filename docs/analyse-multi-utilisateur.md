# Analyse : passer mAInotes en multi-utilisateur

État au 13 octobre 2026. Aucun code n'est encore modifié : ce document recense ce qui suppose
aujourd'hui « un seul compte », propose une architecture cible et un découpage en étapes, et liste les
décisions à prendre avant de coder.

## 1. Constat : où le « compte unique » est inscrit dans le code

| Endroit | Hypothèse actuelle | Effet en multi-utilisateur |
|---|---|---|
| `lib/store.js` | Une seule base `data/db.json` qui contient `user`, `sessions`, notes, carnets, tags, réglages, clés, consommation, journal. Réécrite en entier, de façon synchrone, à chaque modification. | Mélange des données de tous ; chaque écriture réécrit tout le monde ; une base corrompue touche tous les comptes. |
| `lib/store.js` `reset()` | Efface toute la base et tout `data/media/`. | La suppression d'un compte effacerait **tous** les comptes. |
| `lib/auth.js` | `db.user` unique ; `POST /auth/setup` refusé dès qu'un compte existe ; connexion comparée à ce seul identifiant ; sessions sans lien vers un utilisateur. | Impossible de créer un second compte ; une session ne dit pas à qui elle appartient. |
| `lib/auth.js` limitation des essais | 5 échecs par adresse IP. | Plusieurs personnes derrière la même box se bloquent mutuellement ; une attaque répartie sur un identifiant n'est pas freinée. |
| `lib/api.js` | Le routeur ferme sur un seul `store` ; `lastMerge` (annulation de fusion) est une variable du module. | Toutes les routes lisent la même base ; l'annulation d'une fusion serait partagée. |
| `lib/pipeline.js` | Une file d'analyse en mémoire, un re-tri, un historique de synthèses, liés au `store` unique. | À dupliquer par utilisateur, ou à rendre conscient de l'utilisateur. |
| `lib/ai/index.js` | Clés API, réglages des fournisseurs, plafond mensuel, quotas (compteur par minute en mémoire, par jour dans la base) et journal dans la base unique. | Il faut décider qui paie et qui règle l'IA ; les quotas d'un fournisseur sont ceux d'**une clé**, donc partagés si la clé l'est. |
| `DEFAULT_SETTINGS` | Mélange réglages d'instance (clés, adresse Infomaniak, modèles, quotas, taille max des fichiers) et préférences personnelles (déclenchement, contexte, consignes, carnet par défaut, historique). | À séparer : réglages d'administration / réglages personnels. |
| `scripts/reset-password.js` | Réinitialise « le » compte. | Doit demander quel compte. |
| `server.js` | `pipeline.resume()` et la purge de la corbeille ne voient qu'une base. | Au démarrage, il faut reprendre les analyses interrompues de chaque utilisateur. |
| Front `public/js/core.js` | Cache `mainotes-cache-v1`, historique `mainotes-hist` (localStorage) et file hors connexion IndexedDB `mainotes/outbox` sans identifiant d'utilisateur. | Sur un appareil partagé, une personne verrait le cache de la précédente, et une note en attente partirait sur le compte de la personne connectée ensuite. |
| Front `public/sw.js` | Cache des médias `…-media` gardé après déconnexion. | Images et audios d'un compte restent lisibles hors connexion après déconnexion. |
| Front `public/js/auth.js`, `settings.js` | Écran « Bienvenue » de création unique ; après suppression du compte, retour à cet écran. | À remplacer par connexion / invitation. |
| Documentation | Cahier des charges (périmètre « un seul utilisateur », F21, F64–F71), `CLAUDE.md` (« Un seul compte »), `deploiement-infomaniak.md`. | Décisions à réviser explicitement. |

Ce qui est déjà compatible : chemins relatifs et montage sous `/mainotes`, cookie limité au chemin,
protection CSRF par en-tête, mots de passe scrypt, chiffrement des clés, accès aux médias contrôlé par la
note (`/media/:noteId/:mediaId`), export JSON, protection SSRF des aperçus de liens.

## 2. Architecture proposée : un espace de données par utilisateur

L'idée est de **ne pas réécrire** `api.js` ni `pipeline.js` : ils fonctionnent déjà sur « un store ». On
leur donne simplement un store par utilisateur.

```
data/
  accounts.json        comptes (id, nom, identifiant, hash, rôle, état, dates), sessions, invitations
  instance.json        réglages d'administration : fournisseurs, clés chiffrées, modèles, quotas, plafonds
  secret.key
  users/
    <userId>/
      db.json          notes, carnets, tags, synthèses, re-tris, réglages personnels, consommation, journal
      media/
```

- **`AccountStore`** (nouveau) : comptes et sessions. Une session porte `userId`.
- **`Store`** (existant, presque inchangé) : instancié par utilisateur sur `data/users/<id>/`. `user` et
  `sessions` en sortent ; `reset()` n'efface plus que ce dossier.
- **Espace de travail** : `workspaceFor(userId)` crée à la demande `{ store, ai, pipeline, router }` en
  appelant les fabriques actuelles, et le garde en mémoire (avec déchargement des espaces inactifs si le
  nombre d'utilisateurs grandit). Dans `server.js` :

  ```js
  api.use(auth.requireAuth);                       // pose req.userId
  api.use((req, res, next) => workspaceFor(req.userId).router(req, res, next));
  ```

  `lastMerge`, la file d'analyse et le re-tri deviennent ainsi naturellement propres à chaque utilisateur.
- **IA** : `createAI` lit les clés, modèles et quotas dans `instance.json` (partagés) et la consommation
  dans la base de l'utilisateur. Le comptage des quotas par minute et par jour doit être **commun à tous
  les espaces** qui utilisent la même clé (un limiteur partagé passé à chaque `createAI`), sinon
  l'application dépasserait les quotas du fournisseur.
- **Démarrage** : `server.js` parcourt `data/users/*` pour relancer les analyses interrompues et purger
  les corbeilles (ou tient un petit index des utilisateurs ayant du travail en attente).
- **Écriture** : chaque utilisateur a son fichier, donc une écriture ne réécrit que ses données. Le
  stockage JSON reste suffisant pour quelques dizaines d'utilisateurs ; au-delà, passer à SQLite
  demanderait un module natif, ce que l'hébergement mutualisé ne garantit pas (voir `CLAUDE.md`).

### Rôles et comptes

- **Administrateur** : le premier compte (création à la première ouverture, `MAINOTES_SETUP_TOKEN`
  inchangé). Il gère les fournisseurs d'IA, les clés, les plafonds, et les comptes (inviter, suspendre,
  supprimer). Il **ne voit pas** les notes des autres.
- **Utilisateur** : ses notes, carnets, tags, synthèses, réglages personnels, son compte (F67–F70).
- **Création des comptes suivants** : par lien d'invitation à usage unique généré par l'administrateur
  (recommandé ; pas d'envoi d'e-mail nécessaire), plutôt qu'une inscription ouverte.
- **Mot de passe oublié** : l'administrateur génère un lien de réinitialisation ; le script
  `npm run reset-password` prend un identifiant en argument.

### Réglages : partage proposé

| Instance (administrateur) | Personnel (chaque utilisateur) |
|---|---|
| Fournisseurs activés, clés, modèles, adresse Infomaniak, quotas | Fournisseur choisi par fonction, parmi ceux activés |
| Plafond mensuel global et plafond par utilisateur | Déclenchement auto/manuel, recours, propositions de carnets/tags |
| Durée max des vocaux, poids max des images (bornes) | Carnet par défaut, contexte (F79), consignes par type |
| Nombre max de notes/mots d'une synthèse (bornes) | Taille de l'historique des synthèses |

## 3. Front et PWA

- Préfixer les clés locales par l'identifiant d'utilisateur (`mainotes-cache-v1:<userId>`, idem
  historique), ou tout effacer à la déconnexion.
- File hors connexion : enregistrer `userId` avec chaque élément et ne rejouer que ceux du compte
  connecté ; avertir à la déconnexion s'il reste des notes non envoyées.
- Service worker : vider le cache des médias à la déconnexion (message `postMessage` au SW).
- Écrans : connexion, acceptation d'invitation (nom, mot de passe), panneau « Administration » réservé à
  l'administrateur (comptes, IA, consommation par utilisateur). Les réglages IA actuels y migrent en
  grande partie.

## 4. Sécurité et RGPD

- Isolation : toute route passe par l'espace de l'utilisateur de la session ; ajouter au test un second
  compte qui tente de lire, modifier et télécharger les notes et médias du premier (doit recevoir 404).
- Limitation des essais : par identifiant **et** par adresse IP.
- Suppression d'un compte : efface `data/users/<id>/` et ses sessions, rien d'autre. L'administrateur ne
  peut pas supprimer son propre compte tant qu'il est le seul administrateur.
- RGPD : avec plusieurs personnes, l'exploitant devient responsable de traitement pour des tiers. Prévoir
  une page d'information (données conservées, fournisseurs d'IA destinataires du texte, des audios et des
  images, durée de conservation, droit à l'export et à l'effacement — déjà couverts par F69 et F70).
- Coûts : un plafond par utilisateur évite qu'une personne épuise le budget commun.

## 5. Migration des données existantes

Au premier démarrage de la nouvelle version, si `data/db.json` contient un `user` et que
`accounts.json` n'existe pas :

1. copie de sauvegarde `data/db.json.avant-multi` ;
2. création de `accounts.json` avec ce compte en administrateur, sessions conservées (on reste connecté) ;
3. création de `instance.json` avec clés, modèles, quotas et plafonds actuels ;
4. déplacement des notes, carnets, tags, synthèses, réglages personnels, consommation et journal vers
   `users/<id>/db.json`, et de `media/` vers `users/<id>/media/`.

Opération idempotente, testée par `npm test` sur une base au format actuel.

## 6. Découpage proposé

1. **Fondations, sans changement visible** : `AccountStore`, espaces par utilisateur, `instance.json`,
   migration automatique, sessions liées à `userId`, front avec caches par utilisateur. L'application
   reste mono-compte à l'écran. `npm test` vert + test de migration.
2. **Comptes multiples** : rôle administrateur, invitations, suspension, suppression d'un compte,
   limitation des essais par identifiant, test d'isolation entre deux comptes.
3. **IA partagée** : séparation des réglages instance/personnel, limiteur de quotas commun, plafond par
   utilisateur, consommation par utilisateur dans l'administration.
4. **Documentation** : cahier des charges (périmètre, F21, F64–F71 et nouvelles fonctions), `CLAUDE.md`,
   guide de déploiement (nouveaux fichiers de données, sauvegarde, réinitialisation).

## 7. Décisions à prendre

1. **Qui paie l'IA ?** Clés de l'administrateur partagées avec plafond par utilisateur (proposé), ou
   chaque utilisateur saisit ses propres clés (plus simple pour les coûts, plus lourd pour les
   utilisateurs, et les quotas deviennent propres à chacun).
2. **Comment arrive-t-on ?** Invitation par l'administrateur (proposé), inscription libre avec code, ou
   inscription libre.
3. **L'administrateur voit-il quelque chose des autres ?** Proposé : uniquement nom, identifiant, date de
   dernière activité, consommation IA et espace disque ; jamais le contenu.
4. **Ordre de grandeur** : nombre d'utilisateurs attendu (quelques proches, une équipe, public ?). Au-delà
   de quelques dizaines, le stockage JSON et le processus unique de la passerelle deviennent la limite.
5. **Partage entre utilisateurs** (carnet partagé, note envoyée à quelqu'un) : hors périmètre de cette
   étape, mais l'architecture « un espace par utilisateur » le rendra plus coûteux plus tard. À
   confirmer.
