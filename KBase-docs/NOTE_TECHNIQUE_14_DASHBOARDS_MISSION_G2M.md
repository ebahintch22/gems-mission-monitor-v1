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
- une relation agents x équipes x missions ;
- des permissions de lecture par mission.

## 6. Proposition de première version

Pour une première version pragmatique, il est recommandé de commencer par :

- créer la route `GET /missions/:id/dashboard` ;
- protéger l’accès avec la permission `dashboard.mission.read` ;
- ajouter un bouton `Dashboard` depuis la fiche mission ;
- afficher les indicateurs de base : soumissions, agents, équipes, dernières soumissions et carte filtrée mission ;
- afficher le Dashboard de la mission d’accueil globale après connexion ;
- ajouter le bandeau invité en pied de page pour les utilisateurs non connectés.

Les enrichissements qualité des données, alertes métier et visualisation décisionnelle avancée pourront être ajoutés ensuite par itérations successives.
