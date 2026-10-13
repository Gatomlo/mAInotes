# Analyse : mAInotes multi-utilisateur, SQLite et partage

Version 2, 13 octobre 2026. Remplace la première analyse, qui proposait un dossier de données par
utilisateur. Le partage de notes et les carnets communs changent la donne : les données de plusieurs
personnes doivent pouvoir se croiser. Une base unique avec des droits d'accès est donc plus simple
qu'un espace séparé par personne.

Le code n'est pas encore modifié. Ce document fixe les décisions prises, propose le modèle de données
et les règles de partage, puis découpe le travail en étapes.

## 1. Décisions prises

| Sujet | Décision |
|---|---|
| Clé d'IA | Une clé unique par fournisseur, réglée par l'administrateur, utilisée pour tous. |
| Coûts | Un compteur par utilisateur et un plafond mensuel par utilisateur, fixés par l'administrateur. |
| Création de compte | Uniquement par une invitation de l'administrateur. |
| Administrateur | Voit les comptes, leur activité et leur consommation, jamais le contenu des notes. |
| Taille | 4 à 5 utilisateurs. |
| Stockage | Passage à SQLite. |
| Partage | Partage de notes entre utilisateurs, et carnets communs. |

## 2. SQLite sans dépendance native

`CLAUDE.md` exclut les modules à compiler (`better-sqlite3`), parce que l'hébergement Infomaniak ne
garantit pas leur compilation. La solution est le module **`node:sqlite` intégré à Node.js** : rien à
installer ni à compiler, et son interface synchrone (`DatabaseSync`) s'accorde avec le code actuel.

- **Version de Node** : `node:sqlite` est utilisable sans option depuis Node 22.13, mais affiche
  encore un avertissement « experimental ». Viser **Node 24 LTS (24.16 ou plus récent)**. Des
  défauts du module ont été corrigés en 2026, notamment le décodage du texte, corrigé à partir de la
  24.16. `engines` passerait à `>=22.13`, et le démarrage refuserait une version trop ancienne avec un
  message clair. **À vérifier dans le manager Infomaniak** : les versions de Node proposées pour le site.
- **Écarté** : `sql.js` (SQLite compilé en WebAssembly). Il garde toute la base en mémoire et la
  réécrit en entier à chaque sauvegarde, ce qui n'apporte rien par rapport au JSON actuel.
- **Mode du journal** : le mode WAL, plus rapide, a besoin de mémoire partagée. Il pose problème si le
  disque de l'hébergement est un disque réseau. Démarrer en mode `DELETE` (le mode par défaut, sûr),
  puis tester WAL sur le serveur.
- **Sauvegarde** : copier le fichier pendant que l'application tourne peut donner une copie
  incohérente. Une sauvegarde quotidienne par `VACUUM INTO 'data/sauvegardes/…'`, avec les 7
  dernières conservées, rend la copie du dossier `data/` sûre.
- **Médias** : ils restent des fichiers dans `data/media/`, et seuls leurs métadonnées vont dans la base.
- **Évolutions du schéma** : numéro de version dans `PRAGMA user_version`, avec des migrations
  numérotées appliquées au démarrage.

## 3. Modèle de données

Pour les champs riches d'une note (médias, liens, suggestion, enrichissement, fournisseurs), une
colonne JSON `data` garde la souplesse actuelle. Ce qui sert à filtrer, à trier ou à contrôler l'accès
va dans des colonnes à part.

```
users              id, name, login (unique, sans casse), password, role (admin|member),
                   status (active|suspended), budget_eur (plafond mensuel, null = aucun),
                   created_at, password_changed_at, last_seen_at
sessions           id, user_id, hash, device, created_at, last_seen
tokens             id, kind (invite|reset), hash, user_id (reset), created_by, expires_at, used_at
instance_settings  key, value (JSON) — fournisseurs, clés chiffrées, modèles, quotas,
                   plafonds globaux, bornes (vocal, image, synthèse)
user_settings      user_id, value (JSON) — déclenchement, recours, propositions, carnet par défaut,
                   contexte (F79), consignes par type, historique des synthèses

notebooks          id, owner_id, shared (0|1), name, desc, color, ai_suggest (0|1), created_at
notebook_members   notebook_id, user_id, role (owner|editor|reader), added_at
notebook_order     user_id, notebook_id, position          ordre propre à chacun

notes              id, author_id, notebook_id, client_id, type, title, content, transcript,
                   description, status, locked, version, created_at, updated_at, trashed_at,
                   trashed_by, data (JSON)                  unique (author_id, client_id)
note_shares        note_id, user_id, permission (read|edit), shared_by, shared_at
note_user          note_id, user_id, read (todo|done), read_at, seen_at, hidden
tags               id, user_id, name, desc                  unique (user_id, name)
note_tags          note_id, user_id, tag_id

syntheses          id, user_id, … (champs actuels), note_ids (JSON)
retris             id, user_id, … (champs actuels)
ai_usage           month, user_id, provider, calls, cost
ai_log             id, date, user_id, fn, provider, cost, ok, tokens_in, tokens_out, error, note_id
ai_limits          provider, day, calls, last_quota (JSON)   commun : la clé est commune
```

