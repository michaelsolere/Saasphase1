# Audit — génération groupée des documents depuis un groupe de portées

## Objet et décision synthétique

Cet audit cadre l’extension future de la génération groupée du certificat d’engagement et du contrat de réservation à `/litter-groups/[id]`. Il ne décrit aucun support déjà disponible sur cette page et n’implique, dans ce lot, ni code applicatif, ni migration, ni changement de données.

La recommandation est de construire un **orchestrateur de groupe mince** au-dessus du noyau existant par portée. Une réservation ne doit être sélectionnable que si elle possède une portée exacte non supprimée, appartenant actuellement au groupe demandé, dans la même organisation, et si son propre couple `litter_id` / `litter_group_id` concorde avec cette portée et ce groupe. Les réservations encore liées au groupe seul restent affichées, mais désactivées avec un motif neutre.

Les modèles doivent être choisis par taxonomie effective normalisée `species + breed` : un certificat et un contrat communs par taxonomie, réutilisables par plusieurs portées de même taxonomie. Une taxonomie incomplètement couverte ne doit pas bloquer les taxonomies valides ; seuls ses dossiers sont désactivés.

Le schéma actuel et l’idempotence actuelle suffisent. Aucune table d’opération persistante et aucune migration ne sont nécessaires.

## Sources inspectées et constats existants

L’audit porte notamment sur :

- la fiche Groupe `src/app/litter-groups/[id]/page.tsx` ;
- les tables `litter_groups`, `litters`, `applications`, `reservations` et `documents` dans les migrations métier et documentaires ;
- `updateLitterGroupAssignment`, `attachReservationToScope` et `syncReservationScopeFromApplication` ;
- `litter-reservation-document-batch-core.ts` et son enveloppe serveur ;
- l’action compatible `useActionState` et son intention liée ;
- la section et le panneau actuels de `/litters/[id]` ;
- la compatibilité des modèles, la résolution des variantes, la préparation des snapshots, l’orchestrateur PDF et les contraintes documentaires ;
- les tests introduits par les PR **#291**, **#293** et **#294**.

Constats structurants :

- `litter_groups` porte `species`, mais pas `breed`. Chaque `litter` porte les deux. `applications` et `reservations` portent également une taxonomie, mais la génération actuelle résout la taxonomie documentaire effective dans l’ordre `animal → litter → application` ; les colonnes de taxonomie de la réservation ne font pas autorité dans ce résolveur.
- Les clés étrangères composites empêchent le rattachement normal d’une portée, d’une candidature ou d’une réservation à un objet d’une autre organisation. Elles ne garantissent toutefois pas que le groupe enregistré sur une réservation est le groupe courant de sa portée exacte.
- Les actions récentes de rattachement à une portée copient autoritairement `litter.litter_group_id` dans la réservation. À l’inverse, modifier le groupe d’une portée avec `updateLitterGroupAssignment` ne déplace pas ses réservations. Des données historiques peuvent donc devenir divergentes sans violer le schéma.
- La fiche Groupe charge actuellement ses portées via `litter_group_id = id` et ses réservations affichées via `reservation_overview.litter_group_id = id`. Cette dernière lecture ne suffit pas pour un traitement documentaire sûr : elle manque une réservation dont la portée appartient au groupe mais dont le groupe de réservation est absent, et elle inclut une réservation qui prétend appartenir au groupe alors que sa portée est étrangère.
- La génération groupée par portée déduit l’organisation de la portée, exige le rôle d’écriture, déduplique en conservant l’ordre, limite à 30 entrées, relit chaque réservation, impose actuellement `pre_reservation_paid`, une candidature et un contact cohérents, puis traite certificat avant contrat de façon séquentielle.
- L’action de la PR #293 lie côté serveur `litterId`, `operationId` et `capturedAt`. Le formulaire ne fournit que confirmation, réservations et deux modèles communs. Les champs techniques forgés sont ignorés.
- L’interface de la PR #294 est placée sur la fiche Portée immédiatement après les réservations et avant les campagnes d’e-mails. Elle sépare lecture et écriture selon le rôle, verrouille la configuration soumise, permet le rejeu exact et exige un rechargement pour une nouvelle opération.
- Un document individuel généré conserve `litter_id`, mais `documents.litter_group_id` doit rester `null` pour le certificat et le contrat. Le groupe utile au contenu est photographié dans le snapshot. Les contraintes courantes imposent un seul document non supprimé et non remplacé par réservation et type.

