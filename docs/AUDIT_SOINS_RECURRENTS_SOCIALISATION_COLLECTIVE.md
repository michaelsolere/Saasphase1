# Audit — soins récurrents et socialisation collective

Date : 2026-08-01

Lot : `CARE-SOCIALIZATION-COLLECTIVE-AUDIT-01`

Nature : audit documentaire uniquement ; aucune implémentation fonctionnelle.

## 1. Référence Git auditée

L'audit porte sur le dépôt `michaelsolere/Saasphase1`, depuis la branche de travail
`codex/audit-collective-care-socialization`, créée directement à partir de :

```text
main        c00a3be196260a352da52a5a696013c15a66b54f
origin/main c00a3be196260a352da52a5a696013c15a66b54f
```

Avant la création de la branche, `git switch main`, `git fetch origin`, les deux
`git rev-parse` et `git status --short --branch` ont confirmé que le worktree
était propre, que `main` suivait `origin/main` et que les deux références
correspondaient au SHA attendu.

Ce document décrit le code et les migrations présents à ce SHA. Il ne déduit
pas l'état d'une base distante et n'a nécessité aucun démarrage, reset ou accès
à une stack Supabase.

## 2. Décision fonctionnelle impérative

La socialisation visée est **strictement collective** :

- une programmation concerne la `litter` ou `all_offspring` ;
- aucune occurrence, checklist, note ou observation spécialisée n'est rattachée
  à un animal ;
- aucune progression par chiot n'est calculée dans ce domaine ;
- une particularité propre à un chiot reste dans les modules déjà prévus pour
  l'animal, les notes, la santé ou les observations, hors socialisation
  collective.

Cette décision est compatible avec le vocabulaire autoritatif actuel : les
seules cibles de tâche sont `mother`, `litter`, `all_offspring` et
`organization`. Les tables de planning et `litter_care_tasks` ne portent pas
de `animal_id`. (`supabase/migrations/202607180004_litter_care_tasks.sql`,
`src/features/litter-journal/litter-care-tasks-core.ts`)

## 3. Sources inspectées

### 3.1 Cadrage et documentation

- `AGENTS.md` ;
- `README.md` ;
- `docs/PROJECT_LOG.md` ;
- `docs/AUDIT_TECHNIQUE_JOURNAL_PORTEES_MISE_BAS.md` ;
- `docs/AUDIT_PLANNING_JALONS_CALENDRIER_JOURNAL_PORTEES.md`.

### 3.2 Migrations principales

- tâches, modèles élémentaires, génération et bibliothèque globale :
  `202607180004_litter_care_tasks.sql`,
  `202607180005_litter_care_task_template_mutations.sql`,
  `202607180006_litter_care_task_generation.sql`,
  `202607190001_litter_care_task_library.sql` ;
- occurrences, dates retenues, verrouillage et historique :
  `202607230001_litter_planning_occurrence_foundation.sql` ;
- modèles composés, plans de portée et import :
  `202607240001_litter_planning_models_foundation.sql`,
  `202607240002_litter_plan_instantiation_foundation.sql`,
  `202607260005_litter_planning_model_library_gestation.sql`,
  `202607270002_litter_planning_model_import_immutability.sql`,
  `202607280002_litter_planning_library_recurrence.sql` ;
- recalcul, récurrence et programmation directe :
  `202607260009_litter_plan_anchor_recalculation.sql`,
  `202607270001_litter_recurring_tasks_foundation.sql`,
  `202607270003_litter_ad_hoc_planning_foundation.sql`,
  `202607280001_litter_ad_hoc_metadata_edit.sql` ;
- lien structuré étroit avec un fait du Journal :
  `202607290001_maternal_temperature_planning_link.sql` ;
- postnatal et naissance réelle :
  `202607300001_litter_care_deworming_category.sql`,
  `202607300002_dog_postnatal_essential_care_model.sql`,
  `202607300003_litter_actual_birth_plan_activation.sql`,
  `202607300004_litter_actual_birth_series_reconciliation_engine.sql`,
  `202607300005_litter_actual_birth_plan_reconciliation.sql`,
  `202607300007_litter_actual_birth_activation_lifecycle.sql` ;
- réversibilité de l'activation après annulation de naissance :
  `202607300008_litter_actual_birth_reversal_snapshot_foundation.sql`,
  `202607310009_litter_actual_birth_plan_reversal_engine.sql`,
  `202607310010_litter_actual_birth_plan_reversal_post_activation_guard.sql`,
  `202607310011_litter_single_birth_cancellation_reversal_wiring.sql`,
  `202607310012_whelping_birth_cancellation_diagnostics.sql` et
  `202607310013_whelping_birth_cancellation_success_feedback.sql`.

### 3.3 Services, projections et interfaces

Les services et types inspectés incluent notamment :

- `src/features/litter-journal/litter-care-tasks-core.ts` ;
- `src/features/litter-journal/litter-planning-models-core.ts` ;
- `src/features/litter-journal/litter-planning-model-library-core.ts` ;
- `src/features/litter-journal/litter-planning-model-apply.ts` ;
- `src/features/litter-journal/litter-plans-core.ts` ;
- `src/features/litter-journal/litter-plan-ad-hoc.ts` ;
- `src/features/litter-journal/litter-plan-ad-hoc-programmer.ts` ;
- `src/features/litter-journal/litter-care-today.ts` ;
- `src/features/litter-journal/litter-care-calendar.ts` ;
- `src/features/litter-journal/litter-care-timeline.ts` ;
- `src/features/litter-journal/litter-plan-timeline.ts` ;
- `src/features/litter-journal/litter-plan-series-summary.ts` ;
- `src/features/settings/litter-planning-model-editor.tsx` ;
- `src/features/settings/litter-planning-model-editor-draft.ts` ;
- `src/features/settings/litter-planning-models-presentation.ts`.

Les dialogues de programmation, de report, de résolution et de gestion de série
ont également été inspectés, notamment
`litter-plan-ad-hoc-programmer-dialog.tsx`,
`litter-care-task-schedule-dialog.tsx`,
`litter-care-task-resolution-dialog.tsx`,
`litter-care-today-quick-actions.tsx` et `litter-plan-series-panel.tsx`.

