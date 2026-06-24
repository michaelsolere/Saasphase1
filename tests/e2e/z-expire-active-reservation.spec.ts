import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

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
  const displayName = `Expiration Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Expiration",
    last_name: `Smoke ${suffix}`,
    display_name: displayName,
    email: `expiration-smoke-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create expiration contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test expiration",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à l'expiration manuelle d'une réservation active.",
    status: "qualified",
    submitted_at: "2026-04-05T10:00:00+00:00",
    reviewed_at: "2026-04-05T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create expiration application: ${applicationError.message}`);
  }

  return { applicationId, contactId, displayName };
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
    .getByRole("button", { name: "Créer une réservation brouillon" })
    .click();
  await expect(page).toHaveURL(/reservation_status=created/);

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

test("expires an active reservation manually without side effects", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { applicationId, contactId, displayName } =
    await createQualifiedApplicationFixture(supabase);

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

  const beforeExpiration = await readReservation(supabase, reservationId);
  expect(beforeExpiration.status).toBe("active");
  expect(beforeExpiration.adoption_completed_at).toBeNull();
  expect(beforeExpiration.application_id).toBe(applicationId);
  expect(beforeExpiration.contact_id).toBe(contactId);
  const paymentCountBefore = await countRows(supabase, "payments", reservationId);
  const documentCountBefore = await countRows(supabase, "documents", reservationId);
  const noteCountBefore = await countRows(supabase, "notes", reservationId);
  expect(paymentCountBefore).toBe(0);
  expect(documentCountBefore).toBe(0);
  expect(noteCountBefore).toBe(0);

  await expect(
    page.getByRole("button", { name: "Marquer comme expirée" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Cette action marque manuellement la réservation comme expirée. Elle ne crée aucun remboursement, ne modifie aucun paiement, ne crée ni document ni note, ne modifie pas l’animal, ne retire pas automatiquement l’attribution, ne modifie ni tarif, ni commentaire, ni échéance, et ne lance aucune automatisation liée à l’échéance de pré-réservation.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Marquer comme expirée" }).click();
  await expect(page).toHaveURL(/expiration_status=success/);
  await expect(page.getByText("Réservation marquée comme expirée.")).toBeVisible();
  await expect(page.getByText("Expirée", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marquer comme expirée" }),
  ).toHaveCount(0);

  const afterExpiration = await readReservation(supabase, reservationId);
  expect(afterExpiration.status).toBe("expired");
  expect(afterExpiration.updated_by).not.toBeNull();
  expect(afterExpiration.updated_at).not.toBe(beforeExpiration.updated_at);
  expect(afterExpiration.reservation_confirmed_at).toBe(
    beforeExpiration.reservation_confirmed_at,
  );
  expect(afterExpiration.adoption_completed_at).toBeNull();
  expect(afterExpiration.animal_id).toBe(beforeExpiration.animal_id);
  expect(afterExpiration.animal_assigned_at).toBe(
    beforeExpiration.animal_assigned_at,
  );
  expect(afterExpiration.pre_reservation_deadline).toBe(
    beforeExpiration.pre_reservation_deadline,
  );
  expect(afterExpiration.price_cents).toBe(beforeExpiration.price_cents);
  expect(afterExpiration.internal_comment).toBe(
    beforeExpiration.internal_comment,
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
});