## 1. Périmètre des réservations

### Classification recommandée

L’orchestrateur doit distinguer les cas suivants après relecture serveur.

| Classe | État relu | Affichage | Sélection |
| --- | --- | --- | --- |
| Groupe seul | `reservation.litter_group_id = groupId` et `reservation.litter_id = null` | Oui, portée « non attribuée » | Non |
| Portée exacte cohérente | la portée existe, n’est pas supprimée, appartient au groupe et à son organisation ; `reservation.litter_id = litter.id` et `reservation.litter_group_id = litter.litter_group_id = groupId` | Oui | Oui, sous réserve des autres règles du noyau et des modèles |
| Portée étrangère | `reservation.litter_group_id = groupId`, mais la portée relue appartient à un autre groupe ou à aucun groupe | Oui, comme anomalie neutre | Non |
| Groupe absent ou différent | la portée relue appartient au groupe, mais `reservation.litter_group_id` est `null` ou différent | Oui, comme anomalie neutre | Non |
| Portée supprimée ou introuvable | un `litter_id` existe mais sa portée est supprimée logiquement ou ne peut être relue de façon cohérente | Oui si le dossier est retrouvé par l’union | Non |
| Organisation incohérente | groupe, portée ou réservation ne concordent pas sur l’organisation | Ne jamais exposer d’information étrangère ; résultat neutre si une sélection obsolète est soumise | Non |

La règle recommandée est donc confirmée :

> La génération depuis un groupe n’est possible que pour une réservation disposant d’une portée exacte non supprimée appartenant réellement au groupe, avec un rattachement réservation/portée/groupe cohérent.

Pour un dossier groupe-seul, le texte d’interface doit rester neutre, par exemple : « Une portée précise doit être attribuée avant la génération. » Pour une incohérence, préférer : « Le rattachement de ce dossier doit être vérifié avant la génération. » Il ne faut pas détailler des identifiants ni révéler une portée étrangère inaccessible.

### Lecture la plus sûre

Un seul des deux filtres possibles est insuffisant :

- `reservations.litter_group_id = groupId` retrouve les dossiers groupe-seul et les portées prétendument liées, mais manque les groupes absents ou divergents ;
- `reservations.litter_id IN (portées du groupe)` retrouve les dossiers dont la portée dit appartenir au groupe, mais manque les dossiers groupe-seul et les portées étrangères revendiquant le groupe.

Il faut lire une **union**, limitée à l’organisation déduite du groupe :

1. relire le groupe non supprimé et son organisation ;
2. relire les identifiants de toutes les portées dont `litter_group_id = groupId`, y compris les portées supprimées pour pouvoir classer explicitement les liens historiques ;
3. lire les réservations non supprimées satisfaisant `litter_group_id = groupId OR litter_id IN (ces identifiants)` ;
4. dédupliquer les lignes ;
5. relire les portées et relations nécessaires, puis classifier côté serveur.

Cette union couvre les divergences observables sans prétendre reconstruire un rattachement historique qui n’existe plus dans les données. Une portée anciennement rattachée au groupe, déplacée depuis, n’appartient plus au périmètre sauf si la réservation porte encore `groupId` ; dans ce dernier cas elle est visible et incohérente, jamais sélectionnable.

Une sélection soumise doit être intégralement relue et reclassifiée. L’état affiché par le client n’est jamais une preuve d’éligibilité.

## 2. Taxonomies, modèles communs et variantes

### Comparaison des stratégies

| Stratégie | Avantage | Limite | Décision |
| --- | --- | --- | --- |
| Un couple pour tout le groupe | Interface simple | Impossible dès que deux races existent ; le groupe ne porte pas la race et la compatibilité exige type + espèce + race | Rejetée |
| Un couple par portée | Conforme à la taxonomie de la portée | Répète les mêmes choix pour plusieurs portées identiques et augmente le risque d’écart humain | Acceptable techniquement, non recommandée |
| Un couple par `species + breed` | Respecte la compatibilité existante et mutualise les choix entre portées identiques | Exige un regroupement et un récapitulatif explicites | Recommandée |

