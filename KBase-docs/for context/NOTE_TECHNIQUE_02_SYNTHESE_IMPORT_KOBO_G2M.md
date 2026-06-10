# Synthèse - Gestion de l'importation des données KoBo dans G2M

## 1. Objectif général

Le module d'importation KoBo doit permettre à G2M de récupérer les données d'enquête collectées sur KoBoToolbox, de les intégrer dans la base applicative, puis de les rendre disponibles pour la cartographie SIG, les fiches d'identification des sites et les futurs indicateurs de suivi.

L'objectif n'est pas seulement de télécharger des soumissions.

Il s'agit de construire un pipeline robuste, rejouable et traçable, capable de :

- se connecter à KoBoToolbox via l'API v2 ;
- identifier le bon formulaire ;
- récupérer uniquement les soumissions utiles ;
- gérer la pagination ;
- extraire la charge utile des soumissions ;
- transformer les données vers le modèle G2M ;
- conserver la donnée brute ;
- éviter les doublons ;
- journaliser les synchronisations ;
- signaler les anomalies.

## 2. Connexion au serveur KoBo

La connexion à KoBoToolbox doit être configurée exclusivement par variables d'environnement.

Exemple :

```env
KOBO_BASE_URL=https://kf.kobotoolbox.org
KOBO_API_TOKEN=...
KOBO_ASSET_UID=...
```

Le token KoBo ne doit jamais être écrit en clair dans le code, dans GitHub, dans un rapport ou dans les logs.

Selon l'organisation, le serveur KoBo peut être :

- le serveur global ;
- le serveur européen ;
- un serveur KoBo privé.

La valeur de `KOBO_BASE_URL` doit donc rester paramétrable.

## 3. Recherche du formulaire

Dans l'API KoBo v2, un formulaire est représenté par un asset.

Deux modes de fonctionnement sont recommandés :

- mode explicite : l'UID du formulaire est fourni via `KOBO_ASSET_UID` ;
- mode recherche : le service liste les assets disponibles et retrouve le formulaire par nom, UID ou métadonnée.

Endpoints typiques :

```text
GET /api/v2/assets/
GET /api/v2/assets/{asset_uid}/
```

L'asset contient les métadonnées du formulaire et les liens permettant d'accéder aux données collectées.

L'accès aux soumissions se fait généralement via :

```text
GET /api/v2/assets/{asset_uid}/data/
```

## 4. Exploration des soumissions non récupérées

Le service d'importation doit éviter de réimporter inutilement les mêmes soumissions.

Dans G2M, la table centrale est :

```text
soumissions_collecte
```

Elle dispose déjà d'une contrainte utile :

```text
UNIQUE(source, source_submission_id)
```

Pour les données KoBo, on utilisera :

```text
source = 'kobo'
source_submission_id = identifiant KoBo
```

Deux stratégies sont possibles.

La stratégie simple consiste à récupérer les soumissions récentes et à faire un `UPSERT`.

La stratégie plus avancée consiste à mémoriser le dernier curseur traité, par exemple la dernière date de soumission ou le dernier identifiant importé.

## 5. Pagination et limites de l'API

Le connecteur ne doit pas supposer que toutes les soumissions sont retournées en une seule réponse.

Il doit gérer :

- la pagination ;
- les liens `next` fournis par l'API ;
- les limites de résultats ;
- les erreurs réseau ;
- les reprises après échec ;
- les délais ou limitations éventuelles côté KoBo.

Cette approche évite les synchronisations incomplètes et prépare l'application à gérer des volumes importants.

## 6. Extraction de la payload

Chaque soumission KoBo contient une charge utile qui peut inclure :

- les réponses au formulaire ;
- les métadonnées KoBo ;
- l'identifiant de soumission ;
- la date de soumission ;
- les coordonnées GPS ;
- les informations enquêteur ;
- les informations de localisation administrative ;
- les pièces jointes éventuelles.

Dans G2M, cette charge complète doit être conservée dans :

```text
raw_data_json
```

Cette conservation est importante pour :

- l'audit ;
- le retraitement ultérieur ;
- la correction d'un mapping ;
- l'évolution du formulaire ;
- l'affichage détaillé dans la fiche d'identification du site.

## 7. Mapping vers le modèle G2M

Le connecteur KoBo doit extraire les champs nécessaires vers les colonnes métier de G2M.

Champs cibles principaux :

```text
source
source_submission_id
kobo_asset_uid
mission_id
equipe_id
agent_id
sous_prefecture_id
code_agent_source
submitted_at
latitude
longitude
precision_m
statut_validation
anomaly_count
formulaire_type
raw_data_json
synced_at
```

Exemple de correspondance :

```text
KoBo _id ou _uuid          -> source_submission_id
KoBo _submission_time      -> submitted_at
gps_site                   -> latitude, longitude, precision_m
modA.enqueteur             -> code_agent_source / agent_id
modA.equipe                -> equipe_id
modB.sous_prefecture       -> sous_prefecture_id
payload complète           -> raw_data_json
```

## 8. Traitement des coordonnées GPS

Le champ GPS KoBo doit être analysé avec prudence.

Un format courant est :

```text
latitude longitude altitude precision
```

Exemple :

```text
7.123456 -5.123456 0 6
```

Extraction attendue :

