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
  const displayName = `Activation Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Activation",
    last_name: `Smoke ${suffix}`,
    display_name: displayName,
    email: `activation-smoke-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create activation contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test activation",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à la confirmation manuelle d'une réservation draft.",
    status: "qualified",
    submitted_at: "2026-04-01T10:00:00+00:00",
    reviewed_at: "2026-04-01T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create activation application: ${applicationError.message}`);
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
        "id, status, reservation_confirmed_at, updated_at, updated_by, price_cents, animal_id, application_id, contact_id",
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

async function getOrCreateDraftReservation(
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

test("confirms a draft reservation manually without side effects", async ({
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
  await expect(
    page.getByText("Aucune réservation liée à cette candidature.", {
      exact: true,
    }),
  ).toBeVisible();

  const reservationId = await getOrCreateDraftReservation(
    page,
    supabase,
    applicationId,
  );

  const beforeActivation = await readReservation(supabase, reservationId);
  expect(beforeActivation.status).toBe("draft");
  expect(beforeActivation.reservation_confirmed_at).toBeNull();
  expect(beforeActivation.application_id).toBe(applicationId);
  expect(beforeActivation.contact_id).toBe(contactId);
  expect(beforeActivation.price_cents).toBeNull();
  expect(beforeActivation.animal_id).toBeNull();
  const paymentCountBefore = await countRows(supabase, "payments", reservationId);
  const documentCountBefore = await countRows(supabase, "documents", reservationId);
  const noteCountBefore = await countRows(supabase, "notes", reservationId);
  expect(paymentCountBefore).toBe(0);
  expect(documentCountBefore).toBe(0);
  expect(noteCountBefore).toBe(0);

  await page.goto(`/reservations/${reservationId}`);
  await expect(page.getByRole("button", { name: "Confirmer la réservation" })).toBeVisible();
  await expect(
    page.getByText(
      "Cette action confirme manuellement la réservation. Elle ne crée ni paiement, ni document, ni attribution d’animal.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Confirmer la réservation" }).click();
  await expect(page).toHaveURL(/activation_status=success/);
  await expect(page.getByText("La réservation a été confirmée.")).toBeVisible();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmer la réservation" }),
  ).toHaveCount(0);

  const afterActivation = await readReservation(supabase, reservationId);
  expect(afterActivation.status).toBe("active");
  expect(afterActivation.reservation_confirmed_at).not.toBeNull();
  expect(afterActivation.updated_by).not.toBeNull();
  expect(afterActivation.updated_at).not.toBe(beforeActivation.updated_at);
  expect(afterActivation.price_cents).toBe(beforeActivation.price_cents);
  expect(afterActivation.animal_id).toBe(beforeActivation.animal_id);
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
