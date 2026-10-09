# Cahier des charges – Carnet de notes intelligent

> Vocabulaire : dans les sections les plus anciennes, « catégorie » se lit « carnet » (voir la section « Carnets, tags et panneau de réglages »). Les schémas du document d'origine ne sont pas repris ici.


2026-10-09 ·

## Contexte et objectifs

On dépose une note sans réfléchir (texte, vocal ou photo) et l'IA la transcrit ou la décrit, puis la range dans les bonnes catégories et les bons tags.

Aujourd'hui, les idées sont dispersées entre applis de notes, messageries et galerie photo, et trier à la main décourage vite. Le projet retire cette étape : capturer d'abord, retrouver ensuite.

**Objectifs**

- Capturer une note en moins de 10 secondes, quel que soit le format.
- Obtenir automatiquement un titre, un classement et, pour les médias, un texte exploitable (transcription ou description).
- Garder la main : tout classement IA reste modifiable, et la liste des catégories et tags appartient à l'utilisateur.
- Pouvoir refaire le tri quand la structure évolue (nouvelle catégorie ou nouveau tag).
- Retrouver une note en moins de 15 secondes par filtre ou par recherche.

**Priorité transversale : la sobriété IA.** Chaque fonction se conçoit d'abord pour consommer le moins possible d'appels payants. Infomaniak est le fournisseur par défaut, un autre fournisseur n'intervient qu'à la demande, et une cible de consommation mensuelle chiffrée sera fixée après les mesures du prototype.

**Critères de réussite (cibles à valider)**

- Au moins 80 % des classements IA conservés sans correction après un mois d'usage.
- Transcription lisible sur un vocal de 2 minutes, avec les erreurs corrigeables en un clic.
- Aucune note perdue, même sans réseau au moment de la capture.

## Périmètre et utilisateurs

Le MVP vise un seul utilisateur, sur téléphone et ordinateur, avec trois formats de note et un classement automatique.

**Utilisateur cible** : une personne qui capture beaucoup (idées, rappels, photos de documents, mémos vocaux) et veut retrouver sans organiser. Pas de partage ni de travail en équipe dans la première version.

**Dans le MVP**

- Notes texte libre, notes vocales (enregistrement ou import audio) et notes image (photo ou import).
- Transcription automatique des vocaux et description automatique des images.
- Catégories et tags préétablis, classement automatique, correction manuelle.
- Re-tri à l'ajout d'une catégorie ou d'un tag.
- Affichage en cartes, filtres par catégorie et tag, recherche sur titre et contenu.

**Hors périmètre (versions ultérieures)**

- Partage de notes, collaboration, comptes multiples.
- Rappels et dates d'échéance, intégration calendrier.
- Export vers d'autres outils, sauf export brut des données.
- Reconnaissance de texte dans les images au-delà de ce que la description inclut.

## Parcours clés

Trois parcours portent toute la valeur du produit : capturer, retrouver, faire évoluer la structure.

**1. Capturer une note**

1. L'utilisateur ouvre l'appli et choisit un format : écrire, enregistrer un vocal ou ajouter une image.
2. La note apparaît tout de suite dans la liste avec le statut « Analyse en cours ».
3. En arrière-plan, l'IA transcrit ou décrit le média, propose un titre, puis choisit catégorie et tags.
4. La carte se met à jour. Un indicateur montre que le classement vient de l'IA.
5. L'utilisateur peut corriger la catégorie, les tags, le titre ou la transcription en un geste.

**2. Retrouver une note**

1. L'utilisateur ouvre la vue en cartes, triée de la plus récente à la plus ancienne.
2. Il restreint par catégorie et par tags (combinables) et tape un mot dans la recherche.
3. La recherche porte sur le titre, le texte, la transcription et la description d'image.
4. Un clic sur la carte ouvre le détail, avec le média d'origine et son texte.

**3. Ajouter une catégorie ou un tag**

1. L'utilisateur crée une catégorie ou un tag dans l'écran de gestion, avec un nom et une courte description de ce qu'il doit contenir.
2. L'appli propose de relancer le tri et affiche le périmètre : toutes les notes, ou seulement celles sans correction manuelle.
3. L'IA reclasse en tâche de fond. Un récapitulatif liste les notes déplacées, avec un bouton pour annuler.

## Fonctionnalités détaillées

Vingt fonctionnalités, dont quinze indispensables au MVP (Must), organisées en huit modules.

