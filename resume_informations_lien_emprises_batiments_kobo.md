# Informations clés disponibles sur le lien entre emprises de bâtiments et soumissions KoboToolBox

Date de synthèse : 2026-07-20

## Objet de la réflexion

La question méthodologique porte sur la manière d'établir un lien fiable entre :

- les emprises de bâtiments disponibles sous forme de couches GeoJSON de référence, par exemple `emprises_batiments.geojson` ;
- les données de sites et de bâtiments extraites des soumissions KoboToolBox PADCI/G2M ;
- les informations attributaires portées par les soumissions Kobo : site, bâtiment, géométrie, statut, vocation, équipements, raccordement, pylônes et photos.

Le dépôt contient déjà un prototype opérationnel d'extraction, d'appariement spatial et de visualisation. La réflexion à venir doit donc partir de cet existant plutôt que d'une page blanche.

## Données Kobo déjà normalisées

Les soumissions Kobo sont transformées en une structure normalisée par le moteur `services/koboGeometryExtractor.js`.

Chaque soumission extraite contient notamment :

- `source_submission_id` : identifiant stable de la soumission Kobo ;
- `kobo_id` : identifiant numérique Kobo quand disponible ;
- `form_version` et `strategy_id` : version du formulaire et stratégie d'extraction utilisée ;
- `site_description` : description du site, dont nom officiel, localité, région et date de soumission selon les champs disponibles ;
- `site_geometry` : géométrie du site, souvent issue de l'emprise de site Kobo ;
- `building_geometries` : liste des bâtiments déclarés dans le repeat `batiment` ;
- `raccordement_geometry` : point ou géométrie de raccordement si disponible ;
- `pylone_geometries` : pylônes extraits ;
- `geometry_quality_report` : statut, warnings, erreurs et sources retenues.

Les géométries sont converties en GeoJSON `[longitude, latitude]`. Les bâtiments Kobo disposent d'un `centroid_point` quand une emprise ou un point exploitable a pu être calculé.

## Champs bâtiment Kobo utiles

Le repeat `batiment` est central. Les champs déjà exploités incluent :

- numéro du bâtiment : `batiment.num_bat` ;
- nom ou fonction : `batiment.bat_nom` ;
- statut : `batiment.bat_statut` ;
- vocation : `batiment.bat_vocation` ;
- services : `batiment.bat_services` ;
- contour bâtiment : `batiment.coins_bat` ;
- contour manuel : `batiment.coins_bat_manuel` ;
- LAN, câblage, goulottes, Wi-Fi prévu, baie, équipements actifs et détails techniques.

Le formulaire prévoit aussi des contrôles métier : nombre de bâtiments déclarés, nombre de bâtiments relevés, contrainte d'un seul bâtiment principal, et avertissement si le nombre relevé diffère du nombre déclaré.

## Couches de référence disponibles

Les lots d'extraction Kobo peuvent contenir des couches de référence dans :

```txt
KBase-docs/kobo-geometry-extractions/batches/{batch}/05_reference_layers/sources/
```

Les deux couches attendues par le prototype sont :

- `contours_sites.geojson` : contours de sites de référence ;
- `emprises_batiments.geojson` : emprises de bâtiments de référence.

Le dernier lot documenté avec appariement complet est :

```txt
KBase-docs/kobo-geometry-extractions/batches/2026-07-04_sample-90/
```

Il contient notamment :

- `06_matching/site_matching.json` ;
- `06_matching/building_matching.json` ;
- `06_matching/matching_review.geojson` ;
- `06_matching/centroid_batiment.geojson` ;
- `06_matching/emprises_batiment_normalized.geojson` ;
- `06_matching/matching_report.md`.

## Moteur d'appariement existant

Le moteur principal est `services/koboReferenceMatcher.js`.

Il propose deux logiques complémentaires :

1. Appariement site vers contour de référence.
2. Appariement bâtiment vers emprise de référence.