### 3.4 Tests consultés

Les assertions structurantes ont été recoupées en particulier dans :

- `tests/e2e/dog-postnatal-care-model.spec.ts` et
  `tests/e2e/dog-postnatal-care-model-pure.spec.ts` ;
- `tests/e2e/litter-recurring-tasks-foundation.spec.ts` lorsqu'il est référencé
  par la fondation, ainsi que les specs actuelles `litter-planning-model-*`,
  `litter-plan-*` et `litter-care-*` présentes dans `tests/e2e` ;
- `tests/e2e/litter-planning-model-library-recurrence.spec.ts` et sa spec pure ;
- `tests/e2e/litter-planning-model-editor.spec.ts` et sa spec pure ;
- `tests/e2e/litter-care-today-projection.spec.ts`,
  `litter-care-calendar-model.spec.ts`, `litter-care-timeline-model.spec.ts` et
  `litter-plan-timeline-projection.spec.ts` ;
- `tests/e2e/litter-actual-birth-plan-activation.spec.ts`,
  `litter-actual-birth-activation-lifecycle.spec.ts`,
  `litter-actual-birth-plan-reconciliation.spec.ts` et les specs de
  réversibilité associées.

## 4. Inventaire technique de l'existant

### 4.1 Source de vérité et niveaux de snapshot

Le moteur actuel suit déjà l'architecture recommandée par l'audit précédent :

```text
bibliothèque globale versionnée
        ↓ import explicite
modèles élémentaires et composés de l'organisation
        ↓ application explicite
plan principal + items/séries snapshotés pour une portée
        ↓ matérialisation
litter_care_tasks = éléments concrets et occurrences résolubles
        ↓ projections en lecture
Journal / frise / Aujourd'hui / calendrier
```

Les règles générales ne sont donc pas relues dynamiquement lors de chaque
affichage. La tâche concrète conserve son titre, sa description, sa catégorie,
sa cible, son ancre, son calendrier et sa résolution. Modifier ensuite un
modèle ne réécrit pas l'historique. (`docs/PROJECT_LOG.md`,
`supabase/migrations/202607240002_litter_plan_instantiation_foundation.sql`,
`supabase/migrations/202607270001_litter_recurring_tasks_foundation.sql`)

### 4.2 Modèles élémentaires

`litter_care_task_library_packs` et
`litter_care_task_library_templates` constituent le catalogue global en lecture
seule. Un template global est identifié par `(code, version)` et porte le
contenu élémentaire : `title`, `description`, `category`, `target_scope`,
`anchor_type`, `offset_days`, `species`, `breed`, ordre et disponibilité. Les
codes sont contraints et l'import ne donne jamais à une occurrence un lien
direct vers le catalogue global. (`202607190001_litter_care_task_library.sql`)

`litter_care_task_templates` est la copie modifiable propre à l'organisation.
Elle porte le même contenu élémentaire, `is_active`, `sort_order`, `revision` et,
pour une copie importée, l'origine immuable
`library_template_code/library_template_version`. `owner` et `admin` la gèrent ;
`member` et `viewer` la lisent. Les commandes de mutation et d'import sont
idempotentes et contrôlées côté serveur. (`202607180004_litter_care_tasks.sql`,
`202607180005_litter_care_task_template_mutations.sql`,
`202607190001_litter_care_task_library.sql`,
`src/features/litter-journal/litter-care-tasks-core.ts`)

Le catalogue contient déjà trois éléments importants pour le sujet :

- `dog-check-litter-general-condition`, collectif `all_offspring` ;
- `dog-open-socialization-checklist`, catégorie `socialization`, cible
  `all_offspring`, ancré à J21 ;
- `dog-prepare-puppy-departures`, catégorie `preparation`, cible `litter`,
  ancré à J49.

Le titre « Ouvrir la checklist de socialisation » est seulement celui d'un
jalon élémentaire. La ligne ne contient aucune action de checklist et le dépôt
ne fournit aucun écran de checklist derrière ce repère.
(`202607190001_litter_care_task_library.sql`)

### 4.3 Modèles composés

Le catalogue composé utilise `litter_planning_model_library_models`,
`litter_planning_model_library_items` et
`litter_planning_model_library_item_time_slots`. Les modèles propres à
l'organisation utilisent `litter_planning_models`,
`litter_planning_model_items` et
`litter_planning_model_item_time_slots`. (`202607240001_litter_planning_models_foundation.sql`,
`202607260005_litter_planning_model_library_gestation.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`,
`202607280002_litter_planning_library_recurrence.sql`)

Un modèle porte titre, description, filtre éventuel d'espèce/race, activation,
révision et origine globale éventuelle. Un item référence un template
élémentaire et définit :

- `item_kind` : `milestone`, `task`, `window` ou `recurring_task` ;
- priorité organisationnelle : `normal`, `important` ou
  `organization_critical` ;
- ancre et offset ponctuel, bornes de fenêtre ou règle de récurrence ;
- ordre, caractère obligatoire et sélection par défaut ;
- éventuellement `completion_fact_kind`, dont l'unique valeur actuelle est le
  cas étroit `maternal_temperature_observation`.

Une récurrence V1 est exclusivement `daily_interval`, donc quotidienne ou tous
les N jours. Son intervalle est borné à 1..365 jours. Sa fin est
`fixed_end_offset`, `fixed_recurrence_day_count` ou `actual_birth`; l'horizon
initial est borné à 1..365 jours et le plafond absolu à 1..500 occurrences. Un
item récurrent exige entre un et huit créneaux horaires uniques et ordonnés.
(`202607270001_litter_recurring_tasks_foundation.sql`,
`src/features/litter-journal/litter-planning-models-core.ts`,
`src/features/settings/litter-planning-model-editor-draft.ts`)

