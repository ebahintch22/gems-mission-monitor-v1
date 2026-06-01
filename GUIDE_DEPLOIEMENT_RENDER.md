# Guide operationnel - Deploiement Render via GitHub

## 1. Contexte projet

Application : **GEMS Mission Monitor**

Stack technique actuelle :

| Couche | Technologie |
| --- | --- |
| Runtime | Node.js >= 20 |
| Serveur | Express.js |
| Vues | EJS |
| Base de donnees | SQLite via better-sqlite3 |
| Cartographie | Leaflet |
| Tableaux | Tabulator |
| Deploiement | GitHub vers Render |
| Persistance production | Disque persistant Render |

Objectif du deploiement :

- deployer le code applicatif depuis GitHub ;
- conserver la base SQLite sur le disque persistant Render ;
- utiliser les variables d'environnement Render ;
- ne jamais versionner les secrets ni les fichiers runtime sensibles ;
- ne jamais ecraser une base SQLite deja presente sur le disque persistant.

## 2. Etat actuel du projet

Le projet contient deja :

- un script `start` dans `package.json` :

```json
"start": "node app.js"
```

- une version Node declaree :

```json
"engines": {
  "node": ">=20"
}
```

- une ecoute du port dynamique Render dans `app.js` :

```js
const port = Number(process.env.PORT) || 3000;
```

- une base SQLite configurable avec `DATABASE_PATH` dans `config/database.js` :

```js
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "gems.sqlite");
```

- une initialisation automatique du schema SQLite via `CREATE TABLE IF NOT EXISTS`.

## 3. Fichiers a verifier avant deploiement

Fichiers critiques :

- `app.js`
- `config/database.js`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `.env.example`
- `README.md`
- `public/`
- `views/`
- `routes/`
- `controllers/`
- `models/`
- `services/`
- `scripts/`
- `tests/`

Fichiers a ne pas versionner :

- `.env`
- `node_modules/`
- fichiers SQLite runtime : `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`
- logs : `*.log`
- exports temporaires

## 4. Corrections recommandees avant push

### 4.1 Corriger `.gitignore`

Configuration recommandee :

```gitignore
node_modules/
.env

*.log
npm-debug.log*

data/*.sqlite
data/*.sqlite-*
data/runtime/
*.db
*.db-*
```

Si une base seed non sensible doit etre versionnee :

```gitignore
!data/seed/
!data/seed/*.sqlite
```

### 4.2 Ne pas utiliser les chemins Windows sur Render

Les variables suivantes sont utiles en local mais ne doivent pas etre declarees sur Render si les fichiers correspondants n'existent pas sur le disque Render :

```env
TERRITORY_GEOJSON_PATH=...
ROLE_DEFINITIONS_PATH=...
AGENT_COLLECTE_PATH=...
```

Pour un premier deploiement, ne declarer que les variables strictement necessaires.

## 5. Variables d'environnement Render

Variables recommandees :

```env
NODE_ENV=production
DATABASE_PATH=/var/data/gems-mission-monitor.sqlite
```

Ne pas declarer `PORT` sauf besoin particulier. Render fournit automatiquement `PORT`.

Ne jamais coller de secret dans GitHub, dans le code, dans le README ou dans un fichier `.env` versionne.

## 6. Parametres du Web Service Render

Parametres Render :

| Parametre | Valeur |
| --- | --- |
| Environment | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Branch | branche GitHub de deploiement, par exemple `main` |
| Disk mount path | `/var/data` |

Le disque persistant doit contenir les donnees runtime uniquement.

Base SQLite production :

```text
/var/data/gems-mission-monitor.sqlite
```

Fichiers WAL/SHM eventuels :

```text
/var/data/gems-mission-monitor.sqlite-wal
/var/data/gems-mission-monitor.sqlite-shm
```

## 7. Structure recommandee des donnees

Dans le depot GitHub :

```text
data/
  seed/
    gems.seed.sqlite
  runtime/
    .gitkeep
```

Sur Render :

```text
/var/data/
  gems-mission-monitor.sqlite
  gems-mission-monitor.sqlite-wal
  gems-mission-monitor.sqlite-shm
  backups/
```

Regle :

- le code reste dans GitHub ;
- les donnees runtime restent sur `/var/data` ;
- la base de production ne doit pas etre ecrite dans le repertoire applicatif clone par Render.

## 8. Strategie d'initialisation de la base

Objectif :

- si la base existe deja dans `/var/data`, ne rien ecraser ;
- si elle n'existe pas, initialiser une base.

Approche simple :

1. Render demarre l'application.
2. `config/database.js` ouvre `DATABASE_PATH`.
3. Si le fichier n'existe pas, SQLite le cree.
4. Le schema est cree avec `CREATE TABLE IF NOT EXISTS`.

Approche recommandee avec base seed :

1. Ajouter une base seed non sensible dans `data/seed/gems.seed.sqlite`.
2. Ajouter un script d'initialisation non destructif.
3. Si `/var/data/gems-mission-monitor.sqlite` existe, ne rien faire.
4. Sinon, copier la base seed vers `/var/data/gems-mission-monitor.sqlite`.
5. Ensuite seulement, demarrer Express.

Pseudo-logique :

```js
if (!fs.existsSync(process.env.DATABASE_PATH)) {
  fs.mkdirSync(path.dirname(process.env.DATABASE_PATH), { recursive: true });

  if (fs.existsSync(seedPath)) {
    fs.copyFileSync(seedPath, process.env.DATABASE_PATH);
  }
}
```

