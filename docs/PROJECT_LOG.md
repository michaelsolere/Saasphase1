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
Dernier état connu : Paiements liés aux contacts et réservations en lecture seule achevés (PR32 et PR33 fusionnées)
Dernier commit connu : `c8c47d80 Merge PR33: Add reservation related payments`

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
* une liste privée des paiements en lecture seule (`/payments`) ;
* une fiche détail de paiement en lecture seule (`/payments/[id]`) ;
* des liens simples vers les contacts et réservations associés depuis la liste et la fiche détail des paiements ;
* un lien `Consulter` depuis la liste des paiements vers chaque fiche détail ;
* l'affichage des paiements liés sur la fiche détail d'un contact ;
* l'affichage des paiements liés sur la fiche détail d'une réservation.

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

Le module des Paiements est désormais exploitable en lecture seule sous forme de liste, de fiche détail et de sections liées sur les contacts et réservations.

Pistes possibles :
* envisager ultérieurement une vue `payment_overview` seulement si un affichage enrichi devient nécessaire ;
* ajouter la création, l'édition ou le remboursement de paiements uniquement dans des PR séparées et explicitement décidées ;
* ajouter une éventuelle section de paiements côté candidature uniquement après décision explicite, car le lien serait indirect via les réservations ;
* conserver toute modification Supabase, migration ou RLS séparée et justifiée.
