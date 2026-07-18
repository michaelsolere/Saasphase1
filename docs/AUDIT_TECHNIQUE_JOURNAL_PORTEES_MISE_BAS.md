# Audit technique — Journal des portées et Journal de mise-bas

Date : 2026-07-18  
Référence auditée : `main` à `4102d9ddb8c833ce9bcb9483b9345fbe12be002d`  
Périmètre : audit uniquement ; aucune base, migration, RLS, RPC, seed, test ou type généré n’a été modifié.

## Limite documentaire

Les deux fichiers demandés comme sources prioritaires, `00_CONTEXTE_METHODE_SUPERVISION_SAAS_ELEVAGE(1).md` et `Cadrage_fonctionnel_journal_portees_et_mise_bas_2026-07-16(1).md`, ne sont pas présents dans ce checkout (recherche par nom et par mots-clés). Cet audit applique donc les exigences explicites de la demande et les conventions existantes, notamment `AGENTS.md`, `README.md`, `docs/PROJECT_LOG.md` et `docs/ETAT_DES_LIEUX_ARCHITECTURE_WORKFLOW_SAAS_ELEVAGE_2026-07.md`. Les choix à confirmer contre le cadrage absent sont signalés comme tels ; ils ne doivent pas être interprétés comme une modification de ce cadrage.

## Sources inspectées

- schéma et RLS : `supabase/migrations/202606220001_core_schema.sql`, `202606220002_business_schema.sql`, `202606220003_workflow_indexes_views_rls.sql`, migrations animal/média et documentaires ultérieures ;
- types : `src/types/database.types.ts` ;
- interfaces et actions : `src/app/litters/**`, `src/features/litters/**`, `src/app/animals/**`, `src/features/animals/**`, navigation ;
- tests et fixtures : `tests/e2e/litter-offspring-creation.spec.ts`, `litter-event-create.spec.ts`, `litter-parent-eligibility.spec.ts`, `animal-attribution-coherence.spec.ts` ;
- seed : `supabase/seed.sql` (lecture seule).

## État existant réutilisable

| Élément | État utile | Réemploi recommandé |
| --- | --- | --- |
| `organizations`, `memberships` | Multi-organisation avec rôles `owner`, `admin`, `member`, `viewer`; fonctions RLS `is_member_of` et `has_organization_role`. | Toute nouvelle table porte `organization_id`, une FK composite `(organization_id, id)` et les mêmes politiques de base. |
| `animals` | Référentiel unique des reproducteurs et animaux produits : sexe, espèce, race, parents, `litter_id`, ordre/heure/poids de naissance, collier, statut et propriété. | Un nouveau-né reste impérativement un `animals`; aucune table `puppies`/`kittens`. |
| `litters` / `litter_groups` | Parents, taxonomie, dates de saillie/ovulation/naissance, confirmation de gestation, compteurs, statut, groupe et `litter_overview`. | `litters` reste l’agrégat du projet de portée et le point d’entrée des journaux. Les groupes restent hors du journal clinique. |
| `events` | Événements/tâches génériques rattachables à portée ou animal, avec date prévue/réelle, état et priorité. | Conserver pour les rappels libres et l’agenda transverse; ne pas l’utiliser comme registre clinique ou source des naissances. |
| `notes`, `documents`, `media` | Liens multi-objets, FK composites et RLS déjà établis; média animal primaire dans un bucket privé. | Réutiliser pour commentaires libres, comptes rendus, ordonnances et photos, avec rattachement à la portée ou à l’animal. Ils ne portent pas les mesures structurées. |
| Fiches existantes | La fiche Portée lit animaux, réservations, notes, événements et documents. La fiche Animal de la mère lit santé, événements, documents, notes et sa portée. | Ajouter des liens/synthèses seulement; créer des routes et composants dédiés au journal. |
| Création actuelle de chiots | `createLitterOffspring` crée en lot des `animals` produits, hérite parents/taxonomie/date et demande une confirmation. | Conserver pour la création rétrospective ou administrative. Ne pas l’appeler depuis le journal de mise-bas. |
| Tests et discipline fixtures | Les E2E existants créent puis hard-delete des fixtures connues. | Les futurs tests doivent conserver cette discipline, mais aucun E2E n’est requis pour cet audit. |

