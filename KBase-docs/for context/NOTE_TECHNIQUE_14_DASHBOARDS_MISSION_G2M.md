# Note technique 14 - Dashboards de mission G2M

## 1. Objet

Cette note technique formalise le modèle de contenu et les principes d’intégration des Dashboards spécifiques par mission dans G2M.

La fenêtre d’accueil actuelle correspond au Dashboard global de toutes les missions supervisées sous G2M. L’évolution proposée consiste à introduire un Dashboard spécifique pour chaque mission.

Chaque Dashboard-Mission reprendra, lorsque cela est pertinent, les mêmes indicateurs que le Dashboard global, avec les ajustements nécessaires et des enrichissements orientés supervision terrain, qualité des données et visualisation décisionnelle.

Après connexion, l’application G2M devra afficher à l’accueil le Dashboard de la mission par défaut de l’application. Il ne s’agit pas d’une mission par défaut propre à chaque utilisateur, mais d’un paramètre global de G2M indiquant quelle mission doit être chargée comme fenêtre d’accueil. Pour un utilisateur non connecté, un message explicite sous forme de bandeau en pied de page devra lui signifier qu’il est invité et qu’à ce titre il dispose d’un accès limité aux fonctionnalités de G2M.

## 2. Point matrice d’accès

Cette nouvelle fonctionnalité devrait être rattachée à une permission dédiée ou existante. Proposition :

- `dashboard.global.read` : lecture du Dashboard global toutes missions ;
- `dashboard.mission.read` : lecture du Dashboard d’une mission ;
- `dashboard.mission.default.read` : accès au Dashboard de la mission définie comme mission d’accueil de l’application, si l’on veut être très précis.

Une approche plus simple consisterait à conserver uniquement `dashboard.read`. Toutefois, il est recommandé de distinguer global et mission, car les droits pourront diverger plus tard.

## 3. Principe fonctionnel

Après connexion, l’accueil ne serait plus forcément le Dashboard global. Il afficherait :

- le Dashboard de la mission définie comme mission d’accueil de l’application ;
- ou, si aucune mission d’accueil n’est définie au niveau global, le Dashboard global ou un écran de sélection de mission selon la politique retenue ;
- ou, pour un administrateur ou un directeur, éventuellement le Dashboard global avec possibilité de choisir une mission.

Pour un utilisateur non connecté, si certaines pages restent accessibles en lecture limitée, un bandeau en pied de page affichera explicitement :

> Vous consultez G2M en accès invité. Certaines fonctionnalités sont limitées. Connectez-vous pour accéder à votre espace complet.

## 4. Modèle de contenu du Dashboard-Mission

### 4.1. En-tête Mission

Contenu recommandé :

- nom de la mission ;
- région ou zone d’intervention ;
- statut de la mission : planifiée, en cours, terminée, suspendue ;
- période : date de début et date de fin ;
- responsable ou coordinateur ;
- source Kobo associée : asset UID ou nom du formulaire ;
- dernière synchronisation Kobo ;
- bouton ou sélecteur pour changer de mission, selon les droits.

### 4.2. Indicateurs synthétiques

Les indicateurs du Dashboard global sont repris mais filtrés sur la mission courante :

- nombre total de soumissions ;
- nombre de soumissions valides ;
- nombre de soumissions incomplètes ou à vérifier ;
- nombre d’agents actifs ;
- nombre d’équipes mobilisées ;
- nombre de localités couvertes ;
- progression globale de collecte ;
- dernière soumission reçue ;
- taux de complétude des données.

### 4.3. Suivi terrain

Indicateurs opérationnels recommandés :

- soumissions par jour ;
- soumissions par équipe ;
- soumissions par agent ;
- zones couvertes et zones non couvertes ;
- localités avec activité récente ;
- localités sans soumission ;
- alertes de faible activité ;
- agents sans activité récente.

### 4.4. Qualité des données

Cette section est utile pour la supervision et le contrôle qualité :

- soumissions sans coordonnées GPS ;
- soumissions avec coordonnées suspectes ;
- doublons potentiels ;
- fiches avec champs critiques manquants ;
- fiches nécessitant validation ;
- écart entre données attendues et données collectées ;
- taux d’anomalies par équipe ou agent.