| Réf. | Module | Fonctionnalité | Priorité |
|---|---|---|---|
| F1 | Capture | Saisie d'une note texte libre, sans champ obligatoire | Must |
| F2 | Capture | Enregistrement vocal dans l'appli (démarrer, pause, arrêter) et import d'un fichier audio | Must |
| F3 | Capture | Ajout d'image par appareil photo ou import, une ou plusieurs images par note | Must |
| F4 | Capture | Enregistrement local immédiat, envoi et analyse dès que le réseau revient | Should |
| F5 | IA média | Transcription complète du vocal, avec détection de la langue (français par défaut) | Must |
| F6 | IA média | Description de l'image : contenu, texte visible, contexte. Couverture de livre : uniquement les informations du livre (titre, auteur, éditeur…), sans décrire la photo (consigne Image par défaut, F89) | Must |
| F7 | IA média | Correction manuelle de la transcription et de la description | Must |
| F8 | Classement | Génération automatique d'un titre court par note | Must |
| F9 | Classement | Attribution d'une catégorie et de plusieurs tags parmi la liste préétablie | Must |
| F10 | Classement | Indicateur « classé par l'IA » et verrouillage d'un classement corrigé à la main | Must |
| F11 | Classement | Note « à vérifier » quand l'IA hésite ou ne trouve aucune catégorie adaptée | Should |
| F12 | Catégories et tags | Créer, renommer, fusionner, supprimer, avec une description servant de consigne à l'IA | Must |
| F13 | Catégories et tags | Re-tri à l'ajout ou à la modification, avec choix du périmètre et récapitulatif annulable | Must |
| F14 | Catégories et tags | Suggestion par l'IA de nouveaux tags quand plusieurs notes n'en ont aucun | Could |
| F15 | Affichage | Vue en cartes : titre, extrait, miniature, catégorie, tags, date, icône du format | Must |
| F16 | Affichage | Filtres combinables par catégorie et par tags, avec compteur par filtre | Must |
| F17 | Recherche | Champ de recherche plein texte sur titre, contenu, transcription et description | Must |
| F18 | Recherche | Recherche par sens (« la note sur le devis du plombier ») | Could |
| F19 | Détail | Page de note : média d'origine, texte, métadonnées, édition, suppression avec corbeille | Must |
| F20 | Transverse | Export complet des données (JSON et fichiers) | Should |

## Pipeline IA

Seul le premier maillon dépend du format : ensuite, toutes les notes suivent le même classement.

> [Schéma : voir le document source ou les maquettes]

Une note douteuse n'est jamais rangée au hasard : elle part en « à vérifier ».

**Règles de fonctionnement**

- **Transcription** : l'audio d'origine est conservé, le texte est éditable, la langue est détectée.
- **Description d'image** : contenu de la scène, texte visible, contexte probable. Elle sert à la recherche autant qu'à l'affichage.
- **Classement** : l'IA reçoit le texte de la note, la liste des catégories et des tags avec leur description, et renvoie un titre, une catégorie, des tags et un niveau de confiance.
- **Re-tri** : seuls les classements non verrouillés sont réexaminés, à partir du texte déjà extrait, sans retranscrire ni redécrire les médias. L'état précédent est gardé pour annuler.
- **Échec** : une analyse qui échoue est relancée automatiquement, puis la note reste visible avec le statut « erreur » et un bouton de relance.

## Modèle de données

Cinq entités suffisent : la note est l'élément central, reliée à ses médias, à une catégorie, à des tags et à son historique de classement.

| Entité | Champs principaux | Remarque |
|---|---|---|
| Note | id, type (texte, vocal, image), titre, contenu texte, statut d'analyse, date de création, date de modification, corbeille oui/non | Le contenu texte contient la saisie, la transcription ou la description |
| Média | id, note, fichier, durée ou dimensions, transcription ou description, langue, version corrigée à la main | Une note image peut avoir plusieurs médias |
| Catégorie | id, nom, description, couleur, ordre | Une seule catégorie par note. La description guide l'IA |
| Tag | id, nom, description, couleur | Plusieurs tags par note, description facultative |
| Classement | note, catégorie, tags, origine (IA ou manuel), score de confiance, verrouillé oui/non, date, version de la liste de catégories | Historique conservé pour annuler un re-tri |

**Règles de gestion**

- Un classement verrouillé (corrigé à la main) n'est jamais modifié par un re-tri, sauf choix explicite de l'utilisateur.
- Supprimer une catégorie impose de choisir où reclasser ses notes : une autre catégorie, ou « à vérifier ».
- La recherche plein texte s'appuie sur un index du titre, du contenu, de la transcription et de la description.
- Les fichiers audio et image d'origine sont toujours conservés, même après correction du texte.

## Écrans et ergonomie

Cinq écrans couvrent tout le MVP ; ils sont maquettés dans un document séparé (design) livré avec ce cahier des charges.

| Écran | Rôle | Éléments clés |
|---|---|---|
| Accueil en cartes | Parcourir, filtrer, chercher | Barre de recherche et bouton « Filtres » (panneau carnet, tags, date), filtres actifs retirables, grille de cartes, bouton d'ajout |
| Ajout de note | Capturer en un geste | Trois choix (écrire, parler, photographier), enregistrement vocal, aperçu |
| Détail d'une note | Lire et corriger | Média, transcription ou description éditable, catégorie, tags, historique |
| Catégories et tags | Gérer la structure | Listes avec compteurs, description, couleur, bouton « Relancer le tri » |
| Récapitulatif du re-tri | Valider les déplacements | Liste avant/après, annuler tout ou par note |

**Principes**

- Mobile d'abord : le bouton d'ajout reste accessible au pouce.
- Le résultat IA est toujours visible comme tel et corrigeable en un geste.
- Un état d'analyse clair sur chaque carte (en cours, terminé, à vérifier, erreur).
- Contrastes et tailles de texte conformes à l'accessibilité courante (WCAG AA), thème clair et sombre.

