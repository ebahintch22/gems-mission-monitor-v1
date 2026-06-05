# Note Technique - Symbolisation cartographique des points collectés dans G2M

## 1. Objet de la note

Cette note présente les aspects clés à considérer pour faire évoluer la symbolisation cartographique des points collectés dans G2M. L'objectif est de dépasser l'approche actuelle, simple et statique, basée sur des cercles colorés prédéfinis, pour aller vers une symbolisation dynamique, paramétrable et adaptée aux besoins d'analyse des missions de collecte.

Le périmètre concerné est la carte Leaflet affichant les sites collectés, avec une attention particulière portée à la compatibilité avec les fonctionnalités déjà présentes : clustering, volet latéral, fiche d'identification, contrôles cartographiques, filtres et affichage responsive.

## 2. Situation actuelle

La symbolisation actuelle repose sur une représentation simple des points :

- un symbole de type cercle ;
- une taille fixe ou faiblement variable ;
- une couleur déterminée par des règles simples ;
- une logique essentiellement codée dans le JavaScript de la carte ;
- peu ou pas de contrôle utilisateur sur le rendu.

Cette approche est robuste pour un MVP, mais elle devient limitée dès que l'utilisateur veut comparer les sites selon un statut, une région, un superviseur, un niveau de complétude, une valeur quantitative ou une typologie métier issue des soumissions Kobo.

## 3. Objectifs fonctionnels recherchés

La nouvelle capacité de symbolisation devra permettre à l'utilisateur de choisir :

- le type de symbole : cercle Leaflet, marqueur raster, icône personnalisée, Leaflet ExtraMarkers ;
- le mode de symbolisation : symbole unique, catégories discrètes, valeurs continues ;
- le champ métier utilisé pour piloter le rendu ;
- les couleurs, tailles, icônes ou classes de valeurs ;
- éventuellement le comportement combiné avec le clustering.

Le système devra rester simple à utiliser. L'objectif n'est pas de transformer G2M en logiciel SIG complet dès le départ, mais de fournir une personnalisation utile, stable et progressive.

## 4. Aspects clés à considérer

### 4.1. Nature des données disponibles

La symbolisation dépendra directement des données extraites des soumissions Kobo et stockées dans la base G2M. Il faut donc distinguer :

- les champs discrets : statut de validation, région, superviseur, type de site, enquêteur, niveau de contrôle ;
- les champs continus : score, durée d'interview, nombre de ménages, altitude, indicateur de qualité ;
- les champs booléens : site contrôlé, doublon suspect, coordonnées valides ;
- les champs calculés par G2M : complétude, retard, anomalie, priorité de revue.

Avant de proposer un champ dans l'interface de symbolisation, G2M devra connaître son type fonctionnel : texte, nombre, date, booléen, catégorie ou indicateur calculé.

### 4.2. Typologie des rendus cartographiques

Les rendus possibles ne répondent pas aux mêmes usages :

| Type de rendu | Usage principal | Exemple G2M |
| --- | --- | --- |
| Symbole unique | Vue d'ensemble simple | tous les sites collectés en bleu |
| Catégories discrètes | Comparaison par statut ou groupe | validé, à vérifier, rejeté |
| Valeur continue | Analyse d'intensité | score qualité, durée, nombre d'anomalies |
| Icône métier | Lecture immédiate du type de site | école, centre de santé, ménage |
| Raster personnalisé | Respect d'une charte ou pictogramme spécifique | icône GEMS, icône partenaire |

Le choix du rendu doit être guidé par l'objectif d'analyse, pas seulement par l'esthétique.

### 4.3. Interaction avec le clustering

Le clustering doit rester compatible avec la symbolisation. Plusieurs stratégies sont possibles :

- cluster neutre : le cluster affiche uniquement le nombre de points ;
- cluster dominant : le cluster prend la couleur de la catégorie majoritaire ;
- cluster composite : le cluster affiche une mini-répartition par catégories ;
- cluster proportionnel : la taille ou la couleur du cluster varie selon un indicateur agrégé.

Pour une première version, il est recommandé de conserver un cluster neutre ou légèrement contextualisé, afin d'éviter une surcharge visuelle.

### 4.4. Paramétrage et persistance

Les choix de symbolisation peuvent être conservés à plusieurs niveaux :

- session navigateur, via `localStorage`, pour un réglage personnel rapide ;
- profil utilisateur, en base SQLite, pour retrouver les préférences après connexion ;
- configuration par mission, pour standardiser l'affichage d'une mission donnée ;
- configuration globale, réservée à un administrateur.

Dans une première étape, `localStorage` est suffisant. À moyen terme, la persistance en base devient préférable si plusieurs utilisateurs doivent partager des styles communs.

### 4.5. Ergonomie de l'interface

L'interface de paramétrage doit rester compacte. Elle pourrait être intégrée dans la toolbar latérale ou dans un panneau de configuration cartographique. Les contrôles attendus sont :

