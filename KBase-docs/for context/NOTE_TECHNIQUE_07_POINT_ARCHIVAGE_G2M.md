# Note technique - Point d'archivage et de restauration G2M

Cette note explique les commandes Git utiles pour créer un point d'archivage du travail réalisé sur l'application G2M, puis le restaurer si nécessaire.

## `git status`

Cette commande affiche l'état courant du dépôt Git. Elle indique les fichiers modifiés, ajoutés, supprimés ou non suivis. Concrètement, elle permet de savoir ce qui va potentiellement entrer dans le prochain commit. Son importance est forte : avant tout archivage, il faut vérifier que les changements listés correspondent bien au travail à conserver, et qu'aucun fichier sensible ou temporaire n'est prêt à être versionné.

## `git diff --stat`

Cette commande donne un résumé synthétique des changements : fichiers touchés, nombre de lignes ajoutées et supprimées. Elle ne montre pas tout le contenu modifié, mais donne une vue rapide du volume et du périmètre du travail. Elle est importante pour contrôler que le point d'archivage reste cohérent et ne mélange pas des modifications inattendues ou hors sujet.

## `npm test`

Cette commande exécute la suite de tests de l'application Node.js. Elle vérifie que les fonctionnalités existantes restent valides après les modifications. Concrètement, elle permet de détecter les régressions avant de figer un état du projet. Son importance est essentielle : un point d'archivage doit correspondre à un état stable, restaurable et raisonnablement fiable.

## `git add .`

Cette commande prépare tous les fichiers modifiés ou nouveaux pour le prochain commit. Elle place les changements dans la zone d'index Git. Concrètement, elle dit à Git : "ces fichiers font partie du point d'archivage". Elle est importante parce qu'un commit ne contient que les fichiers ajoutés à l'index. Il faut donc l'utiliser après avoir vérifié le contenu avec `git status`.git push

## `git commit -m "Point archivage G2M - interface SIG, Kobo et documentation"`

Cette commande crée un enregistrement permanent de l'état du projet dans l'historique Git. Le message décrit le contenu du point d'archivage. Concrètement, Git capture les fichiers préparés avec `git add` et leur attribue un identifiant unique. Son importance est centrale : c'est le véritable point de restauration local.

## `git tag -a g2m-archive-2026-06-02 -m "Point de restauration G2M au 02 juin 2026"`

Cette commande ajoute une étiquette nommée sur le commit courant. Le tag rend le point d'archivage facile à retrouver sans devoir rechercher un identifiant technique de commit. Concrètement, il donne un nom lisible à une version stable. Son importance est pratique : il facilite les restaurations futures et sert de repère clair dans l'historique du projet.

## `git push`

Cette commande envoie les commits locaux vers le dépôt GitHub distant. Concrètement, elle sauvegarde le point d'archivage hors de la machine locale. Elle est importante car un commit uniquement local reste vulnérable à une perte de poste ou de dossier. Après `git push`, GitHub devient une copie distante du travail archivé.

## `git push origin g2m-archive-2026-06-02`

Cette commande envoie le tag d'archivage vers GitHub. Le commit et le tag sont deux objets distincts : pousser le commit ne suffit pas toujours à pousser le tag. Concrètement, cette commande rend le repère `g2m-archive-2026-06-02` disponible sur le dépôt distant. Elle est importante pour que le point de restauration soit identifiable aussi depuis GitHub.

## `git checkout g2m-archive-2026-06-02`

Cette commande permet de revenir à l'état exact associé au tag d'archivage. Concrètement, elle replace le projet dans la version enregistrée à cette date. Elle est utile pour consulter ou tester un ancien état. Attention : ce mode peut placer Git en état "detached HEAD". Pour reprendre le développement, il vaut mieux créer une branche.

## `git checkout -b reprise-g2m g2m-archive-2026-06-02`

Cette commande crée une nouvelle branche à partir du point d'archivage. Concrètement, elle permet de repartir de l'état sauvegardé tout en pouvant modifier le code normalement. Elle est importante lorsqu'on veut restaurer un état stable et poursuivre le travail à partir de celui-ci, sans perturber la branche principale.
