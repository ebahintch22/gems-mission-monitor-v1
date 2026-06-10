# Rapport technique - Architecture et etat d'implementation

## 1. Objet du document

Ce rapport decrit l'architecture technique de l'application **GEMS Mission
Monitor** et synthetise les travaux realises jusqu'a ce stade
d'implementation.

L'application vise le suivi des missions de collecte, la gestion progressive
des equipes et agents, ainsi que la visualisation SIG des soumissions terrain.
Le socle actuel est construit pour un MVP en **Node.js / Express / SQLite**,
avec une evolution prevue vers **PostgreSQL/PostGIS** et une integration
future a **KoBoToolbox API v2**.

Le present document se limite, pour la base SQLite, a la description du schema
et des responsabilites des tables. Il ne decrit pas les donnees chargees dans
la base locale.

## 2. Stack technique

| Couche | Technologie | Role dans l'application |
| --- | --- | --- |
| Runtime | Node.js >= 20 | Execution du serveur applicatif |
| Framework HTTP | Express 5 | Routage, middlewares, rendu serveur |
| Vues | EJS | Generation HTML cote serveur |
| Base MVP | SQLite via `better-sqlite3` | Persistance locale et base de test du MVP |
| Configuration | `dotenv` | Chargement de `PORT`, `DATABASE_PATH` et chemins d'import |
| Cartographie | Leaflet | Affichage SIG, fonds de carte, couches et points |
| Tableaux | Tabulator | Tableaux interactifs dans les ecrans metiers |
| Tests | Node Test Runner + Supertest | Tests fonctionnels HTTP et validation des flux |
| Import CSV | `csv-parse` | Import des roles et agents |
| Geometries | `@turf/union` | Aggregation GeoJSON des regions et departements |
| Export rapport | `docx`, `marked` | Conversion du rapport Markdown vers DOCX |

## 3. Organisation applicative

L'application suit une architecture MVC legere :

