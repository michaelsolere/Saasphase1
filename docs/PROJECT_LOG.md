# Journal de reprise — SaaS élevage

Ce document décrit l’état utile du projet après la PR #324. Il privilégie les invariants, les capacités réellement disponibles, les limites connues et la prochaine étape fonctionnelle à une chronologie exhaustive des PR.

## Référence du projet

- Dépôt : `michaelsolere/Saasphase1`.
- Branche de référence : `main`.
- SHA de `main` documenté : `95f2a3da825883c3af34425cc00d9c1d1ceede86`.
- Dernière PR incluse : **PR #324 — Ajouter la naissance atomique et le poids de naissance**.
- Les migrations locales sont appliquées jusqu’à `202607190003_whelping_births_weights`.
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
- Les chiots d’une portée sont créés dans `animals` depuis la fiche Portée, jamais dans une table dédiée.

### Journal des portées

Le Journal des portées est disponible sur `/litters/journal?litter=<uuid>`. Il permet de sélectionner une portée active et réunit son contexte reproductif, sa synthèse, les observations maternelles et les tâches de suivi sans surcharger la fiche Portée.

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

Les repères disponibles sont `first_mating`, `estimated_ovulation`, `expected_birth`, `actual_birth` et `offspring_age`. Le repère `offspring_age` utilise exclusivement la naissance réelle comme ancre. Si l’ancre requise manque, seule la tâche concernée reste en `missing_anchor` : aucun autre repère n’est utilisé comme fallback silencieux.

#### Sessions, chronologie, naissances et poids de mise-bas

Le Journal repose sur `whelping_sessions`, `whelping_events`, `whelping_births`, `animal_weight_measurements` et le registre privé `whelping_commands`. Une seule session peut être ouverte par portée ; son fuseau IANA est conservé. Les commandes serveur d’ouverture, d’ajout d’événement et de clôture restent idempotentes, et les événements `observation`, `care`, `birth` et `note` forment une chronologie append-only ordonnée côté serveur. Tous les membres actifs peuvent lire le Journal ; l’écriture est réservée aux rôles `owner`, `admin` et `member`, avec neutralisation inter-organisation.

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

`animal_weight_measurements` est la source de vérité des poids ; `animals.birth_weight_grams` n’est qu’une projection de compatibilité. Le poids de naissance est facultatif lors de la création. Une mesure `birth` est liée à la naissance et à son animal exact, avec une heure de pesée indépendante de l’heure de naissance. L’historique est append-only. Aucune mesure de routine ou clinique n’est encore saisissable.

##### Protections

- un ordre de naissance actif est unique dans une portée, et la migration échoue explicitement si son audit détecte des doublons préexistants ;
- une naissance Journal est refusée si la portée possède déjà des animaux produits administrativement ; inversement, la création administrative est refusée pendant une session ouverte ou après une naissance Journal ;
- le parentage, l’espèce et la race de la portée sont verrouillés pendant une session ouverte et après une naissance Journal ;
- les projections de naissance de l’animal ainsi que la date réelle et les compteurs de la portée sont protégés contre les modifications directes ;
- la couleur actuelle et les futurs statuts de parcours de l’animal restent évolutifs ;
- aucune naissance n’est projetée dans la table générique `events`.

##### Limites actuelles

- aucune interface ne permet encore d’ouvrir ou de clôturer une session ;
- aucun bouton rapide de naissance ni Server Action React de mise-bas n’existe ;
- aucune saisie vocale n’est disponible ;
- un poids manquant ne peut pas être complété ultérieurement ;
- aucune correction ou annulation de naissance, ni réouverture de session, n’est disponible ;
- aucune pesée collective n’est disponible ;
- aucun graphique de croissance ni interface d’historique des pesées n’existe ;
- aucune PWA ou application mobile indépendante n’existe ;
- le statut de la portée n’est jamais modifié automatiquement.

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
- La bibliothèque actuelle couvre des jalons ponctuels, pas les actions répétitives spécialisées. Les pesées répétées, les relevés successifs, la socialisation détaillée et les soins récurrents restent destinés à de futurs modules spécialisés plutôt qu’à une multiplication de jalons ponctuels.

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

## Limites actuelles et feuille de route immédiate

Reste à concevoir ou implémenter :

1. une interface rapide de mise-bas reliée aux sessions, aux événements et à la naissance atomique ; cette couche mince utilisera exclusivement les services et commandes existants, sans recréer de logique métier dans React ;
2. l’ajout ultérieur et la saisie collective des poids ;
3. l’historique individuel et collectif de croissance ;
4. les soins et suivis récurrents spécialisés ;
5. l’historique et les comparaisons inter-portées ;
6. une éventuelle expérience mobile indépendante ou PWA.

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
