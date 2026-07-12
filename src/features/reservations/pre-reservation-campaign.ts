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

type SendPreReservationCampaignEmail = (input: {
  reservationId: string;
}) => Promise<PreReservationCampaignSendResult>;

async function compensateUnsentPreReservationCreation({
  supabase,
  result,
  userId,
}: {
  supabase: Supabase;
  result: PreReservationCampaignRpcResult;
  userId: string;
}) {
  if (!result.application_id || !result.reservation_id || !result.payment_id) {
    return { ok: false as const };
  }

  const now = new Date().toISOString();

  const { data: updatedPayment, error: paymentError } = await supabase
    .from("payments")
    .update({
      deleted_at: now,
      updated_at: now,
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
    return { ok: false as const };
  }

  const { data: updatedReservation, error: reservationError } = await supabase
    .from("reservations")
    .update({
      deleted_at: now,
      updated_at: now,
      updated_by: userId,
    })
    .eq("id", result.reservation_id)
    .eq("application_id", result.application_id)
    .eq("status", "pre_reservation_requested")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (reservationError || !updatedReservation) {
    console.error("pre-reservation campaign reservation compensation failed:", {
      applicationId: result.application_id,
      reservationId: result.reservation_id,
      paymentId: result.payment_id,
      error: reservationError,
    });
    return { ok: false as const };
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
    return { ok: false as const };
  }

  return { ok: true as const };
}

export async function runPreReservationCampaignForApplications({
  supabase,
  applications,
  sendEmail,
}: {
  supabase: Supabase;
  applications: PreReservationCampaignApplication[];
  sendEmail: SendPreReservationCampaignEmail;
}): Promise<PreReservationCampaignResult> {
  let reservationsPreparedCount = 0;
  let paymentsCreatedCount = 0;
  let compensatedNotSentCreationCount = 0;
  let emailsSentCount = 0;
  let emailsAlreadySentCount = 0;
  let emailsFailedCount = 0;
  let emailsMissingCount = 0;
  let emailsInProgressCount = 0;
  let missingTemplateCount = 0;
  let brevoNotConfiguredCount = 0;
  let ignoredDraftConflictCount = 0;
  let conflictCount = 0;
  let errorCount = 0;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  for (const app of applications) {
    const { data, error } = await supabase.rpc(
      "create_pre_reservation_request_for_application",
      {
        p_application_id: app.id,
        p_target_litter_id: app.target_litter_id ?? undefined,
        p_target_litter_group_id: app.target_litter_group_id ?? undefined,
      },
    );

    if (error) {
      console.error("create_pre_reservation_request_for_application failed:", {
        applicationId: app.id,
        error,
      });
      errorCount++;
      continue;
    }

    const result = data?.[0] as PreReservationCampaignRpcResult | undefined;

    if (!result || !result.reservation_id || !result.payment_id) {
      errorCount++;
      continue;
    }

    if (result.outcome === "created" || result.outcome === "already_exists") {
      const { data: storedReservation, error: reservationReadError } =
        await supabase
          .from("reservations")
          .select("id, status, application_id")
          .eq("id", result.reservation_id)
          .eq("application_id", app.id)
          .is("deleted_at", null)
          .maybeSingle();

      const { data: storedPayment, error: paymentReadError } = await supabase
        .from("payments")
        .select("id, reservation_id")
        .eq("id", result.payment_id)
        .eq("reservation_id", result.reservation_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (
        reservationReadError ||
        paymentReadError ||
        !storedReservation ||
        !storedPayment ||
        storedReservation.status !== "pre_reservation_requested"
      ) {
        errorCount++;
        continue;
      }

      const sendResult = await sendEmail({ reservationId: storedReservation.id });

      if (sendResult.status === "success") {
        emailsSentCount++;
      } else if (sendResult.status === "already_sent") {
        emailsAlreadySentCount++;
      } else if (sendResult.status === "in_progress") {
        emailsInProgressCount++;
      } else if (sendResult.status === "missing_email") {
        emailsMissingCount++;
      } else if (sendResult.status === "missing_template") {
        missingTemplateCount++;
      } else if (sendResult.status === "brevo_not_configured") {
        brevoNotConfiguredCount++;
      } else {
        emailsFailedCount++;
      }

      if (
        result.outcome === "created" &&
        result.reservation_created &&
        result.payment_created &&
        sendResult.deliveryState === "not_sent"
      ) {
        if (!user) {
          console.error("pre-reservation campaign compensation missing user:", {
            applicationId: app.id,
            reservationId: result.reservation_id,
            paymentId: result.payment_id,
          });
          errorCount++;
          continue;
        }

        const compensation = await compensateUnsentPreReservationCreation({
          supabase,
          result,
          userId: user.id,
        });

        if (!compensation.ok) {
          errorCount++;
        } else {
          compensatedNotSentCreationCount++;
        }

        continue;
      }

      reservationsPreparedCount++;
      if (result.payment_created) {
        paymentsCreatedCount++;
      }
    } else if (result.outcome === "conflict") {
      if (result.reason === "draft_reservation_exists") {
        ignoredDraftConflictCount++;
      } else {
        conflictCount++;
      }
    } else if (result.outcome === "ineligible") {
      continue;
    } else {
      errorCount++;
    }
  }

  return {
    reservationsPreparedCount,
    paymentsCreatedCount,
    compensatedNotSentCreationCount,
    emailsSentCount,
    emailsAlreadySentCount,
    emailsFailedCount,
    emailsMissingCount,
    emailsInProgressCount,
    missingTemplateCount,
    brevoNotConfiguredCount,
    ignoredDraftConflictCount,
    conflictCount,
    errorCount,
  };
}