```text
latitude = 7.123456
longitude = -5.123456
precision_m = 6
```

Le connecteur doit gérer :

- les coordonnées absentes ;
- les coordonnées invalides ;
- les latitudes hors intervalle ;
- les longitudes hors intervalle ;
- les précisions absentes ;
- les soumissions sans point GPS exploitable.

## 9. Rattachement aux référentiels G2M

Une soumission KoBo doit être rapprochée des référentiels internes.

Référentiels concernés :

- missions ;
- équipes ;
- agents ;
- régions ;
- départements ;
- sous-préfectures.

Rapprochements possibles :

- `kobo_asset_uid` vers la mission ;
- code enquêteur vers `agents_collecte.code_agent` ;
- identifiant ou nom d'équipe vers `equipes` ;
- nom ou code de sous-préfecture vers `sous_prefectures`.

Les cas non résolus doivent être conservés mais signalés.

Exemples :

- agent inconnu ;
- équipe inconnue ;
- sous-préfecture non reconnue ;
- coordonnées hors zone ;
- formulaire incomplet.

Ces cas peuvent être importés avec le statut :

```text
a_verifier
```

## 10. Détection des anomalies

Lors de l'import, G2M peut calculer un premier niveau de contrôle qualité.

Anomalies possibles :

- GPS absent ;
- GPS invalide ;
- agent non reconnu ;
- équipe non reconnue ;
- sous-préfecture non reconnue ;
- incohérence entre territoire déclaré et coordonnées GPS ;
- doublon fonctionnel ;
- formulaire incomplet.

Ces contrôles alimentent :

```text
statut_validation
anomaly_count
```

Statuts possibles :

```text
validee
a_verifier
rejetee
```

## 11. Idempotence de l'import

Le connecteur KoBo doit être rejouable.

Cela signifie :

- une soumission déjà connue est mise à jour ;
- une nouvelle soumission est insérée ;
- aucun doublon n'est créé ;
- la date de synchronisation est mise à jour ;
- la payload brute peut être actualisée.

La contrainte existante permet cette logique :

```text
UNIQUE(source, source_submission_id)
```

## 12. Journalisation des synchronisations

Chaque synchronisation doit produire un résumé exploitable.

Informations à journaliser :

- UID du formulaire ;
- date et heure de début ;
- date et heure de fin ;
- statut du traitement ;
- nombre de soumissions récupérées ;
- nombre de soumissions insérées ;
- nombre de soumissions mises à jour ;
- nombre de soumissions ignorées ;
- nombre de soumissions en erreur ;
- dernier curseur traité ;
- message d'erreur éventuel.

Une table dédiée pourra être ajoutée :

```text
kobo_sync_runs
```

## 13. Gestion des erreurs

Le connecteur doit gérer les erreurs sans interrompre brutalement l'application.

Erreurs à prévoir :

- token invalide ;
- serveur KoBo inaccessible ;
- asset introuvable ;
- formulaire non déployé ;
- réponse API inattendue ;
- pagination interrompue ;
- payload incomplète ;
- coordonnées invalides ;
- violation de contrainte SQLite ;
- base SQLite verrouillée ;
- changement de structure du formulaire KoBo.

Les messages d'erreur doivent être utiles pour le diagnostic, mais ne doivent jamais exposer le token KoBo.

## 14. Commandes applicatives à prévoir

Commande principale recommandée :

```bash
npm run kobo:sync
```

Options utiles à terme :

```bash
npm run kobo:sync -- --asset UID
npm run kobo:sync -- --since 2026-06-01
npm run kobo:sync -- --dry-run
npm run kobo:sync -- --limit 500
```

Modules techniques à prévoir :

```text
scripts/sync-kobo.js
services/koboClient.js
services/koboSyncService.js
services/koboPayloadMapper.js
```

## 15. Impact sur la cartographie SIG

Une fois les données KoBo intégrées dans `soumissions_collecte`, la cartographie peut les consommer comme les données simulées actuelles.

Les éléments alimentés seront :

- les points de collecte ;
- les filtres par mission, équipe, agent, statut et dates ;
- la fiche d'identification du site ;
- les indicateurs de synthèse ;
- les futurs contrôles qualité ;
- les analyses de productivité terrain.

Si le mapping vers `soumissions_collecte` est correctement fait, le module `/cartographie` n'a pas besoin d'être refondu.

## 16. Sécurité

Règles importantes :

- ne jamais versionner le token KoBo ;
- ne jamais afficher le token dans les logs ;
- ne pas exposer les données brutes KoBo inutilement ;
- protéger les coordonnées GPS ;
- protéger les données personnelles des agents et enquêteurs ;
- sauvegarder la base SQLite avant un gros import ;
- utiliser un mode `dry-run` avant le premier import réel.

## 17. Synthèse opérationnelle

Le cœur du module d'import KoBo est un connecteur :

- authentifié ;
- paginé ;
- idempotent ;
- journalisé ;
- tolérant aux erreurs ;
- capable de conserver la payload brute ;
- capable d'extraire les champs métier utiles ;
- compatible avec la cartographie SIG existante.

La table `soumissions_collecte` constitue le point d'intégration principal entre KoBo et G2M.

Le premier objectif de développement devrait être une synchronisation simple, en lecture seule, avec conservation de la payload brute et insertion contrôlée des soumissions dans SQLite.

