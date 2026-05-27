Est# Rapport technique - Socle GEMS Mission Monitor

## 1. Objet du document

Ce document décrit le socle technique mis en place pour l'application de suivi
GEMS des missions de collecte. Il couvre le périmètre du MVP, les choix
d'architecture, les composants livrés et les évolutions prévues pour
l'intégration KoBoToolbox et la migration vers PostgreSQL/PostGIS.

## 2. Perimetre du MVP

Le socle livré permet de :

- démarrer une application web Node.js/Express ;
- afficher un tableau de bord synthétique ;
- créer et consulter des missions de collecte ;
- stocker les données des missions dans une base SQLite ;
- visualiser les missions dans un tableau interactif Tabulator ;
- afficher sur une carte Leaflet les missions disposant de coordonnées ;
- stocker un identifiant d'actif KoBo en préparation de l'intégration API v2.

Le MVP ne couvre pas encore la synchronisation effective avec KoBoToolbox,
l'authentification, la gestion des utilisateurs, ni l'exploitation avancée de
données géospatiales.

## 3. Stack technique

| Composant | Technologie | Utilisation dans le socle |
| --- | --- | --- |
| Runtime | Node.js >= 20 | Exécution du serveur applicatif |
| Serveur HTTP | Express 5 | Routage, middleware, rendu des pages |
| Templates | EJS | Génération des vues serveur |
| Base MVP | SQLite via `better-sqlite3` | Persistance locale des missions |
| Carte | Leaflet | Affichage des missions géolocalisées |
| Tableau | Tabulator | Consultation interactive de la liste des missions |
| Configuration | `dotenv` | Lecture de `PORT` et `DATABASE_PATH` |
| Tests HTTP | Node Test Runner + Supertest | Validation des routes principales |

La cible d'évolution prévoit PostgreSQL/PostGIS afin d'assurer une persistance
plus robuste et des requêtes géographiques adaptées à un usage en production.

## 4. Architecture applicative

L'application suit une organisation MVC légère :

