import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f190007-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E litter routine weighing UI";

const ids = {
  mother: `${prefix}01`,
  father: `${prefix}02`,
  firstAnimal: `${prefix}11`,
  secondAnimal: `${prefix}12`,
  thirdAnimal: `${prefix}13`,
  noSessionAnimal: `${prefix}14`,
  inconsistentAnimal: `${prefix}15`,
  mainLitter: `${prefix}21`,
  noSessionLitter: `${prefix}22`,
  inconsistentLitter: `${prefix}23`,
  relationLitter: `${prefix}24`,
  whelpingSession: `${prefix}31`,
  firstBirthEvent: `${prefix}41`,
  secondBirthEvent: `${prefix}42`,
  thirdBirthEvent: `${prefix}43`,
  closeEvent: `${prefix}44`,
  firstBirth: `${prefix}51`,
  secondBirth: `${prefix}52`,
  thirdBirth: `${prefix}53`,
  firstBirthWeight: `${prefix}61`,
  secondBirthWeight: `${prefix}62`,
  thirdBirthWeight: `${prefix}63`,
  existingRoutineSession: `${prefix}71`,
  existingRoutineFirst: `${prefix}72`,
  existingRoutineSecond: `${prefix}73`,
  existingRoutineThird: `${prefix}74`,
  inconsistentRoutineWeight: `${prefix}75`,
  relationRoutineSession: `${prefix}76`,
  emptyRoutineSession: `${prefix}77`,
} as const;

