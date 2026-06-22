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
Dernier état connu : PR11 fusionnée
Dernier commit connu : `87d488b Add internal application notes`

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
* des notes internes sur la fiche détail d’une candidature.

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

À définir avant de créer la prochaine branche.

Pistes possibles :

* améliorer la fiche détail candidature ;
* ajouter commentaires internes sur une candidature ;
* créer une fiche contact détaillée ;
* relier candidature et contact de manière plus exploitable côté interface ;
* préparer les documents attachés à un contact ou une candidature ;
* ajouter une page de suivi des candidatures qualifiées.

