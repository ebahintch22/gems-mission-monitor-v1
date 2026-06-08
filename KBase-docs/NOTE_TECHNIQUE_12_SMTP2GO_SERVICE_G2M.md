# Note technique 12 - SMTP2GO_SERVICE pour les emails transactionnels G2M

## 1. Objet

Cette note technique décrit pas à pas la mise en œuvre de l'envoi transactionnel des emails G2M avec SMTP2GO.

Le cas d'usage prioritaire est l'envoi des messages contenant les liens d'activation de compte utilisateur. Ces liens sont générés par G2M lorsqu'un utilisateur préautorisé tente d'activer son accès ou lorsqu'une invitation utilisateur est traitée.

Le choix retenu est d'utiliser SMTP2GO comme relais SMTP externe, avec une authentification SMTP classique par utilisateur SMTP et mot de passe SMTP. Cette solution remplace l'option Gmail OAuth2 précédemment étudiée.

## 2. Périmètre fonctionnel

Le service SMTP2GO doit permettre à G2M d'envoyer :

- les liens d'activation de compte ;
- les emails de test depuis le panneau d'administration ;
- les futures notifications transactionnelles ;
- les messages liés aux workflows administratifs.

Le périmètre ne couvre pas :

- l'envoi de newsletters ;
- les campagnes marketing ;
- la gestion avancée de listes de diffusion ;
- la réception d'emails.

G2M utilise SMTP2GO uniquement comme service SMTP sortant.

## 3. Architecture G2M concernée

| Zone | Élément |
| --- | --- |
| Backend | Node.js / Express |
| Moteur de vues | EJS |
| Base de données | SQLite avec `better-sqlite3` |
| Authentification G2M | JWT en cookie HttpOnly |
| Envoi email | `nodemailer` |
| Service mail | `services/mailService.js` |
| Service activation | `services/activationMailService.js` |
| Paramètres persistants | table `settings` |
| Panneau admin | `/admin` |
| Test email | `/admin/email-test` |

Le module d'envoi email est déjà conçu pour fonctionner avec un fournisseur SMTP classique. SMTP2GO s'insère donc dans G2M sans changer le parcours d'activation utilisateur.

## 4. Principe SMTP2GO

SMTP2GO est un relais SMTP externe. G2M se connecte au serveur SMTP2GO, s'authentifie avec un utilisateur SMTP dédié, puis demande l'envoi du message.

Le flux est le suivant :

```text
G2M
  -> Nodemailer
  -> mail.smtp2go.com
  -> destinataire final
```

SMTP2GO prend en charge la remise du message, la réputation d'envoi, les rapports et certains contrôles de délivrabilité.

## 5. Paramètres SMTP2GO à utiliser

Les paramètres officiels SMTP2GO pour une configuration SMTP standard sont :

| Paramètre | Valeur recommandée |
| --- | --- |
| Serveur SMTP | `mail.smtp2go.com` |
| Port principal | `2525` |
| Ports alternatifs | `587`, `8025`, `80`, `25` |
| Authentification | utilisateur SMTP + mot de passe SMTP |
| Chiffrement recommandé | STARTTLS sur port `2525` ou `587` |

Dans G2M, la configuration recommandée est :

```env
MAIL_FROM=adresse_verifiee@votre-domaine.com
SMTP_AUTH_METHOD=password
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=utilisateur_smtp2go
SMTP_PASSWORD=mot_de_passe_smtp2go
```

Si le port `2525` est bloqué par l'environnement d'hébergement, utiliser :

```env
SMTP_PORT=587
SMTP_SECURE=false
```

Le paramètre `SMTP_SECURE=false` ne signifie pas que l'envoi est non sécurisé. Avec Nodemailer, cela signifie que la connexion ne démarre pas directement en TLS, mais peut utiliser STARTTLS après connexion.

## 6. Préparation du compte SMTP2GO

### 6.1. Créer le compte

1. Ouvrir le site SMTP2GO.
2. Créer un compte.
3. Choisir le plan gratuit si le volume initial reste limité.
4. Valider l'adresse email du compte.

Le plan gratuit SMTP2GO permet de démarrer avec un volume limité, généralement suffisant pour les invitations et activations G2M au début du projet.

### 6.2. Vérifier un expéditeur ou un domaine

