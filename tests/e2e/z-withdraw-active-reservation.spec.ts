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
  const displayName = `Withdrawal Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Withdrawal",
    last_name: `Smoke ${suffix}`,
    call_name: displayName,
    email: `withdrawal-smoke-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create withdrawal contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test withdrawal",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée au désistement manuel d'une réservation active.",
    status: "qualified",
    submitted_at: "2026-04-04T10:00:00+00:00",
    reviewed_at: "2026-04-04T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create withdrawal application: ${applicationError.message}`);
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

async function cleanupReservationFixture(
  supabase: SupabaseTestClient,
  contactId: string | null,
  applicationId: string | null,
  reservationId: string | null,
) {
  const contactIds = contactId ? [contactId] : [];
  const applicationIds = applicationId ? [applicationId] : [];
  const reservationIds = reservationId ? [reservationId] : [];

  async function deleteBy(
    table:
      | "documents"
      | "payments"
      | "reservations"
      | "contact_roles"
      | "applications"
      | "contacts",
    column: string,
    values: string[],
  ) {
    if (values.length === 0) {
      return;
    }

    const { error } = await supabase.from(table).delete().in(column, values);

    if (error) {
      throw new Error(`cleanup ${table}.${column}: ${error.message}`);
    }
  }

  async function countBy(
    table:
      | "documents"
      | "payments"
      | "reservations"
      | "contact_roles"
      | "applications"
      | "contacts",
    column: string,
    values: string[],
  ) {
    if (values.length === 0) {
      return 0;
    }

    const result = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);

    if (result.error) {
      throw new Error(`verify cleanup ${table}.${column}: ${result.error.message}`);
    }

    return result.count ?? 0;
  }

  await deleteBy("documents", "reservation_id", reservationIds);
  await deleteBy("documents", "application_id", applicationIds);
  await deleteBy("documents", "contact_id", contactIds);
  await deleteBy("payments", "reservation_id", reservationIds);
  await deleteBy("payments", "contact_id", contactIds);
  await deleteBy("reservations", "id", reservationIds);
  await deleteBy("reservations", "application_id", applicationIds);
  await deleteBy("reservations", "contact_id", contactIds);
  await deleteBy("contact_roles", "contact_id", contactIds);
  await deleteBy("applications", "id", applicationIds);
  await deleteBy("applications", "contact_id", contactIds);
  await deleteBy("contacts", "id", contactIds);

  const remaining =
    (await countBy("documents", "reservation_id", reservationIds)) +
    (await countBy("documents", "application_id", applicationIds)) +
    (await countBy("documents", "contact_id", contactIds)) +
    (await countBy("payments", "reservation_id", reservationIds)) +
    (await countBy("payments", "contact_id", contactIds)) +
    (await countBy("reservations", "id", reservationIds)) +
    (await countBy("reservations", "application_id", applicationIds)) +
    (await countBy("reservations", "contact_id", contactIds)) +
    (await countBy("contact_roles", "contact_id", contactIds)) +
    (await countBy("applications", "id", applicationIds)) +
    (await countBy("applications", "contact_id", contactIds)) +
    (await countBy("contacts", "id", contactIds));

  if (remaining !== 0) {
    throw new Error(`cleanup withdrawal fixtures: ${remaining} row(s) remain`);
  }
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

test("withdraws an active reservation manually without side effects", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  let contactId: string | null = null;
  let applicationId: string | null = null;
  let reservationId: string | null = null;

  try {
    const fixture = await createQualifiedApplicationFixture(supabase);
    applicationId = fixture.applicationId;
    contactId = fixture.contactId;

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto(`/candidatures/${applicationId}`);
    await expect(page.getByRole("heading", { name: fixture.displayName })).toBeVisible();

    reservationId = await createDraftReservation(page, supabase, applicationId);

    await page.goto(`/reservations/${reservationId}`);
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page).toHaveURL(/activation_status=success/);
    await expect(page.getByText("La réservation a été confirmée.")).toBeVisible();

    const beforeWithdrawal = await readReservation(supabase, reservationId);
    expect(beforeWithdrawal.status).toBe("active");
    expect(beforeWithdrawal.adoption_completed_at).toBeNull();
    expect(beforeWithdrawal.application_id).toBe(applicationId);
    expect(beforeWithdrawal.contact_id).toBe(contactId);
    const paymentCountBefore = await countRows(supabase, "payments", reservationId);
    const documentCountBefore = await countRows(supabase, "documents", reservationId);
    const noteCountBefore = await countRows(supabase, "notes", reservationId);
    expect(paymentCountBefore).toBe(0);
    expect(documentCountBefore).toBe(0);
    expect(noteCountBefore).toBe(0);

    await expect(
      page.getByRole("button", { name: "Marquer comme désistée" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Enregistre le désistement sans créer de remboursement ni modifier les paiements, documents ou l’animal attribué.",
      ),
    ).toBeVisible();

    await openDialog(
      page.getByRole("button", { name: "Marquer comme désistée" }),
      page.getByRole("heading", { name: "Confirmer le désistement ?" }),
    );
    await expect(
      page.getByText(
        "Cette action modifie le statut du dossier. Aucun paiement, document, email, facture ou remboursement n’est créé automatiquement.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmer le désistement" }).click();
    await expect(page).toHaveURL(/withdrawal_status=success/);
    await expect(page.getByText("Réservation marquée comme désistée.")).toBeVisible();
    await expect(page.getByText("Désistement", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Marquer comme désistée" }),
    ).toHaveCount(0);

    const afterWithdrawal = await readReservation(supabase, reservationId);
    expect(afterWithdrawal.status).toBe("withdrawn");
    expect(afterWithdrawal.updated_by).not.toBeNull();
    expect(afterWithdrawal.updated_at).not.toBe(beforeWithdrawal.updated_at);
    expect(afterWithdrawal.reservation_confirmed_at).toBe(
      beforeWithdrawal.reservation_confirmed_at,
    );
    expect(afterWithdrawal.adoption_completed_at).toBeNull();
    expect(afterWithdrawal.animal_id).toBe(beforeWithdrawal.animal_id);
    expect(afterWithdrawal.animal_assigned_at).toBe(
      beforeWithdrawal.animal_assigned_at,
    );
    expect(afterWithdrawal.price_cents).toBe(beforeWithdrawal.price_cents);
    expect(afterWithdrawal.internal_comment).toBe(
      beforeWithdrawal.internal_comment,
    );
    expect(afterWithdrawal.pre_reservation_deadline).toBe(
      beforeWithdrawal.pre_reservation_deadline,
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
  } finally {
    await cleanupReservationFixture(
      supabase,
      contactId,
      applicationId,
      reservationId,
    );
  }
});
