# Audit technique — Planning, jalons et calendrier du Journal des portées

Date : 2026-07-23
Référence auditée : `main` à `bb9344a7d1456a28c015a5b4ec0a20ea660552f7`
Branche de travail : `codex/audit-litter-planning-v2`
Périmètre : audit documentaire uniquement.

## Limite documentaire

Le fichier de référence demandé, `Cadrage_fonctionnel_planning_jalons_calendrier_journal_portees_2026-07-23_v1.md`, n'est présent ni dans le checkout, ni dans l'historique Git local, ni sous `/Users/mika/Documents` au moment de l'audit. Les besoins explicitement détaillés dans la demande constituent donc la grille fonctionnelle de cet audit. Les autres sources prioritaires effectivement inspectées sont `AGENTS.md`, `README.md`, `docs/PROJECT_LOG.md`, `docs/AUDIT_TECHNIQUE_JOURNAL_PORTEES_MISE_BAS.md`, les migrations, le code serveur, les composants et les tests cités ci-dessous.

Cette limite empêche seulement de garantir la concordance avec d'éventuelles règles supplémentaires contenues exclusivement dans le fichier absent. Elle ne remet pas en cause l'inventaire technique du SHA audité.

## 1. Inventaire de l'existant

### 1.1 Fondation relationnelle de la portée

La table `litters` est créée par `supabase/migrations/202606220002_business_schema.sql`. Elle porte notamment :

- identité et rattachements : `id`, `organization_id`, `litter_group_id`, `name`, `mother_id`, `father_id` ;
- taxonomie : `species` (`dog` par défaut), `breed` (`Golden Retriever` par défaut) ;
- état : `status`, contraint à `planned`, `mating_done`, `pregnancy_unconfirmed`, `pregnancy_confirmed`, `not_pregnant`, `pregnancy_lost`, `birth_expected`, `birth_in_progress`, `born`, `puppies_created`, `choice_period`, `ready_to_leave`, `closed`, `cancelled` ou `archived` ;
- ancrages civils : `mating_date`, `mating_date_2`, `estimated_ovulation_date`, `expected_birth_date`, `actual_birth_date`, `pregnancy_confirmed_at` ;
- agrégats : `expected_puppy_count`, `born_total_count`, `born_male_count`, `born_female_count`, `alive_count` ;
- audit et cycle de vie : `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`.

Les FK composites de même organisation relient la portée au groupe et aux parents. Les contrôles de compteurs et de parents distincts sont dans cette migration. `supabase/migrations/202607190002_whelping_sessions_events.sql` ajoute l'unicité `(organization_id, id, mother_id)`. `supabase/migrations/202607190003_whelping_births_weights.sql`, puis `202607200005_whelping_birth_adjustment_foundation.sql`, protègent `actual_birth_date` et les compteurs dès qu'une naissance Journal existe et les recalculent par les commandes de mise-bas. `supabase/migrations/202607200001_litter_weighing_schedule_policy_foundation.sql` ajoute `litter_weighing_schedule_policy_snapshot`, figé à la naissance réelle.

Les index, triggers génériques `set_updated_at`, politiques RLS et la vue `litter_overview` de la fondation sont définis dans `supabase/migrations/202606220003_workflow_indexes_views_rls.sql`, puis la vue est recréée par des migrations ultérieures, notamment `supabase/migrations/202607100002_simplify_animal_names.sql`. Le Journal lit cette vue, mais relit directement `litters` pour les ancrages détaillés.

### 1.2 Modèles d'organisation et tâches de portée

La migration centrale est `supabase/migrations/202607180004_litter_care_tasks.sql`.

#### `litter_care_task_templates`

Colonnes d'origine :

| Groupe | Colonnes |
| --- | --- |
| Identité | `id`, `organization_id` |
| Contenu | `title`, `description`, `category`, `target_scope` |
| Calcul | `anchor_type`, `offset_days` |
| Applicabilité | `species`, `breed`, `is_active`, `sort_order` |
| Audit | `created_at`, `updated_at`, `created_by`, `updated_by` |

`supabase/migrations/202607180005_litter_care_task_template_mutations.sql` ajoute `revision > 0`, la validation de `breed` et l'interdiction d'un offset négatif pour `offspring_age`. `supabase/migrations/202607190001_litter_care_task_library.sql` ajoute l'origine immuable `library_template_code` + `library_template_version`.

Contraintes significatives :

- catégories fermées : `reproduction`, `maternal_health`, `maternal_feeding`, `preparation`, `offspring_weight`, `offspring_health`, `offspring_feeding`, `socialization`, `veterinary`, `identification`, `vaccination`, `other` ;
- cibles fermées : `mother`, `litter`, `all_offspring`, `organization` ;
- ancrages fermés : `first_mating`, `estimated_ovulation`, `expected_birth`, `actual_birth`, `offspring_age` ;
- espèce `dog` ou `cat`, titre de 1 à 255 caractères, description au plus 5 000 caractères ;
- FK d'organisation, FK d'origine vers la bibliothèque, origine de bibliothèque complète ou absente.

Index et triggers :

- `litter_care_task_templates_active_org_species_order_idx`, partiel sur les modèles actifs ;
- `litter_care_task_templates_library_origin_key`, unique par organisation/code/version importés ;
- `litter_care_task_templates_set_updated_at` ;
- `litter_care_task_templates_protect_library_origin`, qui interdit de changer l'origine importée.

RLS et droits :

- RLS activée ;
- policy `litter_care_task_templates_select_member` avec `is_member_of(organization_id)` ;
- table en lecture seule pour `authenticated` ; les mutations passent exclusivement par RPC ;
- `owner` et `admin` mutent les modèles, `member` et `viewer` les lisent seulement.

#### `litter_care_tasks`

Colonnes actuelles :

| Groupe | Colonnes |
| --- | --- |
| Identité et portée | `id`, `organization_id`, `litter_id` |
| Origine | `source`, `organization_template_id`, `system_template_code`, `occurrence_no` |
| Snapshot métier | `category`, `target_scope`, `title`, `description` |
| Snapshot de calcul | `anchor_type`, `anchor_date`, `offset_days`, `planned_for` |
| État | `status` |
| Idempotence de création | `creation_command_id` |
| Réalisation/résolution | `resolution_command_id`, `resolved_at`, `resolved_timezone_name`, `resolved_by`, `resolution_note` |
| Audit | `created_at`, `updated_at`, `created_by`, `updated_by` |

Invariants actuels :

- `planned_for` est obligatoire, mais ne distingue pas date suggérée et date retenue ;
- `source` vaut `manual`, `system_template` ou `organization_template` ;
- une tâche manuelle n'a aucun ancrage ; une tâche de modèle conserve obligatoirement `anchor_type`, `anchor_date` et `offset_days` ;
- `status` vaut `planned`, `done`, `cancelled` ou `not_applicable` ;
- une tâche `planned` n'a aucune donnée de résolution ; tout état terminal a commande, instant, fuseau et auteur ;
- `occurrence_no > 0`, mais la génération existante utilise toujours `1` pour un modèle d'organisation ;
- FK composites vers la portée et le modèle d'organisation.

Unicités et index :

- `litter_care_tasks_creation_command_key` : `(organization_id, creation_command_id)` ;
- `litter_care_tasks_template_occurrence_key` : `(organization_id, litter_id, organization_template_id, occurrence_no)` quand le modèle est présent ;
- `litter_care_tasks_system_template_occurrence_key` : même logique pour `system_template_code` ;
- `litter_care_tasks_resolution_command_key` : commande de résolution unique ;
- `litter_care_tasks_litter_status_planned_for_idx` : lecture par organisation, portée, statut et date.

Triggers :

- `litter_care_tasks_set_updated_at` ;
- `litter_care_tasks_validate_litter_on_insert`, qui refuse les portées supprimées ou hors des neuf statuts actifs du Journal.

RLS et droits :

- RLS activée ;
- policy `litter_care_tasks_select_member` ;
- aucun `INSERT`, `UPDATE` ou `DELETE` direct accordé à `authenticated` ;
- mutations par RPC pour `owner`, `admin` et `member` ; `viewer` est en lecture seule.

Limites structurelles importantes :

- aucune priorité ;
- aucune fenêtre début/fin ;
- aucun champ distinct `suggested_for`/`scheduled_for` ;
- aucun verrou, révision d'occurrence ou historique de report ;
- aucune série récurrente, règle de fin ou horizon ;
- aucune édition d'une tâche planifiée après création ;
- une seule transition de `planned` vers un état terminal ;
- aucun rattachement d'une réalisation à un fait déjà enregistré dans la mise-bas, les observations ou les pesées.

### 1.3 Bibliothèque globale et registres de commandes

`supabase/migrations/202607190001_litter_care_task_library.sql` crée :

