# Project Log — SaaS élevage

Ce fichier sert de journal de reprise pour les agents IA et pour le suivi humain du projet.

Il doit être mis à jour après chaque PR significative, afin de conserver :

* l’état actuel du projet ;
* les décisions techniques importantes ;
* les validations effectuées ;
* les limites connues ;
* la prochaine étape logique.

## État actuel

Branche principale : `main`
Dernier état connu : Documents enrichis avec contact et réservation liés
Dernier commit connu : `3c2df752 Merge PR64: Add related contact to document detail`

Le dépôt contient désormais :

* le schéma Supabase initial de la Phase 1 ;
* les types TypeScript Supabase ;
* un seed local reproductible ;
* le socle applicatif Next.js ;
* un formulaire public de candidature ;
* un écran privé de revue des candidatures ;
* une authentification minimale ;
* un compte Auth local de développement ;
* une fiche détail candidature en lecture seule ;
* des actions de qualification de candidature ;
* un journal de projet `docs/PROJECT_LOG.md` ;
* des notes internes sur la fiche détail d’une candidature ;
* une fiche détail de contact en lecture seule ;
* une liste privée des contacts en lecture seule ;
* des liens de navigation croisés entre candidatures et contacts dans l’espace privé ;
* l'affichage des candidatures liées sur la fiche détail d'un contact ;
* la création et l'affichage sécurisé de notes internes sur la fiche d'un contact ;
* un lien direct de retour vers la liste des contacts depuis la fiche détail ;
* une liste privée des réservations en lecture seule (`/reservations`) ;
* une fiche détail de réservation en lecture seule (`/reservations/[id]`) ;
* l'affichage des réservations liées sur la fiche détail d'un contact ;
* l'affichage des réservations liées sur la fiche détail d'une candidature ;
* l'affichage de l'animal lié sur la fiche détail d'une réservation (`/reservations/[id]`) avec lien vers `/animals/[id]` ;
* une liste privée des paiements en lecture seule (`/payments`) ;
* une fiche détail de paiement en lecture seule (`/payments/[id]`) ;
* des liens simples vers les contacts et réservations associés depuis la liste et la fiche détail des paiements ;
* un lien `Consulter` depuis la liste des paiements vers chaque fiche détail ;
* l'affichage des paiements liés sur la fiche détail d'un contact ;
* l'affichage des paiements liés sur la fiche détail d'une réservation ;
* une liste privée des documents en lecture seule (`/documents`) ;
* une fiche détail de document en lecture seule (`/documents/[id]`) ;
* un lien `Consulter` depuis la liste des documents vers chaque fiche détail ;
* des liens simples vers les contacts, candidatures, réservations et paiements associés depuis la liste et la fiche détail des documents ;
* l'affichage du contact lié sur la fiche détail d'un document (`/documents/[id]`) avec lien vers `/contacts/[id]` ;
* l'affichage de la réservation liée sur la fiche détail d'un document (`/documents/[id]`) avec lien vers `/reservations/[id]` ;
* la conservation de l'aside `Liens métier` sur la fiche détail document ;
* l'affichage des documents liés sur les fiches détail d'un contact, d'une candidature, d'une réservation et d'un paiement ;
* une liste privée des portées en lecture seule (`/litters`) ;
* une fiche détail de portée en lecture seule (`/litters/[id]`) ;
* l'affichage des animaux liés sur la fiche détail d'une portée (`/litters/[id]`) ;
* l'affichage des documents liés sur la fiche détail d'une portée (`/litters/[id]`) avec lien vers `/documents/[id]` ;
* un lien `Consulter` depuis la liste des portées vers chaque fiche détail ;
* une liste privée des animaux en lecture seule (`/animals`) ;
* une fiche détail d'animal en lecture seule (`/animals/[id]`) ;
* l'affichage de la portée liée sur la fiche détail d'un animal (`/animals/[id]`) ;
* l'affichage de la réservation liée sur la fiche détail d'un animal (`/animals/[id]`) avec lien vers `/reservations/[id]` ;
* l'affichage des documents liés sur la fiche détail d'un animal (`/animals/[id]`) avec lien vers `/documents/[id]` ;
* un lien `Consulter` depuis la liste des animaux vers chaque fiche détail ;
* une liaison consultative Réservation ↔ Animal, sans workflow d'attribution ni mutation ;
* des fixtures locales Portées / Animaux permettant de tester `/litters`, `/litters/[id]`, `/animals`, `/animals/[id]`, la relation portée → animaux et la relation animal → portée ;
* des fixtures locales Documents liées à la portée et à l'animal de démonstration pour tester les sections `Documents liés` sur les fiches portée et animal ;
* des fixtures locales Alice Martin permettant de tester les écrans réservations, paiements, documents et les sections de documents liés.

## Historique des PR

### PR1 — Initial Supabase schema and Phase 1 data model

Objectif : créer le socle PostgreSQL/Supabase initial du SaaS.

Contenu principal :

* organisations ;
* profils ;
* memberships ;
* formulaires publics ;
* soumissions ;
* contacts ;
* candidatures ;
* réservations ;
* portées ;
* animaux ;
* paiements ;
* avoirs ;
* documents ;
* médias ;
* notes ;
* événements ;
* vues métier ;
* fonctions SQL ;
* politiques RLS.

Décisions importantes :

* utiliser `text not null check (...)` plutôt que des ENUM PostgreSQL pour les statuts ;
* activer RLS sur les tables métier ;
* utiliser des vues `security_invoker` ;
* créer un workflow public de soumission via RPC sécurisée.

### PR2 — Add Supabase TypeScript types and development seed

Objectif : rendre le schéma exploitable localement.

Contenu principal :

* configuration Supabase locale ;
* génération des types TypeScript ;
* ajout d’un seed de développement ;
* création d’une organisation fictive `elevage-demo` ;
* création d’un formulaire public actif `golden-retriever-2026`.

Validation :

* `supabase db reset` ;
* tests d’intégration existants ;
* génération reproductible des types.

### PR3 — Initialize Next.js application foundation

Objectif : créer le socle applicatif web.

Stack ajoutée :

* Next.js ;
* React ;
* TypeScript strict ;
* Tailwind CSS ;
* structure compatible shadcn/ui ;
* clients Supabase navigateur et serveur ;
* `.env.example`.

