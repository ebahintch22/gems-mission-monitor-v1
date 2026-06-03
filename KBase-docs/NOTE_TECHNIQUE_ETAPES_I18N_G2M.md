# Note technique - Étapes de mise en œuvre de l'i18n dans G2M

## 1. Objectif

Cette note présente le mini-plan de progression recommandé pour généraliser progressivement l'i18n dans l'application G2M. L'objectif est de sortir les textes visibles du code et de les centraliser dans les fichiers de ressources `locales/fr.json` et `locales/en.json`.

## 2. Socle déjà mis en place

La première tranche i18n est déjà opérationnelle :

- dossier `locales/` créé ;
- fichier `locales/fr.json` utilisé comme langue principale ;
- fichier `locales/en.json` ajouté comme seconde langue ;
- middleware i18n branché dans Express ;
- fonction `t()` exposée aux vues EJS ;
- fallback automatique vers le français ;
- bandeau supérieur et menu principal convertis ;
- écran d'administration KoboToolbox converti.

La langue peut être testée avec un paramètre d'URL :

```text
/parametrages/kobo?lang=en
```

## 3. Ordre recommandé des écrans à traiter

L'ordre de traitement doit rester progressif afin de réduire les risques de régression.

### 1. Dashboard

Le Dashboard est prioritaire car c'est l'écran d'accueil de l'application. Il contient les titres, indicateurs, libellés de statistiques et blocs de synthèse. Sa migration permet de stabiliser rapidement les clés communes liées au pilotage général.

### 2. Cartographie SIG

La cartographie est un écran central de G2M. Elle doit être traitée progressivement, car elle contient à la fois des textes EJS et des textes JavaScript.

Éléments à migrer :

- filtres ;
- boutons de contrôle ;
- légende ;
- fiche d'identification site ;
- messages et libellés présents dans `cartographie.js`.

### 3. Missions

L'écran Missions est structurant, notamment pour l'association entre mission G2M et formulaire KoboToolbox.

Éléments à migrer :

- liste des missions ;
- formulaire de création ;
- fiche détail mission ;
- statuts métier ;
- messages d'erreur.

### 4. Équipes

Les écrans Équipes doivent être traités après Missions, car ils dépendent des missions et partagent plusieurs notions métier.

Éléments à migrer :

- liste des équipes ;
- formulaire équipe ;
- détail équipe ;
- statuts ;
- affectations aux missions et zones.

### 5. Agents

Les écrans Agents viennent ensuite. Ils contiennent principalement des libellés de formulaire, des statuts et des messages de validation.

Éléments à migrer :

- liste des agents ;
- formulaire agent ;
- détail agent ;
- statuts ;
- messages d'erreur.

### 6. Utilisateurs

Les écrans Utilisateurs contiennent de nombreux champs et rôles applicatifs. Leur migration doit intervenir après les écrans métier principaux.

Éléments à migrer :

- liste des utilisateurs ;
- formulaire utilisateur ;
- détail utilisateur ;
- rôles ;
- statuts ;
- messages de validation.

### 7. Pages d'erreur

Les pages d'erreur peuvent être traitées en dernier.

Éléments à migrer :

- page 404 ;
- page 500 ;
- messages génériques d'erreur.

## 4. Séquence de travail recommandée

Pour chaque écran, appliquer la même méthode :

1. Identifier les textes visibles dans les vues EJS.
2. Identifier les textes visibles dans les fichiers JavaScript associés.
3. Ajouter les clés correspondantes dans `locales/fr.json`.
4. Ajouter les traductions anglaises dans `locales/en.json`.
5. Remplacer les textes fixes dans les vues par `t("cle.i18n")`.
6. Adapter les contrôleurs si certains messages de succès ou d'erreur sont générés côté serveur.
7. Traiter les textes JavaScript en second temps, avec une stratégie adaptée.
8. Mettre à jour les tests.
9. Vérifier l'écran en français.
10. Vérifier l'écran en anglais avec `?lang=en`.

## 5. Ordre synthétique

L'ordre global recommandé est :

```text
Dashboard -> Cartographie SIG -> Missions -> Équipes -> Agents -> Utilisateurs -> Erreurs
```

## 6. Points de vigilance

Il faut éviter de migrer toute l'application en une seule fois. Une migration progressive limite les risques et permet de stabiliser les conventions de clés.

Les nouveaux écrans ou nouvelles fonctionnalités doivent utiliser directement les clés i18n afin d'éviter d'ajouter de nouveaux textes codés en dur.

Les textes métier récurrents, comme les statuts, les boutons et les messages de validation, doivent être factorisés avec des clés communes lorsque c'est pertinent.

## 7. Conclusion

La mise en œuvre de l'i18n dans G2M doit se poursuivre écran par écran. La priorité est de consolider les écrans les plus visibles et les plus utilisés, puis de traiter progressivement les écrans de gestion et les pages d'erreur.

Cette stratégie permet d'obtenir une application progressivement multilingue tout en conservant un développement maîtrisé.
