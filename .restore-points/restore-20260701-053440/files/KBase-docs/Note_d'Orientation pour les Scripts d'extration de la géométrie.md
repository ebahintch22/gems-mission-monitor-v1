# Note d'orientation pour les scripts d'extraction de la géométrie

Le résultat de l'analyse des versions Kobo peut être exploité comme une **table de règles de parsing par version de formulaire**. L'objectif est de ne plus traiter toutes les soumissions Kobo de la même manière, mais d'adapter l'extraction géométrique selon `__version__`, le champ concerné et son mode d'encodage.

## 1. Utiliser `__version__` comme clé de stratégie

Chaque soumission Kobo doit être routée vers une stratégie d'extraction :

```js
const versionCode = submission.__version__;
const strategy = geometryStrategies[versionCode] || geometryStrategies.default;
```

Cela permet de gérer proprement les différences entre versions, par exemple :

- anciennes versions : `coins_bat` automatique dominant ;
- versions récentes : `coins_bat_manuel` plus fréquent ;
- champs manuels plus hétérogènes dans les dernières versions.

## 2. Définir un ordre de priorité des sources géométriques

Pour le site :

```txt
1. modB/emprise_site
2. modB/emprise_site_manuel
3. modA/gps_centre
4. modA/gps_site
5. modA/gps_manuel
```

Pour les bâtiments :

```txt
1. batiment/coins_bat
2. batiment/coins_bat_manuel
```

Pour le raccordement :

```txt
1. modH/gps_raccord
2. modH/gps_raccord_manuel
```

## 3. Créer des parseurs par type d'encodage

Le fichier d'analyse indique plusieurs formats à gérer :

```txt
kobo_geopoint_string
semicolon_coordinate_sequence
wkt_point
lat_lon_comma_text
manual_text_with_coordinates
text_or_other
```

Fonctions de parsing à prévoir :

```js
parseKoboPoint("5.3502118 -4.0066352 67.1 4.98");
parseCoordinateSequence("5.35 -4.00 67 5;5.36 -4.01 68 4");
parseWktPoint("POINT (-3.99588 5.29112)");
parseManualCoordinates("Entrée principale 5.35011, -4.00659");
```

## 4. Traiter les bâtiments dans le repeat `batiment`

Point important : `batiment/coins_bat` et `batiment/coins_bat_manuel` ne sont pas au niveau racine. Il faut parcourir :

```js
for (const building of submission.batiment || []) {
  const geometry =
    parsePolygon(building["batiment/coins_bat"]) ||
    parseManualPolygon(building["batiment/coins_bat_manuel"]);
}
```

Sinon, les scripts concluront à tort que les géométries bâtiment sont absentes.

## 5. Produire un score de fiabilité géométrique

Pour chaque géométrie extraite, ajouter un statut :

```json
{
  "geometry_status": "valid",
  "geometry_source": "batiment/coins_bat",
  "geometry_parser": "semicolon_coordinate_sequence",
  "geometry_confidence": "high"
}
```

Niveaux recommandés :

```txt
high   : champ GPS structuré ou séquence Kobo valide
medium : WKT ou coordonnées manuelles bien reconnues
low    : texte libre avec coordonnées extraites
failed : impossible à parser
```

## 6. Gérer les corrections sans écraser la donnée brute

Conserver toujours :

```json
{
  "raw_geometry_value": "...",
  "parsed_geometry": {},
  "correction_notes": "...",
  "needs_review": true
}
```

C'est essentiel pour auditer les corrections terrain et éviter de perdre l'information Kobo originale.

## 7. Utiliser `geometry_presence_by_version` pour prioriser les efforts

Si la version 5 utilise majoritairement `batiment/coins_bat_manuel`, il faut d'abord renforcer le parseur manuel pour cette version.

Inversement, pour les premières versions, l'effort principal doit porter sur le parseur des séquences automatiques `lat lon alt precision; lat lon alt precision`.

## 8. Ajouter des contrôles qualité automatiques

Après parsing, contrôler :

```txt
- coordonnées dans l'emprise Côte d'Ivoire ;
- polygone fermé ;
- minimum 3 sommets distincts ;
- surface non nulle ;
- surface bâtiment raisonnable ;
- distance raccordement cohérente ;
- bâtiment inclus ou proche du contour du site.
```

## 9. Organiser la sortie des scripts

Pour chaque soumission, produire trois couches normalisées :

```json
{
  "site_point": {},
  "site_polygon": {},
  "building_polygons": [],
  "raccord_point": {},
  "geometry_quality_report": []
}
```

Cette structuration rend ensuite l'import SIG beaucoup plus simple.

## 10. Recommandation pratique

Créer un module unique du type :

```js
extractKoboGeometries(submission, analysisRules);
```

Ce module lit `__version__`, applique les priorités, parse les champs disponibles, produit des GeoJSON normalisés et ajoute un rapport qualité. Le fichier d'analyse sert alors de référence pour décider quelles règles activer par version.
