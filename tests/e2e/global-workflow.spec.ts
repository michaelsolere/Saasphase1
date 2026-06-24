import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const applicationId = "80000000-0000-4000-8000-000000000002";
const contactId = "70000000-0000-4000-8000-000000000002";
const animalId = "d0000000-0000-4000-8000-000000000001";

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

async function readReservationOverview(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservation_overview")
      .select("id, status, price_cents, paid_cents, refunded_cents, animal_id")
      .eq("id", reservationId)
      .maybeSingle(),
    "read reservation overview",
  );
}

async function readPayment(supabase: SupabaseTestClient, paymentId: string) {
  return expectSupabaseData(
    await supabase
      .from("payments")
      .select(
        "id, reservation_id, amount_cents, status, payment_type, payment_method, paid_at, notes, currency",
      )
      .eq("id", paymentId)
      .is("deleted_at", null)
      .maybeSingle(),
    "read payment",
  );
}

async function countRows(
  supabase: SupabaseTestClient,
  table: "documents" | "notes" | "payments",
  column: "reservation_id" | "payment_id",
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

test("validates the global application to reservation to payment to animal workflow", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const supabase = await createAuthenticatedSupabaseClient();

  const initialReservation = expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id")
      .eq("application_id", applicationId)
      .is("deleted_at", null)
      .maybeSingle(),
    "read initial reservation",
  );
  expect(initialReservation).toBeNull();

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);

  await page.goto(`/candidatures/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Claire Bernard" })).toBeVisible();
  await expect(
    page.locator("header").getByText("Qualifiée", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucune réservation liée à cette candidature.", {
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Créer une réservation brouillon" })
    .click();
  await expect(page).toHaveURL(/reservation_status=created/);
  await expect(
    page.getByText(
      "La réservation brouillon a bien été créée. Elle apparaît maintenant dans la section Réservations liées.",
    ),
  ).toBeVisible();

  const reservationId = await expect
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
    page.getByRole("heading", { name: "Réservation de Claire Bernard" }),
  ).toBeVisible();
  await expect(page.getByText("Brouillon", { exact: true })).toBeVisible();

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
    page.getByText("Le commentaire interne de réservation a bien été mis à jour."),
  ).toBeVisible();

  reservation = await readReservation(supabase, reservationId);
  expect(reservation?.internal_comment).toBe(
    "Projet d’adoption validé pour Nala.",
  );
  expect(reservation?.price_cents).toBe(185000);

  await page.locator('input[name="pre_reservation_deadline"]').fill("2026-07-15");
  await page.getByRole("button", { name: "Enregistrer l’échéance" }).click();
  await expect(page).toHaveURL(/deadline_status=success/);

  reservation = await readReservation(supabase, reservationId);
  expect(reservation?.pre_reservation_deadline).toBe("2026-07-15T12:00:00+00:00");

  await page.goto(`/reservations/${reservationId}`);
  const deadlineInput = page.locator('input[name="pre_reservation_deadline"]');
  await deadlineInput.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(deadlineInput).toHaveValue("");
  await page.getByRole("button", { name: "Enregistrer l’échéance" }).click();
  await expect(page).toHaveURL(new RegExp(`/reservations/${reservationId}.*deadline_status=success`));

  reservation = await readReservation(supabase, reservationId);
  expect(reservation?.pre_reservation_deadline).toBeNull();

  await page.getByPlaceholder("ex: 150 ou 150.50").fill("200.00");
  await page.locator('select[name="payment_type"]').selectOption("arrhes");
  await page.locator('select[name="status"]').selectOption("requested");
  await page.locator('select[name="payment_method"]').selectOption("bank_transfer");
  await page.locator('input[name="payment_date"]').fill("2026-07-10");
  await page
    .locator('textarea[name="notes"]')
    .fill("Demande d’arrhes globale.");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page).toHaveURL(/payment_create_status=success/);
  await expect(page.getByText("Le paiement a bien été enregistré.")).toBeVisible();

  const paymentId = await expect
    .poll(async () => {
      const payment = expectSupabaseData(
        await supabase
          .from("payments")
          .select("id")
          .eq("reservation_id", reservationId)
          .is("deleted_at", null)
          .maybeSingle(),
        "poll created payment",
      );

      return payment?.id ?? null;
    })
    .not.toBeNull()
    .then(async () => {
      const payment = expectSupabaseData(
        await supabase
          .from("payments")
          .select("id")
          .eq("reservation_id", reservationId)
          .is("deleted_at", null)
          .single(),
        "read created payment id",
      );

      return payment.id;
    });

  let payment = await readPayment(supabase, paymentId);
  expect(payment).toMatchObject({
    amount_cents: 20000,
    status: "requested",
    payment_type: "arrhes",
    payment_method: "bank_transfer",
    reservation_id: reservationId,
    paid_at: null,
    currency: "EUR",
  });

  let overview = await readReservationOverview(supabase, reservationId);
  expect(overview?.paid_cents).toBe(0);

  await page.goto(`/payments/${paymentId}`);
  await expect(page.getByRole("heading", { name: "Marquer comme payé" })).toBeVisible();
  await page.locator('input[name="paid_date"]').fill("2026-07-20");
  await page.locator('select[name="payment_method"]').selectOption("bank_transfer");
  await page.locator('textarea[name="notes"]').fill("Arrhes reçues.");
  await page.getByRole("button", { name: "Marquer le paiement comme payé" }).click();
  await expect(page).toHaveURL(/payment_mark_status=success/);
  await expect(page.getByText("Le paiement a été marqué comme payé.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Marquer le paiement comme payé" }),
  ).toHaveCount(0);

  payment = await readPayment(supabase, paymentId);
  expect(payment).toMatchObject({
    amount_cents: 20000,
    status: "paid",
    payment_type: "arrhes",
    payment_method: "bank_transfer",
    paid_at: "2026-07-20T12:00:00+00:00",
    notes: "Arrhes reçues.",
    currency: "EUR",
  });

  overview = await readReservationOverview(supabase, reservationId);
  expect(overview).toMatchObject({
    status: "draft",
    paid_cents: 20000,
    refunded_cents: 0,
  });

  await page.goto(`/reservations/${reservationId}`);
  await page.getByLabel("Attribuer un animal").selectOption(animalId);
  await page.getByRole("button", { name: "Attribuer l’animal" }).click();
  await expect(page).toHaveURL(/animal_assign_status=success/);
  await expect(
    page.getByText("L’animal a été attribué à la réservation."),
  ).toBeVisible();
  await expect(page.locator(`a[href="/animals/${animalId}"]`)).toBeVisible();
  await expect(page.getByLabel("Attribuer un animal")).toHaveCount(0);

  reservation = await readReservation(supabase, reservationId);
  expect(reservation?.animal_id).toBe(animalId);
  expect(reservation?.animal_assigned_at).not.toBeNull();
  expect(reservation?.status).toBe("draft");

  await page.goto(`/animals/${animalId}`);
  await expect(page.getByRole("heading", { name: "Nala - Démonstration" })).toBeVisible();
  await expect(page.locator(`a[href="/reservations/${reservationId}"]`)).toBeVisible();

  await page.goto(`/reservations/${reservationId}`);
  await page.getByRole("button", { name: "Retirer l’attribution" }).click();
  await expect(page).toHaveURL(/animal_unassign_status=success/);
  await expect(
    page.getByText("L’attribution de l’animal a été retirée."),
  ).toBeVisible();
  await expect(page.getByLabel("Attribuer un animal")).toBeVisible();

  await page.goto(`/animals/${animalId}`);
  await expect(page.getByRole("heading", { name: "Nala - Démonstration" })).toBeVisible();
  await expect(page.locator(`a[href="/reservations/${reservationId}"]`)).toHaveCount(0);
  await expect(
    page.getByText("Aucune réservation liée à cet animal."),
  ).toBeVisible();

  reservation = await readReservation(supabase, reservationId);
  expect(reservation).toMatchObject({
    status: "draft",
    price_cents: 185000,
    internal_comment: "Projet d’adoption validé pour Nala.",
    pre_reservation_deadline: null,
    animal_id: null,
    animal_assigned_at: null,
  });

  overview = await readReservationOverview(supabase, reservationId);
  expect(overview).toMatchObject({
    paid_cents: 20000,
    refunded_cents: 0,
  });

  expect(await countRows(supabase, "payments", "reservation_id", reservationId)).toBe(1);
  expect(await countRows(supabase, "documents", "reservation_id", reservationId)).toBe(0);
  expect(await countRows(supabase, "documents", "payment_id", paymentId)).toBe(0);
  expect(await countRows(supabase, "notes", "reservation_id", reservationId)).toBe(0);

  const animal = expectSupabaseData(
    await supabase
      .from("animals")
      .select("id, status, display_name, species, breed, birth_date, sex, coat_color")
      .eq("id", animalId)
      .is("deleted_at", null)
      .single(),
    "read final animal",
  );
  expect(animal).toMatchObject({
    id: animalId,
    status: "available",
    display_name: "Nala - Démonstration",
    species: "dog",
    breed: "Golden Retriever",
    birth_date: "2026-04-19",
    sex: "female",
    coat_color: "Dorée claire",
  });
});