Le groupe ne peut donc pas imposer un couple unique. Le serveur doit calculer la taxonomie effective avec le résolveur documentaire existant afin de ne pas créer une seconde sémantique : `animal`, sinon `litter`, sinon `application`. Dans le cas normal d’une réservation sans animal ou d’un animal cohérent, la portée exacte fournit la taxonomie. `reservations.species` et `reservations.breed` peuvent aider au diagnostic, mais ne doivent pas remplacer cette résolution existante.

La clé de regroupement doit utiliser la même normalisation que la compatibilité actuelle (espaces retirés aux extrémités, accents neutralisés, casse française neutralisée), tout en affichant les libellés relus. Le serveur vérifie pour chaque modèle : organisation, publication active non supprimée, format JSON, `document_type`, `species` et `breed` compatibles.

Chaque taxonomie doit recevoir exactement :

- un modèle commun publié de type `commitment_certificate` ;
- un modèle commun publié de type `reservation_contract`.

Le choix reste celui des **modèles communs**. Pour chaque réservation, le résolveur existant cherche ensuite une variante publiée appartenant à la famille choisie. Une variante publiée valide devient la source effective ; une variante publiée invalide bloque le document concerné sans repli silencieux. Une variante ne dispense donc jamais de choisir le modèle commun d’origine.

Si une taxonomie ne possède pas les deux modèles compatibles, seuls les dossiers de cette taxonomie sont désactivés. Les autres taxonomies peuvent être sélectionnées et générées. Bloquer tout le groupe pénaliserait des dossiers indépendants et contredirait la tolérance aux résultats partiels du noyau actuel. La confirmation doit omettre les dossiers désactivés et signaler le nombre de dossiers non disponibles par taxonomie.

## 3. Architecture serveur recommandée

### Orchestrateur de groupe

L’architecture proposée est adaptée :

```text
orchestrateur groupe
  → authentification, rôle, groupe et organisation
  → union de lecture et classification autoritaire
  → déduplication globale et limite globale
  → taxonomies effectives et validation des choix de modèles
  → plan stable par portée exacte + taxonomie
  → appels séquentiels au noyau existant par portée
  → agrégation dans l’ordre de sélection initial
```

Le noyau par portée peut rester **inchangé**. L’orchestrateur lui transmet des sous-ensembles qui partagent tous la même portée exacte et la même taxonomie, avec le couple de modèles correspondant. Si une portée contient exceptionnellement plusieurs taxonomies effectives, elle produit plusieurs sous-appels pour cette même portée ; cette subdivision est nécessaire car le contrat actuel du noyau reçoit un seul couple de modèles.

Les règles d’exécution sont :

- appliquer la limite de **30 réservations sur toute l’opération de groupe**, avant partition ; ce n’est jamais 30 par portée ni 30 par taxonomie ;
- normaliser et dédupliquer globalement les UUID en conservant la première occurrence ;
- conserver l’ordre initial des réservations dans le résultat final, même si leur traitement est partitionné ;
- former les sous-appels selon l’ordre de première apparition de leur clé `(litterId, taxonomyKey)` dans la sélection ; dans chaque sous-appel, conserver l’ordre initial des réservations ;
- exécuter les sous-appels séquentiellement, sans parallélisme ;
- transmettre le même `operationId` et le même `capturedAt` à tous les sous-appels ;
- conserver dans chaque dossier l’ordre certificat puis contrat et la prévalidation du couple avant premier stockage lorsqu’ils sont tous deux absents ;
- conserver `currentDocumentPolicy: "create_only"` : aucun remplacement, aucune nouvelle version automatique ;
- ne créer ni e-mail, ni tentative d’envoi, ni paiement ;
- continuer après une erreur locale et agréger un statut global `success`, `partial` ou `error` ;
- retourner les compteurs globaux existants, des agrégats par portée, puis les résultats par réservation. Un agrégat par portée peut sommer plusieurs sous-appels de taxonomies différentes.

L’agrégateur doit préallouer les emplacements selon la sélection dédupliquée, injecter les résultats de sous-appels par `reservationId`, puis produire le tableau final dans cet ordre. Les dossiers refusés lors de la classification initiale reçoivent directement un résultat neutre et ne sont jamais envoyés au noyau.

### Idempotence et identifiants

Les identifiants actuels sont dérivés de :

```text
organisation + operationId + reservationId + documentType
```

