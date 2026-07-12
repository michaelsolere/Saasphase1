import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { runPreReservationCampaignForApplications } from "../../src/features/reservations/pre-reservation-campaign";
import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";

const fixture = {
  groupId: "95000000-0000-4000-8000-000000000001",
  litterId: "95000000-0000-4000-8000-000000000002",
  contactIds: [
    "95000000-0000-4000-8000-000000000011",
    "95000000-0000-4000-8000-000000000012",
    "95000000-0000-4000-8000-000000000013",
    "95000000-0000-4000-8000-000000000014",
    "95000000-0000-4000-8000-000000000015",
    "95000000-0000-4000-8000-000000000016",
    "95000000-0000-4000-8000-000000000017",
  ],
  applicationIds: {
    success: "95000000-0000-4000-8000-000000000021",
    missing: "95000000-0000-4000-8000-000000000022",
    rejected: "95000000-0000-4000-8000-000000000023",
    alreadyExists: "95000000-0000-4000-8000-000000000024",
    uncertain: "95000000-0000-4000-8000-000000000025",
    retry: "95000000-0000-4000-8000-000000000026",
    partialFailure: "95000000-0000-4000-8000-000000000027",
  },
  existingReservationId: "95000000-0000-4000-8000-000000000031",
  existingPaymentId: "95000000-0000-4000-8000-000000000032",
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

function cleanupFixture() {
  const applicationIds = Object.values(fixture.applicationIds);

  runSql(`
    with target_reservations as (
      select id from public.reservations
      where application_id in (${sqlList(applicationIds)})
         or id = '${fixture.existingReservationId}'::uuid
    )
    delete from public.email_delivery_attempts
    where reservation_id in (select id from target_reservations);

    with target_reservations as (
      select id from public.reservations
      where application_id in (${sqlList(applicationIds)})
         or id = '${fixture.existingReservationId}'::uuid
    )
    delete from public.payments
    where reservation_id in (select id from target_reservations)
       or id = '${fixture.existingPaymentId}'::uuid;

    delete from public.reservations
    where application_id in (${sqlList(applicationIds)})
       or id = '${fixture.existingReservationId}'::uuid;

    delete from public.contact_roles
    where contact_id in (${sqlList(fixture.contactIds)});

    delete from public.applications
    where id in (${sqlList(applicationIds)});

    delete from public.contacts
    where id in (${sqlList(fixture.contactIds)});

    delete from public.litters
    where id = '${fixture.litterId}'::uuid;

    delete from public.litter_groups
    where id = '${fixture.groupId}'::uuid;
  `);

  const remaining = Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where reservation_id in (
          select id from public.reservations
          where application_id in (${sqlList(applicationIds)})
             or id = '${fixture.existingReservationId}'::uuid
        )
        union all
        select id::text from public.payments
        where id = '${fixture.existingPaymentId}'::uuid
           or reservation_id in (
             select id from public.reservations
             where application_id in (${sqlList(applicationIds)})
                or id = '${fixture.existingReservationId}'::uuid
           )
        union all
        select id::text from public.reservations
        where application_id in (${sqlList(applicationIds)})
           or id = '${fixture.existingReservationId}'::uuid
        union all
        select id::text from public.contact_roles
        where contact_id in (${sqlList(fixture.contactIds)})
        union all
        select id::text from public.applications
        where id in (${sqlList(applicationIds)})
        union all
        select id::text from public.contacts
        where id in (${sqlList(fixture.contactIds)})
        union all
        select id::text from public.litters
        where id = '${fixture.litterId}'::uuid
        union all
        select id::text from public.litter_groups
        where id = '${fixture.groupId}'::uuid
      ) remaining;
    `),
  );

  if (remaining !== 0) {
    throw new Error(`cleanup campaign compensation: ${remaining} row(s) remain`);
  }
}

function createFixture() {
  cleanupFixture();

  const applicationIds = Object.values(fixture.applicationIds);

  runSql(`
    insert into public.litter_groups (
      id, organization_id, name, species, status, created_by, updated_by
    )
    values (
      '${fixture.groupId}'::uuid, '${organizationId}'::uuid,
      'E2E compensation groupe', 'dog', 'open_for_applications',
      '${userId}'::uuid, '${userId}'::uuid
    );

    insert into public.litters (
      id, organization_id, litter_group_id, name, species, breed, status,
      created_by, updated_by
    )
    values (
      '${fixture.litterId}'::uuid, '${organizationId}'::uuid,
      '${fixture.groupId}'::uuid, 'E2E compensation portée', 'dog',
      'Golden Retriever', 'pregnancy_confirmed',
      '${userId}'::uuid, '${userId}'::uuid
    );

    insert into public.contacts (
      id, organization_id, contact_type, first_name, last_name, display_name,
      email, origin_channel, primary_status, created_by, updated_by
    )
    values
      ('${fixture.contactIds[0]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Success', 'E2E Campaign Success', 'campaign-success@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[1]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Missing', 'E2E Campaign Missing', 'campaign-missing@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[2]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Rejected', 'E2E Campaign Rejected', 'campaign-rejected@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[3]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Existing', 'E2E Campaign Existing', 'campaign-existing@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[4]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Uncertain', 'E2E Campaign Uncertain', 'campaign-uncertain@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[5]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Retry', 'E2E Campaign Retry', 'campaign-retry@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${fixture.contactIds[6]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Partial', 'E2E Campaign Partial', 'campaign-partial@example.invalid', 'manual', 'active', '${userId}'::uuid, '${userId}'::uuid);

    insert into public.contact_roles (
      organization_id, contact_id, role, started_at, created_by, updated_by
    )
    select '${organizationId}'::uuid, id, 'candidate', '2026-07-12',
      '${userId}'::uuid, '${userId}'::uuid
    from public.contacts
    where id in (${sqlList(fixture.contactIds)});

    insert into public.applications (
      id, organization_id, contact_id, species, breed, desired_litter_id,
      desired_litter_group_id, desired_sex_preference, desired_quantity,
      project_description, status, reviewed_at, reviewed_by, created_by,
      updated_by
    )
    select app_id, '${organizationId}'::uuid, contact_id, 'dog',
      'Golden Retriever', '${fixture.litterId}'::uuid, '${fixture.groupId}'::uuid,
      'no_preference', 1, 'Fixture campagne compensation.', 'qualified',
      '2026-07-12 08:00:00+00', '${userId}'::uuid, '${userId}'::uuid,
      '${userId}'::uuid
    from (
      values
        ('${applicationIds[0]}'::uuid, '${fixture.contactIds[0]}'::uuid),
        ('${applicationIds[1]}'::uuid, '${fixture.contactIds[1]}'::uuid),
        ('${applicationIds[2]}'::uuid, '${fixture.contactIds[2]}'::uuid),
        ('${applicationIds[3]}'::uuid, '${fixture.contactIds[3]}'::uuid),
        ('${applicationIds[4]}'::uuid, '${fixture.contactIds[4]}'::uuid),
        ('${applicationIds[5]}'::uuid, '${fixture.contactIds[5]}'::uuid),
        ('${applicationIds[6]}'::uuid, '${fixture.contactIds[6]}'::uuid)
    ) as source(app_id, contact_id);

    insert into public.reservations (
      id, organization_id, contact_id, application_id, litter_group_id,
      litter_id, species, breed, reserved_sex_preference, status,
      pre_reservation_deadline, currency, created_by, updated_by
    )
    values (
      '${fixture.existingReservationId}'::uuid, '${organizationId}'::uuid,
      '${fixture.contactIds[3]}'::uuid, '${fixture.applicationIds.alreadyExists}'::uuid,
      '${fixture.groupId}'::uuid, '${fixture.litterId}'::uuid, 'dog',
      'Golden Retriever', 'no_preference', 'pre_reservation_requested',
      '2026-07-27 12:00:00+00', 'EUR', '${userId}'::uuid, '${userId}'::uuid
    );

    insert into public.payments (
      id, organization_id, contact_id, reservation_id, amount_cents, currency,
      payment_type, status, requested_at, due_date, payment_method,
      created_by, updated_by
    )
    values (
      '${fixture.existingPaymentId}'::uuid, '${organizationId}'::uuid,
      '${fixture.contactIds[3]}'::uuid, '${fixture.existingReservationId}'::uuid,
      25000, 'EUR', 'arrhes', 'requested', '2026-07-12 08:00:00+00',
      '2026-07-27', 'bank_transfer', '${userId}'::uuid, '${userId}'::uuid
    );
  `);
}

async function runCampaignFor(
  supabase: SupabaseTestClient,
  applicationId: string,
  status:
    | "success"
    | "missing_email"
    | "failed"
    | "already_sent"
    | "in_progress",
  deliveryState: "sent" | "not_sent" | "in_progress" | "uncertain",
) {
  return runPreReservationCampaignForApplications({
    supabase,
    applications: [
      {
        id: applicationId,
        species: "dog",
        breed: "Golden Retriever",
        desired_sex_preference: "no_preference",
        target_litter_id: fixture.litterId,
        target_litter_group_id: fixture.groupId,
      },
    ],
    sendEmail: async ({ reservationId }) => {
      if (status === "failed") {
        const reservation = expectSupabaseData(
          await supabase
            .from("reservations")
            .select("organization_id, contact_id, litter_id, litter_group_id")
            .eq("id", reservationId)
            .maybeSingle(),
          "read reservation for failed attempt fixture",
        );

        const { error: attemptError } = await supabase
          .from("email_delivery_attempts")
          .insert({
            organization_id: reservation.organization_id,
            contact_id: reservation.contact_id,
            reservation_id: reservationId,
            litter_id: reservation.litter_id,
            litter_group_id: reservation.litter_group_id,
            message_type: "pre_reservation",
            recipient_email: "campaign-rejected@example.invalid",
            recipient_name: "E2E Campaign Rejected",
            subject_snapshot: "Pré-réservation",
            variables_snapshot: {},
            idempotency_key: `e2e-provider-rejected-${reservationId}`,
            status: "failed",
            attempt_count: 1,
            failed_at: new Date().toISOString(),
            last_error_code: "api_error",
            created_by: userId,
            updated_by: userId,
          });

        if (attemptError) {
          throw new Error(`insert failed attempt: ${attemptError.message}`);
        }
      }

      return {
        status,
        deliveryState,
        ...(status === "failed" ? { errorCode: "api_error" } : {}),
      };
    },
  });
}

async function activeReservationRows(
  supabase: SupabaseTestClient,
  applicationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("reservations")
      .select("id, status")
      .eq("application_id", applicationId)
      .is("deleted_at", null),
    "read active reservations",
  );
}

async function activePaymentRows(
  supabase: SupabaseTestClient,
  reservationId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("payments")
      .select("id, status")
      .eq("reservation_id", reservationId)
      .is("deleted_at", null),
    "read active payments",
  );
}

test("pre-reservation campaign compensates newly created requests only when email was not sent", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();

  try {
    const success = await runCampaignFor(
      supabase,
      fixture.applicationIds.success,
      "success",
      "sent",
    );
    expect(success.reservationsPreparedCount).toBe(1);
    expect(success.paymentsCreatedCount).toBe(1);
    let reservations = await activeReservationRows(
      supabase,
      fixture.applicationIds.success,
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe("pre_reservation_requested");
    let payments = await activePaymentRows(supabase, reservations[0].id);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("requested");

    const missing = await runCampaignFor(
      supabase,
      fixture.applicationIds.missing,
      "missing_email",
      "not_sent",
    );
    expect(missing.reservationsPreparedCount).toBe(0);
    expect(missing.paymentsCreatedCount).toBe(0);
    expect(missing.compensatedNotSentCreationCount).toBe(1);
    reservations = await activeReservationRows(supabase, fixture.applicationIds.missing);
    expect(reservations).toHaveLength(0);

    const rejected = await runCampaignFor(
      supabase,
      fixture.applicationIds.rejected,
      "failed",
      "not_sent",
    );
    expect(rejected.compensatedNotSentCreationCount).toBe(1);
    reservations = await activeReservationRows(supabase, fixture.applicationIds.rejected);
    expect(reservations).toHaveLength(0);
    const failedAttempts = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id, status")
        .eq("message_type", "pre_reservation")
        .eq("status", "failed")
        .like("idempotency_key", "e2e-provider-rejected-%"),
      "read failed attempts after compensation",
    );
    expect(failedAttempts).toHaveLength(1);

    const existing = await runCampaignFor(
      supabase,
      fixture.applicationIds.alreadyExists,
      "missing_email",
      "not_sent",
    );
    expect(existing.reservationsPreparedCount).toBe(1);
    expect(existing.paymentsCreatedCount).toBe(0);
    reservations = await activeReservationRows(
      supabase,
      fixture.applicationIds.alreadyExists,
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].id).toBe(fixture.existingReservationId);

    const uncertain = await runCampaignFor(
      supabase,
      fixture.applicationIds.uncertain,
      "failed",
      "uncertain",
    );
    expect(uncertain.reservationsPreparedCount).toBe(1);
    reservations = await activeReservationRows(
      supabase,
      fixture.applicationIds.uncertain,
    );
    expect(reservations).toHaveLength(1);

    const firstRetry = await runCampaignFor(
      supabase,
      fixture.applicationIds.retry,
      "missing_email",
      "not_sent",
    );
    expect(firstRetry.compensatedNotSentCreationCount).toBe(1);
    reservations = await activeReservationRows(supabase, fixture.applicationIds.retry);
    expect(reservations).toHaveLength(0);

    const secondRetry = await runCampaignFor(
      supabase,
      fixture.applicationIds.retry,
      "success",
      "sent",
    );
    expect(secondRetry.reservationsPreparedCount).toBe(1);
    expect(secondRetry.paymentsCreatedCount).toBe(1);
    reservations = await activeReservationRows(supabase, fixture.applicationIds.retry);
    expect(reservations).toHaveLength(1);
    payments = await activePaymentRows(supabase, reservations[0].id);
    expect(payments).toHaveLength(1);
  } finally {
    cleanupFixture();
  }
});

test("pre-reservation campaign restores payment when reservation compensation fails after concurrent status change", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();

  try {
    const result = await runPreReservationCampaignForApplications({
      supabase,
      applications: [
        {
          id: fixture.applicationIds.partialFailure,
          species: "dog",
          breed: "Golden Retriever",
          desired_sex_preference: "no_preference",
          target_litter_id: fixture.litterId,
          target_litter_group_id: fixture.groupId,
        },
      ],
      sendEmail: async ({ reservationId }) => {
        const { error } = await supabase
          .from("reservations")
          .update({
            status: "active",
            updated_at: new Date().toISOString(),
            updated_by: userId,
          })
          .eq("id", reservationId)
          .eq("status", "pre_reservation_requested")
          .is("deleted_at", null);

        if (error) {
          throw new Error(`simulate concurrent reservation update: ${error.message}`);
        }

        return { status: "missing_email", deliveryState: "not_sent" };
      },
    });

    expect(result.reservationsPreparedCount).toBe(0);
    expect(result.paymentsCreatedCount).toBe(0);
    expect(result.compensatedNotSentCreationCount).toBe(0);
    expect(result.errorCount).toBe(1);

    const reservations = await activeReservationRows(
      supabase,
      fixture.applicationIds.partialFailure,
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0].status).toBe("active");

    const payments = await activePaymentRows(supabase, reservations[0].id);
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("requested");
  } finally {
    cleanupFixture();
  }
});
