# Note technique 13 - Préparation du verrouillage progressif des routes G2M

## 1. Objet

Cette note technique résume les éléments préliminaires à stabiliser avant de commencer le verrouillage progressif des routes G2M.

L'objectif final est de protéger les fonctionnalités de l'application selon le profil connecté, sans bloquer les routes publiques indispensables au cycle d'authentification et d'activation.

Le verrouillage global par `requireAuth` reste volontairement ajourné tant que la matrice d'habilitations n'est pas validée.

## 2. État actuel

G2M dispose désormais d'un socle d'authentification et d'administration :

- page `/login` ;
- activation par token ;
- JWT stocké dans un cookie HttpOnly ;
- middleware `currentUser` ;
- middleware `requireAuth` ;
- middleware `requireRole` ;
- panneau `/admin` protégé par rôle `admin` ;
- gestion utilisateurs ;
- invitations utilisateurs ;
- comptes de test actifs ;
- table `roles` enrichie.

Les comptes utilisateurs peuvent maintenant être créés directement ou activés par invitation. Le blocage SMTP transactionnel est temporairement contourné par la création directe de comptes de test.

## 3. Rôles disponibles

La liste actuelle des rôles techniques est la suivante :

| Code technique | Libellé |
| --- | --- |
| `admin` | Administrateur système |
| `directeur_mission` | Directeur de Mission |
| `coordinateur` | Coordinateur national |
| `superviseur` | Superviseur régional |
| `controleur` | Contrôleur qualité |
| `specialiste_gis` | Responsable SIG |
| `specialiste_analyste_donnees` | Spécialiste Analyste de Données |
| `partenaire` | Partenaire / bailleur |
| `agent` | Enquêteur |

Les deux derniers rôles ajoutés avant cette note sont :

- `directeur_mission` ;
- `specialiste_analyste_donnees`.

Ces codes techniques doivent rester ASCII et stables, car ils seront utilisés dans les permissions, les tests et les middlewares.

## 4. Routes publiques à préserver

Les routes suivantes doivent rester accessibles sans authentification :

```text
/login
/logout
/activation/:token
/css/*
/js/*
/assets/*
/vendor/*
```

Ces routes sont nécessaires pour :

- afficher la page de connexion ;
- permettre la déconnexion ;
- activer un compte invité ;
- charger les fichiers statiques ;
- afficher correctement les pages publiques d'authentification.

Le verrouillage progressif ne doit jamais bloquer ces routes.

## 5. Routes fonctionnelles à classer

Avant d'appliquer des restrictions, chaque famille de routes doit être rattachée à une permission.

| Zone | Routes principales | Besoin de protection |
| --- | --- | --- |
| Dashboard | `/` | Oui |
| Missions | `/missions/*` | Oui |
| Équipes | `/equipes/*` | Oui |
| Agents | `/agents/*` | Oui |
| Utilisateurs | `/users/*` | Oui |
| Invitations | `/users/invitations/*` | Oui |
| Administration | `/admin/*` | Déjà protégé admin, à affiner |
| Kobo | `/parametrages/kobo/*` | Oui |
| Cartographie | `/cartographie/*` | Oui |
| Infographies | `/infographies/*` | Oui |

## 6. Matrice d'accès à définir

Avant l'implémentation, il faut valider la matrice rôles x fonctionnalités.

Exemple de questions à trancher :

- Le `directeur_mission` peut-il gérer les utilisateurs ou seulement consulter les indicateurs ?
- Le `coordinateur` peut-il modifier les missions ?
- Le `superviseur` peut-il créer des agents ?
- Le `controleur` peut-il modifier le statut de validation des soumissions ?
- Le `specialiste_gis` peut-il accéder aux paramètres Kobo ?
- Le `specialiste_analyste_donnees` peut-il accéder aux infographies seulement ou aussi aux exports ?
- Le `partenaire` est-il strictement en lecture seule ?
- Le rôle `agent` doit-il accéder à l'interface web ou rester surtout un profil de collecte ?

Cette matrice doit être validée avant de poser les middlewares de protection, pour éviter de verrouiller trop vite des workflows nécessaires.

## 7. Permissions recommandées

Une première liste de permissions techniques peut être préparée.

| Permission | Description |
| --- | --- |
| `dashboard.read` | Accès au dashboard |
| `missions.read` | Consultation des missions |
| `missions.manage` | Création et modification des missions |
| `teams.read` | Consultation des équipes |
| `teams.manage` | Création et modification des équipes |
| `agents.read` | Consultation des agents |
| `agents.manage` | Création et modification des agents |
| `users.read` | Consultation des utilisateurs |
| `users.manage` | Création et modification des utilisateurs |
| `users.invite.read` | Consultation des invitations |
| `users.invite.manage` | Création et modification des invitations |
| `admin.access` | Accès au hub d'administration |
| `settings.manage` | Modification des paramètres globaux |
| `db.stats.read` | Consultation du rapport base de données |
| `email.test` | Test du service email |
| `monitoring.read` | Consultation du monitoring |
| `kobo.manage` | Administration KoboToolbox |
| `sig.read` | Accès à la cartographie |
| `sig.manage` | Paramétrage ou fonctions avancées SIG |
| `infographics.read` | Consultation des infographies |
| `quality.read` | Consultation des contrôles qualité |
| `quality.manage` | Actions de contrôle ou validation |

Cette liste peut évoluer. Elle sert de point de départ pour structurer le verrouillage.

## 8. Tables à créer

Le modèle recommandé repose sur trois tables.

### 8.1. Table `permissions`