- `litter_care_task_library_packs` : `code`, `title`, `description`, `species`, `sort_order`, `is_available`, `created_at` ; clé primaire `code`, unicité `(code, species)`, index partiel `litter_care_task_library_packs_available_order_idx` ;
- `litter_care_task_library_templates` : `code`, `version`, `pack_code`, contenu, catégorie, cible, ancrage, offset, espèce/race, ordre, disponibilité et date ; PK `(code, version)`, FK pack/espèce, unicité partielle d'un code disponible et index par pack ;
- `litter_care_task_library_import_commands` : commande privée avec `selection` et `result` JSON, état initial actif, compteurs, auteur et unicité `(organization_id, client_command_id)`.

Les packs et modèles globaux ont une policy de lecture pour tout utilisateur authentifié. Le registre d'import a la RLS activée mais aucune policy cliente et aucun droit de table. L'import crée une vraie copie indépendante dans `litter_care_task_templates`; il ne génère jamais directement une tâche.

Les quinze modèles canins version 1 sont insérés dans cette même migration, répartis dans les packs « Gestation et préparation », « Naissance et premiers jours » et « Croissance et préparation des départs ». Un pack est une classification de catalogue, pas encore un modèle de planning instanciable comme un tout.

Registres privés relatifs au planning existant :

| Registre | Migration | Rôle |
| --- | --- | --- |
| `litter_care_task_template_commands` | `202607180005_litter_care_task_template_mutations.sql` | Création, mise à jour et activation idempotentes ; résultat de révision. |
| `litter_care_task_generation_commands` | `202607180006_litter_care_task_generation.sql` | Plan exact, résultat, erreur `invalid_litter`/`stale_plan`, rejeu idempotent. |
| `litter_care_task_library_import_commands` | `202607190001_litter_care_task_library.sql` | Import atomique, sélection, résultat et compteurs. |

Tous sont sans policy d'accès direct et sans droit de table pour l'utilisateur authentifié. Ce modèle doit être reconduit pour les commandes de recalcul, matérialisation de récurrence et report.

### 1.4 RPC existantes utiles

#### Tâches, modèles et bibliothèque

| RPC | Migration | Comportement utile |
| --- | --- | --- |
| `create_litter_care_task` | `202607180004_litter_care_tasks.sql` | Crée une tâche manuelle, sérialise la commande, relit portée et droits. |
| `resolve_litter_care_task` | même migration | Verrouille la tâche et réalise, annule ou marque non applicable une tâche encore planifiée. |
| `create_litter_care_task_template` | `202607180005_litter_care_task_template_mutations.sql` | Création idempotente, `owner`/`admin`. |
| `update_litter_care_task_template` | même migration | Mise à jour avec `expected_revision`; l'origine de bibliothèque reste immuable. |
| `set_litter_care_task_template_active` | même migration | Activation/désactivation avec révision optimiste. |
| `generate_litter_care_tasks_from_plan` | `202607180006_litter_care_task_generation.sql` | Revalide sous verrou un plan de cinq champs par modèle, crée tout ou rien, retourne `stale_plan` sans écriture partielle. |
| `import_litter_care_task_library_templates` | `202607190001_litter_care_task_library.sql` | Import atomique et idempotent de copies d'organisation. |

Le plan de génération actuel contient exactement `templateId`, `revision`, `anchorType`, `anchorDate`, `plannedFor`. La RPC verrouille commande, portée et modèles, puis s'appuie sur les unicités de tâche. C'est un actif à faire évoluer, pas à contourner.

#### Domaines adjacents

- cycle et saillies : `record_reproductive_cycle_mating` dans `202607180002_reproductive_cycle_matings.sql` ;
- observations : `record_maternal_observation` dans `202607180003_maternal_observations.sql` ;
- mise-bas : `open_whelping_session`, `record_whelping_event`, `close_whelping_session` dans `202607190002_whelping_sessions_events.sql`, `record_whelping_birth` dans `202607190003_whelping_births_weights.sql`, `record_whelping_birth_weight` dans `202607190004_whelping_birth_weight_completion.sql`, réouverture dans `202607200002_reopen_whelping_session.sql`, correction/annulation dans `202607200005_whelping_birth_adjustment_foundation.sql`, historique dans `202607220001_whelping_birth_adjustment_history_read.sql` ;
- pesées : `record_litter_routine_weights` dans `202607190005_litter_routine_weighing_foundation.sql`, correction/annulation dans `202607200003_litter_weight_adjustment_foundation.sql`, historique dans `202607200004_litter_weight_adjustment_history_read.sql` ;
- politiques descriptives : fonctions de validation, recommandation, résolution et gel de la cadence dans `202607200001_litter_weighing_schedule_policy_foundation.sql`; validation du repère maternel dans `202607220003_maternal_temperature_drop_policy.sql`.

Ces commandes fournissent déjà les bons précédents : clé de commande, verrou transactionnel, révision optimiste, registre privé et projection métier expurgée.

### 1.5 Cycles reproductifs et observations maternelles

`supabase/migrations/202607180001_reproductive_cycles_foundation.sql` crée :

- `reproductive_cycles` : mère, espèce/race, état, dates de début/fin, portée unique éventuelle, notes, audit et soft delete ;
- `progesterone_measurements` : cycle, instants de prélèvement/résultat, valeur, unité `ng_ml`/`nmol_l`, laboratoire, référence, méthode, note et audit.

Contraintes et protections : mère femelle active de même espèce, un cycle actif par mère via `reproductive_cycles_one_active_per_mother_idx`, portée unique, dates cohérentes, index d'historique, triggers `updated_at`, RLS de lecture membre et d'écriture `owner`/`admin`/`member`.

`supabase/migrations/202607180002_reproductive_cycle_matings.sql` crée `reproductive_cycle_matings` avec `cycle_id`, `father_id`, `sequence_no`, `occurred_at`, `timezone_name`, `method`, `location`, `note`, `client_command_id` et audit. Les unicités `(organization_id, cycle_id, sequence_no)` et `(organization_id, client_command_id)`, les index par cycle, l'immutabilité et le trigger de protection de `reproductive_cycles.litter_id` garantissent que la première saillie lie exactement une portée. La RPC projette la première et la deuxième saillie sur `litters.mating_date` et `mating_date_2`.

`supabase/migrations/202607180003_maternal_observations.sql` crée `maternal_observations` avec portée, mère, type, instant, fuseau, valeur/unité, sévérité, note, commande et audit. Les observations sont append-only, idempotentes et indexées par portée et mère. Une température exige une valeur positive et `celsius` ou `fahrenheit`; les autres types exigent une note et ne portent pas de mesure numérique. La mère doit être celle de la portée. RLS : lecture membre; écriture uniquement par `record_maternal_observation` pour les rôles d'écriture.

Conséquence pour le planning : les ancrages `first_mating` et `estimated_ovulation` peuvent être lus depuis les champs de `litters` utilisés aujourd'hui, mais leur provenance métier est respectivement le cycle/saillie et l'estimation de portée. Une température reste une observation réelle, jamais une occurrence de planning.

### 1.6 Mise-bas et poids

Les tables et protections exactes sont réparties entre les migrations suivantes :

| Domaine | Tables principales | Migrations structurantes |
| --- | --- | --- |
| Session et chronologie | `whelping_sessions`, `whelping_events`, `whelping_commands` | `202607190002_whelping_sessions_events.sql`, `202607200002_reopen_whelping_session.sql` |
| Naissances | `whelping_births`, `animals` comme identité du nouveau-né | `202607190003_whelping_births_weights.sql`, `202607200005_whelping_birth_adjustment_foundation.sql`, `202607220002_whelping_birth_replacement_projection_fix.sql` |
| Poids | `animal_weight_measurements`, `litter_weighing_sessions` | `202607190003_whelping_births_weights.sql`, `202607190004_whelping_birth_weight_completion.sql`, `202607190005_litter_routine_weighing_foundation.sql` |
| Audit des corrections | `whelping_birth_adjustment_commands`, `litter_weight_adjustment_commands` | `202607200005_whelping_birth_adjustment_foundation.sql`, `202607200003_litter_weight_adjustment_foundation.sql` |

Invariants à préserver :

- une seule session `open` par portée (`whelping_sessions_one_open_per_litter_key`) ;
- événements append-only, séquence unique par session, treize types fermés après les migrations de réouverture et rectification ;
- naissance liée à un unique événement et un unique `animals`, ordre actif unique, révision et annulation auditée ;
- `animal_weight_measurements` est la vérité des poids `birth`, `routine` et `clinical`; `animals.birth_weight_grams` est une projection ;
- une mesure de naissance est liée à `source_birth_id`; une mesure de routine à une `litter_weighing_sessions`; les unicités empêchent le doublon actif ;
- sessions et mesures de routine ont `revision_no`, données d'annulation, index actifs et historique de commandes ;
- RLS de lecture membre, tables métier sans mutation directe, commandes `SECURITY DEFINER` contrôlant rôle, organisation et invariants.