Les FK composites existantes empêchent déjà le rattachement normal d’un animal, d’une portée, d’une note, d’un document, d’un média ou d’un événement à une autre organisation. Les vues `security_invoker` et les pages relisent des objets non supprimés. C’est un bon socle, mais cela ne remplace pas les invariants métier du journal.

## Écarts constatés avec le besoin de journal

1. Aucun cycle reproductif ni mesure de progestérone n’existe. `litters.estimated_ovulation_date` est une date isolée, sans mesure, unité, laboratoire, horodatage ni traçabilité.
2. La saillie est limitée à `mating_date` et `mating_date_2`. Il n’existe ni liste ordonnée de saillies, ni rattachement transactionnel d’un cycle à une portée à la première saillie.
3. Les suivis de la mère, rappels prévus et réalisations utilisent au mieux `events`/`notes`, sans type métier, unicité, suivi d’exécution ou historique clinique fiable.
4. Il n’existe ni session de mise-bas ni événement horodaté de mise-bas. `actual_birth_date` est une date, insuffisante pour l’ordre et l’heure de chaque naissance.
5. La création actuelle de chiots n’est ni atomique avec un événement de naissance, ni idempotente. Elle fait un contrôle applicatif de `birth_order`, puis un insert. La base ne possède ni index unique actif `(organization_id, litter_id, birth_order)`, ni clé de commande. Deux requêtes simultanées peuvent donc passer le contrôle et créer des doublons.
6. Le poids de naissance est une colonne d’`animals`, sans historique de pesées. Modifier cette colonne écraserait l’information d’origine.
7. Les compteurs de `litters` sont saisis/modifiables indépendamment des animaux. Ils peuvent diverger des naissances et des animaux produits.
8. Les pages `/litters/[id]` et `/animals/[id]` sont déjà denses. Ajouter les écrans de journal dans `src/app/litters/[id]/page.tsx` rendrait la fiche opérationnelle illisible et mêlerait des flux aux exigences de sûreté très différentes.
9. RLS accorde aujourd’hui la lecture à tout membre actif et l’écriture à `owner`/`admin`/`member` pour les tables génériques. Aucun périmètre n’existe pour les corrections immuables ou les commandes idempotentes du journal.

## Sources de vérité recommandées

| Sujet | Source de vérité cible | Projection/compatibilité |
| --- | --- | --- |
| Cycle et dates de chaleurs | `reproductive_cycles` et ses observations/saillies. | Aucun champ `animals` ne doit devenir une seconde vérité. |
| Progestérone | Une ligne de `progesterone_measurements` par prélèvement/résultat, unité explicite. | `litters.estimated_ovulation_date` peut rester une estimation affichée, dérivée/confirmée explicitement, jamais une mesure. |
| Saillies | `reproductive_cycle_matings`, ordonnées par `sequence_no` et horodatées. | `litters.mating_date` et `mating_date_2` sont des projections legacy des deux premières saillies. |
| Portée liée | `reproductive_cycles.litter_id`, rempli une seule fois dans l’opération de première saillie. | Les champs parents/taxonomie de `litters` restent la copie métier de la portée, contrôlée à la liaison. |
| Suivi de la mère | `maternal_observations` typées et datées. | `notes` complète le texte libre; elle ne remplace pas une observation structurée. |
| Tâches prévues/réalisées | `litter_care_tasks`, avec une seule ligne par jalon métier et ses dates prévue/réalisée. | `events` reste facultatif comme projection agenda ou tâche libre. |
| Mise-bas | `whelping_sessions`, `whelping_events` et, pour une naissance, `whelping_births`. | `litters.actual_birth_date` et compteurs sont des caches maintenus par RPC/trigger, pas une entrée concurrente. |
| Nouveau-né | `animals`, créé uniquement par l’opération de naissance lorsqu’il est saisi au journal. | Les colonnes actuelles de naissance restent des projections cohérentes de `whelping_births`. |
| Poids | `animal_weight_measurements`, y compris la première mesure de naissance. | `animals.birth_weight_grams` reste le snapshot de compatibilité; il ne doit plus être modifié directement pour une pesée ultérieure. |