```sql
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_permission TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2. Table `role_permissions`

```sql
CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission_id INTEGER NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission_id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);
```

### 8.3. Table `user_permission_overrides`

Cette table est optionnelle au démarrage, mais utile à moyen terme.

```sql
CREATE TABLE user_permission_overrides (
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  allowed INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);
```

Elle permet d'accorder ou de retirer une permission à un utilisateur précis, indépendamment de son rôle.

## 9. Service de résolution des droits

Un service dédié devra calculer les permissions effectives d'un utilisateur.

Fichier recommandé :

```text
services/permissionService.js
```

Principe de résolution :

1. charger les permissions du rôle ;
2. charger les overrides utilisateur ;
3. appliquer les overrides s'ils existent ;
4. retourner un ensemble de permissions effectives.

Ordre de priorité recommandé :

```text
override utilisateur
  > permission du rôle
  > refus par défaut
```

Cette règle permet de gérer des exceptions sans créer trop de rôles spécifiques.

## 10. Middleware à créer

Un nouveau middleware est recommandé :

```text
middlewares/permissionMiddleware.js
```

Exemple de fonction :

```js
function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.currentUser) {
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    }

    if (!req.permissions?.has(permissionCode)) {
      return res.status(403).render("errors/403", {
        title: req.t("errors.403.title")
      });
    }

    return next();
  };
}
```

Ce middleware viendra compléter :

- `requireAuth` ;
- `requireRole`.

À terme, `requirePermission` sera préférable à `requireRole`, car il autorise une gestion plus fine.

## 11. Stratégie de verrouillage progressif

Le verrouillage ne doit pas être appliqué en une seule fois sur toute l'application.

Ordre recommandé :

1. créer les tables de permissions ;
2. créer les permissions de base ;
3. associer les permissions aux rôles ;
4. charger les permissions dans `currentUser` ou un middleware dédié ;
5. protéger d'abord `/admin/*` avec des permissions détaillées ;
6. protéger `/users/*` ;
7. protéger `/parametrages/kobo/*` ;
8. protéger `/missions/*`, `/equipes/*`, `/agents/*` ;
9. protéger `/cartographie/*` ;
10. protéger `/infographies/*` ;
11. protéger enfin le dashboard `/`.

Le dashboard est volontairement placé en fin de séquence, car c'est la page d'entrée de l'application et elle permet de détecter rapidement les problèmes de connexion.

## 12. Tests nécessaires par profil

Chaque rôle doit faire l'objet de tests d'accès.

### 12.1. Tests minimaux

| Profil | Tests attendus |
| --- | --- |
| Non connecté | Redirection vers `/login` sur les routes privées |
| Admin | Accès à toutes les zones |
| Directeur de Mission | Accès pilotage global selon matrice validée |
| Coordinateur | Accès suivi national selon matrice validée |
| Superviseur | Accès aux zones terrain utiles |
| Contrôleur qualité | Accès aux données et contrôles qualité |
| Responsable SIG | Accès cartographie et SIG |
| Spécialiste Analyste de Données | Accès analyses, infographies et indicateurs |
| Partenaire | Accès lecture seule |
| Agent | Accès limité ou aucun accès web selon choix métier |

### 12.2. Tests techniques

À ajouter dans `tests/app.test.js` ou dans un fichier dédié :

- `/admin/settings` exige `settings.manage` ;
- `/admin/db-stats` exige `db.stats.read` ;
- `/users` exige `users.read` ;
- `/users/invitations` exige `users.invite.read` ;
- `/parametrages/kobo` exige `kobo.manage` ;
- `/cartographie` exige `sig.read` ;
- `/infographies/*` exige `infographics.read` ;
- une route privée redirige un utilisateur non connecté vers `/login`.

## 13. Points de vigilance

### 13.1. Ne pas activer `requireAuth` globalement trop tôt

Un verrouillage global prématuré peut bloquer :

- l'activation des comptes ;
- le login ;
- les assets statiques ;
- les tests ;
- certains parcours encore non stabilisés.

Le verrouillage doit rester route par route au départ.

### 13.2. Ne pas confondre rôle et permission

Le rôle décrit le profil métier :

```text
superviseur
coordinateur
directeur_mission
```

La permission décrit une capacité :

```text
missions.read
kobo.manage
users.invite.manage
```

Le verrouillage durable doit reposer sur les permissions.

### 13.3. Préserver le compte admin

Le compte admin connu est :

```text
email : operagis2022@gmail.com
role : admin
statut : actif
email_verified : 1
```

Ce compte doit conserver les permissions complètes, afin d'éviter un blocage administratif.

### 13.4. Documenter la matrice

Avant implémentation, la matrice finale doit être documentée dans une note ou un tableau validé. Cela évite les décisions implicites dans le code.

## 14. Livrables préliminaires attendus

Avant de démarrer le verrouillage effectif, les livrables suivants sont recommandés :

1. liste finale des rôles ;
2. matrice rôles x permissions ;
3. liste stable des permissions techniques ;
4. tables `permissions` et `role_permissions` ;
5. service `permissionService.js` ;
6. middleware `requirePermission` ;
7. tests d'accès par rôle ;
8. documentation du plan de verrouillage progressif.

## 15. Conclusion

G2M est prêt à entrer dans la phase de préparation du verrouillage progressif des routes, mais il faut d'abord formaliser la matrice d'habilitations.

La bonne approche consiste à ne pas verrouiller globalement l'application immédiatement. Il faut construire un modèle de permissions, l'associer aux rôles, tester les profils, puis protéger les routes par familles fonctionnelles.

Cette démarche réduit le risque de bloquer l'administration, l'activation des comptes ou les utilisateurs de test, tout en préparant une architecture d'accès robuste pour la production.
