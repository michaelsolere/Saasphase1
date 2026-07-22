# Journal de reprise — SaaS élevage

Ce document décrit l’état utile du projet autour du SHA de base vérifié. Il privilégie les invariants, les capacités réellement disponibles et les limites connues à une chronologie exhaustive des PR.

## Référence du projet

- Dépôt : `michaelsolere/Saasphase1`.
- Branche de référence : `main`.
- SHA de base vérifié avant ce lot : `4969ce94b46f00cb728fb97aa849e4888f029640`.
- La dernière migration incluse est `202607220003_maternal_temperature_drop_policy`.
- Stack : Next.js 16 / React 19, TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL, Auth et Storage), déploiement cible Vercel.

## Architecture et règles métier

Le produit est multi-organisation. Les données métier portent un `organization_id`, sont protégées par RLS et sont accessibles selon l’adhésion active et le rôle de l’utilisateur. Les mutations sensibles restent validées côté serveur ; les liens entre objets d’une organisation sont renforcés par des contraintes et clés étrangères composites lorsque nécessaire.

Le modèle repose sur une **fiche Contact unique**. Il ne faut jamais créer de tables séparées `prospects` et `adoptants`. Le parcours central est :

`Contact → Candidature → Réservation → Paiements/Documents → Animal attribué → Adoption → Suivi post-adoption`

Le premier contact peut venir d’un formulaire public générique : la soumission crée ou rapproche le contact puis crée la candidature, sans imposer une saisie manuelle préalable par l’éleveur. Les formulaires publics Phase 1 ne reposent pas sur des liens individuels tokenisés.

Le produit est construit d’abord pour les chiens, tout en conservant `species` pour une extension future aux chats. Les valeurs par défaut restent `dog` et `Golden Retriever`. Stripe, Clerk, la synchronisation Google Agenda et le journal de mise bas offline-first restent hors Phase 1.

## État des modules métier

### Contacts

- Fiche unique pour l’identité, les coordonnées, les rôles, notes, candidatures, réservations, paiements et documents liés.
- Création manuelle ou issue du parcours de formulaire public, avec contrôle des doublons et traitement des soumissions suspectes.
- Édition dédiée avec autorisations d’écriture et confirmations liées aux valeurs effectivement soumises.

### Candidatures

- Création depuis une soumission publique ou depuis un contact existant.
- Qualification, transitions de statut, motifs et notes internes.
- Rattachement à une portée ou à un groupe de portées, puis continuité vers la pré-réservation et la réservation sans dupliquer le contact.

### Réservations et parcours adoptant

- La fiche Réservation est le centre opérationnel du dossier adoptant : contact, candidature, portée ou groupe, animal, paiements, documents, notes, historique et prochaines actions.
- Le parcours couvre notamment brouillon, activation, pré-réservation demandée/payée, confirmation après naissance, attribution d’un animal, préparation de l’adoption et états finaux.
- Les actions sensibles sont explicites et protégées contre les incohérences ou doublons : demandes de paiement, marquage payé, attribution d’animal, annulation, expiration, retrait et adoption.
- Le parcours de pré-réservation gère une première demande d’arrhes puis le complément, avec compensation lorsque l’envoi transactionnel échoue de manière certaine.

### Portées et groupes de portées

- Les groupes structurent une période ou campagne lorsque la portée exacte n’est pas encore arrêtée ; les candidatures et réservations peuvent ensuite être rattachées à une portée précise.
- Les portées portent les parents, dates et événements d’élevage, candidatures/réservations associées, campagnes et animaux nés.
- Les règles d’éligibilité parentale et la cohérence des rattachements sont contrôlées.
- Les animaux nés d’une portée sont toujours créés dans `animals`, jamais dans une table dédiée. Ils peuvent être créés administrativement depuis la fiche Portée lorsqu’aucune naissance issue du Journal n’existe, ou être créés atomiquement par le Journal lors de l’enregistrement d’une naissance. Les protections serveur interdisent de mélanger ces deux modes pour une même portée.

### Journal des portées

Le Journal des portées est directement accessible depuis **Portées → Journal**, à l’adresse `/litters/journal`. Le paramètre optionnel `?litter=<uuid>` permet d’ouvrir directement une portée précise, mais n’est plus le seul moyen d’accéder au Journal. La page permet de sélectionner une portée active et réunit son contexte reproductif, sa synthèse, les observations maternelles et les tâches de suivi sans surcharger la fiche Portée.

Dans la sidebar privée, la rubrique **Portées** présente, dans cet ordre, **Actuelles**, **Journal** et **Passées**. Sur `/litters/journal`, la rubrique est déployée, **Journal** est l’entrée active et **Actuelles** ne l’est pas. La PR #328 ajoute exclusivement cet accès de navigation, sans modification métier ni changement de base de données.

Capacités actuellement disponibles :

- sélection d’une portée active, contexte reproductif et synthèse opérationnelle ;
- observations maternelles structurées, horodatées et historisées ;
- tâches manuelles avec date prévue, puis résolution explicite en `done`, `cancelled` ou `not_applicable` ;
- séparation des tâches à faire et de l’historique, avec calcul du retard local dans le navigateur ;
- modèles de jalons personnalisés par organisation, paramétrables dans `/settings/litter-care-task-templates` ;
- bibliothèque recommandée consultable et importable explicitement depuis cette même page ;
- planification de chaque modèle selon six états : `ready`, `already_generated`, `missing_anchor`, `inactive`, `species_mismatch` ou `breed_mismatch` ;
- sélection vide par défaut, puis génération partielle des seuls jalons choisis après confirmation explicite ;
- aucune tâche ni autre donnée créée au chargement de la page.

#### Courbe descriptive des températures maternelles

Le panneau **Suivi de la mère** présente désormais, avant l’historique textuel
intégral, une courbe chronologique construite exclusivement depuis les
observations maternelles de type `temperature` déjà autorisées et chargées. Il
n’ajoute aucune lecture Supabase. Les valeurs saisies en Fahrenheit sont
converties en Celsius uniquement pour harmoniser l’axe graphique, selon
`°C = (°F − 32) × 5 / 9` ; la valeur et l’unité d’origine restent disponibles
dans le titre accessible de chaque point.

La synthèse affiche la dernière mesure, la précédente, leur écart et leur
intervalle observé, le nombre de mesures ainsi que les minimum et maximum
réellement mesurés. Les segments droits relient uniquement les observations
successives : aucun point artificiel, interpolation ou extrapolation n’est
créé. Le module ne contient aucun seuil clinique et ne produit ni diagnostic,
ni prédiction de mise-bas, ni détection automatique, ni alerte ou recommandation
de soin. L’appréciation affichée reste strictement la valeur `routine`, `watch`,
`concern` ou `urgent` saisie par l’éleveur. Le rôle `viewer` accède à la courbe,
à la synthèse et à l’historique en lecture seule. Le DTO transmis au panneau ne
contient aucun UUID, auteur, identifiant de commande ou identifiant de base.

#### Repère personnel de baisse de température maternelle

Chaque organisation peut activer indépendamment un repère personnel V1 dans
`/settings/organization`. Sa politique contient exclusivement sa version, un
nombre de 2 à 10 mesures de référence et une baisse minimale de 0,1 à 3,0 °C,
avec au maximum deux décimales. L’absence de politique désactive le repère. Les
valeurs proposées lors de la première activation sont présentées comme un
simple exemple modifiable et jamais comme un seuil vétérinaire.

Pour la dernière température réelle valide, le calcul l’exclut toujours de sa
propre référence, retient les N températures immédiatement précédentes et
exige l’historique complet. La référence est leur médiane : valeur centrale
pour un nombre impair, moyenne des deux valeurs centrales pour un nombre pair.
Les valeurs Fahrenheit sont harmonisées en Celsius avant ce calcul, selon la
même conversion que la courbe. Aucune interpolation, pondération,
extrapolation ou heure prévue de mise-bas n’intervient.

Le Journal distingue les états désactivé, paramètre momentanément indisponible,
historique insuffisant, repère non atteint et repère atteint. Dans le dernier
cas seulement, le dernier segment réel est différencié par un motif, et le
dernier point reçoit un double contour ; les anciens points et toute la courbe
historique restent inchangés. Le texte donne la référence récente, la dernière
mesure, la variation ou la baisse observée et le seuil personnel configuré.

Ce repère matérialise uniquement une variation selon les paramètres de
l’éleveur. Il ne prédit pas automatiquement le moment de la mise-bas, ne classe
aucune température comme normale ou anormale et n’impose aucun seuil médical.
Les rôles `owner` et `admin` peuvent modifier la politique ; `member` et
`viewer` la consultent en lecture seule. Une erreur de lecture ou une valeur
persistée invalide est isolée : les observations et la courbe restent visibles,
et le repère est neutralisé avec une indication neutre.

Les repères disponibles sont `first_mating`, `estimated_ovulation`, `expected_birth`, `actual_birth` et `offspring_age`. Le repère `offspring_age` utilise exclusivement la naissance réelle comme ancre. Si l’ancre requise manque, seule la tâche concernée reste en `missing_anchor` : aucun autre repère n’est utilisé comme fallback silencieux.

#### Sessions, chronologie, naissances et poids de mise-bas