Une colonne de synthèse est acceptable seulement si une unique routine serveur la maintient. Aucun de ces domaines ne doit être enfoui dans un objet `jsonb` générique : les JSON existants restent réservés aux snapshots documentaires ou aux données de formulaire, pas au journal reproductif.

## Modèle relationnel cible

Les noms ci-dessous sont proposés pour une migration future. Tous les horodatages métier sont `timestamptz`; toutes les tables ajoutent `id`, `organization_id`, `created_at`, `created_by`, `updated_at`, `updated_by` et, lorsque la suppression est admise, une trace de retrait explicite. Les FK métier croisent toujours `organization_id`.

### Cycles, progestérone et première saillie

```text
animals (mère)
  1 ── N reproductive_cycles 1 ── N progesterone_measurements
                              └── N reproductive_cycle_matings
                                      première saillie effective
                                              └── 1 litter
```

- `reproductive_cycles` : `mother_id`, `species`, `breed`, `status` (`planned`, `in_progress`, `mated`, `closed`, `cancelled`), `started_on`, `ended_on`, `litter_id nullable unique`, `notes`. La mère doit être une femelle active de la même espèce; une portée ne peut appartenir qu’à un cycle et un cycle à une seule portée.
- `progesterone_measurements` : `cycle_id`, `measured_at`, `resulted_at nullable`, `value numeric(8,3)`, `unit` contrôlée (`ng_ml`, `nmol_l`), `laboratory_name`, `sample_reference`, `method`, `note`. Ne pas normaliser silencieusement une unité : une éventuelle conversion est calculée dans la lecture et reste identifiable.
- `reproductive_cycle_matings` : `cycle_id`, `father_id`, `sequence_no positive`, `occurred_at`, `method` contrôlée, `location`, `note`. La première saillie effective est celle de `sequence_no = 1`, pas la première ligne triée après coup.

La commande serveur `record_first_mating` doit verrouiller le cycle, revalider la mère/le père/l’organisation/l’éligibilité, créer ou relire la portée liée, insérer la saillie n° 1 et remplir `reproductive_cycles.litter_id` dans **une même transaction**. La portée reçoit les parents, espèce/race et les projections de dates. Toute requête ultérieure pour ce cycle renvoie la portée déjà liée au lieu d’en créer une autre.

### Suivi de la mère et tâches

- `maternal_observations` : `litter_id`, `mother_id`, `observed_at`, `observation_type` contrôlé (`temperature`, `appetite`, `behavior`, `discharge`, `contractions`, `health`, `other`), `numeric_value nullable`, `unit nullable`, `severity`, `note`. Une observation structurée ne doit pas porter plusieurs mesures non typées dans un JSON.
- `litter_care_tasks` : `litter_id`, `task_code` contrôlé, `title`, `planned_for`, `status` (`planned`, `done`, `cancelled`, `not_applicable`), `completed_at nullable`, `completed_by nullable`, `completion_note`, `source` (`manual`, `cycle_template`, `birth_template`). Un index unique actif `(organization_id, litter_id, task_code)` évite le double jalon généré. Pour les tâches répétables, ajouter `occurrence_no` à cette clé plutôt qu’un tableau JSON.

