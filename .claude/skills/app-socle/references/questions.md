# Questions initiales d'un nouveau projet

Outil : `AskUserQuestion` (2 à 4 options, « Autre » ajouté automatiquement). Ne poser que ce qui reste ambigu ; mettre le défaut en premier avec « (Recommandé) ». Texte en français.

## Série 1 (une seule fois, 4 questions)
1. **Utilisateurs** — Qui utilise l'app ?
   - Un seul compte (moi / le foyer partagé) *(défaut : compte unique, `templates/`)*
   - Plusieurs comptes avec invitation (premier compte = admin) → `scaffold.js --multi` ; rôles fins/cercles étanches → ensuite `kdo/lib/{circle,access}.js`
   - Profils sans compte gérés par un parent (enfants) → `CahierMalin`, `Lexiquest`
   - Public sans connexion + espace admin → `defifous`, `Phoenix-Quest-V2`
2. **Données et hors ligne** — Où vivent les données ?
   - SQLite sur le serveur (`node:sqlite`) *(défaut)*
   - Fichiers JSON sur le serveur (petit volume, Node < 22.5) → `Repetito`, `mAInotes`
   - Navigateur seul (`localStorage`, sans compte) → `Fretly`
   - Et hors ligne : lecture seule (service worker) / saisie avec file d'attente de synchro (`feelezcomptes`, `mAInotes`) / aucun besoin.
3. **Fonctions** (multiSelect) — IA · notifications push · e-mails · temps réel (Socket.IO) · photos/fichiers · QR codes · import/export · rappels planifiés · aucune. Chaque coche renvoie à un module du skill (`add-module.js` : push, mail, ia, photos, qr, backup) ou, à défaut, à `modules-reutilisables.md`.
4. **Déploiement** — node-gateway sur Infomaniak *(défaut)* / serveur autonome / pas encore décidé (on garde la compatibilité gateway).

## Série 2 (seulement si utile)
- **IA cochée** : fournisseur (Infomaniak par défaut, Claude, Gemini, Mistral) ; déclenchement automatique ou manuel ; texte seul / voix / images ; plafond mensuel.
- **Identité** : nom, couleur d'accent, courte description (déduire de la demande, ne demander que s'il manque).
- **Démarrage** : maquette HTML interactive d'abord (`add-module.js maquette`) *(défaut si l'écran est complexe)* / cahier des charges puis code / squelette direct.
- **GitHub** : nouveau dépôt `Gatomlo/<slug>` privé *(défaut)* / public / pas de dépôt pour l'instant ; CI de tests oui/non.
- **Public visé** : âge, appareil principal (smartphone/tablette/PC), accessibilité (texte agrandi, mode simplifié).

## Après les réponses
Résumer en 5 lignes (utilisateurs, données, hors ligne, fonctions, déploiement), attendre le « ok », puis : scaffold (`--multi` si besoin) → `add-module` pour chaque fonction cochée → adapter `lib/db.js`/`lib/api.js` → ajouter les modules cochés → renseigner `CLAUDE.md` (section « Décisions déjà prises » reprenant les réponses).
