# Point de restauration - 2026-07-22 15:10:58

Ce dossier constitue un point de restauration local de l'état courant du travail sur l'application GEMS Mission Monitor.

## Contenu

- `HEAD.txt` : commit Git de référence au moment de la sauvegarde.
- `git-status-short.txt` : état court du dépôt au moment de la sauvegarde.
- `file-list.txt` : liste des fichiers modifiés ou non suivis détectés.
- `working-tree.diff` : diff du working tree, hors fichiers SQLite.
- `files/` : copie des fichiers modifiés ou non suivis présents sur disque.

## Résumé du travail couvert

Ce point de restauration couvre les évolutions récentes liées à l'interface cartographique des sites visités, à la table Tabulator, au filtrage, à la résolution des valeurs administratives codées, à l'affichage expérimental des étiquettes cartographiques avec gestion des collisions, à la recherche en texte intégral et à l'exploration des soumissions Kobo.

## Validation connue

Dernière validation rapportée :

`npm.cmd test -- tests/app.test.js`

Résultat : 85 tests passés.

## Remarque

Ce point de restauration est local au dépôt. Il ne remplace pas un commit Git, mais permet de retrouver rapidement les fichiers et l'état de travail associés à cette étape.
