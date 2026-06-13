# Note Technique 16 - LayerBoxManager pour le PAL cartographique G2M

Date : 2026-06-13

## Objectif

Mettre en place une architecture de panneaux dynamiques dans le Panneau d'Affichage Latéral (PAL) de la vue cartographique G2M. Le composant central est `LayerBoxManager`, un gestionnaire de conteneurs plein écran du PAL, pilotés par pile d'historique.

## Principe fonctionnel

- Le PAL ne scrolle plus directement : `overflow: hidden`.
- Chaque LayerBox occupe 100% de la largeur et 100% de la hauteur disponible du PAL.
- Chaque LayerBox contient :
  - un en-tête fixe ;
  - un titre ;
  - un bouton de fermeture, sauf pour la racine ;
  - une zone de contenu scrollable.
- Une seule LayerBox est active à la fois.
- Les LayerBoxes non actives restent chargées ou sont détruites selon l'action appelée.

## États

- `loaded` : DOM présent, couche masquée.
- `active` : DOM présent, couche visible.
- `unloaded` : DOM supprimé.

Transitions prévues :

- `unloaded -> loaded` : création DOM.
- `loaded -> active` : activation.
- `active -> loaded` : masquage.
- `active -> unloaded` : fermeture/destruction.

## API JavaScript

Fichier : `public/js/layer-box-manager.js`

Méthodes principales :

- `push(layerBoxDef)` : ajoute une couche au sommet de la pile et l'active.
- `pop()` : détruit la couche active et revient à la précédente.
- `replace(layerBoxDef)` : remplace la couche active par une autre.
- `renderToLayer(id, content, options)` : injecte du contenu dans une couche cible.
- `activateLayer(id)` : active une couche existante ou la pousse dans la pile.
- `getLayer(id)` : retourne une couche existante.
- `destroyLayer(id)` : détruit une couche non racine.
- `on(event, handler)` : écoute `push`, `pop`, `activate`, `content-updated`.

La racine `root` est créée automatiquement au démarrage. Elle ne peut pas être détruite et ne reçoit pas de bouton de fermeture.

## Intégration G2M

Fichiers modifiés :

- `public/js/layer-box-manager.js`
- `public/js/cartographie.js`
- `views/sig/index.ejs`
- `public/css/app.css`
- `tests/app.test.js`

La vue cartographique charge maintenant :

```html
<script src="/js/layer-box-manager.js"></script>
<script src="/js/cartographie.js"></script>
```

La racine du PAL est initialisée dans `cartographie.js` :

```js
const layerBoxManager = new LayerBoxManager(toolsPanel, {
  rootId: "root",
  rootTitle: t("palRootTitle"),
  rootRender: function (container) {
    container.append(rootContent);
  }
});
```

## LayerBoxes retenues

| id | Titre | Création | Contenu | Déclencheur |
| --- | --- | --- | --- | --- |
| `root` | Soumissions affichées | Démarrage | Filtres, synthèse, tableau Tabulator | Initialisation PAL |
| `site-detail` | Nom du site | À la demande | Fiche d'identification technique du site | Clic marqueur ou ligne Tabulator |
| `filters` | Filtres | Future évolution | Filtres seuls, si séparation UX décidée | Bouton filtres |
| `donor-view` | Vue décisionnelle | Future évolution | Vue synthétique bailleur/partenaire | Action depuis fiche site |
| `alerts` | Alertes | Future évolution | Anomalies qualité et messages de contrôle | Analyse ou sélection |
| `kobo-import` | Import Kobo | Future évolution | Progression et journal d'import | Lancement synchro Kobo |
| `photos` | Photos | Future évolution | Galerie et métadonnées médias | Action depuis fiche site |

## Affectation actuelle

- Les filtres, métriques et tableau restent ensemble dans la LayerBox racine.
- La fiche d'identification n'est plus un overlay HTML statique : elle est rendue dynamiquement dans `site-detail`.
- Le clic sur une ligne Tabulator appelle :

```js
flyToSubmission(point);
showSiteIdentification(point);
```

- Le clic sur un marqueur appelle :

```js
showSiteIdentification(point);
```

`showSiteIdentification()` injecte le contenu par :

```js
layerBoxManager.renderToLayer("site-detail", renderFn, {
  activate: true,
  title: siteName
});
```

## Règles CSS

La variable globale d'en-tête est :

```css
.layer-box-host {
  --header-height: 48px;
}
```

La structure d'une couche :

```css
.layer-box {
  display: none;
  flex-direction: column;
  overflow: hidden;
}

.layer-box-header {
  flex: 0 0 var(--header-height);
}

.layer-box-content {
  flex: 1 1 auto;
  overflow-y: auto;
}
```

## Plan de migration

1. Stabiliser la V1 actuelle : racine + fiche site dynamique.
2. Extraire les filtres dans une LayerBox dédiée uniquement si l'usage terrain le justifie.
3. Ajouter une LayerBox `photos` quand le workflow médias sera arrêté.
4. Ajouter une LayerBox `donor-view` pour la fiche synthétique bailleur.
5. Ajouter une LayerBox `alerts` pour les diagnostics de qualité des données.
6. Ajouter `kobo-import` uniquement si une progression client temps réel est nécessaire.

## Risques

- Les composants comme Tabulator doivent être initialisés après déplacement DOM dans la LayerBox racine.
- Les contenus injectés dans une LayerBox ne doivent pas dupliquer des identifiants HTML actifs.
- Les futures couches doivent éviter les scrolls imbriqués : le scroll principal doit rester `layer-box-content`.
- Une LayerBox créée sans activation peut recevoir du contenu, mais ne doit pas être considérée comme visible.

## Tests effectués

Commande :

```bash
npm.cmd test
```

Résultat : 81 tests passés.
