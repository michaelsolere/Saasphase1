import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";
import { openDialog } from "./helpers/dialogs";

const organizationId = "20000000-0000-4000-8000-000000000001";

async function createQualifiedApplicationFixture(supabase: SupabaseTestClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const contactId = randomUUID();
  const applicationId = randomUUID();
  const suffix = applicationId.slice(0, 8);
  const displayName = `Adoption Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Adoption",
    last_name: `Smoke ${suffix}`,
    call_name: displayName,
    email: `adoption-smoke-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create adoption contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test adoption",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à la finalisation manuelle d'une réservation active.",
    status: "qualified",
    submitted_at: "2026-04-02T10:00:00+00:00",
    reviewed_at: "2026-04-02T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create adoption application: ${applicationError.message}`);
  }

  return { applicationId, contactId, displayName };
}

async function createAvailableAnimalFixture(supabase: SupabaseTestClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const animalId = randomUUID();
  const suffix = animalId.slice(0, 8);
  const displayName = `Adoption Animal ${suffix}`;

  const { error: animalError } = await supabase.from("animals").insert({
    id: animalId,
    organization_id: organizationId,
    species: "dog",
    breed: "Golden Retriever",
    call_name: displayName,
    sex: "male",
    status: "available",
    ownership_status: "produced",
    created_by: user.id,
    updated_by: user.id,
  });

  if (animalError) {
    throw new Error(`create adoption animal: ${animalError.message}`);
  }

  return { animalId, displayName };
}

async function findReservationForApplication(
  supabase: SupabaseTestClient,
  applicationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id, status")
      .eq("application_id", applicationId)
      .is("deleted_at", null)
      .maybeSingle(),
    "find reservation for application",
  );
}

async function readReservation(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservations")
      .select(
        "id, status, adoption_completed_at, reservation_confirmed_at, animal_id, animal_assigned_at, updated_at, updated_by, price_cents, internal_comment, pre_reservation_deadline, application_id, contact_id",
      )
      .eq("id", reservationId)
      .is("deleted_at", null)
      .single(),
    "read reservation",
  );
}

async function readAnimal(supabase: SupabaseTestClient, animalId: string) {
  return expectSupabaseData(
    await supabase
      .from("animals")
      .select("id, status, ownership_status")
      .eq("id", animalId)
      .is("deleted_at", null)
      .single(),
    "read animal",
  );
}

async function countRows(
  supabase: SupabaseTestClient,
  table: "documents" | "notes" | "payments",
  reservationId: string,
) {
  const result = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", reservationId);

  if (result.error) {
    throw new Error(`count ${table}: ${result.error.message}`);
  }

  return result.count ?? 0;
}

async function createDraftReservation(
  page: Page,
  supabase: SupabaseTestClient,
  applicationId: string,
) {
  await page.goto(`/candidatures/${applicationId}`);
  await page
    .getByRole("button", { name: "Créer une demande de pré-réservation" })
    .click();
  await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]+|reservation_status=created/);

  return await expect
    .poll(async () => {
      const reservation = await findReservationForApplication(
        supabase,
        applicationId,
      );
      return reservation?.id ?? null;
    })
    .not.toBeNull()
    .then(async () => {
      const reservation = await findReservationForApplication(
        supabase,
        applicationId,
      );

      if (!reservation) {
        throw new Error("Created reservation was not found");
      }

      return reservation.id;
    });
}