L'éditeur des paramètres permet de composer, ordonner, dupliquer et configurer
ces quatre types, les récurrences et leurs créneaux. Il ne permet pas de définir
des sous-actions de checklist, des champs d'observation ou un formulaire de
bilan. (`src/features/settings/litter-planning-model-editor.tsx`,
`src/features/settings/litter-planning-model-editor-draft.ts`,
`tests/e2e/litter-planning-model-editor-pure.spec.ts`)

### 4.4 Plan principal et items propres à la portée

`litter_plans` impose au plus un plan `active` par organisation et portée. Il
porte un titre, un fuseau IANA et une révision. Plusieurs modèles peuvent être
appliqués successivement à ce même plan ; ils ne créent pas des plannings
concurrents. (`202607240002_litter_plan_instantiation_foundation.sql`)

`litter_plan_items` conserve un snapshot autonome du modèle et de l'item source :
contenu métier, catégorie, cible, type, priorité, ancre résolue, offsets,
fenêtre ou récurrence, sélection et ordre. Son état d'ancre est
`pending_anchor` ou `materialized`. Les items ad hoc sont distingués des items
issus de modèles ; les règles de récurrence y sont également snapshotées. Le
snapshot source n'est pas relu depuis le modèle, tandis que les champs
opérationnels autorisés évoluent seulement par les commandes révisées prévues.
(`202607240002_litter_plan_instantiation_foundation.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`,
`202607270003_litter_ad_hoc_planning_foundation.sql`)

L'application d'un modèle est explicite, compatible espèce/race, compare les
révisions attendues et rejette une sélection invalide ou un modèle déjà
appliqué. Son registre `litter_plan_application_commands` conserve le payload
et le résultat pour rejeu exact. L'UI affiche l'indépendance du snapshot et
prévisualise points, fenêtres et occurrences initiales.
(`src/features/litter-journal/litter-planning-model-apply.ts`,
`202607260009_litter_plan_anchor_recalculation.sql`,
`tests/e2e/litter-planning-model-apply-ui-pure.spec.ts`)

### 4.5 Séries, créneaux et occurrences concrètes

`litter_plan_series` porte une règle récurrente snapshotée : plan et item,
cadence, date de début, type et valeur de fin, horizon matérialisé, plafond,
compteur, fuseau, état et révision. Il existe une seule série par item de plan.
Les états de série sont `active`, `suspended`, `completed`, `cancelled` et
`not_applicable`. Ils restent distincts des états des occurrences.
(`202607270001_litter_recurring_tasks_foundation.sql`)

`litter_plan_series_time_slots` snapshotte de un à huit créneaux locaux avec
unicité de `(series_id, slot_no)` et de l'heure dans la série. Les tables de
créneaux des modèles et du catalogue suivent la même séparation relationnelle.
Elles ne sont pas des tableaux libres portés par la tâche.
(`202607270001_litter_recurring_tasks_foundation.sql`,
`202607280002_litter_planning_library_recurrence.sql`)

`litter_care_tasks` est la source de vérité opérationnelle pour chaque point,
fenêtre ou occurrence matérialisée. En plus du contenu métier snapshoté, elle
porte les identités de plan/item/série, `occurrence_no`,
`recurrence_day_no`, `slot_no`, les dates suggérées et retenues, l'heure locale,
le fuseau, l'origine du calendrier, le verrou, la révision et la résolution.
L'unicité `(organization_id, litter_plan_series_id, recurrence_day_no, slot_no)`
empêche une occurrence récurrente dupliquée.
(`202607180004_litter_care_tasks.sql`,
`202607230001_litter_planning_occurrence_foundation.sql`,
`202607240002_litter_plan_instantiation_foundation.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`)

La matérialisation est finie, explicite, bornée et idempotente. Elle ne se
produit pas lors d'une lecture du Journal, d'Aujourd'hui, de la frise ou du
calendrier. Une collision identique est rejouable ; une collision de snapshot
différent est refusée. (`202607270001_litter_recurring_tasks_foundation.sql`,
`docs/AUDIT_PLANNING_JALONS_CALENDRIER_JOURNAL_PORTEES.md`)

### 4.6 Programmation directe

Le programmateur ad hoc sait créer dans le plan une tâche, un jalon, une
fenêtre ou une série finie. Il accepte le titre, une description jusqu'à 5 000
caractères, la catégorie, la cible, la priorité, le verrou et le calendrier.
Pour une série, il accepte tous les N jours, une date de fin ou un nombre de
jours de récurrence et plusieurs créneaux, sous le plafond de 500 occurrences.
(`src/features/litter-journal/litter-plan-ad-hoc.ts`,
`src/features/litter-journal/litter-plan-ad-hoc-programmer.ts`,
`202607270003_litter_ad_hoc_planning_foundation.sql`)

Une séance collective de socialisation peut donc être programmée aujourd'hui,
sans modèle global et sans nouvelle structure, comme une tâche ou une série
`socialization` ciblant `litter` ou `all_offspring`. Cette capacité ne transforme
pas sa description en checklist structurée.

### 4.7 Dates suggérées, dates retenues, report et verrouillage

Pour un point, `suggested_for` et `suggested_local_time` représentent la
proposition ; `planned_for` et `scheduled_local_time` représentent la date et
l'heure retenues. Pour une fenêtre, les bornes `suggested_*` sont distinctes
des bornes `retained_*`. `schedule_source` vaut `suggested` ou `manual`.
(`202607230001_litter_planning_occurrence_foundation.sql`)

Les commandes de report, remplacement d'un calendrier verrouillé,
verrouillage, déverrouillage et réapplication de suggestion exigent une
révision attendue. Chaque succès produit une entrée append-only dans
`litter_care_task_schedule_changes`, avec snapshots avant/après, motif,
révisions et auteur. Les registres de commande et de changement sont privés des
clients. (`202607230001_litter_planning_occurrence_foundation.sql`,
`202607260009_litter_plan_anchor_recalculation.sql`,
`src/features/litter-journal/litter-care-tasks-core.ts`)

Le recalcul d'ancre met à jour les suggestions, mais conserve la date retenue
manuellement, les calendriers verrouillés et les occurrences terminales. Il
est sérialisé par portée/plan et historisé dans
`litter_plan_anchor_recalculation_commands`.
(`202607260009_litter_plan_anchor_recalculation.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`,
`tests/e2e/litter-plan-anchor-recalculation-foundation.spec.ts`)