Les tâches sont l’enregistrement opérationnel; une tâche marquée faite doit conserver son horodatage et son auteur. L’événement `events` éventuellement créé pour l’agenda est une projection réversible, jamais la preuve d’exécution.

### Sessions, événements et naissances de mise-bas

```text
litters 1 ── N whelping_sessions 1 ── N whelping_events
                                     └── N whelping_births 1 ── 1 animals
                                                                    └── N animal_weight_measurements
```

- `whelping_sessions` : `litter_id`, `mother_id`, `started_at`, `ended_at nullable`, `status` (`open`, `closed`, `cancelled`), `timezone_name`, `note`. Une seule session ouverte par portée via index partiel.
- `whelping_events` : `session_id`, `sequence_no`, `occurred_at`, `event_type` contrôlé (`labor_started`, `water_broke`, `birth`, `placenta`, `intervention`, `observation`, `session_closed`), `note`, `recorded_at`. Son rôle est le journal chronologique, y compris les événements qui ne créent pas d’animal.
- `whelping_births` : `session_id`, `event_id` unique, `sequence_no` unique dans la session, `occurred_at`, `sex`, `viability` (`alive`, `stillborn`, `unknown`), `initial_collar_color`, `birth_weight_grams nullable`, `animal_id` unique, `client_command_id` unique par organisation, `recorded_at`. Une naissance crée donc un événement et exactement un animal, y compris un mort-né si l’élevage le consigne.
- `animal_weight_measurements` : `animal_id`, `measured_at`, `grams positive`, `measurement_kind` (`birth`, `routine`, `clinical`), `source_birth_id nullable unique`, `note`, `client_command_id nullable unique`. La mesure `birth` est créée dans la même transaction que `whelping_births`.

Le journal est append-only après validation : une erreur clinique est corrigée par une opération de correction auditée (valeur corrigée, motif, auteur et date), pas par l’effacement silencieux de l’historique. Les notes et médias peuvent compléter la session ou l’animal via leurs liens existants; si le rattachement direct à une session devient nécessaire, ajouter une table de liaison étroite, pas des colonnes polymorphes supplémentaires sans contrainte.

## Création atomique et idempotente d’une naissance

La saisie d’une naissance doit passer par une RPC ou un service serveur transactionnel unique, par exemple `record_whelping_birth(session_id, client_command_id, …)`, jamais par une succession de `insert` depuis le navigateur.

1. Authentifier l’utilisateur, relire la session, la portée, la mère et l’organisation; exiger un rôle d’écriture.
2. Prendre un verrou transactionnel par session (ou `SELECT … FOR UPDATE` sur la session) avant d’allouer `sequence_no`. Vérifier que la session est ouverte.
3. Chercher `client_command_id`. S’il existe, retourner exactement le `animal_id` et le `whelping_births.id` précédemment créés, sans nouvelle écriture.
4. Insérer l’événement `birth`, la ligne `whelping_births`, l’`animals` produit et sa mesure de poids de naissance; l’animal hérite de la portée, des parents, de l’espèce/race, du sexe, du collier, de la date/heure et du statut `born` ou `stillborn`.
5. Mettre à jour, dans la même transaction, les cache/projections de `litters` (`actual_birth_date` si absente et compteurs recalculés depuis les naissances non annulées). Ne jamais accepter les compteurs venant du client.
6. Renvoyer l’objet créé; tout échec annule toutes les écritures.

La clé de commande doit être générée côté client avant l’envoi et conservée dans l’état du formulaire pendant un retry. Cela protège un double clic, un délai réseau et une réponse perdue sans introduire de mode offline-first. Elle n’est pas une autorité sur la portée, la mère, les parents ou l’organisation : ces valeurs sont relues côté serveur.

## Invariants SQL, RLS et permissions

### Invariants SQL à imposer

