import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import {
  createTestAnimal,
  createTestLitter,
  createTestMembership,
  createTestOrganization,
} from "./helpers/fixtures/breeding-fixtures";
import { createE2eFixtureRegistry } from "./helpers/fixtures/fixture-registry";
import {
  createTestLitterWithPuppies,
  createTestWeighingSession,
  createTestWeightMeasurement,
} from "./helpers/fixtures/weighing-fixtures";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const prefix = "d7290005";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ids = {
  organization: `${prefix}-0000-4000-8000-000000000001`,
  membership: `${prefix}-0000-4000-8000-000000000002`,
  mother: `${prefix}-0000-4000-8000-000000000011`,
  father: `${prefix}-0000-4000-8000-000000000012`,
  litter: `${prefix}-0000-4000-8000-000000000101`,
  puppies: [
    `${prefix}-0000-4000-8000-000000000201`,
    `${prefix}-0000-4000-8000-000000000202`,
    `${prefix}-0000-4000-8000-000000000203`,
    `${prefix}-0000-4000-8000-000000000204`,
  ],
  historicalSession: `${prefix}-0000-4000-8000-000000000301`,
  historicalMeasurements: [
    `${prefix}-0000-4000-8000-000000000401`,
    `${prefix}-0000-4000-8000-000000000402`,
    `${prefix}-0000-4000-8000-000000000403`,
    `${prefix}-0000-4000-8000-000000000404`,
  ],
} as const;
const litterLabel = "E2E pesée express mobile";
const puppyLabels = [
  "Collier rouge",
  "Collier bleu",
  "Collier jaune",
  "Collier vert",
] as const;
const historicalWeights = [600, 610, 620, 630] as const;
const submittedWeights = [650, 660, 670] as const;
const sessionNoteDraft = "Séance express à conserver";
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const expectedGrowthComparisonSnapshot = {
  animals: 13,
  litters: 2,
  whelpingSessions: 2,
  whelpingEvents: 11,
  whelpingBirths: 9,
  litterWeighingSessions: 62,
  animalWeightMeasurements: 286,
} as const;

function addCivilDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function growthComparisonSnapshot() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'animals', (select count(*) from public.animals where id::text like 'd3c9%'),
        'litters', (select count(*) from public.litters where id::text like 'd3c9%'),
        'whelpingSessions', (select count(*) from public.whelping_sessions where id::text like 'd3c9%'),
        'whelpingEvents', (select count(*) from public.whelping_events where id::text like 'd3c9%'),
        'whelpingBirths', (select count(*) from public.whelping_births where id::text like 'd3c9%'),
        'litterWeighingSessions', (select count(*) from public.litter_weighing_sessions where id::text like 'd3c9%'),
        'animalWeightMeasurements', (select count(*) from public.animal_weight_measurements where id::text like 'd3c9%')
      )::text;
    `),
  ) as typeof expectedGrowthComparisonSnapshot;
}

function reservedPrefixCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'organizations', (select count(*) from public.organizations where id::text like '${prefix}-%'),
        'memberships', (select count(*) from public.memberships where id::text like '${prefix}-%'),
        'animals', (select count(*) from public.animals where id::text like '${prefix}-%'),
        'litters', (select count(*) from public.litters where id::text like '${prefix}-%'),
        'sessions', (select count(*) from public.litter_weighing_sessions where id::text like '${prefix}-%'),
        'measurements', (select count(*) from public.animal_weight_measurements where id::text like '${prefix}-%'),
        'weight_commands', (select count(*) from public.litter_weight_commands where id::text like '${prefix}-%'),
        'adjustment_commands', (select count(*) from public.litter_weight_adjustment_commands where id::text like '${prefix}-%')
      )::text;
    `),
  ) as Record<string, number>;
}

