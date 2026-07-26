import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import {
  createPlannedLitterCareTask,
  createPlannedLitterCareWindow,
  createResolvedLitterCareTask,
  createTestAnimal,
  createTestLitter,
} from "./helpers/fixtures/breeding-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (value: string) => runE2eSqlSync(value);

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

async function assertTodayLineAligned(page: Page, today: string) {
  const cell = page.locator(`[data-timeline-date="${today}"]`);
  const line = page.locator("[data-timeline-today-line]");
  await expect(cell).toBeVisible();
  await expect(line).toBeVisible();
  const cellBox = await cell.boundingBox();
  const lineBox = await line.boundingBox();
  expect(cellBox, "date cell bounding box").toBeTruthy();
  expect(lineBox, "today line bounding box").toBeTruthy();
  const cellCenter = cellBox!.x + cellBox!.width / 2;
  const lineCenter = lineBox!.x + lineBox!.width / 2;
  expect(Math.abs(cellCenter - lineCenter)).toBeLessThan(4);
}

async function assertMarkersNotStacked(page: Page, date: string, expectedCount: number) {
  const markers = page.locator(
    `[data-timeline-biology-cell="${date}"] [data-timeline-marker]`,
  );
  await expect(markers).toHaveCount(expectedCount);
  const boxes = await markers.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x * 10) / 10,
        y: Math.round(rect.y * 10) / 10,
        width: rect.width,
        height: rect.height,
        label: node.getAttribute("aria-label"),
      };
    }),
  );
  expect(boxes.every((box) => box.width > 0 && box.height > 0)).toBe(true);
  expect(new Set(boxes.map((box) => `${box.x}:${box.y}`)).size).toBe(boxes.length);
  expect(new Set(boxes.map((box) => box.label)).size).toBe(boxes.length);

  const biology = page.locator("[data-timeline-biology-row]");
  const nextRow = page.locator("[data-timeline-category]").first();
  const biologyBox = await biology.boundingBox();
  const nextBox = await nextRow.boundingBox();
  expect(biologyBox).toBeTruthy();
  expect(nextBox).toBeTruthy();
  expect(biologyBox!.y + biologyBox!.height).toBeLessThanOrEqual(nextBox!.y + 1);
}

