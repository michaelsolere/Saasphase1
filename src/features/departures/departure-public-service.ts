import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const DEPARTURE_SESSION_COOKIE = "departure_public_session";
const service = () => createServiceRoleClient() as unknown as SupabaseClient;
export const hashDepartureSession = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
export function departurePublicCommandId(sessionToken: string, action: string, target: string) {
  const bytes = createHash("sha256").update(`${hashDepartureSession(sessionToken)}:${action}:${target}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function exchangeDepartureToken(tokenHash: string, sessionHash: string) {
  const result = await service().rpc("exchange_departure_public_token", { p_token_hash: tokenHash, p_session_hash: sessionHash });
  const row = (result.data as Array<{ outcome: string; session_expires_at: string }> | null)?.[0];
  return !result.error && row?.outcome === "opened" ? { sessionExpiresAt: row.session_expires_at } : null;
}

export async function readDepartureSession(sessionToken: string) {
  const result = await service().rpc("read_departure_public_session", { p_session_hash: hashDepartureSession(sessionToken) });
  const row = (result.data as Array<{ outcome: string; response_deadline_at: string; confirmed_slot_id: string | null; confirmed_starts_at: string | null; confirmed_duration_minutes: number | null; available_slots: unknown }> | null)?.[0];
  if (result.error || row?.outcome !== "available") return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof row.response_deadline_at !== "string" || !Number.isFinite(Date.parse(row.response_deadline_at))) return null;
  const confirmedEmpty = row.confirmed_slot_id === null && row.confirmed_starts_at === null && row.confirmed_duration_minutes === null;
  const confirmedComplete = typeof row.confirmed_slot_id === "string" && uuid.test(row.confirmed_slot_id) && typeof row.confirmed_starts_at === "string" && Number.isFinite(Date.parse(row.confirmed_starts_at)) && typeof row.confirmed_duration_minutes === "number" && Number.isInteger(row.confirmed_duration_minutes) && row.confirmed_duration_minutes > 0;
  if (!confirmedEmpty && !confirmedComplete) return null;
  if (!Array.isArray(row.available_slots)) return null;
  const available = row.available_slots;
  const slots = available.map((value) => {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    return typeof item.id === "string" && uuid.test(item.id) && typeof item.startsAt === "string" && Number.isFinite(Date.parse(item.startsAt)) && typeof item.durationMinutes === "number" && Number.isInteger(item.durationMinutes) && item.durationMinutes > 0 ? { id: item.id, startsAt: item.startsAt, durationMinutes: item.durationMinutes } : null;
  });
  if (slots.some((slot) => slot === null)) return null;
  return {
    responseDeadlineAt: row.response_deadline_at,
    confirmedSlotId: row.confirmed_slot_id,
    confirmedStartsAt: row.confirmed_starts_at,
    confirmedDurationMinutes: row.confirmed_duration_minutes,
    slots: slots as Array<{ id: string; startsAt: string; durationMinutes: number }>,
  };
}

export async function bookDepartureSession(sessionToken: string, slotId: string, commandId: string) {
  const result = await service().rpc("book_departure_public_session", { p_session_hash: hashDepartureSession(sessionToken), p_slot_id: slotId, p_client_command_id: commandId });
  const row = (result.data as Array<{ outcome: string; slot_id: string | null; starts_at: string | null; reason: string | null }> | null)?.[0];
  return !result.error && row ? row : null;
}

export async function departureDeliveryContextForSession(sessionToken: string) {
  const client = service();
  const sessionHash = hashDepartureSession(sessionToken);
  const session = await client.from("departure_public_sessions").select("access_id").eq("session_hash", sessionHash).maybeSingle();
  if (session.error || !session.data) return null;
  const access = await client.from("departure_public_accesses").select("id,plan_id").eq("id", session.data.access_id).maybeSingle();
  if (access.error || !access.data) return null;
  const plan = await client.from("departure_plans").select("created_by").eq("id", access.data.plan_id).maybeSingle();
  return !plan.error && plan.data ? { accessId: access.data.id as string, actorUserId: plan.data.created_by as string } : null;
}

export async function declineDepartureSession(sessionToken: string, commandId: string) {
  const result = await service().rpc("decline_departure_public_session", { p_session_hash: hashDepartureSession(sessionToken), p_client_command_id: commandId });
  const row = (result.data as Array<{ outcome: string; reason: string | null }> | null)?.[0];
  return !result.error && row ? row : null;
}