Le Journal repose sur `whelping_sessions`, `whelping_events`, `whelping_births`, `animal_weight_measurements` et le registre privé `whelping_commands`. Une seule session peut être ouverte par portée ; son fuseau IANA est conservé. Les commandes serveur d’ouverture, d’ajout d’événement, de clôture et de réouverture restent idempotentes. Les événements génériques autorisés — début du travail, contractions, rupture de la poche des eaux, placenta, allaitement, appel vétérinaire, intervention et observation — ainsi que les événements spécialisés — `birth`, créé exclusivement par `record_whelping_birth`, `session_closed`, créé exclusivement par la commande de clôture, et `session_reopened`, créé exclusivement par la commande de réouverture — forment une chronologie append-only ordonnée côté serveur. Tous les membres actifs peuvent lire le Journal ; l’écriture est réservée aux rôles `owner`, `admin` et `member`, avec neutralisation inter-organisation.

##### Server Actions de mise-bas

La PR #326 a introduit quatre Server Actions minces pour ouvrir une session, ajouter un événement générique, enregistrer une naissance atomique et clôturer la session. La réouverture ajoute une cinquième action mince selon les mêmes conventions. La correction et l’annulation ajoutent deux actions liées à une intention serveur contenant exactement la portée, la session, la naissance, l’Animal, la révision attendue et la clé idempotente. Elles restent de simples adaptateurs vers les services et commandes métier existants.

Les intentions liées côté serveur portent la portée, la session lorsqu’elle existe et la clé idempotente. Aucun identifiant structurant ni aucune révision n’est accepté depuis les champs du formulaire. Les actions valident notamment les timestamps avec offset explicite, le fuseau IANA, les types fermés, le poids et la cohérence entre poids et heure de pesée. Elles traduisent les erreurs métier en messages neutres, limitent les revalidations aux routes utiles et ne retournent aucun UUID technique au navigateur. Une révision périmée conserve le dialogue et ses valeurs afin d’interdire tout écrasement concurrent silencieux.

##### Interface opérationnelle

La PR #327 expose un panneau de mise-bas responsive dans le Journal, avant le suivi maternel. Le chargement sélectionne la session ouverte ou, à défaut, la session clôturée la plus récente. L’état vide propose un démarrage explicite. Une session ouverte affiche son badge, son heure de début, son fuseau et le nombre de naissances enregistrées.

Le formulaire **+ ENREGISTRER UNE NAISSANCE** permet de saisir le sexe, la viabilité, la couleur initiale, le poids facultatif, l’heure de pesée associée et une note dans le Journal complet. Une interface unique permet également d’ajouter les huit types d’événements génériques autorisés. La clôture exige une confirmation explicite. Une session clôturée peut être rouverte explicitement avec un motif court obligatoire : la même session repasse à l’état ouvert, l’ancienne clôture reste visible et un événement `session_reopened` est ajouté avant la reprise des naissances et événements. Chaque nouvelle clôture ajoute un nouvel événement `session_closed`. Le rôle `viewer` reste strictement en lecture seule.

##### Naissance express dans le mode mobile privé

Le mode privé `/whelping` distingue désormais explicitement son expérience de
celle du Journal complet. Il présente en premier **+ NAISSANCE MÂLE** et
**+ NAISSANCE FEMELLE**, tandis que `/litters/journal` conserve le formulaire
détaillé comme action principale et n’affiche pas ces boutons express. L’action
secondaire **Saisir tous les détails** reste disponible dans le mode mobile pour
un sexe incertain, un mort-né ou toute situation particulière.

Chaque appui express capture `new Date().toISOString()` dans le gestionnaire de
soumission, au moment du clic. Les intentions mâle, femelle et saisie complète
possèdent chacune leur propre clé idempotente liée côté serveur. Toutes trois
réutilisent exclusivement `recordWhelpingBirthAction` et la commande atomique
existante : l’ordre est attribué côté serveur, puis l’événement initial `birth`,
la naissance structurée, le même Animal et les projections existantes sont
créés dans la transaction actuelle. Aucun nom, couleur, poids ou note n’est
inventé. La viabilité reste `unknown`, donc elle n’est comptée ni vivante ni
mort-née ; le compteur du sexe choisi et le total augmentent immédiatement.

Une naissance encore incomplète expose **Compléter la naissance**. Le dialogue
réutilise la correction auditée existante avec la même naissance, le même
Animal, le même ordre et le même événement initial. Il préremplit les valeurs
connues et le motif visible **Complément après naissance express**. Le sexe reste
modifiable pour corriger un mauvais appui ; la viabilité, la couleur, le poids,
ses informations de pesée et les notes peuvent être complétés selon les
invariants existants. La correction ajoute son événement spécialisé et recalcule
les projections sans créer une seconde naissance.

Près des champs de poids du formulaire complet et du dialogue de complément,
le texte rappelle que la dictée native du clavier du téléphone peut être
utilisée lorsqu’elle est disponible. Ce lot n’ajoute ni Web Speech API, ni
permission microphone, ni audio, ni transcription intégrée. Le fonctionnement
reste strictement online-only. Il n’ajoute aucune migration, RPC, dépendance,
table, modification de manifest ou logique de service worker.

Sous les boutons express, `/whelping` affiche une file **Naissances à
compléter** réservée au mode mobile. Elle contient, de la plus récente à la plus
ancienne, chaque naissance active à laquelle manque le poids de naissance ou
le collier initial. La viabilité `unknown` ne suffit pas à maintenir une
naissance dans cette file. La carte la plus récente est ouverte par défaut ;
**Plus tard** la replie seulement dans le navigateur, sans écriture ni marquage
métier, et sa ligne compacte reste disponible.

Cette interface ajoute un poids, un collier ou les deux sans réexposer la date
de naissance, le sexe, la viabilité, les notes, les identifiants structurants
ni la révision. Le poids reste facultatif et son heure est capturée avec
`new Date().toISOString()` au moment exact de la soumission. Un poids déjà
présent est affiché en lecture seule et ne peut être remplacé par l’action
rapide ; il en va de même pour une couleur existante. Une sauvegarde partielle
laisse la carte dans la file tant que l’autre donnée manque.

La palette V1 est locale et fixe : Rouge, Bleu, Vert, Jaune, Orange, Rose,
Violet, Turquoise, Blanc, Noir et Autre. Chaque choix associe un repère visuel,
un libellé et un état accessible. **Autre** conserve un libellé métier libre,
trimé et limité à 255 caractères. La palette configurable par organisation est
reportée.

Les couleurs des autres naissances actives sont comparées après trim et sans
tenir compte de la casse. L’interface indique le numéro de naissance concerné
et exige **Utiliser quand même cette couleur**. Ce consentement est revalidé
côté serveur après une nouvelle lecture autoritative des naissances actives ;
il s’agit d’une aide contre les erreurs, pas d’une garantie transactionnelle ni
d’une contrainte SQL.

L’action serveur dédiée reste un adaptateur restreint vers la correction
auditée et son registre idempotent existants. Elle relit la naissance, la
session, la portée, l’Animal, la révision, le poids et les couleurs, refuse tout
écrasement, puis réinjecte exactement l’heure de naissance, le sexe, la
viabilité et les notes existants. Le motif fixe est **Complément rapide du poids
et du collier**. La même naissance, le même Animal, le même ordre et l’événement
initial `birth` sont conservés ; un seul événement `birth_corrected` est ajouté
par commande et l’unique mesure `birth` est créée seulement si un poids manque
et est fourni. La règle existante propage le collier initial au collier courant
uniquement si celui-ci est encore vide ou égal à l’ancien collier initial, afin
de ne pas écraser une modification ultérieure.

Le Journal complet conserve son formulaire détaillé, le dialogue **Compléter la
naissance / Corriger** et sa chronologie sans afficher la file rapide. Les
viewers restent en lecture seule. Ce complément est online-only et n’ajoute ni
migration, ni RPC, ni table, ni dépendance, ni mode hors ligne, ni modification
du manifest, du proxy ou du service worker.

La migration `202607200002_reopen_whelping_session` ajoute cette commande atomique dédiée, la protection d’immutabilité du passage `closed → open`, ainsi que l’idempotence stricte et la sérialisation concurrente associées.

Si le chargement des sessions, événements ou naissances n’est pas fiable, le panneau affiche un état neutre et ne rend aucune commande d’écriture. Aucune naissance ni aucun événement n’est ajouté optimistement à l’état React : après une mutation réussie, les données sont relues à la suite des revalidations serveur.

##### Chronologie unique

La chronologie est construite à partir de `whelping_events`, dans l’ordre de `sequence_no`. Lorsqu’un événement est de type `birth`, il est enrichi par sa ligne structurée `whelping_births` et n’est jamais doublé par un second affichage de la naissance. L’entrée peut ainsi présenter l’ordre de naissance, le sexe, la viabilité, la couleur initiale, le poids et l’heure de pesée.

Une relation de naissance incohérente ne fait pas planter le panneau : l’événement reste visible avec un avertissement neutre indiquant que les détails sont indisponibles. Aucun UUID technique n’est affiché dans l’interface.

##### Naissance atomique

La commande serveur dédiée `record_whelping_birth` exige une session ouverte et crée dans une transaction unique :

- l’événement de mise-bas `birth` ;
- la naissance structurée dans `whelping_births` ;
- l’animal unique dans `animals` ;
- sa mesure de poids de naissance lorsqu’un poids est fourni ;
- les projections de synthèse de la portée ;
- le résultat idempotent exact dans `whelping_commands`.

L’organisation, la portée, la mère, le père, l’espèce et la race sont toujours relus côté serveur. La commande accepte uniquement le sexe, la viabilité, l’heure observée, une couleur initiale facultative et un poids facultatif avec son heure de pesée distincte. Aucun nom d’animal n’est inventé. Un animal vivant est créé avec le statut `born` ; un mort-né avec le statut `stillborn` et sa date de décès.

