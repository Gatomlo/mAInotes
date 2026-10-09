# Déploiement sur Infomaniak avec node-gateway

L'hébergement Infomaniak n'accepte qu'une seule application Node.js. La passerelle
[`node-gateway`](https://github.com/Gatomlo/node-gateway) est cette application unique : elle monte chaque
outil placé dans son dossier `apps/` sur une adresse portant le nom du dossier. mAInotes respecte ses
conventions :

- `server.js` exporte l'app Express et n'appelle `app.listen()` que s'il est lancé seul ;
- tous les chemins côté navigateur sont relatifs (`api/...`, `js/...`) ;
- `public/manifest.json` fournit l'icône affichée sur la page d'accueil de la passerelle.

Avec un dossier `apps/mainotes`, l'application répond sur `https://votre-domaine/mainotes/`.

## 1. Mise en place

Sur le serveur, dans le dossier de la passerelle (là où se trouve son `server.js`) :

```bash
cd apps
git clone https://github.com/Gatomlo/mAInotes.git mainotes   # dépôt privé : jeton GitHub ou clé de déploiement
cd ..
npm install          # installe la passerelle puis chaque outil de apps/ (script postinstall)
```

Sans accès Git sur le serveur, envoyez le contenu du dépôt par SFTP dans `apps/mainotes/` (sans
`node_modules/` ni `data/`), puis lancez `npm install` à la racine de la passerelle.

Redémarrez ensuite le site Node.js depuis le manager Infomaniak (fichier de démarrage : `server.js` de la
passerelle). Le journal doit afficher `✓ mainotes monte sur /mainotes`.

Version de Node.js : 18.17 au minimum, 20 ou plus récent conseillé (réglage du site dans le manager).

## 2. Première connexion : création du compte

1. Ouvrez `https://votre-domaine/mainotes/` **juste après le déploiement**.
2. L'écran « Bienvenue » demande un nom, un identifiant (adresse e-mail ou nom d'utilisateur) et un mot
   de passe de 10 caractères au moins. Ce compte est le seul de l'application.
3. Une fois le compte créé, l'écran de création n'est plus accessible : les visites suivantes affichent la
   connexion.

Tant que le compte n'existe pas, la première personne qui ouvre l'adresse peut le créer. Pour fermer cette
fenêtre, définissez la variable d'environnement `MAINOTES_SETUP_TOKEN` (une phrase au choix) avant le
premier démarrage : l'écran de création demandera alors ce code.

Le compte se modifie ensuite dans l'onglet **Compte** : nom affiché, identifiant (avec le mot de passe
actuel), mot de passe, appareils connectés, export des données et suppression complète.

## 3. Brancher l'IA Infomaniak

1. Dans le manager Infomaniak, ouvrez le produit **IA / API LLM** (créez-le au besoin) et notez son
   identifiant de produit (`product_id`).
2. Créez un jeton d'API avec l'accès à l'IA.
3. Dans mAInotes, onglet **Réglages** › Infomaniak : saisissez l'identifiant du produit, collez le jeton,
   cliquez **Enregistrer** puis **Tester la connexion**. La liste des modèles disponibles s'affiche.
4. Choisissez les modèles dans les menus de la section « Modèles » : ils listent ceux réellement ouverts à
   votre compte (lus au test de connexion, bouton « Actualiser la liste »). Par défaut : `mistral24b` pour
   le texte et les images, `whisper` pour l'audio. Un modèle retiré par le fournisseur est signalé « absent
   de la liste, à remplacer ».
5. Fixez le plafond mensuel (alerte à 80 %, blocage à 100 %).

L'adresse de l'API (`https://api.infomaniak.com/2/ai/{product_id}/openai/v1`) se change dans
« Adresse de l'API (avancé) » si Infomaniak la modifie. La transcription accepte une réponse immédiate
ou un traitement différé (`batch_id`). Gemini et Claude restent inactifs tant qu'aucune clé n'est saisie
et qu'ils ne sont pas activés.

## 3 bis. Installer sur le téléphone

Dans l'application : **Réglages › Installer sur cet appareil**. Choisissez l'ouverture sur l'accueil
(« Mes notes ») ou directement sur la création d'une note (« Nouvelle note »), puis :

- **Android (Chrome)** : bouton « Installer » du panneau, ou menu ⋮ › Installer l'application ;
- **iPhone / iPad (Safari)** : Partager › Sur l'écran d'accueil.

L'application s'ouvre en plein écran. Pour avoir les deux icônes, installez une fois avec chaque choix.
Sur Android, un appui long sur l'icône « Mes notes » propose les raccourcis Écrire, Parler et Photo.

## 4. Données et sauvegarde

Toutes les données sont dans un seul dossier :

| Fichier | Contenu |
|---|---|
| `db.json` (et `db.json.bak`) | Compte, notes, carnets, tags, synthèses, réglages, journal des appels |
| `media/` | Audios et images d'origine, et les versions réduites envoyées à l'IA |
| `secret.key` | Clé qui chiffre les clés d'API. Sans elle, les clés enregistrées sont à ressaisir |

Par défaut ce dossier est `apps/mainotes/data/`. Il est ignoré par Git : un `git pull` le conserve.
**Ne supprimez jamais `apps/mainotes/` pour redéployer** : faites un `git pull`, ou définissez
`MAINOTES_DATA_DIR` vers un dossier hors de la passerelle (par exemple `~/donnees/mainotes`).

Variables d'environnement reconnues :

| Variable | Rôle |
|---|---|
| `MAINOTES_DATA_DIR` | Dossier des données (défaut : `data/` dans l'application) |
| `MAINOTES_SETUP_TOKEN` | Code exigé pour créer le compte à la première ouverture |
| `MAINOTES_SECRET` | Clé de chiffrement des clés d'API, à la place du fichier `secret.key` |

Sauvegardez régulièrement le dossier de données entier. L'onglet Compte propose aussi un export JSON
complet (médias compris, clés d'API exclues).

## 5. Mettre à jour

```bash
cd apps/mainotes
git pull
cd ../..
npm install      # réinstalle seulement si package.json a changé
```

Puis redémarrez le site Node.js dans le manager.

## 6. Mot de passe oublié

Il n'y a pas d'envoi d'e-mail. En SSH :

```bash
cd apps/mainotes
npm run reset-password            # ou : MAINOTES_DATA_DIR=... npm run reset-password
```

Saisissez le nouveau mot de passe, puis **redémarrez** le site Node.js. Toutes les sessions sont fermées.

## 7. Points de vigilance

- **HTTPS obligatoire** : le micro du navigateur et l'installation en PWA l'exigent, et le cookie de session
  est marqué `Secure` derrière HTTPS.
- Le cookie de session est limité au chemin `/mainotes` : il ne circule pas vers les autres outils de la
  passerelle.
- L'analyse tourne dans le processus Node de la passerelle (file en mémoire). Au redémarrage, les
  analyses interrompues reprennent.
- Un seul processus doit écrire dans le dossier de données : ne lancez pas mAInotes seul en parallèle de
  la passerelle sur le même dossier.

## Développement local

```bash
npm install
npm start            # http://localhost:3000, données dans ./data
npm test             # test de bout en bout, monté sous /mainotes avec un faux fournisseur d'IA
```

Pour tester dans la passerelle sans copier le code : `apps/mainotes` en lien symbolique (ou jonction
Windows) vers ce dossier, comme décrit dans le README de node-gateway.
