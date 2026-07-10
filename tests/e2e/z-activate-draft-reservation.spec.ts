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
  const displayName = `Activation Smoke ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Activation",
    last_name: `Smoke ${suffix}`,
    call_name: displayName,
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
        "id, status, reservation_confirmed_at, updated_at, updated_by, price_cents, animal_id, animal_assigned_at, application_id, contact_id, adoption_completed_at",
      )
      .eq("id", reservationId)
      .is("deleted_at", null)
      .single(),
    "read reservation",
  );
}

async function readReservationPayments(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("payments")
      .select(
        "id, amount_cents, status, payment_type, payment_method, requested_at, due_date, paid_at, notes",
      )
      .eq("reservation_id", reservationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    "read reservation payments",
  );
}

async function readReservationDocuments(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("documents")
      .select("id, document_type")
      .eq("reservation_id", reservationId)
      .is("deleted_at", null)
      .order("document_type", { ascending: true }),
    "read reservation documents",
  );
}

async function readActiveContactRoles(
  supabase: SupabaseTestClient,
  contactId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("contact_roles")
      .select("role")
      .eq("contact_id", contactId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("role", { ascending: true }),
    "read active contact roles",
  ).map((row) => row.role);
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
    .getByRole("button", { name: "Créer une demande de pré-réservation" })
    .click();
  await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]+/);

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

async function createPreReservationPaymentFixture(
  supabase: SupabaseTestClient,
  {
    amountCents = 25000,
    paymentType = "arrhes",
  }: {
    amountCents?: number;
    paymentType?: "arrhes" | "balance";
  } = {},
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const contactId = randomUUID();
  const applicationId = randomUUID();
  const reservationId = randomUUID();
  const paymentId = randomUUID();
  const suffix = reservationId.slice(0, 8);
  const displayName = `Pre Reservation Payment ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Pre Reservation",
    last_name: `Payment ${suffix}`,
    call_name: displayName,
    email: `pre-reservation-payment-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create pre-reservation contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test pre-reservation payment",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à la validation d'un paiement de pré-réservation.",
    status: "qualified",
    submitted_at: "2026-04-01T10:00:00+00:00",
    reviewed_at: "2026-04-01T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(
      `create pre-reservation application: ${applicationError.message}`,
    );
  }

  const { error: reservationError } = await supabase.from("reservations").insert({
    id: reservationId,
    organization_id: organizationId,
    contact_id: contactId,
    application_id: applicationId,
    species: "dog",
    breed: "Golden Retriever",
    reserved_sex_preference: "no_preference",
    status: "pre_reservation_requested",
    created_by: user.id,
    updated_by: user.id,
  });

  if (reservationError) {
    throw new Error(
      `create pre-reservation reservation: ${reservationError.message}`,
    );
  }

  const { error: paymentError } = await supabase.from("payments").insert({
    id: paymentId,
    organization_id: organizationId,
    contact_id: contactId,
    reservation_id: reservationId,
    amount_cents: amountCents,
    currency: "EUR",
    payment_type: paymentType,
    status: "requested",
    payment_method: "bank_transfer",
    requested_at: "2026-04-02T10:00:00+00:00",
    due_date: "2026-04-17",
    notes:
      paymentType === "arrhes"
        ? "Paiement de pré-réservation."
        : "Paiement hors arrhes.",
    created_by: user.id,
    updated_by: user.id,
  });

  if (paymentError) {
    throw new Error(`create pre-reservation payment: ${paymentError.message}`);
  }

  return { applicationId, contactId, paymentId, reservationId };
}

async function createReservationContractDocumentFixture(
  supabase: SupabaseTestClient,
  reservationId: string,
  contactId: string,
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const documentId = randomUUID();

  const { error: documentError } = await supabase.from("documents").insert({
    id: documentId,
    organization_id: organizationId,
    reservation_id: reservationId,
    contact_id: contactId,
    document_type: "reservation_contract",
    title: "Contrat de réservation test",
    status: "to_generate",
    signature_required: true,
    created_by: user.id,
    updated_by: user.id,
  });

  if (documentError) {
    throw new Error(`create reservation contract document: ${documentError.message}`);
  }

  return documentId;
}

async function createPreReservationBalanceFixture(
  supabase: SupabaseTestClient,
  {
    reservationStatus,
    firstPaymentStatus,
    withSecondRequest = false,
    withCancelledSecondRequest = false,
  }: {
    reservationStatus: "pre_reservation_requested" | "pre_reservation_paid";
    firstPaymentStatus: "requested" | "paid";
    withSecondRequest?: boolean;
    withCancelledSecondRequest?: boolean;
  },
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const contactId = randomUUID();
  const applicationId = randomUUID();
  const reservationId = randomUUID();
  const firstPaymentId = randomUUID();
  const secondPaymentId = withSecondRequest ? randomUUID() : null;
  const cancelledSecondPaymentId = withCancelledSecondRequest
    ? randomUUID()
    : null;
  const suffix = reservationId.slice(0, 8);
  const displayName = `Balance Request ${suffix}`;

  const { error: contactError } = await supabase.from("contacts").insert({
    id: contactId,
    organization_id: organizationId,
    contact_type: "person",
    first_name: "Balance",
    last_name: `Request ${suffix}`,
    call_name: displayName,
    email: `balance-request-${suffix}@example.invalid`,
    origin_channel: "manual",
    primary_status: "active",
    created_by: user.id,
    updated_by: user.id,
  });

  if (contactError) {
    throw new Error(`create balance contact: ${contactError.message}`);
  }

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    organization_id: organizationId,
    contact_id: contactId,
    species: "dog",
    breed: "Golden Retriever",
    desired_period: "Test complement arrhes",
    desired_sex_preference: "no_preference",
    desired_quantity: 1,
    project_description:
      "Fixture e2e dédiée à la demande manuelle de complément d'arrhes.",
    status: "qualified",
    submitted_at: "2026-04-01T10:00:00+00:00",
    reviewed_at: "2026-04-01T12:00:00+00:00",
    reviewed_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });

  if (applicationError) {
    throw new Error(`create balance application: ${applicationError.message}`);
  }

  const { error: reservationError } = await supabase.from("reservations").insert({
    id: reservationId,
    organization_id: organizationId,
    contact_id: contactId,
    application_id: applicationId,
    species: "dog",
    breed: "Golden Retriever",
    reserved_sex_preference: "no_preference",
    status: reservationStatus,
    created_by: user.id,
    updated_by: user.id,
  });

  if (reservationError) {
    throw new Error(`create balance reservation: ${reservationError.message}`);
  }

  const paymentsToInsert = [
    {
      id: firstPaymentId,
      organization_id: organizationId,
      contact_id: contactId,
      reservation_id: reservationId,
      amount_cents: 25000,
      currency: "EUR",
      payment_type: "arrhes",
      status: firstPaymentStatus,
      payment_method: "bank_transfer",
      requested_at: "2026-04-02T10:00:00+00:00",
      due_date: "2026-04-17",
      paid_at:
        firstPaymentStatus === "paid" ? "2026-04-03T10:00:00+00:00" : null,
      notes: "Paiement de pré-réservation de 250 €.",
      created_by: user.id,
      updated_by: user.id,
    },
  ];

  if (secondPaymentId) {
    paymentsToInsert.push({
      id: secondPaymentId,
      organization_id: organizationId,
      contact_id: contactId,
      reservation_id: reservationId,
      amount_cents: 25000,
      currency: "EUR",
      payment_type: "arrhes",
      status: "requested",
      payment_method: "bank_transfer",
      requested_at: "2026-04-04T10:00:00+00:00",
      due_date: "2026-04-19",
      paid_at: null,
      notes: "Demande 2/2 — complément des arrhes.",
      created_by: user.id,
      updated_by: user.id,
    });
  }

  if (cancelledSecondPaymentId) {
    paymentsToInsert.push({
      id: cancelledSecondPaymentId,
      organization_id: organizationId,
      contact_id: contactId,
      reservation_id: reservationId,
      amount_cents: 25000,
      currency: "EUR",
      payment_type: "arrhes",
      status: "cancelled",
      payment_method: "bank_transfer",
      requested_at: "2026-04-04T10:00:00+00:00",
      due_date: "2026-04-19",
      paid_at: null,
      notes: "Ancienne demande 2/2 annulée.",
      created_by: user.id,
      updated_by: user.id,
    });
  }

  const { error: paymentError } = await supabase
    .from("payments")
    .insert(paymentsToInsert);

  if (paymentError) {
    throw new Error(`create balance payments: ${paymentError.message}`);
  }

  return {
    reservationId,
    firstPaymentId,
    secondPaymentId,
    cancelledSecondPaymentId,
  };
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
  await expect
    .poll(async () => readActiveContactRoles(supabase, contactId))
    .not.toContain("pre_reservation_holder");

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
  await expect(
    page.locator("#reservation-details").getByText("Active", { exact: true }),
  ).toBeVisible();
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
  await expect
    .poll(async () => readActiveContactRoles(supabase, contactId))
    .not.toContain("reservation_holder");
});

test("marks a 250 euro pre-reservation payment as paid from payment detail", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { applicationId, paymentId, reservationId } =
    await createPreReservationPaymentFixture(supabase);

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await expect(page).toHaveURL(new RegExp(`/candidatures/${applicationId}`));
  await expect(page.getByRole("button", { name: "Marquer payé" })).toHaveCount(0);

  await page.goto(`/payments/${paymentId}`);
  await expect(
    page.getByRole("heading", { name: "Marquer comme payé" }),
  ).toBeVisible();
  await page.locator('input[name="paid_date"]').fill("2026-07-10");
  await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
  await expect(page).toHaveURL(/payment_mark_status=success/);
  await page.goto(`/reservations/${reservationId}`);
  await expect(
    page.getByRole("heading", {
      name: "Pré-réservation réglée",
      exact: true,
    }),
  ).toBeVisible();

  const updatedReservation = await readReservation(supabase, reservationId);
  expect(updatedReservation.status).toBe("pre_reservation_paid");
  await expect
    .poll(async () => readActiveContactRoles(supabase, updatedReservation.contact_id))
    .toContain("pre_reservation_holder");

  const updatedPayment = expectSupabaseData(
    await supabase
      .from("payments")
      .select("id, status, paid_at")
      .eq("id", paymentId)
      .single(),
    "read updated pre-reservation payment",
  );
  expect(updatedPayment.status).toBe("paid");
  expect(updatedPayment.paid_at).not.toBeNull();
});

test("marks a direct 500 euro arrhes payment as pre-reservation holder", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { applicationId, paymentId, reservationId } =
    await createPreReservationPaymentFixture(supabase, {
      amountCents: 50000,
      paymentType: "arrhes",
    });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await expect(page).toHaveURL(new RegExp(`/candidatures/${applicationId}`));
  await expect(page.getByRole("button", { name: "Marquer payé" })).toHaveCount(0);

  await page.goto(`/payments/${paymentId}`);
  await expect(
    page.getByRole("heading", { name: "Marquer comme payé" }),
  ).toBeVisible();
  await page.locator('input[name="paid_date"]').fill("2026-07-10");
  await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
  await expect(page).toHaveURL(/payment_mark_status=success/);
  await page.goto(`/reservations/${reservationId}`);
  await expect(page.getByText("Arrhes complètes", { exact: true })).toBeVisible();

  const updatedReservation = await readReservation(supabase, reservationId);
  expect(updatedReservation.status).toBe("pre_reservation_paid");

  await expect
    .poll(async () => readActiveContactRoles(supabase, updatedReservation.contact_id))
    .toEqual(["pre_reservation_holder"]);

  await page.goto(`/reservations/${reservationId}`);
  await expect(
    page.getByRole("button", { name: "Initialiser les documents de réservation" }),
  ).toHaveCount(0);

  const documents = await readReservationDocuments(supabase, reservationId);
  expect(documents).toHaveLength(0);
});

test("does not display complete deposit for a paid non-arrhes 500 euro payment", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { applicationId, paymentId, reservationId } =
    await createPreReservationPaymentFixture(supabase, {
      amountCents: 50000,
      paymentType: "balance",
    });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await expect(page).toHaveURL(new RegExp(`/candidatures/${applicationId}`));
  await expect(page.getByRole("button", { name: "Marquer payé" })).toHaveCount(0);

  await page.goto(`/payments/${paymentId}`);
  await expect(
    page.getByRole("heading", { name: "Marquer comme payé" }),
  ).toBeVisible();
  await page.locator('input[name="paid_date"]').fill("2026-07-10");
  await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
  await expect(page).toHaveURL(/payment_mark_status=success/);
  await expect(page.getByText(/Arrhes complètes/)).toHaveCount(0);
});

test("does not mark a document financial status as complete deposit for a paid non-arrhes 500 euro payment", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { applicationId, contactId, paymentId, reservationId } =
    await createPreReservationPaymentFixture(supabase, {
      amountCents: 50000,
      paymentType: "balance",
    });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await expect(page).toHaveURL(new RegExp(`/candidatures/${applicationId}`));
  await expect(page.getByRole("button", { name: "Marquer payé" })).toHaveCount(0);

  await page.goto(`/payments/${paymentId}`);
  await expect(
    page.getByRole("heading", { name: "Marquer comme payé" }),
  ).toBeVisible();
  await page.locator('input[name="paid_date"]').fill("2026-07-10");
  await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
  await expect(page).toHaveURL(/payment_mark_status=success/);

  const documentId = await createReservationContractDocumentFixture(
    supabase,
    reservationId,
    contactId,
  );

  await page.goto(`/documents/${documentId}`);
  await expect(
    page.getByText("Paiement hors arrhes", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Arrhes complètes/)).toHaveCount(0);
});

test("creates the second 250 euro deposit request only after confirmation", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { reservationId } = await createPreReservationBalanceFixture(supabase, {
    reservationStatus: "pre_reservation_paid",
    firstPaymentStatus: "paid",
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  const beforeReservation = await readReservation(supabase, reservationId);
  expect(beforeReservation).toMatchObject({
    status: "pre_reservation_paid",
    animal_id: null,
    animal_assigned_at: null,
    adoption_completed_at: null,
  });

  await page.goto(`/reservations/${reservationId}`);
  await openDialog(
    page
      .locator("#reservation-details")
      .getByRole("button", { name: "Demander le complément 2/2 — 250 €" }),
    page.getByRole("heading", { name: "Créer le complément 2/2 — 250 € ?" }),
  );
  await expect(
    page.getByText(
      "Cette action crée uniquement une demande de paiement en statut demandé. Elle ne change pas le statut de réservation, n’attribue aucun animal, ne finalise pas l’adoption et n’envoie aucun email.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmer la demande" }).click();
  await expect(page).toHaveURL(/balance_request_status=success/);
  await expect(
    page.getByText("Le complément 2/2 — 250 € a bien été créé."),
  ).toBeVisible();

  const payments = await readReservationPayments(supabase, reservationId);
  expect(payments).toHaveLength(2);
  expect(
    payments.filter(
      (payment) =>
        payment.payment_type === "arrhes" &&
        payment.amount_cents === 25000 &&
        payment.status === "paid",
    ),
  ).toHaveLength(1);

  const secondRequest = payments.find(
    (payment) =>
      payment.payment_type === "arrhes" &&
      payment.amount_cents === 25000 &&
      payment.status === "requested",
  );
  expect(secondRequest).toBeTruthy();
  expect(secondRequest?.payment_method).toBe("bank_transfer");
  expect(secondRequest?.requested_at).not.toBeNull();
  expect(secondRequest?.due_date).not.toBeNull();
  expect(secondRequest?.paid_at).toBeNull();

  const afterReservation = await readReservation(supabase, reservationId);
  expect(afterReservation).toMatchObject({
    status: beforeReservation.status,
    animal_id: beforeReservation.animal_id,
    animal_assigned_at: beforeReservation.animal_assigned_at,
    adoption_completed_at: beforeReservation.adoption_completed_at,
  });
});

test("does not show the second deposit action when the request already exists", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { reservationId } = await createPreReservationBalanceFixture(supabase, {
    reservationStatus: "pre_reservation_paid",
    firstPaymentStatus: "paid",
    withSecondRequest: true,
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await expect(
    page.getByRole("button", { name: /Demander le complément/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Complément 2/2 — 250 € demandé."),
  ).toBeVisible();

  const payments = await readReservationPayments(supabase, reservationId);
  expect(payments).toHaveLength(2);
  expect(
    payments.filter(
      (payment) =>
        payment.payment_type === "arrhes" &&
        payment.amount_cents === 25000 &&
        (payment.status === "requested" || payment.status === "paid"),
    ),
  ).toHaveLength(2);
});

test("can request the second deposit when only an old second request was cancelled", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { reservationId } = await createPreReservationBalanceFixture(supabase, {
    reservationStatus: "pre_reservation_paid",
    firstPaymentStatus: "paid",
    withCancelledSecondRequest: true,
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await openDialog(
    page
      .locator("#reservation-details")
      .getByRole("button", { name: "Demander le complément 2/2 — 250 €" }),
    page.getByRole("heading", { name: "Créer le complément 2/2 — 250 € ?" }),
  );
  await page.getByRole("button", { name: "Confirmer la demande" }).click();
  await expect(page).toHaveURL(/balance_request_status=success/);

  const payments = await readReservationPayments(supabase, reservationId);
  expect(payments).toHaveLength(3);
  expect(
    payments.filter(
      (payment) =>
        payment.payment_type === "arrhes" &&
        payment.amount_cents === 25000 &&
        (payment.status === "requested" || payment.status === "paid"),
    ),
  ).toHaveLength(2);
  expect(
    payments.filter(
      (payment) =>
        payment.payment_type === "arrhes" &&
        payment.amount_cents === 25000 &&
        payment.status === "cancelled",
    ),
  ).toHaveLength(1);
});

test("does not show the second deposit action when the first deposit is not paid", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const { reservationId } = await createPreReservationBalanceFixture(supabase, {
    reservationStatus: "pre_reservation_paid",
    firstPaymentStatus: "requested",
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/reservations/${reservationId}`);
  await expect(
    page.getByRole("button", { name: /Demander le complément/ }),
  ).toHaveCount(0);

  const payments = await readReservationPayments(supabase, reservationId);
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    amount_cents: 25000,
    payment_type: "arrhes",
    status: "requested",
  });
});