L’ordre de naissance et l’ordre de chronologie sont alloués côté serveur sous verrou. La concurrence est sérialisée, un rejeu strictement identique rend les mêmes identifiants et ordres sans doublon, et la réutilisation conflictuelle d’un identifiant de commande est refusée.

`occurred_at` reste l’heure métier de la naissance. La date et l’heure projetées sur l’animal sont calculées dans le fuseau de la session. `litters.actual_birth_date` correspond au jour civil local de la première naissance et ne se décale pas si la mise-bas se poursuit après minuit.

Les projections `actual_birth_date`, `born_total_count`, `born_male_count`, `born_female_count` et `alive_count` sont recalculées exclusivement depuis les naissances du Journal. Le statut de la portée n’est jamais modifié automatiquement.

##### Poids de naissance

`animal_weight_measurements` est la source de vérité des poids ; `animals.birth_weight_grams` n’est qu’une projection de compatibilité. Le poids de naissance est facultatif lors de la création. Une mesure `birth` est liée à la naissance et à son animal exact, avec une heure de pesée indépendante de l’heure de naissance. L’historique est append-only.

Un poids manquant peut être complété après la naissance, y compris lorsque la session de mise-bas est clôturée. Seul le passage `null → valeur` est autorisé : la commande ajoute l’unique mesure `birth` et sa projection de compatibilité, sans créer ni modifier d’événement, d’ordre, de compteur ou de statut de portée. Un rejeu strictement identique est idempotent ; la réutilisation de l’intention avec une valeur différente est refusée. Les rôles `owner`, `admin` et `member` peuvent effectuer le complément, tandis que `viewer` reste en lecture seule.

La **PR #330** apporte cette fondation serveur et la migration `202607190004_whelping_birth_weight_completion`. La **PR #331** expose l’interface de complément du poids depuis le panneau de mise-bas.

##### Rectification des naissances

Les migrations `202607200003_litter_weight_adjustment_foundation`, `202607200004_litter_weight_adjustment_history_read`, `202607200005_whelping_birth_adjustment_foundation` et `202607220001_whelping_birth_adjustment_history_read` constituent les fondations de rectification des pesées et des naissances, puis leurs lectures d’audit expurgées.

La migration `202607200005_whelping_birth_adjustment_foundation` ajoute deux commandes serveur atomiques et idempotentes. Une correction, possible sur une session ouverte ou clôturée, met à jour l’état effectif de la naissance, les projections de l’Animal, l’unique ligne de poids de naissance et les agrégats de portée, tout en laissant strictement intact l’événement `birth` initial. Chaque rectification ajoute un événement spécialisé `birth_corrected` ou `birth_cancelled` et une entrée dans un registre privé append-only avec révisions optimistes et snapshots avant/après.

Une annulation est limitée à la dernière naissance active de toute la portée et ne modifie jamais son ordre. Elle soft-delete l’Animal, neutralise le poids de naissance sans supprimer sa ligne et recalcule les compteurs sans suppression physique d’aucune ligne métier. Toute donnée ultérieure liée à l’Animal bloque l’opération ; les dépendances vers `animals` sont inventoriées par un test de schéma qui échoue si une FK non classée apparaît. L’ordre de naissance et l’événement initial restent immuables. Une prochaine naissance peut reprendre l’ordre libéré.

Le panneau distingue les naissances annulées, utilise l’état effectif séparé de l’événement initial et exclut les annulations du compteur actif. Les rôles `owner`, `admin` et `member` peuvent corriger chaque naissance active et annuler uniquement la dernière naissance active de la portée ; `viewer` reste en lecture seule. Les actions sont liées côté serveur et l’éligibilité d’annulation est calculée depuis toutes les sessions de la portée, la RPC restant l’autorité finale.

La lecture `202607220001` expose au plus 100 rectifications, triées de la plus récente à la plus ancienne, sous forme d’un DTO métier plat sans UUID, commande, révision, auteur ni snapshot. Elle projette uniquement les anciennes et nouvelles valeurs effectives ainsi que la nature de l’évolution du poids ; un poids annulé n’est jamais présenté comme actif. Le registre privé demeure inaccessible directement. Son échec est isolé du chargement de la chronologie, et tous les membres actifs, dont `viewer`, peuvent consulter le bloc replié **Historique des compléments et rectifications**.

La chronologie synthétique distingue désormais les événements métier de l’historique d’audit exhaustif. Les seuls événements `birth_corrected` dont le motif est exactement le motif système du complément rapide du poids et du collier sont masqués visuellement dans la chronologie partagée de `/whelping` et du Journal complet. Leurs événements et commandes restent physiquement conservés en base et demeurent présentés dans l’historique repliable avec un intitulé de complément adapté aux champs ajoutés. Toutes les véritables corrections manuelles et les annulations restent visibles dans les deux vues. Après ce filtrage d’affichage, la chronologie utilise une numérotation visible continue sans modifier le `sequence_no` d’audit stocké. Cette évolution de projection ne requiert aucune migration, RPC, table ou dépendance.

Le rejeu d’une ancienne commande strictement identique reste idempotent et restitue son résultat d’origine ; la réutilisation de sa clé avec une intention différente reste conflictuelle. Une commande fondée sur une révision devenue obsolète est refusée avant toute écriture.

##### Pesées collectives et historique

La **PR #332** ajoute la fondation serveur et la migration `202607190005_litter_routine_weighing_foundation`. Chaque pesée collective crée une ligne immutable dans `litter_weighing_sessions` et des mesures `routine` append-only dans `animal_weight_measurements`. Le registre privé `litter_weight_commands` conserve l’intention et le résultat pour rendre les rejeux strictement identiques idempotents et refuser les réutilisations conflictuelles.

La RPC atomique accepte de 1 à 30 animaux et autorise une séance partielle. Elle revalide l’organisation, la portée et chaque animal ; un animal déjà pesé ne peut plus être déplacé vers une autre portée. La pesée fonctionne indépendamment de l’existence d’une session de mise-bas. Les rôles `owner`, `admin` et `member` disposent de l’écriture, tandis que `viewer` conserve une lecture seule stricte.

La **PR #333** ajoute le formulaire collectif mobile-first et les historiques. Aucun UUID structurant n’est transmis par les champs HTML : les animaux restent liés à l’intention serveur. Le panneau présente l’historique des séances et l’historique individuel de chaque animal. Le poids de naissance déclaré dans `animals.birth_weight_grams` reste affiché séparément des mesures réelles. Le compteur historique d’une séance reste stable lorsqu’un animal est ensuite soft-delete.

La migration `202607200003_litter_weight_adjustment_foundation` prépare la rectification sécurisée des seules mesures `routine`. Une correction conserve l’identifiant, l’animal, la séance et l’heure de mesure ; elle modifie uniquement le poids ou la note et incrémente une révision optimiste. Une annulation individuelle ou collective ne supprime aucune ligne : elle marque la mesure ou la séance, conserve ses valeurs originales et incrémente les révisions concernées.

Chaque commande est atomique, strictement idempotente et inscrite dans un registre privé append-only avec son motif et ses snapshots avant/après. Les séances et mesures annulées sont exclues des historiques courants, statistiques, comparaisons de séances, planning, tableaux, graphiques et comparaison inter-portées. L’heure d’une séance n’est pas modifiable dans ce lot : une heure erronée se traite par annulation complète puis recréation, possible au même instant. L’interface permet de corriger ou d’annuler les mesures `routine`, d’annuler une séance complète et de consulter l’historique expurgé des rectifications ; `viewer` conserve une lecture seule stricte.

##### Courbes de croissance

La **PR #334** ajoute les premières courbes de croissance avec deux vues : **Portée entière** et **Un animal**. Le rendu utilise un SVG React natif, sans bibliothèque graphique. Seules les mesures réelles `birth` et `routine` sont tracées ; `animals.birth_weight_grams` ne crée jamais de point fictif.

L’axe horizontal repose sur la date et l’heure réelles de chaque mesure, dans le fuseau local de l’appareil, et l’axe vertical exprime le poids en grammes. Les points successifs sont reliés sans lissage, interpolation, extrapolation ni diagnostic. Un cercle distingue une mesure de naissance et un carré une pesée de routine. La légende reste lisible sans UUID et la sélection individuelle utilise un index non technique. Le rendu est accessible, responsive à 375 px et disponible en lecture seule pour `viewer`.

##### Repères et analyses descriptives

Le suivi complète les courbes par une architecture descriptive cohérente, sans seuil de santé ni interprétation de la croissance :

- chaque animal dispose de son dernier poids réel et de sa date, du nombre de mesures réelles, de l’écart avec la mesure précédente et de l’intervalle observé entre ses deux dernières mesures ; une information manquante produit un état neutre ;
- la vue graphique **Progression relative** exprime le pourcentage de progression proportionnelle depuis l’unique mesure réelle `birth` de chaque animal. L’indice base 100 vaut `poids mesuré / poids réel de naissance × 100`, et la progression vaut `indice − 100`. Le temps écoulé est propre à chaque animal depuis sa mesure de naissance, ce qui permet une comparaison indépendante du poids de départ, sans interpolation ni extrapolation ;
- la synthèse de la dernière séance présente son compteur, sa moyenne, son minimum et son maximum, calculés exclusivement depuis les mesures `routine` réellement liées à cette séance. Une séance partielle est valide et signalée comme telle ; une séance vide conserve des statistiques indisponibles ;
- les deux dernières séances `routine` non vides sont comparées sur leur groupe commun, défini comme l’intersection des animaux pesés lors des deux séances. Les moyennes sont recalculées uniquement sur ce groupe. L’amplitude est l’écart entre le poids minimum et le poids maximum ; l’interface affiche l’évolution de la moyenne et de l’amplitude.