Avant d'envoyer depuis G2M, il faut vérifier l'identité d'expédition.

Deux approches sont possibles :

| Option | Usage |
| --- | --- |
| Vérifier une adresse email | Simple pour un pilote ou un test |
| Vérifier un domaine | Recommandé pour la production |

Pour un pilote, l'adresse suivante peut être utilisée si elle est acceptée et vérifiée dans SMTP2GO :

```text
operagis2022@gmail.com
```

Pour une production plus propre, préférer :

```text
no-reply@votre-domaine.com
```

### 6.3. Créer un utilisateur SMTP

Dans SMTP2GO :

1. Aller dans l'espace d'administration.
2. Ouvrir la section d'envoi.
3. Ouvrir `SMTP Users`.
4. Créer un utilisateur SMTP dédié à G2M.
5. Copier :
   - le nom d'utilisateur SMTP ;
   - le mot de passe SMTP.

Point important : l'utilisateur SMTP n'est pas nécessairement identique au compte utilisé pour se connecter au tableau de bord SMTP2GO.

## 7. Configuration dans G2M

### 7.1. Configuration via le panneau admin

1. Se connecter à G2M avec un compte `admin`.
2. Ouvrir :

```text
/admin/settings
```

3. Aller dans la section email/SMTP.
4. Renseigner les valeurs suivantes :

```text
mail.from = adresse vérifiée dans SMTP2GO
smtp.auth_method = password
smtp.host = mail.smtp2go.com
smtp.port = 2525
smtp.secure = false
smtp.user = utilisateur SMTP2GO
smtp.password = mot de passe SMTP2GO
```

5. Laisser vides les champs Gmail OAuth2 :

```text
gmail.oauth_client_id
gmail.oauth_client_secret
gmail.oauth_refresh_token
```

6. Enregistrer.

### 7.2. Configuration via variables d'environnement

En production Render, il est préférable d'utiliser les variables d'environnement pour les secrets.

Configuration recommandée :

```env
MAIL_FROM=adresse_verifiee@votre-domaine.com
SMTP_AUTH_METHOD=password
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=utilisateur_smtp2go
SMTP_PASSWORD=mot_de_passe_smtp2go
GMAIL_OAUTH_CLIENT_ID=
GMAIL_OAUTH_CLIENT_SECRET=
GMAIL_OAUTH_REFRESH_TOKEN=
```

Après modification dans Render :

1. sauvegarder les variables ;
2. redémarrer le service ;
3. ouvrir `/admin/email-test` ;
4. vérifier l'état SMTP.

## 8. Test SMTP depuis G2M

### 8.1. Vérification de l'état

Ouvrir :

```text
/admin/email-test
```

État attendu :

```text
MAIL_FROM : adresse_verifiee@votre-domaine.com
SMTP_AUTH_METHOD : password
SMTP_HOST : mail.smtp2go.com
SMTP_PORT : 2525
SMTP_USER : utilisateur_smtp2go
SMTP_PASSWORD : ********
```

Le statut doit être :

```text
prêt
```

Si le statut reste `incomplet`, vérifier que `SMTP_USER` et `SMTP_PASSWORD` sont bien renseignés.

### 8.2. Envoi d'un email de test

1. Dans `/admin/email-test`, saisir une adresse destinataire.
2. Saisir un sujet simple, par exemple :

```text
Test SMTP2GO G2M
```

3. Saisir un message :

```text
Message de test envoyé depuis G2M via SMTP2GO.
```

4. Envoyer.
5. Vérifier la réception du message.
6. Vérifier les rapports SMTP2GO si le message n'arrive pas.

## 9. Envoi des liens d'activation

### 9.1. Parcours métier

Le parcours d'activation G2M fonctionne comme suit :

1. Un administrateur crée une invitation utilisateur.
2. L'invitation contient l'email, le nom, les prénoms et le rôle.
3. L'utilisateur invité tente de se connecter avec son adresse email.
4. G2M détecte qu'une invitation valide existe.
5. G2M génère un token d'activation.
6. G2M stocke uniquement le hash du token.
7. G2M construit une URL d'activation.
8. G2M envoie l'email via `activationMailService`.
9. `activationMailService` appelle `mailService`.
10. `mailService` utilise Nodemailer et SMTP2GO.
11. L'utilisateur reçoit le lien et définit son mot de passe.

