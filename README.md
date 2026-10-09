# Carnet de notes intelligent

Application de prise de notes libres (texte, vocal, image), rangées automatiquement par IA dans des **carnets** et des **tags**, avec synchronisation smartphone / ordinateur. Hébergement prévu sur un serveur Infomaniak, IA Infomaniak par défaut, Gemini ou Claude en option.

L'application (serveur Node.js + PWA) est prête à être déployée chez Infomaniak dans la passerelle [`node-gateway`](https://github.com/Gatomlo/node-gateway) : voir **[docs/deploiement-infomaniak.md](docs/deploiement-infomaniak.md)**. À la première ouverture, l'application demande de créer le compte unique qui protège les notes.

## Contenu

| Dossier | Description |
|---|---|
| `server.js`, `lib/` | Serveur Express : compte, stockage, analyse IA (Infomaniak, Gemini, Claude), API. Exporte l'app pour `node-gateway`. |
| `public/` | Application web installable (PWA), sans étape de construction. |
| `docs/deploiement-infomaniak.md` | Installation dans node-gateway, création du compte, IA Infomaniak, sauvegardes, mot de passe oublié. |
| `test/` | Test de bout en bout (`npm test`). |
| `docs/cahier-des-charges.md` | Cahier des charges complet (fonctions F1 à F71, compte utilisateur, pipeline IA, modèle de données, architecture, déploiement, sobriété IA, risques). |
| `prototype/carnet.html` | Maquette interactive d'une seule page (IA simulée, données dans le navigateur). À ouvrir dans un navigateur. |
| `maquettes/` | Sources des écrans (`*.dc.html`) et plan de la planche (`canvas.json`). |
| `CLAUDE.md` | Consignes pour démarrer le développement avec Claude Code. |

## Idées directrices

- **Sobriété IA en priorité** : classement sur le texte seul, petit modèle, transcription faite une seule fois, vocaux limités à 2 minutes, budget mensuel, appels manuels ou automatiques au choix.
- **Tout est paramétrable** : IA par fonction, clés API, recours à un autre fournisseur, durée audio, carnets et tags (ajout, édition, suppression, fusion), création de carnets/tags par l'IA (strict ou suggestions).
- **Synthèses** : courte, document complet ou texte rédigé, avec historique, copie et PDF.
- Les clés API restent côté serveur.

## Démarrage rapide

```bash
npm install
npm start      # http://localhost:3000
npm test
```

## Prochaines étapes

1. Déployer dans `node-gateway` et créer le compte (voir le guide de déploiement).
2. Saisir l'identifiant du produit IA et le jeton Infomaniak, tester la connexion, vérifier les noms de modèles.
3. Mesurer la qualité du classement et le coût réel sur quelques semaines, puis fixer les plafonds.
