import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  createPlanningFactLinkVisibilityFixtures,
  type PlanningFactLinkVisibilityFixtureIds,
} from "./helpers/fixtures/planning-fact-link-fixtures";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "d7290002-0000-4000-8000-";
const like = `${prefix}%`;
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

const automaticResolutionNote =
  "Action satisfaite automatiquement par une température maternelle enregistrée dans le Journal.";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function readFixtureState(ids: PlanningFactLinkVisibilityFixtureIds) {
  return sql(`
    select json_build_object(
      'links', (
        select count(*) from public.maternal_observation_task_links
        where litter_id = ${q(ids.litter)}::uuid
      ),
      'observations', (
        select count(*) from public.maternal_observations
        where litter_id = ${q(ids.litter)}::uuid
      ),
      'observationCommands', (
        select count(*) from public.maternal_observation_commands
        where litter_id = ${q(ids.litter)}::uuid
      ),
      'tasks', (
        select count(*) from public.litter_care_tasks
        where litter_id = ${q(ids.litter)}::uuid
      ),
      'taskState', (
        select json_agg(
          json_build_object(
            'id', id::text,
            'status', status,
            'resolvedAt', resolved_at,
            'resolutionCommandId', resolution_command_id::text,
            'resolutionNote', resolution_note
          )
          order by id
        )
        from public.litter_care_tasks
        where litter_id = ${q(ids.litter)}::uuid
      ),
      'planApplicationCommands', (
        select count(*) from public.litter_plan_application_commands
        where litter_id = ${q(ids.litter)}::uuid
      )
    )::text
  `);
}

function reservedPrefixCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'links', (
          select count(*) from public.maternal_observation_task_links
          where id::text like ${q(like)} or litter_id::text like ${q(like)}
        ),
        'observationCommands', (
          select count(*) from public.maternal_observation_commands
          where id::text like ${q(like)}
             or litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'observations', (
          select count(*) from public.maternal_observations
          where id::text like ${q(like)}
             or litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where id::text like ${q(like)} or litter_id::text like ${q(like)}
        ),
        'seriesSlots', (
          select count(*) from public.litter_plan_series_time_slots slot
          join public.litter_plan_series series on series.id = slot.series_id
          where series.litter_id::text like ${q(like)}
        ),
        'series', (
          select count(*) from public.litter_plan_series
          where litter_id::text like ${q(like)}
        ),
        'applicationCommands', (
          select count(*) from public.litter_plan_application_commands
          where litter_id::text like ${q(like)}
             or client_command_id::text like ${q(like)}
        ),
        'planItems', (
          select count(*) from public.litter_plan_items
          where litter_id::text like ${q(like)}
        ),
        'plans', (
          select count(*) from public.litter_plans
          where litter_id::text like ${q(like)}
        ),
        'modelSlots', (
          select count(*) from public.litter_planning_model_item_time_slots slot
          join public.litter_planning_model_items item on item.id = slot.model_item_id
          join public.litter_planning_models model on model.id = item.model_id
          where model.title = 'Modèle visibilité lien E2E'
        ),
        'modelCommands', (
          select count(*) from public.litter_planning_model_commands
          where client_command_id::text like ${q(like)}
        ),
        'modelItems', (
          select count(*) from public.litter_planning_model_items item
          join public.litter_planning_models model on model.id = item.model_id
          where model.title = 'Modèle visibilité lien E2E'
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where title = 'Modèle visibilité lien E2E'
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id::text like ${q(like)}
        ),
        'litters', (
          select count(*) from public.litters where id::text like ${q(like)}
        ),
        'animals', (
          select count(*) from public.animals where id::text like ${q(like)}
        )
      )::text
    `),
  ) as Record<string, number>;
}

function expectReservedPrefixAtZero() {
  for (const [table, count] of Object.entries(reservedPrefixCounts())) {
    expect(count, `${table} fixtures must be physically deleted`).toBe(0);
  }
}

function registerBrowserDiagnostics(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });
  return { pageErrors, consoleErrors, failedRequests };
}

test("rend visible la relation réciproque sans écriture ni identifiant interne", async ({
  page,
  browser,
}) => {
  expectReservedPrefixAtZero();
  const owner = await createAuthenticatedSupabaseClient();
  let fixtureIds: PlanningFactLinkVisibilityFixtureIds | null = null;
  const ownerDiagnostics = registerBrowserDiagnostics(page);

  try {
    await withE2eFixtures(
      sql,
      async (fixtures) => {
        const today = formatLitterJournalBusinessDate(new Date());
        const observedAt = new Date(`${today}T06:10:00.000Z`).toISOString();
        fixtureIds = await createPlanningFactLinkVisibilityFixtures(
          sql,
          fixtures,
          owner,
          {
            organizationId,
            ownerId,
            today,
            observedAt,
            prefix,
          },
        );
        const ids = fixtureIds;
        console.log(
          `PLANNING_FACT_LINK_VISIBILITY_01_FIXTURE_IDS=${JSON.stringify(ids)}`,
        );

        const stateBeforeReads = readFixtureState(ids);
        await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
        await page.goto(`/litters/journal?litter=${ids.litter}`);

        const taskPanel = page.locator("#litter-care-tasks");
        const linkedTaskCard = taskPanel
          .locator("li")
          .filter({ hasText: "Relever la température de la mère" });
        const manualTaskCard = taskPanel
          .locator("li")
          .filter({ hasText: "Tâche traitée manuellement" });

        await expect(linkedTaskCard).toContainText("Réalisée depuis le Journal");
        await expect(linkedTaskCard).toContainText(
          "Température maternelle enregistrée",
        );
        await expect(linkedTaskCard).toContainText("37,2 °C");
        await expect(linkedTaskCard).toContainText(
          "Appréciation saisie : Routine",
        );
        await expect(linkedTaskCard).toContainText(
          "Note de l’observation : Mesure factuelle liée E2E",
        );
        await expect(linkedTaskCard).not.toContainText("Traitement manuel");
        const maternalLink = linkedTaskCard.getByRole("link", {
          name: "Voir le suivi de la mère",
        });
        await expect(maternalLink).toHaveAttribute(
          "href",
          "#maternal-observations",
        );

        await expect(manualTaskCard).toContainText("Traitement manuel");
        await expect(manualTaskCard).toContainText(automaticResolutionNote);
        await expect(manualTaskCard).not.toContainText(
          "Réalisée depuis le Journal",
        );

        const litterToday = page
          .getByRole("heading", { name: "Aujourd’hui" })
          .locator("xpath=ancestor::section[1]");
        const handledToday = litterToday.locator(
          "section[aria-label='Traité aujourd’hui']",
        );
        const linkedTodayCard = handledToday
          .locator("li")
          .filter({ hasText: "Relever la température de la mère" });
        const manualTodayCard = handledToday
          .locator("li")
          .filter({ hasText: "Tâche traitée manuellement" });
        await expect(linkedTodayCard).toContainText(
          "Réalisée depuis le Journal",
        );
        await expect(linkedTodayCard).toContainText("37,2 °C");
        await expect(linkedTodayCard.getByRole("link", {
          name: "Voir le suivi de la mère",
        })).toHaveAttribute("href", "#maternal-observations");
        await expect(manualTodayCard).toContainText("Traitement manuel");
        await expect(manualTodayCard).not.toContainText(
          "Réalisée depuis le Journal",
        );

        const observationsPanel = page.locator("#maternal-observations");
        const linkedObservationCard = observationsPanel
          .locator("li")
          .filter({ hasText: "Mesure factuelle liée E2E" });
        const unlinkedObservationCard = observationsPanel
          .locator("li")
          .filter({ hasText: "Mesure Fahrenheit non liée E2E" });
        await expect(linkedObservationCard).toContainText(
          "Action planifiée réalisée",
        );
        await expect(linkedObservationCard).toContainText(
          "Relever la température de la mère",
        );
        await expect(linkedObservationCard).toContainText("Occurrence 1");
        await expect(linkedObservationCard).toContainText("Prévue le");
        await expect(unlinkedObservationCard).not.toContainText(
          "Action planifiée réalisée",
        );
        await expect(unlinkedObservationCard).toContainText("98,6 °F");

        await maternalLink.focus();
        await expect(maternalLink).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/#maternal-observations$/);

        await page.setViewportSize({ width: 375, height: 812 });
        await expect(taskPanel).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);

        const forbiddenIds = [
          ids.linkedObservation,
          ids.unlinkedObservation,
          ids.link,
          ids.resolutionCommand,
          ...ids.observationCommands,
        ];
        const journalHtml = await page.content();
        for (const internalId of forbiddenIds) {
          expect(journalHtml).not.toContain(internalId);
        }
        const hrefs = await page.locator("a").evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
        for (const internalId of forbiddenIds) {
          expect(hrefs.join("\n")).not.toContain(internalId);
        }

        await page.goto("/calendar/today");
        const breedingHandled = page.locator(
          "section[aria-label='Traité aujourd’hui']",
        );
        const breedingLinkedCard = breedingHandled
          .locator("li")
          .filter({ hasText: "Relever la température de la mère" });
        const breedingManualCard = breedingHandled
          .locator("li")
          .filter({ hasText: "Tâche traitée manuellement" });
        await expect(breedingLinkedCard).toContainText(
          "Réalisée depuis le Journal",
        );
        await expect(breedingLinkedCard).toContainText("37,2 °C");
        await expect(
          breedingLinkedCard.getByRole("link", { name: "Ouvrir le Journal" }),
        ).toHaveAttribute(
          "href",
          `/litters/journal?litter=${ids.litter}#maternal-observations`,
        );
        await expect(breedingManualCard).toContainText("Traitement manuel");
        await expect(
          breedingManualCard.getByRole("link", { name: "Ouvrir le Journal" }),
        ).toHaveAttribute("href", `/litters/journal?litter=${ids.litter}`);

        const viewerContext = await browser.newContext({
          viewport: { width: 375, height: 812 },
        });
        const viewerPage = await viewerContext.newPage();
        const viewerDiagnostics = registerBrowserDiagnostics(viewerPage);
        try {
          await login(viewerPage, E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD);
          await viewerPage.goto(`/litters/journal?litter=${ids.litter}`);
          await expect(
            viewerPage.getByText("Réalisée depuis le Journal").first(),
          ).toBeVisible();
          await expect(
            viewerPage.getByText("Traitement manuel").first(),
          ).toBeVisible();
          await expect(
            viewerPage.getByText("Action planifiée réalisée").first(),
          ).toBeVisible();
          await expect(
            viewerPage.getByRole("button", {
              name: "Ajouter une observation",
            }),
          ).toHaveCount(0);
          await expect(
            viewerPage.getByRole("button", { name: "Traiter la tâche" }),
          ).toHaveCount(0);
          expect(
            await viewerPage.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          expect(viewerDiagnostics.pageErrors).toEqual([]);
          expect(viewerDiagnostics.consoleErrors).toEqual([]);
          expect(viewerDiagnostics.failedRequests).toEqual([]);
        } finally {
          await viewerContext.close();
        }

        expect(readFixtureState(ids)).toBe(stateBeforeReads);
        expect(ownerDiagnostics.pageErrors).toEqual([]);
        expect(ownerDiagnostics.consoleErrors).toEqual([]);
        expect(ownerDiagnostics.failedRequests).toEqual([]);
      },
      "PLANNING-FACT-LINK-VISIBILITY-01",
    );
  } finally {
    await owner.auth.signOut();
  }

  expectReservedPrefixAtZero();
});
