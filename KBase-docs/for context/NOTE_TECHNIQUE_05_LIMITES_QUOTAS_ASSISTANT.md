# Note technique - Limites de quotas d'utilisation de l'assistant

## 1. Objet de la note

Cette note restitue l'essentiel des échanges concernant les messages de limitation d'usage affichés par l'environnement d'assistance, notamment les indicateurs `5h limit` et `Weekly limit`.

Ces messages ne concernent pas l'application G2M, ni Render, ni GitHub, ni Node.js. Ils relèvent uniquement de la plateforme d'assistance utilisée pour accompagner le développement.

## 2. Message d'alerte observé

Le message suivant a été observé :

```text
Heads up, you have less than 25% of your 5h limit left. Run /status for a breakdown.
```

Il signifie que l'utilisateur approche de la limite d'utilisation autorisée sur une période courte de cinq heures. L'alerte indique qu'il reste moins de 25 % du quota disponible sur cette fenêtre.

La commande `/status`, lorsqu'elle est disponible dans l'environnement, permet généralement d'afficher un détail de consommation : quota utilisé, quota restant, limite courte durée et limite hebdomadaire.

## 3. Signification de `5h limit`

L'indicateur `5h limit` correspond à une limite d'utilisation mesurée sur une période courte, généralement une fenêtre de cinq heures.

Cette limite vise à encadrer l'usage intensif continu de l'assistant. Lorsqu'elle est presque atteinte, certaines actions peuvent devenir temporairement limitées jusqu'à ce qu'une partie du quota redevienne disponible.

Cette limite est indépendante du projet en cours. Elle ne traduit donc aucune erreur dans le code de l'application G2M.

## 4. Signification de `Weekly limit`

L'indicateur `Weekly limit` correspond à une limite d'utilisation cumulée sur la semaine.

Il s'agit d'un plafond global, calculé sur une période hebdomadaire. Même si la limite de cinq heures n'est pas atteinte, une limite hebdomadaire consommée peut restreindre l'usage de l'assistant jusqu'au renouvellement du quota.

Cette limite dépend généralement de l'offre, de l'abonnement, du compte utilisateur ou des règles définies par la plateforme.

## 5. Fenêtre de renouvellement automatique

Le renouvellement automatique de la fenêtre signifie que le quota peut se reconstituer progressivement avec le temps.

Dans le cas d'une fenêtre glissante de cinq heures, la plateforme ne regarde pas nécessairement l'usage depuis le début de la journée. Elle peut analyser l'usage sur les cinq dernières heures.

Exemple :

- si une utilisation importante a lieu entre 10h00 et 11h00 ;
- elle compte dans la fenêtre observée jusqu'aux alentours de 15h00 ou 16h00 ;
- lorsque cette période sort de la fenêtre de calcul, une partie du quota redevient disponible.

Le même principe peut exister pour la limite hebdomadaire, selon les règles exactes de la plateforme : semaine fixe ou période glissante de sept jours.

## 6. Que faire lorsque la limite approche ?

Lorsque l'alerte apparaît, il est recommandé de :

- exécuter `/status` si cette commande est disponible ;
- identifier si la contrainte porte sur la fenêtre de cinq heures ou sur la limite hebdomadaire ;
- prioriser les tâches urgentes ou critiques ;
- reporter les tâches longues si le quota restant est faible ;
- travailler par lots courts : analyse, implémentation, test, documentation ;
- attendre le renouvellement automatique si la limite courte durée est seule concernée.

## 7. Possibilités d'augmentation des limites

L'augmentation des limites ne se fait généralement pas depuis le projet local ni depuis l'application G2M.

Elle dépend plutôt :

- du type de compte utilisé ;
- de l'abonnement associé ;
- des règles de quota de la plateforme ;
- des paramètres d'un espace de travail d'équipe ou d'entreprise.

Si l'environnement est administré par une organisation, il peut être nécessaire de contacter l'administrateur ou le support de la plateforme pour vérifier les options disponibles.

## 8. À retenir

Les indicateurs `5h limit` et `Weekly limit` sont des limites d'utilisation de l'assistant.

Ils ne signalent pas une anomalie technique dans G2M.

Le `5h limit` est une limite de court terme, utile pour encadrer l'utilisation intensive.

Le `Weekly limit` est une limite globale sur la semaine.

La commande `/status` permet de suivre la consommation lorsque l'environnement la propose.

En cas de quota faible, la bonne pratique consiste à découper les travaux, prioriser les actions importantes et reprendre les tâches moins urgentes après renouvellement du quota.