- choix du mode : unique, catégorie, continu ;
- choix du champ à utiliser ;
- choix du type de symbole ;
- palette de couleurs ;
- taille minimale et maximale ;
- aperçu du rendu ;
- bouton de réinitialisation.

Sur mobile, il faudra limiter l'édition complète de la symbologie. La consultation doit rester prioritaire, tandis que la configuration détaillée peut être réservée au desktop.

### 4.6. Performance

La carte peut contenir un volume croissant de points. Il faut éviter de recalculer inutilement les styles à chaque mouvement de carte. Les règles de style doivent être précompilées autant que possible :

- construire une fonction de style à partir de la configuration ;
- éviter les calculs lourds dans chaque callback Leaflet ;
- mettre en cache les icônes réutilisées ;
- ne recréer les marqueurs que si la configuration change.

Les marqueurs raster et ExtraMarkers peuvent être plus coûteux que des cercles vectoriels. Leur usage doit être mesuré si le volume de points augmente fortement.

### 4.7. Accessibilité et lisibilité

Les couleurs ne doivent pas être le seul support de signification. Il faut prévoir :

- des libellés dans la légende ;
- des contrastes suffisants ;
- des formes ou icônes différentes lorsque c'est utile ;
- des palettes compatibles avec les déficiences de perception des couleurs ;
- une cohérence entre symbole, popup, fiche site et légende.

### 4.8. Modèle de configuration

Un modèle JSON simple pourrait représenter la symbologie :

```json
{
  "mode": "category",
  "field": "status",
  "symbolType": "circle",
  "defaultStyle": {
    "color": "#1976d2",
    "fillColor": "#42a5f5",
    "radius": 7
  },
  "categories": {
    "validee": { "label": "Validée", "fillColor": "#2e7d32" },
    "a_verifier": { "label": "À vérifier", "fillColor": "#f9a825" },
    "rejetee": { "label": "Rejetée", "fillColor": "#c62828" }
  }
}
```

Ce modèle doit rester indépendant du rendu Leaflet. Une fonction d'adaptation transformera cette configuration en style Leaflet, en icône raster ou en ExtraMarker.

## 5. Variante 1 - Implémentation basique

### Principe

La variante basique ajoute un sélecteur de style simple dans l'interface cartographique. L'utilisateur peut choisir entre quelques styles prédéfinis :

- symbole unique bleu ;
- symbole par statut ;
- symbole par région ;
- symbole par superviseur ;
- icône standard au lieu de cercle.

Les règles sont codées côté JavaScript, avec une configuration minimale.

### Fonctionnalités

- choix du style depuis un menu ;
- couleurs prédéfinies ;
- légende mise à jour automatiquement ;
- persistance du choix dans `localStorage` ;
- compatibilité avec le clustering existant.

### Avantages

- rapide à mettre en place ;
- faible risque de régression ;
- peu de changements dans la base de données ;
- bon niveau de lisibilité pour les utilisateurs.

### Limites

- peu flexible ;
- ajout d'un nouveau champ nécessite une modification du code ;
- pas de vraie personnalisation des couleurs ou des classes ;
- peu adapté à des besoins d'analyse avancée.

### Effort estimatif

Faible. Cette variante est adaptée à une prochaine livraison intermédiaire.

## 6. Variante 2 - Implémentation standard

### Principe

La variante standard introduit un vrai modèle de configuration de symbologie. L'utilisateur choisit le mode de symbolisation, le champ métier et certains paramètres de rendu.

### Fonctionnalités

- symbole unique configurable ;
- symbolisation par catégorie discrète ;
- symbolisation par valeur continue avec classes automatiques ;
- choix entre cercle Leaflet et marqueur Leaflet ExtraMarkers ;
- génération dynamique de la légende ;
- sauvegarde en `localStorage` ou en base par utilisateur ;
- fonction unique `buildPointSymbolizer(config)` pour produire le rendu.

### Avantages

- architecture plus maintenable ;
- les nouveaux champs peuvent être exposés plus facilement ;
- bonne séparation entre données, configuration et rendu ;
- base solide pour les futures infographies cartographiques.

### Limites

- interface plus complexe ;
- besoin de typer les champs disponibles ;
- nécessite une logique de classification pour les valeurs continues ;
- demande plus de tests.

### Effort estimatif

Moyen. Cette variante est recommandée comme cible réaliste pour G2M, car elle apporte un bon équilibre entre valeur utilisateur et complexité technique.

## 7. Variante 3 - Implémentation avancée

### Principe

La variante avancée rapproche G2M d'un module SIG configurable. Les styles peuvent être créés, nommés, enregistrés et réutilisés par mission ou par utilisateur.

### Fonctionnalités

- bibliothèque de styles enregistrés ;
- configuration par mission ;
- palettes administrables ;
- icônes raster téléversables ou référencées ;
- gestion des valeurs manquantes ;
- règles de priorité entre plusieurs styles ;
- clusters colorés selon la catégorie dominante ;
- aperçu instantané avant application ;
- export/import JSON d'une symbologie.