## Exigences non fonctionnelles

Les notes sont personnelles : la confidentialité et la fiabilité de la capture passent avant la rapidité de l'analyse.

| Domaine | Exigence (cibles à valider) |
|---|---|
| Rapidité | Note enregistrée en moins de 1 seconde. Analyse IA d'un texte en moins de 10 secondes, d'un vocal de 2 minutes en moins de 60 secondes |
| Fiabilité | Aucune perte de note : sauvegarde locale d'abord, relance automatique en cas d'échec de l'analyse |
| Hors-ligne | Capture possible sans réseau (F4). Consultation des notes déjà chargées |
| Confidentialité | Données chiffrées en transit et au repos. Authentification obligatoire. Contenus envoyés aux services d'IA sous contrat excluant leur réutilisation pour l'entraînement |
| Conformité | Respect du RGPD : export et suppression complète des données à la demande |
| Coût | Plafond mensuel d'appels IA configurable, avec alerte. Coût réel à mesurer sur un prototype |
| Compatibilité | Navigateurs récents sur Android, iOS et ordinateur. Installable comme application web (PWA) |
| Accessibilité | Navigation clavier, lecteurs d'écran, contrastes WCAG AA |
| Évolutivité | Classement et transcription derrière des interfaces simples, pour changer de fournisseur d'IA sans refonte |

**Sobriété IA (priorité)** : toute nouvelle fonction doit indiquer ses appels IA et son coût estimé avant d'être retenue. Les stratégies d'économie, le plafond mensuel et le journal des appels sont indispensables à la première version.

## Architecture technique proposée

Une application web installable (PWA) parle à un petit serveur qui stocke les notes et orchestre les appels IA en tâche de fond. Le code n'est pas abordé ici : seules les briques et les choix à confirmer sont posés.

| Brique | Rôle | Options à confirmer |
|---|---|---|
| Application web (PWA) | Interface mobile et ordinateur, capture hors-ligne, file d'attente locale | Framework web au choix, stockage local du navigateur |
| Serveur et base de données | Notes, catégories, tags, historique, index de recherche plein texte | Base relationnelle avec recherche plein texte intégrée |
| Stockage de fichiers | Audios et images d'origine | Stockage objet chiffré |
| File de tâches | Exécute l'analyse sans bloquer l'utilisateur, relance en cas d'échec, gère les re-tris | Tâches d'arrière-plan du serveur |
| Service de transcription | Convertit le vocal en texte, détecte la langue | Service de reconnaissance vocale, à comparer sur des vocaux réels en français |
| Modèle de vision et de langage | Décrit les images, propose le titre, choisit catégorie et tags à partir de leurs descriptions | Un modèle d'IA multimodal, à comparer sur quelques dizaines de notes réelles |
| Recherche par sens (option) | Retrouver une note par son sens | Vecteurs d'embedding stockés avec les notes |

## Synchronisation entre smartphone et ordinateur

Les notes vivent sur le serveur, pas dans l'appareil : le smartphone et l'ordinateur affichent la même liste après connexion avec le même compte.

Ces exigences s'ajoutent aux 20 fonctionnalités ci-dessus, et la capture hors-ligne (F4) passe en priorité Must.

- **F21 (Must) Compte unique** : connexion personnelle, session conservée sur chaque appareil. Détaillé dans « Compte utilisateur et hébergement » (F64 à F71).
- **F22 (Must) Mise à jour entre appareils** : une note captée sur le smartphone apparaît sur l'ordinateur en quelques secondes, au rechargement de la liste et à intervalle régulier.
- **F23 (Must) Envoi différé** : hors réseau, la note est gardée sur l'appareil puis envoyée au retour de la connexion, sans doublon.
- **Conflits** : en cas de modification des deux côtés, la dernière écriture l'emporte pour le titre et le texte ; un classement verrouillé à la main l'emporte toujours sur l'IA.
- **Installation** : application web ajoutée à l'écran d'accueil du téléphone, avec icône et ouverture plein écran.

Le prototype cliquable garde ses notes dans le navigateur seulement : la synchronisation ne sera réelle qu'avec le serveur.

## Déploiement sur Infomaniak et gestion de l'IA

L'application, la base et les fichiers restent chez Infomaniak, et les appels IA passent par le serveur ; seule la description d'image reste à confirmer.

D'après la documentation d'Infomaniak, ses services d'IA se consomment par une API compatible avec le format OpenAI. Ils proposent des modèles de langage open source, la transcription Whisper et des modèles d'embeddings. L'infrastructure est en Suisse et en Europe, les requêtes ne sont pas conservées ni réutilisées pour l'entraînement, et la facturation se fait à l'usage (au jeton, à la minute pour la transcription), avec un crédit de départ offert et une carte bancaire exigée. La même documentation indique que l'interprétation d'images est encore à l'étude : c'est le point à vérifier avant de s'engager.

