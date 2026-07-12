import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

const organizationId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

const fixture = {
  contactIds: [
    "94000000-0000-4000-8000-000000000001",
    "94000000-0000-4000-8000-000000000002",
    "94000000-0000-4000-8000-000000000003",
    "94000000-0000-4000-8000-000000000004",
    "94000000-0000-4000-8000-000000000005",
  ],
  applicationIds: [
    "94000000-0000-4000-8000-000000000011",
    "94000000-0000-4000-8000-000000000012",
    "94000000-0000-4000-8000-000000000013",
    "94000000-0000-4000-8000-000000000014",
    "94000000-0000-4000-8000-000000000015",
  ],
  reservationIds: [
    "94000000-0000-4000-8000-000000000021",
    "94000000-0000-4000-8000-000000000022",
    "94000000-0000-4000-8000-000000000023",
    "94000000-0000-4000-8000-000000000024",
  ],
  paymentIds: [
    "94000000-0000-4000-8000-000000000031",
    "94000000-0000-4000-8000-000000000032",
    "94000000-0000-4000-8000-000000000033",
    "94000000-0000-4000-8000-000000000034",
  ],
};

function sqlList(values: string[]) {
  return values.map((value) => `'${value}'::uuid`).join(", ");
}

function runSql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_saasphase1",
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

function journeyStep(page: Page, label: string) {
  return page.locator("li").filter({
    has: page.getByRole("heading", { name: label, exact: true }),
  });
}

