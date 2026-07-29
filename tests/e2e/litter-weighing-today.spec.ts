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

const prefix = "d7290004";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ids = {
  organization: `${prefix}-0000-4000-8000-000000000001`,
  membership: `${prefix}-0000-4000-8000-000000000002`,
  mother: `${prefix}-0000-4000-8000-000000000011`,
  father: `${prefix}-0000-4000-8000-000000000012`,
  dueLitter: `${prefix}-0000-4000-8000-000000000101`,
  handledLitter: `${prefix}-0000-4000-8000-000000000102`,
  duePuppyA: `${prefix}-0000-4000-8000-000000000201`,
  duePuppyB: `${prefix}-0000-4000-8000-000000000202`,
  handledPuppyA: `${prefix}-0000-4000-8000-000000000203`,
  handledPuppyB: `${prefix}-0000-4000-8000-000000000204`,
  session: `${prefix}-0000-4000-8000-000000000301`,
  measurement: `${prefix}-0000-4000-8000-000000000401`,
  command: `${prefix}-0000-4000-8000-000000000501`,
} as const;
const dueLitterLabel = "Rosie × Rimbaud";
const handledLitterLabel = "Naya × Oslo";
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

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

function organizationSnapshot() {
  return sql(`
    select jsonb_build_object(
      'organizations', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.organizations row_value where row_value.id=${q(ids.organization)}::uuid),
      'memberships', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.memberships row_value where row_value.organization_id=${q(ids.organization)}::uuid),
      'animals', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.animals row_value where row_value.organization_id=${q(ids.organization)}::uuid),
      'litters', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.litters row_value where row_value.organization_id=${q(ids.organization)}::uuid),
      'sessions', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.litter_weighing_sessions row_value where row_value.organization_id=${q(ids.organization)}::uuid),
      'measurements', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.animal_weight_measurements row_value where row_value.organization_id=${q(ids.organization)}::uuid),
      'commands', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.id), '[]'::jsonb) from public.litter_weight_commands row_value where row_value.organization_id=${q(ids.organization)}::uuid)
    )::text;
  `);
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

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("LITTER-WEIGHING-TODAY-INTEGRATION-01 — Journal, Aujourd’hui élevage et cleanup", async ({
  page,
}) => {
  const fixtures = createE2eFixtureRegistry(sql, "d7290004-litter-weighing-today");
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
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

  try {
    expect(Object.values(reservedPrefixCounts()).every((count) => count === 0)).toBe(
      true,
    );
    const today = formatLitterJournalBusinessDate(new Date());
    const dueBirthDate = addCivilDays(today, -12);
    const handledBirthDate = addCivilDays(today, -3);

    await createTestOrganization(sql, fixtures, {
      id: ids.organization,
      name: "E2E Aujourd’hui pesées",
      slug: "e2e-d7290004-litter-weighing-today",
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
      callName: "Rosie",
      sex: "female",
    });
    const father = await createTestAnimal(sql, fixtures, {
      id: ids.father,
      organizationId: ids.organization,
      ownerId,
      callName: "Rimbaud",
      sex: "male",
    });
    await createTestLitter(sql, fixtures, {
      id: ids.dueLitter,
      organizationId: ids.organization,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: dueLitterLabel,
      status: "born",
      actualBirthDate: dueBirthDate,
    });
    await createTestLitter(sql, fixtures, {
      id: ids.handledLitter,
      organizationId: ids.organization,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: handledLitterLabel,
      status: "born",
      actualBirthDate: handledBirthDate,
    });
    await createTestLitterWithPuppies(sql, fixtures, {
      organizationId: ids.organization,
      litterId: ids.dueLitter,
      ownerId,
      puppies: [
        {
          id: ids.duePuppyA,
          motherId: mother,
          fatherId: father,
          name: "Due A",
          birthDate: dueBirthDate,
          birthOrder: 1,
        },
        {
          id: ids.duePuppyB,
          motherId: mother,
          fatherId: father,
          name: "Due B",
          birthDate: dueBirthDate,
          birthOrder: 2,
        },
      ],
    });
    const handledPuppies = await createTestLitterWithPuppies(sql, fixtures, {
      organizationId: ids.organization,
      litterId: ids.handledLitter,
      ownerId,
      puppies: [
        {
          id: ids.handledPuppyA,
          motherId: mother,
          fatherId: father,
          name: "Handled A",
          birthDate: handledBirthDate,
          birthOrder: 1,
        },
        {
          id: ids.handledPuppyB,
          motherId: mother,
          fatherId: father,
          name: "Handled B",
          birthDate: handledBirthDate,
          birthOrder: 2,
        },
      ],
    });
    const session = await createTestWeighingSession(sql, fixtures, {
      id: ids.session,
      organizationId: ids.organization,
      litterId: ids.handledLitter,
      ownerId,
      measuredAt: `${today}T08:00:00.000Z`,
      timezoneName: "Europe/Paris",
      note: "Séance partielle Aujourd’hui",
    });
    await createTestWeightMeasurement(sql, fixtures, {
      id: ids.measurement,
      organizationId: ids.organization,
      ownerId,
      puppyId: handledPuppies.puppies[0]!.id,
      sessionId: session.id,
      grams: 640,
    });

    expect(
      sql(`
        select count(*)::text
        from public.litters
        where organization_id=${q(ids.organization)}::uuid
          and actual_birth_date is not null
          and litter_weighing_schedule_policy_snapshot is not null;
      `),
    ).toBe("2");
    const beforeReads = organizationSnapshot();

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.handledLitter}`);

    const journalToday = page
      .locator("#litter-care-today-heading")
      .locator("xpath=ancestor::section[1]");
    const journalHandled = journalToday
      .locator("section[aria-label='Traité aujourd’hui']")
      .getByTestId("litter-weighing-today-card");
    await expect(journalHandled).toContainText("Pesée réalisée aujourd’hui");
    await expect(journalHandled).toContainText("1 séance · 1 poids enregistré");
    const journalOverdue = journalToday
      .locator("section[aria-label='En retard']")
      .getByTestId("litter-weighing-today-card");
    await expect(journalOverdue).toContainText("3 pesées en retard");
    await expect(journalHandled.getByRole("button")).toHaveCount(0);
    const journalWeightLink = journalHandled.getByRole("link", {
      name: "Ouvrir les pesées",
    });
    await expect(journalWeightLink).toHaveAttribute("href", "#litter-weights");
    await journalWeightLink.focus();
    await expect(journalWeightLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`${ids.handledLitter}#litter-weights$`),
    );
    await expect(page.locator("#litter-weights")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/calendar/today");
    const breedingToday = page
      .locator("#breeding-today-heading")
      .locator("xpath=ancestor::section[1]");
    const dueCard = breedingToday
      .locator("section[aria-label='À faire aujourd’hui']")
      .getByTestId("litter-weighing-today-card")
      .filter({ hasText: dueLitterLabel });
    await expect(dueCard).toContainText("Pesée J12 à faire aujourd’hui");
    await expect(dueCard).toContainText(`Portée ${dueLitterLabel}`);
    const handledCard = breedingToday
      .locator("section[aria-label='Traité aujourd’hui']")
      .getByTestId("litter-weighing-today-card")
      .filter({ hasText: handledLitterLabel });
    await expect(handledCard).toContainText("Pesée réalisée aujourd’hui");
    await expect(handledCard).toContainText("1 séance · 1 poids enregistré");
    const handledOverdueCard = breedingToday
      .locator("section[aria-label='En retard']")
      .getByTestId("litter-weighing-today-card")
      .filter({ hasText: handledLitterLabel });
    await expect(handledOverdueCard).toContainText("3 pesées en retard");
    await expect(handledCard.getByRole("button")).toHaveCount(0);
    const dueLink = dueCard.getByRole("link", { name: "Ouvrir les pesées" });
    await expect(dueLink).toHaveAttribute(
      "href",
      `/litters/journal?litter=${ids.dueLitter}#litter-weights`,
    );
    await expectNoHorizontalOverflow(page);

    const breedingHtml = await page.content();
    const breedingLinks = await page
      .locator("a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    for (const technicalId of [ids.session, ids.measurement, ids.command]) {
      expect(breedingHtml).not.toContain(technicalId);
      expect(breedingLinks.join("\n")).not.toContain(technicalId);
    }

    await dueLink.focus();
    await expect(dueLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`${ids.dueLitter}#litter-weights$`),
    );
    await expect(page.locator("#litter-weights")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    expect(organizationSnapshot()).toBe(beforeReads);
    expect(
      sql(
        `select count(*)::text from public.litter_weight_commands where organization_id=${q(ids.organization)}::uuid;`,
      ),
    ).toBe("0");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    await fixtures.cleanup();
    const exactCounts = await fixtures.assertEmpty();
    expect(Object.values(exactCounts).every((count) => count === 0)).toBe(true);
    expect(Object.values(reservedPrefixCounts()).every((count) => count === 0)).toBe(
      true,
    );
  }
});