const litterIds = [
  ids.mainLitter,
  ids.noSessionLitter,
  ids.inconsistentLitter,
  ids.relationLitter,
] as const;
const animalIds = [
  ids.firstAnimal,
  ids.secondAnimal,
  ids.thirdAnimal,
  ids.noSessionAnimal,
  ids.inconsistentAnimal,
] as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function uuidList(values: readonly string[]) {
  return values.map((value) => `${q(value)}::uuid`).join(", ");
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.litter_weight_commands
    where client_command_id::text like '9f190007-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.animal_weight_measurements
    where id::text like '9f190007-%'
       or animal_id in (${uuidList(animalIds)})
       or litter_weighing_session_id in (
         select id from public.litter_weighing_sessions
         where id::text like '9f190007-%' or litter_id in (${uuidList(litterIds)})
       );

    delete from public.litter_weighing_sessions
    where id::text like '9f190007-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_commands
    where client_command_id::text like '9f190007-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_births
    where id::text like '9f190007-%'
       or session_id = ${q(ids.whelpingSession)}::uuid;

    delete from public.whelping_events
    where id::text like '9f190007-%'
       or session_id = ${q(ids.whelpingSession)}::uuid;

    delete from public.animals
    where id in (${uuidList(animalIds)})
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_sessions
    where id::text like '9f190007-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id in (${uuidList(litterIds)})
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid)
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.memberships where id::text like '9f190007-%';
    delete from auth.identities where user_id::text like '9f190007-%';
    delete from auth.users where id::text like '9f190007-%';
    delete from public.profiles where id::text like '9f190007-%';
    delete from public.organizations where id::text like '9f190007-%';

    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litter_weight_commands', (select count(*) from public.litter_weight_commands
          where client_command_id::text like '9f190007-%'
             or litter_id in (${uuidList(litterIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f190007-%'
             or animal_id in (${uuidList(animalIds)})
             or litter_weighing_session_id in (select id from public.litter_weighing_sessions
               where id::text like '9f190007-%' or litter_id in (${uuidList(litterIds)}))),
        'litter_weighing_sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like '9f190007-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_commands', (select count(*) from public.whelping_commands
          where client_command_id::text like '9f190007-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_births', (select count(*) from public.whelping_births
          where id::text like '9f190007-%' or session_id = ${q(ids.whelpingSession)}::uuid),
        'whelping_events', (select count(*) from public.whelping_events
          where id::text like '9f190007-%' or session_id = ${q(ids.whelpingSession)}::uuid),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like '9f190007-%' or litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id::text like '9f190007-%'
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${fixtureNamePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like '9f190007-%' or name like ${q(`${fixtureNamePrefix}%`)}),
        'memberships', (select count(*) from public.memberships
          where id::text like '9f190007-%'
             or (id = ${q(ownerMembershipId)}::uuid and role <> 'owner')),
        'profiles', (select count(*) from public.profiles where id::text like '9f190007-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190007-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f190007-%'),
        'organizations', (select count(*) from public.organizations where id::text like '9f190007-%')
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const counts = remainingCounts();
  for (const [table, count] of Object.entries(counts)) {
    expect(count, `${table} fixtures must be hard-deleted or restored`).toBe(0);
  }
  return counts;
}

function createFixtures() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, is_breeder, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} mère`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} père`)}, 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      actual_birth_date, born_total_count, born_male_count, born_female_count,
      alive_count, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'born', '2026-07-18',
       3, 2, 1, 3, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noSessionLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} sans mise-bas`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'puppies_created', '2026-07-18',
       1, 1, 0, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} incohérente`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'puppies_created', '2026-07-18',
       1, 0, 1, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.relationLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} support relationnel`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'puppies_created', '2026-07-18',
       1, 0, 1, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values (
      ${q(ids.whelpingSession)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
      '2026-07-18T07:00:00Z', '2026-07-18T09:00:00Z', 'Europe/Paris',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at,
      event_type, note, author_id
    ) values
      (${q(ids.firstBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, 1, '2026-07-18T08:00:00Z', 'birth',
       'Naissance Naya.', ${q(ownerId)}::uuid),
      (${q(ids.secondBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, 2, '2026-07-18T08:10:00Z', 'birth',
       'Naissance Orion.', ${q(ownerId)}::uuid),
      (${q(ids.thirdBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, 3, '2026-07-18T08:20:00Z', 'birth',
       'Naissance trois.', ${q(ownerId)}::uuid),
      (${q(ids.closeEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, 4, '2026-07-18T09:00:00Z', 'session_closed',
       'Clôture fixture.', ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, father_id, call_name,
      official_name, species, breed, sex, status, ownership_status, birth_date,
      birth_time, birth_order, birth_weight_grams, collar_color_initial,
      collar_color_current, created_by, updated_by
    ) values
      (${q(ids.firstAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'Naya', 'Naya du Test', 'dog', 'Golden Retriever', 'female', 'born',
       'produced', '2026-07-18', '10:00:00', 1, 360, 'Rose', 'Fuchsia',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       null, 'Orion officiel', 'dog', 'Golden Retriever', 'male', 'born',
       'produced', '2026-07-18', '10:10:00', 2, 370, 'Bleu', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.thirdAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       null, null, 'dog', 'Golden Retriever', 'male', 'born',
       'produced', '2026-07-18', '10:20:00', 3, 380, 'Vert', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noSessionAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.noSessionLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'Solo administratif', null, 'dog', 'Golden Retriever', 'male', 'born',
       'produced', '2026-07-18', '11:00:00', 1, 390, 'Orange', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inconsistentLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'Incohérent', null, 'dog', 'Golden Retriever', 'female', 'born',
       'produced', '2026-07-18', '11:10:00', 1, 395, 'Jaune', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, initial_collar_color, created_by
    ) values
      (${q(ids.firstBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, ${q(ids.firstBirthEvent)}::uuid,
       ${q(ids.firstAnimal)}::uuid, 1, 'female', 'alive', 'Rose', ${q(ownerId)}::uuid),
      (${q(ids.secondBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, ${q(ids.secondBirthEvent)}::uuid,
       ${q(ids.secondAnimal)}::uuid, 2, 'male', 'alive', 'Bleu', ${q(ownerId)}::uuid),
      (${q(ids.thirdBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, ${q(ids.thirdBirthEvent)}::uuid,
       ${q(ids.thirdAnimal)}::uuid, 3, 'male', 'alive', 'Vert', ${q(ownerId)}::uuid);

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      source_birth_id, note, created_by
    ) values
      (${q(ids.firstBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstAnimal)}::uuid, '2026-07-18T08:02:00Z', 360, 'birth',
       ${q(ids.firstBirth)}::uuid, 'Poids de naissance Naya.', ${q(ownerId)}::uuid),
      (${q(ids.secondBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.secondAnimal)}::uuid, '2026-07-18T08:12:00Z', 370, 'birth',
       ${q(ids.secondBirth)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.thirdBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.thirdAnimal)}::uuid, '2026-07-18T08:22:00Z', 380, 'birth',
       ${q(ids.thirdBirth)}::uuid, null, ${q(ownerId)}::uuid);

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, note,
      created_by
    ) values
    (
      ${q(ids.existingRoutineSession)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.mainLitter)}::uuid, '2026-07-19T10:00:00Z', 'Europe/Paris',
      'Séance de routine existante.', ${q(ownerId)}::uuid
    ),
    (
      ${q(ids.relationRoutineSession)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.relationLitter)}::uuid, '2026-07-19T10:00:00Z', 'Europe/Paris',
      'Séance support de la relation incohérente.', ${q(ownerId)}::uuid
    ),
    (
      ${q(ids.emptyRoutineSession)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.mainLitter)}::uuid, '2026-07-18T06:00:00Z', 'Europe/Paris',
      'Séance sans mesure exploitable.', ${q(ownerId)}::uuid
    );

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      litter_weighing_session_id, note, created_by
    ) values
      (${q(ids.existingRoutineFirst)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstAnimal)}::uuid, '2026-07-19T10:00:00Z', 430, 'routine',
       ${q(ids.existingRoutineSession)}::uuid, 'Routine Naya.', ${q(ownerId)}::uuid),
      (${q(ids.existingRoutineSecond)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.secondAnimal)}::uuid, '2026-07-19T10:00:00Z', 440, 'routine',
       ${q(ids.existingRoutineSession)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.existingRoutineThird)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.thirdAnimal)}::uuid, '2026-07-19T10:00:00Z', 450, 'routine',
       ${q(ids.existingRoutineSession)}::uuid, null, ${q(ownerId)}::uuid);

    set session_replication_role = replica;
    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      litter_weighing_session_id, note, created_by
    ) values (
      ${q(ids.inconsistentRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.inconsistentAnimal)}::uuid, '2026-07-19T10:00:00Z', 460, 'routine',
      ${q(ids.relationRoutineSession)}::uuid, 'Lien incohérent volontaire.', ${q(ownerId)}::uuid
    );
    set session_replication_role = origin;
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function invariantState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litter', (select json_build_object(
          'status', status, 'born_total_count', born_total_count,
          'born_male_count', born_male_count, 'born_female_count', born_female_count,
          'alive_count', alive_count
        ) from public.litters where id = ${q(ids.mainLitter)}::uuid),
        'animals', (select json_agg(json_build_object(
          'id', id, 'status', status, 'birth_weight_grams', birth_weight_grams,
          'birth_date', birth_date, 'birth_time', birth_time, 'birth_order', birth_order,
          'litter_id', litter_id, 'death_date', death_date
        ) order by birth_order) from public.animals
          where id in (${q(ids.firstAnimal)}::uuid, ${q(ids.secondAnimal)}::uuid, ${q(ids.thirdAnimal)}::uuid)),
        'whelping_session_count', (select count(*) from public.whelping_sessions
          where litter_id = ${q(ids.mainLitter)}::uuid),
        'whelping_event_count', (select count(*) from public.whelping_events
          where session_id = ${q(ids.whelpingSession)}::uuid),
        'whelping_birth_count', (select count(*) from public.whelping_births
          where session_id = ${q(ids.whelpingSession)}::uuid)
      )::text;
    `),
  );
}

