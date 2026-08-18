import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const CHOICE_APPOINTMENT_SESSION_COOKIE = "choice_appointment_session";

type Loose = SupabaseClient;

function service() {
  return createServiceRoleClient() as unknown as Loose;
}

export function hashChoiceAppointmentSession(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function exchangeChoiceAppointmentToken(input: { tokenHash: string; sessionHash: string }) {
  const result = await service().rpc("exchange_choice_appointment_public_token", {
    p_token_hash: input.tokenHash,
    p_session_hash: input.sessionHash,
  });
  const row = (result.data as Array<{ outcome: string; slot_id: string; session_expires_at: string }> | null)?.[0];
  return !result.error && row?.outcome === "opened"
    ? { slotId: row.slot_id, sessionExpiresAt: row.session_expires_at }
    : null;
}

export async function readChoiceAppointmentSession(sessionToken: string) {
  const result = await service().rpc("read_choice_appointment_public_session", {
    p_session_hash: hashChoiceAppointmentSession(sessionToken),
  });
  const row = (result.data as Array<{ outcome: string; slot_id: string; planned_at: string; response_kind: string | null }> | null)?.[0];
  return !result.error && row?.outcome === "available"
    ? { slotId: row.slot_id, plannedAt: row.planned_at, responseKind: row.response_kind }
    : null;
}

export async function respondChoiceAppointmentSession(input: {
  sessionToken: string;
  responseKind: "in_person" | "video" | "prechoice";
  clientCommandId: string;
}) {
  const result = await service().rpc("respond_choice_appointment_public_session", {
    p_session_hash: hashChoiceAppointmentSession(input.sessionToken),
    p_response_kind: input.responseKind,
    p_client_command_id: input.clientCommandId,
  });
  const row = (result.data as Array<{ outcome: string; slot_id: string; response_kind: string }> | null)?.[0];
  return !result.error && ["recorded", "already_applied"].includes(row?.outcome ?? "")
    ? { outcome: row!.outcome, slotId: row!.slot_id, responseKind: row!.response_kind }
    : null;
}