- FK composites de même organisation sur toutes les relations; `species` de la mère, du cycle, de la portée et des animaux créés cohérente, contrôlée par trigger transactionnel lorsque la règle traverse plusieurs lignes.
- `reproductive_cycles.litter_id` unique non nul et la portée liée doit avoir la même mère; une liaison de cycle est immuable après la première saillie, sauf procédure de correction explicitement auditée.
- `unique (organization_id, cycle_id, sequence_no)` pour les saillies et `unique (organization_id, session_id, sequence_no)` pour les événements/naissances de mise-bas.
- index unique partiel d’une session `open` par portée; `ended_at >= started_at`; `occurred_at` dans une fenêtre cohérente avec la session, ou justification de correction.
- `whelping_births.event_id`, `whelping_births.animal_id`, `source_birth_id` et la commande idempotente uniques; poids strictement positif lorsqu’il est renseigné; `birth` interdit comme type de mesure sans `source_birth_id`.
- index unique actif `(organization_id, litter_id, birth_order)` sur `animals` pour les naissances enregistrées, ou, de préférence, remplissage de `animals.birth_order` exclusivement par la routine et unicité totale des animaux non supprimés. La migration doit d’abord auditer les doublons historiques avant de créer cet index.
- `litters` ne reçoit plus directement ses compteurs, `actual_birth_date`, ni les projections de saillie depuis les formulaires du journal; une fonction les recalcule. Les règles de statut de portée sont également centralisées dans ce service.
- `updated_at` est automatique; les entrées de journal finalisées conservent `created_by` et ne sont pas hard-delete par une action normale.

### RLS et rôles

- `viewer` : lecture des journaux appartenant à son organisation, sans formulaire de mutation ni RPC d’écriture.
- `member`, `admin`, `owner` : création de cycles, mesures, observations, tâches et saisies de mise-bas dans leur organisation uniquement; les actions sensibles sont tout de même validées côté serveur.
- `admin`, `owner` : corrections/annulations auditables d’une naissance, clôture/réouverture exceptionnelle de session et gestion des tâches modèles, selon le cadrage à confirmer.
- Aucune policy `DELETE` générale pour les lignes cliniques/journalisées. Les suppressions de brouillons seulement doivent être des états explicitement limités et auditables.
- Les nouvelles tables reprennent `SELECT` pour `is_member_of(organization_id)` et `INSERT`/`UPDATE` pour les rôles d’écriture. La RPC `SECURITY DEFINER` vérifie elle-même `auth.uid()`, `has_organization_role`, la portée active et fixe `search_path`; elle ne prend jamais `organization_id` du client.
- Storage et `media` restent privés. Les chemins éventuels sont construits par le serveur avec organisation puis session/animal, et une compensation ne supprime que l’objet orphelin prouvé.

## Concurrence, double clic et perte de données

| Risque | État actuel | Garde-fou cible |
| --- | --- | --- |
| Double clic/crash après envoi d’une naissance | Aucun identifiant d’opération; l’insert peut être répété. | `client_command_id` unique + retour du résultat initial au retry. |
| Deux appareils ajoutent la même naissance | Contrôle « lire puis écrire » vulnérable. | Verrou transactionnel de session, `sequence_no` unique et création atomique. |
| Deux animaux avec le même ordre de naissance | Pas de contrainte SQL actuelle. | Unicité SQL active et séquence attribuée dans la routine. |
| Mise à jour partielle | Les futures écritures multi-tables seraient dissociées avec les actions actuelles. | RPC transactionnelle : événement, naissance, animal, poids et agrégats réussissent ou échouent ensemble. |
| Réponse réseau perdue | L’utilisateur ne sait pas si la naissance existe. | Rejeu avec la même clé de commande; l’interface affiche le résultat relu. |
| Écrasement d’une mesure/observation | Les champs uniques de `animals` n’historisent pas. | Lignes append-only; corrections explicites et verrou optimiste sur les rares brouillons éditables. |
| Une portée/parents changent pendant la saisie | Les formulaires actuels relisent, mais ne verrouillent pas l’agrégat. | Relecture et verrou de la session/portée; parents de la portée utilisés, non les champs soumis. |
| Session fermée pendant une saisie | Aucun modèle actuel. | Vérification atomique du statut `open`; rejet typé, sans création partielle. |

