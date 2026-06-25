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
Dernier état connu : chaîne candidature → réservation → paiement → animal validée globalement, protégée par Playwright, avec quatorze écritures métier contrôlées, création manuelle de contact ajoutée côté espace privé avec validation serveur contre les formulaires vides, sorties finales principales de réservation couvertes côté application, accueil clarifié côté liens rapides statiques, fiches contact et candidature enrichies avec événements liés en lecture seule, fiche réservation clarifiée côté actions finales, notes liées et événements généraux liés aux réservations généralisés en lecture seule, fiches portée et animal enrichies en lecture seule avec documents, réservations, notes et événements liés, fiches paiement et document enrichies avec notes et événements liés en lecture seule, suivi post-adoption en lecture seule enrichi et synthèse d'adoption read-only
Dernier commit connu : `8cd7891e Merge pull request #134 from michaelsolere/fix/manual-contact-empty-validation`
Documentation projet à jour jusqu'à PR134.

Le dépôt contient désormais :

* le schéma Supabase initial de la Phase 1 ;
* les types TypeScript Supabase ;
* un seed local reproductible ;
* le socle applicatif Next.js ;
* un formulaire public de candidature ;
* un écran privé de revue des candidatures ;
* une authentification minimale ;
* un accueil avec liens rapides statiques clarifiés vers les modules privés existants ;
* un compte Auth local de développement ;
* une fiche détail candidature en lecture seule ;
* des actions de qualification de candidature ;
* une action serveur contrôlée pour créer une réservation `draft` depuis une candidature `qualified` ;
* une UX de retour claire autour de la création d'une réservation brouillon depuis une candidature ;
* une action serveur contrôlée pour modifier uniquement le tarif convenu d'une réservation existante (`price_cents`) ;
* une action serveur contrôlée pour modifier ou retirer le commentaire interne d'une réservation existante (`internal_comment`) ;
* une action serveur contrôlée pour modifier ou retirer l’échéance de pré-réservation d’une réservation existante (`pre_reservation_deadline`) ;
* une action serveur contrôlée pour créer un paiement manuel lié à une réservation existante (`createReservationPayment`) ;
* une action serveur contrôlée pour marquer une demande de paiement `requested` comme réglée `paid` (`markPaymentAsPaid`) ;
* une action serveur contrôlée pour confirmer manuellement une réservation `draft` en `active` (`activateReservation`) ;
* une action serveur contrôlée pour finaliser manuellement une réservation `active` en `adopted` (`adoptReservation`) ;
* une action serveur contrôlée pour annuler manuellement une réservation `active` en `cancelled` (`cancelReservation`) ;
* une action serveur contrôlée pour marquer manuellement une réservation `active` en désistement `withdrawn` (`withdrawReservation`) ;
* une action serveur contrôlée pour marquer manuellement une réservation `active` en expirée `expired` (`expireReservation`) ;
* une liste applicative centralisée des statuts finaux de réservation (`FINAL_RESERVATION_STATUSES`) alignée sur le statut SQL `adopted` ;
* un journal de projet `docs/PROJECT_LOG.md` ;
* des notes internes sur la fiche détail d’une candidature ;
* une fiche détail de contact en lecture seule ;
* une liste privée des contacts en lecture seule ;
* une création manuelle de contact depuis l'espace privé via `/contacts/new`, avec refus serveur des formulaires vides ou uniquement remplis par des valeurs par défaut ;
* des liens de navigation croisés entre candidatures et contacts dans l’espace privé ;
* l'affichage des candidatures liées sur la fiche détail d'un contact ;
* la création et l'affichage sécurisé de notes internes sur la fiche d'un contact ;
* l'affichage des événements liés sur la fiche détail d'un contact (`/contacts/[id]`) en lecture seule ;
* un lien direct de retour vers la liste des contacts depuis la fiche détail ;
* une liste privée des réservations en lecture seule (`/reservations`) ;
* une fiche détail de réservation en lecture seule (`/reservations/[id]`) ;
* l'affichage des réservations liées sur la fiche détail d'un contact ;
* l'affichage des réservations liées sur la fiche détail d'une candidature ;
* l'affichage des événements liés sur la fiche détail d'une candidature (`/candidatures/[id]`) en lecture seule ;
* un état d'erreur neutre pour les notes internes de candidature si leur chargement échoue ;
* l'affichage de l'animal lié sur la fiche détail d'une réservation (`/reservations/[id]`) avec lien vers `/animals/[id]` ;
* une liste privée des paiements en lecture seule (`/payments`) ;
* une fiche détail de paiement en lecture seule (`/payments/[id]`) ;
* l'affichage des notes liées sur la fiche détail d'un paiement (`/payments/[id]`) en lecture seule, sans modifier le champ simple `payments.notes` ;
* l'affichage des événements liés sur la fiche détail d'un paiement (`/payments/[id]`) en lecture seule ;
* des liens simples vers les contacts et réservations associés depuis la liste et la fiche détail des paiements ;
* un lien `Consulter` depuis la liste des paiements vers chaque fiche détail ;
* l'affichage des paiements liés sur la fiche détail d'un contact ;
* l'affichage des paiements liés sur la fiche détail d'une réservation ;
* une liste privée des documents en lecture seule (`/documents`) ;
* une fiche détail de document en lecture seule (`/documents/[id]`) ;
* un lien `Consulter` depuis la liste des documents vers chaque fiche détail ;
* des liens simples vers les contacts, candidatures, réservations et paiements associés depuis la liste et la fiche détail des documents ;
* l'affichage du contact lié sur la fiche détail d'un document (`/documents/[id]`) avec lien vers `/contacts/[id]` ;
* l'affichage de la candidature liée sur la fiche détail d'un document (`/documents/[id]`) avec lien vers `/candidatures/[id]` ;
* l'affichage de la réservation liée sur la fiche détail d'un document (`/documents/[id]`) avec lien vers `/reservations/[id]` ;
* l'affichage du paiement lié sur la fiche détail d'un document (`/documents/[id]`) avec lien vers `/payments/[id]` ;
* l'affichage des notes liées sur la fiche détail d'un document (`/documents/[id]`) en lecture seule ;
* l'affichage des événements liés sur la fiche détail d'un document (`/documents/[id]`) en lecture seule ;
* l'harmonisation des headers des sections liées sur la fiche détail document ;
* la conservation de l'ordre principal des sections de la fiche détail document ;
* la conservation de l'aside `Liens métier` sur la fiche détail document ;
* des sections enrichies de document strictement consultatives, sans nouvelle requête, mutation, upload, téléchargement, preview ou génération ;
* l'affichage des documents liés sur les fiches détail d'un contact, d'une candidature, d'une réservation et d'un paiement ;
* une liste privée des portées en lecture seule (`/litters`) ;
* une fiche détail de portée en lecture seule (`/litters/[id]`) ;
* l'affichage des animaux liés sur la fiche détail d'une portée (`/litters/[id]`) ;
* l'affichage des documents liés sur la fiche détail d'une portée (`/litters/[id]`) avec lien vers `/documents/[id]` ;
* l'affichage des notes liées sur la fiche détail d'une portée (`/litters/[id]`) en lecture seule ;
* l'affichage des événements liés sur la fiche détail d'une portée (`/litters/[id]`) en lecture seule ;
* un lien `Consulter` depuis la liste des portées vers chaque fiche détail ;
* une liste privée des animaux en lecture seule (`/animals`) ;
* une fiche détail d'animal en lecture seule (`/animals/[id]`) ;
* l'affichage de la portée liée sur la fiche détail d'un animal (`/animals/[id]`) ;
* l'affichage de la réservation liée sur la fiche détail d'un animal (`/animals/[id]`) avec lien vers `/reservations/[id]` ;
* l'affichage des documents liés sur la fiche détail d'un animal (`/animals/[id]`) avec lien vers `/documents/[id]` ;
* l'affichage des événements liés sur la fiche détail d'un animal (`/animals/[id]`) en lecture seule ;
* l'affichage des notes liées sur la fiche détail d'un animal (`/animals/[id]`) en lecture seule ;
* un lien `Consulter` depuis la liste des animaux vers chaque fiche détail ;
* l'attribution contrôlée d’un animal à une réservation et le retrait contrôlé d’attribution animal/réservation depuis /reservations/[id] ;
* les sorties finales principales de réservation depuis `/reservations/[id]` : `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn` et `active` → `expired` ;
* la distinction métier entre `adopted` (adoption finalisée), `cancelled` (annulation), `withdrawn` (désistement/retrait candidat ou adoptant) et `expired` (réservation active marquée manuellement comme expirée) ;
* une organisation visuelle plus claire des actions de statut sur la fiche réservation, séparant la finalisation positive des sorties finales ;
* un bloc `Statut final` sur la fiche réservation expliquant pourquoi les actions de statut ne sont plus disponibles ;
* une section `Suivi post-adoption` visible sur les réservations adoptées ;
* une lecture seule des événements post-adoption liés à une réservation adoptée, filtrés sur `event_type = 'post_adoption_follow_up'` et `deleted_at is null` ;
* une lecture seule des notes liées à une réservation via `reservation_id`, visible pour tous les statuts de réservation, sans filtre de type post-adoption dédié ;
* une lecture seule des événements généraux liés à une réservation via `reservation_id`, en excluant `post_adoption_follow_up` pour éviter les doublons avec le suivi post-adoption ;
* une hiérarchie visuelle clarifiée dans `Suivi post-adoption`, avec sous-bloc événements et rappel documents ;
* une synthèse d'adoption en lecture seule sur les réservations `adopted`, construite uniquement avec les données déjà chargées ;
* l'affichage des réservations liées sur la fiche détail d'une portée (`/litters/[id]`) avec lien vers `/reservations/[id]` ;
* un test Playwright ciblé sur la confirmation manuelle `draft` → `active`, indépendant du smoke global ;
* des tests Playwright dédiés pour les transitions `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn` et `active` → `expired` ;
* une suite e2e Playwright globale de six tests couvrant le smoke global et les transitions de réservation ciblées ;
* des fixtures locales Portées / Animaux permettant de tester `/litters`, `/litters/[id]`, `/animals`, `/animals/[id]`, la relation portée → animaux et la relation animal → portée ;
* des fixtures locales Documents liées à la portée et à l'animal de démonstration pour tester les sections `Documents liés` sur les fiches portée et animal ;
* des fixtures locales Alice Martin permettant de tester les écrans réservations, paiements, documents et les sections de documents liés ;
* une fixture locale Claire Bernard permettant de tester le parcours candidature qualifiée sans réservation → création d'une réservation brouillon.

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

### PR66 — Add related application to document detail

Objectif : afficher la candidature liée à un document directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Candidature liée` sur `/documents/[id]` ;
* lecture depuis `application_overview` via `document.application_id` ;
* affichage des métadonnées candidature en lecture seule :
  * statut ;
  * espèce ;
  * race ;
  * sexe souhaité ;
  * contact ;
  * email contact ;
  * téléphone contact ;
  * formulaire source ;
  * dates de soumission, de création et de mise à jour ;
  * projet ;
* ajout d'un lien `Consulter` vers `/candidatures/[id]` ;
* conservation des sections `Contact lié` et `Réservation liée` ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* modification limitée à `src/app/documents/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune création, édition ou suppression de candidature ;
* aucune création, édition ou suppression de document ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucune signature ;
* aucune génération de document ;
* aucune mutation ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

### PR67 — Add related payment to document detail

Objectif : afficher le paiement lié à un document directement sur sa fiche détail.

Contenu principal :
* ajout de la section `Paiement lié` sur `/documents/[id]` ;
* lecture depuis `payments` via `document.payment_id` ;
* affichage des métadonnées paiement en lecture seule :
  * statut ;
  * type ;
  * montant ;
  * devise ;
  * méthode ;
  * date utile ;
  * contact lié ;
  * réservation liée ;
  * référence externe ;
  * note ;