### Appariement des sites

Le site Kobo est comparé aux contours de référence. Le score est fondé sur :

- la présence d'un point Kobo dans un contour de site, quand la géométrie site est un point ;
- le recouvrement approximatif entre polygone Kobo et polygone de référence, quand les géométries sont surfaciques ;
- un score combinant recouvrement du site Kobo et couverture du contour de référence.

Les seuils actuels sont :

- score haut site : `0.6` ;
- score minimal site : `0.25` ;
- écart minimal anti-ambiguïté : `0.15` ;
- échantillonnage : grille `36 x 36`.

Statuts produits :

- `matched` : candidat retenu automatiquement ;
- `review` : candidat possible mais score insuffisant pour validation automatique ;
- `ambiguous` : plusieurs candidats proches ;
- `unmatched` : aucun candidat satisfaisant.

### Appariement des bâtiments

Le prototype compare les centroïdes de bâtiments Kobo aux emprises bâtiment de référence rattachées au site.

Deux familles de sorties existent :

- une classification de diagnostic `A/B/C/D/E/F` dans `building_matching.json` ;
- un statut opérationnel `direct / conflit / proximity / none` dans `emprises_batiment_normalized.geojson`.

Classification de diagnostic :

- `A` : le centroïde Kobo tombe dans une seule emprise bâtiment ;
- `B` : conflit, plusieurs centroïdes Kobo tombent dans la même emprise ;
- `C` : centroïde Kobo non contenu dans une emprise bâtiment ;
- `D` : emprise de référence sans centroïde Kobo associé ;
- `E` : centroïde contenu dans plusieurs emprises superposées ;
- `F` : centroïde hors du contour de site de référence retenu.

Statuts opérationnels des emprises normalisées :

- `direct` : une seule correspondance spatiale contenue, score de fiabilité `3` ;
- `conflit` : plusieurs centroïdes dans la même emprise, score `2` ;
- `proximity` : aucun centroïde contenu, mais centroïde proche dans la tolérance, score `1` ;
- `none` : aucun lien exploitable, score `-1`.

La tolérance de proximité par défaut est de `50 m`.

## Résultats observés sur le lot 2026-07-04_sample-90

Sur le lot `2026-07-04_sample-90`, les résultats déjà disponibles montrent que l'appariement automatique est utile mais très incomplet.

Appariement sites :

- `matched` : 46 ;
- `review` : 8 ;
- `ambiguous` : 1 ;
- `unmatched` : 35.

Diagnostic bâtiments :

- classe `A` : 206 ;
- classe `B` : 110 ;
- classe `C` : 705 ;
- classe `D` : 552 ;
- classe `E` : 0 ;
- classe `F` : 47.

Emprises normalisées :

- `direct` : 283 ;
- `conflit` : 17 ;
- `proximity` : 635 ;
- `none` : 1312.

Couche `centroid_batiment.geojson` :

- 1055 centroïdes bâtiment exportés.

Ces chiffres indiquent que la méthode spatiale seule produit des liens exploitables, mais laisse un volume important de cas non résolus ou seulement approximatifs.

## Visualisation et revue déjà disponibles

La page :

```txt
/cartographie/extractions-kobo
```

permet déjà de consulter les extractions Kobo dans une interface dédiée.

Fonctions disponibles :

- tableau des soumissions ;
- carte Leaflet avec site, bâtiments, centroïdes, raccordement et pylônes ;
- onglet `Exploration` avec arbre de soumission ;
- consultation du JSON normalisé ;
- chargement de `matching_review.geojson` ;
- chargement de `emprises_batiment_normalized.geojson` ;
- zoom et surbrillance d'un bâtiment, pylône ou raccordement sélectionné ;
- affichage préparatoire des photos locales Kobo si elles sont présentes dans `data/kobo-assets`.

Cette interface est importante pour la méthodologie, car les résultats d'appariement doivent rester vérifiables visuellement.

