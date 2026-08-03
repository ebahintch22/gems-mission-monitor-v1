# Extraction des centroïdes de bâtiments Kobo en GeoJSON

## Objectif

Produire une couche GeoJSON contenant les centroïdes des bâtiments extraits des soumissions Kobo.

## Commandes PowerShell

```powershell
$batch = "2026-07-25_centroides-batiments"
$sourceKobo = "C:\CHEMIN\VERS\fichier-kobo-agrege.json"
$siteContours = "C:\CHEMIN\VERS\contours_sites.geojson"
$buildingExtents = "C:\CHEMIN\VERS\emprises_batiments.geojson"

node scripts/g2m-create-batch.mjs $batch

Copy-Item -LiteralPath $sourceKobo -Destination "KBase-docs\kobo-geometry-extractions\batches\$batch\00_source\kobo-source.json"
Copy-Item -LiteralPath $siteContours -Destination "KBase-docs\kobo-geometry-extractions\batches\$batch\05_reference_layers\sources\contours_sites.geojson"
Copy-Item -LiteralPath $buildingExtents -Destination "KBase-docs\kobo-geometry-extractions\batches\$batch\05_reference_layers\sources\emprises_batiments.geojson"

node scripts/extract-kobo-geometries.mjs --batch $batch

node scripts/match-kobo-reference-layers.mjs --batch $batch --kobo-points
```

## Fichier produit

```powershell
KBase-docs\kobo-geometry-extractions\batches\$batch\06_matching\centroid_batiment.geojson
```

## Remarque

L’option `--kobo-points` demande au script de construire les centroïdes de bâtiments à partir de l’extraction Kobo normalisée. Le script utilise aussi les couches de référence `contours_sites.geojson` et `emprises_batiments.geojson`.
