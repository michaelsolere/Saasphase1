import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runTransactionalCampaignDelivery,
  type TransactionalEmailTransport,
} from "@/features/communications/transactional-campaign-core";
import { finalizeChoiceAppointmentDelivery } from "@/features/communications/choice-appointment-delivery-finalization-core";
import {
  getBrevoConfigurationStatus,
  getBrevoTransactionalTemplate,
  sendBrevoTransactionalEmail,
} from "@/lib/brevo/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

const CAMPAIGN_KEY = "choice_appointment_adoption_booklet";
const TOKEN_PREFIX = "choice";

type Loose = SupabaseClient;
type Typed = SupabaseClient<Database>;

function secret() {
  const value = process.env.CHOICE_APPOINTMENT_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("choice_appointment_token_secret_missing");
  return value;
}

function baseUrl() {
  const explicit = process.env.CHOICE_APPOINTMENT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  throw new Error("choice_appointment_public_base_url_missing");
}

export function deriveChoiceAppointmentToken(accessId: string, tokenSecret = secret()) {
  const signature = createHmac("sha256", tokenSecret).update(`choice:${accessId}`).digest("base64url");
  return `${TOKEN_PREFIX}.${accessId}.${signature}`;
}

export function isChoiceAppointmentToken(value: string) {
  return /^choice\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashChoiceAppointmentToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function transport(): TransactionalEmailTransport {
  return {
    isConfigured: () => getBrevoConfigurationStatus().isConfigured,
    getTemplate: getBrevoTransactionalTemplate,
    sendEmail: sendBrevoTransactionalEmail,
  };
}

async function ensureAccess(client: Loose, input: { organizationId: string; slotId: string; expiresAt: string }) {
  const existing = await client.from("choice_appointment_accesses").select("id").eq("organization_id", input.organizationId).eq("slot_id", input.slotId).is("revoked_at", null).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return String(existing.data.id);
  const accessId = randomUUID();
  const token = deriveChoiceAppointmentToken(accessId);
  const inserted = await client.from("choice_appointment_accesses").insert({
    id: accessId,
    organization_id: input.organizationId,
    slot_id: input.slotId,
    token_hash: hashChoiceAppointmentToken(token),
    token_hint: token.slice(-8),
    expires_at: input.expiresAt,
  }).select("id").single();
  if (!inserted.error && inserted.data) return String(inserted.data.id);
  const concurrent = await client.from("choice_appointment_accesses").select("id").eq("organization_id", input.organizationId).eq("slot_id", input.slotId).is("revoked_at", null).maybeSingle();
  if (concurrent.error || !concurrent.data) throw inserted.error ?? concurrent.error ?? new Error("choice_access_creation_failed");
  return String(concurrent.data.id);
}

export async function sendChoiceAppointmentInvitation(
  slotId: string,
  options?: {
    supabase?: Typed;
    emailTransport?: TransactionalEmailTransport;
    kind?: "invitation" | "reminder";
    systemActorUserId?: string;
  },
) {
  const kind = options?.kind ?? "invitation";
  const supabase = options?.supabase ?? await createClient();
  const loose = supabase as unknown as Loose;
  const slotResult = await loose.from("choice_appointment_slots").select("id,organization_id,plan_id,reservation_id,planned_at,version,status,response_kind,invitation_sent_at,reminder_due_at,reminder_sent_at").eq("id", slotId).maybeSingle();
  const slot = slotResult.data as { id: string; organization_id: string; plan_id: string; reservation_id: string; planned_at: string; version: number; status: string; response_kind: string | null; invitation_sent_at: string | null; reminder_due_at: string | null; reminder_sent_at: string | null } | null;
  if (slotResult.error || !slot) return { outcome: "failed" as const, errorCode: "slot_not_found" };
  const planResult = await loose.from("choice_appointment_plans").select("id,litter_id,status,version,created_by").eq("id", slot.plan_id).maybeSingle();
  const reservationResult = await loose.from("reservations").select("id,contact_id").eq("id", slot.reservation_id).maybeSingle();
  const plan = planResult.data as { id: string; litter_id: string; status: string; version: number; created_by: string } | null;
  const reservation = reservationResult.data as { id: string; contact_id: string } | null;
  if (!plan || !reservation || !["validated", "sending", "sent"].includes(plan.status)) return { outcome: "failed" as const, errorCode: "plan_not_validated" };
  if (
    kind === "invitation" &&
    !slot.invitation_sent_at &&
    (slot.response_kind !== null || ["assigned", "reported", "cancelled"].includes(slot.status))
  ) {
    return { outcome: "failed" as const, errorCode: "invitation_no_longer_applicable" };
  }
  if (kind === "reminder" && (
    slot.response_kind !== null ||
    !slot.invitation_sent_at ||
    !slot.reminder_due_at ||
    Date.parse(slot.reminder_due_at) > Date.now() ||
    slot.reminder_sent_at !== null
  )) return { outcome: "failed" as const, errorCode: "reminder_not_due" };

  let context: { email: string; name: string; firstName: string; litterName: string } | null = null;
  const result = await runTransactionalCampaignDelivery({
    campaignKey: CAMPAIGN_KEY,
    operationVersion: `slot:${slot.id}:${kind}:v1`,
    context: {
      organizationId: slot.organization_id,
      roles: ["owner", "admin"],
      ...(options?.systemActorUserId
        ? { systemActorUserId: options.systemActorUserId }
        : {}),
    },
    transport: options?.emailTransport ?? transport(),
    prepareOperation: async () => {
      const [contactResult, litterResult] = await Promise.all([
        loose.from("contacts").select("email,display_name,first_name").eq("id", reservation.contact_id).is("deleted_at", null).maybeSingle(),
        loose.from("litters").select("name").eq("id", plan.litter_id).is("deleted_at", null).maybeSingle(),
      ]);
      const contact = contactResult.data as { email: string | null; display_name: string | null; first_name: string | null } | null;
      const litter = litterResult.data as { name: string | null } | null;
      if (!contact?.email) return { ok: false as const, errorCode: "recipient_email_missing" };
      context = { email: contact.email, name: contact.display_name ?? "Famille", firstName: contact.first_name ?? contact.display_name ?? "", litterName: litter?.name ?? "Portée" };
      return {
        ok: true as const,
        operation: {
          dossierId: slot.id,
          contactId: reservation.contact_id,
          reservationId: reservation.id,
          litterId: plan.litter_id,
          recipientEmail: context.email,
          recipientName: context.name,
          variables: {
            prenom: context.firstName,
            portee: context.litterName,
            date_rendez_vous: new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(slot.planned_at)),
            lien_hermes: "[créé après sécurisation de la tentative]",
            type_message: kind === "reminder" ? "relance" : "invitation",
          },
          variablesSnapshot: {
            prenom: context.firstName,
            portee: context.litterName,
            date_rendez_vous: slot.planned_at,
            lien_hermes: "[REDACTED_BEARER_URL]",
            type_message: kind,
          },
        },
      };
    },
    reconcileAlreadySentOperation: async ({ attempt }) => {
      if (!attempt.sent_at) {
        return { ok: false as const, errorCode: "sent_attempt_timestamp_missing" };
      }
      return finalizeChoiceAppointmentDelivery(
        {
          kind,
          attemptId: attempt.id,
          sentAt: attempt.sent_at,
          organizationId: slot.organization_id,
          planId: plan.id,
          slotId: slot.id,
          reservationId: reservation.id,
        },
        createServiceRoleClient() as unknown as Loose,
      );
    },
    prepareClaimedOperation: async ({ operation, attemptId }) => {
      if (!context) return { ok: false as const, errorCode: "delivery_context_missing" };
      const service = createServiceRoleClient() as unknown as Loose;
      if (kind === "reminder") {
        const current = await service
          .from("choice_appointment_slots")
          .select("response_kind,reminder_due_at,reminder_sent_at")
          .eq("id", slot.id)
          .maybeSingle();
        const row = current.data as {
          response_kind: string | null;
          reminder_due_at: string | null;
          reminder_sent_at: string | null;
        } | null;
        if (
          current.error ||
          !row ||
          row.response_kind !== null ||
          !row.reminder_due_at ||
          Date.parse(row.reminder_due_at) > Date.now() ||
          row.reminder_sent_at !== null
        ) {
          return { ok: false as const, errorCode: "reminder_no_longer_due" };
        }
      }
      const expiresAt = new Date(Math.max(Date.parse(slot.planned_at) + 7 * 86_400_000, Date.now() + 7 * 86_400_000)).toISOString();
      const accessId = await ensureAccess(service, { organizationId: slot.organization_id, slotId: slot.id, expiresAt });
      const token = deriveChoiceAppointmentToken(accessId);
      const accessUrl = `${baseUrl()}/choix/${token}`;
      return {
        ok: true as const,
        claimed: {
          operation: { ...operation, variables: { ...operation.variables, lien_hermes: accessUrl } },
          metadata: { accessId },
          compensate: async () => {
            const revoked = await service.from("choice_appointment_accesses").update({ revoked_at: new Date().toISOString() }).eq("id", accessId).is("revoked_at", null);
            return revoked.error ? { ok: false as const, errorCode: "access_compensation_failed" } : { ok: true as const };
          },
          afterProviderSuccess: async () =>
            finalizeChoiceAppointmentDelivery(
              {
                kind,
                attemptId,
                sentAt: new Date().toISOString(),
                organizationId: slot.organization_id,
                planId: plan.id,
                slotId: slot.id,
                reservationId: reservation.id,
              },
              service,
            ),
        },
      };
    },
  }, { supabase });
  return result;
}
