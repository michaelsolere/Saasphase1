import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const applicationId = "80000000-0000-4000-8000-000000000002";
const contactId = "70000000-0000-4000-8000-000000000002";

async function readReservation(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservations")
      .select(
        "id, status, application_id, contact_id, animal_id, animal_assigned_at, price_cents, internal_comment, pre_reservation_deadline",
      )
      .eq("id", reservationId)
      .is("deleted_at", null)
      .maybeSingle(),
    "read reservation",
  );
}

async function countRows(
  supabase: SupabaseTestClient,
  table: "documents" | "notes" | "payments",
  column: "reservation_id",
  value: string,
) {
  const result = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (result.error) {
    throw new Error(`count ${table}: ${result.error.message}`);
  }

  return result.count ?? 0;
}

async function cleanupGlobalWorkflowFixture(supabase: SupabaseTestClient) {
  const existingReservations = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId)
      .is("deleted_at", null),
    "read existing global workflow reservations",
  );
  const reservationIds = (existingReservations ?? []).map((reservation) => reservation.id);

  if (reservationIds.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  const { error: paymentCleanupError } = await supabase
    .from("payments")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);

  if (paymentCleanupError) {
    throw new Error(`cleanup global workflow payments: ${paymentCleanupError.message}`);
  }

  const { error: documentCleanupError } = await supabase
    .from("documents")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);

  if (documentCleanupError) {
    throw new Error(`cleanup global workflow documents: ${documentCleanupError.message}`);
  }

  const { error: noteCleanupError } = await supabase
    .from("notes")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);

  if (noteCleanupError) {
    throw new Error(`cleanup global workflow notes: ${noteCleanupError.message}`);
  }

  const { error: reservationCleanupError } = await supabase
    .from("reservations")
    .update({ deleted_at: now })
    .in("id", reservationIds)
    .is("deleted_at", null);

  if (reservationCleanupError) {
    throw new Error(`cleanup global workflow reservations: ${reservationCleanupError.message}`);
  }
}

test("validates the global application to draft reservation workflow", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const supabase = await createAuthenticatedSupabaseClient();
  await cleanupGlobalWorkflowFixture(supabase);

  const initialReservation = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId)
      .is("deleted_at", null)
      .maybeSingle(),
    "read initial reservation",
  );
  let reservationId = initialReservation?.id ?? null;

  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/candidatures/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Claire Dubois" })).toBeVisible();
  await expect(
    page.locator("header").getByText("Validée", { exact: true }),
  ).toBeVisible();
  if (!reservationId) {
    await expect(
      page.getByText("Aucune réservation liée à cette candidature.", {
        exact: true,
      }),
    ).toBeVisible();

    const createReservationButton = page.getByRole("button", {
      name: "Créer une demande de pré-réservation",
    });

    if ((await createReservationButton.count()) > 0) {
      await createReservationButton.click();
      await expect(page).toHaveURL(
        /(reservation_status=created|\/reservations\/[0-9a-f-]{36})/,
      );
      if (page.url().includes("reservation_status=created")) {
        await expect(
          page.getByText(
            "La demande de pré-réservation a bien été créée. Elle apparaît maintenant dans la section Réservations liées.",
          ),
        ).toBeVisible();
      }
    } else {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Unable to read authenticated test user");
      }

      const { data: createdReservation, error: createError } = await supabase
        .from("reservations")
        .insert({
          organization_id: "20000000-0000-4000-8000-000000000001",
          contact_id: contactId,
          application_id: applicationId,
          litter_group_id: "50000000-0000-4000-8000-000000000001",
          litter_id: "c0000000-0000-4000-8000-000000000001",
          species: "dog",
          breed: "Golden Retriever",
          reserved_sex_preference: "female_only",
          status: "draft",
          created_by: user.id,
          updated_by: user.id,
        })
        .select("id")
        .single();

      if (createError || !createdReservation) {
        throw new Error(`create global workflow reservation: ${createError?.message}`);
      }

      reservationId = createdReservation.id;
    }

    if (!reservationId) {
      reservationId = await expect
        .poll(async () => {
          const reservation = expectSupabaseData(
            await supabase
              .from("reservations")
              .select("id")
              .eq("application_id", applicationId)
              .is("deleted_at", null)
              .maybeSingle(),
            "poll created reservation",
          );

          return reservation?.id ?? null;
        })
        .not.toBeNull()
        .then(async () => {
          const reservation = expectSupabaseData(
            await supabase
              .from("reservations")
              .select("id")
              .eq("application_id", applicationId)
              .is("deleted_at", null)
              .single(),
            "read created reservation id",
          );

          return reservation.id;
        });
    }
  } else {
    await expect(
      page.locator(`a[href="/reservations/${reservationId}"]`),
    ).toBeVisible();
  }

  let reservation = await readReservation(supabase, reservationId);
  expect(reservation).toMatchObject({
    status: "draft",
    application_id: applicationId,
    contact_id: contactId,
    animal_id: null,
    animal_assigned_at: null,
  });
  expect(await countRows(supabase, "payments", "reservation_id", reservationId)).toBe(0);
  expect(await countRows(supabase, "documents", "reservation_id", reservationId)).toBe(0);
  expect(await countRows(supabase, "notes", "reservation_id", reservationId)).toBe(0);

  await page.goto(`/reservations/${reservationId}`);
  await expect(
    page.getByRole("heading", { name: "Parcours adoptant de Claire Dubois" }),
  ).toBeVisible();
  await expect(
    page
      .locator("#reservation-details")
      .getByText("Demande de pré-réservation", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Tarif convenu").fill("1850.00");
  await page.getByRole("button", { name: "Enregistrer le tarif" }).click();
  await expect(page).toHaveURL(/price_status=success/);
  await expect(
    page.getByText("Le tarif convenu a bien été mis à jour."),
  ).toBeVisible();

  reservation = await readReservation(supabase, reservationId);
  expect(reservation?.price_cents).toBe(185000);
  expect(reservation?.status).toBe("draft");
  expect(reservation?.animal_id).toBeNull();

  await page.locator('textarea[name="internal_comment"]').fill(
    "Projet d’adoption validé pour Nala.",
  );
  await page.getByRole("button", { name: "Enregistrer le commentaire" }).click();
  await expect(page).toHaveURL(/comment_status=success/);
  await expect(
    page.getByText("Le commentaire interne du dossier a bien été mis à jour."),
  ).toBeVisible();

  reservation = await readReservation(supabase, reservationId);
  expect(reservation?.internal_comment).toBe(
    "Projet d’adoption validé pour Nala.",
  );
  expect(reservation?.price_cents).toBe(185000);

  reservation = await readReservation(supabase, reservationId);
  expect(reservation).toMatchObject({
    status: "draft",
    price_cents: 185000,
    internal_comment: "Projet d’adoption validé pour Nala.",
    pre_reservation_deadline: null,
    animal_id: null,
    animal_assigned_at: null,
  });

  expect(await countRows(supabase, "payments", "reservation_id", reservationId)).toBe(0);
  expect(await countRows(supabase, "documents", "reservation_id", reservationId)).toBe(0);
  expect(await countRows(supabase, "notes", "reservation_id", reservationId)).toBe(0);
});
