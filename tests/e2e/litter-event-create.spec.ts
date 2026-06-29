import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createAuthenticatedSupabaseClient } from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

test("creates a manual event from a litter detail page", async ({ page }) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const litterId = randomUUID();
  const suffix = litterId.slice(0, 8);
  const eventTitle = `Evenement portee e2e ${suffix}`;

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
  await expect(eventsSection.getByRole("heading", { name: "Événements liés" })).toBeVisible();
  await expect(eventsSection.getByRole("heading", { name: "Ajouter un événement" })).toBeVisible();

  await eventsSection.locator("#litter-event-title").fill(eventTitle);
  await eventsSection.locator("#litter-event-date").fill("2026-06-29");
  await eventsSection.locator("#litter-event-type").selectOption("ultrasound");
  await eventsSection.locator("#litter-event-status").selectOption("planned");
  await eventsSection.locator("#litter-event-priority").selectOption("normal");
  await eventsSection
    .locator("#litter-event-description")
    .fill("Evenement cree depuis le test e2e.");

  await eventsSection.getByRole("button", { name: "Ajouter l’événement" }).click();

  await expect(page).toHaveURL(new RegExp(`/litters/${litterId}.*event_status=success`));
  await expect(page).toHaveURL(/#evenements-lies/);
  await expect(eventsSection).toContainText("L’événement a été ajouté à cette portée.");
  await expect(eventsSection).toContainText(eventTitle);
  await expect(eventsSection).toContainText("Type : ultrasound");
  await expect(eventsSection).toContainText("planned");
  await expect(eventsSection).toContainText("Priorité : normal");
  await expect(eventsSection).toContainText("Date utile : 29 juin 2026");
  await expect(eventsSection).toContainText("Evenement cree depuis le test e2e.");
});