Hors périmètre :

* aucun module métier complet ;
* aucune authentification complète ;
* aucun back-office avancé.

### PR4 — Add public adoption application form

Objectif : ajouter le formulaire public de candidature.

Contenu principal :

* route publique `/candidature/golden-retriever-2026` ;
* validation des coordonnées, du projet, de la préférence de sexe et des consentements ;
* soumission via RPC publique sécurisée ;
* affichage d’une référence publique opaque après succès.

Décision importante :

* ne pas exposer d’identifiants internes ;
* garder les erreurs publiques génériques.

### PR5 — Add applications review screen

Objectif : créer le premier écran privé de revue des candidatures.

Contenu principal :

* route `/candidatures` ;
* affichage des candidatures depuis `application_overview` ;
* filtre simple `À relire` / `Toutes` ;
* états chargement, vide, erreur et non connecté.

Limite :

* écran strictement en lecture seule.

### PR6 — Add minimal authentication flow

Objectif : protéger les premiers écrans privés.

Contenu principal :

* route `/login` ;
* connexion par email/mot de passe ;
* actions serveur pour login/logout ;
* redirections vers `/candidatures` ;
* protection minimale via proxy Next.js ;
* vérification serveur conservée côté page.

Limites :

* pas d’inscription publique ;
* pas de récupération de mot de passe ;
* pas de gestion complète des utilisateurs.

### PR7 — Add reproducible local Auth seed user

Objectif : permettre un test local reproductible après chaque `supabase db reset`.

Compte local :

* email : `owner@saasphase1.invalid`
* mot de passe : `LocalDevOwner-2026!`
* organisation : `elevage-demo`
* rôle : `owner`

Précaution :
ces identifiants sont fictifs et réservés au développement local.

### PR8 — Add read-only application detail screen

Objectif : permettre la consultation détaillée d’une candidature.

Contenu principal :

* route `/candidatures/[id]` ;
* fiche détail en lecture seule ;
* affichage du statut, date, source, préférence de sexe, espèce/race, projet et coordonnées ;
* lien retour vers la liste ;
* gestion neutre des candidatures absentes ou non visibles par RLS.

Limites :

* aucune modification de statut ;
* aucune réservation ;
* aucun module contact complet.

### PR9 — Add application qualification actions

Objectif : ajouter les premières actions de qualification depuis la fiche détail candidature.

Contenu principal :

* actions serveur de changement de statut ;
* composant d’actions de qualification ;
* configuration partagée des transitions de statut ;
* affichage dynamique des boutons selon le statut courant ;
* séparation de la configuration hors fichier `"use server"` ;
* conservation d’un périmètre limité à la qualification.

Fichiers principaux :

* `src/app/candidatures/[id]/page.tsx`
* `src/features/applications/actions.ts`
* `src/features/applications/qualification-actions.tsx`
* `src/features/applications/transitions.ts`

Validation :

* `pnpm lint`
* `pnpm build`

Hors périmètre :

* aucune migration Supabase ;
* aucune modification RLS ;
* aucune création de réservation ;
* aucun module contact complet.

### PR10 — docs: add project log

Objectif : ajouter un journal de projet durable pour faciliter les reprises de contexte.

Contenu principal :

* création de `docs/PROJECT_LOG.md` ;
* résumé de l’état du projet ;
* historique des PR déjà fusionnées ;
* rappel des décisions techniques importantes ;
* rappel des commandes de validation habituelles ;
* indication des prochaines étapes possibles.

Utilité :

* permettre aux agents IA de reprendre le projet avec un contexte fiable ;
* éviter de dépendre uniquement de l’historique des conversations ;
* faciliter les transitions entre ChatGPT, Codex, Antigravity et Cursor.

Validation :

* PR documentaire uniquement ;
* aucun changement applicatif ;
* aucune migration Supabase ;
* aucune modification RLS.

### PR11 — Add internal application notes

Objectif : ajouter les notes internes sur la fiche détail d’une candidature.

Contenu principal :

* affichage des notes internes liées à une candidature ;
* ajout d’un formulaire simple d’ajout de note interne ;
* ajout de l’action serveur `createApplicationNote` ;
* association des notes à `application_id`, `organization_id` et `created_by` ;
* insertion des notes avec `note_type = 'internal'` et `visibility = 'internal'` ;
* affichage des notes de la plus récente à la plus ancienne ;
* affichage de messages utilisateur neutres en cas de succès ou d’erreur.

Fichiers principaux :

* `src/app/candidatures/[id]/page.tsx`
* `src/features/applications/actions.ts`
* `src/features/applications/note-form.tsx`
* `src/features/applications/types.ts`

Validation :

* `pnpm lint`
* `pnpm build`

Hors périmètre :

* aucune migration Supabase ;
* aucune modification RLS ;
* aucun upload de document ;
* aucune édition de note ;
* aucune suppression de note ;
* aucun module contact complet ;
* aucune logique de réservation.

Tests manuels recommandés :

* ouvrir une candidature depuis `/candidatures` ;
* vérifier l’affichage du bloc “Notes internes” ;
* ajouter une note valide ;
* vérifier que la note apparaît en haut de liste ;
* vérifier l’affichage de la date et de l’auteur ;
* vérifier qu’une note vide n’est pas insérée.

### PR13 — Add read-only contact detail screen

Objectif : ajouter un écran en lecture seule des détails d'un contact (`/contacts/[id]`) et l'associer depuis la fiche d'une candidature.

Contenu principal :

* création de la route `/contacts/[id]` pour afficher les coordonnées, l'adresse postale et les rôles d'un contact ;
* récupération du `contact_id` sur la fiche détail de candidature ;
* ajout d'un lien "Voir le contact" redirigeant vers la fiche contact ;
* récupération dynamique des rôles actifs via la table `contact_roles` ;
* gestion neutre des erreurs ("Contact introuvable ou inaccessible.").

Fichiers principaux :

* `src/app/contacts/[id]/page.tsx`
* `src/features/contacts/formatters.ts`
* `src/app/candidatures/[id]/page.tsx`
* `src/features/applications/types.ts`

Validation :

* `pnpm lint`
* `pnpm build`

Hors périmètre :

