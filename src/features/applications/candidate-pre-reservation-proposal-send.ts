import type { SupabaseClient } from "@supabase/supabase-js";

import type { SendPreReservationEmailResult } from "@/features/communications/pre-reservation-email-core";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

type RpcRow = {
  outcome: string;
  application_id?: string | null;
  status?: string | null;
  reason?: string | null;
  recipient_email?: string | null;
  target_litter_id?: string | null;
  target_litter_group_id?: string | null;
};

export type CandidateProposalSendResult = {
  status:
    | "sent"
    | "already_sent"
    | "in_progress"
    | "stale"
    | "failed";
  reason?: string | null;
};

function rpcClient(supabase: Supabase) {
  return supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: RpcRow[] | null; error: unknown }>;
}

async function readCreatedResources(
  supabase: Supabase,
  applicationId: string,
) {
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id")
    .eq("application_id", applicationId)
    .eq("status", "pre_reservation_requested")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!reservation) {
    return { reservationId: null, paymentId: null };
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("reservation_id", reservation.id)
    .in("payment_type", ["pre_reservation_deposit_refundable", "arrhes"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    reservationId: reservation.id,
    paymentId: payment?.id ?? null,
  };
}

export async function sendPreparedPreReservationProposal(
  input: { proposalId: string },
  options: {
    supabase: Supabase;
    sendEmail: (input: {
      applicationId: string;
      targetLitterId?: string | null;
      targetLitterGroupId?: string | null;
    }) => Promise<SendPreReservationEmailResult>;
    commandId: () => string;
  },
): Promise<CandidateProposalSendResult> {
  const rpc = rpcClient(options.supabase);
  const claimed = await rpc("claim_pre_reservation_proposal_send", {
    p_proposal_id: input.proposalId,
    p_client_command_id: options.commandId(),
  });
  const claim = claimed.data?.[0];

  if (claimed.error || !claim) {
    return { status: "failed", reason: "claim_failed" };
  }
  if (claim.outcome === "already_sent") {
    return { status: "already_sent" };
  }
  if (claim.outcome === "in_progress") {
    return { status: "in_progress" };
  }
  if (claim.outcome === "reconciliation_required") {
    return { status: "in_progress", reason: claim.reason };
  }
  if (claim.outcome === "stale") {
    return { status: "stale", reason: claim.reason };
  }
  if (claim.outcome !== "claimed" || !claim.application_id) {
    return { status: "failed", reason: claim.reason ?? claim.outcome };
  }

  const sent = await options.sendEmail({
    applicationId: claim.application_id,
    targetLitterId: claim.target_litter_id,
    targetLitterGroupId: claim.target_litter_group_id,
  });
  const isSent = sent.status === "success" || sent.status === "already_sent";
  const deliveryState = isSent
    ? "sent"
    : sent.deliveryState === "uncertain" || sent.deliveryState === "in_progress"
      ? "uncertain"
      : "not_sent";
  const resources = await readCreatedResources(
    options.supabase,
    claim.application_id,
  );
  const completed = await rpc("complete_pre_reservation_proposal_send", {
    p_proposal_id: input.proposalId,
    p_delivery_state: deliveryState,
    p_delivery_attempt_id: sent.attemptId ?? null,
    p_reservation_id: resources.reservationId,
    p_payment_id: resources.paymentId,
    p_client_command_id: options.commandId(),
  });
  const completion = completed.data?.[0];

  if (completed.error || !completion || !["completed", "already_completed"].includes(completion.outcome)) {
    return { status: "failed", reason: completion?.reason ?? "completion_failed" };
  }
  if (deliveryState === "sent") {
    return { status: "sent" };
  }
  if (deliveryState === "uncertain") {
    return { status: "in_progress", reason: sent.errorCode };
  }
  return { status: "failed", reason: sent.errorCode ?? sent.status };
}