```text
gems-mission-monitor/
|-- app.js                         # Initialisation Express et montage des routes
|-- config/
|   `-- database.js                # Connexion SQLite et schema initial
|-- controllers/
|   |-- dashboardController.js     # Donnees du tableau de bord
|   `-- missionController.js       # Actions liees aux missions
|-- models/
|   `-- Mission.js                 # Requetes SQLite des missions
|-- routes/
|   |-- dashboardRoutes.js         # Route d'accueil
|   `-- missionRoutes.js           # Routes du module missions
|-- views/
|   |-- dashboard/                 # Vue du dashboard
|   |-- missions/                  # Liste, creation et detail
|   |-- errors/                    # Pages d'erreur
|   `-- partials/                  # Entete et pied de page
|-- public/
|   |-- css/app.css                # Presentation de l'application
|   `-- js/missions.js             # Initialisation Leaflet/Tabulator
|-- data/                          # Fichier SQLite local genere a l'execution
|-- tests/app.test.js              # Tests fonctionnels HTTP du socle
|-- .env.example                   # Variables configurables
`-- README.md                      # Instructions de demarrage
```

Cette séparation maintient les responsabilités suivantes :

- les routes associent les URL aux traitements ;
- les contrôleurs préparent les données et sélectionnent les vues ;
- le modèle encapsule les accès SQLite ;
- les vues assurent le rendu HTML ;
- les fichiers publics prennent en charge l'affichage côté navigateur.

## 5. Demarrage et configuration Express

Le point d'entrée `app.js` configure :

- le moteur de vues `ejs` et le répertoire `views` ;
- le traitement des formulaires URL-encodés et des corps JSON ;
- la publication des ressources statiques du répertoire `public` ;
- le montage du dashboard sur `/` et des missions sur `/missions` ;
- le rendu des pages d'erreur HTTP 404 et 500 ;
- l'écoute sur le port défini par l'environnement, avec `3000` par défaut.

L'application exporte également l'instance Express, permettant aux tests
Supertest de l'exécuter sans démarrer de serveur réseau.

### Configuration d'environnement

Le fichier `.env.example` expose les paramètres disponibles :

```dotenv
PORT=3000
DATABASE_PATH=./data/gems.sqlite
```

`DATABASE_PATH` permet notamment d'utiliser une base en mémoire lors des tests,
sans modifier la base de développement.

## 6. Base de donnees SQLite

La configuration de la base se trouve dans `config/database.js`. Au démarrage,
le module :

- ouvre ou crée le fichier SQLite configuré ;
- active les contraintes de clés étrangères ;
- active le journal `WAL` pour améliorer le comportement concurrent local ;
- initialise la table `missions` si elle n'existe pas.

### Modele de donnees `missions`

| Colonne | Type SQLite | Description |
| --- | --- | --- |
| `id` | `INTEGER` | Identifiant primaire auto-incrémenté |
| `name` | `TEXT` | Nom de la mission, obligatoire |
| `region` | `TEXT` | Zone ou région d'intervention, obligatoire |
| `status` | `TEXT` | Statut de suivi de la mission |
| `start_date` | `TEXT` | Date de début éventuelle |
| `end_date` | `TEXT` | Date de fin éventuelle |
| `collectors` | `INTEGER` | Nombre d'agents de collecte |
| `kobo_asset_uid` | `TEXT` | Identifiant d'actif KoBoToolbox |
| `latitude` | `REAL` | Latitude de référence de la mission |
| `longitude` | `REAL` | Longitude de référence de la mission |
| `created_at` | `TEXT` | Horodatage de création |

Le statut est contraint aux valeurs :

- `planifiee` ;
- `en_cours` ;
- `terminee` ;
- `suspendue`.

Le nombre d'agents est contraint à une valeur positive ou nulle. Les
coordonnées sont validées dans le contrôleur avant persistance.

## 7. Modele et logique metier

Le modèle `Mission` fournit les opérations requises par le MVP :

| Methode | Usage |
| --- | --- |
| `all()` | Lister les missions par date de création décroissante |
| `recent(limit)` | Extraire les dernières missions du dashboard |
| `findById(id)` | Obtenir le détail d'une mission |
| `create(input)` | Insérer une nouvelle mission |
| `stats()` | Calculer les indicateurs agrégés du dashboard |

Les indicateurs calculés sont :

- nombre total de missions ;
- nombre de missions en cours ;
- nombre de missions terminées ;
- somme des agents mobilisés.

## 8. Routes et ecrans disponibles

| Methode | Route | Traitement | Vue / comportement |
| --- | --- | --- | --- |
| `GET` | `/` | Dashboard | Indicateurs et missions récentes |
| `GET` | `/missions` | Liste des missions | Tableau Tabulator et carte Leaflet |
| `GET` | `/missions/new` | Formulaire | Création d'une mission |
| `POST` | `/missions` | Enregistrement | Validation, insertion, redirection |
| `GET` | `/missions/:id` | Consultation | Détail et carte si coordonnées disponibles |

### Validation de creation

Lors de la création d'une mission, le contrôleur vérifie :

- la présence du nom et de la région ;
- l'appartenance du statut aux valeurs autorisées ;
- la validité du nombre d'agents ;
- une latitude comprise entre `-90` et `90` ;
- une longitude comprise entre `-180` et `180`.

Une saisie invalide provoque un retour HTTP `400` et le réaffichage du
formulaire accompagné d'un message d'erreur.

## 9. Interface utilisateur

### Dashboard

La page d'accueil constitue un tableau de bord minimal :

- quatre cartes d'indicateurs ;
- un tableau des cinq missions les plus récentes ;
- un accès direct à la création d'une mission et au registre complet.

### Registre des missions

La page `/missions` intègre :

- Tabulator pour afficher les données en tableau ;
- Leaflet pour afficher les marqueurs associés aux coordonnées stockées ;
- OpenStreetMap comme fond cartographique ;
- une navigation vers la fiche de chaque mission.

Les données provenant de SQLite sont injectées dans la page sous forme JSON.
Le script front-end crée les liens et infobulles avec des noeuds DOM textuels
afin de ne pas exécuter une valeur saisie comme contenu HTML.

### Fiche mission

La fiche mission présente :

- le statut opérationnel ;
- la région et la période ;
- le nombre d'agents ;
- l'UID de formulaire KoBo ;
- une carte de localisation lorsque la latitude et la longitude sont présentes.

## 10. Preparation de l'integration KoBoToolbox

Le champ `kobo_asset_uid` permet d'associer dès maintenant une mission à un
formulaire KoBoToolbox. Cette première décision prépare les traitements
suivants sans imposer leur implémentation dans le MVP :

- configuration d'un client API KoBoToolbox v2 ;
- récupération des soumissions liées à un actif ;
- synchronisation périodique ou à la demande ;
- indicateurs de collecte issus des soumissions ;
- affichage spatial des points effectivement collectés.

Pour la suite, il est recommandé d'isoler l'accès KoBo dans un service
`services/koboService.js` et de ne pas placer de jeton API dans les vues ou
dans le dépôt. Le jeton devra être injecté par variable d'environnement.

## 11. Migration prevue vers PostgreSQL/PostGIS

SQLite répond au besoin d'un MVP local avec un déploiement simplifié. Pour un
usage multi-utilisateur et des volumes de collecte croissants, la migration
prévue vers PostgreSQL/PostGIS devra traiter :

- remplacement de la connexion SQLite par une couche d'accès PostgreSQL ;
- migrations versionnées du schéma ;
- transformation des coordonnées en objets géométriques ou géographiques ;
- index spatial pour les recherches de proximité et les agrégations par zone ;
- stratégie de synchronisation KoBo et de reprise sur erreur ;
- gestion des accès concurrents, des utilisateurs et des habilitations.

Le modèle MVC actuel facilite cette évolution : les routes et les vues peuvent
être conservées, tandis que la persistance évolue principalement dans la
couche modèle et les futurs services.

## 12. Tests et verification

La suite `tests/app.test.js` utilise le moteur de test natif Node.js et
Supertest. La base est remplacée par SQLite en mémoire pendant les tests.

Les scénarios couverts sont :

- affichage du dashboard ;
- création d'une mission et consultation depuis la liste, la fiche et le
  dashboard ;
- rejet d'une création avec coordonnées invalides.

Commande de validation :

```bash
npm test
```

Résultat constaté lors de la livraison du socle :

```text
tests: 3
pass: 3
fail: 0
```

## 13. Limites actuelles et prochaines etapes

Le socle constitue une base opérationnelle de développement, mais plusieurs
éléments sont nécessaires avant un usage de production :

1. Ajouter l'intégration authentifiée à l'API KoBoToolbox v2.
2. Introduire une authentification applicative et des rôles.
3. Mettre en place des migrations de base versionnées.
4. Préparer l'abstraction de persistance pour PostgreSQL/PostGIS.
5. Ajouter la modification, l'archivage et la recherche filtrée des missions.
6. Renforcer les tests sur les erreurs, la sécurité et les futurs flux KoBo.
7. Conditionner ou héberger localement les ressources Leaflet et Tabulator si
   l'application doit fonctionner en environnement réseau restreint.

## 14. Conclusion

Le MVP dispose désormais d'un socle cohérent : serveur Express structuré,
persistance SQLite, rendu EJS, module missions utilisable, tableau de bord
minimal, affichage cartographique et tests HTTP de base. Cette architecture
permet de poursuivre l'intégration KoBoToolbox puis la migration de la
persistance vers PostgreSQL/PostGIS sans remettre en cause l'organisation
générale de l'application.