| Fonction | Où elle tourne | Remarque |
|---|---|---|
| Transcription des vocaux | Service d'IA d'Infomaniak (Whisper) | Facturée à la minute d'audio. À tester sur vos vocaux en français |
| Titre, catégorie, tags | Service d'IA d'Infomaniak (modèle de langage) | Le serveur envoie la note et la liste des catégories avec leurs descriptions, et reçoit une réponse structurée avec un niveau de confiance |
| Description d'image | À confirmer : un modèle avec vision chez Infomaniak, sinon un autre fournisseur pour cette seule fonction | Dans ce second cas, les photos quittent Infomaniak |
| Recherche par sens (option) | Embeddings d'Infomaniak | Version ultérieure |

**Règles de mise en œuvre**

- La clé d'API reste sur le serveur, jamais dans l'application ni dans le navigateur.
- Le téléphone envoie la note ; le serveur lance l'analyse en arrière-plan puis met la note à jour. L'utilisateur peut fermer l'appli pendant l'analyse.
- Le fournisseur d'IA est isolé derrière une interface simple, pour en changer sans refonte.
- Un plafond de dépense est réglé côté Infomaniak, avec un compteur mensuel visible dans l'application.
- Le re-tri travaille sur le texte déjà extrait : aucune retranscription, donc un coût faible.
- Le serveur doit pouvoir exécuter un petit programme d'arrière-plan, stocker des fichiers et héberger une base de données. Un hébergement web classique peut suffire pour une version simple, sinon un serveur dédié (VPS ou cloud) : à décider selon votre offre actuelle.

