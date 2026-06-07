# Guide pratique - Accès API KoboToolbox pour G2M

**Destinataire :** Bly, administrateur KoboToolbox  
**Objet :** permettre à l'application G2M, déployée sur Render, de consulter les questionnaires KoboToolbox et de télécharger les soumissions existantes dans sa propre base de données.

Ce guide décrit les tâches à réaliser de part et d'autre pour mettre en place un accès API propre, sécurisé et réutilisable entre le serveur KoboToolbox et l'application de supervision des enquêtes CAPI.

## 1. Ce que je dois communiquer à Bly

Je dois d'abord préciser clairement le besoin fonctionnel et le contexte technique, afin que Bly puisse préparer les droits adaptés sur KoboToolbox.

Informations à transmettre :

- **Nom de l'application :** G2M - GEMS Mission Monitor.
- **Type d'application :** application web Node.js / Express, déployée sur Render.
- **Objectif de l'accès API :** consulter la liste des questionnaires KoboToolbox disponibles, puis récupérer les soumissions collectées pour les importer dans la base de données interne de G2M.
- **Mode d'accès souhaité :** accès API KoboToolbox v2 avec jeton d'authentification.
- **Type de droits demandés :** lecture des formulaires et lecture des soumissions. Les droits de modification ou de suppression ne sont pas nécessaires au démarrage.
- **Périmètre des formulaires concernés :** uniquement les questionnaires liés aux enquêtes suivies dans G2M.

Exemple de message à envoyer à Bly :

```text
Bonjour Bly,

Je mets en place la connexion entre l'application G2M et le serveur KoboToolbox.
L'application doit pouvoir lister les questionnaires disponibles et télécharger les soumissions existantes pour les stocker dans sa propre base.

Peux-tu créer ou utiliser un compte technique dédié, lui donner un accès en lecture aux formulaires concernés, puis me transmettre l'URL du serveur KoboToolbox, le token API et les UID des formulaires à synchroniser ?

Merci de limiter les droits au strict nécessaire, idéalement lecture seule.
```

**À retenir :** je ne demande pas un accès administrateur général. Je demande un accès technique limité aux formulaires utiles au projet.

## 2. Ce que je dois faire à mon niveau

De mon côté, je dois préparer l'application pour utiliser les informations fournies par Bly sans exposer de secrets.

Étapes à réaliser dans G2M :

1. Prévoir une logique d'appel vers l'API KoboToolbox v2.
2. Utiliser une URL de serveur configurable, par exemple `https://kf.kobotoolbox.org` ou l'URL réelle du serveur administré par Bly.
3. Utiliser un jeton API transmis dans l'en-tête HTTP, sous la forme :

```text
Authorization: Token <JETON_API>
```

4. Ne jamais écrire le jeton API en clair dans le code source.
5. Ne jamais versionner le fichier `.env`.
6. Déclarer les paramètres sensibles comme variables d'environnement dans Render :

```text
KOBO_BASE_URL=<URL_DU_SERVEUR_KOBO>
KOBO_API_TOKEN=<JETON_API_FOURNI_PAR_BLY>
KOBO_ASSET_UID=<UID_FORMULAIRE_PAR_DEFAUT_SI_NECESSAIRE>
KOBO_MISSION_ID=<ID_MISSION_G2M_ASSOCIEE_SI_NECESSAIRE>
```

7. Tester d'abord la connexion sans importer les données.
8. Lister les formulaires accessibles pour vérifier que les droits sont corrects.
9. Lancer une synchronisation en mode simulation avant toute écriture en base.
10. Importer les soumissions uniquement après validation du mapping des champs importants : coordonnées GPS, code agent, date de soumission, identifiant de soumission.

Dans l'interface G2M, les paramètres peuvent être saisis dans :

```text
Paramétrages > KoboToolbox
```

Cette interface permet de tester la connexion, charger la liste des formulaires et lancer une synchronisation. Pour Render, la configuration durable doit rester dans les variables d'environnement.

**À retenir :** le token API est un secret. Il doit être stocké dans Render ou saisi temporairement dans l'interface d'administration, mais jamais placé dans GitHub.

## 3. Ce que Bly doit faire sur KoboToolbox

Bly doit préparer l'accès côté KoboToolbox en limitant les droits au strict nécessaire.