### 9.2. URL d'activation

L'URL d'activation dépend de la variable :

```env
APP_BASE_URL
```

En local :

```env
APP_BASE_URL=http://localhost:3000
```

En production Render :

```env
APP_BASE_URL=https://votre-application.onrender.com
```

Si cette variable est incorrecte, les emails peuvent être envoyés correctement mais contenir un lien invalide.

### 9.3. Exemple de message envoyé

Le message d'activation contient :

- le nom de l'utilisateur invité ;
- une information indiquant que le compte est préautorisé ;
- le lien d'activation ;
- la date d'expiration ;
- une mention de sécurité invitant à ignorer le message si l'utilisateur n'est pas concerné.

Exemple :

```text
Bonjour Prénom Nom,

Votre compte G2M a été préautorisé.
Pour l'activer, ouvrez le lien suivant et définissez votre mot de passe :
https://votre-application.onrender.com/activation/<token>

Ce lien expire le ...
Si vous n'êtes pas concerné par cette invitation, ignorez ce message.
```

## 10. Sécurité

### 10.1. Ne pas exposer les identifiants SMTP2GO

Les valeurs suivantes sont des secrets :

```text
SMTP_USER
SMTP_PASSWORD
```

Elles ne doivent pas être :

- commitées dans Git ;
- copiées dans une note publique ;
- affichées dans les logs ;
- transmises dans une capture d'écran ;
- partagées dans un canal non sécurisé.

### 10.2. Utiliser un utilisateur SMTP dédié

Il est recommandé de créer un utilisateur SMTP réservé à G2M.

Avantages :

- révocation plus simple ;
- traçabilité ;
- réduction du risque si le secret fuit ;
- séparation entre le compte administrateur SMTP2GO et l'application G2M.

### 10.3. Préférer un domaine vérifié

Pour la production, vérifier un domaine est préférable à la simple vérification d'une adresse.

Cela permet de configurer proprement :

- SPF ;
- DKIM ;
- DMARC.

Ces mécanismes améliorent la délivrabilité et réduisent le risque que les emails d'activation arrivent en spam.

### 10.4. Rotation des secrets

En cas de suspicion de fuite :

1. désactiver ou supprimer l'utilisateur SMTP concerné dans SMTP2GO ;
2. créer un nouvel utilisateur SMTP ;
3. mettre à jour `SMTP_USER` et `SMTP_PASSWORD` dans G2M ou Render ;
4. redémarrer l'application ;
5. tester `/admin/email-test` ;
6. vérifier les rapports SMTP2GO.

## 11. Diagnostic des erreurs fréquentes

### 11.1. État SMTP incomplet

Causes probables :

- `SMTP_HOST` absent ;
- `SMTP_PORT` absent ;
- `SMTP_USER` absent ;
- `SMTP_PASSWORD` absent ;
- `SMTP_AUTH_METHOD` resté à `oauth2`.

Correction :

```env
SMTP_AUTH_METHOD=password
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
```

### 11.2. Authentification refusée

Causes probables :

- mauvais utilisateur SMTP ;
- mauvais mot de passe SMTP ;
- confusion entre compte SMTP2GO dashboard et utilisateur SMTP ;
- utilisateur SMTP désactivé ;
- compte SMTP2GO non finalisé.

Correction :

- recréer un utilisateur SMTP ;
- copier le mot de passe au moment de sa création ;
- tester à nouveau depuis `/admin/email-test`.

### 11.3. Email envoyé mais non reçu

Causes probables :

- email classé en spam ;
- expéditeur non vérifié ;
- domaine non configuré ;
- quota SMTP2GO atteint ;
- destinataire incorrect.

Correction :

- vérifier le dossier spam ;
- vérifier les rapports SMTP2GO ;
- vérifier `MAIL_FROM` ;
- vérifier les quotas du plan gratuit ;
- tester avec un autre destinataire.

### 11.4. Lien d'activation incorrect

Cause probable :

```env
APP_BASE_URL
```

mal renseignée.

Correction :

En local :

```env
APP_BASE_URL=http://localhost:3000
```

En production :

```env
APP_BASE_URL=https://votre-application.onrender.com
```

## 12. Tests manuels recommandés

