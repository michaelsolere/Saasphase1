import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendDepartureAppointmentEmail } from "@/features/communications/departure-appointment-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/types/database.types";

type ResponseReminderRow = { id: string; departure_plans: { created_by: string } | null };
type AppointmentReminderRow = { id: string; plan_id: string; reservation_id: string; departure_plans: { created_by: string } | null };
type PaymentReviewRow = { id: string; organization_id: string; reservation_id: string | null; starts_at: string; departure_plans: { created_by: string } | null };

function deterministicUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function runDepartureReminders(now = new Date()) {
  const typed = createServiceRoleClient();
  const supabase = typed as unknown as SupabaseClient;
  const until48 = new Date(now.getTime() + 48 * 3_600_000).toISOString();
  const until7d = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const [responseResult, dueSlotResult, paymentReviewResult, confirmationRetryResult, moveRetryResult] = await Promise.all([
    supabase.from("departure_public_accesses").select("id,departure_plans!inner(response_deadline_at,created_by,status)").is("response_kind", null).is("response_reminder_sent_at", null).eq("departure_plans.status", "published").lte("departure_plans.response_deadline_at", until48).gt("departure_plans.response_deadline_at", now.toISOString()).order("response_deadline_at", { referencedTable: "departure_plans", ascending: true }).limit(20),
    supabase.from("departure_slots").select("id,plan_id,reservation_id,starts_at,departure_plans!inner(created_by)").in("status", ["booked","late"]).lte("starts_at", until48).gt("starts_at", now.toISOString()).order("starts_at", { ascending: true }).limit(50),
    supabase.from("departure_slots").select("id,organization_id,reservation_id,starts_at,departure_plans!inner(created_by)").eq("status", "booked").lte("starts_at", until7d).gt("starts_at", now.toISOString()).order("starts_at", { ascending: true }).limit(50),
    supabase.from("departure_public_accesses").select("id,plan_id,reservation_id,departure_plans!inner(created_by)").eq("response_kind", "booked").is("confirmation_sent_at", null).order("responded_at", { ascending: true }).limit(20),
    supabase.from("departure_public_accesses").select("id,plan_id,reservation_id,departure_plans!inner(created_by)").eq("response_kind", "booked").not("move_confirmation_required_at", "is", null).is("move_confirmation_sent_at", null).is("revoked_at", null).gt("expires_at", now.toISOString()).or(`move_confirmation_retry_after.is.null,move_confirmation_retry_after.lt.${now.toISOString()}`).order("move_confirmation_required_at", { ascending: true }).limit(20),
  ]);
  const summary = { responseChecked: 0, responseSent: 0, appointmentChecked: 0, appointmentSent: 0, confirmationRetried: 0, moveConfirmationRetried: 0, paymentReviewsCreated: 0, uncertain: 0, failed: 0 };
  const responseRows = (responseResult.data ?? []) as unknown as ResponseReminderRow[];
  const dueSlots = (dueSlotResult.data ?? []) as unknown as Array<{ id: string; plan_id: string; reservation_id: string; starts_at: string; departure_plans: { created_by: string } | null }>;
  const paymentRows = (paymentReviewResult.data ?? []) as unknown as PaymentReviewRow[];
  const confirmationRows = (confirmationRetryResult.data ?? []) as unknown as AppointmentReminderRow[];
  const moveRows = (moveRetryResult.data ?? []) as unknown as AppointmentReminderRow[];
  for (const row of responseRows) {
    summary.responseChecked += 1;
    const actor = row.departure_plans?.created_by;
    const result = actor ? await sendDepartureAppointmentEmail(row.id, "response_reminder", { supabase: typed as SupabaseClient<Database>, systemActorUserId: actor }) : { outcome: "failed" };
    if (["success", "already_sent"].includes(result.outcome)) summary.responseSent += 1; else if (result.outcome === "uncertain") summary.uncertain += 1; else summary.failed += 1;
  }
  for (const slot of dueSlots) {
    const access = await supabase.from("departure_public_accesses").select("id").eq("plan_id", slot.plan_id).eq("reservation_id", slot.reservation_id).eq("response_kind", "booked").is("appointment_reminder_sent_at", null).is("revoked_at", null).maybeSingle();
    if (!access.data) continue;
    summary.appointmentChecked += 1;
    const actor = slot.departure_plans?.created_by;
    const result = actor ? await sendDepartureAppointmentEmail(access.data.id, "appointment_reminder", { supabase: typed as SupabaseClient<Database>, systemActorUserId: actor }) : { outcome: "failed" };
    if (["success", "already_sent"].includes(result.outcome)) summary.appointmentSent += 1; else if (result.outcome === "uncertain") summary.uncertain += 1; else summary.failed += 1;
  }
  for (const row of confirmationRows) {
    const actor = row.departure_plans?.created_by;
    const result = actor ? await sendDepartureAppointmentEmail(row.id, "booking_confirmation", { supabase: typed as SupabaseClient<Database>, systemActorUserId: actor }) : { outcome: "failed" };
    if (["success", "already_sent"].includes(result.outcome)) summary.confirmationRetried += 1; else if (result.outcome === "uncertain") summary.uncertain += 1; else summary.failed += 1;
  }
  for (const row of moveRows) {
    const actor = row.departure_plans?.created_by;
    const result = actor ? await sendDepartureAppointmentEmail(row.id, "move_confirmation", { supabase: typed as SupabaseClient<Database>, systemActorUserId: actor }) : { outcome: "failed" };
    if (["success", "already_sent"].includes(result.outcome)) summary.moveConfirmationRetried += 1; else { await supabase.from("departure_public_accesses").update({ move_confirmation_retry_after: new Date(now.getTime() + 3_600_000).toISOString() }).eq("id", row.id); if (result.outcome === "uncertain") summary.uncertain += 1; else summary.failed += 1; }
  }
  for (const row of paymentRows) {
    if (!row.reservation_id) continue;
    const reservation = await supabase.from("reservation_overview").select("price_cents,paid_cents,refunded_cents,contact_id,litter_id").eq("id", row.reservation_id).maybeSingle();
    const balance = reservation.data?.price_cents === null || reservation.data?.price_cents === undefined ? null : reservation.data.price_cents - Number(reservation.data.paid_cents ?? 0) + Number(reservation.data.refunded_cents ?? 0);
    if (balance === null || balance <= 0) continue;
    const eventId = deterministicUuid(`departure-balance-review:${row.id}`);
    const inserted = await supabase.from("events").insert({ id: eventId, organization_id: row.organization_id, reservation_id: row.reservation_id, contact_id: reservation.data?.contact_id, litter_id: reservation.data?.litter_id, event_type: "other", title: "Demande de solde à relire", description: `Solde restant : ${balance} centimes. Vérifier puis envoyer la demande avant le départ.`, planned_at: new Date(Date.parse(row.starts_at) - 7 * 86_400_000).toISOString(), status: "planned", priority: "high", is_task: true, created_by: row.departure_plans?.created_by, updated_by: row.departure_plans?.created_by });
    if (!inserted.error || inserted.error.code === "23505") summary.paymentReviewsCreated += inserted.error ? 0 : 1; else summary.failed += 1;
  }
  if (responseResult.error || dueSlotResult.error || paymentReviewResult.error || confirmationRetryResult.error || moveRetryResult.error) summary.failed += 1;
  return summary;
}
