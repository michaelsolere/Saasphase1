import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const animalId = "d0000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

test("keeps reservation and animal statuses coherent when assigning and unassigning", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const contactId = randomUUID();
  const reservationId = randomUUID();
  const suffix = reservationId.slice(0, 8);

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Attribution",
    last_name: `Coherence ${suffix}`,
    display_name: `Attribution Coherence ${suffix}`,
    email: `attribution-coherence-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: ownerId,
    updated_by: ownerId,
  });

  expect(contactError).toBeNull();

  const { error: reservationError } = await supabase.from("reservations").insert({
    id: reservationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    reserved_sex_preference: "female_only",
    status: "draft",
    created_by: ownerId,
    updated_by: ownerId,
  });

  expect(reservationError).toBeNull();

  const { error: animalResetError } = await supabase
    .from("animals")
    .update({ status: "available", updated_by: ownerId })
    .eq("id", animalId)
    .eq("organization_id", organizationId);

  expect(animalResetError).toBeNull();

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await page.getByLabel("Attribuer un animal").selectOption(animalId);
  await page.getByRole("button", { name: "Attribuer l’animal" }).click();
  await expect(page).toHaveURL(/animal_assign_status=success/);

  const assignedReservation = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id, animal_id, animal_assigned_at, status")
      .eq("id", reservationId)
      .single(),
    "read assigned reservation",
  );
  expect(assignedReservation).toMatchObject({
    id: reservationId,
    animal_id: animalId,
    status: "animal_assigned",
  });
  expect(assignedReservation?.animal_assigned_at).not.toBeNull();

  const reservedAnimal = expectSupabaseData(
    await supabase
      .from("animals")
      .select("id, status")
      .eq("id", animalId)
      .single(),
    "read reserved animal",
  );
  expect(reservedAnimal).toMatchObject({
    id: animalId,
    status: "reserved",
  });

  await page.goto(`/reservations/${reservationId}`);
  await page
    .getByRole("button", { name: "Retirer l’attribution" })
    .first()
    .click();
  await expect(page).toHaveURL(/animal_unassign_status=success/);

  const unassignedReservation = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id, animal_id, animal_assigned_at, status")
      .eq("id", reservationId)
      .single(),
    "read unassigned reservation",
  );
  expect(unassignedReservation).toMatchObject({
    id: reservationId,
    animal_id: null,
    animal_assigned_at: null,
    status: "animal_assigned",
  });

  const availableAnimal = expectSupabaseData(
    await supabase
      .from("animals")
      .select("id, status")
      .eq("id", animalId)
      .single(),
    "read available animal",
  );
  expect(availableAnimal).toMatchObject({
    id: animalId,
    status: "available",
  });
});
