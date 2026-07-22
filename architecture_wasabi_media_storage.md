# Architecture Wasabi pour le stockage multimédia G2M

## Décision principale

Wasabi est retenu comme stockage global des fichiers multimédias de G2M, et non comme un stockage limité aux images Kobo.

Le stockage cible couvre notamment :

- images terrain ;
- vidéos ;
- PDF ;
- documents attachés ;
- exports applicatifs ;
- pièces justificatives ;
- médias Kobo ;
- fichiers ajoutés manuellement depuis l’application.

Wasabi doit être considéré comme un stockage objet S3-compatible privé. L’application G2M reste responsable des droits d’accès, des métadonnées et des rattachements métier.

## Principes d’architecture

Les fichiers binaires ne doivent pas être stockés en base de données. La base conserve uniquement les métadonnées techniques, les informations de provenance et les liens vers les objets métier.

Le bucket Wasabi doit rester privé. Les fichiers ne doivent pas être exposés via des URL publiques permanentes.

L’application doit fournir des routes d’accès contrôlées, par exemple :

```text
GET /media/:id/view
GET /media/:id/download
GET /media/:id/thumbnail
```

Ces routes vérifient les permissions applicatives avant de générer une URL signée temporaire Wasabi ou, si nécessaire, de proxifier le fichier.

## Modèle de données recommandé

### Table `media_files`

Table centrale des fichiers stockés.

Champs proposés :

```text
id
bucket
object_key
original_filename
stored_filename
mime_type
media_type
size_bytes
checksum_sha256
storage_provider
source
visibility
created_by
created_at
updated_at
deleted_at
```

Valeurs attendues :

```text
storage_provider = wasabi
media_type = image | video | pdf | document | archive | other
source = kobo | manual_upload | generated_export | import
visibility = private | internal | public_candidate
```

### Table `media_links`

Table de rattachement entre un fichier et un objet métier.

Champs proposés :

```text
id
media_file_id
entity_type
entity_id
entity_ref
role
caption
sort_order
created_at
```

Exemples de valeurs :

```text
entity_type = site | building | pylone | raccordement | submission | mission | report
role = photo_site | photo_batiment | video_visite | rapport_pdf | piece_jointe | photo_kobo
```

Cette séparation permet à un même fichier d’être rattaché à plusieurs objets sans dupliquer le binaire dans Wasabi.

## Convention de clés Wasabi

La clé objet doit être stable, lisible et indépendante du seul nom d’origine.

Convention proposée :

```text
media/{environment}/{year}/{month}/{media_id}/original/{filename}
media/{environment}/{year}/{month}/{media_id}/thumb/{filename}
media/{environment}/{year}/{month}/{media_id}/preview/{filename}
```

Exemple :

```text
media/prod/2026/07/8f3c2a/original/photo_batiment.jpg
media/prod/2026/07/8f3c2a/thumb/photo_batiment.webp
```

Les informations métier comme le site, la soumission Kobo ou le bâtiment doivent être conservées dans `media_links` et les métadonnées, plutôt que d’être encodées uniquement dans la clé objet.

## Accès aux fichiers

Deux modes d’accès sont envisagés.

### URL signée temporaire

L’application vérifie les permissions, puis génère une URL Wasabi temporaire.

Usage recommandé :

- images ;
- vidéos ;
- PDF volumineux ;
- téléchargements directs.

Avantages :

- meilleure performance ;
- moins de charge sur le serveur applicatif ;
- compatible avec les gros fichiers.

### Proxy applicatif

L’application lit le fichier depuis Wasabi et renvoie le flux au navigateur.

Usage réservé :

- fichiers sensibles ;
- cas où l’URL Wasabi ne doit jamais être visible ;
- besoin de journalisation ou de contrôle fin du flux.

## Sécurité

Mesures retenues :

- bucket Wasabi privé ;
- clés Wasabi stockées en variables d’environnement ;
- aucune clé Wasabi en base, dans Git ou dans les vues ;
- politique IAM limitée au bucket applicatif ;
- validation stricte des extensions et types MIME ;
- limite de taille par type de fichier ;
- calcul d’un checksum SHA-256 ;
- URL signées courtes, typiquement 5 à 15 minutes ;
- suppression logique via `deleted_at` avant suppression physique éventuelle.

Variables d’environnement attendues :

```text
WASABI_ACCESS_KEY_ID
WASABI_SECRET_ACCESS_KEY
WASABI_REGION
WASABI_BUCKET
WASABI_ENDPOINT
```

## Intégration avec Kobo

Le dossier local actuel reste une zone tampon :

```text
data/kobo-assets/{asset_uid}/{submission_id}/{filename}
```

Flux cible :

1. téléchargement Kobo vers la zone tampon locale ;
2. calcul du checksum ;
3. détection du type MIME et du type média ;
4. upload vers Wasabi ;
5. création d’un enregistrement `media_files` ;
6. création d’un lien `media_links` vers la soumission Kobo ;
7. rattachement complémentaire au site, bâtiment, pylône ou raccordement lorsque l’identification est fiable ;
8. suppression optionnelle du fichier tampon local.

Règle de rattachement progressive :

- tout média Kobo est d’abord rattaché à la soumission ;
- le rattachement fin vers site, bâtiment, pylône ou raccordement est ajouté ensuite selon les champs disponibles et la fiabilité du mapping.

## Variantes et aperçus

Pour les images, il est recommandé de générer au moins :

- un original ;
- une miniature (`thumb`) ;
- éventuellement un aperçu intermédiaire (`preview`).

Pour les vidéos :

- conserver l’original ;
- générer ultérieurement une vignette vidéo si nécessaire.

Pour les PDF :

- conserver l’original ;
- ajouter plus tard un aperçu ou une première page image si l’usage le justifie.

## Phasage recommandé

### Phase 1 - Socle Wasabi

- Ajouter un service `wasabiStorageService.js`.
- Ajouter la configuration par variables d’environnement.
- Implémenter upload, URL signée, lecture des métadonnées et suppression.
- Ajouter les tables `media_files` et `media_links`.

### Phase 2 - Migration Kobo

- Uploader vers Wasabi les fichiers déjà présents dans `data/kobo-assets`.
- Alimenter `media_files` et `media_links`.
- Adapter l’onglet Photos de l’exploration Kobo pour lire depuis la base et Wasabi.

### Phase 3 - Rattachement métier

- Relier progressivement les médias aux sites, bâtiments, pylônes et raccordements.
- Ajouter les rôles de média utiles à l’interface.
- Ajouter des filtres et badges par type de média.

### Phase 4 - Miniatures et aperçus

- Générer les miniatures image à l’upload.
- Ajouter les aperçus PDF ou vidéo si nécessaire.
- Optimiser l’affichage galerie dans les pages site et Kobo.

## Décision de nommage

Les noms trop spécifiques sont à éviter pour le socle :

```text
kobo_assets
site_images
building_photos
```

Les noms génériques suivants sont retenus :

```text
media_files
media_links
media_variants
```

Cette approche permet de couvrir les besoins actuels Kobo tout en restant compatible avec les usages futurs de fichiers multimédias dans G2M.
