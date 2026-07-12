import { expect, test } from "@playwright/test";

import {
  runE2eSqlSync,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const contactId = "70000000-0000-4000-8000-000000000004";
const reservationId = "90000000-0000-4000-8000-000000000002";
const litterId = "c0000000-0000-4000-8000-000000000002";
const litterGroupId = "50000000-0000-4000-8000-000000000001";
const otherOrganizationId = "21000000-0000-4000-8000-000000009001";
const otherContactId = "71000000-0000-4000-8000-000000009001";
const hiddenAttemptId = "91000000-0000-4000-8000-000000009001";

const qaAttemptIds = [
  "91000000-0000-4000-8000-000000000001",
  "91000000-0000-4000-8000-000000000002",
  "91000000-0000-4000-8000-000000000003",
  "91000000-0000-4000-8000-000000000004",
  "91000000-0000-4000-8000-000000000005",
  "91000000-0000-4000-8000-000000000006",
  "91000000-0000-4000-8000-000000000007",
  "91000000-0000-4000-8000-000000000008",
  "91000000-0000-4000-8000-000000000009",
  "91000000-0000-4000-8000-000000000010",
  "91000000-0000-4000-8000-000000000011",
  "91000000-0000-4000-8000-000000000012",
  "91000000-0000-4000-8000-000000000013",
  "91000000-0000-4000-8000-000000000014",
] as const;

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return runE2eSqlSync(sql);
}

function uuidList(ids: readonly string[]) {
  return ids.map((id) => `${sqlQuote(id)}::uuid`).join(",");
}

function cleanupQaFixtures() {
  runSql(`
    delete from public.email_delivery_attempts
    where id in (${uuidList([...qaAttemptIds, hiddenAttemptId])})
      or idempotency_key like 'email-delivery-foundation:%';

    delete from public.contacts
    where id = ${sqlQuote(otherContactId)}::uuid;

    delete from public.organizations
    where id = ${sqlQuote(otherOrganizationId)}::uuid;
  `);
}