* ajout d'un lien `Consulter` vers `/payments/[id]` ;
* conservation des sections `Contact lié`, `Candidature liée` et `Réservation liée` ;
* gestion neutre de l'état vide et des erreurs de chargement ;
* modification limitée à `src/app/documents/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune création, édition ou suppression de paiement ;
* aucun remboursement ;
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
PR63 à PR67 complètent les relations métier principales de la fiche document en lecture seule. La fiche document permet désormais de remonter vers le contact, la candidature, la réservation et le paiement liés, tout en conservant l'aside `Liens métier`. Aucune mutation ni gestion réelle de fichier n'a été ajoutée.

### PR69 — Polish document detail section order and readability

Objectif : harmoniser la lisibilité de la fiche document après les ajouts successifs de sections liées.

Contenu principal :
* ajout du helper local `RelatedSectionHeader` ;
* harmonisation des headers des sections liées :
  * `Contact lié` ;
  * `Candidature liée` ;
  * `Réservation liée` ;
  * `Paiement lié` ;
* conservation de l'ordre principal des sections ;
* conservation de l'aside `Liens métier` ;
* conservation de tous les liens vers les fiches liées :
  * `/contacts/[id]` ;
  * `/candidatures/[id]` ;
  * `/reservations/[id]` ;
  * `/payments/[id]` ;
* suppression de deux lignes peu informatives dans `Paiement lié` :
  * `Contact lié : Renseigné` ;
  * `Réservation liée : Renseignée` ;
* modification limitée à `src/app/documents/[id]/page.tsx`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune nouvelle fonctionnalité ;
* aucune nouvelle requête Supabase ;
* aucun changement de données chargées ;
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
La fiche document couvre désormais les relations métier principales et a été relue puis harmonisée après les ajouts successifs. PR69 n'ajoute aucune nouvelle capacité métier : elle améliore uniquement la lisibilité et la cohérence visuelle.

### PR70 — docs update project log with document detail polish milestone

Objectif : documenter le jalon de finition lisibilité / UX de la fiche document après PR69.

Contenu principal :
* mise à jour de `docs/PROJECT_LOG.md` après l'harmonisation de `/documents/[id]` ;
* documentation du helper local `RelatedSectionHeader` ;
* documentation de l'harmonisation des headers des sections liées ;
* rappel que PR69 n'ajoute aucune capacité métier ;
* rappel qu'aucune nouvelle requête, mutation, migration, RLS, RPC, vue SQL, seed ou type généré n'a été ajouté.

Hors périmètre :
* aucun code applicatif ;
* aucune modification Supabase ;
* aucune modification UI supplémentaire.

### PR71 — Add dashboard quick links

Objectif : rendre l'accueil plus navigable avec des liens rapides vers les modules déjà disponibles.

Contenu principal :
* ajout de liens rapides statiques sur l'accueil vers :
  * Contacts ;
  * Candidatures ;
  * Réservations ;
  * Paiements ;
  * Documents ;
  * Portées ;
  * Animaux ;
* conservation des liens existants vers le formulaire public et la connexion / espace privé ;
* ajustement des textes de l'accueil pour refléter les modules existants ;
* modification limitée à `src/app/page.tsx`.

Hors périmètre :
* aucun Supabase ;
* aucune mutation ;
* aucune nouvelle requête ;
* aucune statistique dynamique ;
* aucune sidebar ;
* aucune refonte globale de navigation.

### PR72 — Create draft reservation from application

Objectif : ajouter la première écriture métier contrôlée du projet en créant une réservation brouillon depuis une candidature qualifiée.

Contenu principal :
* ajout d'une action serveur de création d'une réservation `draft` depuis une candidature `qualified` ;
* relecture de la candidature côté serveur depuis `applications` avant toute insertion ;
* dérivation de `organization_id` et `contact_id` depuis la candidature relue côté serveur ;
* reprise des informations métier disponibles depuis la candidature :
  * espèce ;
  * race ;
  * groupe de portée souhaité ;
  * portée souhaitée si disponible ;
  * préférence de sexe ;
* anti-doublon par candidature via recherche d'une réservation non supprimée existante ;
* ajout du bouton `Créer une réservation brouillon` sur `/candidatures/[id]` uniquement si la candidature est qualifiée et sans réservation liée ;
* retour vers la fiche candidature après création ;
* la réservation créée apparaît dans la section `Réservations liées`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucun paiement créé ;
* aucun document créé ;
* aucune attribution animal créée ;
* aucun changement de statut de candidature ;
* aucune édition de réservation ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

### PR73 — Polish reservation creation feedback

Objectif : clarifier l'expérience utilisateur autour de la création d'une réservation brouillon depuis une candidature.

Contenu principal :
* clarification du message de succès `reservation_status=created` ;
* indication explicite que la réservation apparaît dans la section `Réservations liées` ;
* clarification du cas `already_exists` avec invitation à consulter `Réservations liées` ;
* clarification du cas `not_qualified` ;
* clarification du cas `error` en indiquant qu'aucune donnée n'a été modifiée ;
* amélioration du texte d'aide près du bouton `Créer une réservation brouillon` ;
* rappel qu'aucun paiement, document ou animal n'est créé par cette action.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Hors périmètre :
* aucune modification des règles serveur ;
* aucune nouvelle requête Supabase ;
* aucune nouvelle route ;
* aucun formulaire long ;
* aucune migration ;
* aucune modification Supabase, RLS, RPC, vue SQL, seed ou type généré.

### PR74 — Add application without reservation seed fixture

Objectif : ajouter une fixture locale de QA pour tester le cas candidature qualifiée sans réservation existante.

Contenu principal :
* ajout du contact de démonstration Claire Bernard dans `supabase/seed.sql` ;
* ajout d'une candidature qualifiée liée à Claire Bernard ;
* absence volontaire de réservation liée à cette candidature ;
* modification limitée à `supabase/seed.sql`.

IDs stables utiles :
* organisation seed : `20000000-0000-4000-8000-000000000001` ;
* utilisateur seed : `10000000-0000-4000-8000-000000000001` ;
* contact Claire Bernard : `70000000-0000-4000-8000-000000000002` ;
* candidature Claire Bernard : `80000000-0000-4000-8000-000000000002`.

Routes QA utiles :
* `/candidatures/80000000-0000-4000-8000-000000000002` ;
* `/contacts/70000000-0000-4000-8000-000000000002` ;
* `/reservations`.

Validation :
* `supabase db reset` ;
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* login local avec `owner@saasphase1.invalid` ;
* fiche Claire Bernard accessible sur `/candidatures/80000000-0000-4000-8000-000000000002` ;
* statut candidature : `qualified` ;
* bouton `Créer une réservation brouillon` visible avant création ;
* création effectuée depuis la fiche candidature ;
* message de succès affiché ;
* réservation `draft` visible dans `Réservations liées` ;
* bouton de création masqué après création ;
* réservation visible dans `/reservations` ;
* réservation créée avec :
  * `status = draft` ;
  * `contact_id = 70000000-0000-4000-8000-000000000002` ;
  * `organization_id = 20000000-0000-4000-8000-000000000001` ;
  * `animal_id = null` ;
  * aucun paiement lié ;
  * aucun document lié.

Note :
L'identifiant de réservation créé pendant la recette locale est généré dynamiquement et ne doit pas être documenté comme ID stable du seed.

Hors périmètre :
* aucune réservation seedée pour Claire Bernard ;
* aucun paiement ;
* aucun document ;
* aucun animal ;
* aucune UI ;
* aucune migration ;
* aucune modification RLS, RPC, vue SQL, type généré ou package.

Note :
PR72 à PR74 valident le premier jalon d'écriture métier contrôlée du projet. Le socle n'est plus strictement lecture seule, mais l'écriture reste limitée à un workflow court, relu côté serveur, anti-doublon, et sans paiement, document, animal ou attribution.

### PR76 — Edit reservation price

Objectif : ajouter une deuxième écriture métier contrôlée en permettant de modifier le tarif convenu d'une réservation depuis `/reservations/[id]`.

Contenu principal :
* création de l'action serveur `updateReservationPrice` ;
* édition limitée au champ métier `price_cents` ;
* saisie utilisateur en euros depuis la fiche réservation ;
* conversion serveur du montant en centimes ;
* champ vide accepté pour retirer le tarif convenu (`price_cents = null`) ;
* validation serveur des montants invalides ;
* relecture de la réservation côté serveur avant mise à jour ;
* `organization_id`, `contact_id` et `application_id` non fournis par le client ;
* mise à jour de `updated_by` et `updated_at` ;
* affichage d'un message de succès ou d'erreur neutre après soumission.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` OK ;
* login local avec `owner@saasphase1.invalid` ;
* fiche réservation Alice Martin accessible sur `/reservations/90000000-0000-4000-8000-000000000001` ;
* formulaire `Tarif convenu` visible ;
* saisie `1600,00` validée ;
* message de succès affiché ;
* tarif affiché correctement à `1 600,00 €` sur la fiche réservation ;
* tarif affiché correctement à `1 600,00 €` dans `/reservations` ;
* vérification base locale :
  * `price_cents = 160000` ;
  * `updated_by = 10000000-0000-4000-8000-000000000001` ;
  * `updated_at` renseigné ;
  * `status = active` inchangé ;
  * `animal_id = null` inchangé ;
  * aucun paiement créé ;
  * aucun document créé ;
  * aucun animal attribué ;
* retrait du tarif validé :
  * champ vidé ;
  * message de succès affiché ;
  * affichage `Non renseigné` ;
  * `price_cents = null` en base ;
  * statut inchangé ;
  * aucun paiement, document ou animal créé ;
* valeur invalide `abc` validée :
  * message d'erreur affiché ;
  * `price_cents` inchangé ;
  * aucune autre donnée modifiée.

Hors périmètre :
* aucun changement de statut ;
* aucun paiement créé ;
* aucun document créé ;
* aucune attribution animal ;
* aucune modification de `internal_comment` ;
* aucune modification de `currency` ;
* aucune migration ;
* aucune modification RLS, RPC, SQL, seed ou type généré.

Note :
Le projet dispose désormais de deux écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, puis l'édition limitée du tarif convenu d'une réservation existante. La majorité des pages restent consultatives, avec quelques complétions volontairement courtes, relues côté serveur et validées localement.

### PR78 — Edit reservation internal comment

Objectif : ajouter une troisième écriture métier contrôlée en permettant de modifier ou retirer le commentaire interne d'une réservation depuis `/reservations/[id]`.

Contenu principal :
* création de l'action serveur `updateReservationInternalComment` ;
* édition limitée au champ métier `internal_comment` ;
* lecture directe de `internal_comment` depuis `reservations`, car `reservation_overview` ne l'expose pas ;
* trim du commentaire côté serveur ;
* champ vide accepté pour retirer le commentaire (`internal_comment = null`) ;
* limite serveur à 2 000 caractères ;
* rejet des valeurs trop longues ;
* relecture de la réservation côté serveur avant mise à jour ;
* `organization_id`, `contact_id` et `application_id` non fournis par le client ;
* mise à jour de `updated_by` et `updated_at` ;
* affichage d'un message de succès ou d'erreur neutre après soumission.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` OK ;
* login local avec `owner@saasphase1.invalid` ;
* fiche réservation Alice Martin accessible sur `/reservations/90000000-0000-4000-8000-000000000001` ;
* zone `Commentaire interne de réservation` visible ;
* ajout du commentaire `Client très motivé, à rappeler après confirmation de portée.` validé :
  * message de succès affiché ;
  * commentaire affiché dans la textarea ;
  * `internal_comment` conforme en base ;
  * `updated_by = 10000000-0000-4000-8000-000000000001` ;
  * `updated_at` renseigné ;
  * `status = active` inchangé ;
  * `price_cents = 160000` inchangé ;
  * `animal_id = null` inchangé ;
  * aucune note créée ;
  * aucun paiement, document ou animal créé ;
* modification du commentaire `Projet confirmé, préférence femelle maintenue.` validée :
  * message de succès affiché ;
  * commentaire affiché ;
  * `internal_comment` conforme en base ;
  * aucune note créée ;
* retrait du commentaire validé :
  * champ vidé ;
  * message de succès affiché ;
  * champ vide ;
  * `internal_comment = null` en base ;
  * statut inchangé ;
  * tarif inchangé ;
  * aucun paiement, document, note ou animal créé ;
* valeur trop longue validée :
  * message d'erreur affiché ;
  * commentaire inchangé ;
  * aucune autre donnée modifiée.

Hors périmètre :
* aucun changement de statut ;
* aucune modification du prix ;
* aucune note créée dans la table `notes` ;
* aucun paiement créé ;
* aucun document créé ;
* aucune attribution animal ;
* aucune migration ;
* aucune modification RLS, RPC, SQL, seed ou type généré.

Note :
Le projet dispose désormais de trois écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, l'édition limitée du tarif convenu, puis l'édition limitée du commentaire interne d'une réservation existante. La majorité des pages restent consultatives, avec quelques complétions limitées, relues côté serveur et validées localement.

### PR80 — Edit pre-reservation deadline

Objectif : ajouter une quatrième écriture métier contrôlée en permettant de modifier ou retirer l’échéance de pré-réservation d’une réservation existante depuis `/reservations/[id]`.

Contenu principal :
* création de l'action serveur `updateReservationPreReservationDeadline` ;
* édition limitée au champ métier `pre_reservation_deadline` ;
* lecture directe de `pre_reservation_deadline` depuis `reservations`, car `reservation_overview` ne l'expose pas ;
* champ vide accepté pour remettre `pre_reservation_deadline` à `null` (retrait de l'échéance) ;
* validation serveur du format `YYYY-MM-DD` ;
* rejet des dates invalides calendrier (ex. 2026-02-31, 2026-13-01) avec validation stricte par rapport aux limites réelles des jours et mois ;
* stockage sous forme de `timestamptz` calé à midi UTC (`YYYY-MM-DDT12:00:00.000Z`) pour éviter les glissements de date liés aux fuseaux horaires ;
* relecture de la réservation côté serveur avant mise à jour ;
* `organization_id`, `contact_id` et `application_id` non fournis par le client ;
* mise à jour de `updated_by` et `updated_at` ;
* affichage d'un message de succès ou d'erreur neutre après soumission.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` OK ;
* login local avec `owner@saasphase1.invalid` ;
* fiche réservation Alice Martin accessible sur `/reservations/90000000-0000-4000-8000-000000000001` ;
* section “Priorité et suivi” et zone “Échéance de pré-réservation” visibles ;
* ajout de l'échéance `2026-07-15` validé :
  * message de succès affiché ;
  * date `2026-07-15` affichée dans l'input ;
  * `pre_reservation_deadline = 2026-07-15 12:00:00+00` en base ;
  * `updated_by = 10000000-0000-4000-8000-000000000001` ;
  * `updated_at` renseigné ;
  * `status = active` inchangé ;
  * `price_cents = 160000` inchangé ;
  * `internal_comment` inchangé ;
  * `rank_initial = 1` inchangé ;
  * `rank_active = 1` inchangé ;
  * `animal_id = null` inchangé ;
  * aucune note créée ;
  * aucun paiement, document ou animal créé ;