### 4.8 Résolution et note libre

Une occurrence concrète a le statut `planned`, `done`, `cancelled` ou
`not_applicable`. Une résolution terminale conserve obligatoirement la commande,
l'instant, le fuseau, l'auteur et peut porter une unique `resolution_note` de
5 000 caractères au maximum. Un rejeu du même `client_command_id` renvoie la
résolution initiale ; une autre tâche avec la même clé est un conflit.
(`202607180004_litter_care_tasks.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`,
`src/features/litter-journal/litter-care-tasks-core.ts`)

Le dialogue complet propose le statut et une note facultative. L'action rapide
« réalisée » d'Aujourd'hui envoie volontairement une note vide ; le détail
reste disponible dans le dialogue de résolution. Une série peut en outre être
suspendue ou terminée ; son annulation/non-applicabilité résout les occurrences
futures avec audit.
(`src/features/litter-journal/litter-care-task-resolution-dialog.tsx`,
`src/features/litter-journal/litter-care-today-quick-actions.tsx`,
`src/features/litter-journal/litter-plan-series-panel.tsx`,
`202607270001_litter_recurring_tasks_foundation.sql`)

`resolution_note` est une note unique et opaque. Elle ne fournit ni identifiant
de sous-action, ni état par case, ni typage d'observation, ni version de
checklist, ni requête fiable par thème.

### 4.9 Catégories et cibles

Les catégories autoritatives sont :

```text
reproduction
maternal_health
maternal_feeding
preparation
offspring_weight
offspring_health
offspring_feeding
deworming
socialization
veterinary
identification
vaccination
other
```

Les cibles sont exclusivement :

```text
mother
litter
all_offspring
organization
```

Les contraintes sont présentes sur le catalogue, les templates d'organisation
et les tâches. Les items de plan recopient la catégorie et la cible du template
dans leur snapshot. Le programmateur direct réutilise les mêmes listes.
(`202607180004_litter_care_tasks.sql`,
`202607300001_litter_care_deworming_category.sql`,
`src/features/litter-journal/litter-care-tasks-core.ts`,
`src/features/litter-journal/litter-plan-ad-hoc.ts`)

`litter` et `all_offspring` sont toutes deux collectives, mais leur sens n'est
pas identique : `litter` vise le projet ou groupe portée dans son ensemble ;
`all_offspring` explicite que l'action concerne collectivement tous les chiots.
Aucune des deux ne sélectionne un sous-ensemble ou un animal.

### 4.10 Projections d'utilisation

Les mêmes `LitterCareTaskSummary` alimentent les usages suivants :

- le Journal et l'historique, avec résolution et programmation ;
- la frise biologique, qui distingue tâche, jalon, fenêtre et occurrence
  récurrente, regroupe par catégorie et affiche aussi les états terminaux ;
- Aujourd'hui, qui classe `dueToday`, `overdue`, `openWindows` et
  `handledToday`, triés par priorité et calendrier ;
- le calendrier mois/semaine/agenda, qui projette seulement les éléments
  `planned`, étale les fenêtres et filtre par type et catégorie ;
- les panneaux de série, qui synthétisent cadence, créneaux, état et compteurs.

Ces projections ne contiennent aucun traitement particulier de la
socialisation : la catégorie est déjà un filtre et les occurrences suivent le
comportement commun. (`src/features/litter-journal/litter-care-today.ts`,
`litter-care-calendar.ts`, `litter-care-timeline.ts`,
`litter-plan-series-summary.ts`, `tests/e2e/litter-care-timeline-model.spec.ts`)

### 4.11 Permissions, RLS et commandes

La matrice effective reste cohérente :

| Capacité | `owner` / `admin` | `member` | `viewer` |
| --- | --- | --- | --- |
| Lire modèles, plans, séries et tâches | oui | oui | oui |
| Créer, programmer, reporter, verrouiller et résoudre | oui | oui | non |
| Gérer les templates et modèles d'organisation | oui | non | non |
| Importer le catalogue global | oui | non | non |

Les tables métier lisibles ont RLS et des policies d'adhésion active. Les
tables de catalogue global sont lisibles par les utilisateurs authentifiés.
Les registres de commande, historiques privés et projections internes ont RLS
sans policy cliente ou des droits révoqués. Les mutations passent par des RPC
`security definer`, `search_path = ''`, qui relisent l'organisation et le rôle.
(`202607180004_litter_care_tasks.sql`,
`202607190001_litter_care_task_library.sql`,
`202607230001_litter_planning_occurrence_foundation.sql`,
`202607240001_litter_planning_models_foundation.sql`,
`202607240002_litter_plan_instantiation_foundation.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`)

Les principaux registres sont les suivants :

| Registre | Intention et protection principale |
| --- | --- |
| `litter_care_task_template_commands` | mutation révisée d'un template d'organisation |
| `litter_care_task_library_import_commands` | import global explicite et rejouable |
| `litter_care_task_generation_commands` | génération historique depuis les templates élémentaires |
| `litter_planning_model_commands` | création, remplacement et activation révisés d'un modèle composé |
| `litter_planning_model_library_import_commands` | import atomique d'un modèle composé global et de ses éléments |
| `litter_plan_application_commands` | application révisée d'un modèle au plan principal |
| `litter_plan_ad_hoc_commands` | programmation directe atomique d'un item et de sa tâche/série |
| `litter_care_task_schedule_commands` / `litter_care_task_schedule_changes` | intention idempotente et historique avant/après du calendrier |
| `litter_plan_anchor_recalculation_commands` | mise à jour d'ancre et recalcul atomique du plan |
| `litter_plan_series_materialization_commands` | prolongation/matérialisation bornée d'une série |
| `litter_plan_series_state_commands` | transition révisée d'état de série |