Inventaire physique utile au planning :

| Table | Colonnes métier déterminantes | Index/contraintes et triggers | RLS |
| --- | --- | --- | --- |
| `whelping_sessions` | `litter_id`, `mother_id`, `status`, `started_at`, `ended_at`, `timezone_name`, `note`, audit | FK composite portée/mère, checks état/dates/fuseau ; `whelping_sessions_one_open_per_litter_key`, `whelping_sessions_litter_started_at_idx`; triggers `whelping_sessions_set_updated_at`, `whelping_sessions_validate_timezone`, `whelping_sessions_protect_mutation` | RLS activée, `whelping_sessions_select_member`, `SELECT` seulement |
| `whelping_events` | `session_id`, `sequence_no`, `occurred_at`, `recorded_at`, `event_type`, `note`, `author_id` | unicités session/séquence et organisation/session/id ; `whelping_events_session_sequence_idx`, `whelping_events_session_occurred_at_idx`; triggers `whelping_events_immutable`, `whelping_events_guard_birth_adjustments` | RLS activée, `whelping_events_select_member`, `SELECT` seulement |
| `whelping_births` | `session_id`, `event_id`, `animal_id`, `birth_order`, sexe, viabilité, couleur, `occurred_at`, note, `revision_no`, annulation et audit | événement et animal uniques, `whelping_births_active_session_order_key`, `whelping_births_session_order_idx`; triggers `whelping_births_guard_insert`, `whelping_births_initialize_effective_state`, `whelping_births_immutable` | RLS activée, `whelping_births_select_member`, `SELECT` seulement |
| `animal_weight_measurements` | animal, instant, grammes, `measurement_kind`, `source_birth_id`, `litter_weighing_session_id`, note, `revision_no`, annulation et audit | source de naissance unique, animal unique par séance, checks de source selon le type ; `animal_weight_measurements_animal_measured_at_idx`, `animal_weight_measurements_routine_exact_key`, `animal_weight_measurements_active_litter_session_idx`; triggers de garde d'insertion, validation des liens et immutabilité/rectification | RLS activée, `animal_weight_measurements_select_member`, `SELECT` seulement |
| `litter_weighing_sessions` | portée, `measured_at`, fuseau, note, `revision_no`, annulation et audit | `litter_weighing_sessions_litter_measured_at_idx`, puis index actif `litter_weighing_sessions_active_litter_measured_at_idx`; triggers `litter_weighing_sessions_validate_timezone`, `litter_weighing_sessions_guard_insert`, `litter_weighing_sessions_immutable` | RLS activée, `litter_weighing_sessions_select_member`, `SELECT` seulement |

Les registres `whelping_commands`, `whelping_birth_adjustment_commands`, `litter_weight_commands` et `litter_weight_adjustment_commands` sont privés. Leurs unicités de `client_command_id`, snapshots et révisions permettent les rejeux et audits; ils n'ont pas de policy de lecture cliente. Les triggers `whelping_birth_adjustment_commands_append_only` et `litter_weight_adjustment_commands_immutable` protègent les deux registres de rectification.

Un planning peut annoncer « surveiller la température », « préparer la mise-bas » ou « peser », mais il ne doit jamais recopier dans ses lignes la température, la naissance, l'ordre de naissance, le poids ou l'heure de pesée.

### 1.7 Services serveur, Server Actions et DTO

#### Planning et tâches

`src/features/litter-journal/litter-care-tasks-core.ts` contient :

- les vocabulaires fermés et DTO `LitterCareTaskTemplateSummary`, `LitterCareTaskSummary`, `LitterCareTaskGenerationPlanEntry` et résultats ;
- les lectures autorisées des modèles, de la bibliothèque et des tâches ;
- `planLitterCareTaskGenerationCore`, qui calcule en TypeScript les états `ready`, `already_generated`, `missing_anchor`, `inactive`, `species_mismatch`, `breed_mismatch` ;
- les adaptateurs RPC de génération, import, mutation de modèle, création manuelle et résolution.

`src/features/litter-journal/litter-care-tasks.ts` est la façade serveur qui crée le client Supabase. `src/features/litter-journal/litter-care-tasks-actions.ts` expose les Server Actions `generateLitterCareTasksAction`, `createLitterCareTaskAction` et `resolveLitterCareTaskAction`, valide les formulaires, garde les intentions côté serveur et revalide `/litters/journal`.

`src/features/settings/litter-care-task-templates-actions.ts` porte les actions de création, modification, activation et import, avec revalidation de `/settings/litter-care-task-templates`.

#### Chargement du Journal

`src/features/litter-journal/loader.ts` charge `litter_overview`, filtre les neuf statuts actifs, trie les portées, puis relit les dates reproductives dans `litters`. `src/features/litter-journal/types.ts` définit le DTO du catalogue et les détails. `src/features/litter-journal/date.ts` fixe actuellement le jour métier à `Europe/Paris`.

`src/app/litters/journal/page.tsx` orchestre en parallèle les observations, tâches, plan de génération, workspace de mise-bas, poids et historique de rectification. Les clés de commande sont générées côté serveur et liées aux actions. Aucune lecture unifiée de planning/frise/calendrier n'existe encore.

#### Domaines adjacents

- observations : `src/features/litter-journal/maternal-observations-core.ts`, façade `maternal-observations.ts`, action `maternal-observations-actions.ts` ;
- courbe de température et repère descriptif : `maternal-temperature-chart-model.ts`, `maternal-temperature-drop-policy.ts` ;
- mise-bas : `src/features/whelping/whelping-core.ts`, façade `whelping.ts`, actions `whelping-actions-core.ts` et `whelping-actions.ts`, orchestration `whelping-workspace.ts` ;
- poids : `src/features/litter-weights/litter-weights-core.ts`, façade `litter-weights.ts`, actions, modèles purs de planning de pesée, historiques, statistiques et graphiques.

Le moteur pur `src/features/litter-weights/litter-weighing-schedule-model.ts` est instructif : il matérialise en mémoire une cadence finie à partir d'une politique et rapproche les observations réelles sans inventer de mesure. Il ne faut cependant pas le confondre avec les futures occurrences persistées de tâches.

### 1.8 Routes et composants UI

Routes concernées :

- `/litters/journal` : `src/app/litters/journal/page.tsx` ;
- comparaison de croissance : `src/app/litters/journal/comparison/page.tsx` ;
- paramètres des jalons : `src/app/settings/litter-care-task-templates/page.tsx` ;
- reproduction de la mère : `src/app/animals/[id]/reproduction/page.tsx` ;
- mode de mise-bas partagé : `src/app/whelping/page.tsx`, layout et route de sélection associée ;
- fiches liées : `src/app/litters/[id]/page.tsx`, `src/app/animals/[id]/page.tsx`.

Composants actuels réutilisables :

- `litter-journal-dashboard.tsx` : composition générale ;
- `litter-journal-selector.tsx` : sélection de portée ;
- `litter-care-task-generation-panel.tsx` : prévisualisation et sélection explicite des modèles ;
- `litter-care-tasks-panel.tsx` : création manuelle, liste planifiée, résolution et historique terminal ;
- `maternal-observations-panel.tsx` et `maternal-temperature-chart.tsx` ;
- `src/features/whelping/whelping-panel.tsx` ;
- `src/features/litter-weights/litter-weight-panel.tsx` et `litter-weighing-schedule-summary.tsx` ;
- `src/features/settings/litter-care-task-templates-manager.tsx` et `litter-care-task-library.tsx`.

Il n'existe pas de frise, de vue Aujourd'hui, de calendrier interne ou d'export iCalendar. La liste actuelle trie seulement les tâches planifiées par `planned_for`, puis l'historique par `resolved_at`.

### 1.9 Tests concernés

Socle direct des tâches :

- `tests/e2e/litter-care-tasks-foundation.spec.ts` et `litter-care-tasks-ui.spec.ts` ;
- `tests/e2e/litter-care-task-templates-foundation.spec.ts` et `litter-care-task-templates-ui.spec.ts` ;
- `tests/e2e/litter-care-task-generation-foundation.spec.ts` et `litter-care-task-generation-ui.spec.ts` ;
- `tests/e2e/litter-care-task-library-foundation.spec.ts` et `litter-care-task-library-ui.spec.ts`.

Journal et navigation :

- `tests/e2e/litter-journal.spec.ts` ;
- `tests/e2e/main-sidebar-litter-journal.spec.ts`.

Relations biologiques :

