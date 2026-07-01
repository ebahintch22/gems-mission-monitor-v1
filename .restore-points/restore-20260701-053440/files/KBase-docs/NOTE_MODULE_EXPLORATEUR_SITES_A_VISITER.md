# Fonctionnement du module "Explorateur des sites à visiter"

## Fonctionnement général

Le module **Explorateur des sites à visiter** s'ouvre dans une LayerBox cartographique. Il charge les sites via `/api/sites`, les affiche sous forme d'arborescence et de tableau Tabulator, puis permet de sélectionner un site, visualiser sa géométrie, compléter sa localisation, importer les emprises OSM, produire des plans et exporter les données GeoJSON.

## Commandes disponibles

| Commande | Action réalisée |
| --- | --- |
| **Statuts : Planifié / En cours / Réalisé** | Filtre les sites chargés selon leur statut de visite. Le changement recharge automatiquement la liste. |
| **Ordre hiérarchique** | Change l'organisation de l'arborescence : `Région > Ministère > Localité` ou `Ministère > Région > Localité`. |
| **Actualiser** | Recharge les sites depuis l'API, réinitialise la sélection courante et met à jour les indicateurs. |
| **Arborescence d'exploration** | Permet de filtrer les sites par groupe hiérarchique. Le tableau affiche uniquement les sites correspondant au nœud sélectionné. |
| **Colonnes** | Permet d'afficher ou masquer les colonnes du tableau. Le choix est mémorisé dans le navigateur. |
| **Sélection d'un site dans le tableau** | Sélectionne le site, affiche ses géométries sur la carte et adapte les commandes disponibles. |
| **Ajouter / Modifier référence ponctuelle** | Permet de placer ou déplacer un point de référence du site sur la carte. |
| **Ajouter / Modifier contour** | Permet de tracer ou corriger le contour polygonal du site. |
| **Annuler** | Annule l'édition de localisation en cours. |
| **Enregistrer** | Sauvegarde le point ou le contour via l'API `/api/sites/:id/location`. |
| **Importer emprise bâtiments** | Ouvre la fenêtre d'import des emprises de bâtiments depuis OpenStreetMap. |
| **Plan de situation** | Ouvre le panneau de génération du plan imprimable du site sélectionné. Disponible si des emprises bâtiments existent. |
| **Exporter GeoJSON** | Ouvre une fenêtre de sélection multi-sites et génère deux fichiers GeoJSON : contours des sites et emprises bâtiments. |
| **Redimensionner les volets** | Permet d'ajuster la largeur entre l'arborescence et le tableau. |

## Import des emprises bâtiments OSM

Mode opératoire :

1. Cliquer sur **Importer emprise bâtiments**.
2. La fenêtre affiche uniquement les sites disposant déjà d'un contour.
3. Choisir la source : actuellement **OpenStreetMap** est active, **TopoExport** est désactivée.
4. Choisir le mode d'import :
   - **Sites sans emprises uniquement** : option par défaut.
   - **Tous les sites sélectionnés** : force la réimportation.
5. Sélectionner les sites dans le tableau, ou utiliser **Tout sélectionner**.
6. Cliquer sur **Démarrer l'importation**.
7. Si au moins 10 sites sont à traiter, une confirmation est demandée.
8. Le module interroge l'API OSM/Overpass en deux passes : première passe à 30 s, reprise des échecs à 60 s.
9. Les résultats sont affichés dans le tableau de droite : succès, échec, nombre de bâtiments, message d'erreur.
10. Cliquer sur **Enregistrer les données** pour stocker les emprises importées dans la base.

## Génération du plan de situation

Mode opératoire :

1. Sélectionner un site contenant des emprises OSM.
2. Cliquer sur **Plan de situation**.
3. Choisir les paramètres :
   - type de plan : satellite, filaire ou mixte ;
   - orientation : automatique, paysage ou portrait ;
   - numérotation : automatique ou manuelle ;
   - taille et opacité des étiquettes.
4. Cliquer sur **Définir emprise**.
5. Tracer le cadre d'impression sur la carte.
6. Cliquer sur **Valider emprise**.
7. Utiliser **Aperçu imprimable** pour contrôler le rendu.
8. Utiliser **Imprimer / PDF** pour lancer l'impression navigateur ou générer un PDF.

## Export GeoJSON multi-sites

Mode opératoire :

1. Filtrer éventuellement les sites dans l'explorateur.
2. Cliquer sur **Exporter GeoJSON**.
3. Sélectionner les sites à exporter dans la fenêtre.
4. Utiliser éventuellement **Tout sélectionner** ou **Tout désélectionner**.
5. Cliquer sur **Exporter les fichiers**.
6. Le module charge les données de chaque site sélectionné.
7. Deux fichiers sont téléchargés :
   - `*_contours_sites.geojson` : contours des sites ;
   - `*_emprises_batiments.geojson` : emprises des bâtiments.

## Localisation des sites

Mode opératoire pour un point :

1. Sélectionner un site.
2. Cliquer sur **Ajouter référence ponctuelle** ou **Modifier référence ponctuelle**.
3. Cliquer sur la carte pour placer le point.
4. Cliquer sur **Enregistrer**.

Mode opératoire pour un contour :

1. Sélectionner un site.
2. Cliquer sur **Ajouter contour** ou **Modifier contour**.
3. Cliquer sur la carte pour ajouter les sommets.
4. Double-cliquer ou attendre au moins 3 points pour obtenir un contour valide.
5. Cliquer sur **Enregistrer**.
