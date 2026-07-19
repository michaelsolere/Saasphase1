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
const prefix = "9f190008-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E litter growth curves UI";

const ids = {
  mother: `${prefix}01`,
  father: `${prefix}02`,
  firstAnimal: `${prefix}11`,
  secondAnimal: `${prefix}12`,
  singlePointAnimal: `${prefix}13`,
  noMeasurementAnimal: `${prefix}14`,
  inconsistentAnimal: `${prefix}15`,
  mainLitter: `${prefix}21`,
  inconsistentLitter: `${prefix}22`,
  whelpingSession: `${prefix}31`,
  firstBirthEvent: `${prefix}41`,
  secondBirthEvent: `${prefix}42`,
  firstBirth: `${prefix}51`,
  secondBirth: `${prefix}52`,
  firstBirthWeight: `${prefix}61`,
  secondBirthWeight: `${prefix}62`,
  routineSession: `${prefix}71`,
  firstRoutineWeight: `${prefix}72`,
  secondRoutineWeight: `${prefix}73`,
  singleRoutineWeight: `${prefix}74`,
  inconsistentRoutineWeight: `${prefix}75`,
} as const;

const litterIds = [ids.mainLitter, ids.inconsistentLitter] as const;
const animalIds = [
  ids.firstAnimal,
  ids.secondAnimal,
  ids.singlePointAnimal,
  ids.noMeasurementAnimal,
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
    where client_command_id::text like '9f190008-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.animal_weight_measurements
    where id::text like '9f190008-%'
       or animal_id in (${uuidList(animalIds)})
       or litter_weighing_session_id in (
         select id from public.litter_weighing_sessions
         where id::text like '9f190008-%' or litter_id in (${uuidList(litterIds)})
       );

    delete from public.litter_weighing_sessions
    where id::text like '9f190008-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_commands
    where client_command_id::text like '9f190008-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_births
    where id::text like '9f190008-%'
       or session_id = ${q(ids.whelpingSession)}::uuid;

    delete from public.whelping_events
    where id::text like '9f190008-%'
       or session_id = ${q(ids.whelpingSession)}::uuid;

    delete from public.animals
    where id in (${uuidList(animalIds)})
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_sessions
    where id::text like '9f190008-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id in (${uuidList(litterIds)})
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid)
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.memberships where id::text like '9f190008-%';
    delete from auth.identities where user_id::text like '9f190008-%';
    delete from auth.users where id::text like '9f190008-%';
    delete from public.profiles where id::text like '9f190008-%';
    delete from public.organizations where id::text like '9f190008-%';

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
          where client_command_id::text like '9f190008-%'
             or litter_id in (${uuidList(litterIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f190008-%'
             or animal_id in (${uuidList(animalIds)})
             or litter_weighing_session_id in (select id from public.litter_weighing_sessions
               where id::text like '9f190008-%' or litter_id in (${uuidList(litterIds)}))),
        'litter_weighing_sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like '9f190008-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_commands', (select count(*) from public.whelping_commands
          where client_command_id::text like '9f190008-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_births', (select count(*) from public.whelping_births
          where id::text like '9f190008-%' or session_id = ${q(ids.whelpingSession)}::uuid),
        'whelping_events', (select count(*) from public.whelping_events
          where id::text like '9f190008-%' or session_id = ${q(ids.whelpingSession)}::uuid),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like '9f190008-%' or litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id::text like '9f190008-%'
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${fixtureNamePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like '9f190008-%' or name like ${q(`${fixtureNamePrefix}%`)}),
        'memberships', (select count(*) from public.memberships
          where id::text like '9f190008-%'
             or (id = ${q(ownerMembershipId)}::uuid and role <> 'owner')),
        'profiles', (select count(*) from public.profiles where id::text like '9f190008-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190008-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f190008-%'),
        'organizations', (select count(*) from public.organizations where id::text like '9f190008-%')
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
       4, 2, 2, 4, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} incohérente`)}, 'dog', 'Golden Retriever',
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
       'Naissance Aube.', ${q(ownerId)}::uuid),
      (${q(ids.secondBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.whelpingSession)}::uuid, 2, '2026-07-18T08:10:00Z', 'birth',
       'Naissance Boréal.', ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, father_id, call_name,
      official_name, species, breed, sex, status, ownership_status, birth_date,
      birth_time, birth_order, birth_weight_grams, collar_color_initial,
      collar_color_current, created_by, updated_by
    ) values
      (${q(ids.firstAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'Aube', 'Aube officielle', 'dog', 'Golden Retriever', 'female', 'born',
       'produced', '2026-07-18', '10:00:00', 1, 340, 'Rose', 'Framboise',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       null, 'Boréal officiel', 'dog', 'Golden Retriever', 'male', 'born',
       'produced', '2026-07-18', '10:10:00', 2, 355, 'Bleu', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.singlePointAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       null, null, 'dog', 'Golden Retriever', 'male', 'born',
       'produced', '2026-07-18', '10:20:00', 3, 390, 'Vert', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noMeasurementAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'Sans mesure', null, 'dog', 'Golden Retriever', 'female', 'born',
       'produced', '2026-07-18', '10:30:00', 4, 380, 'Orange', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inconsistentLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'Relation incohérente', null, 'dog', 'Golden Retriever', 'female', 'born',
       'produced', '2026-07-18', '11:00:00', 1, 400, 'Jaune', null,
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
       ${q(ids.secondAnimal)}::uuid, 2, 'male', 'alive', 'Bleu', ${q(ownerId)}::uuid);

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      source_birth_id, note, created_by
    ) values
      (${q(ids.firstBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstAnimal)}::uuid, '2026-07-18T08:02:00Z', 340, 'birth',
       ${q(ids.firstBirth)}::uuid, 'Mesure réelle Aube.', ${q(ownerId)}::uuid),
      (${q(ids.secondBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.secondAnimal)}::uuid, '2026-07-18T08:12:00Z', 355, 'birth',
       ${q(ids.secondBirth)}::uuid, 'Mesure réelle Boréal.', ${q(ownerId)}::uuid);

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, note, created_by
    ) values (
      ${q(ids.routineSession)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.mainLitter)}::uuid, '2026-07-19T10:00:00Z', 'Europe/Paris',
      'Séance des courbes.', ${q(ownerId)}::uuid
    );

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      litter_weighing_session_id, note, created_by
    ) values
      (${q(ids.firstRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstAnimal)}::uuid, '2026-07-19T10:00:00Z', 430, 'routine',
       ${q(ids.routineSession)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.secondRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.secondAnimal)}::uuid, '2026-07-19T10:00:00Z', 445, 'routine',
       ${q(ids.routineSession)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.singleRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.singlePointAnimal)}::uuid, '2026-07-19T10:00:00Z', 460, 'routine',
       ${q(ids.routineSession)}::uuid, 'Mesure unique.', ${q(ownerId)}::uuid);

    set session_replication_role = replica;
    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      litter_weighing_session_id, note, created_by
    ) values (
      ${q(ids.inconsistentRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.inconsistentAnimal)}::uuid, '2026-07-19T10:00:00Z', 470, 'routine',
      ${q(ids.routineSession)}::uuid, 'Lien incohérent volontaire.', ${q(ownerId)}::uuid
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

function readOnlyState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'measurements', (select count(*) from public.animal_weight_measurements
          where animal_id in (${uuidList(animalIds)})),
        'sessions', (select count(*) from public.litter_weighing_sessions
          where litter_id in (${uuidList(litterIds)})),
        'commands', (select count(*) from public.litter_weight_commands
          where litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id in (${uuidList(animalIds)})),
        'litters', (select count(*) from public.litters
          where id in (${uuidList(litterIds)}))
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

test("courbes absolues et relatives, viewer, erreur et mobile", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  const deterministicFixtureIds = {
    litters: [...litterIds],
    animals: [ids.mother, ids.father, ...animalIds],
    whelpingSession: ids.whelpingSession,
    births: [ids.firstBirth, ids.secondBirth],
    routineSession: ids.routineSession,
    measurements: [
      ids.firstBirthWeight,
      ids.secondBirthWeight,
      ids.firstRoutineWeight,
      ids.secondRoutineWeight,
      ids.singleRoutineWeight,
      ids.inconsistentRoutineWeight,
    ],
  };

  try {
    createFixtures();
    const beforeConsultation = readOnlyState();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);

    let panel = weightPanel(page);
    await expect(panel.getByRole("heading", { name: "Repères par animal" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Courbes de croissance" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Portée entière" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(panel.getByRole("button", { name: "Un animal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(
      panel.getByRole("button", { name: "Progression relative" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(panel).toContainText("Dates affichées dans le fuseau de cet appareil.");

    const indicators = panel.getByRole("list", {
      name: "Repères de poids par animal",
    });
    await expect(indicators.getByRole("listitem")).toHaveCount(4);
    const aubeIndicator = indicators.getByRole("listitem").filter({ hasText: "Aube" });
    const singleIndicator = indicators
      .getByRole("listitem")
      .filter({ hasText: "Chiot n° 3" });
    const emptyIndicator = indicators
      .getByRole("listitem")
      .filter({ hasText: "Sans mesure" });
    const expectedAubeDate = await page.evaluate(() =>
      new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date("2026-07-19T10:00:00Z")),
    );
    await expect(aubeIndicator).toContainText("Dernier poids réel : 430 g");
    await expect(aubeIndicator).toContainText(`Dernière mesure : ${expectedAubeDate}`);
    await expect(aubeIndicator).toContainText("2 mesures réelles");
    await expect(aubeIndicator).toContainText(
      "Écart avec la mesure précédente : +90 g",
    );
    await expect(aubeIndicator).toContainText(
      "Dernier intervalle observé : 1 j 1 h 58 min",
    );
    await expect(aubeIndicator).toContainText(
      "Progression depuis la naissance : +26,5 %",
    );
    await expect(singleIndicator).toContainText("Dernier poids réel : 460 g");
    await expect(singleIndicator).toContainText("1 mesure réelle");
    await expect(singleIndicator).toContainText(
      "Aucun intervalle n’est encore observable.",
    );
    await expect(singleIndicator).toContainText(
      "Progression depuis la naissance indisponible",
    );
    await expect(emptyIndicator).toContainText("Aucune mesure réelle");
    await expect(emptyIndicator).not.toContainText("380 g");
    await expect(emptyIndicator).toContainText(
      "Progression depuis la naissance indisponible",
    );

    const entireView = panel.getByTestId("entire-litter-growth-view");
    const chart = entireView.getByRole("img");
    await expect(chart).toBeVisible();
    await expect(chart.locator("[data-growth-series]")) .toHaveCount(2);
    await expect(chart.locator('[data-measurement-type="birth"]')).toHaveCount(2);
    await expect(chart.locator('[data-measurement-type="routine"]')).toHaveCount(3);

    const legendLabels = await entireView
      .getByRole("list", { name: "Légende des animaux" })
      .getByRole("listitem")
      .allTextContents();
    expect(legendLabels.map((label) => label.trim())).toEqual([
      "Aube",
      "Boréal officiel",
      "Chiot n° 3",
    ]);
    await expect(entireView).toContainText("1 animal sans mesure réelle non tracé.");
    expect(await chart.locator("title").allTextContents()).not.toContainEqual(
      expect.stringContaining("390 g"),
    );

    await panel.getByRole("button", { name: "Progression relative" }).click();
    const relativeView = panel.getByTestId("relative-growth-view");
    await expect(relativeView).toContainText(
      "Indice 100 = poids de naissance réel. Les courbes comparent la progression proportionnelle des animaux, indépendamment de leur poids de départ.",
    );
    const relativeChart = relativeView.getByRole("img");
    await expect(relativeChart).toBeVisible();
    await expect(relativeChart.locator("[data-growth-series]")).toHaveCount(2);
    await expect(
      relativeChart.locator('[data-measurement-type="birth"]'),
    ).toHaveCount(2);
    await expect(
      relativeChart.locator('[data-measurement-type="routine"]'),
    ).toHaveCount(2);
    const relativeLegendLabels = await relativeView
      .getByRole("list", { name: "Légende de la progression relative" })
      .getByRole("listitem")
      .allTextContents();
    expect(relativeLegendLabels.map((label) => label.trim())).toEqual([
      "Aube",
      "Boréal officiel",
    ]);
    await expect(relativeView).toContainText(
      "2 animaux sans mesure réelle de naissance exploitable non tracés.",
    );
    const relativeTitles = await relativeChart.locator("title").allTextContents();
    expect(relativeTitles).toContainEqual(expect.stringContaining("Indice 100"));
    expect(relativeTitles).toContainEqual(expect.stringContaining("Indice 126,5"));
    expect(relativeTitles).not.toContainEqual(expect.stringContaining("Chiot n° 3"));
    const relativeAttributes = await relativeView.locator("*").evaluateAll((elements) =>
      elements.flatMap((element) =>
        Array.from(element.attributes).map(
          (attribute) => `${attribute.name}=${attribute.value}`,
        ),
      ),
    );
    expect(relativeAttributes.join(" ")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    await panel.getByRole("button", { name: "Un animal" }).click();
    const individualView = panel.getByTestId("individual-animal-growth-view");
    const selector = individualView.getByLabel("Animal");
    await expect(selector).toBeVisible();
    expect(await selector.locator("option").allTextContents()).toEqual([
      "Aube",
      "Boréal officiel",
      "Chiot n° 3",
    ]);
    const optionValues = await selector.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(optionValues).toEqual(["0", "1", "2"]);
    expect(optionValues.every((value) => /^\d+$/.test(value))).toBe(true);
    await expect(individualView).toContainText("Aube");
    await expect(individualView).toContainText("2 mesures réelles");

    await selector.selectOption("2");
    await expect(individualView.getByRole("heading", { name: "Chiot n° 3" })).toBeVisible();
    await expect(individualView).toContainText("1 mesure réelle");
    const expectedLastDate = await page.evaluate(() =>
      new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date("2026-07-19T10:00:00Z")),
    );
    await expect(individualView).toContainText(
      `Dernière mesure : 460 g · ${expectedLastDate}`,
    );
    await expect(individualView.getByRole("img").locator("rect")).toHaveCount(1);
    await expect(individualView.getByRole("img").locator("polyline")).toHaveCount(0);
    await expect(individualView).toContainText(
      "Une seconde mesure permettra de tracer l’évolution.",
    );
    await expect(individualView).toContainText("naissance (cercle) · routine (carré)");
    expect(
      await individualView.getByRole("img").locator("title").allTextContents(),
    ).toContainEqual(expect.stringContaining("Pesée de routine"));
    await expect(selector.locator("option", { hasText: "Sans mesure" })).toHaveCount(0);

    const panelText = await panel.textContent();
    expect(panelText).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    const formAttributes = await panel
      .locator("form, input, textarea, select, option")
      .evaluateAll((elements) =>
        elements.flatMap((element) =>
          Array.from(element.attributes).map(
            (attribute) => `${attribute.name}=${attribute.value}`,
          ),
        ),
      );
    expect(formAttributes.join(" ")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(readOnlyState()).toEqual(beforeConsultation);

    setOwnerRole("viewer");
    await page.reload();
    panel = weightPanel(page);
    await expect(panel.getByRole("heading", { name: "Repères par animal" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Courbes de croissance" })).toBeVisible();
    await expect(panel.getByRole("img")).toBeVisible();
    await panel.getByRole("button", { name: "Progression relative" }).click();
    await expect(panel.getByTestId("relative-growth-view").getByRole("img")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Nouvelle pesée" })).toHaveCount(0);
    await expect(panel.locator("form, input, textarea")).toHaveCount(0);
    expect(readOnlyState()).toEqual(beforeConsultation);

    setOwnerRole("owner");
    await page.goto(`/litters/journal?litter=${ids.inconsistentLitter}`);
    panel = weightPanel(page);
    await expect(panel).toContainText("Les poids ne sont pas disponibles pour le moment.");
    await expect(panel.getByRole("heading", { name: "Courbes de croissance" })).toHaveCount(0);
    await expect(panel.getByRole("img")).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    panel = weightPanel(page);
    await expect(panel.getByRole("heading", { name: "Repères par animal" })).toBeVisible();
    await expect(
      panel.getByRole("list", { name: "Repères de poids par animal" }),
    ).toBeVisible();
    await expect(panel.getByRole("img")).toBeVisible();
    await panel.getByRole("button", { name: "Progression relative" }).click();
    await expect(panel.getByTestId("relative-growth-view").getByRole("img")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(readOnlyState()).toEqual(beforeConsultation);

    console.info(
      `E2E litter growth curves UI deterministic fixture IDs: ${JSON.stringify(deterministicFixtureIds)}`,
    );
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero();
    console.info(
      `E2E litter growth curves UI final fixture counts: ${JSON.stringify(finalCounts)}`,
    );
  }
});
