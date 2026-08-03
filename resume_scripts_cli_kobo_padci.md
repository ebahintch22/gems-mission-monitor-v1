# Résumé des scripts CLI Kobo / PADCI-G2M

| Script CLI | Rôle opérationnel | Entrées principales | Sorties / usage |
|---|---|---|---|
| `g2m-create-batch.mjs` | Crée l’arborescence standard d’un lot d’analyse Kobo. | Nom de batch. | Dossiers `00_source`, `01_strategy`, `02_output`, `03_review`, `04_reports`, `05_reference_layers`, `06_matching`. |
| `extract-kobo-geometries.mjs` | Analyse les soumissions Kobo brutes et extrait les géométries utiles : site, bâtiments, pylônes, raccordement. | Fichier JSON Kobo et stratégie d’extraction. | JSON normalisé des géométries par soumission. |
| `generate-kobo-geometries-review-offline.mjs` | Génère une revue consultable hors ligne des extractions géométriques. | Batch ou fichier d’extraction normalisée. | Page HTML de contrôle et de revue. |
| `export-kobo-site-center-points.mjs` | Extrait les points centraux des sites à partir des soumissions Kobo. | Batch, source Kobo ou extraction normalisée. | GeoJSON de points sites. |
| `export-kobo-network-points.mjs` | Extrait les points réseau, notamment pylônes et raccordements, depuis les données Kobo. | Batch, extraction normalisée, source Kobo optionnelle. | GeoJSON de points réseau. |
| `match-kobo-reference-layers.mjs` | Compare les géométries Kobo avec des couches de référence, notamment les emprises bâtimentaires. | Extraction Kobo, couches de référence, points Kobo optionnels. | Fichiers d’appariement dans `06_matching`. |
| `gps-quality-report.mjs` | Analyse la qualité GPS des données Kobo ou assimilées. | Données de soumissions ou géométries. | Rapport qualité GPS exploitable pour le contrôle. |
| `generate-gps-report-html.mjs` | Produit un rapport HTML de diagnostic GPS. | Résultats d’analyse GPS. | Rapport HTML consultable. |
| `generate-gps-report-with-maps-docx.mjs` | Produit un rapport Word enrichi avec cartes. | Données GPS analysées. | Rapport `.docx` avec cartes. |
| `generate-building-verification-sheet.mjs` | Génère une fiche de vérification terrain des bâtiments. | Emprises ou bâtiments extraits/préparés. | Fiche de contrôle bâtimentaire. |
| `sync-kobo.js` | Synchronise les soumissions Kobo vers la base applicative. | UID formulaire, mission, limite, date de reprise. | Insertion ou simulation en base G2M. |

Ces scripts structurent la chaîne de traitement suivante : constitution d’un batch, extraction normalisée, production de couches GeoJSON, contrôle qualité, appariement avec les référentiels, puis génération de rapports ou de fiches de vérification.