function organizationWeightRows() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions', (
          select coalesce(json_agg(id::text order by created_at), '[]'::json)
          from public.litter_weighing_sessions
          where organization_id=${q(ids.organization)}::uuid
        ),
        'measurements', (
          select coalesce(json_agg(id::text order by created_at), '[]'::json)
          from public.animal_weight_measurements
          where organization_id=${q(ids.organization)}::uuid
        ),
        'commands', (
          select coalesce(json_agg(id::text order by created_at), '[]'::json)
          from public.litter_weight_commands
          where organization_id=${q(ids.organization)}::uuid
        )
      )::text;
    `),
  ) as { sessions: string[]; measurements: string[]; commands: string[] };
}

function organizationWeightCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions', (
          select count(*) from public.litter_weighing_sessions
          where organization_id=${q(ids.organization)}::uuid
        ),
        'measurements', (
          select count(*) from public.animal_weight_measurements
          where organization_id=${q(ids.organization)}::uuid
        ),
        'commands', (
          select count(*) from public.litter_weight_commands
          where organization_id=${q(ids.organization)}::uuid
        )
      )::text;
    `),
  ) as { sessions: number; measurements: number; commands: number };
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("LITTER-WEIGHT-QUICK-ENTRY-01 — saisie mobile partielle depuis Aujourd’hui", async ({
  page,
}) => {
  const growthBeforeFixtures = growthComparisonSnapshot();
  expect(growthBeforeFixtures).toEqual(expectedGrowthComparisonSnapshot);
  const fixtures = createE2eFixtureRegistry(
    sql,
    "d7290005-litter-weight-quick-entry",
  );
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  const navigatedUrls: string[] = [];
  let generatedRows:
    | { sessions: string[]; measurements: string[]; commands: string[] }
    | null = null;

  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(
      `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "échec"}`,
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigatedUrls.push(frame.url());
  });

  const registerGeneratedRows = () => {
    const rows = organizationWeightRows();
    for (const sessionId of rows.sessions) {
      if (!fixtures.has("litter_weighing_sessions", sessionId)) {
        fixtures.register("litter_weighing_sessions", sessionId);
      }
    }
    for (const measurementId of rows.measurements) {
      if (!fixtures.has("animal_weight_measurements", measurementId)) {
        fixtures.register("animal_weight_measurements", measurementId);
      }
    }
    for (const commandId of rows.commands) {
      if (!fixtures.has("litter_weight_commands", commandId)) {
        fixtures.register("litter_weight_commands", commandId);
      }
    }
    return rows;
  };

  try {
    expect(Object.values(reservedPrefixCounts()).every((count) => count === 0)).toBe(
      true,
    );
    const today = formatLitterJournalBusinessDate(new Date());
    const birthDate = addCivilDays(today, -4);
    const historicalDate = addCivilDays(today, -1);

    await createTestOrganization(sql, fixtures, {
      id: ids.organization,
      name: "E2E pesée express mobile",
      slug: "e2e-d7290005-litter-weight-quick-entry",
    });
    await createTestMembership(sql, fixtures, {
      id: ids.membership,
      organizationId: ids.organization,
      profileId: ownerId,
      role: "member",
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    const mother = await createTestAnimal(sql, fixtures, {
      id: ids.mother,
      organizationId: ids.organization,
      ownerId,
      callName: "Romy",
      sex: "female",
    });
    const father = await createTestAnimal(sql, fixtures, {
      id: ids.father,
      organizationId: ids.organization,
      ownerId,
      callName: "Rio",
      sex: "male",
    });
    await createTestLitter(sql, fixtures, {
      id: ids.litter,
      organizationId: ids.organization,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: litterLabel,
      status: "born",
      actualBirthDate: birthDate,
    });
    const puppies = await createTestLitterWithPuppies(sql, fixtures, {
      organizationId: ids.organization,
      litterId: ids.litter,
      ownerId,
      puppies: ids.puppies.map((id, index) => ({
        id,
        motherId: mother,
        fatherId: father,
        name: puppyLabels[index],
        sex: index % 2 === 0 ? ("female" as const) : ("male" as const),
        birthDate,
        birthOrder: index + 1,
      })),
    });
    const historicalSession = await createTestWeighingSession(sql, fixtures, {
      id: ids.historicalSession,
      organizationId: ids.organization,
      litterId: ids.litter,
      ownerId,
      measuredAt: `${historicalDate}T08:00:00.000Z`,
      timezoneName: "Europe/Paris",
      note: "Derniers poids connus",
    });
    for (const [index, puppy] of puppies.puppies.entries()) {
      await createTestWeightMeasurement(sql, fixtures, {
        id: ids.historicalMeasurements[index],
        organizationId: ids.organization,
        ownerId,
        puppyId: puppy.id,
        sessionId: historicalSession.id,
        grams: historicalWeights[index]!,
      });
    }

    expect(
      sql(`
        select count(*)::text
        from public.litters
        where id=${q(ids.litter)}::uuid
          and actual_birth_date is not null
          and litter_weighing_schedule_policy_snapshot is not null;
      `),
    ).toBe("1");
    expect(organizationWeightCounts()).toEqual({
      sessions: 1,
      measurements: 4,
      commands: 0,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto("/calendar/today");
    await expectNoHorizontalOverflow(page);

    const todayPanel = page
      .locator("#breeding-today-heading")
      .locator("xpath=ancestor::section[1]");
    const dueCard = todayPanel
      .locator("section[aria-label='À faire aujourd’hui']")
      .getByTestId("litter-weighing-today-card")
      .filter({ hasText: litterLabel });
    await expect(dueCard).toBeVisible();
    await expect(dueCard.getByRole("button")).toHaveCount(0);
    const entryLink = dueCard.getByRole("link", { name: "Saisir la pesée" });
    const expectedEntryHref = `/litters/journal?litter=${ids.litter}&tab=weights&weightEntry=1#litter-weights`;
    await expect(entryLink).toHaveAttribute("href", expectedEntryHref);
    await entryLink.click();

    // La saisie est désormais intégrée dans la page (grille compacte), sans modale.
    const entry = page.getByTestId("routine-weight-inline-entry");
    await expect(entry).toBeVisible();
    expect(navigatedUrls.some((url) => url.endsWith(expectedEntryHref))).toBe(true);
    await expect(page).toHaveURL(
      new RegExp(
        `litter=${ids.litter}&tab=weights&weightEntry=1#litter-weights$`,
      ),
    );
    expect(growthComparisonSnapshot()).toEqual(growthBeforeFixtures);

    const weightInputs = entry.getByLabel(/Poids de .+ en grammes/);
    await expect(weightInputs).toHaveCount(4);
    for (const grams of historicalWeights) {
      await expect(entry.getByText(`${grams} g`, { exact: true }).first()).toBeVisible();
    }

    // Les animaux sont triés par sexe puis ordre de naissance : on cible chaque
    // chiot par son libellé public plutôt que par position, et on laisse le
    // dernier (Collier vert) sans mesure pour la séance partielle.
    const missingPuppyInput = entry.getByLabel(
      `Poids de ${puppyLabels[3]} en grammes`,
    );
    await expect(missingPuppyInput).toBeVisible();
    for (const [index, grams] of submittedWeights.entries()) {
      await entry
        .getByLabel(`Poids de ${puppyLabels[index]} en grammes`)
        .fill(String(grams));
    }
    await expect(entry.getByTestId("routine-weight-inline-progress")).toHaveText(
      "3 / 4 saisis",
    );
    await entry
      .getByText("Date, heure et note de séance", { exact: true })
      .click();
    const measuredAtInput = entry.getByLabel("Date et heure de la pesée");
    const selectedMeasuredAt = await measuredAtInput.inputValue();
    expect(selectedMeasuredAt).not.toBe("");
    const sessionNoteInput = entry.getByLabel("Note commune (facultative)");
    await sessionNoteInput.fill(sessionNoteDraft);
    await expectNoHorizontalOverflow(page);

    // Soumission sans confirmation : la séance partielle exige une validation explicite.
    await entry.getByRole("button", { name: "Enregistrer la séance" }).click();
    const partialConfirmation = entry.getByText(/Séance partielle :/);
    await expect(partialConfirmation).toBeVisible();
    await expect(partialConfirmation).toContainText(puppyLabels[3]);
    expect(organizationWeightCounts()).toEqual({
      sessions: 1,
      measurements: 4,
      commands: 0,
    });

    await entry
      .getByRole("button", { name: "Confirmer la séance partielle" })
      .click();
    await expect(page.getByText("3 poids ont été enregistrés.")).toBeVisible({
      timeout: 30_000,
    });

    generatedRows = registerGeneratedRows();
    const newSessionIds = generatedRows.sessions.filter(
      (id) => id !== ids.historicalSession,
    );
    const historicalMeasurementIds = new Set<string>(
      ids.historicalMeasurements,
    );
    const newMeasurementIds = generatedRows.measurements.filter(
      (id) => !historicalMeasurementIds.has(id),
    );
    expect(newSessionIds).toHaveLength(1);
    expect(newMeasurementIds).toHaveLength(3);
    expect(generatedRows.commands).toHaveLength(1);
    expect(
      sql(`
        select note
        from public.litter_weighing_sessions
        where id=${q(newSessionIds[0]!)}::uuid;
      `),
    ).toBe(sessionNoteDraft);
    console.info(
      "LITTER_WEIGHT_QUICK_ENTRY_CREATED",
      JSON.stringify({
        organization: ids.organization,
        membership: ids.membership,
        animals: [ids.mother, ids.father, ...ids.puppies],
        litter: ids.litter,
        historicalSession: ids.historicalSession,
        historicalMeasurements: ids.historicalMeasurements,
        generatedSession: newSessionIds,
        generatedMeasurements: newMeasurementIds,
        generatedCommands: generatedRows.commands,
      }),
    );
    expect(
      sql(`
        select count(*)::text
        from public.animal_weight_measurements
        where id in (${newMeasurementIds.map((id) => `${q(id)}::uuid`).join(",")})
          and animal_id=${q(ids.puppies[3])}::uuid;
      `),
    ).toBe("0");

    // Après enregistrement, retour sur l'onglet Aujourd'hui du Journal : la
    // carte de la portée passe dans « Traité aujourd'hui ».
    await page.goto(`/litters/journal?litter=${ids.litter}&tab=today`);
    const journalToday = page
      .locator("#litter-care-today-heading")
      .locator("xpath=ancestor::section[1]");
    await expect(
      journalToday
        .locator("section[aria-label='Traité aujourd’hui']")
        .getByTestId("litter-weighing-today-card"),
    ).toContainText("1 séance · 3 poids enregistrés");

    const technicalIds = [
      ids.historicalSession,
      ...ids.historicalMeasurements,
      ...newSessionIds,
      ...newMeasurementIds,
      ...generatedRows.commands,
    ];
    const html = await page.content();
    const hrefs = await page
      .locator("a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    for (const technicalId of technicalIds) {
      expect(html).not.toContain(technicalId);
      expect(hrefs.join("\n")).not.toContain(technicalId);
    }

    await page.reload();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(failedResponses).toEqual([]);
    expect(growthComparisonSnapshot()).toEqual(growthBeforeFixtures);
  } finally {
    try {
      if (
        sql(
          `select count(*)::text from public.organizations where id=${q(ids.organization)}::uuid;`,
        ) === "1"
      ) {
        generatedRows = registerGeneratedRows();
      }
      await fixtures.cleanup();
      const exactCounts = await fixtures.assertEmpty();
      expect(Object.values(exactCounts).every((count) => count === 0)).toBe(true);
      expect(
        Object.values(reservedPrefixCounts()).every((count) => count === 0),
      ).toBe(true);
    } finally {
      const growthAfterCleanup = growthComparisonSnapshot();
      expect(growthAfterCleanup).toEqual(expectedGrowthComparisonSnapshot);
      expect(growthAfterCleanup).toEqual(growthBeforeFixtures);
    }
  }
});