- cycles et saillies : `reproductive-cycles-foundation.spec.ts`, `reproductive-cycles-ui.spec.ts`, `reproductive-cycle-matings.spec.ts`, `reproductive-cycle-matings-ui.spec.ts` ;
- observations : `maternal-observations-foundation.spec.ts`, `maternal-observations-ui.spec.ts`, `maternal-temperature-chart-model.spec.ts`, `maternal-temperature-drop-policy-settings.spec.ts` ;
- mise-bas : les specs `whelping-*-foundation.spec.ts`, `whelping-*-actions-core.spec.ts`, `whelping-*-ui.spec.ts`, ainsi que `whelping-journal-panel.spec.ts` et `whelping-journal-final-consolidation.spec.ts` ;
- poids : `litter-routine-weighing-*`, `litter-weight-adjustment-*`, `litter-weighing-schedule-*`, `litter-weighing-policy-*`, `routine-weight-eligibility.spec.ts` et `animal-weight-relative-series.spec.ts`.

Les tests de fondation créent des fixtures persistantes et les hard-delete dans leur nettoyage. Tout futur test de planning devra conserver les identifiants dès la création, supprimer registres et dépendances dans l'ordre, puis compter sans filtre `deleted_at`.

## 2. Matrice besoin / existant

Légende : **déjà couvert**, **partiellement couvert**, **à étendre**, **nouveau**, **volontairement différé**.

| Besoin | Qualification | Couverture actuelle et écart |
| --- | --- | --- |
| Jalon | Partiellement couvert | Un modèle ponctuel et sa tâche générée existent, avec snapshot et unicité. En revanche, il n'existe pas encore de type fonctionnel `milestone` distinct de la tâche qui le matérialise. |
| Tâche | Déjà couvert | Création manuelle ou depuis un modèle, statut, réalisation/annulation/non-applicabilité, permissions et idempotence. |
| Période ou fenêtre | Nouveau | Une seule date `planned_for`; aucun élément autonome de type `window`, aucune paire de bornes suggérées/retenues et aucun état temporel de fenêtre. |
| Suivi récurrent | À étendre | `occurrence_no` et les unicités préparent les occurrences, mais aucun objet série, aucune cadence ni génération au-delà de l'occurrence 1. |
| Date suggérée | Partiellement couvert | `anchor_date + offset_days` est calculé puis stocké dans `planned_for`, sans conservation distincte de la suggestion après modification manuelle. |
| Date retenue | Partiellement couvert | `planned_for` joue ce rôle de fait, mais elle n'est ni éditable ni distinguée de la suggestion. |
| Date réalisée | Déjà couvert | `resolved_at` en `timestamptz`, fuseau et auteur pour `done`. Le nom générique couvre aussi les autres résolutions. |
| Heure planifiée | Nouveau | Aucune heure locale, aucun snapshot de fuseau et aucun créneau quotidien multiple ne sont portés par les tâches. |
| Verrouillage | Nouveau | Aucun verrou fonctionnel de date ; seuls les verrous transactionnels internes existent. |
| Report historisé | Nouveau | Aucune commande de report et aucun historique de dates. |
| Annulation | Déjà couvert | État terminal `cancelled`, instant, auteur, fuseau, note et commande idempotente. |
| Non-applicabilité | Déjà couvert | État terminal `not_applicable` avec la même traçabilité. |
| Priorité | Nouveau | Aucun champ, vocabulaire, index ou présentation. |
| Modèle de planning | Nouveau | Les modèles existants décrivent un seul jalon; les packs globaux classent la bibliothèque mais ne forment pas un planning d'organisation versionné et instanciable. |
| Planning propre à une portée | Partiellement couvert | Les tâches matérialisées appartiennent à une portée et conservent leurs snapshots, mais il n'existe ni en-tête de planning ni série propre à la portée. |
| Recalcul après changement d'ancrage | Nouveau | La doctrine actuelle est explicitement de ne jamais déplacer une tâche existante. Il faut un recalcul contrôlé des suggestions, sans réécrire les réalisations ou choix manuels. |
| Frise | Nouveau | Aucun DTO ni composant. Les données ponctuelles sont suffisantes pour une première projection une fois les fenêtres ajoutées. |
| Vue Aujourd'hui | Nouveau | Le serveur calcule seulement le jour métier pour le planning de pesée. Aucune lecture multi-portées des occurrences dues. |
| Calendrier interne | Nouveau | Aucun composant, aucune plage de chargement et aucune projection calendrier. |
| Export iCalendar | Volontairement différé | Explicitement exclu de ce lot; à concevoir après stabilisation du modèle et de la lecture calendrier. |

Compléments nécessaires :

| Besoin transversal | Qualification | Commentaire |
| --- | --- | --- |
| Génération idempotente | Déjà couvert pour les jalons ponctuels | Le registre, les verrous et les unicités existent. Il faut étendre la clé à la série et à l'occurrence. |
| Modification manuelle d'une échéance | Nouveau | Aucun RPC ni révision de tâche. |
| Historique des changements | Nouveau | Les snapshots de création existent, pas les changements ultérieurs. |
| Réalisation adossée à un fait réel | Nouveau | Aucun lien vers observation, événement ou séance de pesée. |
| Notifications/cron | Volontairement différé | Ni nécessaire à la liste/frise/calendrier, ni présent dans le socle. |
| Synchronisation Google/Proton | Volontairement différé | Hors périmètre explicite. |

## 3. Source de vérité

### 3.1 Cartographie recommandée

| Information | Source de vérité | Projection autorisée |
| --- | --- | --- |
| Définition réutilisable d'un jalon simple | `litter_care_task_templates` | Copie de bibliothèque dans la même table. |
| Composition d'un modèle de planning | Nouvelles tables de modèle et d'items | Bibliothèque globale éventuelle, jamais utilisée directement pour exécuter une portée. |
| Planning adopté par une portée | Nouvelle instance `litter_plans` et ses définitions/séries snapshotées | DTO de lecture unifié. |
| Type fonctionnel | Snapshot de l'item propre à la portée : `milestone`, `task`, `window` ou `recurring_task` | Présentation adaptée dans la liste, la frise, Aujourd'hui et le calendrier. |
| Règle d'une série récurrente | Nouvelle définition de série propre au planning de portée | Occurrences finies dans `litter_care_tasks`. |
| Occurrence ou élément concret | `litter_care_tasks` étendue | Un point pour `milestone`/`task`, une ligne autonome à deux bornes pour `window`, une occurrence pour `recurring_task`. |
| Date suggérée | Calcul déterministe stocké sur l'occurrence, recalculable et historisé | Affichage « suggérée ». |
| Date retenue | Champ opérationnel de l'occurrence, modifiable par commande | Toutes les vues utilisent cette date pour l'agenda. |
| Heure planifiée | Date civile + heure locale facultative + fuseau IANA snapshoté | Instant UTC dérivé seulement lorsqu'une heure existe. |
| Réalisation générique | État terminal et `resolved_at` de l'occurrence | Historique de la tâche. |
| Première/deuxième saillie | `reproductive_cycle_matings`; champs `litters.mating_date*` comme projections actuelles | Ancrage civil lu par le planning. |
| Estimation d'ovulation | `litters.estimated_ovulation_date` | Ancrage de planning ; ne pas la transformer en mesure de progestérone. |
| Mise-bas prévue | `litters.expected_birth_date` | Ancrage de planning. |
| Naissance réelle | `whelping_births`/`whelping_events`, avec `litters.actual_birth_date` comme projection protégée | Ancrage civil `actual_birth`/`offspring_age`. |
| Chronologie de mise-bas | `whelping_events` | Affichage dans le panneau de mise-bas, éventuellement repère en lecture seule sur une frise. |
| Température maternelle | `maternal_observations` de type `temperature` | Courbe et preuve éventuelle d'une action, sans copier valeur/unité. |
| Poids de naissance et de routine | `animal_weight_measurements`, groupé par `litter_weighing_sessions` pour les routines | Courbes, tableaux, rapprochement éventuel à une occurrence, sans copie du poids. |
| Cadence descriptive de pesée J0-J60 | Snapshot de politique sur `litters` + modèle pur de pesée | Ne devient pas automatiquement une série de tâches sans décision explicite. |

### 3.2 Frontière entre planification et fait

Une occurrence dit « ce qui devait être fait, quand, avec quel état administratif ». Elle ne doit pas porter la donnée observée. Exemples :

- « relever la température » peut être une occurrence ; 37,2 °C à 08:14 reste uniquement dans `maternal_observations` ;
- « suivre la mise-bas » peut être un jalon ; la naissance reste uniquement dans `whelping_events`, `whelping_births` et `animals` ;
- « peser la portée » peut être une occurrence ; les grammes restent uniquement dans `animal_weight_measurements`, et la séance dans `litter_weighing_sessions`.

Pour une action dont la réalisation est déjà un fait structuré, la V1 doit soit laisser la tâche être réalisée manuellement sans recopier le fait, soit introduire un lien étroit de preuve, par exemple `litter_care_task_maternal_observation_evidence`, `litter_care_task_whelping_event_evidence` ou `litter_care_task_weighing_session_evidence`. Ces tables de liaison ne contiendraient aucune valeur clinique et imposeraient des FK composites de même organisation. Une table polymorphe `entity_type/entity_id` sans FK est déconseillée.