```text
gems-mission-monitor/
|-- app.js                         # Point d'entree Express
|-- config/
|   `-- database.js                # Connexion SQLite et schema
|-- controllers/                   # Logique de presentation des modules
|-- models/                        # Acces aux donnees SQLite
|-- routes/                        # Routage Express par domaine fonctionnel
|-- services/                      # Imports, generation et traitements metiers
|-- scripts/                       # Commandes executables npm
|-- views/                         # Vues EJS
|-- public/
|   |-- css/                       # Feuilles de style
|   |-- js/                        # Scripts navigateur Leaflet/Tabulator
|   `-- assets/                    # Images et logo
|-- tests/                         # Tests automatises
|-- data/                          # Base SQLite locale et donnees de travail
|-- README.md                      # Documentation d'utilisation
`-- RAPPORT_TECHNIQUE.md           # Rapport technique
```

La separation des responsabilites est la suivante :

- les **routes** exposent les URL et deleguent aux controleurs ;
- les **controleurs** preparent les donnees et selectionnent les vues ;
- les **modeles** encapsulent les requetes SQL ;
- les **services** portent les traitements transverses tels que les imports ou
  la generation de soumissions simulees ;
- les **vues EJS** assurent le rendu HTML ;
- les scripts de `public/js` initialisent les composants Leaflet et Tabulator.

## 4. Configuration et demarrage

Le fichier `app.js` initialise :

- `dotenv` pour la configuration d'environnement ;
- Express et le moteur de vues EJS ;
- le traitement des formulaires URL-encodes et du JSON ;
- les ressources statiques du repertoire `public` ;
- les routes principales ;
- les pages d'erreur 404 et 500 ;
- l'ecoute du port defini par `PORT`, avec `3000` par defaut.

Les scripts npm disponibles sont :

```bash
npm start
npm run dev
npm test
npm run territories:import
npm run roles:import
npm run agents:import
npm run submissions:seed
npm run report:docx
```

La variable `DATABASE_PATH` permet de definir l'emplacement du fichier SQLite.
En developpement, la valeur par defaut pointe vers `data/gems.sqlite`. Pour un
test Render avec disque persistant, l'approche retenue est de transferer le
fichier SQLite local deja prepare vers un chemin de type :

```env
DATABASE_PATH=/var/data/gems-mission-monitor.sqlite
```

## 5. Routes disponibles

| Route | Module | Fonction |
| --- | --- | --- |
| `GET /` | Dashboard | Tableau de bord minimal |
| `GET /missions` | Missions | Liste Tabulator et carte des missions |
| `GET /missions/new` | Missions | Formulaire de creation |
| `POST /missions` | Missions | Enregistrement d'une mission |
| `GET /missions/:id` | Missions | Fiche detaillee |
| `GET /users` | Utilisateurs | Registre des utilisateurs applicatifs |
| `GET /users/new` | Utilisateurs | Formulaire de creation |
| `POST /users` | Utilisateurs | Enregistrement d'un utilisateur |
| `GET /users/:id` | Utilisateurs | Fiche utilisateur |
| `GET /users/:id/edit` | Utilisateurs | Formulaire de modification |
| `POST /users/:id` | Utilisateurs | Mise a jour d'un utilisateur |
| `GET /equipes` | Equipes | Registre des equipes de collecte |
| `GET /equipes/new` | Equipes | Formulaire de creation |
| `POST /equipes` | Equipes | Enregistrement d'une equipe |
| `GET /equipes/:id` | Equipes | Fiche equipe |
| `GET /equipes/:id/edit` | Equipes | Formulaire de modification |
| `POST /equipes/:id` | Equipes | Mise a jour d'une equipe |
| `GET /agents` | Agents | Registre des agents de collecte |
| `GET /agents/new` | Agents | Formulaire de creation |
| `POST /agents` | Agents | Enregistrement d'un agent |
| `GET /agents/:id` | Agents | Fiche agent |
| `GET /agents/:id/edit` | Agents | Formulaire de modification |
| `POST /agents/:id` | Agents | Mise a jour d'un agent |
| `GET /cartographie` | SIG | Page cartographique des soumissions |

## 6. Schema SQLite

Le schema est initialise dans `config/database.js`. Le module active les cles
etrangeres SQLite et le mode WAL.

### 6.1 Tables territoriales

#### `regions`

Table de reference des regions administratives.

Colonnes principales :

- `id`
- `code_region`
- `nom_region`
- `geometry_geojson`
- `created_at`

La geometrie est conservee sous forme de texte GeoJSON. Les geometries de
regions sont issues de l'agregation des sous-prefectures lors de l'import.

#### `departements`

Table de reference des departements.

Colonnes principales :

- `id`
- `code_departement`
- `nom_departement`
- `region_id`
- `geometry_geojson`
- `created_at`

Chaque departement appartient a une region.

#### `sous_prefectures`

Table de reference des sous-prefectures.

Colonnes principales :

- `id`
- `code_sous_prefecture`
- `nom_sous_prefecture`
- `departement_id`
- `geometry_geojson`
- `created_at`

Chaque sous-prefecture appartient a un departement. La geometrie est stockee au
format GeoJSON texte.

### 6.2 Roles et utilisateurs

#### `roles`

Table de referentiel des roles applicatifs.

Colonnes principales :

- `id`
- `code_role`
- `label`
- `description`
- `created_at`

Le formulaire utilisateur s'appuie sur cette table pour proposer les roles
disponibles.

#### `users`

Table des utilisateurs applicatifs.

Colonnes principales :

- `id`
- `nom`
- `prenoms`
- `email`
- `telephone`
- `role`
- `statut`
- `password_hash`
- `last_login`
- `created_at`

Le champ `role` reference le code fonctionnel du role. Le champ
`password_hash` est present pour la future authentification, mais le module
d'authentification n'est pas encore implemente.

#### `user_regions`

Table d'association entre utilisateurs et regions.

Colonnes principales :

- `user_id`
- `region_id`
- `created_at`

Elle permet de rattacher un utilisateur a plusieurs regions.

### 6.3 Missions

#### `missions`

Table des missions de collecte.

Colonnes principales :

- `id`
- `name`
- `region`
- `status`
- `start_date`
- `end_date`
- `collectors`
- `kobo_asset_uid`
- `latitude`
- `longitude`
- `created_at`

Le champ `kobo_asset_uid` prepare le rattachement futur a un formulaire
KoBoToolbox. Les coordonnees permettent l'affichage cartographique simple des
missions.

### 6.4 Equipes de collecte

#### `equipes`

Table des equipes de collecte.

Colonnes principales :

- `id`
- `nom_equipe`
- `superviseur_id`
- `mission_id`
- `statut`
- `created_at`

Une equipe est rattachee a une mission. Le superviseur est un utilisateur
applicatif distinct, reference par `superviseur_id`.

#### `equipe_regions`

Table d'association entre equipes et regions.

Colonnes principales :

- `equipe_id`
- `region_id`
- `created_at`

Elle materialise les zones d'affectation des equipes.

### 6.5 Agents de collecte

#### `agents_collecte`

Table des agents de collecte.

Colonnes principales :

- `id`
- `nom`
- `prenoms`
- `user_id`
- `equipe_id`
- `code_agent`
- `telephone`
- `equipement`
- `statut`
- `created_at`

L'agent peut exister independamment d'un compte utilisateur. Le lien
`user_id` est facultatif et permet de rattacher un agent a un utilisateur
applicatif de role `agent`.

### 6.6 Soumissions de collecte

#### `soumissions_collecte`

Table des soumissions terrain, utilisee actuellement pour les donnees simulees
du module SIG et prevue pour les futures synchronisations KoBo.

Colonnes principales :

- `id`
- `source`
- `source_submission_id`
- `kobo_asset_uid`
- `mission_id`
- `equipe_id`
- `agent_id`
- `sous_prefecture_id`
- `code_agent_source`
- `submitted_at`
- `latitude`
- `longitude`
- `precision_m`
- `statut_validation`
- `anomaly_count`
- `formulaire_type`
- `raw_data_json`
- `synced_at`
- `created_at`

La contrainte unique `(source, source_submission_id)` rend les imports ou
generations rejouables. Le champ `raw_data_json` conserve la charge metier
collectee sous forme JSON, conforme a la structure principale du XLSForm cible.

## 7. Modules implementes

### 7.1 Socle Express et MVC

Le socle initial comprend :

- une application Express structuree ;
- des vues EJS avec entete, navigation et pied de page ;
- une feuille de style commune ;
- une gestion des erreurs 404 et 500 ;
- une base SQLite initialisee automatiquement ;
- une suite de tests fonctionnels.

Le logo Rakall a ete integre a l'entete global de l'application.

### 7.2 Module Missions

Le module missions permet :

- de creer une mission ;
- de lister les missions ;
- de consulter une fiche mission ;
- d'afficher une carte de localisation lorsque les coordonnees sont presentes ;
- de stocker l'identifiant d'actif KoBo via `kobo_asset_uid`.

La liste des missions utilise Tabulator et Leaflet.

### 7.3 Referentiel territorial

Les tables `regions`, `departements` et `sous_prefectures` ont ete ajoutees.

Le service d'import territorial :

- exploite un fichier GeoJSON de sous-prefectures ;
- utilise les correspondances d'attributs suivantes :
  - code region : `ADM1_PCODE` ;
  - nom region : `ADM1_FR` ;
  - code departement : `ADM2_PCODE` ;
  - nom departement : `ADM2_FR` ;
  - code sous-prefecture : `ADM3_PCODE` ;
  - nom sous-prefecture : `ADM3_FR` ;
- stocke les geometries en GeoJSON texte ;
- agrege les geometries des departements et regions ;
- peut etre rejoue sans creation de doublons.

### 7.4 Roles applicatifs

Une table `roles` a ete creee afin de sortir la definition des roles du code
applicatif. Le service d'import des roles charge le referentiel depuis un CSV.

L'interface de gestion des utilisateurs s'appuie sur cette table pour proposer
les roles disponibles.

### 7.5 Utilisateurs applicatifs

Le modele utilisateur a ete ajuste au format suivant :

```text
User {
  id,
  nom,
  prenoms,
  email,
  telephone,
  role,
  zone_affectation,
  statut,
  password_hash,
  last_login,
  created_at
}
```

Dans le schema physique, `zone_affectation` est materialisee par la table
d'association `user_regions`, afin de permettre l'affectation d'un utilisateur
a plusieurs regions.

Les operations disponibles sont :

- creation ;
- consultation ;
- modification ;
- affectation a une ou plusieurs regions ;
- validation de l'unicite de l'email ;
- validation de l'existence du role et des regions.

### 7.6 Gestion des equipes de collecte

Le module equipes a ete implemente avec :

- creation d'une equipe ;
- modification d'une equipe existante ;
- rattachement obligatoire a une mission ;
- affectation a une ou plusieurs regions ;
- rattachement facultatif a un superviseur ;
- controle du fait que le superviseur choisi est un utilisateur actif de role
  `superviseur`.

Le schema correspond au modele :

```text
Equipe {
  id,
  nom_equipe,
  superviseur_id,
  zone_affectation,
  mission_id,
  statut
}
```

`zone_affectation` est materialisee par `equipe_regions`.

### 7.7 Gestion des agents de collecte

Le module agents de collecte a ete implemente avec :

- creation d'un agent ;
- modification d'un agent existant ;
- consultation d'une fiche agent ;
- rattachement facultatif a un compte utilisateur ;
- rattachement facultatif a une equipe ;
- controle d'unicite du `code_agent` ;
- ajout des champs `nom` et `prenoms`.

Le schema correspond au modele :

```text
AgentCollecte {
  id,
  nom,
  prenoms,
  user_id,
  equipe_id,
  code_agent,
  telephone,
  equipement,
  statut
}
```

Un service d'import CSV des agents a ete ajoute. Il rapproche les equipes par
nom normalise et les comptes utilisateurs de role `agent` par nom et prenoms
lorsqu'une correspondance fiable est disponible.

### 7.8 Soumissions simulees

Une table provisoire `soumissions_collecte` a ete ajoutee pour permettre le
demarrage du module SIG avant l'implementation complete du suivi des
soumissions KoBo.

Le service de generation :

- produit des soumissions fictives ;
- rattache les soumissions aux missions, equipes, agents et sous-prefectures ;
- positionne les points dans les geometries territoriales disponibles ;
- renseigne un `raw_data_json` respectant la structure principale du XLSForm
  `padci_survey_terrain_vf` ;
- alimente les champs utiles aux indicateurs futurs : agent, equipe, date de
  soumission, statut de validation, nombre d'anomalies.

### 7.9 Module Cartographie SIG

La page `/cartographie` constitue le premier ecran du module 4.

Elle comprend :

- une interface en deux volets verticaux ;
- un volet gauche pour les outils ;
- un volet droit Leaflet pour la carte ;
- une largeur par defaut d'environ deux tiers pour la carte ;
- une poignee de redimensionnement ;
- une largeur minimale d'un tiers pour le volet cartographique ;
- un tableau Tabulator des soumissions visibles ;
- des filtres par mission, equipe, agent, statut et dates ;
- une synthese des statuts ;
- l'affichage des limites regionales ;
- l'affichage des points de collecte ;
- un controle de fonds de carte.

Les fonds de carte disponibles sont :

- Couche Humanitaire ;
- Couche Routiere ;
- OSM Open Topo ;
- Carto Positron (Grayscale) ;
- Esri Gray (WLGB) ;
- Couche Google Maps ;
- Couche ESRI (Satellite).

Les points de collecte sont places dans un panneau Leaflet de niveau superieur
aux limites regionales afin de rester selectionnables. La carte se recadre
automatiquement sur l'emprise des points visibles lors d'un filtrage.

## 8. Services et scripts d'import

Les scripts operationnels sont :

| Script npm | Service | Fonction |
| --- | --- | --- |
| `territories:import` | `territoryImportService` | Import des regions, departements et sous-prefectures depuis GeoJSON |
| `roles:import` | `roleImportService` | Import du referentiel des roles depuis CSV |
| `agents:import` | `agentImportService` | Import des agents de collecte depuis CSV |
| `submissions:seed` | `submissionSeedService` | Generation de soumissions simulees |
| `report:docx` | `generate-report-docx.mjs` | Conversion du rapport Markdown en DOCX |

Les imports sont concus pour etre rejouables, en s'appuyant sur des cles
fonctionnelles telles que les codes administratifs, les codes de role, les
codes agent et les identifiants source des soumissions.

## 9. Tests et verification

La suite de tests se trouve dans `tests/app.test.js`.

Elle couvre notamment :

- le referentiel territorial et l'agregation GeoJSON ;
- l'import des roles ;
- le dashboard ;
- la creation, consultation et validation des missions ;
- la creation et modification des utilisateurs ;
- l'affectation multiple aux regions ;
- la creation et modification des equipes ;
- le controle du role superviseur ;
- la creation et modification des agents ;
- l'import CSV des agents ;
- la generation des soumissions simulees ;
- le rendu de la page cartographique ;
- la presence du selecteur de fonds de carte ;
- l'ordre d'affichage des points et limites ;
- le recadrage automatique de la carte lors des filtres.

La commande de verification est :

```bash
npm test
```

## 10. Preparation du deploiement Render

L'orientation retenue pour un premier test Render est :

- deployer l'application comme Web Service Node.js ;
- utiliser `npm install` comme commande de build ;
- utiliser `npm start` comme commande de demarrage ;
- attacher un disque persistant Render ;
- transferer le fichier SQLite local deja prepare vers ce disque ;
- configurer `DATABASE_PATH` vers le chemin du disque persistant ;
- ne pas rejouer les imports sur Render pour ce premier test.

Cette approche permet de tester rapidement l'application avec le schema et la
base SQLite existante, tout en evitant de dependre des chemins locaux Windows
des fichiers GeoJSON et CSV.

## 11. Limites actuelles

Les limites identifiees a ce stade sont :

- absence d'authentification et de gestion de session ;
- absence de controle d'acces effectif par role ;
- absence de synchronisation reelle avec KoBoToolbox API v2 ;
- absence de module complet de suivi des soumissions terrain ;
- persistance encore basee sur SQLite pour le MVP ;
- absence de migrations versionnees independantes du code de demarrage ;
- dependance a des CDN pour Leaflet et Tabulator ;
- fonds de carte externes soumis aux disponibilites et conditions des
  fournisseurs.

## 12. Prochaines etapes recommandees

Les prochaines etapes logiques sont :

1. Finaliser la sauvegarde Git du code source hors base SQLite.
2. Preparer le fichier `render.yaml` ou la configuration Render manuelle.
3. Tester le deploiement Render avec disque persistant et base SQLite
   transferee.
4. Ajouter l'authentification applicative.
5. Mettre en place les autorisations par role.
6. Poursuivre le module de suivi des soumissions.
7. Ajouter les indicateurs de productivite par agent et par equipe.
8. Preparer l'abstraction de persistance en vue de PostgreSQL/PostGIS.
9. Integrer progressivement KoBoToolbox API v2.

## 13. Conclusion

L'application dispose maintenant d'un socle technique coherent et exploitable
pour poursuivre le developpement fonctionnel. Le MVP couvre le dashboard, les
missions, les utilisateurs, les roles, les equipes, les agents, le referentiel
territorial et une premiere page SIG operationnelle.

L'architecture MVC retenue reste simple, lisible et adaptee au stade actuel du
projet. Elle permet de continuer l'implementation progressive des modules tout
en conservant une trajectoire claire vers KoBoToolbox, PostgreSQL/PostGIS et un
deploiement cloud sur Render.