test("adopts an animal-assigned reservation manually without side effects", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { applicationId, contactId, displayName } =
    await createQualifiedApplicationFixture(supabase);
  const { animalId, displayName: animalDisplayName } =
    await createAvailableAnimalFixture(supabase);

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/candidatures/${applicationId}`);
  await expect(page.getByRole("heading", { name: displayName })).toBeVisible();

  const reservationId = await createDraftReservation(
    page,
    supabase,
    applicationId,
  );

  await page.goto(`/reservations/${reservationId}`);
  await page.getByRole("button", { name: "Confirmer la réservation" }).click();
  await expect(page).toHaveURL(/activation_status=success/);
  await expect(page.getByText("La réservation a été confirmée.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finaliser l’adoption" }),
  ).toHaveCount(0);

  const scopeAndAnimal = page.locator("#scope-and-animal");
  await scopeAndAnimal.locator('select[name="animal_id"]').selectOption(animalId);
  await scopeAndAnimal.getByRole("button", { name: "Attribuer l’animal" }).click();
  await expect(page).toHaveURL(/animal_assign_status=success/);
  await expect(page.getByText("L’animal a été attribué à la réservation.")).toBeVisible();
  await expect(
    page.locator("#adoption-preparation").getByText(animalDisplayName),
  ).toBeVisible();

  const beforeAdoption = await readReservation(supabase, reservationId);
  expect(beforeAdoption.status).toBe("animal_assigned");
  expect(beforeAdoption.adoption_completed_at).toBeNull();
  expect(beforeAdoption.application_id).toBe(applicationId);
  expect(beforeAdoption.contact_id).toBe(contactId);
  expect(beforeAdoption.animal_id).toBe(animalId);
  expect(beforeAdoption.animal_assigned_at).not.toBeNull();
  const animalBeforeAdoption = await readAnimal(supabase, animalId);
  expect(animalBeforeAdoption.status).toBe("reserved");
  expect(animalBeforeAdoption.ownership_status).toBe("produced");
  const paymentCountBefore = await countRows(supabase, "payments", reservationId);
  const documentCountBefore = await countRows(supabase, "documents", reservationId);
  const noteCountBefore = await countRows(supabase, "notes", reservationId);
  expect(paymentCountBefore).toBe(0);
  expect(documentCountBefore).toBe(0);
  expect(noteCountBefore).toBe(0);

  await expect(
    page.getByRole("heading", { name: "Préparation adoption / départ" }),
  ).toBeVisible();
  const adoptionPreparation = page.locator("#adoption-preparation");
  await expect(adoptionPreparation.getByText("Animal attribué")).toBeVisible();
  await expect(
    adoptionPreparation.getByText("Versement de pré-réservation — 250 €"),
  ).toBeVisible();
  await expect(
    adoptionPreparation.getByText("Complément 2/2 — 250 €"),
  ).toBeVisible();
  await expect(
    adoptionPreparation.getByRole("heading", { name: "Documents à vérifier" }),
  ).toBeVisible();
  await expect(
    adoptionPreparation.getByText(
      "Documents à vérifier : certificat d’engagement, contrat de réservation.",
    ),
  ).toBeVisible();
  await expect(adoptionPreparation.getByText("Points à vérifier manuellement")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finaliser l’adoption" }).first()).toBeVisible();
  await expect(
    page.getByText(
      "Cette action finalise manuellement l’adoption. Elle ne crée ni paiement, ni document, ni note, ni modification d’animal.",
    ),
  ).toHaveCount(0);

  await openDialog(
    page.getByRole("button", { name: "Finaliser l’adoption" }).first(),
    page.getByRole("heading", { name: "Finaliser l’adoption ?" }),
  );
  await expect(
    page.getByText(
      "Cette action marque la réservation comme adoptée et l’animal comme adopté. Elle ne crée aucun paiement, document, email, facture ou signature. Vérifiez manuellement que le solde, les documents et la date de départ sont corrects.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmer la finalisation" }).click();
  await expect(page).toHaveURL(/adoption_status=success/);
  await expect(page.getByText("L’adoption a été finalisée.")).toBeVisible();
  await expect(
    page.locator("#dossier-summary").getByText("Adopté", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finaliser l’adoption" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Enregistrer un encaissement" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Enregistrer un remboursement" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enregistrer le tarif" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retirer l’attribution" })).toHaveCount(0);

  const afterAdoption = await readReservation(supabase, reservationId);
  expect(afterAdoption.status).toBe("adopted");
  expect(afterAdoption.adoption_completed_at).not.toBeNull();
  expect(afterAdoption.updated_by).not.toBeNull();
  expect(afterAdoption.updated_at).not.toBe(beforeAdoption.updated_at);
  expect(afterAdoption.reservation_confirmed_at).toBe(
    beforeAdoption.reservation_confirmed_at,
  );
  expect(afterAdoption.animal_id).toBe(beforeAdoption.animal_id);
  expect(afterAdoption.animal_assigned_at).toBe(
    beforeAdoption.animal_assigned_at,
  );
  expect(afterAdoption.price_cents).toBe(beforeAdoption.price_cents);
  expect(afterAdoption.internal_comment).toBe(beforeAdoption.internal_comment);
  expect(afterAdoption.pre_reservation_deadline).toBe(
    beforeAdoption.pre_reservation_deadline,
  );
  expect(await countRows(supabase, "payments", reservationId)).toBe(
    paymentCountBefore,
  );
  expect(await countRows(supabase, "documents", reservationId)).toBe(
    documentCountBefore,
  );
  expect(await countRows(supabase, "notes", reservationId)).toBe(
    noteCountBefore,
  );

  const animalAfterAdoption = await readAnimal(supabase, animalId);
  expect(animalAfterAdoption.status).toBe("adopted");
  expect(animalAfterAdoption.ownership_status).toBe("adopted_out");
});
