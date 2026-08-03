# Mode opératoire de test du stockage multimédia Wasabi en mode indirect

## Objectif

Valider le flux indirect de gestion des fichiers multimédia :

```text
KoboToolBox -> dépôt local -> Wasabi -> media_files / media_links -> affichage G2M
```

Le test doit confirmer que les images Kobo téléchargées localement peuvent être téléversées vers Wasabi, enregistrées en base, rattachées aux soumissions Kobo, puis consultées depuis G2M.

## Prérequis

1. Le bucket Wasabi doit exister et rester privé.
2. Les variables d’environnement suivantes doivent être renseignées :

```env
WASABI_ACCESS_KEY_ID=
WASABI_SECRET_ACCESS_KEY=
WASABI_REGION=
WASABI_BUCKET=
WASABI_ENDPOINT=
```

3. Les fichiers Kobo doivent déjà être présents dans le dépôt local, par exemple :

```text
data/kobo-assets/{asset_uid}/{submission_id}/{filename}
```

4. Les soumissions Kobo correspondantes doivent idéalement déjà être importées dans G2M, afin de permettre le rattachement enrichi vers les soumissions et les sites.

## Étape 1 - Vérifier le dépôt local

Depuis G2M :

1. Aller dans `Paramétrages -> KoboToolbox`.
2. Ouvrir l’onglet `Images`.
3. Utiliser le bloc de téléchargement Kobo si nécessaire pour rapatrier quelques images localement.
4. Vérifier que les fichiers sont bien présents dans :

```text
data/kobo-assets
```

Pour un premier test, utiliser un très petit lot : 2 à 5 images.

## Étape 2 - Lancer un audit sans téléversement

Dans l’onglet `Images`, utiliser le bloc :

```text
Téléversement du dépôt local vers Wasabi
```

Paramètres recommandés :

- `Formulaire Kobo` : renseigner l’UID du formulaire si le test cible un formulaire précis.
- `Soumission Kobo` : optionnel, à renseigner pour tester une seule soumission.
- `Dépôt local` : conserver le chemin proposé par défaut.
- Cocher `Auditer seulement, sans téléverser vers Wasabi`.
- Ne pas cocher la suppression des fichiers locaux.

Résultat attendu :

- les fichiers locaux sont détectés ;
- aucun fichier n’est envoyé vers Wasabi ;
- un manifeste est créé ;
- le nombre de fichiers détectés est cohérent avec le contenu du dépôt local.

## Étape 3 - Lancer un premier téléversement réel

Reprendre les mêmes paramètres, mais décocher :

```text
Auditer seulement, sans téléverser vers Wasabi
```

Ne pas cocher :

```text
Supprimer les fichiers locaux après téléversement réussi
```

Résultat attendu :

- les fichiers sont téléversés vers Wasabi ;
- les enregistrements `media_files` sont créés ;
- les liens `media_links` sont créés ;
- chaque média est au minimum lié à la soumission Kobo ;
- un lien secondaire vers le site est créé si la soumission existe en base et contient `modA/fiche_id` ou `modB/nom_officiel`.

## Étape 4 - Contrôler le manifeste

Dans l’onglet `Images`, consulter la section :

```text
Derniers téléversements locaux
```

Ouvrir le manifeste du lot.

Points à vérifier :

- `status` vaut `completed` ou `completed_with_errors`.
- `requested` correspond au nombre de fichiers détectés.
- `uploaded` correspond au nombre de fichiers réellement envoyés.
- `skipped` indique les fichiers ignorés, notamment les doublons.
- `errors` doit être vide pour un lot réussi.
- chaque fichier téléversé doit contenir un `media_file_id`.

## Étape 5 - Vérifier Wasabi

Dans la console Wasabi, vérifier que les objets ont été créés avec une clé de ce type :

```text
media/{environment}/{year}/{month}/{media_id}/original/{filename}
```

Le bucket doit rester privé. Les fichiers ne doivent pas être exposés via des URL publiques permanentes.

## Étape 6 - Vérifier l’accès dans G2M

Depuis G2M, tester les routes applicatives sur un `media_file_id` créé :

```text
/media/{id}/view
/media/{id}/download
/media/{id}/thumbnail
```

Résultat attendu :

- un utilisateur autorisé est redirigé vers une URL signée temporaire Wasabi ;
- un utilisateur non autorisé est refusé ;
- la route `thumbnail` fonctionne, ou retombe sur l’original si aucune miniature n’existe encore.

## Étape 7 - Vérifier l’affichage dans l’exploration Kobo

Aller dans :

```text
/cartographie/extractions-kobo
```

Dans l’onglet `Exploration`, sélectionner une soumission puis ouvrir le noeud :

```text
Photos
```

Résultat attendu :

- les photos locales encore présentes dans `data/kobo-assets` sont visibles ;
- les photos téléversées et enregistrées en base sont aussi visibles ;
- les médias Wasabi sont consultés via les routes applicatives `/media/...`.

## Précautions

- Ne pas activer la suppression locale lors des premiers tests.
- Commencer avec une seule soumission ou un lot de 2 à 5 images.
- Vérifier les manifestes avant d’élargir le périmètre.
- Ne jamais inscrire les clés Wasabi dans Git, dans les vues ou dans la base de données.
- Garder le bucket privé.

## Critères de validation

Le test est considéré concluant si :

- le `dry_run` détecte correctement les fichiers ;
- le téléversement réel crée les objets dans Wasabi ;
- les tables `media_files` et `media_links` sont alimentées ;
- le manifeste du lot est consultable ;
- les images sont visibles dans l’exploration Kobo ;
- les accès passent par les routes sécurisées G2M.
