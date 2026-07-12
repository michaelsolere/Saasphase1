import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createAuthenticatedSupabaseClient } from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

async function cleanupLitterEventFixture(litterId: string) {
  const supabase = await createAuthenticatedSupabaseClient();

  const { error: eventsError } = await supabase
    .from("events")
    .delete()
    .eq("litter_id", litterId);

  if (eventsError) {
    throw new Error(`cleanup litter events: ${eventsError.message}`);
  }

  const { error: litterError } = await supabase
    .from("litters")
    .delete()
    .eq("id", litterId);

  if (litterError) {
    throw new Error(`cleanup litter: ${litterError.message}`);
  }

  const eventsCount = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("litter_id", litterId);
  const litterCount = await supabase
    .from("litters")
    .select("id", { count: "exact", head: true })
    .eq("id", litterId);

  if (eventsCount.error) {
    throw new Error(`verify litter events cleanup: ${eventsCount.error.message}`);
  }

  if (litterCount.error) {
    throw new Error(`verify litter cleanup: ${litterCount.error.message}`);
  }

  if ((eventsCount.count ?? 0) !== 0 || (litterCount.count ?? 0) !== 0) {
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
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/litters/${litterId}#evenements-lies`);

    const eventsSection = page.locator("#evenements-lies");
    await expect(
      eventsSection.getByRole("heading", { name: "Événements liés" }),
    ).toBeVisible();
    await expect(
      eventsSection.getByRole("heading", { name: "Ajouter un événement" }),
    ).toBeVisible();

    await eventsSection.locator("#litter-event-title").fill(eventTitle);
    await eventsSection.locator("#litter-event-date").fill("2026-06-29");
    await eventsSection.locator("#litter-event-type").selectOption("ultrasound");
    await eventsSection.locator("#litter-event-status").selectOption("planned");
    await eventsSection.locator("#litter-event-priority").selectOption("normal");
    await eventsSection
      .locator("#litter-event-description")
      .fill("Evenement cree depuis le test e2e.");

    await eventsSection.getByRole("button", { name: "Ajouter l’événement" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/litters/${litterId}.*event_status=success`),
    );
    await expect(page).toHaveURL(/#evenements-lies/);
    await expect(eventsSection).toContainText("L’événement a été ajouté à cette portée.");
    await expect(eventsSection).toContainText(eventTitle);
    await expect(eventsSection).toContainText("Type : ultrasound");
    await expect(eventsSection).toContainText("planned");
    await expect(eventsSection).toContainText("Priorité : normal");
    await expect(eventsSection).toContainText("Date utile : 29 juin 2026");
    await expect(eventsSection).toContainText("Evenement cree depuis le test e2e.");
  } finally {
    await cleanupLitterEventFixture(litterId);
  }
});
