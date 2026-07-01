# Resume - Import des emprises de batiments depuis OpenStreetMap

1. La LayerBox "Batiments prepares" permet de choisir une mission, un code site, un nom de site, puis de lancer un import OSM par zone.

2. L'utilisateur dessine une zone sur la carte Leaflet : rectangle ou polygone libre. La geometrie est stockee en GeoJSON `Polygon`.

3. Le front calcule localement la surface approximative de la zone. Le bouton "Importer OSM" reste desactive si la zone depasse 5 km2.

4. Au clic sur "Importer OSM", le navigateur envoie `mission_id`, `site_code`, `site_name` et `selection` a `POST /cartographie/buildings/import-osm`.

5. Le controleur verifie les droits `buildings.manage`, puis appelle `fetchOsmBuildings(selection)` dans `osmBuildingImportService`.

6. Le service normalise le polygone, recalcule sa surface cote serveur, rejette les zones invalides ou superieures a 5 km2.

7. La requete Overpass cible les objets `way["building"]` et `relation["building"]` contenus dans le polygone, avec sortie JSON et geometrie complete.

8. Le service tente plusieurs endpoints Overpass configurables, par defaut `overpass-api.de` puis `overpass.kumi.systems`, avec timeout serveur.

9. Les resultats Overpass sont convertis en GeoJSON : `way` devient `Polygon`, `relation` devient `MultiPolygon`, avec proprietes `source=osm`, reference OSM et code batiment.

10. Les batiments sont enregistres via `BuildingFeature.importGeoJson` dans `building_features`, avec upsert sur `mission_id + site_code + building_code`, statut par defaut `prepare`.