Avec moins de deux séances non vides ou sans animal commun, la comparaison reste dans un état neutre. Les valeurs historiques par séance et leur comparaison sont calculées depuis le relevé complet des mesures liées aux séances, indépendamment de la liste des animaux actuellement visibles : compteurs, statistiques et comparaison restent donc stables après le soft-delete d’un animal. Les séances partielles restent valides.

`animal_weight_measurements` demeure la source de vérité. Les mesures réelles `birth` restent append-only ; une mesure `routine` ne peut être corrigée ou annulée que par les RPC auditées et révisionnées dédiées, sans suppression physique. `animals.birth_weight_grams` reste une projection ou un repère déclaré séparé et n’est jamais utilisé comme fallback pour la progression relative. Sans mesure réelle `birth`, l’animal est exclu de la courbe relative avec un état neutre. Ces capacités sont accessibles en lecture seule à `viewer` et ne produisent ni classement, seuil, pourcentage d’évolution entre séances, alerte, diagnostic ou interprétation vétérinaire.

###### Comparaison inter-portées par âge réel

La comparaison inter-portées repose sur les mesures réellement observées et conserve les invariants suivants :

- **PR #341 — normalisation depuis la naissance réelle** : le moteur pur `buildAnimalWeightRelativeSeries` exige exactement une mesure réelle `birth`, valide et strictement positive, sans fallback vers `animals.birth_weight_grams`. Le temps écoulé part du timestamp réel de naissance ; l’indice vaut `poids / poids naissance × 100` et la naissance vaut exactement 100. Les mesures antérieures sont exclues. Le tri est déterministe, sans mutation des entrées ni dépendance à l’heure courante.
- **PR #342 — modèle par âge réel** : `ageDay = floor(elapsedMilliseconds / 86_400_000)` définit des périodes réelles de 24 heures propres à chaque animal. Un animal contribue au maximum une fois par jour, avec sa dernière mesure réelle du jour. Aucun jour artificiel n’est créé et aucune interpolation, extrapolation ou reprise du dernier poids n’est appliquée. Le poids moyen et l’indice relatif moyen utilisent le même groupe réellement observé ; la couverture distingue explicitement les effectifs total, éligible, exclu et observé.
- **PR #343 — lecture serveur sécurisée** : la sélection porte sur 2 à 5 portées et l’autorisation globale produit un résultat tout ou rien. Une même organisation, espèce et race est exigée, avec race comparée après `trim()` sans tenir compte de la casse, et une adhésion active est vérifiée. Seuls les animaux `ownership_status = produced` sont lus ; les mort-nés sont exclus, tandis que les animaux produits soft-delete restent dans l’historique. Les animaux sans naissance réelle sont comptés mais exclus du modèle. La lecture est limitée à 150 animaux, paginée par pages de 500 et bornée à 25 000 mesures avec détection du dépassement ; la cohérence entre animal, séance et portée est contrôlée. Le DTO public ne contient aucun UUID ni identifiant technique.
- **PR #344 — interface descriptive** : la route dédiée `/litters/journal/comparison`, reliée depuis le Journal, charge seulement un catalogue serveur léger ; les taxonomies vides sont exclues avant indexation. La sélection, vide initialement, accepte 2 à 5 portées compatibles et exige une soumission explicite avant tout chargement des poids. Le snapshot privé `index → UUID` est capturé dans la Server Action ; aucun UUID n’apparaît dans le DOM, l’URL, les champs HTML ou l’état React. La synthèse responsive présente les effectifs total, éligible et exclu, les journées réellement observées, la couverture par point, le poids moyen, l’indice relatif moyen base 100 et la progression relative moyenne. Le rôle `viewer` y accède en lecture seule.
- **PR #346 — graphique comparatif inter-portées** : après soumission, `/litters/journal/comparison` affiche avant les tableaux descriptifs conservés un SVG React fondé exclusivement sur le DTO déjà retourné, sans nouvelle lecture serveur ni modification de ce DTO. Un modèle graphique pur et déterministe construit les domaines, graduations et projections pour les vues **Poids moyen** et **Indice base 100**. L’axe horizontal utilise les `ageDay` réellement présents ; chaque portée produit une série, avec un marqueur par journée observée et des segments uniquement entre les points réellement fournis. Aucune interpolation, extrapolation, reprise du dernier poids ou valeur artificielle n’est créée. Le repère horizontal 100 est une base strictement mathématique, sans signification clinique. Couleurs, motifs de trait et formes de marqueur distinguent les séries ; chaque point porte un titre accessible avec la portée, le jour, la valeur et la couverture. Une portée sans point est signalée mais non tracée. Le rôle `viewer` reste en lecture seule et aucun UUID n’apparaît dans le DOM, l’URL ou les données publiques.

##### Protections

- un ordre de naissance actif est unique dans une portée, et la migration échoue explicitement si son audit détecte des doublons préexistants ;
- une naissance Journal est refusée si la portée possède déjà des animaux produits administrativement ; inversement, la création administrative est refusée pendant une session ouverte ou après une naissance Journal ;
- le parentage, l’espèce et la race de la portée sont verrouillés pendant une session ouverte et après une naissance Journal ;
- les projections de naissance de l’animal ainsi que la date réelle et les compteurs de la portée sont protégés contre les modifications directes ;
- la couleur actuelle et les futurs statuts de parcours de l’animal restent évolutifs ;
- aucune naissance n’est projetée dans la table générique `events`.

##### Limites actuelles

- aucun module de mesures cliniques individuelles des chiots ni interprétation vétérinaire automatique n’est disponible ;
- la recommandation de pesée couvre J0 à J30 quotidiennement, puis J31 à J60 tous les trois jours. Le planning est calculé depuis l’historique réel : une mesure observée satisfait le jalon correspondant, sans créer de séance ni de mesure artificielle ;
- chaque portée née conserve un snapshot de la politique effective afin que sa cadence historique ne change pas lorsqu’une organisation personnalise ensuite ses phases. Les rôles autorisés peuvent personnaliser la politique de l’organisation ou revenir à la recommandation ;
- la comparaison inter-portées dispose désormais d’une synthèse descriptive et de graphiques en poids moyen et indice base 100 ; aucune courbe de référence de race n’est disponible ;
- aucune interpolation, alerte, seuil ou interprétation vétérinaire n’est disponible ;
- aucune dictée structurée de phrase complète n’est disponible ; la dictée du clavier natif reste utilisable comme toute saisie de formulaire ;
- le statut de la portée n’est jamais modifié automatiquement.

Le Journal complet reste responsive dans le navigateur. Le mode autonome `/whelping` constitue une fondation PWA installable dédiée à la mise-bas, strictement en ligne ; il ne s’agit pas d’une application native séparée.

##### Synthèse fonctionnelle des PR du Journal

- **#322** : sessions et événements de mise-bas ;
- **#324** : naissance atomique, animal et poids de naissance ;
- **#326** : Server Actions minces ;
- **#327** : panneau opérationnel et chronologie unique ;
- **#328** : accès direct par la sidebar ;
- **#330** : complément serveur du poids de naissance ;
- **#331** : interface du complément du poids ;
- **#332** : fondation des pesées collectives ;
- **#333** : saisie collective et historique ;
- **#334** : premières courbes de croissance ;
- **#336** : repères descriptifs de progression par animal ;
- **#337** : progression relative et courbes en base 100 ;
- **#338** : statistiques stables par séance ;
- **#339** : comparaison des deux dernières séances sur leur groupe commun ;
- **#341** : moteur de normalisation depuis la naissance réelle ;
- **#342** : modèle de comparaison par âge réel ;
- **#343** : lecture serveur sécurisée multi-portées ;
- **#344** : sélection et synthèse descriptive inter-portées ;
- **#346** : graphique comparatif inter-portées, poids moyen et indice base 100 ;
- **#347** : consolidation documentaire du graphique comparatif ;
- **#348** : modèle paramétrable du planning J0–J60 ;
- **#349** : calcul du planning depuis l’historique réel ;
- **#350** : synthèse du planning dans le Journal ;
- **#351** : politique effective et snapshot immuable par portée ;
- **#352** : utilisation de la politique effective dans le Journal ;
- **#353** : personnalisation de la cadence par organisation ;
- **#354** : conservation des animaux adoptés dans les historiques et clarification de leur éligibilité aux nouvelles pesées.

Les PR #323, #325, #329 et #335 ont actualisé le présent journal sans ajouter de capacité métier ; la PR #335 a consolidé la documentation après la PR #334.

La **PR #345** a consolidé la documentation après la PR #344 ; la PR #340 était la consolidation documentaire antérieure.

#### Fondation mobile de mise-bas

La route privée `/whelping` expose le même `WhelpingPanel`, les mêmes lectures, les mêmes Server Actions et les mêmes commandes que le Journal complet. L’orchestration serveur partagée charge la session ouverte ou la dernière session clôturée, la chronologie, les naissances de toutes les sessions nécessaires à l’éligibilité d’annulation, les rôles et l’historique des rectifications. Toute lecture structurante défaillante neutralise les mutations, et `viewer` reste en lecture seule.

Sans paramètre, le mode mobile choisit en priorité la portée dont la session ouverte a été démarrée le plus récemment, puis la première portée selon l’ordre métier du Journal. Le sélecteur et l’URL utilisent un index public borné (`/whelping?litter=0`) traduit côté serveur vers le catalogue autorisé courant ; aucun UUID n’est accepté comme index ou rendu dans les options.