**Sources** : [guide de démarrage de l'API](https://infomaniak.com/en/support/faq/2845/quick-start-guide-llm-api) et [présentation des services d'IA](https://www.infomaniak.com/en/hosting/llm-api) d'Infomaniak, consultés le 9 octobre 2026.

## Stratégie IA et réglages dans l'outil

Infomaniak fait le travail par défaut ; Gemini ou Claude n'interviennent que si vous les avez activés, et chaque choix se règle dans un écran de réglages.

| Réglage | Valeurs possibles | Valeur par défaut |
|---|---|---|
| Fournisseur de transcription | Infomaniak, Gemini | Infomaniak |
| Fournisseur de classement | Infomaniak, Claude, Gemini | Infomaniak |
| Description d'image | Désactivée, à la demande, automatique | À la demande |
| Fournisseur de description d'image | Infomaniak (si disponible), Claude, Gemini | Aucun tant qu'aucune clé n'est saisie |
| Recours à un autre fournisseur | Jamais, en cas d'échec, à la demande par bouton | Jamais |
| Plafond mensuel par fournisseur | Montant choisi, avec alerte à 80 % | À fixer à l'ouverture |
| Durée maximale d'un vocal | De 30 secondes à 2 minutes (maximum) | 2 minutes |
| Taille maximale d'une image | En mégaoctets | À définir au prototype |

**Fonctionnalités ajoutées**

- **F24 (Must) Écran de réglages IA** : un fournisseur choisi pour chaque fonction, avec bouton « Tester la connexion ».
- **F25 (Must) Fournisseur principal par défaut** : Infomaniak. Gemini et Claude restent inactifs tant qu'une clé n'est pas saisie et qu'ils ne sont pas activés.
- **F26 (Must) Mode de recours** : pour chaque fonction, jamais, en cas d'échec ou seulement à la demande.
- **F27 (Must) Plafond mensuel** : consommation affichée par fournisseur, blocage automatique à l'atteinte du plafond, alerte à 80 %.
- **F28 (****Must****) Limites de durée et de taille** réglables pour les vocaux et les images.
- **F29 (****Must****) Traçabilité** : chaque note indique le fournisseur utilisé, et un journal liste la date, la fonction, le fournisseur et le coût estimé de chaque appel.
- **F30 (Could) Accès depuis Claude** par un serveur MCP, après la première version.

- **F80 (Must) Quota dépassé chez le fournisseur** : l'erreur est lue (pour Gemini : quota par minute ou par jour, niveau gratuit, valeur, modèle, délai conseillé). La note passe « Quota atteint » et repart seule après le délai ; aucun appel n'est envoyé à ce fournisseur pendant ce délai.
- **F81 (Must) Limites annoncées** : quand le fournisseur les renvoie (Claude : requêtes et jetons par minute, restant et limite), elles sont relevées à chaque appel et affichées dans les réglages.
- **F82 (Must) Quotas saisis** : requêtes par minute et par jour, par fournisseur. L'application compte ses appels (journée du Pacifique pour Gemini), patiente au-delà du quota par minute et met les notes en attente au-delà du quota du jour.

**Règles**

- Les clés d'API sont enregistrées chiffrées sur le serveur. L'écran de réglages ne les réaffiche jamais, il propose seulement de les remplacer.
- Un message clair prévient avant tout envoi hors Infomaniak : « Cette photo sera envoyée à <fournisseur> ».
- Quand un plafond est atteint, la note est conservée et l'analyse est mise en attente, sans perte.

**Stratégies pour limiter la consommation**

Huit mesures réduisent les appels payants ; la plupart sont actives en permanence, les autres se règlent dans l'écran de réglages.

| Stratégie | Effet | Réglage |
|---|---|---|
| Classement sur le texte seulement | Aucun média n'est envoyé au modèle de classement | Toujours actif |
| Petit modèle et liste de catégories compacte | Moins de jetons par appel | Modèle choisi dans les réglages, le plus petit par défaut |
| Transcription une seule fois | Le re-tri et la recherche réutilisent le texte enregistré | Toujours actif |
| Vocal limité à 2 minutes | Coût de transcription borné, arrêt automatique avec décompte | Réglable à la baisse, de 30 secondes à 2 minutes |
| Photo réduite avant envoi | Moins de données envoyées quand une description est demandée | Interrupteur, actif par défaut |
| Description d'image à la demande | Aucun appel tant que vous ne le demandez pas | Désactivée, à la demande ou automatique |
| Légende saisie ou dictée | La photo est classée sans description payante | Toujours possible |
| Plafond mensuel et autres fournisseurs inactifs | Blocage avant dépassement, rien ne part chez Gemini ou Claude sans activation | Montant libre, alerte à 80 %, interrupteur par fournisseur |

**Déclenchement automatique ou manuel**

Chaque appel IA peut partir tout seul ou seulement quand vous le demandez, fonction par fonction : transcription, classement et description d'image. Par défaut, la transcription et le classement sont automatiques et la description d'image est à la demande.

- **F31 (Must) Mode par fonction** : automatique ou manuel pour la transcription, le classement et la description d'image, réglé dans l'écran de réglages.
- **F32 (Must) Note « À analyser »** : en mode manuel, la note est enregistrée sans aucun appel IA, avec ce statut, et un bouton « Analyser » figure sur la carte et dans le détail.
- **F33 (Must) Analyse groupée** : un bandeau indique le nombre de notes à analyser et un bouton les lance ensemble, en affichant d'abord le nombre d'appels prévus et le coût estimé.

**Règles**

- Une note en attente reste utilisable : le texte est cherchable, l'audio s'écoute, la catégorie peut être choisie à la main sans aucun appel.
- Un vocal non transcrit n'est pas cherchable par son contenu tant qu'il n'a pas été analysé.
- En mode automatique, quand le plafond mensuel est atteint, les nouvelles notes passent en « À analyser » au lieu d'être refusées.
- Le re-tri après l'ajout d'une catégorie ou d'un tag reste toujours lancé par vous.

## Synthèse des notes affichées

Un bouton « Synthèse » génère un rapport portant exactement sur les cartes affichées, c'est-à-dire sur le résultat des filtres et de la recherche en cours.

- **F34 (Must) Bouton « Synthèse »** sur l'écran des cartes, actif dès qu'au moins une note analysée est affichée.
- **F35 (Must) Lancement toujours manuel, avec confirmation** : l'écran indique le nombre de notes, le volume de texte envoyé (en mots), le nombre d'appels IA (un seul) et le fournisseur. Les notes non analysées sont exclues et signalées.
- **F36 (Must) Contenu du rapport** : vue d'ensemble, regroupement par catégorie, tags les plus fréquents et notes marquées « à rappeler ». Chaque point renvoie à sa note d'origine.
- **F37 (Should) Export** : copier le texte, exporter en PDF ou en document.
- **F38 (Should) Enregistrer comme note** de type « Synthèse », sans nouvel appel IA.

**Règles de sobriété**

- Un seul appel par synthèse, qui ne reçoit que le texte des notes (titre, contenu, transcription ou description déjà enregistrés), jamais les fichiers audio ou image.
- Une limite du nombre de notes et du volume de texte par synthèse se règle dans l'écran de réglages, avec une valeur par défaut fixée après les mesures du prototype. Au-delà, l'outil propose de resserrer les filtres ou de produire une synthèse par catégorie.
- Le fournisseur de la synthèse se choisit dans les réglages comme les autres fonctions, Infomaniak par défaut. L'appel compte dans le plafond mensuel.
- Le rapport précise qu'il a été généré par l'IA et invite à vérifier les points importants dans les notes d'origine.

Les maquettes montrent le bouton, l'écran de confirmation et un exemple de rapport.

### Formats de synthèse

| Réf. | Fonction | Priorité |
|---|---|---|
| F53 | À l'écran de confirmation, trois formats au choix : **Synthèse courte** (points clés par carnet), **Document complet** et **Texte rédigé**. | Must |
| F54 | **Document complet** : l'IA réorganise tout le contenu des notes affichées en un document structuré (sommaire, parties par carnet, notes dans l'ordre chronologique avec leur type, leur date et leurs tags, index des tags). Aucune information n'est supprimée. | Must |
| F55 | **Texte rédigé** : l'IA rédige un texte suivi et structuré (introduction, une partie par carnet en phrases enchaînées, conclusion avec les points à rappeler). | Must |
| F56 | Le résultat, quel que soit le format, propose un bouton **Copier le texte** et un bouton **Télécharger en PDF**. Le PDF est généré côté serveur, sans nouvel appel IA. | Must |
| F57 | La confirmation affiche le nombre de mots envoyés et une estimation des mots produits : environ 25 % pour la synthèse courte, 50 % pour le texte rédigé et 100 % pour le document complet, qui est le format le plus coûteux. Toujours un seul appel, lancé manuellement. | Must |

### Historique des synthèses