En V1, un fait compatible peut être lié ou présenté comme preuve, mais il ne réalise jamais automatiquement l'occurrence. Toute transition de statut reste une commande explicite.

## 4. Modèle cible comparé

### 4.1 Option A — étendre `litter_care_tasks` pour tout porter

Cette option ajoute sur chaque tâche les champs de type, fenêtre, priorité, suggestion, date retenue, verrou, récurrence, règle de fin, révision et historique.

| Critère | Analyse |
| --- | --- |
| Simplicité initiale | Une seule table visible et peu de nouvelles jointures. Adaptation rapide de la liste existante. |
| Cohérence avec l'existant | Bonne pour les jalons ponctuels : la tâche contient déjà un snapshot d'ancrage et une occurrence. |
| Récurrences | Faible : la même ligne mélangerait définition de série et occurrence, ou chaque occurrence recopierait toute la règle. |
| Fenêtres | Faisable avec `window_start`/`window_end`, mais la sémantique de la série resterait dupliquée. |
| Recalcul | Difficile à borner : distinguer la règle, la suggestion calculée, la date retenue et l'override sur chaque ligne devient fragile. |
| Modifications manuelles | Faisables avec une révision et une origine de date, mais elles compliquent encore les checks déjà denses. |
| Historique | Exige une table d'historique malgré la promesse d'une table unique. |
| Calendrier | Lecture simple des occurrences déjà matérialisées. |
| Migration | Ajouts nullables faciles et backfill direct. |
| Risque de régression | Élevé sur les contraintes `source_values`, `resolution_values`, les RPC et les unicités actuelles. |
| Maintenabilité | Décline à mesure que cadence, horizon, fin biologique et recalcul s'ajoutent. La ligne devient à la fois recette, série, occurrence et réalisation. |

L'option A convient seulement si le produit reste durablement limité à des jalons ponctuels indépendants. Elle répond mal au suivi récurrent et au recalcul demandé.

### 4.2 Option B — définition/instance/série distinctes, occurrences réutilisées

Cette option conserve `litter_care_tasks` comme occurrence concrète et introduit au-dessus :

1. un modèle de planning composé d'items ;
2. une instance propre à la portée ;
3. une définition snapshotée de jalon ou série ;
4. des occurrences finies dans `litter_care_tasks`.

| Critère | Analyse |
| --- | --- |
| Simplicité initiale | Plus de tables et de services, mais responsabilités explicites. |
| Cohérence avec l'existant | Très bonne si les modèles ponctuels existants restent les définitions élémentaires et les tâches restent les occurrences. |
| Récurrences | Naturelles : une série porte cadence et fin; chaque tâche porte un numéro et une date. |
| Fenêtres | Définies une fois sur l'item, snapshotées/calculées sur chaque occurrence. |
| Recalcul | La série est recalculée sous verrou; seules suggestions et occurrences éligibles sont touchées. |
| Modifications manuelles | Une occurrence peut cesser de suivre sa suggestion sans altérer la série ni ses voisines. |
| Historique | Les changements de l'occurrence et les recalculs peuvent être append-only et liés à la commande. |
| Calendrier | Lecture efficace sur les occurrences matérialisées, sans évaluer un moteur de récurrence à chaque affichage. |
| Migration | Plus progressive : nouvelles FK nullables, anciennes tâches conservées comme occurrences autonomes. |
| Risque de régression | Modéré si les RPC actuelles restent compatibles et si aucun backfill ne réinterprète artificiellement l'historique. |
| Maintenabilité | Meilleure séparation entre recette, série, occurrence et fait réalisé. |

### 4.3 Recommandation

Retenir **l'option B**, avec réutilisation contrôlée de `litter_care_tasks` comme table des éléments opérationnels et occurrences. Ne pas renommer ni remplacer cette table dans la première migration d'évolution. Le modèle fonctionnel distingue obligatoirement quatre types :

- `milestone` : repère ponctuel, éventuellement marquable comme traité ;
- `task` : action ponctuelle à réaliser ;
- `window` : période autonome avec deux bornes, et non simple attribut facultatif d'une tâche ;
- `recurring_task` : série produisant des occurrences concrètes indépendantes.

Schéma conceptuel indicatif :

```text
litter_care_task_templates (jalon élémentaire d'organisation, existant)
                │
                ├── litter_planning_model_items ── litter_planning_models
                │                                      modèle composé
                │
                ▼
litters ── litter_plans ── litter_plan_items ── litter_care_tasks
             principal        snapshots des 4 types     éléments/occurrences
                                     │                         │
                                     └── litter_plan_series    ├── schedule_changes
                                          + time_slots         └── evidence links
```

Noms et colonnes indicatifs, à confirmer avant migration :

#### `litter_planning_models`

`id`, `organization_id`, `title`, `description`, `species`, `breed`, `is_active`, `revision`, `created_at`, `updated_at`, `created_by`, `updated_by`.

#### `litter_planning_model_items`

`id`, `organization_id`, `planning_model_id`, `organization_template_id`, `item_kind` (`milestone`, `task`, `window`, `recurring_task`), `priority` (`normal`, `important`, `organization_critical`), ancrage, offsets de date ou de bornes, heure(s) locale(s), règle de récurrence éventuelle, `sort_order`, `revision`.

Le lien vers `litter_care_task_templates` réutilise le contenu, la cible, la catégorie et l'ancrage. En V1, un modèle ponctuel existant peut être ajouté tel quel à un modèle de planning sans perdre son identité.

#### `litter_plans`

`id`, `organization_id`, `litter_id`, `title`, `status` (`active`, `completed`, `cancelled`), `revision`, `last_recalculated_at`, `created_at`, `updated_at`, auteurs. Une unicité partielle impose **un seul planning opérationnel principal actif par portée**. Plusieurs modèles spécialisés peuvent être appliqués successivement à ce même planning; ils y ajoutent des items snapshotés sans créer de second planning concurrent.

#### `litter_plan_items`

Snapshot propre à la portée : `id`, `organization_id`, `litter_plan_id`, `source_planning_model_id nullable`, `organization_template_id nullable`, `item_kind`, contenu métier snapshoté, `anchor_type`, `anchor_date_snapshot`, priorité, règles de date/heure, `revision` et état d'activation. Les modifications futures d'un modèle ne changent pas cet item sans action explicite.

Pour `milestone` et `task`, l'item définit une date civile suggérée et éventuellement une heure locale. Pour `window`, il définit deux bornes civiles suggérées. Pour `recurring_task`, il possède une série associée.

Une fenêtre peut exister seule ou être reliée à un ou plusieurs points par une table étroite telle que `litter_plan_item_window_links`. Elle n'est jamais réduite à deux colonnes facultatives sur une tâche. Le lien reste indicatif : la date retenue du `milestone` ou de la `task` peut sortir des bornes retenues de la fenêtre après confirmation explicite et historique.

#### `litter_plan_series` et `litter_plan_series_time_slots`

La série porte `litter_plan_item_id`, la cadence, le début, la fin, l'horizon matérialisé, la révision et l'état fonctionnel `active`, `suspended`, `completed`, `cancelled` ou `not_applicable`. Le libellé de `completed` est « Terminée ».

Les créneaux sont relationnels : `litter_plan_series_time_slots` porte `series_id`, `slot_no` et `local_time`, avec unicité de l'heure dans la série et de `(series_id, slot_no)`. Cela autorise par exemple 08:00 et 20:00 sans tableau JSON opaque.

#### Extensions de `litter_care_tasks`

- `item_kind` avec les quatre valeurs fonctionnelles ;
- `litter_plan_item_id nullable` et `litter_plan_series_id nullable` pour préserver toutes les tâches historiques autonomes ;
- `occurrence_no`, `recurrence_day_no nullable` et `slot_no nullable` ;
- `suggested_for date nullable` et `suggested_local_time time nullable` ;
- conserver `planned_for` comme date retenue pour compatibilité, avec un nom DTO `scheduledFor`; elle reste obligatoire pour les points et devient sans objet pour une ligne `window` ;
- `scheduled_local_time time nullable` et `schedule_timezone_name text nullable` ;
- pour un `window`, `suggested_starts_on`, `suggested_ends_on`, `retained_starts_on`, `retained_ends_on` et, si utile, les heures locales facultatives de début/fin ; ces bornes appartiennent à la fenêtre elle-même ;
- `priority` contraint à `normal`, `important`, `organization_critical`; le dernier est affiché « Critique pour l’organisation » ;
- `schedule_source` (`suggested`, `manual`) ;
- `is_schedule_locked`, `schedule_locked_at`, `schedule_locked_by` ;
- `revision_no` ;
- éventuellement `cancelled_reason`/`not_applicable_reason` si la note générique ne suffit pas.

Les checks dépendent du type : un point exige une date civile `planned_for`; une fenêtre autorise `planned_for = null` mais exige ses deux bornes retenues ordonnées; une occurrence récurrente exige série, `recurrence_day_no` et `slot_no`. Une fenêtre est donc une ligne autonome, affichable et résoluble sans tâche fille.

