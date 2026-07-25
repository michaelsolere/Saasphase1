import { promoteContactJourneyRole } from "@/features/contacts/roles";
import { createClient } from "@/lib/supabase/server";
import { isFinalReservationStatus } from "@/features/reservations/statuses";

import { readDepositSettingsForOrganization } from "@/features/payments/deposit-thresholds";
import {
  evaluateReservationHolderPromotion,
  isEligiblePreReservationDepositType,
} from "@/features/payments/pre-reservation-deposit";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ReservationHolderPromotionResult =
  | {
      outcome: "promoted";
      wasAdded: boolean;
      eligibleReceivedCents: number;
    }
  | {
      outcome: "below_threshold" | "ineligible" | "skipped_non_eligible_type";
      eligibleReceivedCents: number;
    }
  | {
      outcome: "error";
      eligibleReceivedCents: number;
    };

/**
 * After an admissible deposit payment is marked paid, recalculate the dossier
 * total and promote to reservation_holder when completeDepositCents is reached.
 * Idempotent via promoteContactJourneyRole + unique active role index.
 */
export async function maybePromoteReservationHolderAfterCompleteDeposit({
  supabase,
  organizationId,
  reservationId,
  userId,
  paymentType,
}: {
  supabase: SupabaseServerClient;
  organizationId: string;
  reservationId: string;
  userId: string;
  paymentType: string | null | undefined;
}): Promise<ReservationHolderPromotionResult> {
  if (!isEligiblePreReservationDepositType(paymentType)) {
    return {
      outcome: "skipped_non_eligible_type",
      eligibleReceivedCents: 0,
    };
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, organization_id, contact_id, status")
    .eq("id", reservationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (reservationError) {
    console.error(
      "reservation_holder promotion: reservation read failed",
      reservationError,
    );
    return { outcome: "error", eligibleReceivedCents: 0 };
  }

  if (!reservation?.contact_id) {
    return { outcome: "ineligible", eligibleReceivedCents: 0 };
  }

  const isFinalStatus = isFinalReservationStatus(reservation.status);
  const depositSettings = await readDepositSettingsForOrganization({
    supabase,
    organizationId,
  });

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("amount_cents, payment_type, status")
    .eq("organization_id", organizationId)
    .eq("reservation_id", reservationId)
    .is("deleted_at", null);

  if (paymentsError) {
    console.error(
      "reservation_holder promotion: payments read failed",
      paymentsError,
    );
    return { outcome: "error", eligibleReceivedCents: 0 };
  }

  const evaluation = evaluateReservationHolderPromotion({
    payments: payments ?? [],
    depositSettings,
    reservationStatus: reservation.status,
    contactId: reservation.contact_id,
    isFinalStatus,
  });

  if (evaluation.outcome !== "promote") {
    return {
      outcome: evaluation.outcome,
      eligibleReceivedCents: evaluation.eligibleReceivedCents,
    };
  }

  const promotion = await promoteContactJourneyRole({
    supabase,
    organizationId,
    contactId: reservation.contact_id,
    role: "reservation_holder",
    userId,
  });

  if (promotion.error || promotion.deactivationError) {
    console.error(
      "reservation_holder promotion failed",
      promotion.error ?? promotion.deactivationError,
    );
    return {
      outcome: "error",
      eligibleReceivedCents: evaluation.eligibleReceivedCents,
    };
  }

  return {
    outcome: "promoted",
    wasAdded: promotion.wasAdded,
    eligibleReceivedCents: evaluation.eligibleReceivedCents,
  };
}