| Réf. | Fonction | Priorité |
|---|---|---|
| F58 | Chaque synthèse générée est **enregistrée automatiquement** sur le serveur : format, date, filtres utilisés, nombre de notes et contenu complet. | Must |
| F59 | Un accès **Historique** est disponible depuis la liste des notes et depuis les réglages. Ouvrir une synthèse enregistrée ne fait **aucun appel IA** et reste disponible hors connexion une fois ouverte. | Must |
| F60 | Depuis une synthèse de l'historique : copier le texte, télécharger en PDF, supprimer. Un message rappelle la date de génération, car les notes ont pu changer depuis. | Must |
| F61 | Pour limiter le stockage, l'historique garde les 30 dernières synthèses (réglable). Une synthèse peut être épinglée pour échapper à la purge. | Should |
| F62 | Avant de relancer une synthèse, l'application signale si une version identique (mêmes notes, même format) existe déjà dans l'historique et propose de l'ouvrir plutôt que de régénérer. | Should |
| F63 | Chaque entrée de l'historique porte un titre (proposé automatiquement à partir du format et des carnets concernés, modifiable à tout moment) et affiche les carnets et les tags couverts par la synthèse. La liste est filtrable par carnet, par tag et par mot du titre. | Must |

## Carnets, tags et panneau de réglages

**Changement de vocabulaire.** Les « catégories » deviennent des **carnets**. Partout dans ce document, « catégorie » se lit désormais « carnet » : une note est rangée dans un seul carnet et peut porter plusieurs tags.

### Carnets et choix du carnet

| Réf. | Fonction | Priorité |
|---|---|---|
| F39 | Un carnet est défini par un nom, une couleur et une description qui guide le classement automatique. | Must |
| F40 | Un **carnet par défaut** se choisit dans les réglages. Il peut aussi être « Choisi par l'IA » (aucun défaut). | Must |
| F41 | À la création d'une note (écrite, vocale ou image), un champ **Carnet de destination** est présenté, prérempli avec le carnet par défaut, et modifiable note par note. | Must |
| F42 | Si un carnet est choisi à la création, l'IA ne le change pas : elle ne fait que le titre, la transcription ou la description, et les tags. Le re-tri respecte ce choix. Si « Choisi par l'IA » est sélectionné, l'IA propose le carnet comme avant. | Must |

### Ajout de tags sur une fiche

| Réf. | Fonction | Priorité |
|---|---|---|
| F43 | Sur la fiche d'une note, les tags s'ajoutent avec un champ **liste déroulante filtrable** : la frappe réduit la liste, flèches et Entrée pour choisir, Échap pour fermer. | Must |
| F44 | Si le texte saisi ne correspond à aucun tag, la liste propose « Créer le tag … ». Les tags déjà posés apparaissent en pastilles retirables d'un geste. | Must |

### Panneau de réglages

Un onglet **Réglages** regroupe tout ce qui pilote l'outil :

- **Durée maximale des vocaux** : 30 secondes, 1 minute ou 2 minutes (maximum).
- **Choix des IA**, fonction par fonction : classement, transcription, description des images, synthèse. Infomaniak par défaut, Gemini ou Claude en option.
- **Clés API** par fournisseur, saisies masquées, chiffrées côté serveur et jamais renvoyées à l'écran, avec un bouton Tester la connexion.
- **Recours** à un autre fournisseur : jamais, en cas d'échec, ou à la demande.
- **Déclenchement** de l'analyse : automatique ou manuel.
- **Budget** mensuel et alertes.
- **Gestion des carnets et des tags**, décrite ci-dessous.

### Gestion des carnets et des tags

| Réf. | Fonction | Priorité |
|---|---|---|
| F45 | Ajouter, renommer et modifier un carnet ou un tag. | Must |
| F46 | Supprimer un carnet : ses notes passent « à vérifier » après confirmation. Supprimer un tag : il est retiré de toutes les notes, après confirmation. | Must |
| F47 | **Fusionner** deux carnets ou deux tags : les notes de la source rejoignent la cible, les doublons de tags sont éliminés, la source disparaît. Un récapitulatif indique le nombre de notes touchées et l'action peut être annulée juste après. | Must |
| F48 | Si le carnet par défaut est supprimé ou fusionné, le défaut suit la cible (fusion) ou revient à « Choisi par l'IA » (suppression). | Must |

Règle de sobriété : renommer, supprimer et fusionner n'appellent jamais l'IA. Seul le re-tri, lancé volontairement, peut le faire.

Les maquettes montrent le sélecteur de carnet à la création, la liste de tags filtrable sur la fiche, le carnet par défaut, le panneau de réglages et l'écran de fusion.

### Création de carnets et de tags par l'IA