Le mode autonome n’affiche pas la sidebar. Son manifest dédié permet l’installation sous le nom **Mise-bas**, avec affichage `standalone`, icônes 192 et 512 pixels et métadonnées Apple. Un retour après connexion n’est accepté que pour `/whelping` ou `/whelping?litter=<entier non négatif>`, avec revalidation côté serveur et fallback vers le parcours de connexion historique.

Cette fondation exige une connexion réseau. Elle n’ajoute aucun service worker, cache de page privée ou de réponse de Server Action, stockage local de naissance, file d’attente, IndexedDB, Background Sync, notification push, dictée structurée ou application native séparée.

#### Bibliothèque recommandée et copies d’organisation

La bibliothèque disponible dans `/settings/litter-care-task-templates` est un catalogue global, versionné, en lecture seule et consultable même lorsqu’aucun modèle n’a encore été importé. Elle fournit actuellement quinze modèles canins en version 1, répartis dans trois packs :

- **Gestation et préparation** ;
- **Naissance et premiers jours** ;
- **Croissance et préparation des départs**.

Le catalogue ne crée automatiquement ni modèle propre à une organisation ni tâche. L’import est toujours explicite et sélectif, avec une sélection vide par défaut, le choix d’une copie initialement active ou inactive et une confirmation avant mutation. Le catalogue global n’est jamais utilisé directement pour générer les tâches d’une portée.

Chaque import crée une copie réelle dans `litter_care_task_templates`. Cette copie devient un modèle d’organisation ordinaire : elle reste modifiable, activable ou désactivable, peut ensuite être utilisée par le moteur de génération existant et demeure indépendante des futures modifications du catalogue.

La copie conserve `library_template_code` et `library_template_version`, dont la combinaison d’origine est immuable. Modifier la copie ne modifie jamais le catalogue ; publier une nouvelle version de bibliothèque ne modifie jamais les copies existantes. Une nouvelle version disponible peut être importée explicitement comme une seconde copie, sans altérer les versions précédentes. L’unicité par organisation, code et version empêche l’import en double de la même version. Ces copies restent des modèles d’organisation et ne sont pas des `system_template`.

#### Import sécurisé

- L’import est atomique et tout ou rien ; la sélection est strictement validée et limitée.
- Le registre privé `litter_care_task_library_import_commands` conserve l’intention et le résultat. Un rejeu strictement identique est idempotent, tandis qu’une réutilisation conflictuelle de la même commande est refusée.
- Les imports concurrents sont sérialisés par organisation, en complément des contraintes d’unicité.
- Aucune métadonnée métier du catalogue n’est acceptée depuis le navigateur. Le formulaire transmet seulement la confirmation, les couples `code/version` sélectionnés et le statut initial actif ou inactif.
- La RPC relit le catalogue, contrôle les droits et reste l’autorité finale de l’import.

#### Invariants des tâches et de la génération

- `litter_care_tasks` conserve le snapshot historique complet du modèle et du calcul utilisés pour créer la tâche. Modifier, désactiver ou réactiver un modèle ne modifie jamais une tâche existante : elle n’est ni déplacée, ni recalculée, ni recréée.
- Les modèles personnalisés actuels utilisent `occurrence_no = 1`. L’unicité portée + modèle + occurrence empêche de générer deux fois le même jalon.
- La génération passe par une RPC atomique. Le plan exact est revalidé sous verrou avant toute insertion ; s’il est devenu obsolète, la commande retourne `stale_plan` sans écriture partielle.
- Le registre privé `litter_care_task_generation_commands` conserve le plan et le résultat de la commande. Le rejeu strictement identique est idempotent.
- La concurrence est protégée par des verrous de commande, de portée et de modèles, en complément des contraintes d’unicité.
- Le navigateur ne peut soumettre que la confirmation et les modèles sélectionnés. Aucun plan technique, numéro de révision ou date d’ancrage n’est accepté depuis le DOM ; ces données restent liées à l’intention préparée côté serveur puis sont revalidées par la RPC.

#### Permissions

| Rôle | Tâches | Modèles d’organisation | Bibliothèque recommandée |
| --- | --- | --- | --- |
| `owner`, `admin` | Lecture, création manuelle, résolution et génération depuis les modèles | Création, modification, désactivation et réactivation, y compris pour les copies importées dans « Mes modèles » | Consultation, sélection, import et choix de l’activation initiale |
| `member` | Lecture, création manuelle, résolution et génération depuis les modèles | Lecture seule | Consultation, sans aucun contrôle d’import dans le DOM |
| `viewer` | Lecture seule stricte | Lecture seule | Consultation, sans aucun contrôle d’import dans le DOM |

#### Limites actuelles

- Aucun modèle système directement générateur n’existe : la bibliothèque ne remplace pas les modèles d’organisation.
- Il n’existe aucune importation automatique, aucune sélection précochée et aucune génération automatique de tâche.
- Une modification de modèle ou de date ne recalcule, ne déplace et ne modifie aucune tâche existante ; activer, désactiver ou importer un modèle ne crée aucune tâche.
- Il n’existe aucune notification, aucune projection dans `events`, aucun cron et aucun scheduler.
- Aucun pack félin n’est proposé à ce stade.
- La bibliothèque actuelle couvre des jalons ponctuels, pas les actions répétitives spécialisées. La socialisation détaillée et les soins récurrents restent destinés à de futurs modules spécialisés plutôt qu’à une multiplication de jalons ponctuels.

Les PR #312 à #318 ont apporté la fondation des tâches et modèles, leur interface et leur gestion sécurisée, puis la génération atomique, idempotente et explicitement sélectionnée depuis le Journal, avant l’actualisation du présent état de référence. Les deux PR suivantes complètent ce socle sans changer le moteur de génération :

- **#319** : fondation globale versionnée et import atomique de la bibliothèque recommandée ;
- **#320** : interface de consultation et d’import explicite.

### Animaux

- Une seule table couvre les animaux produits, reproducteurs maison, reproducteurs extérieurs, animaux gardés, disponibles, réservés, adoptés ou retraités.
- L’identité, l’origine/détention, le statut administratif, l’identification, la filiation, la portée, l’attribution et la photo principale sont gérés.
- Les animaux produits exigent une portée ; l’attribution à une réservation respecte l’organisation, la portée et l’absence d’une autre attribution active.
- `/animals` est le registre complet ; `/cheptel` est la vue opérationnelle des reproducteurs et animaux réellement conservés par l’élevage.

### Paiements

- Les paiements sont liés au contact et, selon le parcours, à la réservation.
- Le modèle couvre les demandes, règlements et échéances ainsi que les cas métier d’arrhes, remboursement, avoir, report et retenue.
- Le parcours actuel gère notamment la pré-réservation et le complément d’arrhes, avec anti-doublon, idempotence des campagnes et suivi manuel des règlements.
- Aucun encaissement Stripe n’est implémenté en Phase 1.

### Documents

- Les documents peuvent être générés depuis un modèle ou téléversés, et être rattachés aux objets métier pertinents.
- Le moteur PDF réel couvre actuellement le **contrat de réservation** et le **certificat d’engagement** depuis une Réservation.
- Les statuts, dates d’envoi/signature et protections SQL empêchent la régression d’un document envoyé ou signé et préservent ses preuves.

## E-mails transactionnels Brevo

Brevo est intégré côté serveur pour les campagnes transactionnelles. Le socle commun :

- sélection d’un modèle Brevo actif enregistré par organisation ;
- destinataire et variables métier préparés côté serveur ;
- journal persistant dans `email_delivery_attempts` ;
- clé d’idempotence déterministe par organisation, campagne, dossier et version d’opération ;
- claim concurrent, instantanés du modèle/destinataire/variables, suivi `pending` / `sending` / `sent` / `failed`, retries et distinction des erreurs certaines ou incertaines ;
- compensation des ressources métier créées lorsque l’échec est certain et qu’un retour arrière sûr est possible.

`sending` représente une tentative réclamée ; un résultat fournisseur incertain peut rester `sending` afin d’empêcher un nouvel envoi potentiellement doublonné, tandis que les tentatives `failed` peuvent être reprises selon les garde-fous existants.

### Pièces jointes transactionnelles

- `email_delivery_attempts.attachments_snapshot` conserve un manifeste immuable composé uniquement de l’identifiant, du type, du nom, de la version, de la taille et du SHA-256 de chaque pièce jointe ; aucun contenu Base64 n’est enregistré en PostgreSQL.
- Une tentative est créée avec un manifeste vide. Un manifeste non vide ne peut être photographié que pendant l’état `sending`, puis devient immuable ; toute reprise doit présenter exactement le même manifeste.
- Avant l’envoi, le socle valide le Base64, la signature PDF, la sûreté du nom, la taille, le SHA-256, l’ordre et les limites des pièces jointes.
- Les campagnes sans pièce jointe conservent leur séquençage historique. Celles avec pièces jointes utilisent la phase `before_provider`, qui photographie le manifeste avant l’appel fournisseur.
- Une issue incertaine laisse la tentative en `sending` pour empêcher un doublon potentiel.

Campagnes transactionnelles disponibles :