## Import des emprises de bâtiments

Un autre chantier existe autour de l'import d'emprises depuis OpenStreetMap.

L'import OSM :

- part d'une zone dessinée sur la carte ;
- limite la zone à 5 km² ;
- interroge Overpass ;
- convertit `way["building"]` et `relation["building"]` en GeoJSON ;
- enregistre les bâtiments dans `building_features` ;
- utilise un upsert sur `mission_id + site_code + building_code` ;
- affecte le statut initial `prepare`.

Cette brique peut alimenter ou compléter les emprises de référence utilisées dans l'appariement Kobo.

## Médias et photos

Les photos Kobo sont actuellement considérées comme un complément de validation, pas comme une source principale d'appariement.

État disponible :

- les fichiers locaux peuvent être organisés sous `data/kobo-assets/{asset_uid}/{submission_id}/{filename}` ;
- l'exploration Kobo peut afficher des vignettes si le rattachement par identifiant de soumission fonctionne ;
- une architecture Wasabi prévoit de rattacher les médias d'abord à la soumission Kobo, puis ensuite au site, bâtiment, pylône ou raccordement quand le mapping est fiable.

Pour la méthode d'appariement, les photos peuvent donc servir à arbitrer certains cas `B`, `C`, `D`, `F` ou `proximity`, mais elles ne remplacent pas encore le lien spatial et attributaire.

## Limites connues

Les limites du prototype sont clairement identifiées :

- le recouvrement des sites est estimé par échantillonnage régulier, pas par intersection polygonale exacte ;
- les calculs de surface utilisent une projection locale approximative ;
- la projection métrique est suffisante pour un diagnostic, mais pas pour une mesure topographique ou cadastrale ;
- les appariements automatiques doivent rester réversibles ;
- les cas ambigus nécessitent une validation humaine ;
- les données Kobo brutes ne sont pas encore pleinement exploitées par rubrique dans l'interface ;
- la résolution des libellés Kobo via les listes de choix XLSForm reste partielle ;
- les photos ne sont pas encore intégrées comme preuve systématique d'appariement.

## Enseignements méthodologiques provisoires

Les informations disponibles suggèrent une approche progressive en trois niveaux.

Niveau 1 : lien spatial automatique.

- Utiliser le contour de site pour restreindre les candidats.
- Utiliser le centroïde bâtiment Kobo dans l'emprise de référence.
- Affecter un statut clair : `direct`, `conflit`, `proximity`, `none`.

Niveau 2 : enrichissement attributaire.

- Comparer les numéros de bâtiment, noms, vocations et statuts.
- Exploiter les listes de choix Kobo pour obtenir des libellés lisibles.
- Utiliser le nombre de bâtiments déclarés et relevés comme contrôle de cohérence.

Niveau 3 : validation assistée.

- Présenter les cas non sûrs dans l'interface de revue.
- Prioriser les classes `B`, `C`, `D`, `F`, `proximity` et `none`.
- Appuyer la décision sur la carte, les attributs, les photos et le JSON brut si nécessaire.
- Conserver l'historique et éviter tout écrasement irréversible.

## Sources locales utilisées

- `services/koboGeometryExtractor.js`
- `services/koboReferenceMatcher.js`
- `services/koboGeometryReviewService.js`
- `views/sig/kobo-geometries-review.ejs`
- `public/js/kobo-geometries-review.js`
- `tests/koboReferenceMatcher.test.js`
- `KBase-docs/kobo-data-analysis/extraction_scripts/README_EXTRACTEUR_GEOMETRIES_KOBO.md`
- `KBase-docs/EXPLICATION_LIMITES_PROTOTYPE_APPARIEMENT.md`
- `KBase-docs/kobo-geometry-extractions/batches/2026-07-04_sample-90/06_matching/`
- `resume_import_osm_emprises_batiments.md`
- `architecture_wasabi_media_storage.md`
