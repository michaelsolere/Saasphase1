import { expect, test } from "@playwright/test";

import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

test("preparing a proposal snapshots the decision without creating journey resources", async () => {
  await withE2eFixtures(sql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8).replaceAll("-", "0");
    const groupId = fixtures.register(
      "litter_groups",
      `97000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
    );
    const litterId = fixtures.register(
      "litters",
      `97000000-0000-4001-8000-${suffix.padStart(12, "0")}`,
    );
    const contactId = fixtures.register(
      "contacts",
      `97000000-0000-4002-8000-${suffix.padStart(12, "0")}`,
    );
    const applicationId = fixtures.register(
      "applications",
      `97000000-0000-4003-8000-${suffix.padStart(12, "0")}`,
    );
    const roleId = fixtures.register(
      "contact_roles",
      `97000000-0000-4004-8000-${suffix.padStart(12, "0")}`,
    );
    const positioningCommandId = `97000000-0000-4005-8000-${suffix.padStart(12, "0")}`;
    const proposalCommandId = `97000000-0000-4006-8000-${suffix.padStart(12, "0")}`;
    const sendCommandId = `97000000-0000-4007-8000-${suffix.padStart(12, "0")}`;
    const completionCommandId = `97000000-0000-4008-8000-${suffix.padStart(12, "0")}`;
    const partialPaymentCommandId = `97000000-0000-4009-8000-${suffix.padStart(12, "0")}`;
    const completePaymentCommandId = `97000000-0000-4010-8000-${suffix.padStart(12, "0")}`;
    const expiredClaimCommandId = `97000000-0000-4011-8000-${suffix.padStart(12, "0")}`;
    const resolutionCommandId = `97000000-0000-4012-8000-${suffix.padStart(12, "0")}`;
    const retryClaimCommandId = `97000000-0000-4013-8000-${suffix.padStart(12, "0")}`;

    sql(`
      insert into public.litter_groups (
        id, organization_id, name, species, status, created_by, updated_by
      ) values (
        ${quote(groupId)}::uuid, ${quote(organizationId)}::uuid,
        'E2E propositions ${suffix}', 'dog', 'open_for_applications',
        ${quote(ownerId)}::uuid, ${quote(ownerId)}::uuid
      );
      insert into public.litters (
        id, organization_id, litter_group_id, name, species, breed, status,
        expected_birth_date, created_by, updated_by
      ) values (
        ${quote(litterId)}::uuid, ${quote(organizationId)}::uuid,
        ${quote(groupId)}::uuid, 'E2E gestation confirmée ${suffix}',
        'dog', 'Golden Retriever', 'pregnancy_confirmed', '2026-10-01',
        ${quote(ownerId)}::uuid, ${quote(ownerId)}::uuid
      );
      insert into public.contacts (
        id, organization_id, contact_type, first_name, last_name, display_name,
        email, origin_channel, primary_status, created_by, updated_by
      ) values (
        ${quote(contactId)}::uuid, ${quote(organizationId)}::uuid, 'person',
        'E2E', 'Proposition', 'E2E Proposition ${suffix}',
        'proposition-${suffix}@example.invalid', 'manual', 'active',
        ${quote(ownerId)}::uuid, ${quote(ownerId)}::uuid
      );
      insert into public.contact_roles (
        id, organization_id, contact_id, role, started_at, created_by, updated_by
      ) values (
        ${quote(roleId)}::uuid, ${quote(organizationId)}::uuid,
        ${quote(contactId)}::uuid, 'candidate', current_date,
        ${quote(ownerId)}::uuid, ${quote(ownerId)}::uuid
      );
      insert into public.applications (
        id, organization_id, contact_id, species, breed, desired_timing_mode,
        desired_litter_group_id, desired_litter_id, desired_sex_preference,
        desired_quantity, status, created_by, updated_by
      ) values (
        ${quote(applicationId)}::uuid, ${quote(organizationId)}::uuid,
        ${quote(contactId)}::uuid, 'dog', 'Golden Retriever', 'unknown',
        ${quote(groupId)}::uuid, ${quote(litterId)}::uuid, 'no_preference', 1,
        'qualified', ${quote(ownerId)}::uuid, ${quote(ownerId)}::uuid
      );
    `);

    const supabase = await createAuthenticatedSupabaseClient();
    const applicationBefore = expectSupabaseData(
      await supabase
        .from("applications")
        .select("updated_at")
        .eq("id", applicationId)
        .single(),
      "read application version before proposal preparation",
    );
    const expectedApplicationUpdatedAt = (
      applicationBefore as unknown as { updated_at: string } | null
    )?.updated_at;
    if (!expectedApplicationUpdatedAt) {
      throw new Error("application version missing before proposal preparation");
    }

    const rpc = supabase.rpc.bind(supabase) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
    const positioned = await rpc("update_candidate_positioning", {
      p_application_id: applicationId,
      p_expected_application_updated_at: expectedApplicationUpdatedAt,
      p_expected_positioning_revision: 0,
      p_desired_timing_mode: "season",
      p_desired_season: "autumn",
      p_desired_season_year: 2026,
      p_desired_not_before_date: null,
      p_target_litter_id: litterId,
      p_target_litter_group_id: groupId,
      p_client_command_id: positioningCommandId,
    });
    expect(positioned.error).toBeNull();
    expect(positioned.data?.[0]).toMatchObject({
      outcome: "updated",
      application_id: applicationId,
      positioning_revision: 1,
    });
    fixtures.register(
      "candidate_journey_events",
      String(positioned.data?.[0]?.event_id),
    );

    expect(() =>
      sql(`
        begin;
        set local role authenticated;
        select set_config('request.jwt.claim.sub', ${quote(ownerId)}, true);
        select set_config('app.candidate_positioning_write', 'on', true);
        update public.applications
        set desired_timing_mode = 'earliest',
            desired_season = null,
            desired_season_year = null,
            positioning_revision = positioning_revision + 1
        where id = ${quote(applicationId)}::uuid;
        rollback;
      `),
    ).toThrow(/candidate positioning must be changed through update_candidate_positioning/);

    const positionedApplication = expectSupabaseData(
      await supabase
        .from("applications")
        .select("updated_at")
        .eq("id", applicationId)
        .single(),
      "read positioned application version",
    ) as unknown as { updated_at: string } | null;
    if (!positionedApplication?.updated_at) {
      throw new Error("positioned application version missing");
    }

    const prepared = await rpc("prepare_pre_reservation_proposal", {
      p_application_id: applicationId,
      p_expected_application_updated_at: positionedApplication.updated_at,
      p_client_command_id: proposalCommandId,
    });

    expect(prepared.error).toBeNull();
    expect(prepared.data?.[0]).toMatchObject({
      outcome: "created",
      status: "ready",
      application_id: applicationId,
    });
    const proposalId = prepared.data?.[0]?.proposal_id;
    expect(typeof proposalId).toBe("string");
    fixtures.register("pre_reservation_proposals", String(proposalId));
    fixtures.register(
      "candidate_journey_events",
      String(prepared.data?.[0]?.event_id),
    );

    const proposal = expectSupabaseData(
      await (supabase.from as typeof supabase.from)("pre_reservation_proposals" as never)
        .select(
          "id,status,application_id,recipient_email,target_litter_id,target_litter_group_id,expected_amount_cents,variables_snapshot",
        )
        .eq("id", String(proposalId))
        .single(),
      "read prepared proposal",
    ) as unknown as Record<string, unknown>;
    expect(proposal).toMatchObject({
      status: "ready",
      application_id: applicationId,
      recipient_email: `proposition-${suffix}@example.invalid`,
      target_litter_id: litterId,
      target_litter_group_id: groupId,
      expected_amount_cents: 25_000,
    });

    expect(
      expectSupabaseData(
        await supabase
          .from("reservations")
          .select("id")
          .eq("application_id", applicationId)
          .is("deleted_at", null),
        "read journeys after proposal preparation",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase
          .from("payments")
          .select("id")
          .eq("contact_id", contactId)
          .is("deleted_at", null),
        "read payments after proposal preparation",
      ),
    ).toHaveLength(0);
    expect(
      expectSupabaseData(
        await (supabase.from as typeof supabase.from)("email_delivery_attempts")
          .select("id")
          .eq("contact_id", contactId)
          .is("deleted_at", null),
        "read delivery attempts after proposal preparation",
      ),
    ).toHaveLength(0);

    const claimed = await rpc("claim_pre_reservation_proposal_send", {
      p_proposal_id: proposalId,
      p_client_command_id: sendCommandId,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data?.[0]).toMatchObject({
      outcome: "claimed",
      status: "sending",
      application_id: applicationId,
    });
    fixtures.register(
      "candidate_journey_events",
      String(claimed.data?.[0]?.event_id),
    );

    const duplicateClaim = await rpc("claim_pre_reservation_proposal_send", {
      p_proposal_id: proposalId,
      p_client_command_id: sendCommandId,
    });
    expect(duplicateClaim.error).toBeNull();
    expect(duplicateClaim.data?.[0]?.outcome).toBe("in_progress");

    sql(`
      update public.pre_reservation_proposals
      set send_claimed_at = clock_timestamp() - interval '16 minutes'
      where id = ${quote(String(proposalId))}::uuid;
    `);
    const expiredClaim = await rpc("claim_pre_reservation_proposal_send", {
      p_proposal_id: proposalId,
      p_client_command_id: expiredClaimCommandId,
    });
    expect(expiredClaim.error).toBeNull();
    expect(expiredClaim.data?.[0]).toMatchObject({
      outcome: "reconciliation_required",
      status: "uncertain",
      reason: "send_claim_expired",
    });
    fixtures.register(
      "candidate_journey_events",
      String(expiredClaim.data?.[0]?.event_id),
    );

    const resolvedClaim = await rpc(
      "resolve_uncertain_pre_reservation_proposal_send",
      {
        p_proposal_id: proposalId,
        p_reason: "Contrôle Brevo effectué : aucun message envoyé.",
        p_client_command_id: resolutionCommandId,
      },
    );
    expect(resolvedClaim.error).toBeNull();
    expect(resolvedClaim.data?.[0]).toMatchObject({
      outcome: "resolved",
      status: "ready",
    });
    fixtures.register(
      "candidate_journey_events",
      String(resolvedClaim.data?.[0]?.event_id),
    );

    const retryClaim = await rpc("claim_pre_reservation_proposal_send", {
      p_proposal_id: proposalId,
      p_client_command_id: retryClaimCommandId,
    });
    expect(retryClaim.error).toBeNull();
    expect(retryClaim.data?.[0]).toMatchObject({
      outcome: "claimed",
      status: "sending",
    });
    fixtures.register(
      "candidate_journey_events",
      String(retryClaim.data?.[0]?.event_id),
    );

    const resources = await rpc("create_pre_reservation_request_for_application", {
      p_application_id: applicationId,
      p_target_litter_id: litterId,
      p_target_litter_group_id: groupId,
    });
    expect(resources.error).toBeNull();
    expect(resources.data?.[0]?.outcome).toBe("created");
    const reservationId = String(resources.data?.[0]?.reservation_id);
    const paymentId = String(resources.data?.[0]?.payment_id);
    fixtures.register("reservations", reservationId);
    fixtures.register("payments", paymentId);

    const completed = await rpc("complete_pre_reservation_proposal_send", {
      p_proposal_id: proposalId,
      p_delivery_state: "sent",
      p_delivery_attempt_id: null,
      p_reservation_id: reservationId,
      p_payment_id: paymentId,
      p_client_command_id: completionCommandId,
    });
    expect(completed.error).toBeNull();
    expect(completed.data?.[0]).toMatchObject({
      outcome: "completed",
      status: "sent",
    });
    fixtures.register(
      "candidate_journey_events",
      String(completed.data?.[0]?.event_id),
    );

    const sentProposal = expectSupabaseData(
      await (supabase.from as typeof supabase.from)("pre_reservation_proposals" as never)
        .select("status,sent_at")
        .eq("id", String(proposalId))
        .single(),
      "read sent proposal",
    ) as unknown as { status: string; sent_at: string | null };
    expect(sentProposal.status).toBe("sent");
    expect(sentProposal.sent_at).toBeTruthy();

    const partialReceipt = await rpc("record_candidate_journey_payment_receipt", {
      p_proposal_id: proposalId,
      p_payment_id: paymentId,
      p_received_amount_cents: 10_000,
      p_received_at: new Date().toISOString(),
      p_payment_method: "bank_transfer",
      p_reference: "VIR-E2E-PARTIAL",
      p_exception_reason: null,
      p_client_command_id: partialPaymentCommandId,
    });
    expect(partialReceipt.error).toBeNull();
    expect(partialReceipt.data?.[0]).toMatchObject({
      outcome: "partial",
      received_amount_cents: 10_000,
      applied_amount_cents: 10_000,
      unapplied_amount_cents: 0,
      journey_opened: false,
    });
    fixtures.register(
      "candidate_journey_events",
      String(partialReceipt.data?.[0]?.event_id),
    );

    expect(() =>
      sql(`
        begin;
        set local role authenticated;
        select set_config('request.jwt.claim.sub', ${quote(ownerId)}, true);
        select set_config('app.candidate_payment_receipt_write', 'on', true);
        update public.payments
        set received_amount_cents = 25000,
            applied_amount_cents = 25000,
            unapplied_amount_cents = 0
        where id = ${quote(paymentId)}::uuid;
        rollback;
      `),
    ).toThrow(/received payment allocation must be changed through record_candidate_journey_payment_receipt/);

    const completedReceipt = await rpc("record_candidate_journey_payment_receipt", {
      p_proposal_id: proposalId,
      p_payment_id: paymentId,
      p_received_amount_cents: 17_000,
      p_received_at: new Date().toISOString(),
      p_payment_method: "bank_transfer",
      p_reference: "VIR-E2E-COMPLETE",
      p_exception_reason: null,
      p_client_command_id: completePaymentCommandId,
    });
    expect(completedReceipt.error).toBeNull();
    expect(completedReceipt.data?.[0]).toMatchObject({
      outcome: "accepted",
      received_amount_cents: 27_000,
      applied_amount_cents: 25_000,
      unapplied_amount_cents: 2_000,
      journey_opened: true,
    });
    fixtures.register(
      "candidate_journey_events",
      String(completedReceipt.data?.[0]?.event_id),
    );

    const openedJourney = (expectSupabaseData(
      await supabase
        .from("reservations")
        .select("status")
        .eq("id", reservationId)
        .single(),
      "read opened adopter journey",
    ) as unknown) as { status: string } | null;
    if (!openedJourney) {
      throw new Error("opened adopter journey missing");
    }
    expect(openedJourney.status).toBe("pre_reservation_paid");
  });
});