| Réf. | Fonction | Priorité |
|---|---|---|
| F49 | Deux réglages indépendants, un pour les carnets et un pour les tags : **Strict** (l'IA n'utilise que les carnets ou tags existants) ou **Propositions autorisées** (l'IA peut suggérer un nouveau carnet ou un nouveau tag). Par défaut : strict. | Must |
| F50 | Une suggestion n'est jamais appliquée toute seule : elle apparaît sur la fiche de la note (« Créer le carnet … », « Créer le tag … », « Ignorer ») et la création exige un clic. | Must |
| F51 | Les suggestions sont produites par le même appel que le classement (une ligne de plus dans la réponse), donc sans appel supplémentaire. En mode strict, la consigne envoyée à l'IA est plus courte, ce qui économise des jetons. | Must |
| F52 | Un carnet créé sur suggestion reçoit une description à compléter, pour guider les classements suivants. | Should |
| F79 | **Description du carnet de notes** (onglet Carnets) : quelques phrases sur l'utilisateur et l'usage de ses notes, jointes à chaque classement et à chaque enrichissement pour mieux choisir le carnet. Elle complète la description propre à chaque carnet. | Must |
| F89 | **Consignes par type de note** (onglet Carnets, sous la description) : une précision libre pour les notes écrites, les vocales, les images et les notes avec un lien, jointe au prompt seulement pour les notes du type concerné (classement et enrichissement ; pour les images aussi la description). Par défaut, la consigne Image demande, pour une couverture de livre, uniquement les informations du livre. | Should |

## Accueil et filtres sur smartphone

| Réf. | Fonction | Priorité |
|---|---|---|
| F80 | L'accueil reste compact : une ligne de recherche avec un bouton **Filtres** (badge = nombre de filtres actifs), puis les filtres actifs, chacun retirable d'une croix. L'historique des synthèses et la corbeille passent dans le menu ⋯ ; la bascule cartes/liste aussi sur téléphone, mais reste visible sur la ligne du nombre de notes dès 760 px. En cartes, chaque carte ne prend que sa hauteur (disposition en maçonnerie, sans trou). | Must |
| F81 | Le **panneau de filtres** (fenêtre du bas sur téléphone, colonne latérale sur grand écran) regroupe le carnet (un seul), les tags (plusieurs, « tous » ou « au moins un ») et la date de création. Un champ cherche dans les noms de carnets et de tags. | Must |
| F82 | Les compteurs du panneau tiennent compte des autres filtres ; les tags sans note dans le résultat sont masqués. Les huit carnets et douze tags les plus utilisés s'affichent d'abord, les autres derrière « Voir tous ». | Must |
| F83 | Toucher le carnet ou un tag d'une carte filtre directement sur celui-ci. | Should |
| F84 | Sur téléphone, les onglets Notes, Carnets, Réglages et Compte forment une barre de navigation en bas de l'écran. | Must |

## À lire / Lu

Pour garder des articles ou des vidéos à consulter plus tard sans les perdre.

| Réf. | Fonction | Priorité |
|---|---|---|
| F85 | Une note a un état de lecture : aucun (par défaut), **À lire** ou **Lu** (avec la date). Cet état est indépendant du carnet et des tags ; ni l'IA ni un re-tri ne le modifient. | Must |
| F86 | À la création, une case « À lire plus tard » est cochée d'office quand la note contient un lien (règle locale, sans IA) ; elle reste modifiable. | Must |
| F87 | Sur la carte, toucher le badge « À lire » marque la note comme lue (et inversement), avec « Annuler » quelques secondes. Le détail de la note propose Aucune / À lire / Lu. | Must |
| F88 | Le panneau de filtres a une section Lecture (Toutes, À lire, Lues) combinable avec les autres filtres ; le menu ⋯ ouvre directement la liste « À lire ». | Must |

## Liens dans les notes

| Réf. | Fonction | Priorité |
|---|---|---|
| F72 | Une adresse web collée dans une note (`https://…` ou `www.…`) devient un lien cliquable, sur la carte et dans le détail ; il s'ouvre dans un nouvel onglet. | Must |
| F73 | Le serveur lit la page une fois (titre, site, résumé annoncé, court extrait), sans appel IA, et affiche un aperçu sous la note. Trois liens au plus par note. | Must |
| F74 | Un petit descriptif (une phrase) est rédigé par l'IA dans le **même appel que le classement**, sans appel supplémentaire. Il sert aussi au classement, à la recherche et aux synthèses. | Must |

Garde-fous : seules les adresses http(s) publiques sont lues (les adresses internes sont refusées), 5 secondes et 512 Ko au plus par page.

## Enrichissement des notes

| Réf. | Fonction | Priorité |
|---|---|---|
| F75 | Réglage **Enrichissement des notes** : désactivé, à la demande (par défaut) ou automatique, avec son fournisseur d'IA comme les autres fonctions. | Must |
| F76 | Un bloc **Pour aller plus loin** sur la note : explication du sujet (2 à 4 phrases), pistes complémentaires, recherches prêtes (Web et Google Scholar) et sources. Les notes pratiques (courses, rappels) ne sont pas enrichies. | Must |
| F77 | Chaque source proposée par l'IA est ouverte par le serveur ; une adresse qui ne répond pas est écartée et signalée. Le bloc indique qu'il est généré par l'IA et à vérifier ; il peut être retiré ou régénéré. | Must |

| F78 | À la création d'une note, une case **Enrichir cette note** (cochée d'office en mode automatique, masquée si l'enrichissement est désactivé) demande l'enrichissement pour cette note seulement, dans l'appel de classement. | Must |

Règles de sobriété : en mode automatique, l'enrichissement est demandé dans l'appel de classement (aucun appel en plus, réponse plus longue), une seule fois par note et jamais lors d'un re-tri. À la demande, un appel par clic. L'enrichissement ne sert pas au classement ni aux synthèses ; il est inclus dans la recherche.

## Compte utilisateur et hébergement

L'application vit sur un hébergement Infomaniak qui n'accepte qu'une seule application Node.js : elle est montée par la passerelle `node-gateway` sur l'adresse `/mainotes/` (voir `docs/deploiement-infomaniak.md`). Elle est personnelle : un seul compte, créé à la première ouverture.

| Réf. | Fonction | Priorité |
|---|---|---|
| F64 | **Création du compte à la première ouverture** après déploiement : nom, identifiant (e-mail ou nom d'utilisateur) et mot de passe de 10 caractères au moins, saisi deux fois. Un seul compte possible : ensuite, l'écran de création disparaît. | Must |
| F65 | **Code d'installation facultatif** (variable `MAINOTES_SETUP_TOKEN`) exigé pour créer le compte, afin que personne d'autre ne le crée avant vous. | Should |
| F66 | **Connexion** par identifiant et mot de passe, session conservée 180 jours sur chaque appareil. Cinq essais ratés bloquent 15 minutes. | Must |
| F67 | **Édition du compte** dans un onglet « Compte » : nom affiché, identifiant (le mot de passe actuel est demandé), mot de passe (avec option de déconnecter les autres appareils). | Must |
| F68 | **Appareils connectés** : liste des sessions (appareil, date, dernière activité), déconnexion d'un appareil ou de tous les autres, déconnexion de l'appareil courant. | Must |
| F69 | **Export complet** des données en JSON (notes, médias, carnets, tags, synthèses, réglages ; sans les clés d'API ni le mot de passe). Réalise F20. | Must |
| F70 | **Suppression du compte** avec mot de passe et saisie de « SUPPRIMER » : tout est effacé, l'application revient à l'écran de création. | Must |
| F71 | **Mot de passe oublié** : réinitialisation par une commande sur le serveur (`npm run reset-password`), sans envoi d'e-mail. | Must |

**Règles de sécurité**

- Mots de passe stockés hachés (scrypt), jamais en clair.
- Cookie de session `HttpOnly`, `SameSite=Lax`, `Secure` derrière HTTPS, limité au chemin de l'application.
- Toute requête d'écriture porte un en-tête propre à l'application (protection contre les requêtes venues d'un autre site).
- Clés d'API chiffrées (AES-256-GCM) avec une clé gardée sur le serveur, jamais renvoyées à l'écran.
- Les notes, médias et réglages restent dans un dossier de données sur l'hébergement Infomaniak, à sauvegarder.

## Plan de réalisation

Quatre phases, avec un feu vert à franchir entre chacune ; les durées seront fixées après le prototype.

> [Schéma : voir le document source ou les maquettes]

Le prototype sert à mesurer la qualité du classement et le coût réel des appels IA avant d'investir dans l'interface.

**Critères de recette du MVP**

- Les trois formats sont capturés puis analysés sans intervention.
- Un mot présent dans une transcription ou une description d'image retrouve la note par la recherche.
- Filtres par catégorie et par tags combinés, avec un résultat exact.
- Un re-tri après ajout d'une catégorie s'annule en un clic.
- Aucune note perdue sur une semaine d'usage.

- La consommation IA du mois s'affiche, le plafond bloque les appels au-delà et chaque note indique le fournisseur utilisé.

## Risques et questions ouvertes

Le principal risque est un classement IA qui déçoit au début ; la parade est un système de descriptions de catégories que l'on affine, et une correction très simple.

| Risque | Effet | Parade |
|---|---|---|
| Classement IA imprécis | Perte de confiance, retour au tri manuel | Descriptions de catégories, exemples, statut « à vérifier », verrouillage des corrections |
| Transcription erronée (accents, noms propres, bruit) | Notes introuvables | Texte éditable, audio conservé, vocabulaire personnel ajouté plus tard |
| Coût des appels IA | Facture imprévue | Plafond mensuel, analyse à la demande pour les gros fichiers, mesure sur prototype |
| Confidentialité des contenus | Fuite ou réutilisation des données | Fournisseurs sous contrat sans entraînement, chiffrement, option de suppression complète |
| Re-tri massif qui bouleverse les notes | Désorientation | Récapitulatif avant/après, annulation, périmètre au choix |

**Questions à trancher avant de coder**

- [x] Où héberger l'application et les fichiers : hébergement Infomaniak, application montée par `node-gateway`, données dans un dossier du serveur.
- [x] Usage strictement personnel : un seul compte, créé à la première ouverture (F64 à F71).
- [ ] Fournisseur d'IA pour la transcription, la vision et le classement : un seul ou un par fonction ?
- [ ] Une seule catégorie par note (proposé) ou plusieurs ?
- [ ] Les catégories de départ : à lister ensemble avant la première version.
- [ ] Langues des vocaux : français seul, ou mélange avec d'autres langues ?
- [ ] Budget mensuel acceptable pour l'IA et l'hébergement.