1. **Confirmation de saillie** (`mating_confirmation`) : envoi aux candidatures sélectionnées et éligibles depuis la portée.
2. **Pré-réservation** (`pre_reservation`) : envoi de la demande de pré-réservation, avec création ou réutilisation cohérente de la réservation et de la première demande de paiement.
3. **Contrat + certificat avec complément d’arrhes** (`birth_documents_deposit`) : la campagne sélectionne autoritairement côté serveur le certificat d’engagement et le contrat de réservation, sans recevoir d’identifiant documentaire du client. À la première exécution, elle exige exactement un document courant de chaque type et refuse le dossier si un PDF manque, est incohérent ou n’est pas envoyable. Les métadonnées et les octets privés sont validés avant toute mutation du complément d’arrhes ; un document issu d’un modèle commun ou d’une variante personnalisée publiée est traité de la même façon.

Les deux PDF sont joints dans l’ordre certificat puis contrat, avec des noms déterministes portant leur version, et sont photographiés dans le manifeste de la tentative. Une reprise recharge exclusivement ces versions exactes, même si de nouvelles versions ont depuis été générées. Après acceptation par Brevo, les deux documents exacts passent atomiquement à `sent`. Une issue incertaine post-envoi conserve le paiement, le manifeste et la tentative en `sending` ; un ancien envoi déjà `sent` n’est jamais renvoyé automatiquement, y compris lorsque son manifeste historique est vide.

Dans l’interface Portée, l’éligibilité d’un dossier tient compte des deux PDF. Les motifs d’exclusion distinguent un document manquant, un PDF incohérent et un document déjà envoyé ou non envoyable. La confirmation affiche les deux types de documents et leur version, sans exposer d’UUID, de chemin Storage ni de SHA-256.

## Moteur PDF et versionnement documentaire

### Familles et versions de modèles

- `document_template_families` porte l’identité stable d’un modèle de référence ; chaque ligne de `document_templates` représente une version de cette famille.
- L’interface `/documents/modeles`, reliée aux actions serveur de gestion, permet de gérer les familles et leurs versions, d’éditer les brouillons, de publier ou retirer une version et de créer la version suivante.
- Une version suit l’un des états `draft`, `published` ou `retired`. Une famille ne peut avoir qu’un seul brouillon et qu’une seule version publiée à la fois.
- La création du prochain brouillon est sûre face aux accès concurrents et attribue la version suivante sans doublon.
- La sauvegarde d’un brouillon utilise un verrou optimiste pour signaler les écritures concurrentes. La publication est atomique et réservée aux rôles autorisés.
- Une version publiée, retirée ou déjà utilisée par un document est immuable ; l’éditeur affiche une version publiée en lecture seule.
- La suppression d’une famille est logique et protégée selon son état et ses usages documentaires.
- Le lien entre un document et son modèle identifie la version exacte au moyen de `documents.template_id` et `documents.source_template_version`.
- La reprise des modèles legacy conserve chaque modèle comme une famille distincte, sans regroupement ni renumérotation.
- La synchronisation du nom et de la description d’une famille vers ses versions conserve les audits propres aux versions.
- La validation métier reste centralisée dans les schémas Zod. La publication vérifie la version exacte validée afin de refuser un brouillon modifié entre la validation et l’écriture ; les erreurs exposées à l’interface restent typées.
- Les rôles `viewer` peuvent lire et valider, les `member` peuvent aussi créer et sauvegarder des brouillons, et seuls `owner` et `admin` peuvent créer une famille ou publier.

### Variantes individuelles par réservation

- `reservation_document_variants` porte l’identité stable d’une variante par organisation, réservation et famille de modèle. Il ne peut exister qu’une variante active pour cette combinaison ; deux réservations d’une même portée peuvent donc conserver deux contrats individualisés distincts.
- `reservation_document_variant_versions` conserve les versions complètes `draft`, `published` et `retired`, avec un seul brouillon et une seule publication courante par variante. Chaque version garde l’identifiant et le numéro exacts du modèle commun d’origine.
- `documents.reservation_document_variant_version_id` relie un document à la version exacte de variante utilisée. La base contrôle la cohérence de l’organisation, de la réservation, du type documentaire et de l’origine commune ; `documents.template_id` et `documents.source_template_version` conservent cette origine exacte.
- Une version de variante utilisée reste définitivement protégée, y compris lorsque le document devient historique ou est supprimé logiquement. Les anciens documents sans variante restent compatibles avec une valeur `null`.
- La création initiale sélectionne côté serveur la publication commune active exacte et en copie le format et le contenu. Une publication ultérieure du modèle commun ne rattache ni ne modifie une variante existante ; la version suivante clone la publication précédente de la variante et conserve son origine.
- La sauvegarde ne modifie que le contenu du brouillon et utilise un verrou optimiste sur `updated_at`. La publication est atomique et vérifie l’horodatage, le format et le contenu exacts relus et validés afin de refuser toute modification concurrente.
- L’identité, la taxonomie et les audits sont immuables, comme les versions publiées ou retirées.
- Le service TypeScript serveur permet de lister les variantes d’une réservation et leur brouillon/publication courants, de lire leur historique ordonné, de créer le premier brouillon, de sauvegarder son contenu, de le valider avec l’unique parseur Zod documentaire existant, de créer la version suivante et de publier. Il retourne des erreurs typées sans exposer les erreurs Supabase ou SQL.
- La fiche Réservation contient une section autonome **Variantes documentaires personnalisées**. Elle affiche les familles prises en charge, leur compatibilité, l’état de leur variante et l’origine exacte du modèle commun. La création exige une action explicite et ne se produit jamais au simple affichage de la page.
- Une page dédiée présente la publication courante en lecture seule, le brouillon éventuel et l’historique complet. Selon son rôle, l’éleveur peut créer, modifier, sauvegarder, valider, versionner et publier la variante.
- Les Server Actions retrouvent la réservation, en déduisent l’organisation côté serveur, vérifient que la variante appartient à cette réservation et utilisent exclusivement le service serveur de gestion des variantes.
- L’éditeur documentaire commun est réutilisé par injection d’actions, sans duplication des champs structurés. Les contrats V2, variables, gras, modifications non enregistrées, publications en lecture seule et aperçu responsive restent pris en charge. Une publication V2 sans brouillon n’affiche pas le contenu automatique legacy.
- Les permissions sont : `viewer` pour la lecture et la validation ; `member` pour la lecture, la validation, la création, la sauvegarde et la version suivante ; `admin` et `owner` pour toutes les opérations, dont la publication. Le contrôle d’adhésion documentaire est partagé entre le service des modèles et celui des variantes, sans changement de comportement.

### Contrat de réservation V2

- Les nouveaux contrats de réservation utilisent un contenu libre de schéma V2 : `schemaVersion: 2`, `locale: "fr-FR"`, `documentType: "reservation_contract"`, avec un `title` et un `body` textuels.
- Le titre et le corps peuvent être réorganisés librement. Les retours à la ligne et paragraphes vides sont conservés, et aucun contenu automatique legacy n’est ajouté.
- Les contrats V1 restent pris en charge sans conversion automatique ; leur rendu et leurs snapshots historiques ne sont pas modifiés.

### Variables et mise en forme minimale

- Les variables utilisent la syntaxe `[[groupe.variable]]`. Un catalogue centralisé, classé par catégories, permet de les insérer à la position du curseur dans le corps du contrat. Elles peuvent également être utilisées dans le titre lorsqu’elles y sont saisies manuellement.
- Le catalogue couvre le vendeur, l’adoptant, le projet, l’animal, la réservation, les finances, la portée, les parents, le groupe de portées et le document. Il comprend notamment `[[groupe_portees.nom]]` et `[[projet.portee_ou_groupe]]`, qui privilégie la portée nommée puis se replie sur le groupe.
- La résolution s’effectue en une seule passe : une valeur métier ressemblant elle-même à une variable n’est jamais réinterprétée.
- Les aperçus rendent les données manquantes explicites. La génération définitive est bloquée avant tout stockage si une donnée effectivement utilisée est absente ou invalide.
- La seule mise en forme textuelle prise en charge est le gras avec `**texte**`. Le bouton **Gras** et les raccourcis `Cmd+B` / `Ctrl+B` assurent une vraie bascule ajout/retrait à la sélection ou au curseur.
- La bascule reconnaît les variables complètes, exclut les espaces périphériques du gras et refuse les chevauchements ambigus. Le PDF rend le texte concerné en Helvetica-Bold.
- Il ne s’agit pas d’un moteur Markdown ou HTML général.

### Aperçus

- L’éditeur propose un aperçu fictif, ouvrable en grand. Depuis une Réservation, un aperçu réel est disponible lorsqu’un modèle publié compatible existe.
- Un aperçu ne crée ni ligne de document ni objet Storage. Les données manquantes y restent visibles.
- Pendant une syntaxe de gras temporairement incomplète, l’éditeur conserve le dernier aperçu valide. La validation, la publication et la génération définitive restent strictes.
- Dans l’éditeur de variante, l’aperçu utilise des données fictives. Créer ou éditer une variante ne crée aucune ligne dans `documents`, n’écrit rien dans `documents.generation_data` et ne produit aucun PDF réel ni objet Storage.
- Depuis la fiche Réservation, l’aperçu utilise les données réelles du dossier et la source effective. Il partage la même préparation serveur que la génération persistante.

### Modèles et snapshots

- Les modèles documentaires sont définis par des schémas JSON versionnés et validés avec Zod.
- Chaque génération prépare depuis Supabase un snapshot métier complet, typé et validé : organisation/vendeur, contact, candidature, réservation, portée, animal, paiements et modèle selon le document.
- Les nouveaux snapshots sont en version 2. Ils conservent la sélection initiale, l’origine commune exacte, la nature de la source et, le cas échéant, la version exacte de variante. Ils sont conservés dans `documents.generation_data` et deviennent immuables avec le document généré.
- Les snapshots V1 historiques restent lus et rendus sans conversion. Les versions inconnues et les combinaisons incohérentes sont refusées.
- Le rejeu idempotent V2 vérifie la sélection initiale, l’origine commune et la variante exacte.

