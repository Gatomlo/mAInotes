# Consignes pour le développement

Lire d'abord `docs/cahier-des-charges.md`. Le comportement de référence est celui de l'app (`public/`).

`prototype/carnet.html` n'a servi qu'avant le codage de l'app : ne plus le modifier ni y reporter les évolutions.

## Décisions déjà prises
- Une note appartient à **un seul carnet** et peut avoir **plusieurs tags**. « Catégorie » dans les anciennes sections du cahier = « carnet ».
- PWA, notes stockées sur le serveur, compte utilisateur, file d'attente hors connexion.
- Premier compte (administrateur) créé à la première ouverture après déploiement, modifiable dans l'onglet Compte (F64–F71). Autres comptes créés par l'administrateur, données privées par défaut, partage de carnets/notes/tâches en lecture ou modification, IA et budget communs gérés par l'administrateur (F113–F120).
- Déploiement Infomaniak via `node-gateway` : `server.js` exporte l'app Express, chemins navigateur toujours relatifs, aucune dépendance native (stockage JSON + fichiers dans `data/`). Voir `docs/deploiement-infomaniak.md`.
- Notifications à la date d'une note ou tâche : Web Push (`lib/push.js`, `web-push`), un résumé par jour et par personne à l'heure choisie (F121–F123).
- Fournisseurs d'IA derrière une interface commune. Infomaniak par défaut (API compatible OpenAI), Gemini et Claude optionnels, inactifs par défaut. Clés API uniquement côté serveur, chiffrées.
- Sobriété IA : classement sur le texte seul, transcription une seule fois, vocal 2 minutes maximum, photo réduite avant envoi, plafond mensuel avec alerte à 80 %.
- Déclenchement de l'analyse automatique ou manuel, réglable.
- Un carnet choisi à la création n'est jamais modifié par l'IA ni par un re-tri.
- La création de carnets/tags par l'IA est une suggestion, jamais appliquée sans clic (mode strict par défaut).
- Synthèse : toujours manuelle, un seul appel, avec confirmation ; trois formats ; enregistrée dans un historique réouvrable sans appel IA.

- Espace de travail façon Notion (cahier, F94 à F112, maquette `docs/maquette-notion.html`) : fonctions activables dans Réglages (`settings.features`), données conservées si désactivées. Codé : tâches (F109 à F112), propriétés de carnet et vues tableau/kanban/calendrier (F98, F100), liens `[[Titre]]` et rétroliens (F102), modèles (F105). éditeur simplifié (mise en forme dans le texte, F94-F97), fonctions IA sur les notes (F107, F108, toujours manuelles, un appel). propriétés remplies par l'IA (F99) et notes liées suggérées (F104), proposées dans l'appel de classement sans appel en plus ; modifications de tâches et de propriétés hors connexion (file `ops` dans `core.js`). À faire ensuite, après essais en conditions réelles : blocs média dans la page et glisser-déposer, sous-pages, graphe, filtres enregistrés (F101), sélection multiple ; SQLite seulement si Node 22 est disponible chez Infomaniak.

## Langue
Interface et textes en français (Belgique).

## Points ouverts
Adresse exacte et noms de modèles de l'API IA Infomaniak (réglables dans l'app), modèle de vision disponible chez Infomaniak, consommation mensuelle cible.

## Code
- `server.js`, `lib/` (stockage, comptes, fournisseurs d'IA, analyse, API), `public/` (PWA sans framework ni étape de construction).
- `npm test` lance un test de bout en bout monté sous `/mainotes` avec un faux fournisseur : à garder vert.
