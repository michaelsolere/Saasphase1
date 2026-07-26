import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import {
  createPlannedLitterCareTask,
  createPlannedLitterCareWindow,
  createResolvedLitterCareTask,
  createTestAnimal,
  createTestLitter,
  createTestOrganization,
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
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
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

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

async function login(page: Page, email = E2E_OWNER_EMAIL, password = E2E_OWNER_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function todayPanel(page: Page) {
  return page.locator("#breeding-today-heading").locator("xpath=ancestor::section[1]");
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

function restoreOwnerRole() {
  setOwnerRole("owner");
  expect(
    sql(`
      select count(*)::text from public.memberships
      where id = ${q(ownerMembershipId)}::uuid
        and role = 'owner'
        and status = 'active';
    `),
  ).toBe("1");
}

test("vue Aujourd’hui globale : agrégation, actions et isolation", async ({ page }) => {
  restoreOwnerRole();

  await withE2eFixtures(sql, async (fixtures) => {
    const label = fixtures.namespace.slice(-8);
    const today = formatLitterJournalBusinessDate(new Date());
    const yesterday = addCivilDays(today, -1);
    const tomorrow = addCivilDays(today, 1);

    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E mère today ${label}`,
    });
    const alpha = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E Alpha Today ${label}`,
    });
    const bravo = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E Bravo Today ${label}`,
    });

    const dueTitle = `E2E due ${label}`;
    const overdueTitle = `E2E overdue ${label}`;
    const windowTitle = `E2E window ${label}`;
    const handledTitle = `E2E handled ${label}`;
    const notApplicableTitle = `E2E na ${label}`;
    const rescheduleTitle = `E2E report ${label}`;
    const staleTitle = `E2E stale ${label}`;
    const foreignTitle = `E2E foreign secret ${label}`;

    const dueTask = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: alpha,
      day: today,
      title: dueTitle,
      suggestedFor: today,
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: bravo,
      day: yesterday,
      title: overdueTitle,
    });
    await createPlannedLitterCareWindow(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: bravo,
      day: today,
      startsOn: today,
      endsOn: today,
      title: windowTitle,
    });
    await createResolvedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: alpha,
      day: today,
      title: handledTitle,
    });
    const notApplicableTask = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: bravo,
      day: today,
      title: notApplicableTitle,
    });
    const rescheduleTask = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: alpha,
      day: today,
      title: rescheduleTitle,
      source: "system_template",
      systemTemplateCode: `today-global-reschedule-${label}`,
      anchorType: "expected_birth",
      anchorDate: today,
      offsetDays: 0,
      suggestedFor: today,
    });
    const staleTask = await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: bravo,
      day: today,
      title: staleTitle,
      source: "system_template",
      systemTemplateCode: `today-global-stale-${label}`,
      anchorType: "expected_birth",
      anchorDate: today,
      offsetDays: 0,
      suggestedFor: today,
      revisionNo: 0,
    });

    const foreignOrg = await createTestOrganization(sql, fixtures);
    const foreignMother = await createTestAnimal(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      callName: `E2E mère étrangère ${label}`,
    });
    const foreignLitter = await createTestLitter(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      motherId: foreignMother,
      name: `E2E étrangère Today ${label}`,
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId: foreignOrg,
      ownerId,
      litterId: foreignLitter,
      day: today,
      title: foreignTitle,
    });

    const beforeLoad = sql("select count(*)::text from public.litter_care_tasks");

    await login(page);
    await page.goto("/calendar");
    await page.getByRole("navigation", { name: "Choix de la vue" }).getByRole("link", { name: "Aujourd’hui" }).click();
    await expect(page).toHaveURL(/\/calendar\/today$/);
    expect(sql("select count(*)::text from public.litter_care_tasks")).toBe(beforeLoad);

    const panel = todayPanel(page);
    await expect(panel.getByText(dueTitle)).toBeVisible();
    await expect(panel.getByText(overdueTitle)).toBeVisible();
    await expect(panel.getByText(windowTitle)).toBeVisible();
    await expect(panel.getByText(handledTitle)).toBeVisible();
    await expect(panel.getByText(foreignTitle)).toHaveCount(0);
    await expect(panel.getByText(foreignLitter)).toHaveCount(0);

    const dueSection = panel.locator("section[aria-label='À faire aujourd’hui']");
    const overdueSection = panel.locator("section[aria-label='En retard']");
    const windowSection = panel.locator("section[aria-label='Fenêtres ouvertes']");
    const handledSection = panel.locator("section[aria-label='Traité aujourd’hui']");

    await expect(dueSection.getByText(dueTitle)).toBeVisible();
    await expect(overdueSection.getByText(overdueTitle)).toBeVisible();
    await expect(windowSection.getByText(windowTitle)).toBeVisible();
    await expect(handledSection.getByText(handledTitle)).toBeVisible();

    const dueCard = dueSection.locator("li").filter({ hasText: dueTitle });
    await expect(dueCard.getByText(`Portée E2E Alpha Today ${label}`)).toBeVisible();
    await expect(dueCard.getByRole("link", { name: "Ouvrir le Journal" })).toHaveAttribute(
      "href",
      `/litters/journal?litter=${alpha}`,
    );

    const journalResponse = await page.request.get(`/litters/journal?litter=${alpha}`);
    expect(journalResponse.status()).toBe(200);

    await dueCard.getByRole("button", { name: "Marquer comme réalisé" }).click();
    await expect(dueSection.getByText(dueTitle)).toHaveCount(0);
    await expect(handledSection.getByText(dueTitle)).toBeVisible();
    expect(
      sql(`select count(*)::text from public.litter_care_tasks where id = ${q(dueTask)}::uuid and status = 'done';`),
    ).toBe("1");
    expect(
      sql(`select count(*)::text from public.litter_care_tasks where id = ${q(dueTask)}::uuid;`),
    ).toBe("1");

    const naCard = dueSection.locator("li").filter({ hasText: notApplicableTitle });
    await naCard.getByRole("button", { name: "Non applicable" }).click();
    const naDialog = page.getByRole("alertdialog");
    await expect(naDialog).toContainText(notApplicableTitle);
    await naDialog.getByRole("button", { name: "Confirmer" }).click();
    await expect(naDialog).toBeHidden();
    await expect(panel.getByText(notApplicableTitle)).toBeVisible();
    expect(
      JSON.parse(
        sql(`
          select json_build_object('status', status, 'note', resolution_note)::text
          from public.litter_care_tasks where id = ${q(notApplicableTask)}::uuid;
        `),
      ),
    ).toMatchObject({ status: "not_applicable" });

    const rescheduleCard = dueSection.locator("li").filter({ hasText: rescheduleTitle });
    await rescheduleCard.getByRole("button", { name: "Reporter" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Date suggérée : ${formatCivilDate(today)}`);
    await dialog.getByLabel("Date retenue").fill(tomorrow);
    await dialog.getByLabel("Motif (facultatif)").fill("Report depuis Aujourd’hui global");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByText(rescheduleTitle)).toHaveCount(0);
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'suggested', suggested_for::text,
            'planned', planned_for::text,
            'source', schedule_source,
            'revision', revision_no
          )::text
          from public.litter_care_tasks where id = ${q(rescheduleTask)}::uuid;
        `),
      ),
    ).toEqual({
      suggested: today,
      planned: tomorrow,
      source: "manual",
      revision: 1,
    });
    expect(
      sql(`
        select count(*)::text from public.litter_care_task_schedule_changes
        where task_id = ${q(rescheduleTask)}::uuid and change_type = 'reschedule_point';
      `),
    ).toBe("1");

    const staleCard = dueSection.locator("li").filter({ hasText: staleTitle });
    await staleCard.getByRole("button", { name: "Reporter" }).click();
    dialog = page.getByRole("dialog");
    sql(`update public.litter_care_tasks set revision_no = 2 where id = ${q(staleTask)}::uuid;`);
    await dialog.getByLabel("Date retenue").fill(tomorrow);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog.getByRole("alert")).toContainText("révision est périmée");
    expect(
      JSON.parse(
        sql(`
          select json_build_object('planned', planned_for::text, 'revision', revision_no)::text
          from public.litter_care_tasks where id = ${q(staleTask)}::uuid;
        `),
      ),
    ).toEqual({ planned: today, revision: 2 });
    await dialog.getByRole("button", { name: "Annuler" }).click();

    setOwnerRole("viewer");
    await page.goto("/calendar/today");
    const viewerPanel = todayPanel(page);
    await expect(viewerPanel.getByText(overdueTitle)).toBeVisible();
    await expect(viewerPanel.getByRole("button", { name: "Marquer comme réalisé" })).toHaveCount(0);
    await expect(viewerPanel.getByRole("button", { name: "Non applicable" })).toHaveCount(0);
    await expect(viewerPanel.getByRole("button", { name: "Reporter" })).toHaveCount(0);
    restoreOwnerRole();

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/calendar/today");
    await expect(todayPanel(page)).toBeVisible();
    const mobile = await page.evaluate(() => {
      const body = document.body;
      const doc = document.documentElement;
      return {
        viewportWidth: window.innerWidth,
        bodyClientWidth: body.clientWidth,
        bodyScrollWidth: Math.max(body.scrollWidth, doc.scrollWidth),
      };
    });
    expect(mobile.viewportWidth).toBe(375);
    expect(mobile.bodyScrollWidth).toBeLessThanOrEqual(mobile.viewportWidth + 1);
  });

  restoreOwnerRole();
});

test("vue Aujourd’hui globale : état vide neutre", async ({ page }) => {
  restoreOwnerRole();
  await withE2eFixtures(sql, async (fixtures) => {
    const label = fixtures.namespace.slice(-8);
    const tomorrow = addCivilDays(formatLitterJournalBusinessDate(new Date()), 1);
    const mother = await createTestAnimal(sql, fixtures, {
      organizationId,
      ownerId,
      callName: `E2E mère vide ${label}`,
    });
    const litter = await createTestLitter(sql, fixtures, {
      organizationId,
      ownerId,
      motherId: mother,
      name: `E2E Vide Today ${label}`,
    });
    await createPlannedLitterCareTask(sql, fixtures, {
      organizationId,
      ownerId,
      litterId: litter,
      day: tomorrow,
      title: `E2E future only ${label}`,
    });

    await login(page);
    await page.goto("/calendar/today");
    const panel = todayPanel(page);
    await expect(panel.getByText(`E2E future only ${label}`)).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(
      page.getByText("Vue Aujourd’hui momentanément indisponible"),
    ).toHaveCount(0);
  });
});