### Rendu, stockage et génération

- Le rendu PDF réel utilise `@react-pdf/renderer` et produit un contrat de réservation ou un certificat d’engagement à partir du snapshot.
- L’orchestrateur enchaîne préparation du snapshot métier, validation, rendu avant stockage, calcul SHA-256, stockage et écriture des métadonnées de façon idempotente.
- Les PDF sont stockés dans le bucket privé `documents`, sous un chemin isolé par organisation et document, avec un numéro de version et le hash du fichier.
- Une nouvelle génération crée une nouvelle ligne et une chaîne `replaces_document_id` ; la version précédente est marquée historique plutôt qu’écrasée.
- Le titre résolu est conservé avec le document. Une nouvelle génération ne modifie jamais l’ancienne ligne, son snapshot ni son PDF historique.
- La génération individuelle se lance actuellement depuis la fiche Réservation, séparément pour le contrat et le certificat, avec contrôle de compatibilité du modèle.
- La famille reste choisie par le modèle commun publié sélectionné dans l’interface. Le serveur utilise la variante publiée de cette réservation et de cette famille, sinon le modèle commun sélectionné ; aucun identifiant de variante n’est accepté depuis le client et les brouillons ne sont jamais utilisés.
- Une variante publiée invalide bloque la source au lieu de provoquer un fallback silencieux. La génération stocke l’origine commune exacte, la version de variante exacte éventuelle et le snapshot immuable.
- Un retrait concurrent de la publication empêche le stockage d’un document incohérent et déclenche la compensation de l’objet Storage.

### Génération groupée par portée exacte

- Un noyau serveur privé permet de compléter le certificat d’engagement puis le contrat de réservation pour au maximum 30 réservations d’une même portée exacte. Il déduplique la sélection en conservant son ordre, traite les dossiers séquentiellement, déduit l’organisation exclusivement de la portée et relit chaque réservation ainsi que ses relations côté serveur.
- Les identifiants documentaires sont déterministes par organisation, opération, réservation et type, et un rejeu conserve le même `capturedAt`. Lorsque les deux documents manquent, leur préparation et leur rendu sont prévalidés avant le premier stockage. Le noyau réutilise sans duplication la préparation métier, la résolution du modèle commun ou de la variante publiée, le renderer, le stockage PDF et ses compensations.
- Les documents déjà présents ne sont pas régénérés, les documents `sent` ou `signed` sont protégés et les états ou PDF incohérents sont signalés. Aucune nouvelle version n’est créée automatiquement. Les rejeux et appels concurrents d’une même opération restent idempotents ; les résultats détaillés et leurs compteurs n’exposent ni identifiant documentaire ou de variante, ni chemin Storage, hash, snapshot ou autre donnée technique.
- L’orchestrateur individuel conserve la politique interne `replace` par défaut et donc son comportement historique de versionnement. Le noyau groupé utilise `create_only` afin d’interdire tout remplacement ou création automatique d’une nouvelle version lorsqu’un autre document courant existe.
- La PR #293 ajoute une Server Action compatible avec `useActionState`, liée à une intention serveur authentifiée contenant `litterId`, `operationId` et `capturedAt`. Aucune de ces valeurs n’est lue depuis le formulaire : l’interface transmet uniquement la confirmation explicite, les réservations sélectionnées et les modèles communs choisis pour le certificat et le contrat. Aucun identifiant de document ou de variante n’est accepté.
- Le résultat détaillé est retourné directement, sans redirection ni paramètre d’URL. La PR #294 expose l’interface sur `/litters/[id]` en écriture pour `owner`, `admin` et `member`, et en lecture seule pour `viewer`.
- Toutes les réservations de la portée exacte sont affichées, mais seules les réservations pré-éligibles sont sélectionnables, dans la limite de 30 dossiers. Le modèle commun du certificat et celui du contrat sont sélectionnés séparément ; la variante publiée propre à chaque réservation est résolue automatiquement côté serveur.
- Une confirmation explicite précède la génération, qui ne crée aucun e-mail ni paiement. Les résultats globaux, les compteurs et les résultats par dossier sont présentés en français, sans afficher d’UUID ni de détail Storage.
- Après soumission, la sélection et les modèles sont verrouillés. Un rejeu conserve exactement la même intention et la même configuration ; une nouvelle opération exige un rechargement explicite de la page. Aucun document courant n’est remplacé et aucune nouvelle version n’est créée automatiquement.

### Génération groupée depuis un groupe de portées

- Un core de planification classe les réservations du groupe : seules celles qui ont une portée exacte non supprimée, appartenant actuellement au groupe, dans la même organisation, avec un rattachement cohérent `reservation.litter_group_id = litter.litter_group_id`, sont éligibles. Les dossiers encore liés au groupe seul ou incohérents restent visibles et désactivés, avec un motif neutre.
- L’orchestrateur de groupe appelle séquentiellement le noyau par portée exacte pour chaque partition `(portée, taxonomie)`, avec une limite globale de 30 dossiers, une déduplication amont et le même `operationId` / `capturedAt` pour tous les sous-appels. La politique `create_only`, l’idempotence et les protections documentaires du noyau par portée sont conservées.
- Les modèles communs publiés du certificat et du contrat sont choisis par taxonomie effective normalisée `species + breed` ; les variantes publiées propres à chaque réservation restent résolues automatiquement côté serveur. Aucun identifiant de document ou de variante n’est accepté depuis le client.
- La PR #299 ajoute une Server Action compatible avec `useActionState`, liée à une intention serveur authentifiée contenant `litterGroupId`, `operationId` et `capturedAt`. L’interface transmet uniquement la confirmation explicite, les réservations sélectionnées et les sélections de modèles par taxonomie.
- La PR #300 expose l’interface sur `/litter-groups/[id]` en écriture pour `owner`, `admin` et `member`, et en lecture seule pour `viewer`. Une confirmation explicite précède la génération, qui ne crée aucun e-mail ni paiement. Les résultats globaux, par portée et par dossier sont présentés en français, sans UUID ni détail Storage.
- Après soumission, la sélection et la configuration sont verrouillées. Un rejeu conserve exactement la même intention et la même configuration ; une nouvelle opération exige un rechargement explicite de la page.

### Consultation sécurisée

- La fiche Document et la fiche Réservation exposent le document courant et son historique de versions.
- Une route serveur authentifiée vérifie l’organisation, les droits et la cohérence des métadonnées avant de diffuser le PDF privé.
- Les versions courantes et historiques restent consultables ; aucun lien Storage public permanent n’est exposé.
- Avant génération, chaque option précise si elle utilisera le modèle de référence ou une variante personnalisée ; une source personnalisée invalide est désactivée avec un message neutre.
- La carte du document courant sépare la source utilisée de son origine commune. L’historique partagé conserve ces informations par version : une ancienne version reste identifiée comme personnalisée après retrait de la variante ou retour au modèle commun sur une version suivante.
- Les documents legacy sans origine identifiable affichent une source non renseignée. Aucun UUID, chemin Storage ou jeton n’est exposé.

## Retours signés

- Un retour signé est une pièce distincte de l’original généré, stockée dans `document_signed_returns` et reliée au document exact concerné.
- L’upload utilise TUS directement vers Supabase Storage après création serveur d’une intention signée ; il est reprenable et limité aux PDF cohérents de 10 Mio maximum.
- La finalisation revalide le chemin, la taille, le hash SHA-256, le contenu stocké, l’original envoyé et les droits avant l’archivage atomique et le passage sûr du document à `signed`.
- En cas d’échec, expiration ou conflit, la compensation supprime uniquement l’objet orphelin dont l’absence de référence a été vérifiée.
- Le retour signé est consultable par une route privée et apparaît comme artefact séparé dans l’historique de la version d’origine.
- Il n’existe qu’un retour signé par document. Une fois archivé, il ne peut être ni substitué, ni supprimé, ni déplacé vers une autre version ; l’original n’est jamais remplacé.

## Limites actuelles

Restent notamment à concevoir ou implémenter, sans ordre technique définitivement décidé :

- d’éventuelles mesures cliniques individuelles des chiots et leur interprétation vétérinaire ;
- la dictée structurée ;
- le fonctionnement hors ligne et une éventuelle application mobile native séparée.

Cette liste reste prudente et ne constitue pas un ordre de réalisation définitivement validé. L’architecture et la priorité de ces évolutions devront être confirmées avant leur mise en œuvre.

Les contrats V1, les certificats d’engagement, les snapshots historiques, les retours signés, les règles RLS et permissions ainsi que la génération individuelle actuelle depuis une Réservation restent compatibles et inchangés.

## Environnement E2E et règles de validation

La stack E2E est isolée de la stack locale de développement :

- projet Supabase : `saasphase1-e2e` au lieu de `saasphase1` ;
- application : `127.0.0.1:3100` au lieu du port `3000` ;
- ports Supabase : `55320–55329` au lieu de `54320–54329` ;
- workdir généré et ignoré : `.supabase-e2e` ;
- conteneurs et volumes dédiés, avec garde-fous refusant la stack de développement ;
- arrêt et nettoyage limités aux ressources `saasphase1-e2e`.

`pnpm test:e2e` conserve le mode complet isolé : démarrage frais de la stack `saasphase1-e2e`, exécution, puis arrêt et nettoyage. Il ne doit donc ni réinitialiser ni arrêter la stack `saasphase1`, et doit préserver un éventuel `pnpm dev` en cours sur le port `3000`. Le développement courant continue avec `pnpm dev` et la stack locale habituelle.

