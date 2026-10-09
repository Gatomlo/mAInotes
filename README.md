# Carnet de notes intelligent

Application de prise de notes libres (texte, vocal, image), rangées automatiquement par IA dans des **carnets** et des **tags**, avec synchronisation smartphone / ordinateur. Hébergement prévu sur un serveur Infomaniak, IA Infomaniak par défaut, Gemini ou Claude en option.

Ce dépôt ne contient **pas encore de code d'application** : il rassemble la conception, pour lancer le développement ensuite.

## Contenu

| Dossier | Description |
|---|---|
| `docs/cahier-des-charges.md` | Cahier des charges complet (fonctions F1 à F63, pipeline IA, modèle de données, architecture, déploiement, sobriété IA, risques). |
| `prototype/carnet.html` | Maquette interactive d'une seule page (IA simulée, données dans le navigateur). À ouvrir dans un navigateur. |
| `maquettes/` | Sources des écrans (`*.dc.html`) et plan de la planche (`canvas.json`). |
| `CLAUDE.md` | Consignes pour démarrer le développement avec Claude Code. |

## Idées directrices

- **Sobriété IA en priorité** : classement sur le texte seul, petit modèle, transcription faite une seule fois, vocaux limités à 2 minutes, budget mensuel, appels manuels ou automatiques au choix.
- **Tout est paramétrable** : IA par fonction, clés API, recours à un autre fournisseur, durée audio, carnets et tags (ajout, édition, suppression, fusion), création de carnets/tags par l'IA (strict ou suggestions).
- **Synthèses** : courte, document complet ou texte rédigé, avec historique, copie et PDF.
- Les clés API restent côté serveur.

## Prochaines étapes

1. Confirmer l'offre Infomaniak (hébergement web ou VPS) et la disponibilité d'un modèle d'analyse d'images.
2. Suivre le plan de réalisation du cahier (MVP en premier).
3. Utiliser `prototype/carnet.html` comme référence de comportement.