Ils restent adaptés à l’orchestrateur de groupe. Une réservation sélectionnable ne possède qu’une portée exacte au moment de la relecture ; ajouter le groupe, la portée ou la taxonomie à l’identifiant créerait au contraire une possibilité de doublon documentaire pour la même opération et la même réservation.

Le libellé interne de domaine `litter_reservation_document_batch` utilisé par la dérivation n’empêche pas la réutilisation : il désigne une génération de réservations de portée, et l’orchestrateur de groupe appelle précisément ce mécanisme. Le même `operationId`, le même `capturedAt`, les mêmes modèles communs et les mêmes identifiants de réservation permettent un rejeu exact. Les contrôles de snapshot V2 vérifient en plus la sélection du modèle commun, son origine exacte et la version de variante éventuelle.

Un rejeu partiel doit réutiliser l’intention et la configuration verrouillées. Une nouvelle opération obtient de nouveaux `operationId` et `capturedAt` seulement après rechargement explicite.

## 4. Contrat d’entrée minimal

### Intention liée côté serveur

L’action future doit être liée au minimum à :

```ts
type LitterGroupDocumentBatchIntention = {
  litterGroupId: string;
  operationId: string;
  capturedAt: string;
};
```

Ces valeurs sont créées côté serveur au rendu, validées strictement par l’action et jamais lues depuis le `FormData`. L’organisation est déduite après relecture du groupe.

### Données permises dans le formulaire

Un contrat minimal peut être :

```ts
type SubmittedTaxonomyTemplates = {
  taxonomyKey: string;
  commitmentTemplateId: string;
  contractTemplateId: string;
};

type LitterGroupDocumentBatchForm = {
  reservationIds: string[];
  templateSelections: SubmittedTaxonomyTemplates[];
  confirmation: "confirmed";
};
```

`taxonomyKey` n’est qu’une clé de correspondance d’interface. Elle ne fait pas autorité : le serveur recalcule la taxonomie effective de chaque réservation, normalise sa propre clé, exige une unique sélection correspondante et revérifie les deux modèles. Une clé absente, dupliquée, inconnue ou incompatible rend les dossiers de cette taxonomie non traitables ; elle ne change jamais leur taxonomie.

Le client ne doit pas transmettre comme autorité, y compris dans des champs cachés :

- `organizationId` ;
- un identifiant de document ;
- un identifiant ou une version de variante ;
- le `litterId` effectif d’une réservation ;
- `species` ou `breed` effectifs ;
- un chemin Storage, un hash, un snapshot ou une version documentaire.

Le serveur relit pour chaque identifiant sélectionné la réservation, le contact, la candidature, la portée exacte, son groupe actuel, l’animal éventuel, les documents courants, la taxonomie effective, les modèles et les variantes. La confirmation doit être exactement `confirmed`, comme dans l’action actuelle.

## 5. Interface proposée sur `/litter-groups/[id]`

La future section doit reprendre les garanties ergonomiques de la fiche Portée tout en rendant les dimensions portée et taxonomie visibles.

### Contenu

- afficher toutes les réservations non supprimées trouvées par l’union de périmètre ;
- afficher pour chacune le contact, le statut, la portée exacte ou « non attribuée », la taxonomie effective et les états courants du certificat et du contrat ;
- laisser visibles mais désactiver les dossiers groupe-seul, incohérents, inéligibles selon le noyau ou privés d’un couple complet de modèles ;
- utiliser des raisons neutres sans UUID ni détail de données étrangères ;
- limiter la sélection globale à 30, compteur visible compris ;
- regrouper visuellement d’abord par taxonomie, puis par portée au sein de chaque taxonomie. Cette hiérarchie place les sélecteurs de modèles au niveau où ils s’appliquent, tout en gardant la portée immédiatement lisible ;
- fournir un sélecteur de certificat et un sélecteur de contrat pour chaque taxonomie ;
- rappeler que les variantes publiées sont résolues automatiquement par réservation ;
- proposer une confirmation listant le nombre total de dossiers, les portées concernées, chaque taxonomie, les deux modèles et leurs versions, ainsi que les dossiers désactivés exclus ;
- après exécution, afficher le statut et les compteurs globaux, des sous-totaux par portée, puis chaque réservation avec les deux résultats ;
- verrouiller réservations, clés de taxonomie et modèles après la première soumission ;
- proposer le rejeu exact de la même opération en cas de résultat partiel ou d’erreur, et une nouvelle opération uniquement par rechargement explicite.

