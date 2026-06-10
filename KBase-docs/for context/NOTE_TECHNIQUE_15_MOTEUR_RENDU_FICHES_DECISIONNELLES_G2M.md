# Note Technique 15 - Moteur de rendu des fiches décisionnelles G2M

## 1. Objet

Cette note décrit une proposition pragmatique de première version du moteur de rendu des fiches et rapports générés à partir des données d'une soumission Kobo dans G2M.

L'objectif n'est pas de construire un moteur parfait dès le départ, mais de livrer une V1 simple, configurable, testable et améliorable progressivement.

## 2. Contexte

Dans G2M, les données collectées via KoboToolbox sont stockées sous forme de soumissions JSON brutes, dans le champ `raw_data_json`.

Ces données sont adaptées au stockage et à l'analyse, mais elles restent peu lisibles pour un décideur. La fiche décisionnelle doit donc transformer une soumission technique en document HTML clair, structuré et orienté décision.

Le principe retenu est de ne pas créer un système de mapping complet de type Form.io. G2M doit plutôt disposer d'un moteur de rendu générique piloté par des templates JSON.

## 3. Principe général

Les fiches décisionnelles doivent être générées côté backend à partir :

- d'une soumission stockée en base ;
- du `raw_data_json` Kobo ;
- d'un template JSON décrivant les champs à afficher ;
- d'un template HTML/EJS générique chargé de l'affichage.

Le moteur ne doit pas contenir de logique métier spécifique à un questionnaire. La logique de présentation doit être portée par des fichiers de configuration JSON.

## 4. Améliorations recommandées pour une V1

### 4.1. Séparer mapping et template de rendu

Le mapping de formulaire décrit les champs Kobo.

Le template de rendu doit seulement décrire :

- quoi afficher ;
- dans quel ordre ;
- avec quel libellé ;
- avec quel format ;
- avec quel fallback éventuel.

Cette séparation évite de dupliquer toute la structure XLSForm dans le moteur de rendu.

### 4.2. Limiter les blocs supportés en V1

Blocs recommandés pour démarrer :

- `header` ;
- `summary` ;
- `facts_grid` ;
- `sections` ;
- `repeat_table` ;
- `map_point`.

À reporter en V2 :

- génération PDF ;
- galerie média ;
- photos Wasabi ;
- géoshapes complexes ;
- accordéons ;
- renderers séparés avancés.

### 4.3. Supporter deux syntaxes de chemins

Le moteur doit lire les deux formes suivantes :

```text
modB/nom_officiel
modB.nom_officiel
```

Cela évite les champs vides liés aux différences entre Kobo, XLSForm et structures JSON internes.

### 4.4. Prévoir des fallbacks

Chaque champ du template devrait pouvoir définir :

- `path` ;
- `fallbackPath` ;
- `defaultValue` ;
- `format`.

Exemple fonctionnel : si `modB/region` est vide, utiliser `record.nom_region`.

### 4.5. Centraliser le formatage

Le formatage doit être fait dans un service unique, pas dans les vues EJS.

Formats V1 :

- valeur vide vers `-` ;
- `text` ;
- `date` ;
- `number` ;
- `yes_no` ;
- `choice` ;
- `choice_list`.

### 4.6. Ajouter un mode diagnostic

Le moteur doit pouvoir identifier les champs non résolus :

- chemin introuvable ;
- valeur absente ;
- fallback utilisé ;
- format inconnu.

Ce diagnostic facilitera la correction progressive des templates.

## 5. Structure cible des templates

Pour chaque questionnaire Kobo, G2M pourra disposer d'un ou plusieurs templates décisionnels.

Exemple :

```text
Questionnaire Kobo PADCI
  - Fiche décisionnelle
  - Fiche technique
  - Rapport PDF futur
  - Export métier futur
```

Pour la V1, le premier template proposé est :

```text
config/report-templates/padci_decision_sheet.json
```

Ce fichier décrira le rendu HTML attendu : titre, sous-titre, résumé, sections, champs, formats et fallbacks.

## 6. Plan de mise en œuvre

### 6.1. Créer le dossier de templates

Créer :

```text
config/report-templates/
```

Premier template :

```text
padci_decision_sheet.json
```

### 6.2. Créer le service moteur

Créer :

```text
services/submissionReportRenderer.js
```

Responsabilités :

- charger le template ;
- lire `raw_data_json` ;
- résoudre les chemins ;
- appliquer les formats ;
- appliquer les fallbacks ;
- produire un objet standardisé prêt pour la vue.

### 6.3. Adapter la fiche décisionnelle existante

La route actuelle :

```text
GET /soumissions/:id/detail
```

doit continuer à fonctionner, mais s'appuyer progressivement sur le nouveau moteur.

L'objectif est de limiter le risque en remplaçant d'abord la logique de préparation des données, sans changer brutalement toute l'interface.

### 6.4. Adapter le template EJS

Le template HTML doit consommer un objet standard :

```text
report.header
report.summary
report.sections
report.map
```

Le template EJS doit rester simple et ne pas porter de logique métier.

### 6.5. Ajouter les fallbacks vers les colonnes SQL

Le moteur doit pouvoir lire aussi les données enrichies déjà présentes dans l'enregistrement SQL :

- mission ;
- équipe ;
- agent ;
- région ;
- département ;
- sous-préfecture ;
- latitude ;
- longitude.

Cela permet d'afficher une fiche utile même lorsque certains champs Kobo sont absents ou mal structurés.

### 6.6. Ajouter des tests ciblés

Tests minimaux :

- titre rendu depuis `raw_data_json` ;
- fallback vers `record.nom_region` ;
- format `choice_list` ;
- champ manquant affiché `-` ;
- endpoint `/soumissions/:id/detail` toujours fonctionnel.

## 7. Périmètre exclu de la V1

Les éléments suivants doivent être reportés :

- génération PDF ;
- moteur de médias ;
- URL signées Wasabi ;
- rendu de polygones avancés ;
- édition visuelle des templates ;
- moteur complet type Form.io ;
- renderers JS séparés pour chaque bloc.

## 8. Conclusion

La V1 doit prioriser la lisibilité des fiches HTML et la correction des champs vides ou mal affichés.

Le moteur cible doit être :

- générique ;
- piloté par JSON ;
- compatible avec les soumissions Kobo actuelles ;
- simple à tester ;
- extensible sans réécriture majeure.

Cette approche permet d'obtenir rapidement une fiche décisionnelle fiable, tout en préparant les évolutions futures vers les médias, les rapports PDF et des rendus plus spécialisés.