* modification de l'échéance `2026-07-22` validée :
  * message de succès affiché ;
  * date affichée ;
  * `pre_reservation_deadline = 2026-07-22 12:00:00+00` en base ;
  * status, prix, commentaire, rangs et animal attribué inchangés ;
  * aucune note créée ;
* retrait de l'échéance validé :
  * champ vidé ;
  * message de succès affiché ;
  * champ vide ;
  * `pre_reservation_deadline = null` en base ;
  * status, prix, commentaire, rangs et animal attribué inchangés ;
  * aucun paiement, document, note ou animal créé ;
* date invalide `2026-02-31` validée :
  * message d'erreur affiché ;
  * `pre_reservation_deadline` inchangé en base ;
  * aucune autre donnée modifiée.

Hors périmètre :
* aucun changement de statut ;
* aucune modification de rang ;
* aucune modification du prix ;
* aucune modification du commentaire interne ;
* aucune note créée dans la table `notes` ;
* aucun paiement créé ;
* aucun document créé ;
* aucune attribution animal ;
* aucune migration ;
* aucune modification RLS, RPC, SQL, seed ou type généré.

Note :
Le projet dispose désormais de quatre écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, l'édition limitée du tarif convenu, l'édition limitée du commentaire interne, puis l'édition limitée de l'échéance de pré-réservation d'une réservation existante. La majorité des pages restent consultatives, avec quelques complétions limitées, relues côté serveur et validées localement.

### PR82 — Create payment from reservation

Objectif : ajouter une cinquième écriture métier contrôlée en permettant de créer un paiement manuel lié à une réservation depuis `/reservations/[id]`.

Contenu principal :
* création de l'action serveur `createReservationPayment` ;
* création d'un paiement manuel depuis une réservation existante ;
* résolution sécurisée de `organization_id` et `contact_id` côté serveur par relecture préalable de la réservation en base ;
* liaison automatique à la réservation via le champ `reservation_id` ;
* devise forcée à `EUR` (`currency = 'EUR'`) ;
* `created_by` et `updated_by` automatiquement renseignés avec l'identifiant de l'utilisateur connecté ;
* validation stricte du montant :
  * obligatoire, strictement supérieur à 0 et inférieur ou égal à 1 000 000 € ;
  * séparateur décimal accepté sous forme de virgule ou de point ;
  * maximum 2 décimales ;
  * conversion du montant de l'affichage (euros) en centimes stockés (`amount_cents`) sans dérive flottante (ex. `150,50` -> `15050`) ;
* validation du type de paiement (`payment_type`) : uniquement `arrhes` ou `balance` ;
* validation du statut du paiement (`status`) : uniquement `paid` ou `requested` ;
* validation de la méthode de paiement (`payment_method`) : uniquement `bank_transfer`, `cash`, `card`, `cheque`, `other` ;
* validation de la date du paiement :
  * format `YYYY-MM-DD` obligatoire et rejet des dates calendaires invalides (ex. `2026-02-31`) ;
  * si statut `paid` : `paid_at` calé à midi UTC (`YYYY-MM-DDT12:00:00.000Z`) pour éviter les glissements de fuseaux horaires, `requested_at` et `due_date` laissés à `null` ;
  * si statut `requested` : `requested_at` renseigné à la date et heure courantes, `due_date` calé avec la date saisie, et `paid_at` laissé à `null` ;
* notes associées optionnelles :
  * nettoyées (`trim`) et enregistrées à `null` si le champ est vide ;
  * limite de longueur fixée à 2 000 caractères ;
* revalidation (via `revalidatePath`) de la route réservation, de la liste des réservations et de la liste des paiements ;
* affichage d'un retour utilisateur clair avec message de succès ou d'erreur.

Agrégats :
* les montants financiers `paid_cents` et `refunded_cents` sont calculés dynamiquement dans la vue `reservation_overview` ;
* un paiement de statut `paid` augmente dynamiquement le montant payé `paid_cents` ;
* un paiement de statut `requested` n'augmente pas `paid_cents` (en attente) ;
* aucun agrégat n'est écrit ou mis à jour directement dans la table `reservations`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` exécuté avec succès ;
* login local OK avec `owner@saasphase1.invalid` ;
* fiche réservation Alice Martin accessible sur `/reservations/90000000-0000-4000-8000-000000000001` ;
* création d'un paiement payé validée (montant `150,50`, type `arrhes`, statut `paid`, méthode `bank_transfer`, date `2026-07-10`, notes `Arrhes reçues par virement.`) :
  * message de succès affiché ;
  * paiement visible dans la liste avec lien de consultation opérationnel ;
  * en base : `amount_cents = 15050`, `status = paid`, `paid_at = 2026-07-10 12:00:00+00`, `requested_at = null`, `due_date = null` ;
  * `paid_cents` de la réservation recalculé et mis à jour de `30000` à `45050` ;
  * réservation, statut et tarifs inchangés ;
* création d'un paiement demandé validée (montant `200`, type `balance`, statut `requested`, méthode `cheque`, date `2026-07-20`, notes vides) :
  * message de succès affiché ;
  * paiement visible dans la liste ;
  * en base : `amount_cents = 20000`, `status = requested`, `due_date = 2026-07-20`, `paid_at = null`, `requested_at` renseigné ;
  * `paid_cents` de la réservation inchangé (reste à `45050`) ;
  * notes enregistrées à `null` ;
* erreurs de validation validées localement :
  * montant `12,345` rejeté (trop de décimales) ;
  * montant `0` rejeté ;
  * date invalide `2026-02-31` rejetée côté serveur ;
  * note de plus de 2000 caractères rejetée ;
  * messages d'erreurs visibles, aucun paiement créé en base et données réservations inchangées.

Hors périmètre :
* aucun changement du statut de la réservation ;
* aucune modification de `price_cents` de la réservation ;
* aucune modification de `internal_comment` ;
* aucune modification de `pre_reservation_deadline` ;
* aucun changement des rangs de priorité ;
* aucune note créée dans la table `notes` ;
* aucun document ou reçu créé ;
* aucun remboursement créé ;
* aucune attribution d'animal ;
* aucun paiement en ligne / Stripe ;
* aucune migration de base de données ;
* aucune règle RLS / RPC / SQL modifiée ;
* aucune mise à jour des fixtures/seed ;
* aucun type généré.

Le projet dispose désormais de cinq écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, l'édition limitée du tarif convenu, l'édition limitée du commentaire interne, l'édition limitée de l'échéance de pré-réservation d'une réservation existante, et enfin la création contrôlée d'un paiement manuel. La majorité des pages restent consultatives, avec quelques complétions limitées relues et validées côté serveur.

### PR84 — Mark requested payment as paid

Objectif : ajouter une sixième écriture métier contrôlée en permettant de marquer un paiement `requested` comme `paid` depuis `/payments/[id]`.

Contenu principal :
* création de l'action serveur `markPaymentAsPaid` ;
* transition contrôlée de statut `requested` → `paid` ;
* affichage du formulaire "Marquer comme payé" uniquement sur `/payments/[id]` si le paiement a le statut `requested` ;
* relecture du paiement côté serveur dans `payments` avec vérification RLS/organisation ;
* refus de la transition si le paiement est marqué supprimé (`deleted_at` non nul) ;
* refus de la transition si le statut actuel est différent de `requested` (ex. déjà `paid`, `cancelled`, etc.), en retournant un code `invalid_state` ;
* validation de la date `paid_date` :
  * obligatoire, format `YYYY-MM-DD` ;
  * rejet des dates calendaires invalides (ex. `2026-02-31`) ;
  * stockage dans `paid_at` calé à midi UTC (`YYYY-MM-DDT12:00:00.000Z`) pour éviter les décalages de fuseaux horaires ;
* validation de la méthode de paiement `payment_method` (uniquement `bank_transfer`, `cash`, `card`, `cheque`, `other`) ;
* validation des notes optionnelles :
  * trim et conversion en `null` si le champ est vide ;
  * limite stricte à 2 000 caractères maximum ;