### Emplacement

La section est recommandée **immédiatement après « Réservations liées à ce groupe » et avant « Campagnes d’e-mails »**. Cet ordre reproduit celui validé sur `/litters/[id]` : le périmètre métier est visible avant l’action documentaire, puis les campagnes restent en aval. Sur la fiche Groupe actuelle, cela implique de déplacer visuellement la section « Réservations liées » avant « Campagnes d’e-mails » ou, à défaut, d’insérer la génération juste après les réservations à la fin et de déplacer les campagnes après elle. L’ordre cible doit être : portées → candidatures → réservations → génération documentaire → campagnes.

## 6. Permissions et sécurité

Les permissions existantes sont conservées :

- `owner`, `admin` et `member` peuvent lancer la génération ;
- `viewer` voit une section en lecture seule, sans formulaire de mutation ;
- le groupe non supprimé est relu après authentification ; son organisation fait foi ;
- une adhésion active d’écriture à cette organisation est exigée par l’orchestrateur, puis à nouveau par les services existants ;
- groupe, portées, réservations, relations, taxonomies, modèles, variantes et documents courants sont relus côté serveur ;
- les champs cachés ou paramètres forgés ne sont jamais des autorités ;
- aucune réservation dont la portée est extérieure au groupe, supprimée ou incohérente n’atteint le noyau ;
- le résultat public ne contient aucun identifiant de document ou de variante, chemin Storage, hash, octet PDF, snapshot, erreur Supabase ou détail SQL ;
- l’interface ne doit pas afficher le nom ou l’identifiant d’un objet étranger lorsque sa cohérence d’organisation n’est pas établie.

La RLS reste une défense complémentaire, pas le mécanisme de classification métier.

## 7. Schéma et migrations

**Aucune migration n’est nécessaire.**

Les invariants indispensables sont déjà assurés ou peuvent l’être dans les services : organisation par clés composites et RLS, unicité du document courant par réservation et type, chaînes de remplacement, origine exacte du modèle et de la variante, snapshots immuables, statut des documents envoyés/signés et stockage privé.

La cohérence dynamique `reservation.litter_group_id = litter.litter_group_id` ne doit pas être ajoutée comme contrainte SQL dans ce lot : elle dépend de deux lignes, peut être affectée par le déplacement volontaire d’une portée et nécessite précisément une classification des données legacy. L’orchestrateur peut la garantir avant chaque génération sans modifier les données.

Une table persistante d’opération n’est pas requise : l’intention liée, les identifiants documentaires déterministes, `capturedAt`, les snapshots et la configuration verrouillée côté client pendant la vie de l’opération suffisent au rejeu actuel. Une persistance ne deviendrait pertinente que pour un besoin distinct de reprise après fermeture de page ou d’historique d’opérations, absent du périmètre demandé.

## 8. Découpage recommandé et tests attendus

### Lot 1 — core pur de classification et planification

Créer des types et fonctions pures qui reçoivent groupe, portées, réservations et taxonomies relues, puis produisent : classes, sélectionnabilité, déduplication, limite globale, clés normalisées et plan stable `(portée, taxonomie)`.

Tests : trois classes principales, groupe absent/différent, portée étrangère, portée supprimée, organisation incohérente neutralisée, taxonomies multiples, même taxonomie sur plusieurs portées, plusieurs taxonomies sur une portée, doublons et casse des UUID, ordre initial, limite 30 globale et taxonomie sans paire complète.

### Lot 2 — orchestrateur serveur de groupe

Relire le groupe et son organisation, construire l’union, classifier, valider les modèles, appeler séquentiellement le noyau inchangé et agréger les résultats globaux/par portée/par réservation.

Tests : permissions, groupe étranger ou supprimé, relecture autoritaire, aucune portée extérieure, sous-appels stables, même `operationId`/`capturedAt`, certificat avant contrat, idempotence et concurrence, `create_only`, résultat partiel par taxonomie, variantes valides/invalides, snapshots cohérents, aucune fuite, aucun e-mail/paiement et hard-delete vérifié de toutes les fixtures.

### Lot 3 — action liée `useActionState`

