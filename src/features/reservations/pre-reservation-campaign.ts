import type { SupabaseClient } from "@supabase/supabase-js";

import type { PreReservationEmailDeliveryState } from "@/features/communications/pre-reservation-email-core";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type PreReservationCampaignApplication = {
  id: string;
  species: string | null;
  breed: string | null;
  desired_sex_preference: string | null;
  target_litter_id: string | null;
  target_litter_group_id: string | null;
};

export type PreReservationCampaignResult = {
  reservationsPreparedCount: number;
  paymentsCreatedCount: number;
  compensatedNotSentCreationCount: number;
  emailsSentCount: number;
  emailsAlreadySentCount: number;
  emailsFailedCount: number;
  emailsMissingCount: number;
  emailsInProgressCount: number;
  uncertainCount: number;
  missingTemplateCount: number;
  brevoNotConfiguredCount: number;
  ignoredDraftConflictCount: number;
  conflictCount: number;
  errorCount: number;
};

export type PreReservationCampaignSendResult = {
  status:
    | "success"
    | "already_sent"
    | "in_progress"
    | "failed"
    | "not_eligible"
    | "missing_email"
    | "missing_payment"
    | "missing_template"
    | "brevo_not_configured";
  deliveryState: PreReservationEmailDeliveryState;
  attemptId?: string;
  errorCode?: string;
  rpcOutcome?: string | null;
  rpcReason?: string | null;
  reservationPrepared?: boolean;
  paymentCreated?: boolean;
  compensated?: boolean;
};

type PreReservationCampaignRpcResult = {
  outcome: string | null;
  application_id: string | null;
  reservation_id: string | null;
  payment_id: string | null;
  reservation_created: boolean | null;
  payment_created: boolean | null;
  reason: string | null;
};

async function restorePaymentAfterReservationCompensationFailure({
  supabase,
  result,
  paymentDeletedAt,
  userId,
}: {
  supabase: Supabase;
  result: PreReservationCampaignRpcResult & {
    application_id: string;
    reservation_id: string;
    payment_id: string;
  };
  paymentDeletedAt: string;
  userId: string;
}) {
  const { data: restoredPayment, error: restoreError } = await supabase
    .from("payments")
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", result.payment_id)
    .eq("reservation_id", result.reservation_id)
    .eq("deleted_at", paymentDeletedAt)
    .select("id")
    .maybeSingle();

  const { count: activePaymentsCount, error: activePaymentReadError } =
    await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("id", result.payment_id)
      .eq("reservation_id", result.reservation_id)
      .is("deleted_at", null);

  const restored = Boolean(
    restoredPayment &&
      !restoreError &&
      !activePaymentReadError &&
      activePaymentsCount === 1,
  );

  console.error("pre-reservation campaign payment compensation restored:", {
    applicationId: result.application_id,
    reservationId: result.reservation_id,
    paymentId: result.payment_id,
    paymentDeletedAt,
    restored,
    restoreError,
    activePaymentReadError,
    activePaymentsCount,
  });

  return { ok: restored };
}