* aucune migration Supabase ;
* aucune modification RLS ;
* aucun module de modification, d'ajout manuel ou de suppression de contact ;
* aucune nouvelle dépendance externe.

Tests manuels recommandés :

* ouvrir une candidature et cliquer sur "Voir le contact" ;
* vérifier l'affichage des informations personnelles et de l'adresse ;
* vérifier l'affichage des rôles actifs ;
* vérifier la gestion d'un ID inexistant.

### PR15 — Add read-only contacts list

Objectif : ajouter un écran privé de liste des contacts en lecture seule sur `/contacts` pour naviguer vers chaque fiche détaillée.

Contenu principal :

* création de la route privée `/contacts` ;
* récupération de la liste des contacts via la vue `contact_overview` ordonnés par date de création décroissante ;
* affichage des données : nom d'affichage, coordonnées (email/téléphone), rôles actifs traduits et date de création ;
* robustesse aux types pour `active_roles` (gère les tableaux, chaînes simples, null ou undefined) ;
* lien "Consulter" vers la fiche détaillée `/contacts/[id]` pour chaque ligne ;
* gestion de l'état vide ("Aucun contact trouvé") et de bannières d'erreur neutres.

Fichiers principaux :

* `src/app/contacts/page.tsx`
* `src/features/contacts/contact-list.tsx`
* `src/features/contacts/types.ts`

Validation :

* `pnpm lint`
* `pnpm build`

Hors périmètre :

* aucune migration Supabase ;
* aucune modification RLS ;
* aucun module de modification, d'ajout ou de suppression de contact ;
* aucune pagination ni filtres de recherche complexes ;
* aucune nouvelle dépendance externe.

Tests manuels recommandés :

* accéder à `/contacts` sans être connecté (vérifier la redirection vers `/login`) ;
* se connecter avec les identifiants locaux de développement ;
* ouvrir `/contacts` et vérifier l'affichage de la table des contacts ;
* cliquer sur "Consulter" et valider la navigation vers la fiche détaillée du contact.

### PR17 — Add contacts navigation link

Objectif : ajouter des liens de navigation croisés simples et symétriques entre les écrans privés des candidatures et des contacts.

Contenu principal :

* ajout d'un lien "Contacts" dans l'en-tête de `/candidatures` ;
* ajout d'un lien "Candidatures" dans l'en-tête de `/contacts` ;
* alignement avec le style visuel de l'en-tête existant.

Fichiers principaux :

* `src/app/candidatures/page.tsx`
* `src/app/contacts/page.tsx`

Validation :

* `pnpm lint`
* `pnpm build`

Hors périmètre :

* aucun changement de requêtes Supabase ;
* aucune modification d'authentification ;
* aucune modification de base de données (migration) ou de politique RLS ;
* aucun nouveau composant global de navigation.

Tests manuels recommandés :

* se connecter sur l'espace privé de développement ;
* sur `/candidatures`, vérifier et cliquer sur le lien "Contacts" ;
* sur `/contacts`, vérifier et cliquer sur le lien "Candidatures" pour retourner en arrière.

### PR19 — Add read-only contact related applications

Objectif : afficher les candidatures liées à un contact sur sa fiche détail en lecture seule.

Contenu principal :
* récupération des candidatures associées au contact via la vue `application_overview` ;
* tri par date de soumission décroissante ;
* affichage des informations de la candidature (espèce, race, statut, préférence de sexe, date et source) ;
* lien "Consulter" vers la fiche détaillée de la candidature ;
* gestion des cas sans candidature ("Aucune candidature liée à ce contact.") et des erreurs de chargement.

Fichiers principaux :
* `src/app/contacts/[id]/page.tsx`

Validation :
* `pnpm lint`
* `pnpm build`

Hors périmètre :
* aucune modification de base de données (migration) ou de politique RLS ;
* aucun changement d'écriture.

### PR20 — Add contact internal notes

Objectif : afficher et créer des notes internes liées à un contact sur sa fiche détail.

Contenu principal :
* affichage des notes internes liées au contact (type `internal` et visibilité `internal`), de la plus récente à la plus ancienne ;
* formulaire d'ajout de note interne avec état d'attente lors de la soumission ;
* action serveur sécurisée `createContactNote` réalisant la vérification de l'utilisateur, la relecture du contact côté serveur pour récupérer l'organisation en ignorant les données sensibles du client, et l'insertion en forçant le type/visibilité à `internal` ;
* affichage de messages d'état (succès/erreur) ;
* gestion des erreurs de chargement avec un message neutre.

Fichiers principaux :
* `src/app/contacts/[id]/page.tsx`
* `src/features/contacts/actions.ts`
* `src/features/contacts/note-form.tsx`

Validation :
* `pnpm lint`
* `pnpm build`

Hors périmètre :
* aucune modification de RLS ;
* aucune migration de base de données ;
* pas d'édition ou de suppression de notes.

### PR21 — Add back link to contacts list

Objectif : améliorer la navigation depuis la fiche détail d'un contact en ajoutant un retour vers la liste des contacts.

Contenu principal :
* ajout d'un lien principal `← Retour aux contacts` vers `/contacts` ;
* conservation du lien secondaire vers `/candidatures` pour la flexibilité de navigation.

Fichiers principaux :
* `src/app/contacts/[id]/page.tsx`

Validation :
* `pnpm lint`
* `pnpm build`

Hors périmètre :
* aucune modification fonctionnelle autre que l'amélioration de la navigation.

### PR23 — Add read-only reservations list

Objectif : ajouter un écran privé de liste des réservations en lecture seule.

Contenu principal :
* création de la route privée `/reservations` ;
* récupération de la liste des réservations depuis la vue `reservation_overview` ;
* affichage des données sous forme de liste en lecture seule ;
* gestion neutre de l'état vide ("Aucune réservation trouvée") et d'un message d'erreur neutre en cas de problème de chargement ;
* intégration de liens de navigation minimaux depuis les fiches Contacts et Candidatures.

Hors périmètre :
* aucune action d'écriture ;
* aucune migration de base de données ;
* aucune modification de politique RLS.

### PR24 — Add read-only reservation detail screen

Objectif : ajouter une fiche de consultation détaillée pour une réservation spécifique.

