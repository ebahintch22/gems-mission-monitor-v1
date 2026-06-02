# Guide pratique V2 - Accès API KoboToolbox pour G2M

**Destinataire :** Bly, administrateur ou propriétaire des formulaires KoboToolbox  
**Objet :** permettre à l'application G2M, déployée sur Render, de consulter les questionnaires KoboToolbox et de télécharger les soumissions existantes dans sa propre base de données.  
**Précision V2 :** le compte technique dédié `g2m_api_reader` a déjà été créé de mon côté. Bly n'a donc pas à créer ce compte ; il doit surtout lui donner les droits nécessaires sur les formulaires KoboToolbox concernés.

Ce guide décrit les tâches à réaliser pour mettre en place un accès API propre, sécurisé et réutilisable entre KoboToolbox et l'application de supervision des enquêtes CAPI G2M.

## 1. Ce que je dois communiquer à Bly

Je dois transmettre à Bly les informations nécessaires pour qu'il identifie clairement l'application, le besoin et le compte technique à autoriser.

Informations à communiquer :

- **Nom de l'application :** G2M - GEMS Mission Monitor.
- **Type d'application :** application web Node.js / Express, déployée sur Render.
- **Objectif de l'accès API :** consulter la liste des questionnaires disponibles et télécharger les soumissions existantes dans la base de données interne de G2M.
- **Mode d'accès souhaité :** API KoboToolbox v2 avec jeton d'authentification.
- **Compte technique déjà créé :** `g2m_api_reader`.
- **Type de droits demandés :** lecture des formulaires et lecture des soumissions.
- **Périmètre demandé :** uniquement les questionnaires liés aux enquêtes suivies dans G2M.

Exemple de message à envoyer à Bly :

```text
Bonjour Bly,

J'ai créé le compte technique KoboToolbox suivant pour l'intégration avec G2M :
g2m_api_reader

L'application G2M doit pouvoir lister les questionnaires disponibles et télécharger les soumissions existantes pour les stocker dans sa propre base de données.

Peux-tu partager avec ce compte les formulaires concernés, en lui donnant uniquement les droits nécessaires : lecture du formulaire et lecture des soumissions ?

Peux-tu également me confirmer l'URL du serveur KoboToolbox et me transmettre les UID des formulaires à synchroniser ?
Le token API sera généré depuis le compte technique g2m_api_reader.
```

**À retenir :** Bly n'a pas besoin de créer le compte technique. Il doit autoriser le compte `g2m_api_reader` sur les formulaires dont il est propriétaire ou administrateur.

## 2. Ce que je dois faire à mon niveau

De mon côté, je dois préparer l'application G2M et gérer le compte technique sans exposer de secret.

Étapes à réaliser :

1. Créer ou vérifier l'existence du compte KoboToolbox `g2m_api_reader`.
2. Conserver les identifiants du compte dans un endroit sécurisé.
3. Demander à Bly de partager les formulaires utiles avec ce compte.
4. Générer le token API depuis le compte `g2m_api_reader`, une fois les droits accordés.
5. Configurer G2M avec l'URL KoboToolbox et le token API.
6. Ne jamais écrire le token API dans le code source.
7. Ne jamais versionner le fichier `.env`.
8. Déclarer les paramètres sensibles dans Render :

```text
KOBO_BASE_URL=<URL_DU_SERVEUR_KOBO>
KOBO_API_TOKEN=<TOKEN_DU_COMPTE_g2m_api_reader>
KOBO_ASSET_UID=<UID_FORMULAIRE_PAR_DEFAUT_SI_NECESSAIRE>
KOBO_MISSION_ID=<ID_MISSION_G2M_ASSOCIEE_SI_NECESSAIRE>
```

9. Tester d'abord la connexion sans importer les données.
10. Charger la liste des formulaires pour vérifier que les droits sont bien actifs.
11. Lancer une synchronisation en mode simulation.
12. Importer les soumissions uniquement après validation du mapping des champs importants : coordonnées GPS, code agent, date de soumission et identifiant de soumission.

Dans l'interface G2M, les paramètres peuvent être saisis dans :

```text
Paramétrages > KoboToolbox
```

Cette interface permet de saisir l'URL KoboToolbox, saisir temporairement le token API, tester la connexion, charger la liste des formulaires et lancer une synchronisation. Pour Render, la configuration durable doit rester dans les variables d'environnement.

**À retenir :** le token API du compte `g2m_api_reader` est un secret. Il doit être stocké dans Render ou saisi temporairement dans l'interface d'administration, mais jamais placé dans GitHub.

## 3. Ce que Bly doit faire sur KoboToolbox