function mainRoutineState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions_created', (select count(*) from public.litter_weighing_sessions
          where litter_id = ${q(ids.mainLitter)}::uuid
            and id not in (
              ${q(ids.existingRoutineSession)}::uuid,
              ${q(ids.emptyRoutineSession)}::uuid
            )),
        'commands_created', (select count(*) from public.litter_weight_commands
          where litter_id = ${q(ids.mainLitter)}::uuid),
        'new_measurements', coalesce((select json_agg(json_build_object(
          'animal_id', measurement.animal_id, 'grams', measurement.grams,
          'note', measurement.note, 'measured_at', measurement.measured_at,
          'session_id', measurement.litter_weighing_session_id
        ) order by measurement.animal_id)
          from public.animal_weight_measurements measurement
          join public.litter_weighing_sessions session
            on session.id = measurement.litter_weighing_session_id
          where session.litter_id = ${q(ids.mainLitter)}::uuid
            and session.id <> ${q(ids.existingRoutineSession)}::uuid), '[]'::json),
        'third_new_measurements', (select count(*)
          from public.animal_weight_measurements measurement
          join public.litter_weighing_sessions session
            on session.id = measurement.litter_weighing_session_id
          where session.litter_id = ${q(ids.mainLitter)}::uuid
            and session.id <> ${q(ids.existingRoutineSession)}::uuid
            and measurement.animal_id = ${q(ids.thirdAnimal)}::uuid)
      )::text;
    `),
  ) as {
    sessions_created: number;
    commands_created: number;
    new_measurements: Array<{
      animal_id: string;
      grams: number;
      note: string | null;
      measured_at: string;
      session_id: string;
    }>;
    third_new_measurements: number;
  };
}

function createdArtifactIds() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'commands', coalesce((select json_agg(id::text order by created_at)
          from public.litter_weight_commands where litter_id in (${uuidList(litterIds)})), '[]'::json),
        'sessions', coalesce((select json_agg(id::text order by created_at)
          from public.litter_weighing_sessions where litter_id in (${uuidList(litterIds)})), '[]'::json),
        'measurements', coalesce((select json_agg(id::text order by created_at)
          from public.animal_weight_measurements where animal_id in (${uuidList(animalIds)})), '[]'::json)
      )::text;
    `),
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function weightPanel(page: Page) {
  return page.getByTestId("litter-weight-panel");
}