Contenu principal :
* création de la route privée `/reservations/[id]` ;
* récupération d'une réservation unique depuis la vue `reservation_overview` ;
* affichage des détails de la réservation en lecture seule (statut, portée, tarifs, acomptes, dates de planification/adoption, animal assigné) ;
* lien de retour vers la liste des réservations ;
* liens de navigation vers le contact et la candidature associés lorsque disponibles ;
* gestion des cas de réservation non trouvée ou inaccessible ;
* message d'erreur neutre en cas d'échec de chargement.

Hors périmètre :
* aucune action d'écriture ;
* aucune migration de base de données ;
* aucune modification de politique RLS.

### PR25 — Add contact related reservations

Objectif : afficher les réservations liées à un contact directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Réservations liées` sur la fiche détail d'un contact (`/contacts/[id]`) ;
* récupération des réservations associées via la vue `reservation_overview` filtrée par `contact_id` ;
* affichage en lecture seule des caractéristiques de la réservation (portée, statut, préférence de sexe, tarif, animal attribué, date de création) ;
* lien "Consulter" redirigeant vers `/reservations/[id]` pour chaque réservation de la liste ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune action d'écriture ;
* aucune migration de base de données ;
* aucune modification de politique RLS.

### PR27 — Add application related reservations

Objectif : afficher les réservations liées à une candidature directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Réservations liées` sur la fiche détail d'une candidature (`/candidatures/[id]`) ;
* récupération des réservations associées via la vue `reservation_overview` filtrée par `application_id` ;
* affichage en lecture seule des caractéristiques de la réservation (portée, statut, préférence de sexe, tarif, animal attribué, date de création) ;
* lien "Consulter" redirigeant vers `/reservations/[id]` pour chaque réservation de la liste ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune action d'écriture ;
* aucune migration de base de données ;
* aucune modification de politique RLS.

### PR28 — Add read-only payments list

Objectif : ajouter un écran privé de liste des paiements en lecture seule.

Contenu principal :
* création de la route privée `/payments` ;
* récupération des paiements directement depuis la table `payments` ;
* filtrage des paiements supprimés avec `deleted_at is null` ;
* affichage du montant formaté (avec devise), du statut (avec badge de couleur), du type, de la méthode, de la date de paiement (ou de création), du contact associé et de la réservation associée ;
* liens simples vers `/contacts/[contact_id]` et `/reservations/[reservation_id]` ;
* ajout de liens de navigation minimaux `Paiements` depuis les en-têtes des autres listes privées (`/candidatures`, `/contacts`, `/reservations`) ;
* gestion de l'état vide ("Aucun paiement trouvé") et d'un message d'erreur neutre en cas de problème de chargement.

Hors périmètre :
* aucune action de création, modification, remboursement ou annulation de paiement ;
* aucune fiche détail de paiement (`/payments/[id]`) ;
* aucun document ou formulaire d'upload lié ;
* aucune jointure complexe Supabase ou vue `payment_overview` ;
* aucune migration de base de données ;
* aucune modification de RLS ou SQL.

### PR30 — Add read-only payment detail screen

Objectif : ajouter une fiche détail de paiement en lecture seule.

Contenu principal :
* création de la route privée `/payments/[id]` ;
* récupération d'un paiement unique directement depuis la table `payments` ;
* filtrage par `id` et exclusion des paiements supprimés avec `deleted_at is null` ;
* affichage en lecture seule du montant, de la devise, du type, du statut, de la méthode, des dates, de la référence externe et des notes ;
* liens simples vers `/contacts/[contact_id]` et `/reservations/[reservation_id]` quand les identifiants existent ;
* gestion neutre de l'état introuvable ou inaccessible ;
* affichage d'un message d'erreur neutre en cas de problème de chargement ;
* ajout d'un lien `Consulter` depuis `/payments` vers `/payments/[id]`.

Validation :
* `pnpm lint` ;
* `pnpm build`.

Hors périmètre :
* aucune action de création, modification, remboursement, annulation, transfert ou suppression de paiement ;
* aucun avoir, upload ou document UI ;
* aucune vue `payment_overview` ;
* aucune migration de base de données ;
* aucune modification de RLS, SQL ou RPC.

### PR32 — Add contact related payments

Objectif : afficher les paiements liés à un contact directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Paiements liés` sur la fiche détail d'un contact (`/contacts/[id]`) ;
* récupération des paiements directement depuis la table `payments` ;
* filtrage par `contact_id` et exclusion des paiements supprimés avec `deleted_at is null` ;
* affichage en lecture seule du montant, du statut, du type, de la méthode et de la date principale ;
* lien `Consulter` redirigeant vers `/payments/[id]` pour chaque paiement ;
* lien vers `/reservations/[reservation_id]` quand une réservation est associée ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune action d'écriture sur les paiements ;
* aucune migration de base de données ;
* aucune modification de RLS, SQL ou RPC ;
* aucune vue Supabase supplémentaire.

### PR33 — Add reservation related payments

Objectif : afficher les paiements liés à une réservation directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Paiements liés` sur la fiche détail d'une réservation (`/reservations/[id]`) ;
* récupération des paiements directement depuis la table `payments` ;
* filtrage par `reservation_id` et exclusion des paiements supprimés avec `deleted_at is null` ;
* affichage en lecture seule du montant, du statut, du type, de la méthode et de la date principale ;
* lien `Consulter` redirigeant vers `/payments/[id]` pour chaque paiement ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune action d'écriture sur les paiements ;
* aucun calcul financier ou rapprochement automatique avec la réservation ;
* aucun changement automatique de statut de réservation ;
* aucune migration de base de données ;
* aucune modification de RLS, SQL ou RPC ;
* aucune vue Supabase supplémentaire.

### PR35 — Add local seed reservation and payment fixtures

Objectif : ajouter des fixtures locales cohérentes pour tester les écrans réservations, paiements et sections de paiements liés.

Contenu principal :
* ajout de fixtures locales dans `supabase/seed.sql` ;
* création d'un contact fictif `Alice Martin` ;
* création d'une candidature Golden Retriever 2026 liée à ce contact ;
* création d'une réservation liée au contact et à la candidature ;
* création d'un paiement d'arrhes payé ;
* création d'un paiement de solde demandé.

Validation :
* `supabase db reset` ;
* `pnpm lint` ;
* `pnpm build`.