Ces commandes utilisent des clés idempotentes, des payloads canoniques, des
révisions attendues, des verrous de ligne et/ou des verrous advisory. Les
contraintes d'unicité sont la dernière barrière contre le double clic et la
concurrence. (`202607180005_litter_care_task_template_mutations.sql`,
`202607180006_litter_care_task_generation.sql`,
`202607190001_litter_care_task_library.sql`,
`202607230001_litter_planning_occurrence_foundation.sql`,
`202607240001_litter_planning_models_foundation.sql`,
`202607240002_litter_plan_instantiation_foundation.sql`,
`202607260009_litter_plan_anchor_recalculation.sql`,
`202607270001_litter_recurring_tasks_foundation.sql`,
`202607270003_litter_ad_hoc_planning_foundation.sql`)

### 4.12 Activation depuis la naissance réelle

Les items `actual_birth` et `offspring_age` restent en `pending_anchor` tant que
`litters.actual_birth_date` est absente. La naissance prévue ne sert pas de
fallback silencieux. À la première naissance réelle enregistrée, l'orchestrateur
privé matérialise atomiquement les items en attente, initialise les séries et
crée leurs occurrences dans l'horizon autorisé. Il réconcilie aussi les séries
pré-mise-bas dont la borne est la naissance réelle.
(`202607300003_litter_actual_birth_plan_activation.sql`,
`tests/e2e/litter-actual-birth-plan-activation.spec.ts`)

Cette activation possède une lignée et une projection d'état privées, des
registres append-only et un mécanisme de réconciliation après correction de la
date. L'annulation réversible de l'unique naissance source restaure le planning
uniquement si la photographie et les invariants prouvent qu'aucune modification
postérieure incompatible n'existe. (`202607300004_litter_actual_birth_series_reconciliation_engine.sql`,
`202607300005_litter_actual_birth_plan_reconciliation.sql`,
`202607300007_litter_actual_birth_activation_lifecycle.sql`,
`202607300008_litter_actual_birth_reversal_snapshot_foundation.sql`,
`202607310009_litter_actual_birth_plan_reversal_engine.sql`)

Les tables privées correspondantes comprennent les activations et leur état
courant, les désactivations, les réconciliations de séries et de plan, la
photographie de réversibilité et les changements de restauration. Elles sont
séparées des occurrences métier et ne créent aucune seconde date de naissance.
(`202607300003_litter_actual_birth_plan_activation.sql`,
`202607300004_litter_actual_birth_series_reconciliation_engine.sql`,
`202607300005_litter_actual_birth_plan_reconciliation.sql`,
`202607300007_litter_actual_birth_activation_lifecycle.sql`,
`202607300008_litter_actual_birth_reversal_snapshot_foundation.sql`,
`202607310009_litter_actual_birth_plan_reversal_engine.sql`)

### 4.13 Modèle postnatal canin existant

Le modèle global facultatif `dog-postnatal-essential-care` contient exactement :

| Élément | Type et cible | Ancre et calendrier |
| --- | --- | --- |
| Contrôle post-partum de la mère | tâche, `mother` | `offspring_age`, J1 |
| Vermifuges des chiots | série, `all_offspring` | J14 puis tous les 14 jours jusqu'à J56, 09:00, plafond 4 |
| Début de transition alimentaire | tâche, `all_offspring` | J21 |
| Examen, identification et vaccination | fenêtre, `litter` | J49 à J56 |

L'application complète produit quatre items et sept occurrences concrètes :
J1, J14, J21, J28, J42, J56 et la fenêtre vétérinaire. Les quatre items sont
facultatifs mais sélectionnés par défaut. Aucun n'a de
`completion_fact_kind` : le modèle ne marque automatiquement aucun soin comme
réalisé. (`202607300002_dog_postnatal_essential_care_model.sql`,
`tests/e2e/dog-postnatal-care-model-pure.spec.ts`,
`tests/e2e/dog-postnatal-care-model.spec.ts`)

## 5. Matrice de couverture

Les qualifications ci-dessous portent sur la valeur métier minimale décrite
dans la colonne « portée couverte ». Un besoin plus structuré est signalé dans
la colonne « écart exact » ; il ne change pas artificiellement la qualification
du cas minimal.

| Besoin | Qualification | Structure réutilisable | Portée couverte et écart exact |
| --- | --- | --- | --- |
| Vermifuges | **déjà couvert** | Modèle postnatal, série `daily_interval`, cible `all_offspring`, occurrences dans `litter_care_tasks` | J14/J28/J42/J56 sont déjà proposés, ajustables et résolubles. Produits, doses et preuve vétérinaire restent volontairement hors modèle. |
| Soins collectifs | **couvert avec un modèle de catalogue supplémentaire** | Catégories `offspring_health`/`other`, cibles `litter`/`all_offspring`, tâches, fenêtres, séries et notes | Le moteur est complet et un template « état général de la portée » existe, mais aucun modèle composé générique ne définit une cadence collective postnatale complète. |
| Alimentation et sevrage | **couvert avec un modèle de catalogue supplémentaire** | Catégorie `offspring_feeding`, tâche J21 existante, séries collectives possibles | Le début de transition est déjà planifié ; une progression, plusieurs étapes ou une fin de sevrage exigent seulement de nouveaux items de modèle tant que chaque séance garde une note libre unique. |
| Socialisation collective | **couvert avec un modèle de catalogue supplémentaire** pour une V1 de séances | Catégorie `socialization`, cibles collectives, modèle élémentaire J21, série et occurrences, `resolution_note` | Le jalon nommé « checklist » n'est pas une checklist. Des séances collectives datées/récurrentes et une note par séance sont possibles ; cases structurées, observations typées et bilan ne le sont pas. Ces derniers feraient passer le besoin à **extension légère nécessaire**. |
| Vaccination | **déjà couvert** pour la planification collective | Catégorie disponible et fenêtre vétérinaire J49–J56 du modèle postnatal | Le rendez-vous collectif inclut la vaccination dans le titre/description et peut être résolu. Il n'existe pas de preuve structurée ni de statut vaccinal par chiot dans ce moteur ; ce serait un autre domaine et non de la socialisation. |
| Identification | **déjà couvert** pour la planification collective | Catégorie disponible, templates d'identification et fenêtre vétérinaire J49–J56 | La préparation et la visite sont planifiables collectivement. L'identifiant administratif propre à chaque animal ne doit pas être copié dans une occurrence collective. |
| Visite vétérinaire | **déjà couvert** | Fenêtre `veterinary` J49–J56, cible `litter`, report/verrou/résolution | L'occurrence gère le rendez-vous et sa note ; elle ne remplace pas un dossier clinique ou un document vétérinaire. |
| Préparation des départs | **couvert avec un modèle de catalogue supplémentaire** | Template élémentaire `dog-prepare-puppy-departures`, catégorie `preparation`, cible `litter` | Un repère J49 existe, mais il n'est pas intégré au modèle postnatal composé et aucune séquence de préparation n'est définie. Un modèle ou des items supplémentaires suffisent pour une checklist libre. |