La personne qui crée une note en est **l'auteur**, et non plus « le propriétaire ». Dans un carnet
commun, la note appartient au carnet, mais l'auteur reste affiché.

### Règle d'accès unique

Une seule fonction, `canSee(user, note)`, et sa version SQL `visibleNotes(user)`. Elle est
utilisée par **toutes** les routes, les médias, la synthèse et l'export.

Un utilisateur voit une note si au moins une de ces conditions est vraie :
1. il en est l'auteur et elle est dans un carnet personnel ou sans carnet ;
2. elle est dans un carnet commun dont il est membre ;
3. elle lui a été partagée (`note_shares`).

`canEdit(user, note)` suit le même schéma. Peuvent modifier : l'auteur, un éditeur ou le propriétaire
du carnet commun, et le destinataire d'un partage « modification ».

## 4. Règles de partage proposées

### Carnets communs

- Tout utilisateur peut créer un carnet commun, ou rendre commun un de ses carnets. Il en devient
  propriétaire et y ajoute des membres parmi les comptes existants, en **éditeur** ou en **lecteur**.
- Toutes les notes du carnet sont visibles par tous les membres. Les éditeurs ajoutent, modifient et
  mettent à la corbeille. Les lecteurs lisent, et ajoutent leurs tags et leur état « À lire ».
- **Mettre une note dans un carnet commun est toujours un geste explicite**, avec une confirmation
  qui nomme les membres (« Visible par Anne, Marc »). Une note créée directement dans un carnet commun
  suit la règle actuelle : un carnet choisi à la création n'est jamais modifié par l'IA.
- **L'IA ne range jamais une note dans un carnet commun**, et le re-tri ne fait jamais entrer ni
  sortir une note d'un carnet commun. Sans ce verrou, une note privée pourrait devenir visible par
  d'autres sans que personne ne l'ait décidé. Option par carnet, `ai_suggest` (désactivée par défaut) :
  l'IA peut **suggérer** ce carnet, et la suggestion ne s'applique qu'au clic, comme le mode strict
  actuel.
- Nom, description et couleur du carnet commun sont partagés et modifiables par le propriétaire.
  L'ordre des carnets reste propre à chacun.
- Le propriétaire supprime le carnet : chaque note revient dans les notes de son auteur, « à
  vérifier ». Un membre qui quitte le carnet voit les notes qu'il y a écrites rester dans le carnet
  (voir la décision 2 en section 9).

### Partage d'une note

- L'auteur partage une note avec un ou plusieurs utilisateurs, en **lecture** ou en
  **modification**. Il peut retirer le partage à tout moment.
- Le destinataire la trouve dans une vue **« Partagées avec moi »**, avec « partagée par X ». Il ne
  voit pas le carnet personnel de l'auteur et ne peut pas la déplacer : une note n'a qu'un carnet,
  celui de son auteur. Il peut la masquer de sa liste, y mettre ses tags et son état « À lire ».
- Avec la modification, il change le titre, le texte et la transcription. Il ne peut ni la supprimer,
  ni changer son carnet, ni la repartager.
- Une note d'un carnet commun n'a pas besoin d'être partagée en plus. Son partage individuel reste
  possible vers quelqu'un qui n'est pas membre.

### Tags, « À lire » et nouveautés

- **Les tags restent personnels.** Chacun a sa liste. Sur une note partagée ou commune, chacun voit et
  pose ses propres tags. L'analyse IA pose les tags de l'auteur. Pas de tags communs dans cette version.