L'état fonctionnel d'une fenêtre est calculé depuis ses bornes retenues et son état terminal :

- `upcoming` (« À venir ») avant la borne de début ;
- `open` (« Ouverte ») du début à la fin inclus ;
- `overdue` (« Dépassée ») après la borne de fin tant qu'elle n'est pas traitée ;
- `treated` (« Traitée ») si son état persistant est `done` ;
- `cancelled` (« Annulée ») ou `not_applicable` (« Non applicable ») selon sa résolution.

Les bornes suggérées continuent d'évoluer lors d'un recalcul. Les bornes retenues pilotent ces états et peuvent diverger des bornes suggérées après confirmation explicite et historique. La date retenue d'un point lié peut, elle aussi, être hors de la fenêtre retenue après cette confirmation.

#### Date civile, heure locale et fuseau

Deux représentations sont possibles :

| Représentation | Avantage | Limite |
| --- | --- | --- |
| `date + local_time + timezone_name` | Préserve explicitement le jour civil voulu, accepte une date sans heure et ne dépend pas du fuseau du navigateur. | Nécessite une conversion serveur contrôlée pour obtenir un instant et une gestion explicite des heures ambiguës/inexistantes lors d'un changement d'heure. |
| `timestamptz` seul | Comparaison chronologique et requêtes d'agenda simples. | Perd l'intention « jour civil sans heure », impose un instant même quand il n'existe pas et peut afficher une autre date selon le fuseau du client. |

Recommandation : conserver la **date civile comme autorité**, ajouter une heure locale facultative et le `timezone_name` IANA de l'organisation, snapshoté sur l'élément lors de sa planification. Lorsqu'une heure existe, le serveur valide le triplet et peut stocker un `scheduled_at timestamptz` dérivé comme projection indexable; cette projection n'est jamais recalculée depuis le fuseau du navigateur. Une date sans heure n'a pas d'instant artificiel.

Les fenêtres suivent la même logique avec bornes civiles obligatoires et heures locales facultatives. Les rendez-vous à heure précise sont rendus à leur heure locale dans la vue semaine et l'agenda. Les anciennes tâches restent valides avec `planned_for`, heure et fuseau nuls; elles continuent d'être des éléments « journée entière ».

#### `litter_care_task_schedule_changes`

Registre append-only : tâche, commande, type (`manual_reschedule`, `anchor_recalculation`, `lock`, `unlock`), révision attendue/résultante, anciennes/nouvelles suggestion, date/heure retenue ou bornes de fenêtre, ancien/nouveau verrou, fuseau snapshoté, ancrage lu, motif, auteur, instant. Ce registre est privé; une RPC de lecture renvoie un DTO expurgé.

Le modèle ne doit pas intégrer les valeurs biologiques. Les liens de preuve, s'ils sont retenus, sont des tables étroites séparées.

## 5. Migration et compatibilité

### 5.1 Principe

La migration doit être additive et en plusieurs étapes. Aucune tâche existante ne doit être supprimée, clonée ou réinterprétée comme membre d'une série inventée.

### 5.2 Préservation des tâches

- ajouter `item_kind`, `litter_plan_item_id` et `litter_plan_series_id` de façon additive ;
- conserver `planned_for` et sa signification historique ; dans les nouveaux DTO il devient la date retenue ;
- backfiller les anciennes lignes avec `item_kind = 'task'`, `priority = 'normal'`, `scheduled_local_time = null`, `schedule_timezone_name = null` et `revision_no = 0` ;
- pour une tâche de modèle existante, backfiller `suggested_for = planned_for` et `schedule_source = 'suggested'` ;
- pour une tâche manuelle existante, garder `suggested_for = null` et `schedule_source = 'manual'` ;
- laisser `litter_plan_item_id = null` et `litter_plan_series_id = null` pour toutes les tâches historiques ;
- conserver sans transformation `status`, `resolution_command_id`, `resolved_at`, `resolved_timezone_name`, `resolved_by` et `resolution_note`.

Ainsi, les tâches `done`, `cancelled` et `not_applicable` gardent exactement leur interprétation. Aucun recalcul ne les touche.

### 5.3 Modèles, bibliothèque et liens

- `litter_care_task_templates` reste la définition élémentaire d'organisation ;
- ses identifiants, révisions, origines `library_template_code/version`, état actif et historique de commandes restent intacts ;
- les modèles de planning composés référencent les modèles d'organisation au lieu de les recopier comme nouvelles identités ;
- l'import de bibliothèque continue de créer une copie dans `litter_care_task_templates` ;
- un modèle importé peut ensuite être ajouté à un planning comme n'importe quel modèle d'organisation ;
- la bibliothèque globale ne doit jamais devenir une FK directe depuis une occurrence, afin de préserver l'indépendance des copies.

Les FK existantes `organization_template_id` sur `litter_care_tasks` restent valides. Une nouvelle occurrence générée depuis une série conserve ce lien et le snapshot actuel.

### 5.4 Commandes idempotentes

- conserver les signatures actuelles tant que l'UI historique les appelle ;
- soit versionner les RPC (`generate_litter_plan_occurrences`, `reschedule_litter_care_task`, `recalculate_litter_plan`), soit faire de l'ancienne génération un adaptateur compatible vers une série ponctuelle ;
- ne pas modifier la signification des anciens registres ;
- conserver les unicités actuelles pour les tâches sans série ;
- ajouter une unicité spécifique aux séries, sans rendre incompatibles les lignes où `litter_plan_series_id is null`.

Le rejeu d'une ancienne commande doit toujours retourner le résultat historique. Une nouvelle commande ne doit jamais « adopter » un ancien `client_command_id`.

### 5.5 Permissions

La matrice actuelle est le défaut recommandé :

- tous les membres actifs lisent ;
- `owner`, `admin`, `member` créent, planifient, reportent et résolvent les occurrences ;
- `owner`/`admin` gèrent les modèles de planning et les modèles élémentaires ;
- `viewer` reste strictement sans contrôle de mutation dans le DOM.

Les nouvelles tables reprennent les FK composites d'organisation, la RLS et les grants minimaux. Les registres et tables de lien internes n'ont aucune policy cliente. Toute mutation métier passe par une RPC `SECURITY DEFINER` avec `search_path = ''`, relecture de l'adhésion et absence d'`organization_id` fourni comme autorité par le navigateur.

## 6. Recalcul et concurrence

### 6.1 Changement de date d'ovulation

Un changement de `litters.estimated_ovulation_date` ne doit pas déplacer silencieusement les tâches. Il rend le planning « à recalculer ». Deux stratégies sont possibles :

1. déclencher immédiatement une commande de recalcul dans la même transaction applicative que la modification de l'ancrage ;
2. marquer un écart de révision et proposer un recalcul explicite.

La V1 recommande une commande explicite ou orchestrée côté serveur, jamais un trigger qui modifie massivement les occurrences sans contexte utilisateur. La commande :

1. verrouille la portée et le planning ;
2. relit tous les ancrages dans `litters` ;
3. compare une révision attendue du planning et, si utile, l'ancienne valeur d'ancrage attendue ;
4. recalcule les dates suggérées et les bornes suggérées des fenêtres déterministes ;
5. écrit un historique unique ;
6. ajuste uniquement les éléments déjà matérialisés et ne crée aucune occurrence nouvelle.

### 6.2 Règles de conservation

| État de l'occurrence | Effet du recalcul |
| --- | --- |
| Planifiée, suit la suggestion, non verrouillée | Mettre à jour `suggested_for`, fenêtre et `planned_for`. |
| Planifiée, date retenue manuellement | Mettre à jour la suggestion et la fenêtre, conserver `planned_for`. |
| Planifiée, verrouillée | Conserver la date/heure ou les bornes retenues; mettre à jour la suggestion à titre informatif et historiser l'écart. |
| Réalisée | Ne modifier aucune date opérationnelle ou donnée de résolution. |
| Annulée | Ne pas réactiver ni déplacer. |
| Non applicable | Ne pas réactiver ni déplacer. |

La conservation d'une date manuelle ne doit pas dépendre d'une comparaison fragile `planned_for = suggested_for`. Elle doit être exprimée par `schedule_source`.

`owner`, `admin` et `member` peuvent verrouiller ou déverrouiller. Le verrou bloque uniquement le recalcul automatique de la date/heure ou des bornes retenues; la suggestion continue d'évoluer. Un report manuel explicite reste autorisé sur un élément verrouillé après confirmation, avec motif et historique. Pour une fenêtre, une borne retenue hors des bornes suggérées est également admise après confirmation explicite.

### 6.3 Double clic et retry réseau

