# GEMS Mission Monitor

Socle MVP de suivi des missions de collecte, construit avec Node.js, Express,
SQLite et EJS. La liste des missions integre une table Tabulator et une carte
Leaflet. L'identifiant d'actif KoBo est stocke pour la future integration API.

## Demarrage

```bash
npm install
npm start
```

L'application est disponible par defaut sur `http://localhost:3000`.
Copier `.env.example` vers `.env` permet d'ajuster `PORT` et `DATABASE_PATH`.

## Routes

- `GET /` : dashboard minimal et indicateurs.
- `GET /missions` : table et carte des missions.
- `GET /missions/new` : formulaire de creation.
- `POST /missions` : enregistrement SQLite.
- `GET /missions/:id` : detail d'une mission.
- `GET /users` : registre des utilisateurs applicatifs.
- `GET /users/new` : creation d'un utilisateur et affectation de regions.
- `POST /users` : enregistrement d'un utilisateur.
- `GET /users/:id` : fiche utilisateur et regions affectees.
- `GET /users/:id/edit` : formulaire de modification.
- `POST /users/:id` : mise a jour du profil et de ses regions.
- `GET /equipes` : registre des equipes de collecte.
- `GET /equipes/new` : creation d'une equipe.
- `POST /equipes` : enregistrement et affectation de regions.
- `GET /equipes/:id` : fiche equipe, mission et superviseur.
- `GET /equipes/:id/edit` : formulaire de modification d'une equipe.
- `POST /equipes/:id` : mise a jour de l'equipe et de ses regions.
- `GET /agents` : registre des agents de collecte.
- `GET /agents/new` : creation et affectation d'un agent.
- `POST /agents` : enregistrement d'un agent.
- `GET /agents/:id` : fiche agent et affectation courante.
- `GET /agents/:id/edit` : formulaire de modification d'un agent.
- `POST /agents/:id` : mise a jour d'un agent.
- `GET /cartographie` : espace SIG des soumissions avec filtres et carte.

## Verification

```bash
npm test
```

## Referentiel territorial

Les tables `regions`, `departements` et `sous_prefectures` stockent les
geometries au format GeoJSON texte. Les geometries des departements et regions
sont produites par union des polygones de sous-prefectures lors de l'import.

```bash
npm run territories:import
```

Par defaut, la commande charge
`C:\OPEN-NODE-APPS\sig-padci-monitor\data\sspref-light-r3-filtered.geojson`.
Un autre fichier peut etre passe en argument ou configure avec
`TERRITORY_GEOJSON_PATH`. La commande est idempotente : une reexecution met a
jour le referentiel sans creer de doublons.

## Utilisateurs applicatifs

Le registre minimal stocke les profils `users` et leur affectation multiple aux
regions dans `user_regions`. Le formulaire propose les regions chargees depuis
le referentiel territorial. Le champ `password_hash` est prevu dans le schema,
mais reste vide tant que le module d'authentification n'est pas implemente.

Les roles sont stockes dans la table `roles` et peuvent etre charges depuis le
referentiel CSV :

```bash
npm run roles:import
```

Par defaut, la commande utilise
`C:\OPEN-NODE-APPS\sig-padci-monitor\data\role_definitions.csv`. Le chemin peut
etre configure avec `ROLE_DEFINITIONS_PATH`. Le formulaire utilisateur propose
uniquement les roles presents dans la table.

## Equipes de collecte

Les equipes sont stockees dans `equipes` et leurs zones dans
`equipe_regions`. Une equipe est rattachee a une mission, couvre au moins une
region et peut etre associee a un utilisateur ayant le role `superviseur` et
le statut `actif`.

## Agents de collecte

Les agents sont stockes dans `agents_collecte` avec leur nom et leurs prenoms,
independamment d'un eventuel compte utilisateur. Leur `code_agent` est unique.
Un agent peut etre rattache a une equipe et, facultativement, a un compte
utilisateur portant le role `agent`. Une affectation peut etre ajoutee,
modifiee ou retiree depuis le registre des agents.

Les agents peuvent etre charges depuis un fichier CSV :

```bash
npm run agents:import
```

Par defaut, la commande utilise
`C:\OPEN-NODE-APPS\sig-padci-monitor\data\agent_collecte.csv`. L'import est
rejouable sur la base du `code_agent`. Il rapproche les equipes par leur nom
normalise et les comptes applicatifs de role `agent` par nom et prenoms
normalises lorsqu'une correspondance unique est disponible.

## Soumissions simulees pour la cartographie SIG

La table `soumissions_collecte` stocke les points de collecte et le contenu
metier dans `raw_data_json`. Les donnees simulees respectent la structure
principale du XLSForm `padci_survey_terrain_vf`, version `2026052601`,
notamment `gps_site`, l'enqueteur, l'equipe et la localisation administrative.

```bash
npm run submissions:seed
```

La generation utilise les agents affectes, leurs equipes et les polygones des
sous-prefectures appartenant aux regions de chaque equipe. Elle est rejouable :
les soumissions simulees sont mises a jour sur leur identifiant source, sans
duplication.

La page `/cartographie` presente un volet d'outils a gauche et une carte
Leaflet a droite, qui occupe par defaut deux tiers de l'espace disponible. Une
poignee permet de redimensionner les volets sur ecran large en conservant au
moins un tiers de largeur pour la carte. Les filtres mettent a jour les points,
la synthese des statuts et le tableau Tabulator.