Recette locale utile :
* contact Alice Martin : `70000000-0000-4000-8000-000000000001` ;
* candidature : `80000000-0000-4000-8000-000000000001` ;
* réservation : `90000000-0000-4000-8000-000000000001` ;
* paiement arrhes : `a0000000-0000-4000-8000-000000000001` (`payment_type = arrhes`, `status = paid`, `amount_cents = 30000`) ;
* paiement solde : `a0000000-0000-4000-8000-000000000002` (`payment_type = balance`, `status = requested`, `amount_cents = 130000`).

Routes testables localement :
* `/reservations` ;
* `/reservations/90000000-0000-4000-8000-000000000001` ;
* `/payments` ;
* `/payments/a0000000-0000-4000-8000-000000000001` ;
* `/payments/a0000000-0000-4000-8000-000000000002` ;
* `/contacts/70000000-0000-4000-8000-000000000001`.

Note :
hors session authentifiée, les routes privées redirigent vers `/login`.

### PR37 — Add read-only documents list

Objectif : ajouter une liste privée des documents en lecture seule.

Contenu principal :
* création de la route privée `/documents` ;
* récupération des documents directement depuis la table existante `documents` ;
* filtrage des documents supprimés avec `deleted_at is null` ;
* tri des documents par `created_at` décroissant ;
* affichage en lecture seule du titre, du type, du statut, des dates utiles, du fichier renseigné et de l'indication de signature requise ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* liens uniquement vers les routes existantes quand les identifiants sont présents :
  * contact ;
  * candidature ;
  * réservation ;
  * paiement.

Validation :
* `pnpm lint` ;
* `pnpm build`.

Hors périmètre :
* aucune fiche détail `/documents/[id]` ;
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucune UI Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune migration de base de données ;
* aucune modification SQL, RLS ou RPC ;
* aucune vue `document_overview`.

### PR38 — Add local seed document fixtures

Objectif : ajouter des fixtures locales pour rendre `/documents` testable après `supabase db reset`.

Contenu principal :
* ajout de fixtures documents dans `supabase/seed.sql` ;
* création de trois documents seedés :
  * résumé d'appel ;
  * contrat de réservation ;
  * reçu d'arrhes ;
* documents liés aux fixtures Alice Martin, candidature, réservation et paiement d'arrhes ;
* conservation de `file_path = null` pour les documents ;
* métadonnées uniquement, sans fichier réel ;
* aucun Supabase Storage ;
* aucune UI ou route ajoutée.

Validation :
* `supabase db reset` ;
* `pnpm lint` ;
* `pnpm build`.

Recette locale utile :
* résumé d'appel : `b0000000-0000-4000-8000-000000000001` ;
* contrat de réservation : `b0000000-0000-4000-8000-000000000002` ;
* reçu d'arrhes : `b0000000-0000-4000-8000-000000000003`.

Routes testables localement :
* `/documents` ;
* `/contacts/70000000-0000-4000-8000-000000000001` ;
* `/candidatures/80000000-0000-4000-8000-000000000001` ;
* `/reservations/90000000-0000-4000-8000-000000000001` ;
* `/payments/a0000000-0000-4000-8000-000000000001`.

Note :
`/documents` redirige vers `/login` hors session et répond `200` après connexion locale.

### PR40 — Add related documents to contact detail

Objectif : afficher les documents liés à un contact directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Documents liés` sur la fiche détail d'un contact (`/contacts/[id]`) ;
* récupération des documents depuis la table `documents` filtrée par `contact_id` ;
* exclusion des documents supprimés avec `deleted_at is null` ;
* affichage en lecture seule du titre, du type, du statut, d'une date utile, du fichier renseigné et de l'indication de signature requise ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune modification Supabase, migration, SQL, RLS, RPC, vue, seed ou type généré.

### PR41 — Add related documents to application detail

Objectif : afficher les documents liés à une candidature directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Documents liés` sur la fiche détail d'une candidature (`/candidatures/[id]`) ;
* récupération des documents depuis la table `documents` filtrée par `application_id` ;
* exclusion des documents supprimés avec `deleted_at is null` ;
* affichage en lecture seule du titre, du type, du statut, d'une date utile, du fichier renseigné et de l'indication de signature requise ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune modification Supabase, migration, SQL, RLS, RPC, vue, seed ou type généré.

### PR42 — Add related documents to reservation detail

Objectif : afficher les documents liés à une réservation directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Documents liés` sur la fiche détail d'une réservation (`/reservations/[id]`) ;
* récupération des documents depuis la table `documents` filtrée par `reservation_id` ;
* exclusion des documents supprimés avec `deleted_at is null` ;
* affichage en lecture seule du titre, du type, du statut, d'une date utile, du fichier renseigné et de l'indication de signature requise ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune modification Supabase, migration, SQL, RLS, RPC, vue, seed ou type généré.

### PR43 — Add related documents to payment detail

Objectif : afficher les documents liés à un paiement directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Documents liés` sur la fiche détail d'un paiement (`/payments/[id]`) ;
* récupération des documents depuis la table `documents` filtrée par `payment_id` ;
* exclusion des documents supprimés avec `deleted_at is null` ;
* affichage en lecture seule du titre, du type, du statut, d'une date utile, du fichier renseigné et de l'indication de signature requise ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune modification Supabase, migration, SQL, RLS, RPC, vue, seed ou type généré.

### PR44 — Add read-only document detail screen

Objectif : ajouter une fiche détail de document en lecture seule.

Contenu principal :
* création de la route privée `/documents/[id]` ;
* récupération d'un document unique directement depuis la table `documents` ;
* filtrage par `id` et exclusion des documents supprimés avec `deleted_at is null` ;
* affichage en lecture seule du titre, du type, du statut, des dates, des métadonnées fichier, de l'indication de signature requise et des notes ;
* affichage de liens métier uniquement vers les routes existantes quand les identifiants sont présents :
  * contact ;
  * candidature ;
  * réservation ;
  * paiement ;
* ajout d'un lien `Consulter` depuis `/documents` vers `/documents/[id]` ;
* gestion neutre de l'état introuvable ou inaccessible ;
* affichage d'un message d'erreur neutre en cas de problème de chargement.

Validation :
* `pnpm lint` ;
* `pnpm build`.

