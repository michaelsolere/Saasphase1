import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const fixturePrefix = "9f200001-";
const fixtureNamePrefix = "E2E litter comparison UI";

const ids = {
  foreignOrganization: "9f200001-0000-4000-8000-000000000001",
  foreignMembership: "9f200001-0000-4000-8000-000000000002",
  mother: "9f200001-0000-4000-8000-000000000003",
  alphaLitter: "9f200001-0000-4000-8000-000000000011",
  bravoLitter: "9f200001-0000-4000-8000-000000000012",
  noEligibleLitter: "9f200001-0000-4000-8000-000000000013",
  deltaLitter: "9f200001-0000-4000-8000-000000000014",
  echoLitter: "9f200001-0000-4000-8000-000000000015",
  foxtrotLitter: "9f200001-0000-4000-8000-000000000016",
  catLitter: "9f200001-0000-4000-8000-000000000017",
  otherBreedLitter: "9f200001-0000-4000-8000-000000000018",
  foreignLitter: "9f200001-0000-4000-8000-000000000019",
  emptyBreedLitter: "9f200001-0000-4000-8000-000000000020",
  alphaEligibleAnimal: "9f200001-0000-4000-8000-000000000021",
  alphaExcludedAnimal: "9f200001-0000-4000-8000-000000000022",
  bravoEligibleAnimal: "9f200001-0000-4000-8000-000000000023",
  noEligibleAnimal: "9f200001-0000-4000-8000-000000000024",
  alphaWhelpingSession: "9f200001-0000-4000-8000-000000000031",
  bravoWhelpingSession: "9f200001-0000-4000-8000-000000000032",
  alphaRoutineSession: "9f200001-0000-4000-8000-000000000041",
  bravoRoutineSession: "9f200001-0000-4000-8000-000000000042",
  alphaBirthEvent: "9f200001-0000-4000-8000-000000000051",
  bravoBirthEvent: "9f200001-0000-4000-8000-000000000052",
  alphaBirth: "9f200001-0000-4000-8000-000000000061",
  bravoBirth: "9f200001-0000-4000-8000-000000000062",
  alphaBirthWeight: "9f200001-0000-4000-8000-000000000071",
  alphaRoutineWeight: "9f200001-0000-4000-8000-000000000072",
  bravoBirthWeight: "9f200001-0000-4000-8000-000000000073",
  bravoRoutineWeight: "9f200001-0000-4000-8000-000000000074",
} as const;

const litterIds = [
  ids.alphaLitter,
  ids.bravoLitter,
  ids.noEligibleLitter,
  ids.deltaLitter,
  ids.echoLitter,
  ids.foxtrotLitter,
  ids.catLitter,
  ids.otherBreedLitter,
  ids.foreignLitter,
  ids.emptyBreedLitter,
] as const;