export async function compensateUnsentPreReservationCreation({
  supabase,
  result,
  userId,
}: {
  supabase: Supabase;
  result: PreReservationCampaignRpcResult;
  userId: string;
}) {
  if (!result.application_id || !result.reservation_id || !result.payment_id) {
    return { ok: false as const, errorCode: "invalid_compensation_input" };
  }

  const paymentDeletedAt = new Date().toISOString();

  const { data: updatedPayment, error: paymentError } = await supabase
    .from("payments")
    .update({
      deleted_at: paymentDeletedAt,
      updated_at: paymentDeletedAt,
      updated_by: userId,
    })
    .eq("id", result.payment_id)
    .eq("reservation_id", result.reservation_id)
    .in("status", ["requested", "pending", "partially_paid"])
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (paymentError || !updatedPayment) {
    console.error("pre-reservation campaign payment compensation failed:", {
      applicationId: result.application_id,
      reservationId: result.reservation_id,
      paymentId: result.payment_id,
      error: paymentError,
    });
    return { ok: false as const, errorCode: "payment_compensation_failed" };
  }

  const { data: updatedReservation, error: reservationError } = await supabase
    .from("reservations")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", result.reservation_id)
    .eq("application_id", result.application_id)
    .eq("status", "pre_reservation_requested")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (reservationError || !updatedReservation) {
    const restoration = await restorePaymentAfterReservationCompensationFailure({
      supabase,
      result: {
        ...result,
        application_id: result.application_id,
        reservation_id: result.reservation_id,
        payment_id: result.payment_id,
      },
      paymentDeletedAt,
      userId,
    });

    console.error("pre-reservation campaign reservation compensation failed:", {
      applicationId: result.application_id,
      reservationId: result.reservation_id,
      paymentId: result.payment_id,
      error: reservationError,
      paymentRestored: restoration.ok,
    });
    return { ok: false as const, errorCode: "reservation_compensation_failed" };
  }

  const { count: activePaymentsCount, error: activePaymentsError } =
    await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("id", result.payment_id)
      .eq("reservation_id", result.reservation_id)
      .is("deleted_at", null);

  const { count: activeReservationsCount, error: activeReservationsError } =
    await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("id", result.reservation_id)
      .eq("application_id", result.application_id)
      .is("deleted_at", null);

  if (
    activePaymentsError ||
    activeReservationsError ||
    activePaymentsCount !== 0 ||
    activeReservationsCount !== 0
  ) {
    console.error("pre-reservation campaign compensation verification failed:", {
      applicationId: result.application_id,
      reservationId: result.reservation_id,
      paymentId: result.payment_id,
      activePaymentsCount,
      activeReservationsCount,
      activePaymentsError,
      activeReservationsError,
    });
    return { ok: false as const, errorCode: "compensation_verification_failed" };
  }

  return { ok: true as const };
}

export async function runPreReservationCampaignForApplications({
  applications,
  sendEmail,
}: {
  supabase: Supabase;
  applications: PreReservationCampaignApplication[];
  sendEmail: (input: {
    applicationId: string;
    targetLitterId: string | null;
    targetLitterGroupId: string | null;
  }) => Promise<PreReservationCampaignSendResult>;
}): Promise<PreReservationCampaignResult> {
  const result: PreReservationCampaignResult = {
    reservationsPreparedCount: 0,
    paymentsCreatedCount: 0,
    compensatedNotSentCreationCount: 0,
    emailsSentCount: 0,
    emailsAlreadySentCount: 0,
    emailsFailedCount: 0,
    emailsMissingCount: 0,
    emailsInProgressCount: 0,
    uncertainCount: 0,
    missingTemplateCount: 0,
    brevoNotConfiguredCount: 0,
    ignoredDraftConflictCount: 0,
    conflictCount: 0,
    errorCount: 0,
  };

  for (const app of applications) {
    const sent = await sendEmail({
      applicationId: app.id,
      targetLitterId: app.target_litter_id,
      targetLitterGroupId: app.target_litter_group_id,
    });

    if (sent.reservationPrepared && !sent.compensated) {
      result.reservationsPreparedCount++;
    }
    if (sent.paymentCreated && !sent.compensated) {
      result.paymentsCreatedCount++;
    }
    if (sent.compensated) {
      result.compensatedNotSentCreationCount++;
    }

    if (sent.status === "success") result.emailsSentCount++;
    else if (sent.status === "already_sent") result.emailsAlreadySentCount++;
    else if (sent.status === "in_progress") result.emailsInProgressCount++;
    else if (sent.status === "missing_email") result.emailsMissingCount++;
    else if (sent.status === "missing_template") result.missingTemplateCount++;
    else if (sent.status === "brevo_not_configured") result.brevoNotConfiguredCount++;
    else if (sent.rpcOutcome === "conflict" && sent.rpcReason === "draft_reservation_exists") result.ignoredDraftConflictCount++;
    else if (sent.rpcOutcome === "conflict") result.conflictCount++;
    else if (sent.rpcOutcome === "ineligible") continue;
    else if (sent.deliveryState === "uncertain") result.uncertainCount++;
    else result.emailsFailedCount++;
  }

  return result;
}
