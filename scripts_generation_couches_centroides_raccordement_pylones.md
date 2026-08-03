# Scripts de génération des couches GeoJSON depuis les soumissions normalisées

| Couche à produire | Script CLI à utiliser | Sortie attendue |
|---|---|---|
| Centroïdes de bâtiments | `scripts/match-kobo-reference-layers.mjs --kobo-points` | `06_matching/centroid_batiment.geojson` |
| Points de raccordement | `scripts/export-kobo-network-points.mjs` | Couche GeoJSON réseau contenant les raccordements |
| Points de pylônes | `scripts/export-kobo-network-points.mjs` | Couche GeoJSON réseau contenant les pylônes |

## Commandes types

```powershell
$batch = "<nom-du-batch>"

node scripts/match-kobo-reference-layers.mjs --batch $batch --kobo-points

node scripts/export-kobo-network-points.mjs --batch $batch
```

## Remarque

Le script `match-kobo-reference-layers.mjs` permet de générer la couche des centroïdes de bâtiments à partir de l’extraction Kobo normalisée.

Le script `export-kobo-network-points.mjs` permet d’exporter les points réseau extraits des soumissions normalisées, notamment les points de raccordement et les pylônes.