Lier l’intention groupe, valider confirmation, sélection globale et choix par taxonomie, ignorer les champs techniques forgés, appeler l’orchestrateur et revalider les chemins utiles.

Tests : intention et date invalides, confirmation exacte, zéro et plus de 30 entrées, choix manquant/dupliqué/invalide, conservation de l’ordre, champs forgés ignorés, résultat détaillé sans donnée technique et revalidations seulement après `success` ou `partial`.

### Lot 4 — interface Groupe

Ajouter la section en lecture/écriture selon le rôle, l’union visible et classifiée, les groupes taxonomie/portée, les sélecteurs, la confirmation, les résultats agrégés, le verrouillage, le rejeu et le rechargement.

Tests : placement entre réservations et campagnes, viewer en lecture seule, tous les cas désactivés visibles, limite 30 globale, modèles filtrés par taxonomie, absence de champs d’autorité, annulation sans effet, résultats globaux/par portée/par dossier, rejeu exact, nouvelle opération, aucune fuite, aucun paiement/e-mail et nettoyage physique contrôlé.

### Lot 5 — journal projet

Mettre à jour `docs/PROJECT_LOG.md` seulement après intégration et validation des lots applicatifs, avec les invariants réellement livrés et les limites restantes.

Tests : relecture documentaire contre le code et les tests intégrés ; aucun comportement futur présenté comme déjà disponible.

## Couverture apportée par les PR #291, #293 et #294

Les tests existants fournissent une base réutilisable :

- **#291 — noyau** : authentification et rôles, portée/organisation autoritaires, entrée et limite 30, dossiers étrangers/supprimés/inéligibles, ordre et déduplication, génération et rejeu idempotent, concurrence, variantes, prévalidation de la paire, modèles incompatibles, document déjà présent/protégé/incohérent, poursuite après erreur, absence de remplacement, données sensibles absentes et nettoyage physique des fixtures/objets Storage ;
- **#293 — action** : intention liée valide, confirmation exacte, sélection et limite, UUID de modèles, ordre transmis, champs forgés ignorés, retour détaillé sans donnée technique et revalidation conditionnelle ;
- **#294 — interface** : viewer en lecture seule, placement après réservations et avant campagnes, périmètre exact de portée, raisons neutres, filtrage des modèles publiés compatibles, absence de champs techniques, limite 30, confirmation, ordre certificat/contrat, verrouillage, nouvelle opération, rejeu exact, résultat partiel, variantes invalides, absence d’e-mail/paiement et cleanup.

L’extension Groupe doit conserver ces tests et ajouter les axes absents : union des deux rattachements, classification des divergences, limite globale à travers plusieurs portées, couples par taxonomie, ordre des sous-appels et agrégats par portée.

## Décision recommandée

- **Réservations sélectionnables** : uniquement celles qui ont une portée exacte non supprimée appartenant actuellement au groupe, dans la même organisation, avec `reservation.litter_group_id = litter.litter_group_id = groupId`, puis qui satisfont les conditions existantes du noyau. Les dossiers groupe-seul et incohérents restent visibles et désactivés.
- **Lecture du périmètre** : union de `reservation.litter_group_id = groupId` et `reservation.litter_id` appartenant aux portées déclarées du groupe, y compris les portées supprimées pour classification, puis relecture et classification autoritaires côté serveur.
- **Choix des modèles** : un certificat et un contrat communs publiés par taxonomie effective normalisée `species + breed`, réutilisés entre portées identiques ; seules les taxonomies sans paire complète sont désactivées. Les variantes individuelles restent résolues automatiquement par le service existant.
- **Réutilisation du noyau** : noyau par portée inchangé, appelé séquentiellement pour chaque plan `(portée, taxonomie)`, avec une limite et une déduplication appliquées globalement en amont et une agrégation réordonnée comme la sélection initiale.
- **Idempotence** : même `operationId` et même `capturedAt` pour tous les sous-appels ; identifiants actuels organisation + opération + réservation + type conservés ; politique `create_only`, configuration verrouillée et rejeu exact.
- **Migration** : aucune.
- **Premier lot suivant** : le core pur de classification et planification du groupe, sans accès Supabase ni interface. Il fixe les cas legacy, l’ordre, la limite globale et la partition par taxonomie avant toute mutation applicative.