Étapes recommandées :

1. Se connecter à l'interface KoboToolbox avec un compte administrateur ou propriétaire des formulaires.
2. Créer un compte technique dédié, par exemple :

```text
g2m-api-reader
```

3. Éviter d'utiliser le compte personnel d'un agent ou d'un administrateur pour l'intégration API.
4. Donner au compte technique l'accès aux questionnaires concernés.
5. Vérifier que le compte peut consulter les formulaires nécessaires.
6. Vérifier que le compte peut lire les soumissions déjà collectées.
7. Limiter les droits à la lecture si cela suffit :

- lecture du formulaire ;
- lecture des soumissions ;
- pas de suppression ;
- pas de modification du formulaire ;
- pas de modification des données collectées.

8. Générer ou récupérer le token API du compte technique.
9. Identifier les UID des formulaires à connecter à G2M.

Pour retrouver l'UID d'un formulaire, Bly peut ouvrir le questionnaire dans KoboToolbox. L'UID apparaît généralement dans l'URL ou dans les informations techniques du formulaire. Il ressemble à une chaîne courte de type :

```text
aBcDeF123GhIjK456
```

10. Vérifier que les formulaires sont bien déployés et que des soumissions existent si un test de récupération est attendu.

Points de contrôle côté KoboToolbox :

- Le compte technique peut-il voir le formulaire ?
- Le compte technique peut-il accéder aux données ?
- Le formulaire est-il déployé ?
- Les soumissions sont-elles visibles dans l'onglet Données ?
- Les droits sont-ils limités au périmètre du projet ?

**À retenir :** un compte technique dédié facilite la sécurité, la traçabilité et la révocation future de l'accès API sans perturber les comptes personnels.

## 4. Ce que Bly doit me communiquer en retour

Une fois la configuration réalisée, Bly doit me transmettre les informations nécessaires à la connexion.

Éléments à fournir :

| Élément | Exemple | Commentaire |
| --- | --- | --- |
| URL du serveur KoboToolbox | `https://kf.kobotoolbox.org` | Utiliser l'URL réelle du serveur administré |
| Token API | à transmettre par canal sécurisé | Ne pas envoyer dans un document public |
| UID du formulaire | `aBcDeF123GhIjK456` | Un UID par questionnaire |
| Nom lisible du formulaire | `Enquête sites - vague 1` | Utile pour l'association dans G2M |
| Compte technique utilisé | `g2m-api-reader` | Pour la traçabilité |
| Niveau de droits accordé | Lecture formulaire + lecture soumissions | Confirmer que les droits sont suffisants |

Recommandations pour la transmission :

- Transmettre le token API par un canal sécurisé, par exemple appel direct, coffre de mots de passe, message chiffré ou canal interne validé.
- Éviter d'envoyer le token dans un document Word, un courriel non sécurisé ou un fil de discussion partagé.
- Ne jamais publier le token dans GitHub, WhatsApp de groupe, ticket public ou document accessible à plusieurs personnes.
- En cas de doute, régénérer le token et révoquer l'ancien.

Exemple de retour attendu de Bly :

```text
URL KoboToolbox : https://kf.kobotoolbox.org
Compte technique : g2m-api-reader
Droits : lecture des formulaires et lecture des soumissions

Formulaires :
- Enquête sites - vague 1 : aBcDeF123GhIjK456
- Enquête ménages - vague 1 : zYxWvU987TsRqP654

Token API : transmis séparément par canal sécurisé.
```

## Vérification conjointe

Après réception des informations, je réalise les tests suivants dans G2M :

1. Saisir l'URL KoboToolbox et le token API dans l'interface d'administration ou les variables Render.
2. Cliquer sur **Tester la connexion**.
3. Cliquer sur **Charger les formulaires**.
4. Vérifier que les formulaires attendus apparaissent.
5. Associer un formulaire Kobo à une mission G2M.
6. Lancer une synchronisation en mode simulation.
7. Contrôler le nombre de soumissions lues et les éventuelles erreurs.
8. Lancer l'import réel uniquement après validation.

**À retenir :** la première synchronisation doit être faite prudemment, idéalement en mode simulation, afin de vérifier le mapping des champs avant écriture dans la base G2M.