## Heure du téléphone et heure serveur

Les deux valeurs ont des sens différents et doivent être séparées.

- L’heure métier observée (`occurred_at`, `measured_at`) est saisie par l’éleveur comme date/heure locale avec fuseau IANA de l’organisation/session, convertie en `timestamptz`. Conserver aussi `timezone_name` sur la session afin de restituer sans ambiguïté les heures historiques autour des changements d’heure.
- L’heure technique (`recorded_at`, `created_at`, `updated_at`) vient exclusivement du serveur (`now()`). Elle établit l’ordre d’enregistrement/audit, sans prétendre être l’heure de la naissance.
- Le client peut joindre son décalage et son horloge affichée seulement à titre diagnostique, dans des colonnes dédiées si le cadrage le justifie; ils ne remplacent pas l’heure métier ni l’horloge serveur.
- L’UI doit préremplir l’heure locale, afficher le fuseau, accepter une correction manuelle et avertir si l’heure observée est très éloignée de l’heure serveur. Une heure future doit être refusée ou demander une confirmation justifiée.
- Les entrées `date` existantes de `litters` restent des dates civiles. Elles ne doivent pas être converties en minuit UTC ni servir à retrouver l’ordre des naissances.

## Colonnes existantes : conservation, réemploi et dépréciation

| Table/colonnes | Décision |
| --- | --- |
| `animals.litter_id`, `mother_id`, `father_id`, `species`, `breed`, `sex`, `status`, `ownership_status`, `collar_color_initial/current` | Conserver. Elles sont l’identité et la filiation de l’animal créé à la naissance. |
| `animals.birth_date`, `birth_time`, `birth_order`, `birth_weight_grams` | Conserver comme projection compatible de la naissance; les écrire seulement dans la routine de naissance. Déprécier leur édition indépendante pour les animaux issus du journal. |
| `litters.mother_id`, `father_id`, `species`, `breed`, `status`, `name`, `litter_group_id`, `available_from` | Conserver. Le cycle crée/lit la portée mais ne remplace pas son rôle dans le parcours adoptant. |
| `litters.mating_date`, `mating_date_2` | Conserver et alimenter comme projections des deux premières lignes de saillie; déprécier comme source de saisie après migration du journal. |
| `litters.estimated_ovulation_date` | Conserver comme estimation affichée ou décision clinique validée; ne pas en faire la source des dosages. |
| `litters.expected_birth_date`, `pregnancy_confirmed_at`, `pregnancy_confirmation_method` | Conserver. Les alimenter via cycle/tâches avec une provenance explicite dans le service. |
| `litters.actual_birth_date`, `born_total_count`, `born_male_count`, `born_female_count`, `alive_count` | Conserver en cache compatibilité; les recalculer depuis les naissances du journal. Déprécier l’édition libre. |
| `litters.notes` | Conserver pour l’historique général, mais déprécier pour les observations structurées répétées. |
| `events` | Conserver pour agenda et tâches ad hoc; ne pas étendre ses types comme substitut aux sessions, naissances, pesées ou tâches de protocole. |
| `notes`, `documents`, `media` | Conserver comme compléments libres/artefacts. Ajouter des liens étroits seulement si une session doit être la cible directe. |

## Architecture d’interface et navigation

Le Journal des portées est un module dédié. Proposition :

```text
/litters/[id]                         fiche opérationnelle existante, avec lien/synthèse
/litters/[id]/journal                 tableau de bord du journal de la portée
/litters/[id]/journal/mise-bas        session et timeline de mise-bas
/animals/[id]/reproduction            cycles et progestérones de la mère
src/features/reproduction/**          cycles, mesures, suivi mère
src/features/whelping/**              session, timeline, commande de naissance, poids
```