* mise à jour restreinte aux champs métier :
  * `status` (positionné à `'paid'`) ;
  * `paid_at` ;
  * `payment_method` ;
  * `notes` ;
  * `updated_by` (identifiant de l'utilisateur connecté) ;
  * `updated_at` ;
* conservation et immuabilité des champs :
  * `amount_cents` ;
  * `payment_type` ;
  * `currency` ;
  * `requested_at` ;
  * `due_date` ;
  * `organization_id` ;
  * `contact_id` ;
  * `reservation_id` ;
* revalidation (via `revalidatePath`) de la route de détail du paiement, de la liste globale des paiements, et des routes de réservation si `reservation_id` est présent ;
* affichage d'un message de retour utilisateur clair.

Agrégats :
* `paid_cents` est calculé dynamiquement par la vue `reservation_overview` ;
* le passage de `requested` à `paid` fait entrer le montant du paiement dans le calcul de `paid_cents` ;
* dans le scénario de recette, `paid_cents` est bien passé de `30000` à `160000` ;
* aucun agrégat n'est écrit ou stocké directement dans la table `reservations`.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` exécuté avec succès ;
* login local OK ;
* paiement seed demandé utilisé : id `a0000000-0000-4000-8000-000000000002`, status initial `requested`, montant `130000` (1 300,00 €) lié à la réservation d'Alice Martin (id `90000000-0000-4000-8000-000000000001`) ;
* fiche paiement accessible et formulaire "Marquer comme payé" visible avant action ;
* passage à `paid` validé avec succès (date de paiement `2026-07-25`, virement `bank_transfer`, note `"Paiement reçu après relance."`) ;
* après succès : redirection vers `/payments/[id]?payment_mark_status=success` ;
* formulaire disparu de la fiche après la transition réussie vers `paid` ;
* vérification en base : status = `paid`, `paid_at = 2026-07-25 12:00:00+00` (midi UTC), méthode et note correctement mises à jour ;
* champs immuables (`amount_cents`, `payment_type`, `currency`, `requested_at`, `due_date`, `organization_id`, `contact_id`, `reservation_id`) confirmés inchangés ;
* état invalide testé et refusé : tentative de re-soumettre l'action sur le paiement déjà `paid` redirige vers `payment_mark_status=invalid_state` sans aucune modification ;
* erreurs de validation testées et rejetées : date invalide `2026-02-31` et note trop longue (> 2 000 caractères) redirigent vers `payment_mark_status=error` sans altération des données ni des agrégats.

Hors périmètre :
* aucun changement du statut de la réservation ;
* aucune modification de `price_cents` de la réservation ;
* aucune modification de `internal_comment` de la réservation ;
* aucune modification de `pre_reservation_deadline` de la réservation ;
* aucun changement des rangs de priorité ;
* aucune note créée dans la table `notes` ;
* aucun document ou reçu créé ;
* aucun remboursement créé ;
* aucune attribution d'animal ;
* aucun paiement en ligne / Stripe ;
* aucune migration de base de données ;
* aucune règle RLS / RPC / SQL modifiée ;
* aucune mise à jour des fixtures/seed ;
* aucun type généré.

Note :
Le projet dispose désormais de six écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, l'édition limitée du tarif convenu, l'édition limitée du commentaire interne, l'édition limitée de l'échéance de pré-réservation d'une réservation existante, la création contrôlée d'un paiement manuel, et enfin le passage contrôlé d'une demande de paiement à payé. La majorité des pages restent consultatives, avec quelques complétions limitées relues et validées côté serveur.

### PR86 — Assign animal to reservation

Objectif : implémenter l'attribution contrôlée d'un animal existant à une réservation existante depuis `/reservations/[id]`.

Contenu principal :
* Action serveur `assignAnimalToReservation` dans `src/features/reservations/actions.ts` ;
* Validation et filtrage des animaux disponibles côté serveur (dans le composant de page `/reservations/[id]`) ;
* Formulaire d'attribution affiché si la réservation n'a pas d'animal lié et n'est pas dans un statut final ;
* Affichage de l'animal en lecture seule avec lien vers `/animals/[id]` après attribution réussie ;
* Gestion des bannières d’alerte selon le paramètre de recherche `animal_assign_status` (`success`, `error`, `already_assigned`, `animal_unavailable`).

Validations serveur obligatoires :
1. Utilisateur connecté, sinon redirection vers `/login`.
2. Validité des identifiants `reservation_id` et `animal_id` (UUID).
3. Réservation existante, non supprimée et appartenant à l'organisation de l'utilisateur.
4. Réservation dans un statut non final (non `withdrawn`, `cancelled`, `expired`, `archived`).
5. Réservation sans animal déjà attribué.
6. L'animal existe, n'est pas supprimé, appartient à la même organisation et possède un statut compatible (`born`, `active`, `available`).
7. L'animal n'est pas déjà lié à une autre réservation active/non finale (statuts finaux ignorés : `withdrawn`, `cancelled`, `expired`, `archived`).

Champs modifiés :
* `reservations.animal_id`
* `reservations.animal_assigned_at`
* `reservations.updated_by`
* `reservations.updated_at`

Champs et objets explicitement non modifiés :
* `reservations.status` (pas de changement automatique de statut de la réservation)
* Les autres champs de `reservations` (tarif, commentaires, deadlines)
* Aucun paiement, document, note ou fiche animal créé ou altéré.

Limite technique :
* L’unicité animal/réservation est vérifiée côté serveur en Phase 1. Il n'existe pas encore de contrainte SQL unique partielle sur la base de données. Une contrainte SQL pourra être ajoutée plus tard si l'usage multi-utilisateur ou concurrent le justifie.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` exécuté avec succès ;
* Login local OK ;
* Réservation de démonstration testée : `90000000-0000-4000-8000-000000000001` (Alice Martin, active, sans animal initialement) ;
* Animal de démonstration testé : `d0000000-0000-4000-8000-000000000001` (Nala - Démonstration, disponible) ;
* Après succès : redirection vers `/reservations/[id]?animal_assign_status=success` ;
* Formulaire disparu et animal affiché en lecture seule avec lien vers `/animals/[id]` ;
* Vérification en base : `animal_id = d0000000-0000-4000-8000-000000000001`, `animal_assigned_at` et `updated_at` renseignés, `updated_by = 10000000-0000-4000-8000-000000000001` ;
* Non-effets de bord confirmés : statut inchangé, tarif inchangé, aucun paiement/document/note généré ;
* Tests de sécurité : validation de re-soumission bloquée (`already_assigned`), et validation de double réservation de l'animal bloquée (`animal_unavailable`).

Note :
Le projet dispose désormais de sept écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, l'édition limitée du tarif convenu, l'édition limitée du commentaire interne, l'édition limitée de l'échéance de pré-réservation d'une réservation existante, la création contrôlée d'un paiement manuel, le passage contrôlé d'une demande de paiement à payé, et enfin l'attribution contrôlée d'un animal existant à une réservation existante. La majorité des pages restent consultatives, avec quelques complétions limitées relues et validées côté serveur.

### PR88 — Unassign animal from reservation

Objectif : implémenter le retrait contrôlé d’attribution animal/réservation depuis `/reservations/[id]`.

Contenu principal :
* Action serveur `unassignAnimalFromReservation` dans `src/features/reservations/actions.ts` ;
* Bouton discret "Retirer l’attribution" et texte d'aide affiché dans la section "Animal lié" sur la fiche détail de réservation (`/reservations/[id]`) lorsqu'un animal est lié et que le statut n'est pas final ;
* Masquage automatique du bouton de retrait pour les réservations dans un statut final ;
* Gestion des bannières d’alerte selon le paramètre de recherche `animal_unassign_status` (`success`, `error`, `no_animal`, `invalid_state`).

Validations serveur obligatoires :
1. Utilisateur connecté (sinon redirection vers `/login`).
2. Identifiant `reservation_id` présent et valide.
3. Réservation existante, non supprimée et appartenant à l'organisation de l'utilisateur.
4. Réservation possédant actuellement un animal lié (sinon refus avec `no_animal`).
5. Réservation dans un statut non final (refus au minimum pour `completed`, `withdrawn`, `cancelled`, `expired`, `archived` avec `invalid_state`).
6. Conservation de l'ancien `animal_id` côté serveur avant la mise à `null` pour déclencher une revalidation de sa fiche `/animals/${animalId}`.

Champs modifiés :
* `reservations.animal_id = null`
* `reservations.animal_assigned_at = null`
* `reservations.updated_by = user.id`
* `reservations.updated_at = now()`

Champs et objets explicitement non modifiés :
* `reservations.status` (pas de changement automatique de statut de la réservation)
* Les autres champs de `reservations` (tarif, commentaire interne, échéance de pré-réservation)
* Les paiements, documents, notes, remboursements et données de l'animal.

Validation :
* `pnpm lint` ;
* `pnpm build` ;
* `git diff --check`.

Recette locale validée :
* `supabase db reset` exécuté avec succès ;
* `pnpm dev` démarré localement ;
* Réservation de démonstration testée : `90000000-0000-4000-8000-000000000001` (Alice Martin, active) ;
* Animal de démonstration testé : `d0000000-0000-4000-8000-000000000001` ;
* Scénario préparatoire d'attribution validé (animal attribué avec succès, formulaire d'attribution masqué, bouton de retrait et texte d'aide visibles) ;
* Scénario principal de retrait validé avec succès (redirection vers `/reservations/[id]?animal_unassign_status=success`, bandeau de succès visible, retour de la section à l'état sans animal avec formulaire d'attribution à nouveau disponible, animal non supprimé et toujours consultable sur sa fiche `/animals/[id]`) ;
* Vérification en base après retrait : `animal_id` et `animal_assigned_at` repassés à `null`, `updated_by` et `updated_at` correctement mis à jour, autres champs et tables liés (statuts, paiements, documents, notes) inchangés ;
* Scénario `no_animal` testé et bloqué (redirection vers `animal_unassign_status=no_animal`, aucune donnée modifiée) ;
* Scénario `invalid_state` testé et bloqué en changeant temporairement le statut à `archived` (redirection vers `animal_unassign_status=invalid_state`, modification refusée).

Note :
Le projet dispose désormais de huit écritures métier contrôlées : la création d'une réservation brouillon depuis une candidature qualifiée, l'édition limitée du tarif convenu, l'édition limitée du commentaire interne, l'édition limitée de l'échéance de pré-réservation d'une réservation existante, la création contrôlée d'un paiement manuel, le passage contrôlé d'une demande de paiement à payé, l'attribution contrôlée d'un animal existant à une réservation existante, et enfin le retrait contrôlé d'attribution animal/réservation. La majorité des pages restent consultatives, avec des complétions limitées relues et validées côté serveur.

## Recette globale complète validée

Cette recette documente le point de stabilité local du parcours complet candidature → réservation → paiement → animal, après validation sur `main`.

Contexte de validation :
* branche testée : `main` ;
* dernier commit testé : `726b4cc2 Merge PR89: Update project log with animal unassignment milestone` ;
* base locale réinitialisée avec `supabase db reset` ;
* application locale lancée avec `pnpm dev` ;
* compte local utilisé : `owner@saasphase1.invalid`.

Données testées :
* candidature Claire Bernard : `80000000-0000-4000-8000-000000000002` ;
* contact Claire Bernard : `70000000-0000-4000-8000-000000000002` ;
* réservation créée : `efbb86f3-cea7-4d81-93a5-8c911b8166c5` ;
* paiement créé : `9794a489-bd6a-4d94-aa99-eb4bfd3c2ddf` ;
* animal : `d0000000-0000-4000-8000-000000000001`.

Parcours principal validé :
* connexion au compte local OK ;
* accès aux pages privées OK ;
* candidature Claire Bernard affichée avec le statut `qualified` OK ;
* aucune réservation initiale liée à la candidature OK ;
* création d'une réservation brouillon depuis la candidature OK ;
* réservation créée en `draft`, avec `application_id` et `contact_id` corrects, `animal_id = null` ;
* tarif convenu mis à jour à `185000` centimes OK ;
* commentaire interne mis à jour à `Projet d’adoption validé pour Nala.` OK ;
* échéance de pré-réservation mise à `2026-07-15 12:00:00+00` OK ;
* retrait de l'échéance de pré-réservation à `null` OK ;
* paiement manuel demandé créé avec `amount_cents = 20000`, `status = requested`, `payment_type = arrhes` OK ;
* passage du paiement à `paid` OK ;
* paiement payé avec `paid_at = 2026-07-20 12:00:00+00` ;
* `payment_method = bank_transfer` ;
* note de paiement mise à `Arrhes reçues.` ;
* agrégat `paid_cents = 20000` sur `reservation_overview` ;
* attribution de l'animal à la réservation OK ;
* fiche animal affichant la réservation liée OK ;
* retrait de l'attribution animal/réservation OK ;
* fiche animal après retrait OK, avec absence de réservation liée et données propres de l'animal conservées.

Synthèse base finale :
* `reservation.status = draft` ;
* `reservation.price_cents = 185000` ;
* `reservation.internal_comment = Projet d’adoption validé pour Nala.` ;
* `reservation.pre_reservation_deadline = null` ;
* `reservation.animal_id = null` ;
* `reservation.animal_assigned_at = null` ;
* `paid_cents = 20000` ;
* `refunded_cents = 0` ;
* nombre de paiements liés à la réservation : `1` ;
* documents liés à la réservation : `0` ;
* documents liés au paiement : `0` ;
* notes liées à la réservation : `0` ;
* remboursements non applicables car la table `refunds` est absente du schéma local ;
* animal inchangé après attribution puis retrait.

Non-effets de bord confirmés :
* aucun document créé automatiquement ;
* aucune note créée automatiquement ;
* aucun remboursement créé ;
* aucun animal créé, modifié ou supprimé ;
* aucun statut de réservation modifié automatiquement ;
* aucun fichier du dépôt modifié pendant la recette.

Cas d'erreur testés ou vérifiés :
* réservation déjà existante : création protégée par l'UI, garde serveur confirmée par lecture du code ;
* tarif invalide : rejeté, tarif inchangé ;
* commentaire trop long : rejeté, commentaire inchangé ;
* échéance invalide : bloquée côté input HTML `date` avant soumission ;
* paiement à montant nul : rejeté, aucun paiement supplémentaire créé ;
* paiement déjà payé : formulaire de passage à payé masqué, garde serveur confirmée par lecture du code ;
* animal déjà attribué : protégé par l'UI et l'état serveur ;
* retrait sans animal : bouton masqué, garde serveur confirmée par lecture du code ;
* retrait sur statut final : non testé faute de fixture finale sans manipulation directe.

État courant après recette :
* le projet dispose de huit écritures métier contrôlées ;
* la chaîne candidature → réservation → paiement → animal est validée globalement ;
* le prochain bloc fonctionnel peut être choisi après ce point de stabilité, sans urgence à ajouter une nouvelle écriture métier.

Prochaines étapes possibles après ce point :
* ajouter plus tard des tests automatisés Playwright sur le parcours global ;
* concevoir plus tard les statuts de réservation et leurs transitions métier ;
* concevoir plus tard les remboursements ;
* concevoir plus tard les reçus et documents générés ;
* envisager plus tard une contrainte SQL d'unicité animal/réservation si l'usage concurrent devient un risque concret.

## PR92 — Activate draft reservation

Objectif : ajouter une transition manuelle contrôlée `draft` → `active` depuis `/reservations/[id]`.

Cette PR introduit la première transition explicite de statut de réservation, sans workflow complet de statuts et sans automatisme métier lié aux paiements ou à l'attribution animal.

Action serveur ajoutée :
* `activateReservation` ;
* relit la réservation côté serveur avant toute écriture ;
* exige un utilisateur connecté ;
* exige un identifiant de réservation valide ;
* exige une réservation existante ;
* exige une réservation non supprimée ;
* exige une réservation appartenant à l'organisation accessible à l'utilisateur ;
* exige un statut courant strictement égal à `draft` ;
* refuse sans modifier si la réservation n'est plus en `draft`.

Champs modifiés par la transition :
* `status = active` ;
* `reservation_confirmed_at = now()` ;
* `updated_at = now()` ;
* `updated_by = user.id`.

Non-effets de bord confirmés :
* aucun paiement créé ;
* aucun document créé ;
* aucune note créée ;
* aucune attribution animal créée ou modifiée ;
* aucun tarif modifié ;
* aucun commentaire interne modifié ;
* aucune échéance de pré-réservation modifiée ;
* aucun changement Supabase ;
* aucun seed ;
* aucune migration ;
* aucun changement RLS/RPC/SQL ;
* aucun statut `completed` introduit.

UI ajoutée sur `/reservations/[id]` :
* bouton `Confirmer la réservation` visible uniquement si `status === "draft"` ;
* texte d'aide indiquant que l'action ne crée ni paiement, ni document, ni attribution animal ;
* message de succès après activation ;
* message neutre si la réservation ne peut pas être confirmée dans son état actuel ;
* bouton masqué après passage en `active`.

Test Playwright dédié :
* fichier `tests/e2e/z-activate-draft-reservation.spec.ts` ;
* test indépendant du smoke global ;
* création d'une candidature qualifiée dédiée au test ;
* création d'une réservation brouillon via l'UI existante ;
* activation de la réservation depuis `/reservations/[id]` ;
* vérifications UI : bouton visible en `draft`, message de succès, statut `active`, bouton disparu ;
* vérifications base : `status = active`, `reservation_confirmed_at` renseigné, `updated_at` renseigné, `updated_by` renseigné ;
* vérification que `price_cents` et `animal_id` restent inchangés ;
* vérification qu'aucun paiement, document ou note n'est créé.

État courant après PR92 :
* le projet dispose de neuf écritures métier contrôlées ;
* la neuvième écriture est la confirmation manuelle d'une réservation `draft` en `active` ;
* la chaîne candidature → réservation → paiement → animal reste protégée par le smoke Playwright global ;
* la transition `draft` → `active` est manuelle et non automatique.

Limites conservées :
* pas de workflow complet de statuts ;
* pas de passage automatique en `active` après paiement ;
* pas de passage automatique en `active` après attribution animal ;
* pas de statut `completed` ajouté ;
* `adopted` reste le statut final accepté par la base, avec la décision `adopted` vs `completed` à traiter plus tard ;
* pas de migration de statuts.

Prochaines pistes :
* documenter plus tard la décision `adopted` vs `completed` ;
* concevoir plus tard les transitions `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn`, etc. ;
* conserver toute nouvelle transition dans une PR courte, prudente et testée.

## PR94 — Align final reservation statuses

Objectif : clarifier les statuts finaux applicatifs de réservation et aligner le code avec le check SQL existant.

Décision métier et technique :
* `adopted` est conservé comme statut final réel de réservation adoptée/finalisée ;
* `completed` n'est pas accepté par le check SQL actuel de `reservations.status` ;
* `completed` ne doit pas être utilisé comme statut réel de réservation ;
* `adopted` dispose déjà d'un label UI clair : `Adopté` ;
* le champ `adoption_completed_at` peut exister comme date métier, mais ce n'est pas un statut.

Liste finale retenue côté code :
* `adopted` ;
* `withdrawn` ;
* `cancelled` ;
* `expired` ;
* `archived`.

Changements applicatifs :
* ajout de `FINAL_RESERVATION_STATUSES` ;
* ajout de `isFinalReservationStatus` ;
* utilisation de cette logique dans les actions serveur de réservation ;
* utilisation de cette logique dans l'UI `/reservations/[id]` ;
* alignement des gardes d'attribution animal ;
* alignement des gardes de retrait d'attribution animal ;
* alignement du masquage UI des actions interdites sur statut final ;
* alignement de la détection des animaux déjà liés à des réservations non finales.

Non-effets de bord confirmés :
* aucune migration ;
* aucun changement du check SQL ;
* aucun changement Supabase ;
* aucun seed ;
* aucun type généré ;
* aucun package ;
* aucune documentation autre que `docs/PROJECT_LOG.md` dans la PR documentaire associée ;
* aucun nouveau test Playwright ;
* aucune nouvelle transition métier ;
* aucun renommage de `adopted` ;
* aucun ajout de `completed`.

État courant après PR94 :
* le projet dispose toujours de neuf écritures métier contrôlées ;
* les statuts finaux de réservation sont centralisés côté code ;
* la cohérence `adopted` / `completed` est clarifiée côté application ;
* `adopted` est le statut final d'adoption retenu à ce stade.

Limites conservées :
* pas de workflow complet de statuts ;
* pas de transition `active` → `adopted` encore implémentée ;
* pas de transition `active` → `cancelled` encore implémentée ;
* pas de transition `active` → `withdrawn` encore implémentée ;
* pas de migration de statuts ;
* pas d'ENUM PostgreSQL ;
* pas de statut `completed`.

Prochaines pistes :
* concevoir plus tard la transition contrôlée `active` → `adopted` ;
* concevoir plus tard les transitions d'annulation, retrait et expiration ;
* documenter ou tester plus tard les comportements interdits sur réservation `adopted` si nécessaire ;
* conserver toute nouvelle transition dans une PR courte, prudente et testée.

## PR96 — Adopt active reservation

Objectif : ajouter une transition manuelle contrôlée `active` → `adopted` depuis `/reservations/[id]`.

Cette PR introduit la finalisation positive d'une adoption. La transition reste volontairement manuelle : elle ne dépend pas automatiquement d'un paiement complet, d'une attribution animal ou d'un document généré.

Action serveur ajoutée :
* `adoptReservation` ;
* relit la réservation côté serveur avant toute écriture ;
* exige un utilisateur connecté ;
* exige un identifiant de réservation valide ;
* exige une réservation existante ;
* exige une réservation non supprimée ;
* exige une réservation appartenant à l'organisation accessible à l'utilisateur ;
* exige un statut courant strictement égal à `active` ;
* refuse sans modifier si la réservation n'est plus en `active`.

Champs modifiés par la transition :
* `status = adopted` ;
* `adoption_completed_at = now()` ;
* `updated_at = now()` ;
* `updated_by = user.id`.

Champs et objets explicitement non modifiés :
* `reservation_confirmed_at` ;
* `animal_id` ;
* `animal_assigned_at` ;
* `price_cents` ;
* `internal_comment` ;
* `pre_reservation_deadline` ;
* paiements ;
* documents ;
* reçus ;
* notes ;
* remboursements ;
* animal ;
* attribution animal ;
* schéma Supabase ;
* seed data.

UI ajoutée sur `/reservations/[id]` :
* bouton `Finaliser l’adoption` visible uniquement si `status === "active"` ;
* texte d'aide indiquant que l'action ne crée ni paiement, ni document, ni note, ni modification d'animal ;
* message de succès après adoption ;
* message neutre si la réservation ne peut pas être finalisée dans son état actuel ;
* bouton masqué après passage en `adopted` ;
* statut affiché `Adopté`.

Test Playwright dédié :
* fichier `tests/e2e/z-adopt-active-reservation.spec.ts` ;
* test indépendant du smoke global ;
* création d'une candidature qualifiée dédiée au test ;
* création d'une réservation brouillon via l'UI existante ;
* confirmation `draft` → `active` via l'UI existante ;
* finalisation `active` → `adopted` ;
* vérifications UI : bouton visible en `active`, message de succès, statut `Adopté`, bouton disparu ;
* vérifications base : `status = adopted`, `adoption_completed_at` renseigné, `updated_at` renseigné, `updated_by` renseigné ;
* vérification que `reservation_confirmed_at`, `animal_id`, `animal_assigned_at`, `price_cents`, `internal_comment` et `pre_reservation_deadline` restent inchangés ;
* vérification qu'aucun paiement, document ou note n'est créé.

État courant après PR96 :
* le projet dispose de dix écritures métier contrôlées ;
* la dixième écriture est la finalisation manuelle d'une réservation `active` en `adopted` ;
* la chaîne candidature → réservation → paiement → animal reste protégée par le smoke Playwright global ;
* la transition `active` → `adopted` est protégée par un test Playwright dédié ;
* `adopted` reste le statut final réel d'adoption ;
* `completed` n'est pas utilisé comme statut de réservation.

Limites conservées :
* pas d'adoption automatique après paiement ;
* pas d'adoption automatique après attribution animal ;
* pas d'exigence de paiement complet à ce stade ;
* pas d'exigence d'animal attribué à ce stade ;
* pas de document généré ;
* pas de reçu ;
* pas de note automatique ;
* pas de remboursement ;
* pas de modification animal ;
* pas de workflow complet de statuts ;
* pas de migration ;
* pas d'ENUM PostgreSQL ;
* pas de statut `completed`.

Prochaines pistes :
* concevoir plus tard `active` → `cancelled` ;
* concevoir plus tard `active` → `withdrawn` ;
* concevoir plus tard `active` → `expired` ;
* décider plus tard si `active` → `adopted` doit exiger solde payé et/ou animal attribué ;
* concevoir plus tard les documents ou reçus liés à l'adoption ;
* conserver toute transition dans une PR courte, prudente et testée.

## PR98 — Add active reservation cancellation

Objectif : ajouter une transition manuelle contrôlée `active` → `cancelled` depuis `/reservations/[id]`.

Action serveur ajoutée :
* `cancelReservation` ;
* relit la réservation côté serveur avant toute écriture ;
* exige un utilisateur connecté ;
* exige un identifiant de réservation valide ;
* exige une réservation existante, non supprimée et appartenant à l'organisation accessible à l'utilisateur ;
* autorise uniquement le statut courant `active` ;
* refuse sans modifier tout autre état.

UI ajoutée sur `/reservations/[id]` :
* bouton `Annuler la réservation` visible uniquement si `status === "active"` ;
* message de succès après annulation ;
* message neutre si la réservation ne peut pas être annulée dans son état actuel ;
* bouton masqué après passage en `cancelled`.

Non-effets de bord :
* aucun remboursement ;
* aucun paiement modifié ;
* aucun document créé ;
* aucune note créée ;
* aucun animal modifié ;
* aucune attribution animal modifiée ou retirée automatiquement ;
* aucun tarif, commentaire interne ou échéance de pré-réservation modifié.

Test Playwright dédié :
* fichier `tests/e2e/z-cancel-active-reservation.spec.ts` ;
* test indépendant du smoke global ;
* création d'une candidature qualifiée dédiée au test ;
* création d'une réservation brouillon via l'UI existante ;
* confirmation `draft` → `active` via l'UI existante ;
* annulation `active` → `cancelled` ;
* vérifications UI et base ;
* vérification qu'aucun paiement, document ou note n'est créé.

## PR99 — Add active reservation withdrawal

Objectif : ajouter une transition manuelle contrôlée `active` → `withdrawn` depuis `/reservations/[id]`.

Décision métier :
* `withdrawn` correspond au désistement ou retrait du candidat ou adoptant ;
* `withdrawn` est distinct de `cancelled`, qui correspond à l'annulation d'une réservation active.

Action serveur ajoutée :
* `withdrawReservation` ;
* relit la réservation côté serveur avant toute écriture ;
* exige un utilisateur connecté ;
* exige un identifiant de réservation valide ;
* exige une réservation existante, non supprimée et appartenant à l'organisation accessible à l'utilisateur ;
* autorise uniquement le statut courant `active` ;
* refuse sans modifier tout autre état.

UI ajoutée sur `/reservations/[id]` :
* bouton `Marquer comme désistée` visible uniquement si `status === "active"` ;
* message de succès après désistement ;
* message neutre si la réservation ne peut pas être marquée comme désistée dans son état actuel ;
* bouton masqué après passage en `withdrawn`.

Non-effets de bord :
* aucun remboursement ;
* aucun avoir ;
* aucun paiement modifié ;
* aucun document créé ;
* aucune note créée ;
* aucun animal modifié ;
* aucune attribution animal modifiée ou retirée automatiquement ;
* aucun tarif, commentaire interne ou échéance de pré-réservation modifié.

Test Playwright dédié :
* fichier `tests/e2e/z-withdraw-active-reservation.spec.ts` ;
* test indépendant du smoke global ;
* création d'une candidature qualifiée dédiée au test ;
* création d'une réservation brouillon via l'UI existante ;
* confirmation `draft` → `active` via l'UI existante ;
* désistement `active` → `withdrawn` ;
* vérifications UI et base ;
* vérification qu'aucun paiement, document ou note n'est créé.

## PR100 — Add active reservation expiration

Objectif : ajouter une transition manuelle contrôlée `active` → `expired` depuis `/reservations/[id]`.

Décision métier :
* `expired` correspond à une réservation active marquée manuellement comme expirée ;
* cette expiration est volontairement manuelle à ce stade ;
* aucune automatisation liée à `pre_reservation_deadline` n'est introduite ;
* aucun cron ni tâche planifiée n'est introduit.

Action serveur ajoutée :
* `expireReservation` ;
* relit la réservation côté serveur avant toute écriture ;
* exige un utilisateur connecté ;
* exige un identifiant de réservation valide ;
* exige une réservation existante, non supprimée et appartenant à l'organisation accessible à l'utilisateur ;
* autorise uniquement le statut courant `active` ;
* refuse sans modifier tout autre état.

UI ajoutée sur `/reservations/[id]` :
* bouton `Marquer comme expirée` visible uniquement si `status === "active"` ;
* message de succès après expiration ;
* message neutre si la réservation ne peut pas être marquée comme expirée dans son état actuel ;
* bouton masqué après passage en `expired`.

Non-effets de bord :
* aucun remboursement ;
* aucun avoir ;
* aucun paiement modifié ;
* aucun document créé ;
* aucune note créée ;
* aucun animal modifié ;
* aucune attribution animal modifiée ou retirée automatiquement ;
* aucune automatisation liée à `pre_reservation_deadline` ;
* aucun cron ;
* aucune tâche planifiée ;
* aucun tarif, commentaire interne ou échéance de pré-réservation modifié.

Test Playwright dédié :
* fichier `tests/e2e/z-expire-active-reservation.spec.ts` ;
* test indépendant du smoke global ;
* création d'une candidature qualifiée dédiée au test ;
* création d'une réservation brouillon via l'UI existante ;
* confirmation `draft` → `active` via l'UI existante ;
* expiration `active` → `expired` ;
* vérifications UI et base ;
* vérification qu'aucun paiement, document ou note n'est créé.

État courant après PR100 :
* le projet dispose de treize écritures métier contrôlées ;
* les sorties finales principales de réservation sont couvertes côté application : `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn` et `active` → `expired` ;
* le parcours global candidature → réservation → paiement → animal reste protégé par le smoke Playwright global ;
* les transitions `draft` → `active`, `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn` et `active` → `expired` sont protégées par des tests Playwright dédiés ;
* la suite e2e globale contient six tests ;
* `completed` n'est pas utilisé comme statut de réservation.

Limites conservées :
* pas d'automatisation de statut ;
* pas d'expiration automatique basée sur `pre_reservation_deadline` ;
* pas de cron ;
* pas de tâche planifiée ;
* pas de remboursement ;
* pas d'avoir ;
* pas de génération de document ou reçu ;
* pas de note automatique ;
* pas de modification de paiement ;
* pas de modification animal ;
* pas de retrait automatique d'attribution animal ;
* pas de migration ;
* pas d'ENUM PostgreSQL ;
* pas de statut `completed`.

Prochaines pistes :
* améliorer plus tard l'ergonomie de la fiche réservation maintenant que les actions finales sont nombreuses ;
* ajouter éventuellement une section de synthèse des actions disponibles sur la fiche réservation ;
* documenter plus tard un nouveau fichier de reprise complet si nécessaire ;
* conserver toute nouvelle transition ou automatisation dans une PR courte, prudente et testée.

## PR102 — Polish reservation final actions layout

Objectif : améliorer la lisibilité de la fiche réservation autour des actions de statut, sans changement métier.

Changements UI sur `/reservations/[id]` :
* regroupement des actions de statut dans une section dédiée ;
* séparation plus claire entre la finalisation positive et les sorties finales ;
* conservation des actions serveur existantes ;
* conservation des conditions d'affichage et des libellés de boutons existants.

Non-effets de bord :
* aucune nouvelle action métier ;
* aucun nouveau statut ;
* aucun changement serveur ;
* aucun changement Supabase ;
* aucun changement de test.

## PR103 — Add final reservation status summary

Objectif : expliquer l'absence d'actions de statut lorsqu'une réservation est dans un statut final.

Changement UI sur `/reservations/[id]` :
* ajout d'un bloc `Statut final` visible uniquement si la réservation est finale ;
* réutilisation de la logique `isFinalReservationStatus` ;
* réutilisation du libellé de statut existant ;
* texte indiquant que les actions de statut ne sont plus disponibles.

Non-effets de bord :
* aucune mutation ;
* aucune nouvelle action serveur ;
* aucun changement de statut ;
* aucun changement des tests Playwright existants.

## PR104 — Add post-adoption follow-up placeholder

Objectif : amorcer le suivi post-adoption en lecture seule, sans créer de module complet.

Changement UI sur `/reservations/[id]` :
* ajout d'une section `Suivi post-adoption` visible uniquement si `reservation.status === "adopted"` ;
* placeholder indiquant que cet espace centralisera plus tard les nouvelles de l'adoptant, rappels, documents ou photos, événements et notes de suivi ;
* état vide `Aucun suivi post-adoption enregistré pour le moment.` ;
* rappel que les documents déjà liés restent visibles dans la section `Documents liés`.

Non-effets de bord :
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune requête Supabase supplémentaire ;
* aucune création, édition ou suppression de suivi.

## PR105 — Show post-adoption follow-up events

Objectif : enrichir la section `Suivi post-adoption` avec une première lecture réelle des événements existants, strictement en lecture seule.

Lecture ajoutée sur `/reservations/[id]` :
* table `events` ;
* filtre `reservation_id = reservation.id` ;
* filtre `event_type = "post_adoption_follow_up"` ;
* filtre `deleted_at is null` ;
* tri `created_at` décroissant ;
* sélection limitée aux champs utiles d'affichage.

UX obtenue :
* la section reste visible uniquement pour une réservation `adopted` ;
* message neutre si le suivi post-adoption ne peut pas être chargé ;
* liste simple des événements existants si présents ;
* état vide conservé si aucun événement n'existe ;
* aucun bouton ou formulaire d'ajout.

Non-effets de bord :
* aucun ajout d'événement ;
* aucune modification d'événement ;
* aucune suppression d'événement ;
* aucun changement de statut réservation ;
* aucun changement animal, contact, document ou paiement ;
* aucun changement Supabase, migration, seed, type généré ou package.

État courant après PR105 :
* la fiche réservation est plus lisible pour les actions finales ;
* les statuts finaux expliquent explicitement l'absence d'actions de statut ;
* le suivi post-adoption est amorcé en lecture seule ;
* la lecture réelle des événements post-adoption existe sans nouvelle écriture métier ;
* le projet conserve treize écritures métier contrôlées ;
* la suite e2e Playwright globale reste composée de six tests.

Limites conservées :
* pas de création, édition ou suppression d'événement post-adoption ;
* pas de formulaire de suivi post-adoption ;
* pas d'upload ;
* pas de notification ;
* pas d'automatisation ;
* pas de modification du seed pour couvrir un événement post-adoption ;
* pas de test e2e post-adoption dédié à ce stade.

Prochaines pistes :
* concevoir plus tard un vrai module de suivi post-adoption si le modèle métier est stabilisé ;
* ajouter plus tard une fixture ou un test e2e post-adoption seulement si un scénario fiable est défini ;
* conserver toute écriture de suivi post-adoption dans une PR séparée, courte et validée.

## PR107 — Show related notes after adoption

Objectif : enrichir la section `Suivi post-adoption` avec une lecture seule des notes liées à la réservation adoptée.

Lecture ajoutée sur `/reservations/[id]` :
* table `notes` ;
* filtre `reservation_id = reservation.id` ;
* filtre `deleted_at is null` ;
* tri `created_at` décroissant ;
* sélection limitée aux champs utiles d'affichage ;
* aucun filtre `note_type` post-adoption.

Décision métier :
* les notes sont affichées comme `Notes liées à la réservation` ;
* elles apparaissent dans le contexte d'une réservation `adopted` ;
* elles ne sont pas présentées comme un type métier spécifique post-adoption ;
* le modèle `notes` ne possède pas de type dédié `post_adoption` ou `post_adoption_follow_up`.

UX obtenue :
* sous-bloc `Notes liées à la réservation` dans `Suivi post-adoption` ;
* message neutre si les notes liées ne peuvent pas être chargées ;
* liste simple des notes existantes si présentes ;
* état vide si aucune note liée n'existe ;
* aucun bouton ou formulaire d'ajout.

Non-effets de bord :
* aucune création de note ;
* aucune modification de note ;
* aucune suppression de note ;
* aucun changement des événements post-adoption ;
* aucun changement de statut réservation ;
* aucun changement Supabase, migration, seed, type généré ou package.

## PR108 — Polish post-adoption follow-up layout

Objectif : clarifier visuellement la section `Suivi post-adoption` maintenant qu'elle regroupe plusieurs lectures hétérogènes.

Changement UI sur `/reservations/[id]` :
* ajout du sous-titre `Événements de suivi` ;
* conservation du sous-titre `Notes liées à la réservation` ;
* séparation plus nette entre événements, notes et rappel documents ;
* rappel final indiquant que les documents restent visibles dans la section `Documents liés`.

Non-effets de bord :
* aucune nouvelle donnée ;
* aucune nouvelle requête Supabase ;
* aucune modification des requêtes existantes ;
* aucun changement de filtre, tri ou colonne ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucun changement fonctionnel.

État courant après PR108 :
* le suivi post-adoption en lecture seule comprend désormais les événements `post_adoption_follow_up` liés à la réservation ;
* le suivi post-adoption affiche aussi les notes liées à la réservation, sans les interpréter comme un type post-adoption dédié ;
* la section est visuellement clarifiée par sous-blocs ;
* le projet conserve treize écritures métier contrôlées ;
* la suite e2e Playwright globale reste composée de six tests.

Limites conservées :
* pas de création, édition ou suppression d'événement post-adoption ;
* pas de création, édition ou suppression de note liée ;
* pas de filtre `note_type` post-adoption tant que le modèle ne définit pas un type dédié ;
* pas de formulaire de suivi post-adoption ;
* pas d'action serveur de suivi post-adoption ;
* pas de modification du seed pour couvrir le suivi post-adoption ;
* pas de test e2e post-adoption dédié à ce stade.

Prochaines pistes :
* ajouter plus tard une fixture ou un test e2e post-adoption si un scénario fiable est défini ;
* décider plus tard si le modèle de notes doit recevoir un type dédié post-adoption ;
* conserver toute écriture de suivi post-adoption dans une PR séparée, courte et validée.

## PR110 — Add read-only adoption summary

Objectif : ajouter une courte synthèse d'adoption en lecture seule sur la fiche réservation.

Changement UI sur `/reservations/[id]` :
* ajout d'un bloc `Synthèse d'adoption` ;
* affichage uniquement si `reservation.status === "adopted"` ;
* positionnement dans la section `Informations de la réservation`, après le bloc `Statut final` ;
* résumé court du statut, du contact, de l'animal, du prix convenu, des paiements, des documents, du suivi post-adoption et de la date d'adoption si disponible.

Données utilisées :
* uniquement les données déjà chargées dans la page ;
* informations de réservation existantes ;
* animal lié déjà chargé ;
* paiements liés déjà chargés ;
* documents liés déjà chargés ;
* événements et notes du suivi post-adoption déjà chargés.

Non-effets de bord :
* aucune nouvelle requête Supabase ;
* aucune modification des requêtes existantes ;
* aucun calcul de solde métier ;
* aucune validation automatique de paiement ;
* aucun bouton ;
* aucun lien ;
* aucun formulaire ;
* aucune action serveur ;
* aucune modification des sections `Paiements liés`, `Documents liés`, `Animal lié` ou `Suivi post-adoption`.

État courant après PR110 :
* une réservation adoptée dispose d'un statut final explicite ;
* une réservation adoptée dispose d'un suivi post-adoption en lecture seule ;
* une réservation adoptée dispose désormais d'une synthèse d'adoption en lecture seule ;
* le projet conserve treize écritures métier contrôlées ;
* la suite e2e Playwright globale reste composée de six tests.

Limites conservées :
* pas d'écriture d'adoption supplémentaire ;
* pas de calcul de solde métier ;
* pas de validation automatique de paiement complet ;
* pas de nouvelle donnée chargée ;
* pas de nouveau bouton, lien, formulaire ou action.

Prochaines pistes :
* enrichir plus tard la synthèse seulement si de nouveaux champs déjà fiables deviennent disponibles ;
* conserver toute règle métier d'adoption plus stricte dans une PR applicative séparée et testée.

## PR112 — Show related notes for all reservations

Objectif : généraliser l'affichage en lecture seule des notes liées à une réservation sur `/reservations/[id]`.

Changement UI sur `/reservations/[id]` :
* déplacement des `Notes liées à la réservation` dans une section générale ;
* section visible pour tous les statuts de réservation ;
* suppression du doublon de notes dans `Suivi post-adoption` ;
* conservation du suivi post-adoption centré sur les événements et le rappel documents.

Lecture Supabase :
* chargement dès qu'une réservation existe ;
* table `notes` ;
* filtre conservé : `reservation_id = reservation.id` ;
* filtre conservé : `deleted_at is null` ;
* tri conservé : `created_at` décroissant ;
* aucun filtre `note_type`.

Non-effets de bord :
* aucune création, édition ou suppression de note ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR113 — Show related reservations on litter detail

Objectif : ajouter une section `Réservations liées` sur la fiche portée `/litters/[id]`.

Changement UI sur `/litters/[id]` :
* ajout d'une section `Réservations liées` après `Animaux liés` et avant `Documents liés` ;
* lecture depuis `reservation_overview` ;
* filtre : `litter_id = id` ;
* tri : `created_at` décroissant ;
* affichage en lecture seule du contact, du statut, de la préférence de sexe, de l'animal attribué ou `Non attribué`, du tarif convenu, du montant payé si disponible, de la date de création et d'un lien vers `/reservations/[id]`.

Non-effets de bord :
* aucune création, édition ou suppression de réservation ;
* aucun bouton de création ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement paiement, animal ou document ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR115 — feat(litters): show related notes

Objectif : ajouter une section `Notes liées` en lecture seule sur la fiche portée `/litters/[id]`.

Changement UI sur `/litters/[id]` :
* lecture des notes liées via `notes.litter_id` ;
* filtre : `litter_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du contenu, du type, de la visibilité, de la date de création et de l'auteur si disponible.

Non-effets de bord :
* aucune création, édition ou suppression de note ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR116 — feat(litters): show related events

Objectif : ajouter une section `Événements liés` en lecture seule sur la fiche portée `/litters/[id]`.

Changement UI sur `/litters/[id]` :
* lecture des événements liés via `events.litter_id` ;
* filtre : `litter_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la description si disponible et de la date de création si utile.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR117 — feat(animals): show related events

Objectif : ajouter une section `Événements liés` en lecture seule sur la fiche animal `/animals/[id]`.

Changement UI sur `/animals/[id]` :
* lecture des événements liés via `events.animal_id` ;
* filtre : `animal_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la priorité, de la description si disponible et de la date de création si utile.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR118 — feat(animals): show related notes

Objectif : ajouter une section `Notes liées` en lecture seule sur la fiche animal `/animals/[id]`.

Changement UI sur `/animals/[id]` :
* lecture des notes liées via `notes.animal_id` ;
* filtre : `animal_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du contenu, du type, de la visibilité, de la date de création et de l'auteur si disponible.

Non-effets de bord :
* aucune création, édition ou suppression de note ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR120 — feat(home): polish quick links

Objectif : clarifier les liens rapides statiques de l'accueil.

Changement UI sur `/` :
* descriptions statiques ajustées pour les modules existants ;
* meilleure mention des fiches portée et animal enrichies en lecture seule ;
* aucun compteur dynamique ;
* aucune requête Supabase ajoutée.

Non-effets de bord :
* aucun vrai dashboard dynamique ;
* aucune nouvelle route ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR121 — feat(contacts): show related events

Objectif : ajouter une section `Événements liés` en lecture seule sur la fiche contact `/contacts/[id]`.

Changement UI sur `/contacts/[id]` :
* lecture des événements liés via `events.contact_id` ;
* filtre : `contact_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la priorité, de la description si disponible et de la date de création si utile.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR122 — feat(applications): show related events

Objectif : ajouter une section `Événements liés` en lecture seule sur la fiche candidature `/candidatures/[id]`.

Changement UI sur `/candidatures/[id]` :
* lecture des événements liés via `events.application_id` ;
* filtre : `application_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la priorité, de la description si disponible et de la date de création si utile.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement qualification, note, contact, réservation ou document ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR123 — refactor(contacts-applications): polish notes and events sections

Objectif : harmoniser légèrement la cohérence notes / événements sur les fiches contact et candidature.

Changement UI sur `/candidatures/[id]` :
* conservation de la section `Notes internes` existante ;
* conservation du formulaire de création de note interne ;
* ajout d'un état d'erreur neutre si les notes internes ne peuvent pas être chargées, cohérent avec la fiche contact.

Non-effets de bord :
* aucune section de notes doublon ;
* aucune modification de la création de note ;
* aucune création, édition ou suppression de note ou d'événement ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR125 — feat(payments): show related notes

Objectif : ajouter une section `Notes liées` en lecture seule sur la fiche paiement `/payments/[id]`.

Changement UI sur `/payments/[id]` :
* lecture des notes liées via `notes.payment_id` ;
* filtre : `payment_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du contenu, du type, de la visibilité, de la date de création et de l'auteur si disponible ;
* conservation du champ simple `payments.notes` et de son affichage existant.

Non-effets de bord :
* aucune création, édition ou suppression de note ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement paiement, document, contact ou réservation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR126 — feat(payments): show related events

Objectif : ajouter une section `Événements liés` en lecture seule sur la fiche paiement `/payments/[id]`.

Changement UI sur `/payments/[id]` :
* lecture des événements liés via `events.payment_id` ;
* filtre : `payment_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la priorité, de la description si disponible et de la date de création si utile ;
* conservation des informations du paiement, de la note simple, des documents liés, du contact lié, de la réservation liée et des notes liées.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement paiement, note liée, document, contact ou réservation ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR127 — feat(documents): show related notes

Objectif : ajouter une section `Notes liées` en lecture seule sur la fiche document `/documents/[id]`.

Changement UI sur `/documents/[id]` :
* lecture des notes liées via `notes.document_id` ;
* filtre : `document_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du contenu, du type, de la visibilité, de la date de création et de l'auteur si disponible ;
* conservation des informations du document, des métadonnées fichier, des sections liées et de l'aside `Liens métier`.

Non-effets de bord :
* aucune création, édition ou suppression de note ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement document, upload, téléchargement, preview, signature ou génération ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR128 — feat(documents): show related events

Objectif : ajouter une section `Événements liés` en lecture seule sur la fiche document `/documents/[id]`.

Changement UI sur `/documents/[id]` :
* lecture des événements liés via `events.document_id` ;
* filtre : `document_id = id` ;
* filtre : `deleted_at is null` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la priorité, de la description si disponible et de la date de création si utile ;
* conservation des informations du document, des sections métier liées, de la section `Notes liées` et de l'aside `Liens métier`.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement document, note liée, upload, téléchargement, preview, signature ou génération ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR130 — feat(reservations): show related events

Objectif : ajouter une section générale `Événements liés` en lecture seule sur la fiche réservation `/reservations/[id]`.

Changement UI sur `/reservations/[id]` :
* lecture des événements liés via `events.reservation_id` ;
* filtre : `reservation_id = reservation.id` ;
* filtre : `deleted_at is null` ;
* exclusion explicite des événements `post_adoption_follow_up`, déjà affichés dans `Suivi post-adoption` ;
* tri : `created_at` décroissant ;
* affichage du titre ou type, de la date utile, du statut, de la priorité, de la description si disponible et de la date de création si utile ;
* conservation inchangée du suivi post-adoption existant.

Non-effets de bord :
* aucune création, édition ou suppression d'événement ;
* aucun bouton ;
* aucun formulaire ;
* aucune action serveur ;
* aucune mutation ;
* aucun changement de statut de réservation ;
* aucun changement du suivi post-adoption ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR132 — feat(contacts): add manual contact creation

Objectif : ajouter une création manuelle de contact depuis l'espace privé, sans passer par le formulaire public.

Changement UI et action serveur :
* ajout de la route privée `/contacts/new` ;
* ajout d'un lien discret `Nouveau contact` depuis `/contacts` ;
* ajout de l'action serveur contrôlée `createContact` ;
* insertion dans la table existante `contacts` ;
* résolution de `organization_id` côté serveur depuis la première membership active de l'utilisateur authentifié ;
* calcul serveur de `display_name` avec fallback robuste ;
* renseignement de `created_by` et `updated_by` avec l'utilisateur connecté ;
* redirection vers `/contacts/[id]` après succès ;
* erreur neutre via `/contacts/new?status=error`.

Limite Phase 1 :
* si un utilisateur appartient à plusieurs organisations actives, la première membership active trouvée est utilisée ; un sélecteur d'organisation pourra être ajouté plus tard si nécessaire.

Non-effets de bord :
* aucun rôle initial dans `contact_roles` ;
* aucun dédoublonnage automatique ;
* aucune note automatique ;
* aucune candidature créée ;
* aucune réservation créée ;
* aucun document créé ;
* aucun changement du formulaire public ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

## PR134 — fix(contacts): reject empty manual contact

Objectif : empêcher la création d'un contact manuel vide ou uniquement rempli par des valeurs par défaut.

Correction dans `createContact` :
* validation serveur renforcée avant insertion dans `contacts` ;
* au moins une information utile d'identité ou de contact est requise après trim ;
* `country = "FR"` seul ne suffit pas ;
* les valeurs vides, espaces et valeurs par défaut ne suffisent pas ;
* le fallback `Contact manuel` ne peut plus créer un contact vide ;
* redirection vers `/contacts/new?status=error` avec erreur neutre, sans modification de données.

Tests manuels validés :
* création avec prénom + nom : OK ;
* création avec email seul : OK ;
* formulaire vide ou pays seul : bloqué avec erreur neutre.

Non-effets de bord :
* aucun dédoublonnage automatique ;
* aucun rôle initial ;
* aucune suppression de contact ;
* aucun changement du formulaire public ;
* aucun changement Supabase, RLS, RPC, migration, seed, type généré ou package.

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

Le bloc Portées / Animaux / Paiements / Documents dispose désormais d'un socle privé complet en lecture seule jusqu'aux fiches détail, avec une liaison bidirectionnelle consultative entre portées et animaux, l'affichage des documents liés sur les fiches portée et animal, l'affichage des réservations liées sur la fiche portée, l'affichage des notes et événements liés sur les fiches portée, animal, paiement et document, une liaison consultative Réservation ↔ Animal, des sections enrichies `Contact lié`, `Candidature liée`, `Réservation liée` et `Paiement lié` sur la fiche document, une fiche document complète et harmonisée côté lecture seule, et des fixtures locales permettant de tester ce parcours. L'accueil reste statique mais ses liens rapides décrivent plus clairement les modules existants.

Le projet a aussi validé quatorze écritures métier contrôlées. L'espace privé permet désormais de créer manuellement un contact depuis `/contacts/new`, avec rattachement serveur à l'organisation de l'utilisateur connecté et refus serveur des formulaires vides ou remplis seulement par des valeurs par défaut. Une candidature qualifiée peut créer une réservation brouillon depuis `/candidatures/[id]`. Une réservation existante peut ensuite recevoir une complétion limitée de son tarif convenu (`price_cents`), de son commentaire interne (`internal_comment`), de son échéance de pré-réservation (`pre_reservation_deadline`), l'attribution contrôlée d'un animal disponible depuis `/reservations/[id]`, le retrait contrôlé de cette attribution, la création manuelle d'un paiement lié depuis `/reservations/[id]`, le passage contrôlé d'une demande de paiement à payé depuis `/payments/[id]`, la confirmation manuelle `draft` → `active`, ainsi que les sorties manuelles `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn` et `active` → `expired` depuis `/reservations/[id]`. Ces écritures restent volontairement courtes et prudentes : données relues côté serveur, identifiants sensibles non fournis par le client, aucun paiement en ligne, aucun remboursement ou avoir automatique, aucun reçu/document généré et aucune note créée automatiquement. Les statuts finaux de réservation sont centralisés côté code et `completed` n'est pas utilisé comme statut de réservation.

La fiche réservation a été clarifiée côté UX pour les actions finales : les actions de statut sont regroupées, les sorties finales sont mieux distinguées, et un bloc `Statut final` explique l'absence d'actions lorsqu'une réservation est finalisée. Les notes liées et les événements généraux liés à une réservation sont désormais visibles en lecture seule pour tous les statuts. Les événements `post_adoption_follow_up` restent affichés séparément dans le suivi post-adoption des réservations `adopted`, afin d'éviter les doublons avec la section générale. Les réservations adoptées disposent aussi d'une synthèse d'adoption read-only construite avec les données déjà chargées.

État fonctionnel :
* `/` affiche des liens rapides statiques clarifiés vers les modules existants ;
* `/litters` liste les portées existantes ;
* `/litters/[id]` affiche la fiche détail d'une portée ;
* `/litters/[id]` affiche les animaux liés à la portée ;
* `/litters/[id]` affiche les réservations liées à la portée ;
* `/litters/[id]` affiche les documents liés à la portée ;
* `/litters/[id]` affiche les notes liées à la portée en lecture seule ;
* `/litters/[id]` affiche les événements liés à la portée en lecture seule ;
* `/animals` liste les animaux existants ;
* `/animals/[id]` affiche la fiche détail d'un animal ;
* `/animals/[id]` affiche la portée liée à l'animal ;
* `/animals/[id]` affiche la réservation liée à l'animal ;
* `/animals/[id]` affiche les documents liés à l'animal ;
* `/animals/[id]` affiche les événements liés à l'animal en lecture seule ;
* `/animals/[id]` affiche les notes liées à l'animal en lecture seule ;
* `/reservations/[id]` permet d'attribuer un animal disponible à la réservation ;
* `/reservations/[id]` permet de retirer l'attribution de l'animal ;
* `/documents/[id]` affiche le contact lié au document ;
* `/documents/[id]` affiche la candidature liée au document ;
* `/documents/[id]` affiche la réservation liée au document ;
* `/documents/[id]` affiche le paiement lié au document ;
* `/documents/[id]` affiche les notes liées au document en lecture seule ;
* `/documents/[id]` affiche les événements liés au document en lecture seule ;
* `/documents/[id]` harmonise les headers de ses sections liées ;
* `/documents/[id]` propose des liens vers les fiches contact, candidature, réservation et paiement liées ;
* `/documents/[id]` conserve l'aside `Liens métier` ;
* `/contacts` propose un lien `Nouveau contact` vers `/contacts/new` ;
* `/contacts/new` permet de créer manuellement un contact privé via l'action serveur `createContact`, avec au moins une information utile requise après trim ;
* `/contacts/[id]` affiche les événements liés au contact en lecture seule ;
* `/candidatures/[id]` affiche les événements liés à la candidature en lecture seule ;
* `/candidatures/[id]` affiche un état d'erreur neutre si les notes internes ne peuvent pas être chargées ;
* `/candidatures/[id]` peut créer une réservation brouillon depuis une candidature qualifiée sans réservation liée ;
* `/candidatures/[id]` affiche la réservation créée dans la section `Réservations liées` ;
* `/reservations` affiche la réservation brouillon créée ;
* `/reservations/[id]` permet de modifier uniquement le tarif convenu d'une réservation existante ;
* `/reservations/[id]` accepte un champ tarif vide pour retirer le tarif convenu ;
* `/reservations/[id]` permet de modifier uniquement le commentaire interne d'une réservation existante ;
* `/reservations/[id]` accepte un champ commentaire vide pour retirer le commentaire interne ;
* `/reservations/[id]` permet de modifier uniquement l’échéance de pré-réservation d’une réservation existante ;
* `/reservations/[id]` accepte un champ date vide pour retirer l’échéance de pré-réservation ;
* `/reservations/[id]` permet de créer manuellement un paiement lié à la réservation ;
* `/reservations/[id]` permet de confirmer manuellement une réservation `draft` en `active` ;
* `/reservations/[id]` permet de finaliser manuellement une réservation `active` en `adopted` ;
* `/reservations/[id]` permet d'annuler manuellement une réservation `active` en `cancelled` ;
* `/reservations/[id]` permet de marquer manuellement une réservation `active` en désistement `withdrawn` ;
* `/reservations/[id]` permet de marquer manuellement une réservation `active` en expirée `expired` ;
* les gardes applicatives de réservation traitent `adopted`, `withdrawn`, `cancelled`, `expired` et `archived` comme statuts finaux ;
* `/reservations/[id]` affiche un résumé `Statut final` lorsqu'une réservation est dans un statut final ;
* `/reservations/[id]` affiche une synthèse d'adoption pour les réservations `adopted` ;
* `/reservations/[id]` affiche une section `Suivi post-adoption` pour les réservations `adopted` ;
* `/reservations/[id]` lit en lecture seule les événements `post_adoption_follow_up` liés à une réservation adoptée ;
* `/reservations/[id]` lit en lecture seule les notes liées à une réservation pour tous les statuts, sans filtre `note_type` post-adoption dédié ;
* `/reservations/[id]` lit en lecture seule les événements généraux liés à une réservation, en excluant `post_adoption_follow_up` pour éviter les doublons ;
* `/reservations/[id]` conserve le sous-bloc `Événements de suivi` dans `Suivi post-adoption` ;
* `/payments/[id]` permet de marquer une demande de paiement `requested` comme réglée `paid` ;
* `/payments/[id]` affiche les notes liées au paiement en lecture seule, sans modifier le champ simple `payments.notes` ;
* `/payments/[id]` affiche les événements liés au paiement en lecture seule ;
* les documents liés pointent vers `/documents/[id]` ;
* les listes `/litters` et `/animals` proposent un lien `Consulter` vers chaque fiche détail ;
* les fixtures locales permettent de tester directement `/litters/c0000000-0000-4000-8000-000000000001` ;
* les fixtures locales permettent de tester directement `/animals/d0000000-0000-4000-8000-000000000001` ;
* les fixtures locales permettent de tester directement `/documents/b0000000-0000-4000-8000-000000000004` ;
* les fixtures locales permettent de tester directement `/documents/b0000000-0000-4000-8000-000000000005` ;
* les fixtures locales permettent de tester directement `/candidatures/80000000-0000-4000-8000-000000000002` ;
* les fixtures locales permettent de tester directement `/contacts/70000000-0000-4000-8000-000000000002` ;
* la majorité des pages restent strictement consultatives, à l'exception de la création contrôlée d'un contact manuel depuis `/contacts/new`, de la création contrôlée d'une réservation brouillon depuis une candidature qualifiée, de l'édition contrôlée du tarif convenu, de l'édition contrôlée du commentaire interne, de l'édition contrôlée de l'échéance de pré-réservation, de l'attribution contrôlée d'un animal disponible, du retrait contrôlé d'attribution animal/réservation, de l'enregistrement contrôlé de paiement manuel d'une réservation existante, du passage contrôlé d'une demande de paiement à payé, de la confirmation manuelle `draft` → `active`, de la finalisation manuelle `active` → `adopted`, de l'annulation manuelle `active` → `cancelled`, du désistement manuel `active` → `withdrawn`, et de l'expiration manuelle `active` → `expired`.

Limites conservées explicitement :
* aucune création de portée ;
* aucune édition de portée ;
* aucune suppression de portée ;
* aucune création, édition ou suppression de note liée depuis la fiche portée ;
* aucune création, édition ou suppression d'événement lié depuis la fiche portée ;
* aucune création d'animal ;
* aucune édition d'animal ;
* aucune suppression d'animal ;
* aucune création, édition ou suppression de note liée depuis la fiche animal ;
* aucune création, édition ou suppression d'événement lié depuis la fiche animal ;
* aucune réservation depuis animal ;
* aucun vrai dashboard dynamique sur l'accueil ;
* aucun compteur dynamique sur l'accueil ;
* aucune requête Supabase ajoutée sur l'accueil ;
* aucune création, édition ou suppression d'événement lié depuis la fiche contact ;
* aucun rôle initial créé dans `contact_roles` lors de la création manuelle de contact ;
* aucun dédoublonnage automatique lors de la création manuelle de contact ;
* aucune note, candidature, réservation ou document créé automatiquement avec un contact manuel ;
* aucun contact manuel créé depuis un formulaire vide, un formulaire rempli seulement d'espaces ou un formulaire avec seulement `country = "FR"` ;
* aucun changement du formulaire public de candidature ;
* si un utilisateur appartient à plusieurs organisations actives, `/contacts/new` utilise la première membership active trouvée en Phase 1 ;
* aucune création, édition ou suppression d'événement lié depuis la fiche candidature ;
* aucune section de notes doublon sur les fiches contact ou candidature ;
* aucune suppression ou transformation des formulaires existants de notes internes ;
* aucune création, édition ou suppression de note liée depuis la fiche paiement ;
* aucune création, édition ou suppression d'événement lié depuis la fiche paiement ;
* aucune modification du champ simple `payments.notes` par les sections liées ;
* aucune création de réservation depuis la fiche animal ;
* aucune édition de réservation autre que le tarif convenu (`price_cents`), le commentaire interne (`internal_comment`), l'échéance de pré-réservation (`pre_reservation_deadline`), l'attribution de l'animal (`animal_id`) et son retrait, aucun autre ajout que la création manuelle de paiement, et aucun autre changement d'état que le passage d'une demande de paiement à payé, la confirmation manuelle `draft` → `active`, la finalisation manuelle `active` → `adopted`, l'annulation manuelle `active` → `cancelled`, le désistement manuel `active` → `withdrawn` ou l'expiration manuelle `active` → `expired` ;
* aucun changement de statut de réservation autre que les transitions manuelles `draft` → `active`, `active` → `adopted`, `active` → `cancelled`, `active` → `withdrawn` et `active` → `expired` ;
* aucun remboursement déclenché par les transitions finales de réservation ;
* aucun avoir déclenché par les transitions finales de réservation ;
* aucune modification de paiement déclenchée par les transitions finales de réservation ;
* aucun calcul de solde métier ou validation automatique de paiement complet dans la synthèse d'adoption ;
* aucune génération de document ou reçu déclenchée par les transitions finales de réservation ;
* aucune note automatique déclenchée par les transitions finales de réservation ;
* aucune modification animal déclenchée par les transitions finales de réservation ;
* aucun retrait automatique d'attribution animal déclenché par les transitions finales de réservation ;
* aucune automatisation d'expiration basée sur `pre_reservation_deadline` ;
* aucun cron ;
* aucune tâche planifiée ;
* aucune création, édition ou suppression d'événement post-adoption ;
* aucune création, édition ou suppression d'événement général lié depuis la fiche réservation ;
* aucune création, édition ou suppression de note liée depuis la fiche réservation ;
* aucun filtre `note_type` post-adoption dédié sur les notes ;
* aucun formulaire de suivi post-adoption ;
* aucune action serveur de suivi post-adoption ;
* aucune requête Supabase supplémentaire pour la synthèse d'adoption ;
* aucun seed ou test e2e dédié au suivi post-adoption à ce stade ;
* aucun upload ;
* aucun téléchargement ;
* aucune preview ;
* aucun Supabase Storage ;
* aucune génération PDF ;
* aucune signature électronique ;
* aucune création, édition ou suppression de document ;
* aucune création, édition ou suppression de note liée depuis la fiche document ;
* aucune création, édition ou suppression d'événement lié depuis la fiche document ;
* aucune création, édition ou suppression de contact depuis la fiche document ;
* aucune création, édition ou suppression de candidature depuis la fiche document ;
* aucune création, édition ou suppression de réservation depuis la fiche document ;
* aucune création, édition, suppression ou remboursement de paiement depuis la fiche document ;
* aucune écriture métier depuis la fiche document ;
* pas de vrai fichier pour les documents seedés ;
* aucune timeline ;
* aucun Gantt ;
* aucun journal de mise-bas ;
* aucune mutation autre que la création contrôlée d'un contact manuel, la création contrôlée d'une réservation brouillon depuis une candidature qualifiée, l'édition contrôlée du tarif convenu, l'édition contrôlée du commentaire interne, l'édition contrôlée de l'échéance de pré-réservation, l'attribution contrôlée d'un animal, le retrait contrôlé d'attribution animal/réservation, la création contrôlée de paiement manuel d'une réservation existante, le passage contrôlé d'un paiement de `requested` à `paid`, la confirmation manuelle `draft` → `active`, la finalisation manuelle `active` → `adopted`, l'annulation manuelle `active` → `cancelled`, le désistement manuel `active` → `withdrawn`, et l'expiration manuelle `active` → `expired` ;
* aucun statut `completed` ;
* aucune migration ;
* aucune RLS ;
* aucune RPC ;
* aucune vue ;
* aucun type généré.

Pistes possibles :
* la liaison consultative Réservation ↔ Animal est désormais en place ;
* `/documents/[id]` couvre désormais les relations principales : contact, candidature, réservation et paiement ;
* `/documents/[id]` est désormais complète et harmonisée côté lecture seule ;
* la création manuelle de contact depuis `/contacts/new` est disponible sans créer de rôle, note, candidature, réservation ou document automatique, et refuse les soumissions vides ou uniquement remplies par des valeurs par défaut ;
* la chaîne candidature → réservation → paiement → animal est validée globalement comme point de stabilité ;
* le workflow candidature qualifiée → réservation brouillon est validé localement ;
* l'édition contrôlée du tarif convenu d'une réservation est validée localement ;
* l'édition contrôlée du commentaire interne d'une réservation est validée localement ;
* l'édition contrôlée de l'échéance de pré-réservation d'une réservation est validée localement ;
* la création contrôlée de paiement manuel d'une réservation est validée localement ;
* le passage contrôlé d'une demande de paiement à payé est validé localement ;
* l'attribution contrôlée d'un animal à une réservation est validée localement ;
* le retrait contrôlé d'attribution animal/réservation est validé localement ;
* le parcours global candidature → réservation → paiement → animal est protégé par Playwright ;
* la confirmation manuelle d'une réservation `draft` en `active` est protégée par un test Playwright dédié ;
* la finalisation manuelle d'une réservation `active` en `adopted` est protégée par un test Playwright dédié ;
* l'annulation manuelle d'une réservation `active` en `cancelled` est protégée par un test Playwright dédié ;
* le désistement manuel d'une réservation `active` en `withdrawn` est protégé par un test Playwright dédié ;
* l'expiration manuelle d'une réservation `active` en `expired` est protégée par un test Playwright dédié ;
* la suite e2e Playwright globale contient désormais six tests ;
* les statuts finaux de réservation sont centralisés côté code autour de `adopted`, `withdrawn`, `cancelled`, `expired` et `archived` ;
* la fiche réservation explique désormais les statuts finaux, affiche les notes et événements généraux liés à la réservation pour tous les statuts, affiche une synthèse d'adoption en lecture seule et conserve le suivi post-adoption séparé avec événements `post_adoption_follow_up` ;
* les fiches portée et animal affichent désormais documents, notes et événements liés en lecture seule ;
* les fiches paiement et document affichent désormais notes et événements liés en lecture seule ;
* les fiches contact et candidature affichent désormais les événements liés en lecture seule ;
* l'accueil statique pointe plus clairement vers les modules déjà disponibles ;
* enrichir plus tard d'autres relations uniquement si la relation métier existe déjà et reste en lecture seule ;
* concevoir plus tard l'upload de documents, uniquement après décision explicite ;
* concevoir plus tard la preview de documents, uniquement après décision explicite ;
* concevoir plus tard le téléchargement de documents, uniquement après décision explicite ;
* concevoir plus tard les reçus et documents générés dans une PR dédiée ;
* concevoir plus tard la génération ou la signature de documents dans une PR dédiée ;
* concevoir plus tard une édition contrôlée des rangs ou d'autres attributs de réservation ;
* concevoir plus tard un formulaire de complétion de réservation ;
* concevoir plus tard le paiement en ligne / Stripe dans une PR dédiée ;
* concevoir plus tard les remboursements manuels dans une PR dédiée ;
* concevoir plus tard les annulations/éditions de paiement dans une PR dédiée ;
* améliorer plus tard l'ergonomie de la fiche réservation seulement si de nouveaux usages rendent la page trop dense ;
* ajouter plus tard une fixture ou un test e2e post-adoption si un scénario fiable est défini ;
* décider plus tard si les notes doivent recevoir un type métier dédié au suivi post-adoption ;
* décider plus tard si `active` → `adopted` doit exiger solde payé et/ou animal attribué ;
* concevoir plus tard les documents ou reçus liés à l'adoption ;
* documenter plus tard un nouveau fichier de reprise complet si nécessaire ;
* envisager plus tard une contrainte SQL d'unicité animal/réservation si l'usage concurrent le justifie ;
* concevoir plus tard les workflows applicatifs de création, édition, attribution ou réservation cohérents avec le MVP ;
* garder toute nouvelle écriture métier dans une PR courte, prudente, relue côté serveur et validée localement ;
* conserver toute modification Supabase, migration ou RLS dans une PR séparée et justifiée.
