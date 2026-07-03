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
  const displayName = `Cancellation Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Cancellation",
    last_name: `Smoke ${suffix}`,
    display_name: displayName,
    email: `cancellation-smoke-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create cancellation contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test cancellation",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à l'annulation manuelle d'une réservation active.",
    status: "qualified",
    submitted_at: "2026-04-03T10:00:00+00:00",
    reviewed_at: "2026-04-03T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create cancellation application: ${applicationError.message}`);
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
    .getByRole("button", { name: "Créer une demande de pré-réservation" })
    .click();
  await expect(page).toHaveURL(
    /(reservation_status=created|\/reservations\/[0-9a-f-]{36})/,
  );

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

test("cancels an active reservation manually without side effects", async ({
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

  const beforeCancellation = await readReservation(supabase, reservationId);
  expect(beforeCancellation.status).toBe("active");
  expect(beforeCancellation.adoption_completed_at).toBeNull();
  expect(beforeCancellation.application_id).toBe(applicationId);
  expect(beforeCancellation.contact_id).toBe(contactId);
  const paymentCountBefore = await countRows(supabase, "payments", reservationId);
  const documentCountBefore = await countRows(supabase, "documents", reservationId);
  const noteCountBefore = await countRows(supabase, "notes", reservationId);
  expect(paymentCountBefore).toBe(0);
  expect(documentCountBefore).toBe(0);
  expect(noteCountBefore).toBe(0);

  await expect(page.getByRole("button", { name: "Annuler la réservation" })).toBeVisible();
  await expect(
    page.getByText(
      "Annule manuellement la réservation sans créer de remboursement ni modifier les paiements, documents ou l’animal attribué.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Annuler la réservation" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Confirmer l’annulation de cette réservation ?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Cette action modifie le statut du dossier. Aucun paiement, document, email, facture ou remboursement n’est créé automatiquement.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
  await expect(page).toHaveURL(/cancellation_status=success/);
  await expect(page.getByText("Réservation annulée.")).toBeVisible();
  await expect(page.getByText("Annulée", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Annuler la réservation" }),
  ).toHaveCount(0);

  const afterCancellation = await readReservation(supabase, reservationId);
  expect(afterCancellation.status).toBe("cancelled");
  expect(afterCancellation.updated_by).not.toBeNull();
  expect(afterCancellation.updated_at).not.toBe(beforeCancellation.updated_at);
  expect(afterCancellation.reservation_confirmed_at).toBe(
    beforeCancellation.reservation_confirmed_at,
  );
  expect(afterCancellation.adoption_completed_at).toBeNull();
  expect(afterCancellation.animal_id).toBe(beforeCancellation.animal_id);
  expect(afterCancellation.animal_assigned_at).toBe(
    beforeCancellation.animal_assigned_at,
  );
  expect(afterCancellation.price_cents).toBe(beforeCancellation.price_cents);
  expect(afterCancellation.internal_comment).toBe(
    beforeCancellation.internal_comment,
  );
  expect(afterCancellation.pre_reservation_deadline).toBe(
    beforeCancellation.pre_reservation_deadline,
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