Bly doit intervenir sur les formulaires KoboToolbox pour donner au compte `g2m_api_reader` les droits nécessaires.

Étapes recommandées pour Bly :

1. Se connecter à KoboToolbox avec son compte propriétaire ou administrateur des formulaires.
2. Ouvrir chaque formulaire concerné par l'intégration G2M.
3. Accéder aux paramètres de partage ou de permissions du formulaire.
4. Ajouter le compte technique suivant :

```text
g2m_api_reader
```

5. Attribuer à ce compte les droits nécessaires, idéalement limités à :

- voir le formulaire ;
- lire les soumissions ;
- exporter ou consulter les données si ce droit est nécessaire à l'API ;
- ne pas modifier le formulaire ;
- ne pas supprimer les données ;
- ne pas administrer le projet.

6. Vérifier que le formulaire est bien déployé.
7. Vérifier que les soumissions sont disponibles dans l'onglet Données.
8. Identifier l'UID de chaque formulaire à synchroniser.

Pour retrouver l'UID d'un formulaire, Bly peut ouvrir le questionnaire dans KoboToolbox. L'UID apparaît généralement dans l'URL ou dans les informations techniques du formulaire. Il ressemble à une chaîne de type :

```text
aBcDeF123GhIjK456
```

Points de contrôle côté Bly :

- Le compte `g2m_api_reader` est-il bien ajouté au formulaire ?
- Dispose-t-il du droit de lecture des soumissions ?
- Le formulaire est-il déployé ?
- Les soumissions attendues existent-elles ?
- Les droits sont-ils limités au strict nécessaire ?

**À retenir :** le rôle principal de Bly est de partager les bons formulaires avec `g2m_api_reader` et de confirmer les UID. Le compte technique existe déjà.

## 4. Ce que Bly doit me communiquer en retour

Une fois les droits accordés, Bly doit me transmettre les informations permettant de finaliser la configuration dans G2M.

Éléments à fournir :

| Élément | Exemple | Commentaire |
| --- | --- | --- |
| URL du serveur KoboToolbox | `https://kf.kobotoolbox.org` | Utiliser l'URL réelle du serveur |
| Compte autorisé | `g2m_api_reader` | Confirmer que ce compte a bien accès aux formulaires |
| UID du formulaire | `aBcDeF123GhIjK456` | Un UID par questionnaire |
| Nom lisible du formulaire | `Enquête sites - vague 1` | Utile pour l'association dans G2M |
| Droits accordés | Lecture formulaire + lecture soumissions | Confirmer que les droits sont suffisants |
| Liste des formulaires partagés | noms + UID | Permet de préparer l'association formulaire-mission |

Le token API n'a pas nécessairement à être transmis par Bly si je peux me connecter moi-même au compte `g2m_api_reader` pour le générer. Si Bly doit exceptionnellement transmettre un token, il doit le faire par canal sécurisé.

Recommandations de sécurité :

- Ne pas envoyer le token API dans un document Word ou un courriel non sécurisé.
- Ne pas publier le token dans GitHub, WhatsApp de groupe, ticket public ou document partagé.
- Utiliser un canal sécurisé : coffre de mots de passe, appel direct, message chiffré ou canal interne validé.
- En cas de doute, régénérer le token et révoquer l'ancien.

Exemple de retour attendu de Bly :

```text
URL KoboToolbox : https://kf.kobotoolbox.org
Compte autorisé : g2m_api_reader
Droits : lecture des formulaires et lecture des soumissions

Formulaires partagés :
- Enquête sites - vague 1 : aBcDeF123GhIjK456
- Enquête ménages - vague 1 : zYxWvU987TsRqP654

Le compte g2m_api_reader a été ajouté aux formulaires ci-dessus.
```

## Vérification conjointe

Après confirmation de Bly, je réalise les tests suivants dans G2M :

1. Me connecter au compte `g2m_api_reader` si nécessaire et générer son token API.
2. Saisir l'URL KoboToolbox et le token API dans l'interface G2M ou dans les variables Render.
3. Cliquer sur **Tester la connexion**.
4. Cliquer sur **Charger les formulaires**.
5. Vérifier que les formulaires partagés par Bly apparaissent.
6. Associer chaque formulaire Kobo à la mission G2M correspondante.
7. Lancer une synchronisation en mode simulation.
8. Contrôler le nombre de soumissions lues et les éventuelles erreurs.
9. Lancer l'import réel uniquement après validation.

**À retenir :** la première synchronisation doit être réalisée prudemment, idéalement en mode simulation, afin de vérifier les droits d'accès et le mapping des champs avant écriture dans la base G2M.
