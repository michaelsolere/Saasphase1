import "server-only";

import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runTransactionalCampaignDelivery, type TransactionalEmailTransport } from "@/features/communications/transactional-campaign-core";
import { getBrevoConfigurationStatus, getBrevoTransactionalTemplate, sendBrevoTransactionalEmail } from "@/lib/brevo/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export type DepartureEmailKind = "invitation" | "booking_confirmation" | "response_reminder" | "appointment_reminder" | "exceptional_confirmation" | "move_confirmation";
const campaignKeys: Record<DepartureEmailKind, string> = {
  invitation: "departure_appointment_invitation",
  booking_confirmation: "departure_appointment_confirmation",
  response_reminder: "departure_response_reminder",
  appointment_reminder: "departure_appointment_reminder",
  exceptional_confirmation: "departure_exceptional_confirmation",
  move_confirmation: "departure_move_confirmation",
};

type Typed = SupabaseClient<Database>;
type Loose = SupabaseClient;

function secret() {
  const value = process.env.DEPARTURE_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("departure_token_secret_missing");
  return value;
}
function baseUrl() {
  const explicit = process.env.DEPARTURE_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  throw new Error("departure_public_base_url_missing");
}
export function deriveDepartureToken(accessId: string, tokenSecret = secret()) {
  return `depart.${accessId}.${createHmac("sha256", tokenSecret).update(`departure:${accessId}`).digest("base64url")}`;
}
export const isDepartureToken = (value: string) => /^depart\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value);
export const hashDepartureToken = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const transport = (): TransactionalEmailTransport => ({ isConfigured: () => getBrevoConfigurationStatus().isConfigured, getTemplate: getBrevoTransactionalTemplate, sendEmail: sendBrevoTransactionalEmail });
const displayDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));

async function finalize(kind: DepartureEmailKind, input: { accessId: string; attemptId: string; sentAt: string; planId: string; reservationId: string }, client = createServiceRoleClient() as unknown as Loose) {
  const result = await (client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Array<{ outcome: string; reason: string | null }> | null; error: unknown }> }).rpc("finalize_departure_email_delivery", { p_access_id: input.accessId, p_kind: kind, p_attempt_id: input.attemptId, p_sent_at: input.sentAt });
  const row = result.data?.[0];
  return !result.error && row && ["recorded", "existing"].includes(row.outcome)
    ? { ok: true as const }
    : { ok: false as const, errorCode: row?.reason ?? "departure_delivery_finalize_failed" };
}