const animalIds = [
  ids.alphaEligibleAnimal,
  ids.alphaExcludedAnimal,
  ids.bravoEligibleAnimal,
  ids.noEligibleAnimal,
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

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships
    set role = ${q(role)}, updated_at = now()
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function cleanup() {
  sql(`
    delete from public.animal_weight_measurements
    where id::text like ${q(`${fixturePrefix}%`)}
       or animal_id in (${uuidList(animalIds)});

    delete from public.litter_weighing_sessions
    where id::text like ${q(`${fixturePrefix}%`)}
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_births
    where id::text like ${q(`${fixturePrefix}%`)}
       or animal_id in (${uuidList(animalIds)});

    delete from public.whelping_events
    where id::text like ${q(`${fixturePrefix}%`)};

    delete from public.whelping_sessions
    where id::text like ${q(`${fixturePrefix}%`)}
       or litter_id in (${uuidList(litterIds)});

    delete from public.animals
    where id in (${uuidList(animalIds)})
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id::text like ${q(`${fixturePrefix}%`)}
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id::text like ${q(`${fixturePrefix}%`)}
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    set session_replication_role = replica;
    delete from public.memberships
    where id::text like ${q(`${fixturePrefix}%`)};

    delete from public.organizations
    where id::text like ${q(`${fixturePrefix}%`)}
       or slug = 'e2e-litter-comparison-ui-foreign';

    update public.memberships
    set role = 'owner', updated_at = now()
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
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like ${q(`${fixturePrefix}%`)}
             or animal_id in (${uuidList(animalIds)})),
        'litter_weighing_sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like ${q(`${fixturePrefix}%`)}
             or litter_id in (${uuidList(litterIds)})),
        'whelping_births', (select count(*) from public.whelping_births
          where id::text like ${q(`${fixturePrefix}%`)}
             or animal_id in (${uuidList(animalIds)})),
        'whelping_events', (select count(*) from public.whelping_events
          where id::text like ${q(`${fixturePrefix}%`)}),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like ${q(`${fixturePrefix}%`)}
             or litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id::text like ${q(`${fixturePrefix}%`)}
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${fixtureNamePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like ${q(`${fixturePrefix}%`)}
             or name like ${q(`${fixtureNamePrefix}%`)}),
        'memberships', (select count(*) from public.memberships
          where id::text like ${q(`${fixturePrefix}%`)}
             or (id = ${q(ownerMembershipId)}::uuid and role <> 'owner')),
        'organizations', (select count(*) from public.organizations
          where id::text like ${q(`${fixturePrefix}%`)}
             or slug = 'e2e-litter-comparison-ui-foreign')
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
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.foreignOrganization)}::uuid,
      'Organisation étrangère comparaison UI E2E',
      'e2e-litter-comparison-ui-foreign'
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid,
      ${q(ownerId)}::uuid, 'owner', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, is_breeder, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} mère`)}, 'dog', 'Golden Retriever', 'female',
      'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      actual_birth_date, expected_birth_date, created_at, created_by, updated_by
    ) values
      (${q(ids.alphaLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Alpha`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid,
       'puppies_created', '2026-07-01', null, '2026-07-10T09:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.bravoLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Bravo`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid,
       'puppies_created', '2026-07-02', null, '2026-07-10T08:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noEligibleLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Sans éligible`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid,
       'born', '2026-07-03', null, '2026-07-10T07:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.deltaLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Delta`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid,
       'born', null, '2026-08-01', '2026-07-10T06:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.echoLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Echo`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid,
       'born', null, null, '2026-07-10T05:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foxtrotLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Foxtrot`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid,
       'born', null, null, '2026-07-10T04:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.catLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Chat`)}, 'cat', 'Maine Coon', null,
       'born', '2026-07-04', null, '2026-07-10T03:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherBreedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Labrador`)}, 'dog', 'Labrador Retriever', null,
       'born', '2026-07-05', null, '2026-07-10T02:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.emptyBreedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Race vide`)}, 'dog', '   ', null,
       'born', '2026-07-05', null, '2026-07-10T01:30:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} Autre organisation`)}, 'dog', 'Golden Retriever', null,
       'born', '2026-07-06', null, '2026-07-10T01:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, species, breed, sex, status,
      ownership_status, call_name, birth_date, birth_time, birth_order,
      created_by, updated_by
    ) values
      (${q(ids.alphaEligibleAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaLitter)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever',
       'female', 'born', 'produced', ${q(`${fixtureNamePrefix} Alpha éligible`)},
       '2026-07-01', '08:00', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.alphaExcludedAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaLitter)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever',
       'male', 'born', 'produced', ${q(`${fixtureNamePrefix} Alpha exclu`)},
       '2026-07-01', '08:10', 2, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.bravoEligibleAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoLitter)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever',
       'male', 'born', 'produced', ${q(`${fixtureNamePrefix} Bravo éligible`)},
       '2026-07-02', '09:00', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noEligibleAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.noEligibleLitter)}::uuid, ${q(ids.mother)}::uuid, 'dog', 'Golden Retriever',
       'female', 'born', 'produced', ${q(`${fixtureNamePrefix} Sans mesure`)},
       '2026-07-03', '10:00', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values
      (${q(ids.alphaWhelpingSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-07-01T07:00:00Z', '2026-07-01T10:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.bravoWhelpingSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-07-02T08:00:00Z', '2026-07-02T11:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at, event_type, author_id
    ) values
      (${q(ids.alphaBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaWhelpingSession)}::uuid, 1, '2026-07-01T08:00:00Z', 'birth', ${q(ownerId)}::uuid),
      (${q(ids.bravoBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoWhelpingSession)}::uuid, 1, '2026-07-02T09:00:00Z', 'birth', ${q(ownerId)}::uuid);

    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, created_by
    ) values
      (${q(ids.alphaBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaWhelpingSession)}::uuid, ${q(ids.alphaBirthEvent)}::uuid,
       ${q(ids.alphaEligibleAnimal)}::uuid, 1, 'female', 'alive', ${q(ownerId)}::uuid),
      (${q(ids.bravoBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoWhelpingSession)}::uuid, ${q(ids.bravoBirthEvent)}::uuid,
       ${q(ids.bravoEligibleAnimal)}::uuid, 1, 'male', 'alive', ${q(ownerId)}::uuid);

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, created_by
    ) values
      (${q(ids.alphaRoutineSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaLitter)}::uuid, '2026-07-02T08:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.bravoRoutineSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoLitter)}::uuid, '2026-07-03T09:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid);

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, litter_weighing_session_id,
      measured_at, grams, measurement_kind, source_birth_id, created_by
    ) values
      (${q(ids.alphaBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaEligibleAnimal)}::uuid, null, '2026-07-01T08:00:00Z',
       400, 'birth', ${q(ids.alphaBirth)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.alphaRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.alphaEligibleAnimal)}::uuid, ${q(ids.alphaRoutineSession)}::uuid,
       '2026-07-02T08:00:00Z', 600, 'routine', null, ${q(ownerId)}::uuid),
      (${q(ids.bravoBirthWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoEligibleAnimal)}::uuid, null, '2026-07-02T09:00:00Z',
       500, 'birth', ${q(ids.bravoBirth)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.bravoRoutineWeight)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.bravoEligibleAnimal)}::uuid, ${q(ids.bravoRoutineSession)}::uuid,
       '2026-07-03T09:00:00Z', 750, 'routine', null, ${q(ownerId)}::uuid);
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function card(page: Page, name: string) {
  return page.getByLabel(`Sélectionner ${fixtureNamePrefix} ${name}`);
}