function countRemainingFixtures() {
  return Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where id in (${uuidList([...qaAttemptIds, hiddenAttemptId])})
          or idempotency_key like 'email-delivery-foundation:%'
        union all
        select id::text from public.contacts
        where id = ${sqlQuote(otherContactId)}::uuid
        union all
        select id::text from public.organizations
        where id = ${sqlQuote(otherOrganizationId)}::uuid
      ) remaining;
    `),
  );
}

function createHiddenOrganizationAttempt() {
  runSql(`
    insert into public.organizations (id, name, slug)
    values (
      ${sqlQuote(otherOrganizationId)}::uuid,
      'QA Email Delivery Hidden',
      'qa-email-delivery-hidden'
    );

    insert into public.contacts (
      id,
      organization_id,
      contact_type,
      display_name,
      email,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(otherContactId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      'person',
      'Contact QA invisible',
      'qa-hidden@example.invalid',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.email_delivery_attempts (
      id,
      organization_id,
      contact_id,
      message_type,
      recipient_email,
      idempotency_key,
      status,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(hiddenAttemptId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      ${sqlQuote(otherContactId)}::uuid,
      'qa_hidden',
      'qa-hidden@example.invalid',
      'email-delivery-foundation:hidden',
      'pending',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );
  `);
}

test("validates email delivery attempt persistence, idempotence and RLS", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();

  try {
    const firstAttempt = await supabase
      .from("email_delivery_attempts")
      .insert({
        id: qaAttemptIds[0],
        organization_id: organizationId,
        contact_id: contactId,
        reservation_id: reservationId,
        litter_id: litterId,
        litter_group_id: litterGroupId,
        message_type: "pre_reservation_request",
        recipient_email: "QA-Email-Attempt@example.invalid",
        recipient_name: "QA Email Attempt",
        subject_snapshot: "Pré-réservation QA",
        variables_snapshot: { reservation_id: reservationId },
        idempotency_key: "email-delivery-foundation:same-key",
        status: "pending",
        attempt_count: 0,
        created_by: ownerId,
        updated_by: ownerId,
      })
      .select("id, status, attempt_count, recipient_email, variables_snapshot")
      .single();

    expect(firstAttempt.error).toBeNull();
    expect(firstAttempt.data?.status).toBe("pending");
    expect(firstAttempt.data?.attempt_count).toBe(0);
    expect(firstAttempt.data?.recipient_email).toBe(
      "QA-Email-Attempt@example.invalid",
    );

    const duplicateAttempt = await supabase.from("email_delivery_attempts").insert({
      id: qaAttemptIds[1],
      organization_id: organizationId,
      contact_id: contactId,
      message_type: "pre_reservation_request",
      recipient_email: "qa-email-attempt@example.invalid",
      idempotency_key: "email-delivery-foundation:same-key",
      status: "pending",
      created_by: ownerId,
      updated_by: ownerId,
    });

    expect(duplicateAttempt.error?.code).toBe("23505");

    const sameKeyRows = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("idempotency_key", "email-delivery-foundation:same-key"),
      "count same idempotency rows",
    );
    expect(sameKeyRows).toHaveLength(1);

    const distinctAttempts = await supabase.from("email_delivery_attempts").insert([
      {
        id: qaAttemptIds[2],
        organization_id: organizationId,
        contact_id: contactId,
        message_type: "pre_reservation_request",
        recipient_email: "qa-email-attempt-2@example.invalid",
        idempotency_key: "email-delivery-foundation:distinct-a",
        status: "pending",
        created_by: ownerId,
        updated_by: ownerId,
      },
      {
        id: qaAttemptIds[3],
        organization_id: organizationId,
        contact_id: contactId,
        message_type: "pre_reservation_request",
        recipient_email: "qa-email-attempt-3@example.invalid",
        idempotency_key: "email-delivery-foundation:distinct-b",
        status: "pending",
        created_by: ownerId,
        updated_by: ownerId,
      },
    ]);

    expect(distinctAttempts.error).toBeNull();

    const sentAt = "2026-07-11T10:00:00.000Z";
    const sentUpdate = await supabase
      .from("email_delivery_attempts")
      .update({
        status: "sent",
        brevo_message_id: "brevo-qa-message-001",
        sent_at: sentAt,
        last_attempt_at: sentAt,
        attempt_count: 1,
        last_error_code: null,
        updated_by: ownerId,
      })
      .eq("id", qaAttemptIds[2])
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .select("status, brevo_message_id, sent_at, last_attempt_at, attempt_count, last_error_code")
      .single();

    expect(sentUpdate.error).toBeNull();
    expect(sentUpdate.data).toMatchObject({
      status: "sent",
      brevo_message_id: "brevo-qa-message-001",
      sent_at: "2026-07-11T10:00:00+00:00",
      last_attempt_at: "2026-07-11T10:00:00+00:00",
      attempt_count: 1,
      last_error_code: null,
    });

    const failedAt = "2026-07-11T10:05:00.000Z";
    const failedUpdate = await supabase
      .from("email_delivery_attempts")
      .update({
        status: "failed",
        failed_at: failedAt,
        last_attempt_at: failedAt,
        attempt_count: 1,
        last_error_code: "timeout",
        updated_by: ownerId,
      })
      .eq("id", qaAttemptIds[3])
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .select("status, failed_at, last_attempt_at, attempt_count, last_error_code")
      .single();

    expect(failedUpdate.error).toBeNull();
    expect(failedUpdate.data).toMatchObject({
      status: "failed",
      failed_at: "2026-07-11T10:05:00+00:00",
      last_attempt_at: "2026-07-11T10:05:00+00:00",
      attempt_count: 1,
      last_error_code: "timeout",
    });

    createHiddenOrganizationAttempt();

    const hiddenRows = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id")
        .eq("organization_id", otherOrganizationId),
      "read hidden organization attempts",
    );

    expect(hiddenRows).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("shows empty state and only the ten latest organization email attempts", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  const brevoRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().startsWith("https://api.brevo.com/")) {
      brevoRequests.push(request.url());
    }
  });

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto("/settings/organization");
    await expect(
      page.getByRole("heading", { name: "Dernières tentatives d’e-mail" }),
    ).toBeVisible();
    await expect(
      page.getByText("Aucune tentative d’e-mail enregistrée pour cette organisation."),
    ).toBeVisible();

    const attempts = Array.from({ length: 11 }, (_, index) => ({
      id: qaAttemptIds[index + 3],
      organization_id: organizationId,
      contact_id: contactId,
      message_type: `qa_message_${index + 1}`,
      recipient_email: `qa-email-history-${index + 1}@example.invalid`,
      recipient_name: `QA Historique ${index + 1}`,
      idempotency_key: `email-delivery-foundation:history-${index + 1}`,
      status: index % 3 === 0 ? "sent" : index % 3 === 1 ? "failed" : "pending",
      attempt_count: index % 3 === 2 ? 0 : 1,
      sent_at: index % 3 === 0 ? `2026-07-11T10:${String(index).padStart(2, "0")}:00.000Z` : null,
      created_at: `2026-07-11T09:${String(index).padStart(2, "0")}:00.000Z`,
      created_by: ownerId,
      updated_by: ownerId,
    }));

    const { error } = await supabase.from("email_delivery_attempts").insert(attempts);
    expect(error).toBeNull();

    await page.goto("/settings/organization");
    await expect(page.getByText("QA Historique 11")).toBeVisible();
    await expect(page.getByText("QA Historique 2")).toBeVisible();
    await expect(page.getByText("QA Historique 1", { exact: true })).not.toBeVisible();
    await expect(page.getByText("email-delivery-foundation:history")).not.toBeVisible();
    await expect(page.getByText("variables_snapshot")).not.toBeVisible();
    expect(brevoRequests).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});