export async function sendDepartureAppointmentEmail(accessId: string, kind: DepartureEmailKind, options?: { supabase?: Typed; emailTransport?: TransactionalEmailTransport; systemActorUserId?: string }) {
  const supabase = options?.supabase ?? (options?.systemActorUserId
    ? createServiceRoleClient() as unknown as Typed
    : await createClient());
  const loose = supabase as unknown as Loose;
  const accessResult = await loose.from("departure_public_accesses").select("id,organization_id,plan_id,reservation_id,expires_at,response_kind").eq("id", accessId).maybeSingle();
  const access = accessResult.data as { id: string; organization_id: string; plan_id: string; reservation_id: string; expires_at: string; response_kind: string | null } | null;
  if (accessResult.error || !access) return { outcome: "failed" as const, errorCode: "departure_access_missing" };
  const [planResult, reservationResult, slotResult] = await Promise.all([
    loose.from("departure_plans").select("id,title,status,response_deadline_at,created_by").eq("id", access.plan_id).maybeSingle(),
    loose.from("reservations").select("id,contact_id,litter_id,price_cents").eq("id", access.reservation_id).maybeSingle(),
    loose.from("departure_slots").select("id,starts_at,duration_minutes,status").eq("plan_id", access.plan_id).eq("reservation_id", access.reservation_id).in("status", ["booked", "to_review", "late", "no_show"]).limit(1).maybeSingle(),
  ]);
  const plan = planResult.data as { id: string; title: string; status: string; response_deadline_at: string | null; created_by: string } | null;
  const reservation = reservationResult.data as { id: string; contact_id: string; litter_id: string; price_cents: number | null } | null;
  const slot = slotResult.data as { id: string; starts_at: string; duration_minutes: number; status: string } | null;
  if (!plan || !reservation) return { outcome: "failed" as const, errorCode: "departure_context_missing" };
  if (["invitation", "response_reminder", "appointment_reminder"].includes(kind)) {
    const incident = await loose.from("post_birth_incidents").select("id").eq("organization_id", access.organization_id).eq("litter_id", reservation.litter_id).eq("status", "open").limit(1);
    if (incident.error || (incident.data ?? []).length) return { outcome: "failed" as const, errorCode: "sensitive_incident_open" };
  }
  if (kind === "invitation" && (plan.status !== "published" || access.response_kind !== null)) return { outcome: "failed" as const, errorCode: "departure_invitation_not_applicable" };
  if (kind !== "invitation" && kind !== "response_reminder" && !slot) return { outcome: "failed" as const, errorCode: "departure_appointment_missing" };
  let prepared: { email: string; name: string; firstName: string; litterName: string } | null = null;
  return runTransactionalCampaignDelivery({
    campaignKey: campaignKeys[kind],
    operationVersion: `departure:${access.id}:${kind}:${slot?.id ?? "none"}:${slot?.starts_at ?? plan.response_deadline_at ?? "none"}:${slot?.duration_minutes ?? "none"}:v3`,
    context: { organizationId: access.organization_id, roles: ["owner", "admin"], ...(options?.systemActorUserId ? { systemActorUserId: options.systemActorUserId } : {}) },
    transport: options?.emailTransport ?? transport(),
    prepareOperation: async () => {
      const [contactResult, litterResult, paymentsResult] = await Promise.all([
        loose.from("contacts").select("email,display_name,first_name").eq("id", reservation.contact_id).is("deleted_at", null).maybeSingle(),
        loose.from("litters").select("name").eq("id", reservation.litter_id).is("deleted_at", null).maybeSingle(),
        loose.from("payments").select("amount_cents,payment_type,status").eq("reservation_id", reservation.id).is("deleted_at", null),
      ]);
      const contact = contactResult.data as { email: string | null; display_name: string | null; first_name: string | null } | null;
      const litter = litterResult.data as { name: string | null } | null;
      if (!contact?.email) return { ok: false as const, errorCode: "recipient_email_missing" };
      prepared = { email: contact.email, name: contact.display_name ?? "Famille", firstName: contact.first_name ?? contact.display_name ?? "", litterName: litter?.name ?? "Portée" };
      const paid = ((paymentsResult.data ?? []) as Array<{ amount_cents: number; payment_type: string; status: string }>).reduce((total, payment) => payment.payment_type === "refund" || payment.payment_type === "partial_refund" ? total - (["paid", "partially_refunded", "refunded"].includes(payment.status) ? payment.amount_cents : 0) : total + (["paid", "partially_paid", "partially_refunded", "converted_to_credit", "transferred"].includes(payment.status) ? payment.amount_cents : 0), 0);
      const balance = reservation.price_cents === null ? null : Math.max(0, reservation.price_cents - paid);
      const variables = { prenom: prepared.firstName, portee: prepared.litterName, date_rendez_vous: slot ? displayDate(slot.starts_at) : "", duree_rendez_vous: slot ? String(slot.duration_minutes) : "", date_limite: plan.response_deadline_at ? displayDate(plan.response_deadline_at) : "", solde_restant: balance === null ? "" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(balance / 100), lien_rendez_vous: "[créé après claim]", type_message: kind };
      return { ok: true as const, operation: { dossierId: access.id, contactId: reservation.contact_id, reservationId: reservation.id, litterId: reservation.litter_id, recipientEmail: prepared.email, recipientName: prepared.name, variables, variablesSnapshot: { ...variables, lien_rendez_vous: "[REDACTED_BEARER_URL]" } } };
    },
    reconcileAlreadySentOperation: async ({ attempt }) => attempt.sent_at ? finalize(kind, { accessId: access.id, attemptId: attempt.id, sentAt: attempt.sent_at, planId: plan.id, reservationId: reservation.id }) : { ok: false as const, errorCode: "sent_attempt_timestamp_missing" },
    prepareClaimedOperation: async ({ operation, attemptId }) => {
      if (!prepared) return { ok: false as const, errorCode: "departure_delivery_context_missing" };
      const [freshAccessResult, freshPlanResult, freshSlotResult, freshIncidentResult] = await Promise.all([
        loose.from("departure_public_accesses").select("revoked_at,expires_at,response_kind").eq("id", access.id).maybeSingle(),
        loose.from("departure_plans").select("status,response_deadline_at").eq("id", plan.id).maybeSingle(),
        loose.from("departure_slots").select("id,starts_at,duration_minutes,status").eq("plan_id", plan.id).eq("reservation_id", reservation.id).in("status", ["booked","late","to_review"]).limit(1).maybeSingle(),
        loose.from("post_birth_incidents").select("id").eq("organization_id", access.organization_id).eq("litter_id", reservation.litter_id).eq("status", "open").limit(1),
      ]);
      const freshAccess = freshAccessResult.data as { revoked_at: string | null; expires_at: string; response_kind: string | null } | null;
      const freshPlan = freshPlanResult.data as { status: string; response_deadline_at: string | null } | null;
      const freshSlot = freshSlotResult.data as { id: string; starts_at: string; duration_minutes: number; status: string } | null;
      if (freshIncidentResult.error || !freshAccess || freshAccess.revoked_at || Date.parse(freshAccess.expires_at) <= Date.now() || !freshPlan || (freshIncidentResult.data ?? []).length) return { ok: false as const, errorCode: "departure_delivery_no_longer_eligible" };
      if ((kind === "invitation" || kind === "response_reminder") && (freshPlan.status !== "published" || !freshPlan.response_deadline_at || Date.parse(freshPlan.response_deadline_at) <= Date.now() || freshAccess.response_kind !== null)) return { ok: false as const, errorCode: "departure_response_closed" };
      if (!["invitation","response_reminder"].includes(kind) && !freshSlot) return { ok: false as const, errorCode: "departure_appointment_inactive" };
      if (slot && freshSlot && (freshSlot.id !== slot.id || freshSlot.starts_at !== slot.starts_at || freshSlot.duration_minutes !== slot.duration_minutes)) return { ok: false as const, errorCode: "departure_appointment_changed" };
      const token = deriveDepartureToken(access.id);
      const variables = { ...operation.variables, lien_rendez_vous: `${baseUrl()}/depart/${token}` };
      return { ok: true as const, claimed: { operation: { ...operation, variables }, afterProviderSuccess: async () => finalize(kind, { accessId: access.id, attemptId, sentAt: new Date().toISOString(), planId: plan.id, reservationId: reservation.id }) } };
    },
  }, { supabase });
}