### 4.5. Visualisation cartographique

Carte centrée sur la mission :

- points de soumissions ;
- regroupement par localité ou équipe ;
- filtres par date, statut, agent et équipe ;
- couleurs selon validation ou anomalie ;
- emprise géographique de la mission si disponible ;
- accès vers la cartographie détaillée.

### 4.6. Visualisation décisionnelle

Cette section assure le lien direct avec la fiche décisionnelle :

- liste des dernières soumissions ;
- accès rapide à la fiche décisionnelle d’une soumission ;
- indicateurs issus du mapping Kobo vers Vue décisionnelle ;
- résumés par section du questionnaire ;
- alertes métiers selon les réponses critiques.

### 4.7. Synchronisation Kobo

Bloc spécifique à la mission :

- formulaire Kobo associé ;
- nombre de soumissions côté G2M ;
- dernière date de synchronisation ;
- résultat de la dernière synchronisation ;
- erreurs éventuelles ;
- bouton de synchronisation si l’utilisateur dispose de `kobo.manage`.

### 4.8. Activité récente

Journal synthétique, sans aller encore vers un module audit complet :

- dernières soumissions reçues ;
- derniers agents actifs ;
- dernière synchronisation ;
- dernières modifications de configuration mission ;
- dernières alertes détectées.

## 5. Données à prévoir

Pour rendre cette évolution propre, il faudra probablement ajouter ou stabiliser :

- une notion de `mission_id` dans les soumissions ;
- une mission d’accueil globale pour l’application, par exemple un paramètre `app.default_mission_id` dans la table `settings` ;
- une relation utilisateurs x missions ;
- une relation équipes x missions déjà probablement existante ;
- une relation agents x équipes x missions historisée ;
- des permissions de lecture par mission.

## 6. Orientation multi-missions pour les agents

### 6.1. Limite de la structure actuelle

Dans la structure actuelle, la table `agents_collecte` contient directement un champ `equipe_id`. Cela signifie qu’un agent est rattaché à une seule équipe courante, et donc indirectement à une seule mission courante, puisque chaque équipe appartient à une mission.

Cette approche est simple, mais elle atteint ses limites dès que l’application doit gérer plusieurs missions dans le temps :

- un agent peut avoir participé à une mission de simulation, puis être affecté à une mission terrain ;
- l’historique de ses affectations n’est pas explicitement conservé ;
- le déplacement d’un agent vers une nouvelle équipe peut rendre moins lisible son rattachement historique ;
- les indicateurs du Dashboard-Mission doivent pouvoir distinguer les agents actuellement affectés, les agents ayant déjà collecté, et les agents associés aux soumissions historiques.

Les soumissions disposent déjà de `mission_id`, `equipe_id` et `agent_id`. Ces champs doivent être conservés comme instantané opérationnel de la collecte. Ils permettent de rattacher chaque soumission à la mission, à l’équipe et à l’agent au moment de l’enregistrement ou de l’import.

### 6.2. Règle métier cible

La règle métier proposée est la suivante :

> Un agent peut travailler sur plusieurs missions dans le temps, mais ne peut pas être affecté simultanément à deux missions actives.

Cette règle implique une gestion historisée des affectations :

- une affectation active au maximum par agent ;
- plusieurs affectations passées possibles ;
- une date de début et une date de fin d’affectation ;
- un statut d’affectation permettant de distinguer actif, terminé, suspendu ou annulé ;
- une cohérence entre la mission, l’équipe et l’agent.

### 6.3. Modèle de données recommandé

Il est recommandé de créer une nouvelle table dédiée aux affectations des agents :

```text
agent_mission_assignments
```

Structure indicative :

| Champ | Rôle |
| --- | --- |
| `id` | Identifiant technique de l’affectation |
| `agent_id` | Agent concerné |
| `mission_id` | Mission d’affectation |
| `equipe_id` | Équipe d’affectation dans cette mission |
| `start_date` | Date de début d’affectation |
| `end_date` | Date de fin d’affectation |
| `statut` | `active`, `terminee`, `suspendue`, `annulee` |
| `created_by` | Utilisateur ayant créé l’affectation |
| `created_at` | Date de création |
| `updated_at` | Date de dernière mise à jour |