La fiche Portée n’affiche qu’un résumé sûr (prochain jalon, statut de session, compte et dernier événement) et un lien. La fiche Animal de la mère renvoie vers son historique de reproduction. Les composants de journal ne sont pas importés dans `src/app/litters/[id]/page.tsx` hors de cette carte de synthèse.

## Découpage recommandé en petits lots

1. **Fondation cycles et progestérones** : tables, contraintes/RLS, types générés, service serveur, route dédiée de la mère, actions de création et lecture. Sans modifier la portée existante ni créer de mise-bas.
2. **Saillies et liaison cycle–portée** : `reproductive_cycle_matings`, RPC idempotente de première saillie, création/relecture atomique de portée et projections legacy. Tests de concurrence et de permissions ciblés.
3. **Suivi mère et jalons** : `maternal_observations` et `litter_care_tasks`, génération idempotente des jalons, vues dédiées et synthèse non éditable sur la fiche Portée.
4. **Fondation mise-bas** : `whelping_sessions` et `whelping_events`, route dédiée, ouverture/clôture de session, timeline append-only et gestion des fuseaux. Aucun animal créé à ce stade.
5. **Naissance atomique et pesées** : `whelping_births`, `animal_weight_measurements`, RPC de naissance, projections `animals`/`litters`, reprise idempotente, corrections auditables et tests de double clic/concurrence.
6. **Médias, documents et durcissement** : rattachements de session si réellement nécessaires, politique Storage, audit des données legacy, migration des projections et tests de non-régression du parcours réservations/documents.

Chaque lot doit inclure ses migrations nouvelles (jamais la réécriture d’une migration appliquée), régénération des types, tests ciblés sans toucher `saasphase1` hors autorisation, et cleanup physique de toute fixture de test avant le commit.

## Périmètre exact du premier lot d’implémentation

Le premier lot doit être volontairement limité à **Cycles reproductifs et progestérones** :

- ajouter uniquement `reproductive_cycles` et `progesterone_measurements`, leurs index, contraintes, triggers `updated_at`, RLS et permissions; aucune table de mise-bas, aucun RPC de naissance, aucune modification de `animals`, `litters`, `events`, `notes`, `documents` ou `media`;
- régénérer `src/types/database.types.ts` après la migration;
- créer un service serveur dédié et des Server Actions qui déduisent l’organisation de la mère relue, valident sexe/espèce/adhésion, et créent/listent cycles et mesures;
- créer `/animals/[id]/reproduction` et les composants `src/features/reproduction/**`; la fiche Animal reçoit seulement un lien vers ce module;
- couvrir uniquement les validations de valeur/unité/date, cloisonnement organisationnel, lecture `viewer`, écriture `owner/admin/member` et absence d’écriture croisée;
- ne pas créer de portée, ne pas renseigner `mating_date`, ne pas générer de tâche, ne pas créer de session de mise-bas, ne pas créer d’animal ni de donnée de démonstration.

Ce lot offre une valeur quotidienne sans engager prématurément les règles les plus risquées (première saillie, agrégats de portée, naissance atomique). La liaison cycle–portée devient le lot 2, après validation explicite du cadrage fonctionnel absent de ce checkout.

## Conclusion

Le socle existant est compatible avec un journal dédié, multi-organisation et compatible chiens/chats. La continuité doit être assurée en gardant `animals` comme identité unique des nouveau-nés et `litters` comme agrégat du parcours. En revanche, les colonnes de portée, `events` et le formulaire actuel de création de chiots ne suffisent pas comme source de vérité clinique ou transactionnelle. La cible doit introduire des tables relationnelles étroites, des contraintes d’unicité et une commande serveur atomique/idempotente avant toute saisie de mise-bas.