Hors périmètre :
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucun lien vers animal, portée, template, média, fichier Storage ou route future ;
* aucune modification Supabase, migration, SQL, RLS, RPC, vue, seed ou type généré.

Note :
PR38 est la dernière PR du bloc Documents ayant modifié `supabase/seed.sql`. Les PR40 à PR44 n'ont pas modifié Supabase, migrations, SQL, RLS, RPC, vues, seed ou types générés.

### PR46 — Add read-only litters list

Objectif : démarrer le bloc Portées / Animaux avec une liste privée des portées en lecture seule.

Contenu principal :
* création de la route privée `/litters` ;
* lecture des portées depuis la vue existante `litter_overview` ;
* affichage des informations principales :
  * nom ;
  * groupe ;
  * espèce ;
  * race ;
  * statut ;
  * date utile de naissance ;
  * parents ;
  * nombre d'animaux ;
  * nombre de réservations ;
  * date de création ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucun `/litters/[id]` à ce stade ;
* aucune création, édition ou suppression de portée ;
* aucune attribution animal/réservation ;
* aucun affichage détaillé des animaux liés ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

### PR47 — Add read-only litter detail screen

Objectif : ajouter une fiche détail de portée en lecture seule.

Contenu principal :
* création de la route privée `/litters/[id]` ;
* lecture de la portée depuis la table `litters` avec exclusion des lignes supprimées ;
* complément d'affichage depuis `litter_overview` ;
* affichage en lecture seule :
  * informations générales ;
  * reproduction et gestation ;
  * naissance et compteurs ;
  * notes ;
  * dates techniques ;
* ajout d'un lien `Consulter` depuis `/litters` vers `/litters/[id]` ;
* gestion neutre de l'état introuvable ou inaccessible et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression de portée ;
* aucun animal lié affiché sur la fiche portée ;
* aucune attribution animal/réservation ;
* aucune timeline ;
* aucun Gantt ;
* aucun journal de mise-bas ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

### PR48 — Add read-only animals list

Objectif : ajouter une liste privée des animaux en lecture seule.

Contenu principal :
* création de la route privée `/animals` ;
* lecture des animaux depuis la table `animals` avec exclusion des lignes supprimées ;
* enrichissement depuis `litter_overview` pour la portée et le groupe ;
* enrichissement depuis `animals` pour les noms de la mère et du père ;
* affichage des informations principales :
  * nom ;
  * espèce ;
  * race ;
  * sexe ;
  * statut ;
  * naissance ;
  * portée ;
  * groupe ;
  * parents ;
  * identification ;
  * couleur ou robe ;
  * date de création ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucun `/animals/[id]` à ce stade ;
* aucune création, édition ou suppression d'animal ;
* aucune attribution animal/réservation ;
* aucune réservation depuis animal ;
* aucun document lié aux animaux ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

### PR49 — Add read-only animal detail screen

Objectif : ajouter une fiche détail d'animal en lecture seule.

Contenu principal :
* création de la route privée `/animals/[id]` ;
* lecture de l'animal depuis la table `animals` avec exclusion des lignes supprimées ;
* complément d'affichage depuis `litter_overview` pour la portée ;
* complément d'affichage depuis `animals` pour la mère et le père ;
* affichage en lecture seule :
  * identité ;
  * statut et informations générales ;
  * naissance et filiation ;
  * identification et robe ;
  * collier et suivi ;
  * notes ;
  * dates techniques ;
* ajout d'un lien `Consulter` depuis `/animals` vers `/animals/[id]` ;
* gestion neutre de l'état introuvable ou inaccessible et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression d'animal ;
* aucune attribution animal/réservation ;
* aucune réservation depuis animal ;
* aucun document lié aux animaux ;
* aucune timeline ;
* aucun Gantt ;
* aucun journal de mise-bas ;
* aucun upload ;
* aucune mutation ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

Note :
PR46 à PR49 n'ont modifié aucun élément Supabase : aucune migration, aucun seed, aucune RLS, aucune RPC, aucune vue, aucun type généré et aucune modification de schéma.

### PR51 — Add related animals to litter detail

Objectif : afficher les animaux liés à une portée directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Animaux liés` sur `/litters/[id]` ;
* lecture des animaux depuis la table `animals` filtrée par `litter_id` ;
* exclusion des animaux supprimés avec `deleted_at is null` ;
* affichage en lecture seule :
  * nom ;
  * sexe ;
  * ordre de naissance ;
  * statut ;
  * naissance ;
  * identification ;
  * couleur ou robe ;
* ajout d'un lien `Consulter` vers `/animals/[id]` pour chaque animal lié ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression d'animal ;
* aucune attribution animal/réservation ;
* aucune réservation depuis animal ;
* aucun document lié aux animaux ou aux portées ;
* aucune timeline ;
* aucun Gantt ;
* aucun journal de mise-bas ;
* aucun upload ;
* aucune mutation ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

### PR52 — Add related litter to animal detail

Objectif : afficher la portée liée à un animal directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Portée liée` sur `/animals/[id]` ;
* réutilisation et enrichissement de la lecture depuis `litter_overview` ;
* affichage en lecture seule :
  * nom de portée ;
  * groupe ;
  * espèce ;
  * race ;
  * statut ;
  * dates de naissance ;
  * compteurs ;
* ajout d'un lien `Consulter la portée` vers `/litters/[id]` quand la portée existe ;
* gestion neutre de l'absence de portée liée, d'une portée inaccessible et des erreurs de chargement.

Hors périmètre :
* aucune création, édition ou suppression de portée ;
* aucune création, édition ou suppression d'animal ;
* aucune attribution animal/réservation ;
* aucune réservation depuis animal ;
* aucun document lié aux animaux ou aux portées ;
* aucune timeline ;
* aucun Gantt ;
* aucun journal de mise-bas ;
* aucun upload ;
* aucune mutation ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

Note :
PR51 et PR52 n'ont modifié aucun élément Supabase : aucune migration, aucun seed, aucune RLS, aucune RPC, aucune vue, aucun type généré et aucune modification de schéma.

### PR54 — Add related documents to litter detail