La contrainte “un agent ne peut pas être sur deux missions simultanément” peut être portée par :

- une validation applicative dans le modèle et le contrôleur ;
- un index unique partiel SQLite sur les affectations actives, par exemple sur `agent_id` lorsque `statut = 'active'` ;
- une validation supplémentaire vérifiant que `equipe_id` appartient bien à `mission_id`.

Le champ `agents_collecte.equipe_id` pourrait être conservé temporairement comme raccourci d’affectation courante, puis progressivement remplacé par une lecture de l’affectation active dans `agent_mission_assignments`.

### 6.4. Impact sur les soumissions

La table `soumissions_collecte` doit continuer à stocker `mission_id`, `equipe_id` et `agent_id`, car ces champs représentent le contexte réel de collecte d’une soumission.

Une évolution utile serait d’ajouter un champ optionnel :

```text
assignment_id
```

Ce champ permettrait de rattacher une soumission à l’affectation active précise utilisée lors de l’import ou de la collecte. Il faciliterait :

- le calcul des indicateurs par période d’affectation ;
- l’audit des changements d’équipe ;
- la distinction entre agent courant et agent historique ;
- la production de rapports par mission, équipe et agent.

Cette évolution n’oblige pas à créer une nouvelle table de soumissions. La table actuelle peut rester la table principale, à condition d’être enrichie progressivement et de préserver les instantanés `mission_id`, `equipe_id`, `agent_id`.

### 6.5. Impact sur les Dashboards-Mission

Avec une gestion historisée des affectations, le Dashboard-Mission pourra calculer plus proprement :

- les agents actuellement affectés à la mission ;
- les agents ayant produit au moins une soumission sur la mission ;
- les agents sans activité récente ;
- les équipes actives de la mission ;
- les soumissions par équipe et par agent ;
- les écarts entre agents affectés et agents effectivement actifs ;
- les indicateurs historiques sans être perturbés par les réaffectations futures.

Il faudra distinguer deux familles d’indicateurs :

- les indicateurs d’affectation, calculés depuis `agent_mission_assignments` ;
- les indicateurs de collecte, calculés depuis `soumissions_collecte`.

### 6.6. Proposition d’implémentation progressive

L’implémentation recommandée se ferait en quatre temps.

1. Créer la table `agent_mission_assignments` et initialiser les affectations à partir des équipes et agents existants.

2. Adapter les écrans Agents et Équipes pour afficher l’affectation active d’un agent, sans supprimer immédiatement `agents_collecte.equipe_id`.

3. Adapter l’import Kobo et les scripts de simulation pour résoudre l’affectation active de l’agent au moment de la soumission, puis renseigner `mission_id`, `equipe_id`, `agent_id` et éventuellement `assignment_id`.

4. Basculer les indicateurs Dashboard-Mission vers les nouvelles sources :

- affectations actives depuis `agent_mission_assignments` ;
- collecte réelle depuis `soumissions_collecte` ;
- historique agent par jointure entre les deux.

Cette approche limite le risque, car elle ne détruit pas la structure actuelle. Elle introduit d’abord une couche d’affectation historisée, puis migre progressivement les usages.

## 7. Proposition de première version

Pour une première version pragmatique, il est recommandé de commencer par :

- créer la route `GET /missions/:id/dashboard` ;
- protéger l’accès avec la permission `dashboard.mission.read` ;
- ajouter un bouton `Dashboard` depuis la fiche mission ;
- afficher les indicateurs de base : soumissions, agents, équipes, dernières soumissions et carte filtrée mission ;
- afficher le Dashboard de la mission d’accueil globale après connexion ;
- ajouter le bandeau invité en pied de page pour les utilisateurs non connectés.

Les enrichissements qualité des données, alertes métier et visualisation décisionnelle avancée pourront être ajoutés ensuite par itérations successives.