Chaque mutation reçoit un `client_command_id` stable pour l'intention affichée. Le registre stocke le payload canonique et le résultat. Un rejeu identique retourne le résultat initial; la même clé avec un autre payload retourne `client_command_conflict`. Les boutons sont désactivés côté UI pendant la soumission, mais la sûreté reste en base.

### 6.4 Deux modifications concurrentes

- toutes les commandes d'occurrence prennent un verrou de commande puis un verrou de ligne `FOR UPDATE` sur la tâche ;
- elles exigent `expected_revision_no` ;
- une commande tardive reçoit `stale_revision` et recharge le DTO ;
- les recalculs prennent en plus un verrou transactionnel stable par planning/portée ;
- les index uniques restent la dernière barrière contre les doublons.

### 6.5 Génération en double

L'unicité recommandée est `(organization_id, litter_plan_series_id, recurrence_day_no, slot_no)`, complétée par un `occurrence_no` séquentiel immuable pour l'affichage. La matérialisation :

- verrouille la série ;
- calcule la liste finie attendue pour l'horizon ;
- insère par une RPC atomique ;
- considère une occurrence existante identique comme `already_generated` ;
- refuse une collision dont le snapshot diffère.

Un `upsert` aveugle ne doit jamais écraser une date retenue, un verrou ou un état terminal.

### 6.6 Changement simultané d'ancrage et de date retenue

Les deux commandes sont sérialisées par le verrou du planning. La commande de report vérifie la révision de l'occurrence et celle du planning/ancrage qu'elle a affichée. Si le recalcul gagne :

- le report reçoit `stale_revision` ;
- l'UI recharge la nouvelle suggestion ;
- l'utilisateur confirme sa date retenue contre le nouvel ancrage.

Si le report gagne, il marque `schedule_source = 'manual'`; le recalcul suivant actualise la suggestion mais conserve la date retenue. Aucun « dernier write gagne » silencieux n'est admis.

## 7. Récurrences

### 7.1 V1 volontairement simple

Ne pas introduire RRULE, cron ni moteur générique. Une série V1 est décrite par :

- `recurrence_kind = 'daily_interval'` ;
- `recurrence_interval_days` entier strictement positif pour « tous les N jours » ;
- un début sous forme de date civile explicite ou d'offset civil par rapport à l'ancrage ;
- un ou plusieurs créneaux locaux ordonnés, par exemple 08:00 et 20:00 ;
- le fuseau IANA snapshoté ;
- une borne de fin explicite : date, offset, nombre maximal ou borne biologique ;
- `absolute_max_occurrences`, plafond strict validé en base et dans la commande.

Cette forme exclut volontairement jours ouvrés, règles hebdomadaires ou mensuelles, cron et RRULE.

### 7.2 Série et occurrences

`litter_plan_series` porte la règle et son snapshot. Son état est distinct de celui des occurrences :

- `active` : de nouvelles occurrences peuvent être matérialisées par commande explicite ;
- `suspended` : aucune nouvelle matérialisation tant qu'elle n'est pas reprise; les occurrences existantes gardent leur état ;
- `completed` : borne atteinte ou terminaison normale, sans nouvelle occurrence ;
- `cancelled` : arrêt décidé; les occurrences futures sont annulées selon la commande auditée ;
- `not_applicable` : la série entière ne s'applique plus; ses occurrences futures deviennent `not_applicable`.

`litter_care_tasks` porte chaque occurrence, avec son propre état `planned`, `done`, `cancelled` ou `not_applicable`. Une occurrence peut être réalisée, reportée ou verrouillée indépendamment sans changer l'état de la série. Inversement, suspendre une série ne marque pas ses occurrences existantes comme réalisées.

Ces états ne doivent pas être confondus avec l'état calculé d'une `window` : « À venir », « Ouverte » et « Dépassée » résultent de la date courante et des bornes retenues, tandis que « Traitée », « Annulée » et « Non applicable » reflètent la résolution persistée de cette fenêtre autonome.

Une modification de cadence crée une nouvelle révision de série ou clôt l'ancienne à une borne; elle ne réécrit pas les occurrences terminales.

Pour chaque date de cadence, `recurrence_day_no` commence à 1. Les créneaux triés par heure reçoivent `slot_no = 1..n`. `occurrence_no` numérote ensuite chaque paire `(recurrence_day_no, slot_no)` dans l'ordre date/heure. Deux créneaux le même jour ont donc le même `recurrence_day_no`, des `slot_no` distincts et des `occurrence_no` distincts. L'unicité SQL repose sur la série, le jour de récurrence et le créneau; la définition des créneaux est immuable dans une révision active.

### 7.3 Horizon et matérialisation

Règle impérative :

- matérialiser explicitement lors de l'application d'un modèle au planning ou de l'activation d'une série, jusqu'au plus petit de la fin, de l'horizon autorisé et du maximum absolu ;
- n'effectuer **aucune écriture lors du chargement** du Journal, de la frise, d'Aujourd'hui ou du calendrier ;
- si une borne biologique est inconnue et que l'horizon est atteint, afficher l'état et proposer une commande utilisateur explicite de prolongation ;
- borner cette prolongation par la révision, l'horizon demandé, la fin devenue connue et `absolute_max_occurrences` ;
- réserver un éventuel scheduler automatique à un lot futur séparé.

Toutes les vues restent des lectures sans effet de bord et n'affichent que les occurrences déjà matérialisées.

### 7.4 Fins biologiques

Vocabulaire V1 possible :

- `fixed_occurrence_count` ;
- `fixed_end_offset` par rapport à l'ancrage ;
- `actual_birth` ;
- `last_offspring_departure`.

`actual_birth` vient de `litters.actual_birth_date`, lui-même projeté depuis la première naissance Journal lorsqu'elle existe. Le départ du dernier chiot doit être dérivé des animaux/réservations/adoptions existants selon une règle métier à valider; il ne doit pas être saisi comme une seconde date dans le planning.

Si la borne biologique n'est pas encore connue, la matérialisation reste limitée à l'horizon. Lorsqu'elle apparaît, une commande clôt la série et :

- ne supprime aucune occurrence terminale ;
- marque les occurrences futures non pertinentes `not_applicable` avec un motif système audité ;
- ne crée rien après la borne.

### 7.5 Idempotence

- commande unique par matérialisation ;
- verrou de série ;
- paire `(recurrence_day_no, slot_no)` et `occurrence_no` déterministes ;
- unicité SQL ;
- résultat stocké ;
- payload canonique incluant série, révision, horizon demandé et ancrage lu ;
- collision conflictuelle refusée, jamais écrasée.

## 8. Projection UI

### 8.1 Lecture métier commune

Créer un DTO serveur unique, par exemple :

```ts
type LitterPlanningOccurrenceDTO = {
  id: string;
  litter: { label: string; publicIndex: number };
  kind: "milestone" | "task" | "window" | "recurring_task";
  title: string;
  category: string;
  targetScope: string;
  priority: "normal" | "important" | "organization_critical";
  suggestedFor: string | null;
  suggestedLocalTime: string | null;
  scheduledFor: string | null;
  scheduledLocalTime: string | null;
  timezoneName: string | null;
  suggestedWindow: { startsOn: string; endsOn: string } | null;
  retainedWindow: { startsOn: string; endsOn: string } | null;
  status: "planned" | "done" | "cancelled" | "not_applicable";
  windowState:
    | "upcoming" | "open" | "overdue"
    | "treated" | "cancelled" | "not_applicable"
    | null;
  completedAt: string | null;
  isScheduleLocked: boolean;
  scheduleSource: "suggested" | "manual";
  occurrenceNo: number;
  recurrenceDayNo: number | null;
  slotNo: number | null;
  seriesLabel: string | null;
  seriesState:
    | "active" | "suspended" | "completed"
    | "cancelled" | "not_applicable"
    | null;
};
```

Le DTO public ne doit exposer ni identifiant d'organisation, ni clé de commande, ni registre, ni révision interne. Les intentions de mutation restent liées côté serveur comme aujourd'hui.

### 8.2 Quatre projections

| Vue | Projection du même DTO |
| --- | --- |
| Liste actuelle | Regrouper éléments à traiter puis historiques; distinguer les quatre types et enrichir de priorité, suggestion, heure, verrou et état de série/fenêtre. |
| Frise | Rendre `milestone` comme repère, `task` comme action ponctuelle, `window` comme intervalle autonome et `recurring_task` comme occurrences reliées à leur série. Les faits de mise-bas restent des repères en lecture seule issus de leur source propre. |
| Aujourd'hui | Lecture serveur multi-portées des points du jour, des rendez-vous à heure précise et des fenêtres ouvertes/dépassées, avec priorité. |
| Calendrier interne | Requête bornée `[rangeStart, rangeEnd]`; vue mois en dates civiles, vue semaine/agenda positionnant les éléments munis d'une heure locale dans le fuseau snapshoté. |

### 8.3 Fonctions pures

Peuvent rester pures et testables :