- **« À lire / Lu » devient personnel** (`note_user`) : ce que l'un a lu ne change rien pour l'autre.
- **Nouveautés** : un badge signale les notes ajoutées ou modifiées par d'autres depuis la dernière
  visite (`seen_at`), dans « Partagées avec moi » et sur chaque carnet commun.

### Modifications simultanées

Le cahier des charges dit « la dernière écriture l'emporte ». C'était acceptable entre deux appareils
d'une même personne, mais pas entre deux personnes. Proposition : chaque note a un numéro de `version`.
Une modification du titre, du texte ou de la transcription envoie la version de départ. Si une autre
personne a modifié la note entre-temps, le serveur répond 409 avec la note à jour, et l'écran propose
« Garder ma version » ou « Prendre la sienne ». Le classement et les tags ne posent pas ce problème.

## 5. IA : clé commune, compteur et plafond par personne

- **Réglages d'administration** : fournisseurs activés, clés, adresse Infomaniak, modèles, quotas,
  plafond global par fournisseur. Ils quittent les réglages de chacun pour un onglet
  **Administration**.
- **Réglages personnels** : fournisseur par fonction parmi ceux activés, déclenchement
  automatique ou manuel, recours, propositions, contexte, consignes par type de note.
- **Qui paie** : chaque appel est compté à la personne qui le déclenche. L'analyse automatique compte
  pour l'auteur de la note ; l'enrichissement, la relance d'une analyse, le re-tri et la synthèse
  comptent pour la personne qui clique.