test("saisie collective, historique, droits, isolation et mobile", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  const deterministicFixtureIds = {
    litters: [...litterIds],
    animals: [ids.mother, ids.father, ...animalIds],
    whelpingSession: ids.whelpingSession,
    births: [ids.firstBirth, ids.secondBirth, ids.thirdBirth],
    existingRoutineSession: ids.existingRoutineSession,
    emptyRoutineSession: ids.emptyRoutineSession,
  };

  try {
    createFixtures();
    const before = invariantState();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);

    let panel = weightPanel(page);
    await expect(panel.getByRole("heading", { name: "Poids et croissance" })).toBeVisible();
    await expect(panel).toContainText("3 animaux suivis · 2 séances de routine");
    const latestSummary = panel.getByTestId("latest-litter-weight-session-summary");
    await expect(latestSummary).toContainText("Synthèse de la dernière séance");
    await expect(latestSummary).toContainText("3 poids enregistrés");
    await expect(latestSummary).toContainText("Moyenne");
    await expect(latestSummary).toContainText("440 g");
    await expect(latestSummary).toContainText("Minimum");
    await expect(latestSummary).toContainText("430 g");
    await expect(latestSummary).toContainText("Maximum");
    await expect(latestSummary).toContainText("450 g");
    await expect(latestSummary).toContainText(
      "Calculé sur les poids enregistrés pendant cette séance.",
    );
    await expect(panel).toContainText("Séance de routine existante.");
    const sessionHistory = panel.getByTestId("litter-weight-sessions-history");
    const existingSessionBeforeDelete = sessionHistory
      .getByRole("listitem")
      .filter({ hasText: "Séance de routine existante." });
    await expect(existingSessionBeforeDelete).toContainText("3 poids enregistrés");
    await expect(existingSessionBeforeDelete.getByText("Moyenne :", { exact: true })).toBeVisible();
    await expect(existingSessionBeforeDelete.getByText("440 g", { exact: true })).toBeVisible();
    await expect(existingSessionBeforeDelete.getByText("Minimum :", { exact: true })).toBeVisible();
    await expect(existingSessionBeforeDelete.getByText("430 g", { exact: true })).toBeVisible();
    await expect(existingSessionBeforeDelete.getByText("Maximum :", { exact: true })).toBeVisible();
    await expect(existingSessionBeforeDelete.getByText("450 g", { exact: true })).toBeVisible();
    const emptySession = sessionHistory
      .getByRole("listitem")
      .filter({ hasText: "Séance sans mesure exploitable." });
    await expect(emptySession).toContainText(
      "Statistiques indisponibles pour cette séance.",
    );
    await expect(panel).toContainText("Poids de naissance Naya.");
    await expect(panel).toContainText("Repère déclaré à la naissance : 360 g");
    await expect(panel).toContainText("430 g");
    await expect(panel).toContainText("440 g");
    await expect(panel).toContainText("450 g");
    await expect(panel.getByRole("button", { name: "Nouvelle pesée" })).toBeVisible();
    expect(await panel.textContent()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    try {
      sql(`update public.animals set deleted_at = now()
        where id = ${q(ids.secondAnimal)}::uuid;`);
      await page.reload();
      panel = weightPanel(page);
      await expect(panel).toContainText("2 animaux suivis · 2 séances de routine");
      await expect(panel.getByText("Orion officiel", { exact: true })).toHaveCount(0);
      await expect(
        panel.getByTestId("litter-weight-animals-history").getByText("440 g", { exact: true }),
      ).toHaveCount(0);
      const existingSession = panel
        .getByTestId("litter-weight-sessions-history")
        .getByRole("listitem")
        .filter({ hasText: "Séance de routine existante." });
      await expect(existingSession).toContainText("3 poids enregistrés");
      await expect(existingSession.getByText("Moyenne :", { exact: true })).toBeVisible();
      await expect(existingSession.getByText("440 g", { exact: true })).toBeVisible();
      await expect(existingSession.getByText("Minimum :", { exact: true })).toBeVisible();
      await expect(existingSession.getByText("430 g", { exact: true })).toBeVisible();
      await expect(existingSession.getByText("Maximum :", { exact: true })).toBeVisible();
      await expect(existingSession.getByText("450 g", { exact: true })).toBeVisible();
      await expect(panel.getByTestId("latest-litter-weight-session-summary")).toContainText(
        "440 g",
      );

      await panel.getByRole("button", { name: "Nouvelle pesée" }).click();
      const softDeleteDialog = page.getByRole("dialog", { name: "Nouvelle pesée" });
      await expect(softDeleteDialog.getByRole("group")).toHaveCount(2);
      await expect(softDeleteDialog).not.toContainText("Orion officiel");
      await softDeleteDialog.getByRole("button", { name: "Annuler" }).click();
      await expect(softDeleteDialog).toBeHidden();
    } finally {
      sql(`update public.animals set deleted_at = null
        where id = ${q(ids.secondAnimal)}::uuid;`);
      await page.reload();
      panel = weightPanel(page);
    }

    await panel.getByRole("button", { name: "Nouvelle pesée" }).click();
    let dialog = page.getByRole("dialog", { name: "Nouvelle pesée" });
    await expect(dialog).toBeVisible();
    const groups = dialog.getByRole("group");
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(0)).toContainText("Naya");
    await expect(groups.nth(1)).toContainText("Orion officiel");
    await expect(groups.nth(2)).toContainText("Chiot n° 3");
    const fieldNames = await dialog.locator("input, textarea").evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("name")).filter(Boolean),
    );
    expect(fieldNames).toEqual([
      "measured_at",
      "timezone_name",
      "note",
      "weight_0",
      "item_note_0",
      "weight_1",
      "item_note_1",
      "weight_2",
      "item_note_2",
    ]);
    expect(await dialog.textContent()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    await dialog.getByLabel("Date et heure de la pesée").fill("2026-07-20T10:00");
    await dialog.getByLabel("Note commune (facultative)").fill("Nouvelle séance collective UI E2E.");
    await groups.nth(0).getByLabel("Poids en grammes").fill("455");
    await groups.nth(0).getByLabel("Note individuelle (facultative)").fill("Naya après tétée.");
    await groups.nth(1).getByLabel("Poids en grammes").fill("465");
    await dialog.getByRole("button", { name: "Enregistrer la pesée" }).click();

    await expect(dialog).toBeHidden();
    await expect(panel.getByText("2 poids ont été enregistrés.")).toBeVisible();
    await expect(panel).toContainText("3 séances de routine");
    await expect(panel).toContainText("Nouvelle séance collective UI E2E.");
    await expect(panel).toContainText("455 g");
    await expect(panel).toContainText("465 g");
    const newLatestSummary = panel.getByTestId("latest-litter-weight-session-summary");
    await expect(newLatestSummary).toContainText("2 poids enregistrés");
    await expect(newLatestSummary).toContainText("460 g");
    await expect(newLatestSummary).toContainText("455 g");
    await expect(newLatestSummary).toContainText("465 g");

    const expectedMeasuredAt = await page.evaluate(
      () => new Date("2026-07-20T10:00").toISOString(),
    );
    const after = mainRoutineState();
    expect(after.sessions_created).toBe(1);
    expect(after.commands_created).toBe(1);
    expect(after.new_measurements).toHaveLength(2);
    expect(after.new_measurements.map((measurement) => measurement.animal_id)).toEqual([
      ids.firstAnimal,
      ids.secondAnimal,
    ]);
    expect(after.new_measurements.map((measurement) => measurement.grams)).toEqual([455, 465]);
    expect(after.new_measurements[0]?.note).toBe("Naya après tétée.");
    expect(after.new_measurements[1]?.note).toBeNull();
    expect(after.new_measurements.every(
      (measurement) => new Date(measurement.measured_at).toISOString() === expectedMeasuredAt,
    )).toBe(true);
    expect(new Set(after.new_measurements.map((measurement) => measurement.session_id)).size).toBe(1);
    expect(after.third_new_measurements).toBe(0);
    expect(invariantState()).toEqual(before);

    await page.reload();
    panel = weightPanel(page);
    await expect(panel).toContainText("3 séances de routine");
    await expect(panel).toContainText("Nouvelle séance collective UI E2E.");
    await expect(panel).toContainText("455 g");
    await expect(panel).toContainText("465 g");

    const consultationState = mainRoutineState();

    setOwnerRole("viewer");
    await page.reload();
    panel = weightPanel(page);
    await expect(panel).toContainText("Nouvelle séance collective UI E2E.");
    await expect(panel.getByTestId("latest-litter-weight-session-summary")).toContainText(
      "Moyenne",
    );
    await expect(panel.getByTestId("litter-weight-sessions-history")).toContainText(
      "Calculé sur les poids enregistrés pendant cette séance.",
    );
    await expect(panel.getByRole("button", { name: "Nouvelle pesée" })).toHaveCount(0);
    await expect(panel.locator("form, input, textarea")).toHaveCount(0);
    expect(mainRoutineState()).toEqual(consultationState);

    setOwnerRole("owner");
    await page.goto(`/litters/journal?litter=${ids.inconsistentLitter}`);
    panel = weightPanel(page);
    await expect(panel).toContainText("Les poids ne sont pas disponibles pour le moment.");
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(panel.locator("form, input, textarea")).toHaveCount(0);

    await page.goto(`/litters/journal?litter=${ids.noSessionLitter}`);
    panel = weightPanel(page);
    await expect(panel.getByRole("button", { name: "Nouvelle pesée" })).toBeVisible();
    expect(sql(`select count(*) from public.whelping_sessions where litter_id = ${q(ids.noSessionLitter)}::uuid;`)).toBe("0");
    await panel.getByRole("button", { name: "Nouvelle pesée" }).click();
    dialog = page.getByRole("dialog", { name: "Nouvelle pesée" });
    await expect(dialog).toContainText("Solo administratif");
    await dialog.getByLabel("Date et heure de la pesée").fill("2026-07-20T11:00");
    await dialog.getByLabel("Poids en grammes").fill("470");
    await dialog.getByRole("button", { name: "Enregistrer la pesée" }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByText("1 poids a été enregistré.")).toBeVisible();
    expect(sql(`select count(*) from public.whelping_sessions where litter_id = ${q(ids.noSessionLitter)}::uuid;`)).toBe("0");
    expect(sql(`select count(*) from public.litter_weighing_sessions where litter_id = ${q(ids.noSessionLitter)}::uuid;`)).toBe("1");

    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    panel = weightPanel(page);
    await expect(panel.getByTestId("latest-litter-weight-session-summary")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await panel.getByRole("button", { name: "Nouvelle pesée" }).click();
    await expect(page.getByRole("dialog", { name: "Nouvelle pesée" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    console.info(`E2E litter routine weighing UI deterministic fixture IDs: ${JSON.stringify(deterministicFixtureIds)}`);
    console.info(`E2E litter routine weighing UI created artifact IDs: ${JSON.stringify(createdArtifactIds())}`);
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero();
    console.info(`E2E litter routine weighing UI final fixture counts: ${JSON.stringify(finalCounts)}`);
  }
});