function cleanupFixture() {
  runSql(`
    delete from public.email_delivery_attempts
    where reservation_id in (${sqlList(fixture.reservationIds)});

    delete from public.payments
    where id in (${sqlList(fixture.paymentIds)})
       or reservation_id in (${sqlList(fixture.reservationIds)});

    delete from public.reservations
    where id in (${sqlList(fixture.reservationIds)})
       or application_id in (${sqlList(fixture.applicationIds)});

    delete from public.contact_roles
    where contact_id in (${sqlList(fixture.contactIds)});

    delete from public.applications
    where id in (${sqlList(fixture.applicationIds)});

    delete from public.contacts
    where id in (${sqlList(fixture.contactIds)});
  `);

  const remaining = Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where reservation_id in (${sqlList(fixture.reservationIds)})
        union all
        select id::text from public.payments
        where id in (${sqlList(fixture.paymentIds)})
           or reservation_id in (${sqlList(fixture.reservationIds)})
        union all
        select id::text from public.reservations
        where id in (${sqlList(fixture.reservationIds)})
           or application_id in (${sqlList(fixture.applicationIds)})
        union all
        select id::text from public.contact_roles
        where contact_id in (${sqlList(fixture.contactIds)})
        union all
        select id::text from public.applications
        where id in (${sqlList(fixture.applicationIds)})
        union all
        select id::text from public.contacts
        where id in (${sqlList(fixture.contactIds)})
      ) remaining;
    `),
  );

  if (remaining !== 0) {
    throw new Error(`cleanup candidate progress: ${remaining} row(s) remain`);
  }
}

function createFixture() {
  cleanupFixture();

  runSql(`
    insert into public.contacts (
      id, organization_id, contact_type, first_name, last_name, display_name,
      email, origin_channel, primary_status, created_by, updated_by
    )
    values
      ('${fixture.contactIds[0]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Sans Reservation', 'E2E Sans Reservation', 'progress-none@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[1]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Demande', 'E2E Demande Prereservation', 'progress-requested@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[2]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Reglee', 'E2E Prereservation Reglee', 'progress-paid@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[3]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Active', 'E2E Statut Ulterieur', 'progress-active@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[4]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Annulee', 'E2E Reservation Negative', 'progress-negative@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid);

    insert into public.contact_roles (
      organization_id, contact_id, role, started_at, created_by, updated_by
    )
    select '${organizationId}'::uuid, id, 'candidate', '2026-07-12'::date,
      '${userId}'::uuid, '${userId}'::uuid
    from public.contacts
    where id in (${sqlList(fixture.contactIds)});

    insert into public.applications (
      id, organization_id, contact_id, species, breed, desired_sex_preference,
      desired_quantity, project_description, status, submitted_at, reviewed_at,
      reviewed_by, created_by, updated_by
    )
    values
      ('${fixture.applicationIds[0]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[0]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 1, 'Progression sans réservation.', 'qualified', '2026-07-01 10:00:00+00', '2026-07-02 10:00:00+00', '${userId}'::uuid, '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.applicationIds[1]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[1]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 1, 'Progression demande envoyée.', 'qualified', '2026-07-01 10:01:00+00', '2026-07-02 10:01:00+00', '${userId}'::uuid, '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.applicationIds[2]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[2]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 1, 'Progression réglée.', 'qualified', '2026-07-01 10:02:00+00', '2026-07-02 10:02:00+00', '${userId}'::uuid, '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.applicationIds[3]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[3]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 1, 'Progression ultérieure.', 'qualified', '2026-07-01 10:03:00+00', '2026-07-02 10:03:00+00', '${userId}'::uuid, '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.applicationIds[4]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[4]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 1, 'Progression négative.', 'qualified', '2026-07-01 10:04:00+00', '2026-07-02 10:04:00+00', '${userId}'::uuid, '${userId}'::uuid, '${userId}'::uuid);

    insert into public.reservations (
      id, organization_id, contact_id, application_id, species, breed,
      reserved_sex_preference, status, pre_reservation_deadline, price_cents,
      currency, created_at, created_by, updated_by
    )
    values
      ('${fixture.reservationIds[0]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[1]}'::uuid, '${fixture.applicationIds[1]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 'pre_reservation_requested', '2026-07-25 12:00:00+00', 150000, 'EUR', '2026-07-10 09:00:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.reservationIds[1]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[2]}'::uuid, '${fixture.applicationIds[2]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 'pre_reservation_paid', '2026-07-25 12:00:00+00', 150000, 'EUR', '2026-07-10 09:01:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.reservationIds[2]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[3]}'::uuid, '${fixture.applicationIds[3]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 'active', '2026-07-25 12:00:00+00', 150000, 'EUR', '2026-07-10 09:02:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.reservationIds[3]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[4]}'::uuid, '${fixture.applicationIds[4]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 'cancelled', '2026-07-25 12:00:00+00', 150000, 'EUR', '2026-07-10 09:03:00+00', '${userId}'::uuid, '${userId}'::uuid);

    insert into public.payments (
      id, organization_id, contact_id, reservation_id, amount_cents, currency,
      payment_type, status, requested_at, due_date, paid_at, payment_method,
      created_at, created_by, updated_by
    )
    values
      ('${fixture.paymentIds[0]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[1]}'::uuid, '${fixture.reservationIds[0]}'::uuid, 25000, 'EUR', 'pre_reservation_deposit_refundable', 'requested', '2026-07-10 09:05:00+00', '2026-07-25', null, 'unknown', '2026-07-10 09:05:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.paymentIds[1]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[2]}'::uuid, '${fixture.reservationIds[1]}'::uuid, 25000, 'EUR', 'pre_reservation_deposit_refundable', 'paid', '2026-07-10 09:06:00+00', '2026-07-25', '2026-07-11 09:00:00+00', 'bank_transfer', '2026-07-10 09:06:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.paymentIds[2]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[3]}'::uuid, '${fixture.reservationIds[2]}'::uuid, 25000, 'EUR', 'pre_reservation_deposit_refundable', 'paid', '2026-07-10 09:07:00+00', '2026-07-25', '2026-07-11 09:00:00+00', 'bank_transfer', '2026-07-10 09:07:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.paymentIds[3]}'::uuid, '${organizationId}'::uuid, '${fixture.contactIds[4]}'::uuid, '${fixture.reservationIds[3]}'::uuid, 25000, 'EUR', 'pre_reservation_deposit_refundable', 'requested', '2026-07-10 09:08:00+00', '2026-07-25', null, 'unknown', '2026-07-10 09:08:00+00', '${userId}'::uuid, '${userId}'::uuid);
  `);
}

test("candidate pre-reservation progress appears on list, timeline, contact and payments", async ({
  page,
}) => {
  test.setTimeout(60_000);
  createFixture();

  try {
    await login(page);

    await page.goto("/candidatures?filtre=toutes");
    const noReservationRow = page.getByRole("row").filter({
      hasText: "E2E Sans Reservation",
    });
    await expect(noReservationRow).toContainText("Validée");
    await expect(noReservationRow).not.toContainText("Demande de pré-réservation");

    await expect(
      page.getByRole("row").filter({ hasText: "E2E Demande Prereservation" }),
    ).toContainText("Demande de pré-réservation");
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Prereservation Reglee" }),
    ).toContainText("Pré-réservation réglée");
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Statut Ulterieur" }),
    ).toContainText("Pré-réservation réglée");
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Reservation Negative" }),
    ).not.toContainText("Demande de pré-réservation");

    await page.goto(`/candidatures/${fixture.applicationIds[0]}`);
    await expect(
      page.getByRole("heading", {
        name: "Email confirmation de gestation envoyé",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Demande de pré-réservation",
        exact: true,
      }),
    ).toHaveCount(0);
    const noRequestCombinedStep = journeyStep(
      page,
      "Confirmation de gestation et demande de pré-réservation",
    );
    await expect(noRequestCombinedStep).toBeVisible();
    await expect(noRequestCombinedStep).toContainText("À venir");
    await expect(page.getByText("Aucune demande active")).toBeVisible();
    const noRequestPaidStep = journeyStep(page, "Pré-réservation réglée");
    await expect(noRequestPaidStep).toBeVisible();
    await expect(noRequestPaidStep).toContainText("À venir");
    await expect(
      page.getByText("Le règlement de pré-réservation n'est pas encore enregistré."),
    ).toBeVisible();

    await page.goto(`/candidatures/${fixture.applicationIds[1]}`);
    const requestedCombinedStep = journeyStep(
      page,
      "Confirmation de gestation et demande de pré-réservation",
    );
    await expect(requestedCombinedStep).toContainText("Fait");
    const requestedPaidStep = journeyStep(page, "Pré-réservation réglée");
    await expect(requestedPaidStep).toContainText("À venir");
    await expect(page.getByText("Paiement de 250,00").first()).toBeVisible();
    await expect(page.getByText("25 juillet 2026").first()).toBeVisible();
    await expect(
      page.getByText("En attente de règlement."),
    ).toBeVisible();

    await page.goto(`/candidatures/${fixture.applicationIds[2]}`);
    const paidCombinedStep = journeyStep(
      page,
      "Confirmation de gestation et demande de pré-réservation",
    );
    await expect(paidCombinedStep).toContainText("Fait");
    const paidCandidateStep = journeyStep(page, "Pré-réservation réglée");
    await expect(paidCandidateStep).toContainText("Fait");
    await expect(
      page.getByText("Pré-réservation réglée — passage au parcours adoptant."),
    ).toBeVisible();
    await expect(page.getByText("Paiement de 250,00").first()).toBeVisible();
    await expect(page.getByText(/en attente de règlement/i)).toHaveCount(0);

    await page.goto(`/reservations/${fixture.reservationIds[0]}`);
    const requestedAdopterSteps = page
      .locator("section", { hasText: "Progression de la demande" })
      .locator("li");
    await expect(requestedAdopterSteps.first()).toContainText(
      "Pré-réservation réglée",
    );
    await expect(requestedAdopterSteps.first()).toContainText("À venir");
    await expect(requestedAdopterSteps.first()).toContainText(
      "Parcours adoptant non encore ouvert, règlement à confirmer.",
    );
    await expect(
      page.getByText("Progression du parcours adoptant"),
    ).toHaveCount(0);

    await page.goto(`/reservations/${fixture.reservationIds[1]}`);
    const paidAdopterSteps = page
      .locator("section", { hasText: "Progression du parcours adoptant" })
      .locator("li");
    await expect(paidAdopterSteps.first()).toContainText(
      "Pré-réservation réglée",
    );
    await expect(paidAdopterSteps.first()).toContainText("Fait");
    await expect(paidAdopterSteps.first()).toContainText(
      "Point de départ du parcours adoptant.",
    );

    await page.goto(`/reservations/${fixture.reservationIds[2]}`);
    const activeAdopterSteps = page
      .locator("section", { hasText: "Progression du parcours adoptant" })
      .locator("li");
    await expect(activeAdopterSteps.first()).toContainText(
      "Pré-réservation réglée",
    );
    await expect(activeAdopterSteps.first()).toContainText("Fait");
    await expect(activeAdopterSteps.first()).toContainText(
      "Point de départ du parcours adoptant.",
    );

    await page.goto(`/candidatures/${fixture.applicationIds[3]}`);
    await expect(
      page.getByRole("heading", { name: "Pré-réservation réglée" }),
    ).toBeVisible();
    await expect(
      page.getByText("Pré-réservation réglée — passage au parcours adoptant."),
    ).toBeVisible();
    await expect(
      page.getByText("Le règlement de pré-réservation n'est pas encore enregistré."),
    ).toHaveCount(0);

    await page.goto(`/candidatures/${fixture.applicationIds[4]}`);
    await expect(page.getByText("Aucune demande active")).toBeVisible();

    await page.goto(`/contacts/${fixture.contactIds[1]}`);
    await expect(
      page.getByText("Paiement de pré-réservation demandé"),
    ).toBeVisible();

    await page.goto("/payments?filter=expected");
    const expectedPaymentRow = page.getByRole("row").filter({
      hasText: "E2E Demande Prereservation",
    });
    await expect(expectedPaymentRow).toContainText("250,00");
    await expect(expectedPaymentRow).toContainText("Demandé");
  } finally {
    cleanupFixture();
  }
});
