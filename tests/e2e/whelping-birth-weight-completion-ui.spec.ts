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
const prefix = "9f190006-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E whelping birth weight completion UI";

const ids = {
  mother: `${prefix}01`,
  father: `${prefix}02`,
  missingAnimal: `${prefix}03`,
  weightedAnimal: `${prefix}04`,
  mainLitter: `${prefix}10`,
  incompleteLitter: `${prefix}11`,
  mainSession: `${prefix}20`,
  incompleteSession: `${prefix}21`,
  missingBirthEvent: `${prefix}30`,
  weightedBirthEvent: `${prefix}31`,
  closeEvent: `${prefix}32`,
  incompleteEvent: `${prefix}33`,
  missingBirth: `${prefix}40`,
  weightedBirth: `${prefix}41`,
  incompleteBirth: `${prefix}42`,
  incompleteMissingAnimal: `${prefix}43`,
  existingMeasurement: `${prefix}50`,
} as const;

const litterIds = [ids.mainLitter, ids.incompleteLitter] as const;
const sessionIds = [ids.mainSession, ids.incompleteSession] as const;
const birthIds = [ids.missingBirth, ids.weightedBirth, ids.incompleteBirth] as const;
const producedAnimalIds = [ids.missingAnimal, ids.weightedAnimal] as const;

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
    delete from public.whelping_commands
    where litter_id in (${uuidList(litterIds)})
       or session_id in (${uuidList(sessionIds)})
       or birth_id in (${uuidList(birthIds)});

    delete from public.animal_weight_measurements
    where id = ${q(ids.existingMeasurement)}::uuid
       or source_birth_id in (${uuidList(birthIds)})
       or animal_id in (${uuidList(producedAnimalIds)});

    delete from public.whelping_births
    where id in (${uuidList(birthIds)})
       or session_id in (${uuidList(sessionIds)});

    delete from public.whelping_events
    where session_id in (${uuidList(sessionIds)});

    delete from public.animals
    where id in (${uuidList(producedAnimalIds)})
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_sessions
    where id in (${uuidList(sessionIds)})
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id in (${uuidList(litterIds)})
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid)
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'whelping_commands', (select count(*) from public.whelping_commands
          where litter_id in (${uuidList(litterIds)})
             or session_id in (${uuidList(sessionIds)})
             or birth_id in (${uuidList(birthIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id = ${q(ids.existingMeasurement)}::uuid
             or source_birth_id in (${uuidList(birthIds)})
             or animal_id in (${uuidList(producedAnimalIds)})),
        'whelping_births', (select count(*) from public.whelping_births
          where id in (${uuidList(birthIds)})
             or session_id in (${uuidList(sessionIds)})),
        'whelping_events', (select count(*) from public.whelping_events
          where session_id in (${uuidList(sessionIds)})),
        'animals', (select count(*) from public.animals
          where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, ${uuidList(producedAnimalIds)})
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${fixtureNamePrefix}%`)}),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id in (${uuidList(sessionIds)}) or litter_id in (${uuidList(litterIds)})),
        'litters', (select count(*) from public.litters
          where id in (${uuidList(litterIds)}) or name like ${q(`${fixtureNamePrefix}%`)}),
        'memberships_and_users', (
          (select count(*) from public.memberships where id::text like '9f190006-%')
          + (select count(*) from auth.users where id::text like '9f190006-%')
          + (select count(*) from auth.identities where user_id::text like '9f190006-%')
          + (select count(*) from public.memberships
             where id = ${q(ownerMembershipId)}::uuid and role <> 'owner')
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const counts = remainingFixtureCounts();
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
      id, organization_id, name, species, breed, mother_id, father_id,
      status, actual_birth_date, born_total_count, born_male_count,
      born_female_count, alive_count, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'born', '2026-07-19',
       2, 1, 1, 2, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incompleteLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} chargement incomplet`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'born', '2026-07-19',
       1, 0, 1, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values
      (${q(ids.mainSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-07-19T07:00:00Z', '2026-07-19T09:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incompleteSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.incompleteLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-07-19T07:00:00Z', '2026-07-19T09:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at,
      event_type, note, author_id
    ) values
      (${q(ids.missingBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainSession)}::uuid, 1, '2026-07-19T08:00:00Z', 'birth',
       'Naissance sans poids UI E2E.', ${q(ownerId)}::uuid),
      (${q(ids.weightedBirthEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainSession)}::uuid, 2, '2026-07-19T08:10:00Z', 'birth',
       'Naissance déjà pesée UI E2E.', ${q(ownerId)}::uuid),
      (${q(ids.closeEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainSession)}::uuid, 3, '2026-07-19T09:00:00Z', 'session_closed',
       'Clôture préalable UI E2E.', ${q(ownerId)}::uuid),
      (${q(ids.incompleteEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.incompleteSession)}::uuid, 1, '2026-07-19T08:20:00Z', 'birth',
       'Naissance volontairement incomplète UI E2E.', ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, father_id, call_name,
      species, breed, sex, status, ownership_status, birth_date, birth_time,
      birth_order, birth_weight_grams, created_by, updated_by
    ) values
      (${q(ids.missingAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       ${q(`${fixtureNamePrefix} chiot sans poids`)}, 'dog', 'Golden Retriever',
       'female', 'born', 'produced', '2026-07-19', '10:00:00', 1, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.weightedAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       ${q(`${fixtureNamePrefix} chiot déjà pesé`)}, 'dog', 'Golden Retriever',
       'male', 'born', 'produced', '2026-07-19', '10:10:00', 2, 355,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    set session_replication_role = replica;
    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, initial_collar_color, created_by
    ) values
      (${q(ids.missingBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainSession)}::uuid, ${q(ids.missingBirthEvent)}::uuid,
       ${q(ids.missingAnimal)}::uuid, 1, 'female', 'alive', 'Rose', ${q(ownerId)}::uuid),
      (${q(ids.weightedBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.mainSession)}::uuid, ${q(ids.weightedBirthEvent)}::uuid,
       ${q(ids.weightedAnimal)}::uuid, 2, 'male', 'alive', 'Bleu', ${q(ownerId)}::uuid),
      (${q(ids.incompleteBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.incompleteSession)}::uuid, ${q(ids.incompleteEvent)}::uuid,
       ${q(ids.incompleteMissingAnimal)}::uuid, 1, 'female', 'alive', null,
       ${q(ownerId)}::uuid);
    set session_replication_role = origin;

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      source_birth_id, note, created_by
    ) values (
      ${q(ids.existingMeasurement)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.weightedAnimal)}::uuid, '2026-07-19T08:12:00Z', 355, 'birth',
      ${q(ids.weightedBirth)}::uuid, 'Poids déjà présent UI E2E.', ${q(ownerId)}::uuid
    );
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

function databaseState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'event_count', (select count(*) from public.whelping_events
          where session_id = ${q(ids.mainSession)}::uuid),
        'event_sequence', (select json_agg(sequence_no order by sequence_no)
          from public.whelping_events where session_id = ${q(ids.mainSession)}::uuid),
        'measurement_count', (select count(*) from public.animal_weight_measurements
          where source_birth_id = ${q(ids.missingBirth)}::uuid),
        'measurement', (select json_build_object(
          'birth_id', source_birth_id, 'animal_id', animal_id, 'grams', grams,
          'measured_at', measured_at, 'note', note
        ) from public.animal_weight_measurements
          where source_birth_id = ${q(ids.missingBirth)}::uuid),
        'animal_birth_weight', (select birth_weight_grams from public.animals
          where id = ${q(ids.missingAnimal)}::uuid),
        'birth_links', (select json_build_object(
          'session_id', session_id, 'event_id', event_id, 'animal_id', animal_id,
          'birth_order', birth_order
        ) from public.whelping_births where id = ${q(ids.missingBirth)}::uuid)
      )::text;
    `),
  ) as {
    event_count: number;
    event_sequence: number[];
    measurement_count: number;
    measurement: null | {
      birth_id: string;
      animal_id: string;
      grams: number;
      measured_at: string;
      note: string | null;
    };
    animal_birth_weight: number | null;
    birth_links: {
      session_id: string;
      event_id: string;
      animal_id: string;
      birth_order: number;
    };
  };
}

function createdArtifactIds() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'commands', coalesce((select json_agg(id::text order by created_at)
          from public.whelping_commands where litter_id in (${uuidList(litterIds)})), '[]'::json),
        'measurements', coalesce((select json_agg(id::text order by created_at)
          from public.animal_weight_measurements where source_birth_id in (${uuidList(birthIds)})), '[]'::json)
      )::text;
    `),
  ) as Record<string, string[]>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function whelpingPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Mise-bas", exact: true })
    .locator("xpath=ancestor::section[1]");
}

function birthCard(panel: Locator, birthOrder: number) {
  return panel.locator("ol > li").filter({ hasText: `Naissance n° ${birthOrder}` });
}

test("complète après clôture un poids manquant avec sécurité UI et cleanup strict", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  const fixtureIds = {
    litters: [...litterIds],
    sessions: [...sessionIds],
    births: [...birthIds],
    animals: [ids.mother, ids.father, ...producedAnimalIds],
    existingMeasurement: ids.existingMeasurement,
  };

  try {
    createFixtures();
    const before = databaseState();
    expect(before).toMatchObject({
      event_count: 3,
      event_sequence: [1, 2, 3],
      measurement_count: 0,
      animal_birth_weight: null,
      birth_links: {
        session_id: ids.mainSession,
        event_id: ids.missingBirthEvent,
        animal_id: ids.missingAnimal,
        birth_order: 1,
      },
    });

    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    let panel = whelpingPanel(page);
    await expect(panel.getByText("Clôturée", { exact: true })).toBeVisible();
    await expect(panel.getByText(
      "La session est clôturée. Seuls les poids de naissance manquants peuvent encore être renseignés.",
    )).toBeVisible();
    await expect(panel.getByRole("button", { name: /ENREGISTRER UNE NAISSANCE/ })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Ajouter un événement" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Clôturer la mise-bas" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /réouvrir/i })).toHaveCount(0);

    let missingCard = birthCard(panel, 1);
    let weightedCard = birthCard(panel, 2);
    await expect(missingCard).toContainText("Poids de naissance non renseigné");
    await expect(missingCard.getByRole("button", { name: "Renseigner le poids" })).toBeVisible();
    await expect(weightedCard).toContainText("355 g");
    await expect(weightedCard).toContainText("Pesé le");
    await expect(weightedCard.getByRole("button", { name: "Renseigner le poids" })).toHaveCount(0);
    expect(await panel.textContent()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    setOwnerRole("viewer");
    await page.reload();
    panel = whelpingPanel(page);
    await expect(birthCard(panel, 1)).toContainText("Poids de naissance non renseigné");
    await expect(panel.getByRole("button", { name: "Renseigner le poids" })).toHaveCount(0);
    await expect(panel.locator('input[name="birth_weight_grams"]')).toHaveCount(0);
    await expect(panel.locator('input[name="measured_at"]')).toHaveCount(0);
    await expect(panel.locator("form")).toHaveCount(0);

    setOwnerRole("owner");
    await page.reload();
    panel = whelpingPanel(page);
    missingCard = birthCard(panel, 1);
    weightedCard = birthCard(panel, 2);
    await expect(missingCard.getByRole("button", { name: "Renseigner le poids" })).toBeVisible();
    await expect(weightedCard.getByRole("button", { name: "Renseigner le poids" })).toHaveCount(0);

    await missingCard.getByRole("button", { name: "Renseigner le poids" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Date et heure de pesée")).not.toHaveValue("");
    await dialog.getByLabel("Poids en grammes").fill("428");
    await dialog.getByLabel("Date et heure de pesée").fill("2026-07-19T10:05");
    await dialog.getByLabel("Note (facultative)").fill("Pesée complétée après clôture UI E2E.");
    await dialog.getByRole("button", { name: "Enregistrer le poids" }).click();

    await expect(dialog).toBeHidden();
    await expect(panel.getByText("Le poids de naissance a été enregistré.")).toBeVisible();
    await expect(missingCard).toContainText("428 g");
    await expect(missingCard).toContainText("Pesé le");
    await expect(missingCard.getByRole("button", { name: "Renseigner le poids" })).toHaveCount(0);

    const expectedMeasuredAt = await page.evaluate(
      () => new Date("2026-07-19T10:05").toISOString(),
    );
    const after = databaseState();
    expect(after).toMatchObject({
      event_count: before.event_count,
      event_sequence: before.event_sequence,
      measurement_count: 1,
      animal_birth_weight: 428,
      birth_links: before.birth_links,
      measurement: {
        birth_id: ids.missingBirth,
        animal_id: ids.missingAnimal,
        grams: 428,
        note: "Pesée complétée après clôture UI E2E.",
      },
    });
    expect(new Date(after.measurement!.measured_at).toISOString()).toBe(expectedMeasuredAt);
    console.info(`E2E birth weight UI created artifact IDs: ${JSON.stringify(createdArtifactIds())}`);

    await page.reload();
    panel = whelpingPanel(page);
    await expect(birthCard(panel, 1)).toContainText("428 g");
    await expect(panel.getByRole("button", { name: "Renseigner le poids" })).toHaveCount(0);

    await page.goto(`/litters/journal?litter=${ids.incompleteLitter}`);
    panel = whelpingPanel(page);
    await expect(panel.getByText(
      "Les informations de mise-bas ne sont pas disponibles pour le moment.",
    )).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(0);
    await expect(panel.locator("form")).toHaveCount(0);
    expect(await panel.textContent()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    await expect(whelpingPanel(page)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    console.info(`E2E birth weight UI fixture IDs: ${JSON.stringify(fixtureIds)}`);
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero();
    console.info(`E2E birth weight UI final fixture counts: ${JSON.stringify(finalCounts)}`);
  }
});