test("frise biologique en lecture seule : zoom, repères, filtres et cleanup", async ({
  page,
}) => {
  const beforeTasks = sql("select count(*)::text from public.litter_care_tasks");

  await withE2eFixtures(sql, async (fixtures) => {
    const label = fixtures.namespace.slice(-8);
    const today = formatLitterJournalBusinessDate(new Date());
    const ovulation = addCivilDays(today, -47);
    const mating1 = addCivilDays(ovulation, 2);
    const mating2 = addCivilDays(ovulation, 4);
    const expectedBirth = addCivilDays(ovulation, 63);
    const windowStart = addCivilDays(today, -5);
    const windowEnd = addCivilDays(today, 20);

    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E mère frise ${label}`,
    });
    const father = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      sex: "male",
      callName: `E2E père frise ${label}`,
    });
    const litterA = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: `E2E frise A ${label}`,
      status: "pregnancy_confirmed",
      estimatedOvulationDate: ovulation,
      matingDate: mating1,
      matingDate2: mating2,
      expectedBirthDate: expectedBirth,
      pregnancyConfirmedAt: `${addCivilDays(ovulation, 21)}T10:00:00.000Z`,
    });
    const litterB = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: `E2E frise B ${label}`,
      status: "mating_done",
      matingDate: addCivilDays(today, -10),
      expectedBirthDate: addCivilDays(today, 50),
    });
    const litterCivil = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E frise civile ${label}`,
      status: "birth_expected",
      expectedBirthDate: addCivilDays(today, 30),
    });
    const sameDay = "2026-05-20";
    const sharedBirth = "2026-07-22";
    const litterOverlap = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      fatherId: father,
      name: `E2E frise overlap ${label}`,
      status: "born",
      estimatedOvulationDate: sameDay,
      matingDate: sameDay,
      matingDate2: sameDay,
      expectedBirthDate: sharedBirth,
      actualBirthDate: sharedBirth,
      pregnancyConfirmedAt: "2026-06-02",
    });
    const litterPeriod = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E frise période ${label}`,
      status: "birth_expected",
      estimatedOvulationDate: "2026-07-01",
      matingDate: "2026-07-03",
      expectedBirthDate: "2026-09-01",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterPeriod,
      title: `E2E hors période ${label}`,
      day: "2026-08-10",
      category: "veterinary",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterOverlap,
      title: `E2E overlap tâche ${label}`,
      day: sameDay,
      category: "preparation",
    });

    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E jalon frise ${label}`,
      day: addCivilDays(ovulation, 28),
      itemKind: "milestone",
      category: "preparation",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E tâche frise ${label}`,
      day: today,
      category: "veterinary",
      scheduleSource: "suggested",
    });
    const adjustedId = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E ajustée frise ${label}`,
      day: addCivilDays(today, 1),
      category: "maternal_health",
      scheduleSource: "manual",
    });
    sql(`
      update public.litter_care_tasks
      set is_schedule_locked = true,
          schedule_locked_at = '2026-01-01T09:00:00Z',
          schedule_locked_by = '${ownerId}'
      where id = '${adjustedId}';
    `);
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E récurrente 1 ${label}`,
      day: today,
      itemKind: "recurring_task",
      category: "offspring_weight",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E récurrente 2 ${label}`,
      day: addCivilDays(today, 7),
      itemKind: "recurring_task",
      category: "offspring_weight",
    });
    await createPlannedLitterCareWindow(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E fenêtre frise ${label}`,
      day: windowStart,
      startsOn: windowStart,
      endsOn: windowEnd,
      category: "veterinary",
      scheduleSource: "manual",
    });
    await createResolvedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E réalisée frise ${label}`,
      day: addCivilDays(today, -2),
      category: "identification",
      resolvedAt: "2026-06-01T22:30:00.000Z",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E annulée frise ${label}`,
      day: addCivilDays(today, 2),
      category: "other",
    });
    sql(`
      update public.litter_care_tasks
      set status = 'cancelled',
          resolution_command_id = gen_random_uuid(),
          resolved_at = now(),
          resolved_timezone_name = 'Europe/Paris',
          resolved_by = '${ownerId}'
      where title = 'E2E annulée frise ${label}';
    `);
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E chevauche A ${label}`,
      day: today,
      category: "socialization",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterA,
      title: `E2E chevauche B ${label}`,
      day: today,
      category: "socialization",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterB,
      title: `E2E tâche portée B ${label}`,
      day: today,
      category: "veterinary",
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litterCivil,
      title: `E2E tâche civile ${label}`,
      day: today,
      category: "preparation",
    });

    await login(page);

    await page.goto(`/litters/journal/calendar?litter=${litterA}&view=timeline`);
    await page.waitForURL((url) =>
      url.pathname === "/litters/journal/calendar" &&
      url.searchParams.get("view") === "timeline" &&
      url.searchParams.get("litter") === litterA,
    );

    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Choix de la vue" }).getByRole("link", { name: "Frise", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("En-tête biologique de la frise")).toContainText(
      `E2E mère frise ${label} × E2E père frise ${label}`,
    );
    await expect(page.getByLabel("En-tête biologique de la frise")).toContainText(
      "Gestation confirmée",
    );
    await expect(page.locator("[data-timeline-anchor-message]")).toContainText(
      "ovulation estimée",
    );
    await expect(page.locator("[data-timeline-bio-day='J0']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-bio-day='J7']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-bio-day='J63']")).toHaveCount(1);
    for (const week of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"]) {
      await expect(page.locator(`[data-timeline-week='${week}']`)).toHaveCount(1);
    }
    await expect(page.locator("[data-timeline-marker='estimated_ovulation']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-marker='first_mating']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-marker='second_mating']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-marker='expected_birth']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-today-line]")).toHaveCount(1);
    await assertTodayLineAligned(page, today);
    await page.locator("[data-timeline-grid]").evaluate((node) => {
      node.scrollLeft = Math.min(240, node.scrollWidth - node.clientWidth);
    });
    await assertTodayLineAligned(page, today);
    await page.locator("[data-timeline-grid]").evaluate((node) => {
      node.scrollLeft = 0;
    });
    const shell = page.locator("[data-collapsed]");
    await page.getByRole("button", { name: "Replier la navigation" }).click();
    await expect(shell).toHaveAttribute("data-collapsed", "true");
    await assertTodayLineAligned(page, today);
    await page.getByRole("button", { name: "Déplier la navigation" }).click();
    await expect(shell).toHaveAttribute("data-collapsed", "false");
    await assertTodayLineAligned(page, today);

    await expect(
      page.locator("[data-timeline-status='done']"),
    ).toHaveAttribute("aria-label", /réalisée le 2 juin 2026/);

    const categoryOrder = await page.locator("[data-timeline-category]").evaluateAll(
      (nodes) => nodes.map((node) => node.getAttribute("data-timeline-category")),
    );
    expect(categoryOrder.indexOf("maternal_health")).toBeLessThan(
      categoryOrder.indexOf("veterinary") === -1
        ? Number.POSITIVE_INFINITY
        : categoryOrder.indexOf("veterinary"),
    );
    expect(categoryOrder.indexOf("veterinary")).toBeLessThan(
      categoryOrder.indexOf("preparation") === -1
        ? Number.POSITIVE_INFINITY
        : categoryOrder.indexOf("preparation"),
    );

    await expect(page.locator("[data-timeline-kind='milestone']")).toContainText(
      `E2E jalon frise ${label}`,
    );
    await expect(page.locator("[data-timeline-kind='window']")).toContainText(
      `E2E fenêtre frise ${label}`,
    );
    await expect(page.locator("[data-timeline-kind='recurring_task']")).toHaveCount(2);
    await expect(
      page.locator("[data-timeline-schedule='manual'][data-timeline-locked='true']"),
    ).toContainText("Ajustée");
    await expect(page.locator("[data-timeline-status='done']")).toContainText("✓");
    await expect(page.locator("[data-timeline-status='cancelled']")).toContainText(
      `E2E annulée frise ${label}`,
    );

    const socialItems = page.locator(
      "[data-timeline-category='socialization'] [data-timeline-item]",
    );
    await expect(socialItems).toHaveCount(2);
    const lanes = await socialItems.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).gridRowStart),
    );
    expect(new Set(lanes).size).toBe(2);

    await page.getByRole("link", { name: "9 semaines" }).click();
    await page.waitForURL((url) => url.searchParams.get("zoom") === "gestation");
    await expect(page.locator("[data-timeline-bio-day='J0']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-bio-day='J63']")).toHaveCount(1);

    await page.getByRole("link", { name: "4 semaines" }).click();
    await page.waitForURL((url) => url.searchParams.get("zoom") === "four_weeks");
    await page.getByRole("link", { name: "Précédent" }).click();
    await page.waitForURL((url) => url.searchParams.has("date"));
    await page.getByRole("link", { name: "Suivant" }).click();
    await page.getByRole("link", { name: "Aujourd’hui" }).click();

    await page.getByRole("link", { name: "Cette semaine" }).click();
    await page.waitForURL((url) => url.searchParams.get("zoom") === "week");

    await page.getByRole("link", { name: "Cycle complet" }).click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("view") === "timeline" &&
        !url.searchParams.has("zoom"),
    );

    await page.getByLabel("Catégorie").selectOption("other");
    await page.getByRole("button", { name: "Appliquer" }).click();
    await page.waitForURL((url) => url.searchParams.get("category") === "other");
    await expect(page.locator("[data-timeline-status='cancelled']")).toHaveCount(1);
    await expect(page.locator("[data-timeline-kind='milestone']")).toHaveCount(0);

    await page.getByRole("link", { name: "Réinitialiser" }).click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("view") === "timeline" &&
        !url.searchParams.has("category"),
    );

    const journalLink = page
      .locator("[data-timeline-item]")
      .filter({ hasText: `E2E tâche frise ${label}` })
      .first();
    await expect(journalLink).toHaveAttribute(
      "href",
      `/litters/journal?litter=${litterA}#litter-care-tasks`,
    );

    await page.getByLabel("Portée affichée").selectOption(litterB);
    await page.waitForURL(
      (url) =>
        url.searchParams.get("litter") === litterB &&
        url.searchParams.get("view") === "timeline",
    );
    await expect(page.locator("[data-timeline-anchor-message]")).toContainText(
      "première saillie",
    );
    await expect(
      page.locator("[data-timeline-item]").filter({ hasText: `E2E tâche portée B ${label}` }),
    ).toHaveCount(1);

    await page.goto(
      `/litters/journal/calendar?litter=${litterCivil}&view=timeline`,
    );
    await expect(page.locator("[data-timeline-anchor-message]")).toContainText(
      "Repère biologique J0 indisponible",
    );
    await expect(page.locator("[data-timeline-bio-day='J0']")).toHaveCount(0);
    await expect(
      page.locator("[data-timeline-item]").filter({ hasText: `E2E tâche civile ${label}` }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Niveaux de zoom de la frise" }).getByText("9 semaines"),
    ).toHaveAttribute("aria-disabled", "true");

    await page.goto(
      `/litters/journal/calendar?litter=${litterOverlap}&view=timeline&zoom=gestation`,
    );
    await assertMarkersNotStacked(page, sameDay, 3);
    await assertMarkersNotStacked(page, sharedBirth, 2);
    await expect(page.locator("[data-timeline-marker='pregnancy_confirmed']")).toHaveAttribute(
      "aria-label",
      /Confirmation de gestation le 2026-06-02/,
    );

    await page.goto(
      `/litters/journal/calendar?litter=${litterPeriod}&view=timeline&zoom=week&date=2026-09-15&kind=task&category=veterinary`,
    );
    await expect(page.locator("[data-timeline-empty-period]")).toContainText(
      "Aucun élément ne se trouve dans la période affichée.",
    );
    await expect(page.locator("[data-timeline-item]")).toHaveCount(0);
    await expect(page.locator("[data-timeline-bio-day='J0']")).toHaveCount(0);

    await page.goto("/calendar");
    const friseLink = page.getByRole("link", {
      name: "Ouvrir la frise d’une portée",
    });
    await expect(friseLink).toBeVisible();
    await friseLink.click();
    await page.waitForURL((url) =>
      url.pathname === "/litters/journal/calendar" &&
      url.searchParams.get("view") === "timeline",
    );
    await expect(
      page.getByRole("navigation", { name: "Choix de la vue" }).getByRole("link", { name: "Frise", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/litters/journal/calendar?litter=${litterA}&view=timeline`);
    const grid = page.locator("[data-timeline-grid]");
    await expect(grid).toBeVisible();
    await assertTodayLineAligned(page, today);
    await grid.evaluate((node) => {
      node.scrollLeft = Math.min(180, node.scrollWidth - node.clientWidth);
    });
    await assertTodayLineAligned(page, today);
    const overflow = await page.evaluate(() => {
      const grid = document.querySelector("[data-timeline-grid]") as HTMLElement | null;
      return {
        body:
          document.body.scrollWidth <=
          document.documentElement.clientWidth + 1,
        gridScrollable: Boolean(
          grid && grid.scrollWidth > grid.clientWidth,
        ),
      };
    });
    expect(overflow.body).toBe(true);
    expect(overflow.gridScrollable).toBe(true);

    expect(sql("select count(*)::text from public.litter_care_tasks")).not.toBe(
      beforeTasks,
    );
  });

  expect(sql("select count(*)::text from public.litter_care_tasks")).toBe(
    beforeTasks,
  );
});