Objectif : afficher les documents liés à une portée directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Documents liés` sur `/litters/[id]` ;
* lecture des documents depuis la table `documents` filtrée par `litter_id` ;
* exclusion des documents supprimés avec `deleted_at is null` ;
* tri par `created_at` décroissant ;
* affichage en lecture seule :
  * titre ;
  * type ;
  * statut ;
  * date utile ;
  * fichier renseigné ou non ;
  * signature requise ou non ;
* ajout d'un lien `Consulter` vers `/documents/[id]` pour chaque document lié ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune création, édition ou suppression de document ;
* aucune mutation ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

### PR55 — Add related documents to animal detail

Objectif : afficher les documents liés à un animal directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Documents liés` sur `/animals/[id]` ;
* lecture des documents depuis la table `documents` filtrée par `animal_id` ;
* exclusion des documents supprimés avec `deleted_at is null` ;
* tri par `created_at` décroissant ;
* affichage en lecture seule :
  * titre ;
  * type ;
  * statut ;
  * date utile ;
  * fichier renseigné ou non ;
  * signature requise ou non ;
* ajout d'un lien `Consulter` vers `/documents/[id]` pour chaque document lié ;
* gestion neutre de l'état vide et des erreurs de chargement.

Hors périmètre :
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune création, édition ou suppression de document ;
* aucune mutation ;
* aucune modification Supabase, migration, seed, RLS, RPC, vue, type généré ou schéma.

Note :
PR54 et PR55 n'ont modifié aucun élément Supabase : aucune migration, aucun seed, aucune RLS, aucune RPC, aucune vue SQL, aucun type généré et aucune modification de schéma.

### PR57 — Add local seed litter and animal fixtures

Objectif : ajouter des fixtures locales stables pour rendre testables les écrans portées et animaux.

Contenu principal :
* ajout d'une portée seedée stable dans `supabase/seed.sql` ;
* ajout d'un animal seedé stable dans `supabase/seed.sql` ;
* rattachement de l'animal à la portée via `litter_id` ;
* rattachement de la portée au groupe de portée local Golden Retriever 2026 ;
* modification limitée à `supabase/seed.sql`.

Validation :
* `supabase db reset` ;
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale utile :
* portée : `c0000000-0000-4000-8000-000000000001` ;
* animal : `d0000000-0000-4000-8000-000000000001`.

Routes testables localement :
* `/litters` ;
* `/litters/c0000000-0000-4000-8000-000000000001` ;
* `/animals` ;
* `/animals/d0000000-0000-4000-8000-000000000001`.

Hors périmètre :
* aucun document lié ;
* aucun code applicatif ;
* aucune modification UI ;
* aucune migration Supabase ;
* aucune modification RLS, RPC, vue SQL, type généré ou package.

### PR58 — Add local seed documents for litter and animal relations

Objectif : ajouter des documents metadata-only pour tester les sections `Documents liés` des fiches portée et animal.

Contenu principal :
* ajout d'un document metadata-only lié à la portée via `documents.litter_id` ;
* ajout d'un document metadata-only lié à l'animal via `documents.animal_id` ;
* conservation de `file_path = null` ;
* aucun vrai fichier ;
* aucun Supabase Storage ;
* modification limitée à `supabase/seed.sql`.

Validation :
* `supabase db reset` ;
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale utile :
* document lié à la portée : `b0000000-0000-4000-8000-000000000004` ;
* document lié à l'animal : `b0000000-0000-4000-8000-000000000005`.

Routes testables localement :
* `/documents` ;
* `/documents/b0000000-0000-4000-8000-000000000004` ;
* `/documents/b0000000-0000-4000-8000-000000000005` ;
* `/litters/c0000000-0000-4000-8000-000000000001` ;
* `/animals/d0000000-0000-4000-8000-000000000001`.

Hors périmètre :
* aucun upload ;
* aucun fichier Storage ;
* aucun vrai fichier ;
* aucun code applicatif ;
* aucune modification UI ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune mutation UI ;
* aucune migration Supabase ;
* aucune modification RLS, RPC, vue SQL, type généré ou package.

### PR60 — Add related reservation to animal detail

Objectif : afficher la réservation liée à un animal directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Réservation liée` sur `/animals/[id]` ;
* lecture depuis `reservation_overview` via `animal_id` ;
* affichage de la réservation la plus récente liée à l'animal ;
* affichage en lecture seule :
  * statut ;
  * contact ;
  * préférence de sexe ;
  * prix ;
  * montant payé ;
  * montant remboursé si pertinent ;
  * date de création ;
* ajout d'un lien `Consulter` vers `/reservations/[id]` ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* modification limitée à `src/app/animals/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune attribution animal ↔ réservation ;
* aucune création, édition ou suppression de réservation ;
* aucun changement de statut ;
* aucune mutation ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

### PR61 — Add related animal to reservation detail

Objectif : afficher l'animal lié à une réservation directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Animal lié` sur `/reservations/[id]` ;
* lecture conditionnelle depuis `animals` via `reservation.animal_id` ;
* affichage des métadonnées animal en lecture seule :
  * nom ;
  * sexe ;
  * statut ;
  * date de naissance ;
  * portée liée ;
  * identification ;
  * couleur ou robe ;
* ajout d'un lien `Consulter` vers `/animals/[id]` ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* modification limitée à `src/app/reservations/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune attribution animal ↔ réservation ;
* aucune création, édition ou suppression de réservation ;
* aucun changement de statut ;
* aucune mutation ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

Note :
PR60 et PR61 n'ont modifié aucun élément Supabase : aucune migration, aucun seed, aucune RLS, aucune RPC, aucune vue SQL, aucun type généré et aucune modification de schéma.

### PR63 — Add related reservation to document detail

Objectif : afficher la réservation liée à un document directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Réservation liée` sur `/documents/[id]` ;
* lecture depuis `reservation_overview` via `document.reservation_id` ;
* affichage des métadonnées réservation en lecture seule :
  * statut ;
  * contact ;
  * animal ;
  * portée ;
  * préférence de sexe ;
  * prix ;
  * montant payé ;
  * montant remboursé si pertinent ;
  * dates de création et de mise à jour ;
* ajout d'un lien `Consulter` vers `/reservations/[id]` ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* modification limitée à `src/app/documents/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune création, édition ou suppression de document ;
* aucune création, édition ou suppression de réservation ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucune signature ;
* aucune génération de document ;
* aucune mutation ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