Sources communes de la matrice : catalogue élémentaire
`supabase/migrations/202607190001_litter_care_task_library.sql`, modèle
postnatal `supabase/migrations/202607300002_dog_postnatal_essential_care_model.sql`,
fondation des séries
`supabase/migrations/202607270001_litter_recurring_tasks_foundation.sql`,
vocabulaire et DTO
`src/features/litter-journal/litter-care-tasks-core.ts`, et assertions
`tests/e2e/dog-postnatal-care-model-pure.spec.ts`.

Une qualification « module spécialisé nécessaire » n'est démontrée pour aucun
des huit besoins dans leur forme de planification collective minimale. Elle ne
deviendrait justifiée que pour un workflow autonome plus riche que la
planification et la réalisation d'occurrences.

## 6. Analyse spécifique de la socialisation collective

### 6.1 Ce que les champs actuels permettent réellement

| Structure actuelle | Ce qu'elle permet | Ce qu'elle ne permet pas |
| --- | --- | --- |
| `title` | Nommer une séance ou un thème collectif : « Habituation aux bruits domestiques » | Identifier plusieurs actions internes avec leurs états propres |
| `description` | Donner une consigne longue, une liste visuelle ou un protocole personnalisable de 5 000 caractères | Conserver des cases cochées, leur identité/version et leur historique |
| catégorie `socialization` | Filtrer, regrouper et afficher la séance dans la frise et le calendrier | Distinguer seule les axes, niveaux ou résultats |
| cible `litter` | Viser la séance ou l'environnement de la portée dans son ensemble | Sélectionner certains chiots |
| cible `all_offspring` | Dire explicitement que tous les chiots sont concernés collectivement | Enregistrer un résultat par chiot ou un sous-groupe |
| modèle composé | Regrouper plusieurs thèmes/séances, les ordonner et les adapter par élevage | Définir des sous-champs de saisie dans une occurrence |
| série + créneaux | Répéter une séance tous les N jours, à un ou plusieurs horaires, avec fin et plafond | Porter plusieurs observations structurées dans la même séance |
| occurrence | Donner à chaque séance une date, un état, un calendrier, une révision et une identité historique | Porter nativement une collection de réponses structurées |
| `resolution_note` | Conserver un commentaire collectif libre par séance | Requêter « action X réalisée », comparer des axes ou calculer un bilan fiable |

### 6.2 Six niveaux de besoin à ne pas confondre

1. **Simple planification de séances collectives** : déjà possible par tâche,
   modèle ou série `socialization`.
2. **Checklist datée et personnalisable au sens éditorial** : possible si la
   « checklist » est seulement une description textuelle associée à une
   occurrence datée ; les coches ne sont pas persistées séparément.
3. **Note libre de réalisation** : déjà possible par `resolution_note`, une
   note par occurrence.
4. **Checklist structurée contenant plusieurs actions** : non couverte ; il
   manque des identités de case, un ordre, un snapshot de version et des états
   de réponse.
5. **Observations structurées par séance** : non couvertes ; il manque un
   vocabulaire fermé de champs, leurs valeurs, validations et historique.
6. **Bilan collectif** : un texte libre est possible ; un bilan calculable ou
   comparable n'est pas possible sans données structurées.

Le dépôt ne doit donc pas présenter le template
`dog-open-socialization-checklist` comme une checklist fonctionnelle. C'est un
repère qui peut ouvrir un futur parcours, pas le parcours lui-même.

### 6.3 Un thème par tâche ou plusieurs actions dans une séance

Le moteur actuel peut représenter plusieurs thèmes sans nouveau schéma en
créant plusieurs items ou séries collectives : sons, surfaces, manipulations,
environnement, humains, transport, etc. Chaque thème obtient alors son propre
calendrier, son état et sa note. Cette décomposition est suffisante si le besoin
métier accepte que chaque thème soit une occurrence autonome.

Elle devient artificielle si l'éleveur doit ouvrir **une seule séance**, y voir
dix actions internes, cocher partiellement ces actions, saisir plusieurs
observations typées, puis conserver un bilan de séance. Dupliquer dix tâches
pour simuler dix cases créerait du bruit dans Aujourd'hui et le calendrier,
fragmenterait la note et rendrait la clôture de séance ambiguë. Ce seuil marque
le passage de l'option A à l'option B.

### 6.4 Précédent architectural utile, mais non générique

Le lien de température maternelle démontre qu'un fait structuré peut être relié
à une occurrence sans dupliquer la valeur : `completion_fact_kind` est
snapshoté et `maternal_observation_task_links` relie une observation à une
occurrence compatible. Cette implémentation est volontairement fermée à
`maternal_temperature_observation`, `maternal_health`, `mother` et
`recurring_task`. Elle ne constitue pas un moteur générique de formulaire et
ne doit pas être étendue par simple ajout d'un libellé `socialization`.
(`202607290001_maternal_temperature_planning_link.sql`)

Le principe réutilisable est seulement le suivant : le planning reste la source
de l'échéance et de l'occurrence ; une donnée métier structurée éventuelle est
liée étroitement, snapshotée et auditée, sans recopier un fait dans une note.

## 7. Comparaison des options

### 7.1 Option A — modèles de planning uniquement

