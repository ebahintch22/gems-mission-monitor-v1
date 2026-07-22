# Présentation orale brève de l'application GEMS Mission Monitor

## Objectif de la présentation

Présenter en 5 minutes l'intérêt opérationnel de l'application, son état actuel et la valeur ajoutée pour le suivi du projet PADCI, sans entrer dans les détails techniques.

## Message d'ouverture

L'application GEMS Mission Monitor est un outil de suivi, de contrôle et de valorisation des données collectées sur le terrain. Elle vise à transformer les soumissions KoboToolBox en informations exploitables pour le pilotage du projet, en particulier sur la localisation des sites visités, la qualité des données, les infrastructures observées et les pièces justificatives associées.

L'enjeu principal est de disposer d'une interface unique permettant de consulter, vérifier et comparer les données terrain, tout en gardant le lien avec les formulaires Kobo d'origine.

## 1. Ce que l'application permet déjà de faire

Aujourd'hui, l'application permet de visualiser les sites visités sur une carte interactive, avec une table de consultation associée. L'utilisateur peut filtrer les soumissions, rechercher un site, zoomer sur sa localisation et consulter les informations principales collectées.

La table des sites affichés est paramétrée pour faciliter la lecture : les colonnes importantes restent toujours visibles, les autres peuvent être affichées ou masquées selon le besoin. Les valeurs codées issues de Kobo, comme les régions, départements, sous-préfectures ou ministères, sont progressivement traduites en libellés lisibles.

L'application intègre aussi une logique d'exploration des soumissions Kobo. Pour une soumission donnée, on peut parcourir les informations par rubrique : site, pylônes, bâtiments, raccordement, photos et JSON normalisé.

## 2. Valeur ajoutée pour le pilotage du projet

La première valeur ajoutée est la lisibilité. Les données Kobo sont riches mais parfois difficiles à exploiter directement, car elles sont structurées pour la collecte. L'application les réorganise pour la consultation, le contrôle et la prise de décision.

La deuxième valeur ajoutée est la vérification spatiale. La carte permet de voir rapidement où se trouvent les sites visités, d'identifier les doublons possibles, les erreurs de localisation ou les incohérences entre les informations déclarées et la position géographique.

La troisième valeur ajoutée est la traçabilité. On conserve l'accès au JSON normalisé et aux informations d'origine, ce qui permet de revenir à la source de la donnée en cas de doute.

## 3. Améliorations récentes importantes

Plusieurs améliorations ont été apportées récemment à l'interface cartographique.

La section principale a été renommée « Sites visités » pour mieux correspondre au besoin métier. Le filtrage est maintenant masqué par défaut afin de donner plus de place à la table de consultation. L'utilisateur peut ouvrir le panneau de filtrage uniquement lorsqu'il en a besoin.

La table des sites est plus confortable : elle occupe une zone fixe, permet le défilement des lignes et met en surbrillance le site sélectionné. Le titre de la section indique directement le nombre de sites affichés.

Un affichage expérimental d'étiquettes sur la carte a aussi été ajouté. Ces étiquettes reprennent le nom du site, avec un style lisible sur fond cartographique. Un mécanisme de gestion des collisions évite que plusieurs étiquettes se superposent, avec priorité donnée au site couramment sélectionné.

## 4. Point méthodologique en cours

Un sujet important reste en cours d'analyse : établir un lien fiable entre les emprises de bâtiments et les données de sites extraites des soumissions Kobo.

L'approche doit être prudente, car il ne s'agit pas seulement d'afficher des objets sur une carte. Il faut pouvoir justifier les rapprochements entre un site, ses bâtiments, ses pylônes, son raccordement et les données administratives associées.

La démarche recommandée consiste à combiner plusieurs critères : proximité géographique, identifiants issus des soumissions, cohérence administrative, libellés de site et contrôle visuel. L'objectif est d'éviter les associations automatiques fragiles et de privilégier un processus contrôlable.

## 5. Limites actuelles à signaler clairement

L'application est déjà utilisable pour la consultation et le contrôle, mais certaines fonctions restent en consolidation.

Les photos téléchargées localement ne sont pas encore pleinement raccordées à l'interface. Le JSON Kobo brut complet n'est pas encore exploité rubrique par rubrique. La résolution des libellés est en cours d'enrichissement, notamment avec les listes de choix administratives.

Ces limites sont identifiées et ne bloquent pas la démonstration de la valeur principale : centraliser, visualiser et contrôler les données terrain.

## 6. Conclusion orale proposée

En résumé, GEMS Mission Monitor permet de passer d'une base de soumissions Kobo à un outil de lecture opérationnelle des données terrain. L'application donne une vision cartographique des sites visités, facilite le filtrage et la vérification des informations, et prépare les prochaines étapes de contrôle spatial plus avancé, notamment le lien entre les sites et les emprises de bâtiments.

L'objectif n'est pas de remplacer Kobo, mais de prolonger Kobo par une interface de contrôle, d'analyse et de pilotage adaptée aux besoins du projet.

## Trame minutée conseillée

- 0:00 - 0:30 : présenter l'objectif général de l'application.
- 0:30 - 1:30 : montrer la carte et la table des sites visités.
- 1:30 - 2:30 : expliquer le filtrage, la recherche et la consultation des informations.
- 2:30 - 3:30 : présenter l'exploration des soumissions Kobo et le JSON normalisé.
- 3:30 - 4:30 : expliquer la valeur pour le contrôle qualité et la vérification spatiale.
- 4:30 - 5:00 : conclure sur les prochaines étapes, notamment le rattachement des bâtiments, photos et données brutes.

## Formulations courtes à réutiliser

- « L'application transforme les données collectées dans Kobo en information directement exploitable pour le suivi du projet. »
- « La carte permet de vérifier rapidement la cohérence spatiale des soumissions. »
- « La table donne une lecture synthétique des sites affichés, avec des colonnes adaptables selon le besoin. »
- « L'exploration Kobo permet de revenir au détail de la soumission sans perdre le lien avec la donnée source. »
- « La prochaine étape importante est de fiabiliser le lien entre les sites visités, les bâtiments observés et les emprises géographiques disponibles. »