- calcul d'une date civile depuis ancrage + offset ;
- calcul des bornes et de l'état temporel des fenêtres ;
- génération candidate finie d'une série pour un horizon ;
- numérotation déterministe des jours, créneaux et occurrences ;
- classement `overdue`, `today`, `upcoming`, `completed` à partir d'un `todayDate` explicite ;
- tri par priorité/date ;
- construction des groupes de liste, pistes de frise et cellules de calendrier ;
- formatage et détection d'intersection de plage.

Doivent venir du serveur :

- authentification, rôle et sélection des portées accessibles ;
- valeurs d'ancrage actuelles ;
- occurrence persistée, révision, verrou et historique ;
- matérialisation explicite, prolongation explicite, recalcul, report et résolution ;
- liens éventuels vers observations, événements et séances ;
- définition du jour métier de l'organisation. La constante `Europe/Paris` actuelle devra être évaluée avant une commercialisation multi-fuseaux.

Toutes les vues doivent consommer la même sémantique et rester strictement sans effet de bord : aucun chargement, changement de plage ou navigation de calendrier ne matérialise une occurrence. Il est déconseillé de recalculer la date suggérée indépendamment dans chaque composant.

## 9. Découpage d'implémentation

### Lot 1 — Fondation des dates d'occurrence et historique

- **Objectif métier** : fonder les quatre types, la date civile obligatoire ou les bornes civiles, l'heure locale facultative, le fuseau snapshoté, les priorités `normal`/`important`/`organization_critical`, le verrou et la révision.
- **Tables/services** : extension additive de `litter_care_tasks`, checks propres aux points et fenêtres autonomes, registre de changements, RPC de report/verrouillage, DTO enrichi.
- **Migration** : oui, avec backfill conservateur décrit en section 5.
- **Tests** : schéma, dates/heures/fuseaux, états calculés de fenêtre, vocabulaire de priorité, RLS/grants, backfill, idempotence, stale revision, double clic et tâches terminales inchangées.
- **Exclusions** : modèle composé, récurrence, frise, calendrier.
- **Dépendance** : aucune nouvelle; s'appuie sur le socle actuel.

### Lot 2 — Modèles de planning composés

- **Objectif métier** : regrouper des `milestone`, `task`, `window` et `recurring_task` dans des modèles spécialisés réutilisables et versionnés.
- **Tables/services** : `litter_planning_models`, `litter_planning_model_items`, commandes privées, CRUD `owner`/`admin`.
- **Migration** : oui.
- **Tests** : composition, ordre, espèce/race, révisions, permissions, import existant réutilisable, aucun effet sur les tâches.
- **Exclusions** : instanciation de portée et récurrence.
- **Dépendance** : lot 1 pour le vocabulaire des dates/fenêtres.

### Lot 3 — Planning propre à la portée et compatibilité de génération

- **Objectif métier** : alimenter progressivement l'unique planning principal d'une portée depuis plusieurs modèles spécialisés et créer les items snapshotés.
- **Tables/services** : `litter_plans`, `litter_plan_items`, FK nullable depuis les tâches, application atomique d'un modèle; adaptateur de l'ancienne commande.
- **Migration** : oui.
- **Tests** : préservation des anciens modèles/liens, génération partielle, `stale_plan`, commandes rejouées, unicités legacy et nouvelles, permissions.
- **Exclusions** : séries répétées.
- **Dépendance** : lots 1 et 2.

### Lot 4 — Recalcul contrôlé des ancrages

- **Objectif métier** : recalculer suggestions et fenêtres après changement d'ovulation ou autre ancrage sans perdre les choix manuels.
- **Tables/services** : RPC de recalcul, historique, marqueur de révision du planning.
- **Migration** : éventuellement seulement fonctions/index si le schéma du lot 3 suffit.
- **Tests** : matrice complète suggestion/manuelle/verrouillée/réalisée/annulée/non applicable, concurrence ancrage-report, retry et résultat atomique.
- **Exclusions** : récurrence et auto-réalisation par faits.
- **Dépendance** : lot 3.

### Lot 5 — Récurrences finies V1

- **Objectif métier** : suivre une action tous les N jours, à un ou plusieurs créneaux locaux quotidiens, avec début, borne, horizon et plafond absolu.
- **Tables/services** : `litter_plan_series`, `litter_plan_series_time_slots`, états de série, commandes explicites d'activation/matérialisation et de prolongation, fin biologique.
- **Migration** : oui.
- **Tests** : plusieurs créneaux le même jour, numérotation/unicité, états de série, horizon, plafond, absence d'infini, fin mise-bas, fin dernier départ simulée sans dupliquer le fait, idempotence et concurrence.
- **Exclusions** : RRULE, jours ouvrés, règles mensuelles, cron, scheduler et notifications.
- **Dépendance** : recalcul du lot 4.

### Lot 6 — Lecture unifiée et vue Aujourd'hui

- **Objectif métier** : produire le DTO canonique et une vue opérationnelle multi-portées.
- **Tables/services** : requêtes indexées par date/heure/état/priorité, fonction pure de classement; aucune commande de matérialisation appelée par la lecture.
- **Migration** : index éventuels seulement.
- **Tests** : isolation organisation, `viewer`, jour civil, retards, fenêtres, pagination/limites, absence d'identifiants techniques.
- **Exclusions** : frise et calendrier.
- **Dépendance** : lot 5 pour une lecture finale incluant les occurrences récurrentes.

### Lot 7 — Frise

- **Objectif métier** : visualiser le parcours de la portée, ses fenêtres et faits de repère sans les dupliquer.
- **Tables/services** : aucun nouveau stockage attendu; projection distincte des quatre types et lectures sans effet de bord des ancrages/faits nécessaires.
- **Migration** : non.
- **Tests** : fonctions de projection, responsive, accessibilité, absence d'interpolation ou de faux fait.
- **Exclusions** : édition par glisser-déposer.
- **Dépendance** : lecture unifiée du lot 6.

### Lot 8 — Calendrier interne

- **Objectif métier** : consulter les occurrences dans une plage, filtrer et ouvrir leur détail.
- **Tables/services** : lecture bornée sans écriture, index de plage et d'instant dérivé, vues mois/semaine/agenda, composants calendrier internes sans dépendance si réalisable.
- **Migration** : index éventuels.
- **Tests** : bornes de plage, changement de mois, fenêtres, fuseau/jour civil, performances, droits.
- **Exclusions** : iCalendar, Google, Proton, notifications et synchronisation.
- **Dépendance** : lot 6; peut suivre ou précéder la frise.

### Lot 9 — Liens de preuve et rapprochement avec les faits

- **Objectif métier** : montrer qu'une occurrence correspond à une observation, un événement ou une pesée sans recopier la donnée.
- **Tables/services** : tables de liaison étroites et lectures expurgées; aucune auto-réalisation en V1.
- **Migration** : oui si les liens persistants sont retenus.
- **Tests** : FK de même organisation, unicité, fait annulé/rectifié, absence de copie de valeur, permissions.
- **Exclusions** : diagnostic ou recommandation clinique.
- **Dépendance** : modèle d'occurrence stabilisé.

L'export iCalendar constitue un lot ultérieur distinct, après stabilisation du calendrier interne et des règles de confidentialité.

## 10. Risques et décisions à valider

Les autres règles structurantes décrites dans cet audit sont actées. Restent réellement ouverts :

1. **Départ du dernier chiot** : définir la source métier exacte parmi statut animal, adoption, réservation, rendez-vous de départ ou autre fait déjà structuré.
2. **Cadence spécialisée des pesées** : décider si elle reste un planning descriptif spécialisé ou peut alimenter explicitement le planning général. Elle ne doit jamais créer de mesure ni réaliser automatiquement une occurrence.
3. **Fuseau paramétrable par organisation** : choisir le lot de bascule depuis la constante actuelle `Europe/Paris`, sans remettre en cause le stockage recommandé date/heure locale/fuseau.
4. **Détails UI non structurants** : densité de la frise, filtres par défaut, couleurs, regroupements et ergonomie exacte des vues semaine/agenda.

## Conclusion

Le dépôt possède déjà les briques critiques : modèle ponctuel d'organisation, copie versionnée depuis une bibliothèque globale, snapshot complet sur la tâche, génération partielle atomique et idempotente, permissions et registres privés. Le bon axe n'est donc pas de remplacer ce socle.

La cible recommandée est une architecture à trois niveaux : **modèles spécialisés composés → planning principal et items/séries snapshotés propres à la portée → éléments et occurrences concrets dans `litter_care_tasks`**. Cette séparation rend possibles les quatre types fonctionnels, les horaires locaux, les récurrences finies, le recalcul et les modifications manuelles sans altérer les tâches terminales ni dupliquer les faits biologiques. La liste actuelle, la frise, Aujourd'hui et le calendrier sont des projections en lecture seule d'un même DTO, tandis que naissances, températures et poids restent exclusivement dans leurs tables métier existantes.
