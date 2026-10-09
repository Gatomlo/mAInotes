# Consignes pour le développement

Lire d'abord `docs/cahier-des-charges.md`, puis ouvrir `prototype/carnet.html` pour le comportement attendu.

## Décisions déjà prises
- Une note appartient à **un seul carnet** et peut avoir **plusieurs tags**. « Catégorie » dans les anciennes sections du cahier = « carnet ».
- PWA, notes stockées sur le serveur, compte utilisateur, file d'attente hors connexion.
- Fournisseurs d'IA derrière une interface commune. Infomaniak par défaut (API compatible OpenAI), Gemini et Claude optionnels, inactifs par défaut. Clés API uniquement côté serveur, chiffrées.
- Sobriété IA : classement sur le texte seul, transcription une seule fois, vocal 2 minutes maximum, photo réduite avant envoi, plafond mensuel avec alerte à 80 %.
- Déclenchement de l'analyse automatique ou manuel, réglable.
- Un carnet choisi à la création n'est jamais modifié par l'IA ni par un re-tri.
- La création de carnets/tags par l'IA est une suggestion, jamais appliquée sans clic (mode strict par défaut).
- Synthèse : toujours manuelle, un seul appel, avec confirmation ; trois formats ; enregistrée dans un historique réouvrable sans appel IA.

## Langue
Interface et textes en français (Belgique).

## Points ouverts
Offre Infomaniak (hébergement web ou VPS), modèle de vision disponible chez Infomaniak, consommation mensuelle cible.