### 12.1. Test de configuration SMTP

1. Configurer SMTP2GO dans `/admin/settings`.
2. Ouvrir `/admin/email-test`.
3. Vérifier le statut `prêt`.
4. Envoyer un email de test.
5. Vérifier la réception.
6. Vérifier le rapport SMTP2GO.

### 12.2. Test d'invitation utilisateur

1. Ouvrir `/users/invitations`.
2. Créer une invitation pour une adresse de test.
3. Ouvrir `/login`.
4. Saisir l'adresse invitée.
5. Soumettre.
6. Vérifier que l'email d'activation est envoyé.
7. Ouvrir le lien reçu.
8. Définir un mot de passe.
9. Se connecter avec le compte activé.

### 12.3. Test d'expiration

1. Créer une invitation avec une durée courte.
2. Attendre l'expiration ou modifier `expires_at` en base de test.
3. Tenter d'utiliser le lien.
4. Vérifier que G2M refuse le token expiré.

### 12.4. Test de non-divulgation

1. Ouvrir `/admin/settings`.
2. Vérifier que `smtp.password` n'est pas affiché en clair.
3. Ouvrir `/admin/email-test`.
4. Vérifier que `SMTP_PASSWORD` apparaît masqué.
5. Vérifier les logs serveur.

## 13. Tests automatisés G2M

La suite de tests actuelle couvre déjà :

- le mode développement si la configuration SMTP est absente ;
- la reconnaissance d'une configuration SMTP complète ;
- le masquage des secrets ;
- le parcours invitation et activation ;
- l'accès au panneau admin.

Commande de validation :

```bash
npm.cmd test
```

Résultat de référence après la mise en place du panneau admin et du service mail :

```text
50 tests
0 échec
```

## 14. Fichiers G2M concernés

| Fichier | Rôle |
| --- | --- |
| `services/mailService.js` | Envoi SMTP avec Nodemailer |
| `services/activationMailService.js` | Construction et envoi du lien d'activation |
| `models/Setting.js` | Lecture et modification des paramètres SMTP |
| `config/database.js` | Initialisation des clés `settings` |
| `views/admin/settings.ejs` | Formulaire de configuration SMTP |
| `views/admin/email-test.ejs` | Test d'envoi SMTP |
| `.env.example` | Documentation des variables SMTP |

## 15. Configuration finale recommandée

Pour SMTP2GO, la configuration cible est :

```env
APP_BASE_URL=https://votre-application.onrender.com
MAIL_FROM=no-reply@votre-domaine.com
SMTP_AUTH_METHOD=password
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=utilisateur_smtp2go
SMTP_PASSWORD=mot_de_passe_smtp2go
GMAIL_OAUTH_CLIENT_ID=
GMAIL_OAUTH_CLIENT_SECRET=
GMAIL_OAUTH_REFRESH_TOKEN=
```

Pour un test local :

```env
APP_BASE_URL=http://localhost:3000
MAIL_FROM=adresse_verifiee_dans_smtp2go
SMTP_AUTH_METHOD=password
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=utilisateur_smtp2go
SMTP_PASSWORD=mot_de_passe_smtp2go
```

## 16. Sources

Références SMTP2GO utiles :

- SMTP2GO Setup Guides : https://www.smtp2go.com/setup/
- SMTP2GO Getting Started : https://support.smtp2go.com/hc/en-gb/articles/12747932085145-Getting-Started-with-SMTP2GO
- SMTP2GO Free Plan : https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan
- SMTP2GO Pricing : https://www.smtp2go.com/pricing/

Référence technique G2M :

- `services/mailService.js`
- `services/activationMailService.js`
- `/admin/email-test`
- `/users/invitations`
- `/activation/:token`

## 17. Conclusion

SMTP2GO est une solution pragmatique pour assurer l'envoi transactionnel des emails G2M sans dépendre de Google OAuth2. L'intégration repose sur une configuration SMTP standard, bien comprise par Nodemailer et déjà compatible avec l'architecture existante.

La priorité opérationnelle est de vérifier l'expéditeur ou le domaine dans SMTP2GO, de créer un utilisateur SMTP dédié, de configurer G2M en mode `password`, puis de tester l'envoi depuis `/admin/email-test` avant de valider le flux complet d'invitation et d'activation.