function resultCard(page: Page, name: string): Locator {
  return page
    .getByTestId("litter-comparison-result")
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: `${fixtureNamePrefix} ${name}` }) });
}

function readOnlyCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'measurements', (select count(*) from public.animal_weight_measurements
          where id::text like ${q(`${fixturePrefix}%`)}),
        'weighing_sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like ${q(`${fixturePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like ${q(`${fixturePrefix}%`)})
      )::text;
    `),
  ) as Record<string, number>;
}

test("comparaison descriptive inter-portées sans identifiants publics", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  createFixtures();
  const deterministicFixtureIds = Object.values(ids);
  const initialReadOnlyCounts = readOnlyCounts();

  try {
    await login(page);

    const comparisonPosts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/litters/journal/comparison"
      ) {
        comparisonPosts.push(request.postData() ?? "");
      }
    });

    await page.goto("/litters/journal/comparison");
    await expect(page.getByRole("heading", { name: "Comparer des portées" })).toBeVisible();
    await expect(page.getByText("0 portée sélectionnée sur 5")).toBeVisible();
    await expect(page.getByTestId("litter-comparison-result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Comparer les portées" })).toBeDisabled();
    expect(comparisonPosts).toHaveLength(0);
    await expect(card(page, "Race vide")).toHaveCount(0);
    await expect(page.getByText(`${fixtureNamePrefix} Race vide`)).toHaveCount(0);

    await card(page, "Alpha").check();
    await expect(page.getByText("1 portée sélectionnée sur 5")).toBeVisible();
    await expect(page.getByRole("button", { name: "Comparer les portées" })).toBeDisabled();
    await expect(card(page, "Chat")).toBeDisabled();
    await expect(card(page, "Labrador")).toBeDisabled();
    await expect(card(page, "Autre organisation")).toBeDisabled();
    await expect(card(page, "Chat").locator("xpath=ancestor::label")).toContainText(
      "Incompatible avec la première portée sélectionnée",
    );

    for (const name of ["Bravo", "Sans éligible", "Delta", "Echo"]) {
      await card(page, name).check();
    }
    await expect(page.getByText("5 portées sélectionnées sur 5")).toBeVisible();
    await expect(card(page, "Foxtrot")).toBeDisabled();
    await expect(card(page, "Foxtrot").locator("xpath=ancestor::label")).toContainText(
      "Limite de cinq portées atteinte",
    );

    for (const name of ["Sans éligible", "Delta", "Echo"]) {
      await card(page, name).uncheck();
    }
    await expect(page.getByText("2 portées sélectionnées sur 5")).toBeVisible();
    await page.getByRole("button", { name: "Comparer les portées" }).click();
    await expect(page.getByTestId("litter-comparison-result")).toBeVisible();
    expect(comparisonPosts).toHaveLength(1);

    const alpha = resultCard(page, "Alpha");
    await expect(alpha).toContainText("Animaux totaux");
    await expect(alpha).toContainText("Éligibles");
    await expect(alpha).toContainText("Exclus");
    await expect(alpha).toContainText("Journées observées");
    await expect(alpha).toContainText("J0");
    await expect(alpha).toContainText("J1");
    await expect(alpha).toContainText("1 / 1");
    await expect(alpha).toContainText("400 g");
    await expect(alpha).toContainText("600 g");
    await expect(alpha).toContainText("100");
    await expect(alpha).toContainText("150");
    await expect(alpha).toContainText("+50 %");
    await expect(alpha.locator("dd")).toHaveText(["2", "1", "1", "2"]);

    const bravo = resultCard(page, "Bravo");
    await expect(bravo.locator("dd")).toHaveText(["1", "1", "0", "2"]);
    await expect(bravo).toContainText("750 g");

    await card(page, "Bravo").uncheck();
    await card(page, "Sans éligible").check();
    await page.getByRole("button", { name: "Comparer les portées" }).click();
    const noEligible = resultCard(page, "Sans éligible");
    await expect(noEligible).toContainText("Aucun animal éligible");
    await expect(noEligible.locator("dd")).toHaveText(["1", "0", "1", "0"]);
    await expect(noEligible).toContainText("Aucune journée observée n’est disponible");

    expect(page.url()).toBe("http://127.0.0.1:3100/litters/journal/comparison");
    const html = await page.content();
    expect(html).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    const formAttributes = await page
      .locator("form, input, button")
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
    for (const postData of comparisonPosts) {
      expect(postData).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    }
    expect(readOnlyCounts()).toEqual(initialReadOnlyCounts);

    setOwnerRole("viewer");
    await page.reload();
    await card(page, "Alpha").check();
    await card(page, "Bravo").check();
    await page.getByRole("button", { name: "Comparer les portées" }).click();
    await expect(resultCard(page, "Alpha")).toContainText("600 g");
    await expect(resultCard(page, "Bravo")).toContainText("750 g");
    expect(readOnlyCounts()).toEqual(initialReadOnlyCounts);

    await page.setViewportSize({ width: 375, height: 760 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Comparer des portées" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    console.info(
      `E2E litter comparison UI deterministic fixture IDs: ${JSON.stringify(deterministicFixtureIds)}`,
    );
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero();
    console.info(
      `E2E litter comparison UI final fixture counts: ${JSON.stringify(finalCounts)}`,
    );
  }
});
