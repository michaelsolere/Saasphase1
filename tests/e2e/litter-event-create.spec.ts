import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

function runSql(sql: string) {
  return runE2eSqlSync(sql);
}

function cleanupLitterEventFixture(litterId: string) {
  runSql(`
    delete from public.events where litter_id = '${litterId}'::uuid;
    delete from public.litters where id = '${litterId}'::uuid;
  `);

  const remaining = Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.events where litter_id = '${litterId}'::uuid
        union all
        select id::text from public.litters where id = '${litterId}'::uuid
      ) remaining;
    `),
  );

  if (remaining !== 0) {
    throw new Error("cleanup litter event fixture: row(s) remain");
  }
}

test("creates a manual event from a litter detail page", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const litterId = randomUUID();
  const suffix = litterId.slice(0, 8);
  const eventTitle = `Evenement portee e2e ${suffix}`;

  try {
    const { error: litterError } = await supabase.from("litters").insert({
      id: litterId,
      organization_id: organizationId,
      name: `Portee evenement e2e ${suffix}`,
      species: "dog",
      breed: "Golden Retriever",
      status: "planned",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(litterError).toBeNull();

    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/litters/${litterId}#evenements-lies`);

    const eventsSection = page.locator("details#evenements-lies");
    await eventsSection.locator("summary").first().click();
    await expect(
      eventsSection.getByText("Aucun événement lié à cette portée."),
    ).toBeVisible();

    await eventsSection.getByText("Ajouter un événement").click();
    await eventsSection.locator("#litter-event-title").fill(eventTitle);
    await eventsSection.locator("#litter-event-date").fill("2026-06-29");
    await eventsSection.locator("#litter-event-type").selectOption("ultrasound");
    await eventsSection.locator("#litter-event-status").selectOption("planned");
    await eventsSection.locator("#litter-event-priority").selectOption("normal");
    await eventsSection
      .locator("#litter-event-description")
      .fill("Evenement cree depuis le test e2e.");

    await eventsSection.locator("form").evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    });

    await expect(page).toHaveURL(
      new RegExp(`/litters/${litterId}.*event_status=success`),
    );
    await expect(page).toHaveURL(/#evenements-lies/);
    await expect(eventsSection).toContainText("L’événement a été ajouté à cette portée.");
    await expect(eventsSection).toContainText(eventTitle);
    await expect(eventsSection).toContainText("Type : Échographie");
    await expect(eventsSection).toContainText("Planifié");
    await expect(eventsSection).toContainText("Priorité : Normale");
    await expect(eventsSection).toContainText("Date utile : 29 juin 2026");
    await expect(eventsSection).toContainText("Evenement cree depuis le test e2e.");
  } finally {
    cleanupLitterEventFixture(litterId);
  }
});