Cette option crée un modèle collectif composé de tâches ou séries
`socialization`, ciblées `litter` ou `all_offspring`. Les descriptions portent
les consignes et `resolution_note` le retour de séance.

| Critère | Analyse |
| --- | --- |
| Simplicité métier | Très forte : une séance reste une occurrence commune |
| Expérience quotidienne | Déjà intégrée au Journal, à la frise, à Aujourd'hui et au calendrier |
| Duplication | Aucune nouvelle source de vérité ; thèmes séparés seulement si utile |
| Historique | Date, statut, auteur et note déjà conservés par occurrence |
| Paramétrage par élevage | Modèles d'organisation modifiables ; programmation ad hoc possible |
| Multi-organisation | Déjà couvert par `organization_id`, FK composites et RLS |
| Permissions | Matrice actuelle réutilisée sans nouveau rôle |
| Concurrence / idempotence | Commandes, révisions, verrous et unicités déjà présents |
| Maintenabilité | Meilleure option tant que la donnée utile est calendrier + état + note |
| Évolution sans suivi individuel | Naturelle : les deux cibles collectives restent fermées |

Limite : une liste tapée dans `description` et un compte rendu dans
`resolution_note` restent du texte libre. Cette option ne doit pas être vendue
comme une checklist structurée.

### 7.2 Option B — extension légère du moteur existant

Cette option conserve les mêmes items, séries et occurrences, mais leur associe
une définition de checklist snapshotée et des réponses collectives par
occurrence. Il ne s'agit pas d'un second moteur de calendrier.

Une conception future devrait au minimum séparer :

- la définition versionnée des actions dans le catalogue ou le modèle
  d'organisation ;
- son snapshot dans l'item de plan ;
- les réponses liées à l'occurrence concrète ;
- un bilan collectif facultatif ;
- les commandes idempotentes et l'historique de modification.

Le choix JSONB contre tables relationnelles ne doit pas être décidé dans cet
audit. Un JSONB fermé, versionné et validé peut réduire le nombre de tables pour
une petite checklist immuable ; des actions requêtables, réordonnables ou
évolutives favorisent des tables étroites. Dans les deux cas, aucune réponse ne
porte `animal_id`.

| Critère | Analyse |
| --- | --- |
| Simplicité métier | Bonne si la checklist reste une propriété facultative de l'item/occurrence |
| Expérience quotidienne | Une seule séance, plusieurs cases, une clôture claire |
| Duplication | Faible si le planning reste autoritaire pour date et statut |
| Historique | Exige snapshot de définition, réponses et commandes auditées |
| Paramétrage par élevage | Exige un éditeur de checklist et une copie d'organisation |
| Multi-organisation | Exige `organization_id`, FK composites et neutralisation inter-org |
| Permissions | Lecture pour tous les membres actifs ; édition selon les rôles de tâche/modèle existants |
| Concurrence / idempotence | Exige révision de réponse, commande stable et refus des écrasements concurrents |
| Maintenabilité | Acceptable si l'extension demeure générique et attachée au moteur actuel |
| Évolution sans suivi individuel | À garantir par absence d'`animal_id` et contraintes de cible collective |

Cette option devient nécessaire lorsque la valeur produit repose réellement
sur des **cases persistées** ou des **observations typées** au sein d'une même
séance, et non sur la seule planification.

### 7.3 Option C — module spécialisé

Cette option introduit des sessions ou formulaires collectifs de socialisation
avec leur propre cycle de vie, toujours reliés à une occurrence du planning.

| Critère | Analyse |
| --- | --- |
| Simplicité métier | Faible au départ ; nouveau vocabulaire et nouvelle navigation |
| Expérience quotidienne | Peut devenir meilleure pour un workflow riche, sinon surdimensionnée |
| Duplication | Risque élevé de doubler date, état, note et permissions du planning |
| Historique | Riche, mais à construire entièrement |
| Paramétrage par élevage | Puissant, mais coûteux : modèles, versions, formulaires et migrations |
| Multi-organisation | Toute la surface RLS/FK doit être recréée et testée |
| Permissions | Peut justifier des droits dédiés seulement si le métier les exige |
| Concurrence / idempotence | Nouveau registre de commandes et nouvelles révisions nécessaires |
| Maintenabilité | Coût le plus élevé et risque d'un moteur parallèle |
| Évolution sans suivi individuel | Possible, mais doit interdire explicitement toute FK animal |

Cette option ne devient raisonnable que si la socialisation acquiert un workflow
autonome non représentable comme réponse d'occurrence : séances ouvertes puis
clôturées, plusieurs intervenants ou validations, pièces jointes obligatoires,
bibliothèque riche de formulaires, recherches et bilans transverses, corrections
auditées complexes ou droits différents du planning. Aucun de ces besoins n'est
démontré dans le dépôt ou le cadrage actuel.

## 8. Recommandation

### 8.1 Décision recommandée maintenant

Retenir **l'option A pour la première version** et conserver
`litter_care_tasks` comme source de vérité des séances concrètes. Aucun nouveau
module ni nouvelle table de socialisation n'est justifié aujourd'hui.

La première version utile doit être un modèle collectif de socialisation :

- ancré sur `offspring_age`, donc activé seulement depuis la naissance réelle ;
- composé de quelques tâches ou séries `socialization` ;
- ciblé `litter` ou `all_offspring` exclusivement ;
- avec titres et descriptions personnalisables ;
- résoluble par occurrence avec une note collective libre ;
- visible sans code spécialisé dans la frise, Aujourd'hui et le calendrier.

Le nombre exact de thèmes, la cadence, les âges, les créneaux et le contenu des
descriptions sont des décisions fonctionnelles à valider avec l'éleveur ; cet
audit ne prescrit aucun protocole de socialisation.

### 8.2 Sens exact de « sans migration »

Une V1 peut être **configurée et éprouvée sans aucune migration** en créant un
modèle d'organisation depuis l'éditeur actuel, ou en programmant directement
des séries sur une portée. Cela valide l'usage quotidien avant d'inscrire un
standard produit.