La PR #301 ajoute deux commandes complémentaires :

- `pnpm test:e2e:reuse -- <specs>` : réutilise une stack E2E déjà démarrée pour accélérer les itérations ciblées, sans redémarrage ni reset systématique tant que la session de réutilisation est valide ;
- `pnpm test:e2e:stop` : arrête explicitement la stack `saasphase1-e2e` et nettoie ses volumes ainsi que le workdir `.supabase-e2e`.

Les démonstrations visuelles durables utilisent désormais un cycle séparé de
Playwright : `demo:e2e:start`, `demo:e2e:create`, `demo:e2e:status`,
`demo:e2e:cleanup` et `demo:e2e:stop`. Leur serveur Next reste actif sur `3100`
après la commande de création et leur inventaire de cleanup est conservé dans
un manifeste JSON ignoré sous `.supabase-e2e/demos`. Tant qu’un manifeste est
actif, les trois runners E2E refusent de réinitialiser, arrêter ou supprimer la
stack et ses volumes. Le cleanup dédié hard-delete exclusivement les IDs
enregistrés, dans l’ordre inverse des dépendances, puis exige des compteurs
`count(*)` sans filtre `deleted_at` à zéro. Le guide opérationnel est
`docs/E2E_DURABLE_DEMOS.md`.

Le scénario `growth-comparison` ajoute une démonstration métier réutilisable,
créée en une commande : deux portées complètes avec parents, mise-bas clôturée,
naissances structurées, mesures réelles de naissance et séances quotidiennes
J0–J30. Il est contrôlé par le même manifeste strict et le même cleanup ciblé
que le scénario technique. Sa vérification visuelle en lecture seule couvre les
deux Journaux, le comparateur par âge et la largeur mobile à 375 px.

Avant livraison d’un lot, exécuter au minimum :

```bash
pnpm lint
pnpm build
git diff --check
```

Les tests ciblés et E2E pertinents s’ajoutent selon le risque du lot.

## Méthode de travail et fixtures

- Partir d’un `main` à jour et propre, créer une branche de travail, avancer par petits lots, vérifier le diff et passer par une PR ; aucun commit direct sur `main`.
- Ne pas modifier une migration déjà intégrée : ajouter une migration corrective, puis régénérer et vérifier les types Supabase si le schéma change.
- Préserver les données utilisateur et les changements locaux sans rapport avec le lot.
- Toute fixture persistante doit avoir des identifiants connus dès sa création et être **hard-delete** dans un `finally`, dans l’ordre inverse des dépendances.
- Vérifier explicitement les erreurs de suppression, puis compter avec `count(*)` toutes les tables et objets Storage concernés, sans filtre `deleted_at`. Un soft delete, un reset de base ou un test vert ne prouve pas le nettoyage.
- Nettoyer aussi les reliquats historiques identifiables sans ambiguïté ; ne jamais supprimer une donnée potentiellement réelle.
- Le rapport final doit lister les données temporaires créées et supprimées avec leurs identifiants et le résultat du contrôle final, ou indiquer explicitement qu’aucune donnée temporaire n’a été créée.
## Lot du 2026-07-21 — Rectification des pesées de routine

- Le Journal permet désormais de corriger le poids ou la note d’une mesure de routine, d’annuler une mesure dans une séance multiple et d’annuler une séance entière. Les lignes sont conservées : aucune suppression physique n’est réalisée par ces opérations.
- Les identifiants, commandes et révisions sont liés aux Server Actions côté serveur. Une révision périmée conserve le dialogue ouvert et demande un rechargement, sans écraser la modification concurrente.
- L’historique actif reste limité aux séances et mesures non annulées. Un historique replié des rectifications expose uniquement des libellés et valeurs métier, via une lecture `security definer` bornée à 100 entrées et accessible aux rôles `owner`, `admin`, `member` et `viewer`.
- L’heure commune d’une séance n’est pas modifiable. Une heure erronée nécessite l’annulation complète de la séance, puis sa recréation.

## Lot du 2026-07-22 — Consolidation finale du Journal de mise-bas

Le workflow transversal a été vérifié dans un scénario navigateur unique : une même ligne `whelping_sessions` traverse plusieurs cycles de clôture et réouverture, tandis que la chronologie `whelping_events` reste append-only et strictement ordonnée par `sequence_no`. L’événement `birth` initial demeure byte-for-byte immuable ; seul l’état effectif de `whelping_births`, de l’Animal, du poids actif et des projections de portée est rectifié. Les corrections et annulations spécialisées restent distinctes dans la chronologie, et l’historique d’audit expurgé conserve toutes les actions dans l’ordre décroissant.

Le poids de naissance actif reste unique dans `animal_weight_measurements`, cohérent avec `animals.birth_weight_grams` et immédiatement reflété dans le panneau de mise-bas ainsi que dans la croissance. Les pesées `routine` restent indépendantes : elles ne modifient ni la chronologie de mise-bas ni les ordres de naissance, et les animaux issus d’une naissance annulée sont exclus des nouvelles saisies. L’annulation demeure limitée à la dernière naissance active sans donnée ultérieure, sans suppression physique ; elle soft-delete l’Animal, neutralise son poids éventuel et libère l’ordre pour une naissance de remplacement.

La consolidation a détecté un défaut dans `record_whelping_birth` lors de la réutilisation d’un ordre annulé : l’agrégat final incluait encore les naissances annulées. La migration corrective `202607220002_whelping_birth_replacement_projection_fix` limite ce calcul aux naissances actives, sans nouvelle table ni nouvelle source de vérité. Les compteurs `born_total_count`, `born_male_count`, `born_female_count`, `alive_count` et `actual_birth_date` restent ainsi cohérents avec le nombre de naissances et d’animaux actifs après correction, annulation et remplacement.

L’interface d’une session clôturée indique désormais exactement que les naissances peuvent encore être rectifiées et les poids manquants complétés, la réouverture n’étant requise que pour une nouvelle naissance ou un nouvel événement. Les rôles `owner` et `viewer`, l’absence d’identifiants techniques dans le DOM et l’URL, ainsi que le responsive mobile à 375 × 812 ont été vérifiés conjointement pour les panneaux de mise-bas et de croissance.

## Lot du 2026-07-22 — Sélection sûre du mode mise-bas mobile

Un incident de sélection mobile a montré qu’un changement de portée pouvait laisser brièvement les commandes de l’ancien panneau actives, alors que le menu affichait déjà le nouveau choix. Le panneau précédent est désormais neutralisé synchroniquement dès le début de la navigation : ses boutons et formulaires deviennent inertes et sont remplacés par le message `Changement de portée…` jusqu’au nouveau rendu serveur.

La sélection mobile est autoritative côté serveur. L’interface ne transmet qu’un index public borné ; le serveur le résout dans le catalogue actuellement autorisé, puis conserve la portée et une révision aléatoire dans un cookie `HttpOnly`, `SameSite=Lax`, limité à `/whelping`. Chaque chargement revalide la portée mémorisée. Les Server Actions mobiles comparent la portée et la révision de la page avec celles du cookie avant toute écriture et refusent sans mutation les actions issues d’une ancienne page ou d’un autre onglet devenu périmé.

Depuis le Journal complet, le lien `Ouvrir le mode mobile de mise-bas` passe par `/whelping/selection?litter=<index public>`. Cette route authentifiée résout à nouveau l’index dans le catalogue autorisé, renouvelle le cookie et termine sur l’URL canonique `/whelping`. Les anciens liens `/whelping?litter=<index public>` sont transférés vers cette même route de sélection ; les autres query strings inattendues sont supprimées sans modifier la sélection. Aucun identifiant de portée ou de session n’est ajouté à l’URL canonique, au DOM, à l’état React ou aux logs navigateur.

Ce lot ne crée aucune migration, RPC, table ou dépendance.

## Lot du 2026-07-22 — Clés React du complément rapide mobile

Un parcours mobile complet a produit plusieurs rendus de l’avertissement React `Encountered two children with the same key, 1`. L’audit a confirmé qu’il ne correspondait à aucun doublon métier : chaque naissance, Animal, événement, commande, mesure et rectification restait unique. La reproduction instrumentée situe la première apparition au rafraîchissement achevé après la première naissance express mâle, avant la seconde naissance et avant tout complément.

La liste fautive n’était pas la liste interne des cartes rapides. Dans le groupe de commandes mobile, `ExpressBirthActions` utilisait le nombre de naissances actives comme clé, tandis que `WhelpingQuickCompletion` utilisait la concaténation des numéros de naissance à compléter. Avec une seule naissance active à compléter, ces deux enfants frères recevaient donc tous deux la clé `1`. Le numéro de naissance reste un ordre métier ; il ne doit pas servir seul d’identité entre composants frères de nature différente.

Les espaces de clés du panneau sont désormais explicitement séparés. La commande express utilise un préfixe propre, et le remontage de la file rapide utilise un autre préfixe avec une identité publique composée de l’ordre, de l’heure de naissance et du sexe. Aucun identifiant de base n’est exposé. Les clés de la chronologie, de l’historique, de la palette, du sélecteur et des dialogues ont aussi été vérifiées sans collision réelle.

Le scénario navigateur capture la console dès le chargement initial et échoue dès la première alerte de clé dupliquée. Il contrôle chaque action et chaque rafraîchissement, les cartes rapides, la chronologie, l’historique et les comptes SQL, puis exige le hard-delete de toutes les fixtures. Ce lot n’ajoute aucune migration, RPC, table ou dépendance.
