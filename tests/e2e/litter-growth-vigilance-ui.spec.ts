import { expect, test, type Page } from "@playwright/test";

import {
  createTestAnimal,
  createTestLitter,
  createTestOrganization,
} from "./helpers/fixtures/breeding-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";
import {
  createTestPuppy,
  createTestWeighingSession,
  createTestWeightMeasurement,
} from "./helpers/fixtures/weighing-fixtures";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "E2E vigilance croissance 01";
const ids = {
  mother: "9f210001-0000-4000-8000-000000000001",
  father: "9f210001-0000-4000-8000-000000000002",
  litter: "9f210001-0000-4000-8000-000000000003",
  violet: "9f210001-0000-4000-8000-000000000011",
  blue: "9f210001-0000-4000-8000-000000000012",
  initialSession: "9f210001-0000-4000-8000-000000000021",
  partialSession: "9f210001-0000-4000-8000-000000000022",
  violetInitial: "9f210001-0000-4000-8000-000000000031",
  blueInitial: "9f210001-0000-4000-8000-000000000032",
  violetDecrease: "9f210001-0000-4000-8000-000000000033",
  foreignOrganization: "9f210001-0000-4000-8000-000000000041",
  foreignMother: "9f210001-0000-4000-8000-000000000042",
  foreignLitter: "9f210001-0000-4000-8000-000000000043",
  foreignPuppy: "9f210001-0000-4000-8000-000000000044",
  foreignSession: "9f210001-0000-4000-8000-000000000045",
  foreignMeasurement: "9f210001-0000-4000-8000-000000000046",
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function parisCivilDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find(({ type }) => type === "year")?.value);
  const month = Number(parts.find(({ type }) => type === "month")?.value);
  const day = Number(parts.find(({ type }) => type === "day")?.value);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships
    set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function relevantCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions', (select count(*) from public.litter_weighing_sessions where litter_id = ${q(ids.litter)}::uuid),
        'measurements', (select count(*) from public.animal_weight_measurements where animal_id in (${q(ids.violet)}::uuid, ${q(ids.blue)}::uuid)),
        'record_commands', (select count(*) from public.litter_weight_commands where litter_id = ${q(ids.litter)}::uuid),
        'adjustment_commands', (select count(*) from public.litter_weight_adjustment_commands where litter_id = ${q(ids.litter)}::uuid)
      )::text;
    `),
  ) as Record<string, number>;
}

function registerDynamicRows(
  registry: ReturnType<typeof createE2eFixtureRegistry>,
  dynamicIdentifiers: Array<{ table: string; id: string }>,
) {
  const rows = JSON.parse(
    sql(`
      select coalesce(json_agg(row_to_json(fixtures)), '[]'::json)::text
      from (
        select 'litter_weight_adjustment_commands'::text as table_name, id
        from public.litter_weight_adjustment_commands
        where litter_id = ${q(ids.litter)}::uuid
        union all
        select 'litter_weight_commands', id
        from public.litter_weight_commands
        where litter_id = ${q(ids.litter)}::uuid
        union all
        select 'animal_weight_measurements', id
        from public.animal_weight_measurements
        where animal_id in (${q(ids.violet)}::uuid, ${q(ids.blue)}::uuid)
        union all
        select 'litter_weighing_sessions', id
        from public.litter_weighing_sessions
        where litter_id = ${q(ids.litter)}::uuid
      ) fixtures;
    `),
  ) as Array<{
    table_name:
      | "litter_weight_adjustment_commands"
      | "litter_weight_commands"
      | "animal_weight_measurements"
      | "litter_weighing_sessions";
    id: string;
  }>;

  for (const row of rows) {
    if (!registry.has(row.table_name, row.id)) {
      dynamicIdentifiers.push({ table: row.table_name, id: row.id });
      registry.register(row.table_name, row.id);
    }
  }
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("signaux objectifs, recalcul, action collective, confidentialité et viewer", async ({
  page,
}) => {
  const registry = createE2eFixtureRegistry(
    (statement) => sql(statement),
    "e2e-litter-growth-vigilance-01",
  );
  const today = parisCivilDate();
  const yesterday = parisCivilDate(-1);
  const execute = (statement: string) => sql(statement);
  const dynamicIdentifiers: Array<{ table: string; id: string }> = [];

  try {
    const mother = await createTestAnimal(execute, registry, {
      id: ids.mother,
      organizationId,
      ownerId,
      callName: `${prefix} mère`,
      sex: "female",
    });
    const father = await createTestAnimal(execute, registry, {
      id: ids.father,
      organizationId,
      ownerId,
      callName: `${prefix} père`,
      sex: "male",
    });
    await createTestLitter(execute, registry, {
      id: ids.litter,
      organizationId,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: `${prefix} portée`,
      status: "puppies_created",
      actualBirthDate: today,
    });
    sql(`
      set session_replication_role = replica;
      update public.litters
      set litter_weighing_schedule_policy_snapshot =
        '{"phases":[{"startAgeDay":0,"endAgeDay":30,"intervalDays":1},{"startAgeDay":31,"endAgeDay":60,"intervalDays":3}]}'::jsonb
      where id = ${q(ids.litter)}::uuid;
      set session_replication_role = origin;
    `);
    const violet = await createTestPuppy(execute, registry, {
      id: ids.violet,
      organizationId,
      litterId: ids.litter,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: "Violet vigilance",
      sex: "female",
      birthDate: today,
      birthOrder: 1,
    });
    const blue = await createTestPuppy(execute, registry, {
      id: ids.blue,
      organizationId,
      litterId: ids.litter,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: "Bleu vigilance",
      sex: "male",
      birthDate: today,
      birthOrder: 2,
    });
    const initialSession = await createTestWeighingSession(execute, registry, {
      id: ids.initialSession,
      organizationId,
      litterId: ids.litter,
      ownerId,
      measuredAt: `${today}T00:00:01.000Z`,
      note: `${prefix} séance complète initiale`,
    });
    await createTestWeightMeasurement(execute, registry, {
      id: ids.violetInitial,
      organizationId,
      ownerId,
      puppyId: violet.id,
      sessionId: initialSession.id,
      grams: 500,
    });
    await createTestWeightMeasurement(execute, registry, {
      id: ids.blueInitial,
      organizationId,
      ownerId,
      puppyId: blue.id,
      sessionId: initialSession.id,
      grams: 520,
    });

    const foreignOrganization = await createTestOrganization(execute, registry, {
      id: ids.foreignOrganization,
      name: `${prefix} organisation étrangère`,
      slug: "e2e-vigilance-growth-foreign-01",
    });
    const foreignMother = await createTestAnimal(execute, registry, {
      id: ids.foreignMother,
      organizationId: foreignOrganization,
      ownerId,
      callName: `${prefix} mère étrangère`,
    });
    await createTestLitter(execute, registry, {
      id: ids.foreignLitter,
      organizationId: foreignOrganization,
      ownerId,
      motherId: foreignMother,
      name: `${prefix} portée étrangère`,
      status: "puppies_created",
      actualBirthDate: today,
    });
    const foreignPuppy = await createTestPuppy(execute, registry, {
      id: ids.foreignPuppy,
      organizationId: foreignOrganization,
      litterId: ids.foreignLitter,
      ownerId,
      motherId: foreignMother,
      name: "Étranger vigilance",
      birthDate: today,
      birthOrder: 1,
    });
    const foreignSession = await createTestWeighingSession(execute, registry, {
      id: ids.foreignSession,
      organizationId: foreignOrganization,
      litterId: ids.foreignLitter,
      ownerId,
      measuredAt: `${today}T00:00:01.000Z`,
    });
    await createTestWeightMeasurement(execute, registry, {
      id: ids.foreignMeasurement,
      organizationId: foreignOrganization,
      ownerId,
      puppyId: foreignPuppy.id,
      sessionId: foreignSession.id,
      grams: 999,
    });

    const beforeDisplay = relevantCounts();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.litter}`);
    await expect(page.getByTestId("litter-weight-panel")).toBeVisible();
    await expect(page.getByTestId("litter-growth-vigilance-panel")).toHaveCount(0);
    expect(relevantCounts()).toEqual(beforeDisplay);

    const partialSession = await createTestWeighingSession(execute, registry, {
      id: ids.partialSession,
      organizationId,
      litterId: ids.litter,
      ownerId,
      measuredAt: `${today}T00:01:01.000Z`,
      note: `${prefix} séance partielle`,
    });
    await createTestWeightMeasurement(execute, registry, {
      id: ids.violetDecrease,
      organizationId,
      ownerId,
      puppyId: violet.id,
      sessionId: partialSession.id,
      grams: 488,
    });
    sql(`
      set session_replication_role = replica;
      update public.litters set actual_birth_date = ${q(yesterday)}
      where id = ${q(ids.litter)}::uuid;
      update public.animals set birth_date = ${q(yesterday)}
      where id in (${q(ids.violet)}::uuid, ${q(ids.blue)}::uuid);
      set session_replication_role = origin;
    `);

    await page.reload();
    const vigilance = page.getByTestId("litter-growth-vigilance-panel");
    await expect(vigilance).toBeVisible();
    await expect(vigilance).toContainText("Points de vigilance");
    await expect(vigilance).toContainText("Violet vigilance");
    await expect(vigilance).toContainText("Poids inférieur de 12 g");
    await expect(vigilance).toContainText("Dernier intervalle observé : 1 min");
    await expect(vigilance).toContainText("1 pesée prévue reste en retard");
    await expect(vigilance).toContainText("Dernière séance collective incomplète");
    await expect(vigilance).toContainText("Bleu vigilance");
    await expect(vigilance).not.toContainText("Étranger vigilance");
    await expect(
      vigilance.getByRole("button", { name: "Ouvrir la saisie des pesées" }),
    ).toHaveCount(1);

    const vigilanceHtml = await vigilance.evaluate((element) => element.outerHTML);
    expect(vigilanceHtml).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    expect(vigilanceHtml.toLowerCase()).not.toMatch(
      /danger|urgence|anomalie médicale|retard de croissance|chiot malade|diagnostic|pronostic|traitement/,
    );

    const history = page.getByTestId("litter-weight-sessions-history");
    await history.locator("summary").click();
    const partialMeasurement = history
      .locator("li")
      .filter({ hasText: "Violet vigilance" })
      .filter({ hasText: "488 g" })
      .first();
    await partialMeasurement.getByRole("button", { name: "Corriger" }).click();
    const correction = page.getByRole("dialog", {
      name: /Corriger la pesée de Violet vigilance/,
    });
    await correction.getByLabel("Poids (g)").fill("510");
    await correction
      .getByLabel("Motif de la correction")
      .fill("Rectification descriptive du test de vigilance");
    await correction
      .getByRole("button", { name: "Enregistrer la correction" })
      .click();
    await expect(page.getByRole("status")).toContainText("corrigée");
    await expect(vigilance).not.toContainText("Poids inférieur");
    await expect(vigilance).toContainText("Dernière séance collective incomplète");
    registerDynamicRows(registry, dynamicIdentifiers);

    await vigilance
      .getByRole("button", { name: "Ouvrir la saisie des pesées" })
      .click();
    const entryDialog = page.getByRole("dialog", { name: "Nouvelle pesée" });
    await expect(entryDialog).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(
        `/litters/journal\\?litter=${ids.litter}(?:&weightEntry=1)?#litter-weights$`,
      ),
    );
    await entryDialog
      .getByRole("group", { name: "Violet vigilance" })
      .getByLabel("Poids (g)")
      .fill("520");
    await entryDialog
      .getByRole("group", { name: "Bleu vigilance" })
      .getByLabel("Poids (g)")
      .fill("540");
    await entryDialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("status")).toContainText("ont été enregistrés");
    await expect(vigilance).not.toContainText(
      "Dernière séance collective incomplète",
    );
    registerDynamicRows(registry, dynamicIdentifiers);

    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const beforeViewerDisplay = relevantCounts();
    setOwnerRole("viewer");
    await page.reload();
    const viewerVigilance = page.getByTestId("litter-growth-vigilance-panel");
    await expect(viewerVigilance).toContainText("pesée prévue reste en retard");
    await expect(
      viewerVigilance.getByRole("button", {
        name: "Ouvrir la saisie des pesées",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("litter-weight-panel").getByRole("button", {
        name: "Nouvelle pesée",
      }),
    ).toHaveCount(0);
    expect(relevantCounts()).toEqual(beforeViewerDisplay);
  } finally {
    setOwnerRole("owner");
    registerDynamicRows(registry, dynamicIdentifiers);
    const created = await registry.counts();
    await registry.cleanup();
    const remaining = await registry.assertEmpty();
    const prefixRemaining = JSON.parse(
      sql(`
        select json_build_object(
          'animals', (select count(*) from public.animals where call_name like ${q(`${prefix}%`)}),
          'litters', (select count(*) from public.litters where name like ${q(`${prefix}%`)}),
          'organizations', (select count(*) from public.organizations where name like ${q(`${prefix}%`)})
        )::text;
      `),
    ) as Record<string, number>;
    expect(prefixRemaining).toEqual({
      animals: 0,
      litters: 0,
      organizations: 0,
    });
    console.log(
      JSON.stringify({
        litterGrowthVigilanceUiFixtures: {
          prefix,
          fixedIdentifiers: ids,
          dynamicIdentifiers,
          registeredBeforeCleanup: created,
          remaining,
          prefixRemaining,
        },
      }),
    );
  }
});