Un **modèle global de catalogue** ne peut en revanche pas être livré à toutes
les organisations littéralement sans migration dans l'architecture actuelle :
les catalogues globaux versionnés sont des données SQL installées par migration.
Sa livraison demanderait une migration **de données de catalogue uniquement**,
sans changement de table, colonne, RLS, RPC ou type généré. Le lot serait donc
« sans migration de schéma », mais pas « sans fichier de migration ».
(`202607260005_litter_planning_model_library_gestation.sql`,
`202607300002_dog_postnatal_essential_care_model.sql`)

### 8.3 Critères de passage à l'option B

Ouvrir un audit de conception d'extension légère seulement si la validation
fonctionnelle confirme au moins un de ces besoins :

1. plusieurs actions doivent être cochées séparément dans une même séance ;
2. une séance peut rester partiellement complétée et être reprise ;
3. l'identité et la version de chaque action doivent être conservées ;
4. plusieurs observations typées doivent être recherchées ou comparées ;
5. un bilan collectif doit être calculé depuis ces réponses ;
6. une modification du modèle ne doit jamais altérer la checklist historique.

Même alors, l'extension doit rester rattachée aux items et occurrences du
planning, sans moteur de calendrier parallèle et sans donnée par chiot.

### 8.4 Critères de passage à l'option C

Un module spécialisé ne doit être étudié que si l'option B devient insuffisante
à cause d'un véritable cycle de vie de session, de corrections complexes, de
pièces jointes ou validations multiples, de droits dédiés ou d'analyses
transverses importantes. Le seul souhait d'afficher des cases ne suffit pas.

## 9. Découpage futur proposé

### Lot futur 1 — prototype fonctionnel sans schéma

Objectif : valider l'ergonomie avec un modèle d'organisation collectif créé par
l'éditeur existant.

- définir quelques séances/thèmes et une cadence finie ;
- utiliser uniquement `socialization` + `litter`/`all_offspring` ;
- vérifier l'usage dans le Journal, Aujourd'hui, la frise et le calendrier ;
- recueillir les limites réelles de `description` et `resolution_note` ;
- aucune migration, aucun nouveau composant spécialisé requis.

### Lot futur 2 — catalogue collectif V1

Seulement après validation du contenu : publier un modèle global versionné et
facultatif, importable explicitement.

- migration de données de catalogue uniquement ;
- aucune structure SQL nouvelle ;
- assertions pures du modèle et test d'import/application/cleanup ;
- aucun protocole médical, aucun suivi individuel, aucune auto-réalisation.

Ce lot est le plus petit lot produit donnant une valeur réutilisable à toutes
les organisations.

### Lot futur 3 — amélioration de texte et de résolution, si nécessaire

Évaluer de petites améliorations UI sans structuration : aide de description,
modèle de note collective, accès au dialogue complet depuis Aujourd'hui et
présentation claire des thèmes. Aucune migration n'est attendue si les données
restent du texte libre.

### Lot futur 4 — audit de checklist structurée

Uniquement si les critères de l'option B sont confirmés : définir les actions,
snapshots, réponses, révisions, commandes, RLS, export et stratégie de migration.
Ce lot reste documentaire et doit choisir explicitement JSONB fermé ou tables
relationnelles avant toute implémentation.

### Lot futur 5 — fondation légère de checklist

Après validation de l'audit précédent seulement : plus petit stockage attaché
aux items et occurrences, commandes idempotentes, lecture/écriture collective,
tests d'isolation et cleanup physique. Aucun bilan avancé ni module autonome.

### Lot futur 6 — bilan collectif ou module spécialisé

À envisager seulement si l'usage démontre une valeur pour des observations
structurées, recherches, bilans ou workflows dépassant l'occurrence commune.

## 10. Exclusions et décisions restant à prendre

### 10.1 Exclusions actées

- aucun suivi individuel de socialisation par chiot ;
- aucune cible « certains chiots » ;
- aucune note, checklist ou occurrence spécialisée par animal ;
- aucun diagnostic, seuil, score automatique ou recommandation clinique ;
- aucune duplication des vaccinations, identifications, mesures, documents ou
  observations propres à l'animal dans la socialisation collective ;
- aucune auto-réalisation d'une séance depuis un autre fait ;
- aucun RRULE, cron, scheduler, notification ou synchronisation externe ;
- aucun nouveau module ou schéma dans le présent lot.

### 10.2 Décisions fonctionnelles à prendre avant un modèle global

1. `litter` ou `all_offspring` comme cible conventionnelle de chaque type de
   séance ; les deux restent collectives.
2. Thèmes exacts et niveau de granularité : une série générale ou plusieurs
   séries thématiques.
3. Âge de début, cadence, créneaux, borne de fin et plafond d'occurrences.
4. Éléments obligatoires ou seulement sélectionnés par défaut à l'import.
5. Contenu indicatif des descriptions et vocabulaire non prescriptif.
6. Suffisance d'une note libre par séance après un essai réel.
7. Sort du template existant `dog-open-socialization-checklist` : le conserver
   comme simple repère, le renommer dans une future version, ou le remplacer
   fonctionnellement par le modèle composé sans réécrire la version 1.

## 11. Conclusion

Le moteur actuel couvre déjà la programmation collective, la récurrence finie,
les créneaux, les dates suggérées et retenues, le verrouillage, le report, la
résolution auditée, l'activation sur naissance réelle et les quatre projections
d'usage. Il offre aussi la catégorie `socialization` et deux cibles
strictement collectives. Il manque en revanche toute structure de checklist ou
d'observation par séance ; le mot « checklist » présent dans un titre de
catalogue ne change pas ce constat.

La recommandation nette est donc : **commencer par un modèle collectif utilisant
le planning existant, sans nouveau schéma ; mesurer ensuite si les cases et
observations structurées créent une valeur réelle ; n'introduire qu'alors une
extension légère attachée aux occurrences.** Un module spécialisé n'est pas
justifié par le besoin actuellement démontré.

Ce lot n'a créé aucune donnée temporaire, aucun identifiant de fixture et
n'appelle donc aucun nettoyage de base. Il n'a modifié ni application, ni
migration, ni stack, ni serveur, ni démonstration durable.