### PR64 — Add related contact to document detail

Objectif : afficher le contact lié à un document directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Contact lié` sur `/documents/[id]` ;
* lecture depuis `contacts` via `document.contact_id` ;
* affichage des métadonnées contact en lecture seule :
  * nom affichable ;
  * prénom ;
  * nom ;
  * email ;
  * téléphone ;
  * téléphone secondaire ;
  * type de contact ;
  * statut ;
  * origine ;
  * ville ;
  * code postal ;
  * pays ;
* ajout d'un lien `Consulter` vers `/contacts/[id]` ;
* conservation de l'aside `Liens métier` ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* modification limitée à `src/app/documents/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune création, édition ou suppression de contact ;
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucune signature ;
* aucune génération de document ;
* aucune mutation ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

Note :
PR63 et PR64 n'ont modifié aucun élément Supabase : aucune migration, aucun seed, aucune RLS, aucune RPC, aucune vue SQL, aucun type généré et aucune modification de schéma.

## Décisions techniques à conserver

### Statuts métier

Les statuts sont actuellement représentés par :

```sql
text not null
check (status in (...))
```

Ne pas remplacer par des ENUM PostgreSQL en Phase 1 sans décision explicite.

### Contact unique

Le logiciel repose sur une fiche contact unique.

Ne pas créer de tables séparées `prospects` et `adoptants`.

Workflow cible :

```text
Contact unique
→ Candidature
→ Réservation
→ Paiements
→ Documents
→ Chiot attribué
→ Adoption
→ Suivi post-adoption
```

### Formulaire public

Le premier contact avec un futur adoptant doit pouvoir se faire sans création manuelle préalable d’une fiche contact.

Workflow retenu :

```text
Lien formulaire public générique
→ Soumission formulaire
→ Création ou mise à jour contact
→ Création candidature
→ Relecture et qualification par l’éleveur
```

### Périmètre Phase 1

Ne pas introduire en Phase 1 :

* Stripe ;
* Clerk ;
* Firebase ;
* synchronisation Google Agenda ;
* journal de mise-bas offline-first ;
* application mobile native.

## Commandes de validation habituelles

Pour une PR applicative :

```bash
pnpm lint
pnpm build
```

Pour une PR touchant Supabase, migrations, vues ou RLS :

```bash
supabase db reset
pnpm lint
pnpm build
```

Avant chaque commit :

```bash
git status
git diff
```

Après chaque PR fusionnée :

```bash
git switch main
git pull --ff-only
git status
```

## Prochaine étape logique

Le bloc Portées / Animaux / Documents dispose désormais d'un socle privé complet en lecture seule jusqu'aux fiches détail, avec une liaison bidirectionnelle consultative entre portées et animaux, l'affichage des documents liés sur les fiches portée et animal, une liaison consultative Réservation ↔ Animal, des sections enrichies `Contact lié` et `Réservation liée` sur la fiche document, et des fixtures locales permettant de tester ce parcours.

État fonctionnel :
* `/litters` liste les portées existantes ;
* `/litters/[id]` affiche la fiche détail d'une portée ;
* `/litters/[id]` affiche les animaux liés à la portée ;
* `/litters/[id]` affiche les documents liés à la portée ;
* `/animals` liste les animaux existants ;
* `/animals/[id]` affiche la fiche détail d'un animal ;
* `/animals/[id]` affiche la portée liée à l'animal ;
* `/animals/[id]` affiche la réservation liée à l'animal ;
* `/animals/[id]` affiche les documents liés à l'animal ;
* `/reservations/[id]` affiche l'animal lié à la réservation ;
* `/documents/[id]` affiche le contact lié au document ;
* `/documents/[id]` affiche la réservation liée au document ;
* `/documents/[id]` conserve l'aside `Liens métier` ;
* les documents liés pointent vers `/documents/[id]` ;
* les listes `/litters` et `/animals` proposent un lien `Consulter` vers chaque fiche détail ;
* les fixtures locales permettent de tester directement `/litters/c0000000-0000-4000-8000-000000000001` ;
* les fixtures locales permettent de tester directement `/animals/d0000000-0000-4000-8000-000000000001` ;
* les fixtures locales permettent de tester directement `/documents/b0000000-0000-4000-8000-000000000004` ;
* les fixtures locales permettent de tester directement `/documents/b0000000-0000-4000-8000-000000000005` ;
* les pages restent strictement consultatives.

Limites conservées explicitement :
* aucune création de portée ;
* aucune édition de portée ;
* aucune suppression de portée ;
* aucune création d'animal ;
* aucune édition d'animal ;
* aucune suppression d'animal ;
* aucune attribution animal/réservation ;
* aucune réservation depuis animal ;
* aucune création de réservation depuis la fiche animal ;
* aucune édition de réservation ;
* aucun changement de statut de réservation ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune création, édition ou suppression de document ;
* aucune création, édition ou suppression de contact depuis la fiche document ;
* aucune création, édition ou suppression de réservation depuis la fiche document ;
* pas de vrai fichier pour les documents seedés ;
* aucune timeline ;
* aucun Gantt ;
* aucun journal de mise-bas ;
* aucune mutation ;
* aucune migration ;
* aucune RLS ;
* aucune RPC ;
* aucune vue ;
* aucun type généré.

Pistes possibles :
* la liaison consultative Réservation ↔ Animal est désormais en place ;
* les sections enrichies `Contact lié` et `Réservation liée` sont désormais en place sur `/documents/[id]` ;
* enrichir plus tard d'autres relations documentaires uniquement si la relation métier existe déjà et reste en lecture seule ;
* concevoir plus tard l'upload de documents, uniquement après décision explicite ;
* concevoir plus tard la preview de documents, uniquement après décision explicite ;
* concevoir plus tard la génération ou la signature de documents dans une PR dédiée ;
* concevoir plus tard une création contrôlée de réservation ;
* concevoir plus tard l'attribution contrôlée animal ↔ réservation dans une PR dédiée ;
* concevoir plus tard le workflow métier de réservation ;
* concevoir plus tard les workflows applicatifs de création, édition, attribution ou réservation cohérents avec le MVP ;
* conserver toute modification Supabase, migration ou RLS dans une PR séparée et justifiée.