Important : ne jamais utiliser une commande qui remplace systematiquement la base de production.

## 9. Strategie minimale de sauvegarde SQLite

Avant une operation risquee ou un redeploiement majeur, sauvegarder la base.

Sur Render Shell :

```bash
mkdir -p /var/data/backups
cp /var/data/gems-mission-monitor.sqlite /var/data/backups/gems-mission-monitor-$(date +%Y%m%d-%H%M%S).sqlite
```

Si le mode WAL est actif, sauvegarder aussi les fichiers associes si presents :

```bash
cp /var/data/gems-mission-monitor.sqlite-wal /var/data/backups/ 2>/dev/null || true
cp /var/data/gems-mission-monitor.sqlite-shm /var/data/backups/ 2>/dev/null || true
```

Amelioration recommandee ulterieure :

- ajouter un script Node utilisant l'API `.backup()` de `better-sqlite3`.

## 10. Commandes locales avant push GitHub

Verifier l'etat Git :

```powershell
git status --short
```

Verifier que `.env` n'est pas versionne :

```powershell
git ls-files .env
```

La commande ne doit rien retourner.

Verifier les fichiers `data` suivis par Git :

```powershell
git ls-files data
```

Si des fichiers SQLite runtime sont suivis, les retirer de l'index sans les supprimer localement :

```powershell
git rm --cached data/gems.sqlite
git rm --cached data/gems.sqlite-wal
git rm --cached data/gems.sqlite-shm
```

Adapter selon les fichiers reellement suivis.

Lancer les tests :

```powershell
npm test
```

Ajouter les fichiers de code :

```powershell
git add app.js package.json package-lock.json .gitignore config controllers models routes services scripts views public tests README.md
```

Si une base seed non sensible est volontairement versionnee :

```powershell
git add data/seed/gems.seed.sqlite
```

Verifier le contenu prepare :

```powershell
git status --short
git diff --cached
```

Commit :

```powershell
git commit -m "Prepare Render deployment"
```

Push :

```powershell
git push origin main
```

Adapter `main` si la branche de deploiement est differente.

## 11. Checklist avant push

- `.env` absent du commit.
- `node_modules/` absent du commit.
- fichiers SQLite runtime absents du commit.
- `npm test` passe.
- `package.json` contient `start`.
- `app.js` utilise `process.env.PORT`.
- `config/database.js` utilise `process.env.DATABASE_PATH`.
- `.gitignore` protege les fichiers runtime.
- aucune cle, aucun token, aucun mot de passe dans le code.
- `git diff --cached` relu avant commit.

## 12. Checklist apres deploiement Render

Verifier les logs :

- pas de `Cannot find module`;
- pas de `SQLITE_CANTOPEN`;
- chemin de base attendu :

```text
/var/data/gems-mission-monitor.sqlite
```

Verifier les routes :

- `/`
- `/missions`
- `/equipes`
- `/agents`
- `/users`
- `/cartographie`

Verifier la persistance :

1. creer ou modifier une donnee simple ;
2. redemarrer le Web Service Render ;
3. verifier que la donnee est toujours presente.

Verifier le disque :

- la base est dans `/var/data` ;
- elle n'est pas dans le repertoire applicatif clone ;
- les fichiers WAL/SHM eventuels sont aussi dans `/var/data`.

## 13. Erreurs frequentes Render / SQLite

### `SQLITE_CANTOPEN`

Causes probables :

- disque Render non monte ;
- mauvais `DATABASE_PATH` ;
- dossier parent inexistant.

Corrections :

- verifier le mount path `/var/data` ;
- verifier `DATABASE_PATH=/var/data/gems-mission-monitor.sqlite`.

### Base vide apres redeploiement

Cause probable :

- la base est creee dans le filesystem temporaire Render.

Correction :

- forcer `DATABASE_PATH` vers `/var/data/gems-mission-monitor.sqlite`.

### Donnees perdues apres rebuild

Cause probable :

- donnees stockees dans le repertoire applicatif au lieu du disque persistant.

Correction :

- stocker uniquement sur `/var/data`.

### Erreur native `better-sqlite3`

Causes probables :

- version Node incompatible ;
- dependance native mal reconstruite.

Corrections :

- conserver `engines.node >=20` ;
- utiliser `npm install` comme build command ;
- redeployer proprement.

### Variables Windows invalides

Cause :

- variables d'import pointant vers `C:\...`.

Correction :

- ne pas les declarer sur Render ;
- ou copier les fichiers d'import vers `/var/data/imports` et mettre a jour les chemins.

## 14. Plan recommande pour le premier deploiement

1. Corriger `.gitignore`.
2. Retirer les fichiers SQLite runtime de Git si necessaire.
3. Configurer Render avec :

```env
NODE_ENV=production
DATABASE_PATH=/var/data/gems-mission-monitor.sqlite
```

4. Monter le disque Render sur `/var/data`.
5. Deployer depuis GitHub.
6. Copier une base SQLite preparee vers `/var/data/gems-mission-monitor.sqlite`, ou utiliser un seed non destructif.
7. Verifier les logs.
8. Tester les routes.
9. Tester la persistance apres redemarrage.

## 15. Regle de securite principale

Ne jamais laisser Render creer ou utiliser la base SQLite de production dans le dossier applicatif clone depuis GitHub.

La base de production doit toujours etre ici :

```text
/var/data/gems-mission-monitor.sqlite
```