### Avantages

- grande souplesse ;
- styles partageables entre utilisateurs ;
- meilleure cohérence pour les missions récurrentes ;
- extensible vers des besoins SIG plus professionnels.

### Limites

- conception plus lourde ;
- nécessité de créer des tables de configuration ;
- gestion des droits à prévoir ;
- risque d'interface trop complexe si elle n'est pas bien cadrée.

### Effort estimatif

Élevé. Cette variante convient après stabilisation du module KoboConnector et de la gestion utilisateur.

## 8. Variante 4 - Implémentation complète

### Principe

La variante complète transforme la symbolisation en véritable moteur cartographique. Elle permet de combiner plusieurs règles, d'utiliser des expressions, de gérer des styles multi-échelles et de produire une expérience proche d'un SIG web avancé.

### Fonctionnalités

- moteur de règles de style ;
- expressions conditionnelles sur plusieurs champs ;
- styles dépendants du niveau de zoom ;
- rendu combiné couleur, taille, forme et icône ;
- clusters agrégés avec visualisation proportionnelle ;
- légendes interactives filtrantes ;
- éditeur graphique de règles ;
- prévisualisation sur échantillon ;
- sauvegarde versionnée des styles ;
- partage de styles par rôle ou par organisation ;
- API interne pour exposer les configurations de symbologie.

### Avantages

- très forte capacité analytique ;
- adapté à des usages multi-missions et multi-acteurs ;
- base solide pour une plateforme SIG métier ;
- réutilisable pour d'autres couches que les sites collectés.

### Limites

- coût de développement important ;
- besoin d'une vraie spécification fonctionnelle ;
- tests plus nombreux ;
- risque de complexité pour les utilisateurs non spécialistes ;
- peut être surdimensionné pour un MVP.

### Effort estimatif

Très élevé. Cette variante doit être considérée comme une cible long terme, pas comme une priorité immédiate.

## 9. Comparaison synthétique

| Variante | Complexité | Valeur utilisateur | Persistance | Personnalisation | Recommandation |
| --- | --- | --- | --- | --- | --- |
| Basique | Faible | Moyenne | `localStorage` | Faible | bonne étape immédiate |
| Standard | Moyenne | Forte | `localStorage` puis base | Moyenne à forte | cible recommandée |
| Avancée | Élevée | Très forte | base SQLite | Forte | étape ultérieure |
| Complète | Très élevée | Maximale | base + versionnement | Très forte | vision long terme |

## 10. Recommandation pour G2M

La meilleure trajectoire pour G2M est progressive :

1. mettre en place une variante basique pour valider l'ergonomie ;
2. structurer rapidement un modèle JSON de configuration ;
3. évoluer vers la variante standard comme socle durable ;
4. réserver les fonctions avancées aux besoins confirmés après usage terrain.

La variante standard est la cible recommandée. Elle permet de répondre aux besoins concrets de supervision sans alourdir excessivement l'application.

## 11. Proposition de trajectoire de mise en œuvre

### Étape 1 - Préparer le socle technique

- isoler la logique de création des marqueurs ;
- créer un service JavaScript de symbolisation ;
- définir un format JSON de configuration ;
- identifier les champs disponibles dans les points collectés.

### Étape 2 - Ajouter les premiers modes

- symbole unique ;
- symbolisation par statut ;
- symbolisation par région ;
- mise à jour automatique de la légende.

### Étape 3 - Introduire l'interface de paramétrage

- panneau de configuration dans la toolbar cartographique ;
- choix du mode ;
- choix du champ ;
- choix du type de symbole ;
- bouton de réinitialisation.

### Étape 4 - Ajouter la persistance

- sauvegarde locale du style choisi ;
- restauration au chargement ;
- préparation d'une future sauvegarde en base par utilisateur ou par mission.

### Étape 5 - Étendre aux valeurs continues

- détection des champs numériques ;
- classes automatiques ;
- palettes progressives ;
- légende graduée.

## 12. Points de vigilance

- ne pas mélanger la logique de symbologie avec la logique de chargement des données ;
- éviter les styles trop nombreux qui nuisent à la lisibilité ;
- garantir un rendu correct lorsque des valeurs sont absentes ;
- conserver une légende synchronisée avec la carte ;
- tester le comportement avec et sans clustering ;
- préserver la fluidité sur mobile ;
- prévoir une valeur par défaut robuste.

## 13. Conclusion

La personnalisation de la symbolisation cartographique est une évolution importante pour G2M. Elle permettra de transformer la carte en véritable outil d'analyse opérationnelle, et pas seulement en outil de localisation.

La stratégie recommandée est de commencer par une implémentation basique mais structurée, puis de converger vers une variante standard fondée sur un modèle JSON de symbologie. Cette approche limite les risques, respecte l'état actuel du MVP et prépare une montée en puissance progressive vers des usages SIG plus avancés.