- **Plafond** : fixé par l'administrateur pour chaque utilisateur, en euros par mois. L'alerte tombe à
  80 % (pour la personne et dans l'Administration), le blocage à 100 %. Le plafond global par
  fournisseur reste en place au-dessus.
- **Quotas des fournisseurs** : ils sont liés à la clé, donc comptés en commun (`ai_limits` et un seul
  compteur par minute en mémoire).
- **Équité** : une seule file d'analyse, servie à tour de rôle par utilisateur. Le re-tri de 2 000
  notes d'une personne ne bloque pas la note vocale d'une autre.
- **Prompts** : le classement d'une note utilise les carnets personnels, les tags et le contexte de
  son auteur. Il n'inclut les carnets communs que si leur option `ai_suggest` est active, et alors
  seulement comme suggestion.

## 6. Comptes et administration

- **Premier compte** : création à la première ouverture, inchangée (et `MAINOTES_SETUP_TOKEN`). Ce
  compte est l'administrateur.
- **Invitation** : l'administrateur crée un lien à usage unique, valable 7 jours, qu'il transmet
  lui-même (pas d'envoi d'e-mail). Le jeton est placé après `#` dans l'adresse, pour ne pas apparaître
  dans les journaux du serveur, et n'est stocké que haché. La personne choisit son nom, son
  identifiant et son mot de passe.
- **Mot de passe oublié** : l'administrateur génère un lien de réinitialisation (même mécanisme).
  `npm run reset-password -- <identifiant>` reste disponible en SSH, pour le cas où l'administrateur
  lui-même a perdu son mot de passe.
- **Onglet Administration** : liste des comptes (nom, identifiant, rôle, état, dernière activité,
  consommation du mois et plafond, espace des médias), invitations en cours, suspension, suppression,
  transmission du rôle d'administrateur, réglages de l'IA, journal des appels sans contenu.
- **Suppression d'un compte** : ses notes personnelles, ses médias, ses tags, ses synthèses, ses
  partages et ses sessions sont effacés. Le sort de ses notes dans les carnets communs est la
  décision 2. Le dernier administrateur ne peut pas supprimer son compte.
- **Limitation des essais de connexion** : par identifiant et par adresse IP, et non plus par adresse
  IP seule, pour ne pas bloquer toute une famille derrière la même box.

## 7. Effets sur le code

| Fichier | Changement |
|---|---|
| `lib/store.js` | Remplacé par `lib/db/` : ouverture de la base, schéma, migrations, fonctions d'accès (notes, carnets, tags, partages, comptes). Les tableaux en mémoire (`db().notes.find…`) disparaissent. |
| `lib/auth.js` | Tables `users`, `sessions` et `tokens`, invitations, rôles, `req.user` posé sur chaque requête. |
| `lib/api.js` | Chaque route passe par `canSee` ou `canEdit`. Nouvelles routes : membres des carnets, partages, vue « Partagées avec moi », nouveautés, administration. `lastMerge` devient propre à chaque utilisateur. |
| `lib/pipeline.js` | Contexte de l'auteur dans les prompts, carnets communs exclus du classement et du re-tri, file servie à tour de rôle. |
| `lib/ai/index.js` | Réglages de l'instance, consommation et plafond par utilisateur, quotas communs. |
| `server.js` | Ouverture de la base, migration, sauvegarde quotidienne, contrôle de la version de Node. |
| `scripts/reset-password.js` | Identifiant en argument, SQLite. |
| Front | Écran d'invitation, onglet Administration, fenêtre de partage, membres d'un carnet, vue « Partagées avec moi », auteur sur les notes, badges de nouveautés, fenêtre de conflit. Caches locaux et file hors connexion propres à chaque compte, et cache des médias vidé à la déconnexion. |
| `test/app.test.js` | Tests ajoutés : isolation entre deux comptes, droits de chaque rôle, IA qui ne range jamais dans un carnet commun, plafond par personne, conflit 409, migration depuis `db.json`. |

## 8. Migration des données actuelles

Au premier démarrage de la nouvelle version, si `data/db.json` existe et que `data/mainotes.sqlite`
n'existe pas :

1. le compte existant devient l'administrateur, et ses sessions sont gardées : on reste connecté ;
2. clés, modèles, quotas et plafonds vont dans `instance_settings` ; le reste des réglages va dans
   `user_settings` ; le plafond Infomaniak actuel devient son plafond personnel ;
3. carnets (personnels), tags, notes, synthèses, re-tris, consommation et journal sont rattachés à ce
   compte ; l'état « À lire » passe dans `note_user` ; les médias restent où ils sont ;
4. le tout se fait dans une seule transaction ; `db.json` est renommé `db.json.migre` et conservé.

Une erreur annule la transaction et laisse `db.json` intact. Un test de migration part d'une base au
format actuel.

## 9. Réalisation par étapes

Chaque étape laisse `npm test` vert et l'application utilisable.

0. **Prérequis** : vérifier la version de Node disponible chez Infomaniak (24.16 ou plus récent
   souhaité).
1. **SQLite, sans changement visible** : couche d'accès `lib/db/`, migration, sauvegarde
   quotidienne. L'application reste mono-compte et se comporte à l'identique.
2. **Comptes** : rôle administrateur, invitations, réinitialisation, suspension, suppression,
   limitation des essais ; caches du front par compte ; test d'isolation.
3. **IA commune** : onglet Administration (fournisseurs, clés, plafonds par personne), consommation
   par personne, quotas communs, file à tour de rôle.
4. **Carnets communs** : membres et rôles, confirmation avant d'y mettre une note, exclusion de l'IA et
   du re-tri, auteur affiché, « À lire » personnel, nouveautés.
5. **Partage de notes** : partage en lecture ou en modification, vue « Partagées avec moi », versions
   et conflits.
6. **Documentation** : cahier des charges (périmètre, F21, F64–F71 et nouvelles fonctions),
   `CLAUDE.md` (décisions, SQLite intégré), guide de déploiement (base, sauvegardes, Node 24,
   invitations).

## 10. Décisions encore ouvertes (propositions entre parenthèses)

1. **Tags** : personnels seulement (proposé), ou aussi des tags communs par carnet commun ?
2. **Départ d'un membre ou suppression de son compte** : ses notes dans un carnet commun restent,
   transférées au propriétaire du carnet avec « ancien membre » comme auteur, ou sont effacées avec
   lui ? (Proposé : choix proposé à la personne au moment de partir, effacement par défaut pour le
   RGPD.)
3. **Rôles** : lecteur et éditeur suffisent-ils ? Un destinataire peut-il repartager une note ?
   (Proposé : oui pour les deux rôles ; non pour le repartage.)
4. **IA et carnets communs** : autoriser la suggestion, jamais appliquée sans clic, carnet par carnet
   (proposé) ou l'exclure totalement ?
5. **Note partagée** : le destinataire peut-il la ranger dans un de ses carnets ? (Proposé : non, elle
   reste dans « Partagées avec moi ».)
6. **Analyse d'une note commune relancée par un autre membre** : payée par celui qui clique (proposé)
   ou par l'auteur ?
7. **Version de Node** proposée par Infomaniak pour le site (à relever dans le manager).
