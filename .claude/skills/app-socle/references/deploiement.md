# Déploiement (Infomaniak via node-gateway)

Hébergement mutualisé = **une seule app Node**. `Gatomlo/node-gateway` monte chaque dossier de `apps/` sur `/<dossier>` (`app.use('/<nom>', sousApp)`), lit `manifest.json`/`package.json` (+ bloc `"gateway": {name, description, color, tags}`) pour la page d'accueil, et propose `attachToServer(httpServer, {mountPath})` pour Socket.IO.

## Checklist « montable »
1. `server.js` exporte l'app ; `listen` et handlers globaux uniquement si lancé seul.
2. Aucun chemin absolu côté navigateur ; `<base href>` injecté ({{ROOT}}) ; cookie `Path=<montage>/`.
3. Express 4 ; pas de dépendance native ; `engines.node` ≥ 22.5 si `node:sqlite`.
4. `data/` hors dépôt ; variable `<APP>_DATA_DIR` ; `<APP>_PUBLIC_URL` pour les liens ; `<APP>_SECRET` pour le chiffrement.

## Procédure
```bash
cd apps && git clone https://github.com/Gatomlo/<depot>.git <slug> && cd .. && npm install   # postinstall installe chaque app
```
Redémarrer le site Node (manager Infomaniak), vérifier `✓ <slug> monte sur /<slug>`, **ouvrir l'URL tout de suite** pour créer le compte (ou définir `<APP>_SETUP_TOKEN`). Mises à jour : envoyer `lib/ public/ server.js` (+ `package*.json` puis `npm install --omit=dev`), jamais `data/`, redémarrer ; les migrations s'appliquent au démarrage.

## Dev local (Windows)
Jonction `mklink /J node-gateway\apps\<slug> <dossier du projet>` ; passerelle sur http://localhost:3000/<slug>/ ; tuer le process du port 3000 avant de relancer.
