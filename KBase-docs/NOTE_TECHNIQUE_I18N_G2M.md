# Note technique - Mise en place de ressources multilingues dans G2M

## 1. Objectif

L'objectif est de centraliser tous les libellés, messages, titres, boutons, étiquettes et textes visibles de l'interface G2M dans des fichiers de ressources multilingues. Cette approche évite de conserver les textes directement dans les vues EJS, les contrôleurs ou les scripts JavaScript.

Elle permet ensuite d'afficher l'application en plusieurs langues, par exemple en français et en anglais, sans réécrire les écrans.

## 2. Principe général de l'i18n

L'i18n, ou internationalisation, consiste à remplacer les textes fixes par des clés de traduction.

Au lieu d'écrire directement dans une vue :

```ejs
<h1>Administration KoboToolbox</h1>
```

on écrit :

```ejs
<h1><%= t("kobo.admin.title") %></h1>
```

La fonction `t()` cherche ensuite la valeur correspondante dans le fichier de langue actif.

Exemple de fichier français :

```json
{
  "kobo.admin.title": "Administration KoboToolbox"
}
```

Exemple de fichier anglais :

```json
{
  "kobo.admin.title": "KoboToolbox Administration"
}
```

## 3. Organisation recommandée des fichiers

Une organisation simple pour G2M serait :

```text
locales/
  fr.json
  en.json
```

Le fichier `fr.json` contiendrait les libellés français. Le fichier `en.json` contiendrait les équivalents anglais.

Exemples de clés :

```json
{
  "nav.dashboard": "Dashboard",
  "nav.cartography": "Cartographie",
  "nav.settings": "Paramétrages",
  "kobo.admin.title": "Administration KoboToolbox",
  "kobo.actions.testConnection": "Tester la connexion",
  "kobo.actions.loadForms": "Charger les formulaires"
}
```

## 4. Fonctionnement dans une application Express

Dans une application Node.js / Express, l'i18n est généralement intégré avec un middleware.

À chaque requête, le serveur détermine la langue active. Cette langue peut venir :

- d'un paramètre d'URL ;
- d'un cookie ;
- du profil utilisateur ;
- de l'en-tête HTTP `Accept-Language` ;
- d'une langue par défaut définie dans l'application.

Ensuite, Express rend disponible une fonction `t()` dans toutes les vues EJS :

```js
res.locals.t = function t(key) {
  return translations[key] || key;
};
```

Dans les vues, on peut alors utiliser :

```ejs
<a href="/cartographie"><%= t("nav.cartography") %></a>
```

## 5. Gestion des variables dans les messages

Certains messages doivent intégrer des valeurs dynamiques.

Exemple :

```json
{
  "kobo.forms.loaded": "{{count}} formulaire(s) KoboToolbox récupéré(s)."
}
```

Utilisation côté serveur :

```js
t("kobo.forms.loaded", { count: 5 })
```

Résultat affiché :

```text
5 formulaire(s) KoboToolbox récupéré(s).
```

Cette logique peut être implémentée simplement avec un remplacement de variables, ou confiée à une bibliothèque spécialisée.

## 6. Gestion du fallback

Un mécanisme de fallback est indispensable.

Si la langue active est l'anglais mais qu'une clé manque dans `en.json`, l'application peut revenir automatiquement au français.

Exemple :

```text
langue active : en
clé demandée : kobo.admin.title
si absente dans en.json, rechercher dans fr.json
si absente partout, afficher la clé elle-même
```

Cela évite les erreurs d'affichage et facilite l'ajout progressif des traductions.

## 7. Solutions possibles

Deux approches sont possibles pour G2M.

### Solution légère maison

Cette solution consiste à créer les fichiers `locales/fr.json` et `locales/en.json`, puis à ajouter un petit middleware Express chargé de lire les fichiers et d'exposer `t()` aux vues.

Avantages :

- simple à comprendre ;
- peu de dépendances ;
- bien adaptée à un MVP ;
- maîtrise complète du comportement.

Limites :

- gestion manuelle de la pluralisation ;
- gestion limitée des formats de dates, nombres et devises ;
- moins complète qu'une bibliothèque spécialisée.

### Solution avec bibliothèque i18n

Des bibliothèques comme `i18next`, `i18next-http-middleware` ou `i18n` peuvent gérer l'internationalisation de façon plus complète.

Avantages :

- gestion avancée des langues ;
- fallback robuste ;
- pluralisation ;
- interpolation de variables ;
- écosystème éprouvé.

Limites :

- dépendance supplémentaire ;
- configuration initiale plus importante ;
- courbe d'apprentissage plus élevée.

## 8. Recommandation pour G2M

Pour G2M, il est recommandé de commencer par une solution légère maison.

Le projet utilise déjà Express, EJS et une structure simple. Une première étape réaliste serait :

1. créer un dossier `locales/` ;
2. créer `locales/fr.json` comme langue principale ;
3. créer éventuellement `locales/en.json` ;
4. ajouter un middleware `i18n` dans Express ;
5. exposer `t()` dans toutes les vues ;
6. convertir progressivement les textes de l'interface ;
7. conserver le français comme langue de fallback.

Cette approche permet d'introduire l'i18n sans bouleverser l'architecture actuelle.

## 9. Points de vigilance

Les textes suivants doivent progressivement être sortis du code :

- titres de pages ;
- menus de navigation ;
- boutons ;
- messages d'erreur ;
- messages de succès ;
- libellés de formulaires ;
- statuts métier ;
- textes des tableaux ;
- textes des contrôles cartographiques ;
- messages liés à KoboToolbox.

Il faut éviter de mélanger les deux approches sur le long terme. Les nouveaux écrans devraient utiliser directement les clés i18n.

## 10. Conclusion

La mise en place de fichiers de ressources multilingues est possible et pertinente pour G2M. Elle préparera l'application à un usage plus large, facilitera la maintenance des libellés et évitera la duplication des textes dans les vues.

La meilleure trajectoire consiste à commencer simplement avec une solution maison basée sur des fichiers JSON et une fonction `t()`, puis à migrer vers une bibliothèque spécialisée uniquement si les besoins deviennent plus avancés.
