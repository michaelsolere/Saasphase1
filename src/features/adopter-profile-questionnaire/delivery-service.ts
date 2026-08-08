import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  claimEmailDeliveryAttemptForSend,
  markEmailDeliveryAttemptFailed,
  markEmailDeliveryAttemptSent,
  prepareEmailDeliveryAttempt,
  snapshotEmailDeliveryAttemptBrevoTemplate,
} from "@/features/communications/email-delivery-attempts-core";
import { getBrevoTransactionalTemplate, sendBrevoTransactionalEmail } from "@/lib/brevo/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/types/database.types";
import { buildAdopterProfileQuestionnairePath, deriveAdopterProfileQuestionnaireToken, hashAdopterProfileQuestionnaireToken } from "./public-token";
import { buildAdopterProfileDeliveryIdempotencyKey } from "./delivery-model";

type Kind = "invitation" | "reminder";
type Client = SupabaseClient;
type TypedClient = SupabaseClient<Database>;

type Instance = {
  id: string; organization_id: string; reservation_id: string; contact_id: string;
  due_at: string; automatic_invitation_allowed: boolean; final_submitted_at: string | null;
  waived_at: string | null; invitation_delivery_attempt_id: string | null;
  reminder_delivery_attempt_id: string | null;
};
type DeliveryContext = {
  contact_first_name: string | null;
  contact_display_name: string;
  contact_email: string | null;
  organization_name: string;
  email_template_id: string | null;
  brevo_template_id: number | null;
  subject: string | null;
  actor_profile_id: string | null;
};

function baseUrl() {
  const explicit = process.env.ADOPTER_PROFILE_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  throw new Error("adopter_profile_public_base_url_missing");
}

function serviceClient() { return createServiceRoleClient() as unknown as Client; }

function tokenSecret() {
  const value = process.env.ADOPTER_PROFILE_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("adopter_profile_token_secret_missing");
  return value;
}

async function activeAccess(client: Client, instance: Instance, secret: string) {
  const existing = await client.from("adopter_profile_questionnaire_accesses")
    .select("id")
    .eq("organization_id", instance.organization_id)
    .eq("instance_id", instance.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return String(existing.data.id);

  const accessId = randomUUID();
  const token = deriveAdopterProfileQuestionnaireToken(accessId, secret);
  const inserted = await client.from("adopter_profile_questionnaire_accesses").insert({
    id: accessId,
    organization_id: instance.organization_id,
    instance_id: instance.id,
    token_hash: hashAdopterProfileQuestionnaireToken(token),
  }).select("id").single();
  if (!inserted.error && inserted.data) return String(inserted.data.id);

  const concurrent = await client.from("adopter_profile_questionnaire_accesses")
    .select("id")
    .eq("organization_id", instance.organization_id)
    .eq("instance_id", instance.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (concurrent.error || !concurrent.data) throw inserted.error ?? concurrent.error ?? new Error("access_creation_failed");
  return String(concurrent.data.id);
}

async function finalizeDelivery(client: Client, instanceId: string, attemptId: string, kind: Kind) {
  const result = await client.rpc("finalize_adopter_profile_questionnaire_delivery", {
    p_instance_id: instanceId,
    p_attempt_id: attemptId,
    p_kind: kind,
  });
  return !result.error && result.data === "finalized";
}

async function recordFailure(client: Client, instance: Instance, kind: Kind, code: string, attemptId: string | null) {
  const result = await client.rpc("record_adopter_profile_questionnaire_delivery_failure", {
    p_instance_id: instance.id,
    p_kind: kind,
    p_error_code: code,
    p_attempt_id: attemptId,
  });
  if (result.error || result.data !== "recorded") {
    throw result.error ?? new Error("adopter_profile_failure_audit_failed");
  }
}

export async function dispatchAdopterProfileQuestionnaire(instanceId: string, kind: Kind, manual = false) {
  const client = serviceClient();
  const instanceResult = await client.from("adopter_profile_questionnaire_instances")
    .select("id, organization_id, reservation_id, contact_id, due_at, automatic_invitation_allowed, final_submitted_at, waived_at, invitation_delivery_attempt_id, reminder_delivery_attempt_id")
    .eq("id", instanceId).maybeSingle();
  if (instanceResult.error || !instanceResult.data) return { outcome: "not_found" as const };
  const instance = instanceResult.data as unknown as Instance;
  if (instance.final_submitted_at || instance.waived_at) return { outcome: "not_needed" as const };
  if (kind === "invitation" && !manual && !instance.automatic_invitation_allowed && !instance.invitation_delivery_attempt_id) {
    return { outcome: "manual_send_required" as const };
  }
  if (kind === "reminder" && !instance.invitation_delivery_attempt_id) return { outcome: "not_needed" as const };

  const contextResult = await client.rpc("read_adopter_profile_questionnaire_delivery_context", {
    p_instance_id: instance.id,
    p_kind: kind,
  });
  const context = (Array.isArray(contextResult.data) ? contextResult.data[0] : contextResult.data) as DeliveryContext | null;
  if (contextResult.error || !context?.contact_email || !context.actor_profile_id || !context.email_template_id || !context.brevo_template_id) {
    await recordFailure(client, instance, kind, "delivery_context_missing", null);
    return { outcome: "failed" as const, reason: "delivery_context_missing" };
  }

  let accessId: string;
  let token: string;
  try {
    const secret = tokenSecret();
    accessId = await activeAccess(client, instance, secret);
    token = deriveAdopterProfileQuestionnaireToken(accessId, secret);
  } catch {
    await recordFailure(client, instance, kind, "access_creation_failed", null);
    return { outcome: "failed" as const, reason: "access_creation_failed" };
  }
  let publicBaseUrl: string;
  try {
    publicBaseUrl = baseUrl();
  } catch {
    await recordFailure(client, instance, kind, "public_base_url_missing", null);
    return { outcome: "failed" as const, reason: "public_base_url_missing" };
  }
  const variables = {
    PRENOM_FAMILLE: context.contact_first_name ?? context.contact_display_name,
    NOM_FAMILLE: context.contact_display_name,
    NOM_ELEVAGE: context.organization_name,
    LIEN_QUESTIONNAIRE: `${publicBaseUrl}${buildAdopterProfileQuestionnairePath(token)}`,
    ECHEANCE: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(instance.due_at)),
  };
  const messageType = kind === "invitation" ? "adopter_profile_invitation" : "adopter_profile_reminder";
  const prepared = await prepareEmailDeliveryAttempt({
    organizationId: instance.organization_id,
    contactId: instance.contact_id,
    reservationId: instance.reservation_id,
    emailTemplateId: context.email_template_id,
    messageType,
    recipientEmail: context.contact_email,
    recipientName: context.contact_display_name,
    subjectSnapshot: context.subject,
    variablesSnapshot: { ...variables, LIEN_QUESTIONNAIRE: "[lien sécurisé non conservé]", accessId },
    idempotencyKey: buildAdopterProfileDeliveryIdempotencyKey(instance.id, kind, accessId),
    userId: context.actor_profile_id,
  }, client as unknown as TypedClient);
  if (prepared.outcome === "error") {
    await recordFailure(client, instance, kind, prepared.error.code, null);
    return { outcome: "failed" as const, reason: prepared.error.code };
  }
  const attempt = prepared.attempt;
  const claimed = await claimEmailDeliveryAttemptForSend({ organizationId: instance.organization_id, attemptId: attempt.id, userId: context.actor_profile_id }, client as unknown as TypedClient);
  if (claimed.outcome === "already_sent") {
    const finalized = await finalizeDelivery(client, instance.id, attempt.id, kind);
    return finalized
      ? { outcome: "sent" as const, attemptId: attempt.id }
      : { outcome: "uncertain" as const, attemptId: attempt.id };
  }
  if (claimed.outcome !== "claimed") {
    await recordFailure(client, instance, kind, claimed.outcome, attempt.id);
    return { outcome: "failed" as const, reason: claimed.outcome };
  }
  const providerTemplate = await getBrevoTransactionalTemplate(context.brevo_template_id);
  if (!providerTemplate.ok) {
    await markEmailDeliveryAttemptFailed({ organizationId: instance.organization_id, attemptId: attempt.id, lastErrorCode: providerTemplate.reason, userId: context.actor_profile_id }, client as unknown as TypedClient);
    await recordFailure(client, instance, kind, providerTemplate.reason, attempt.id);
    return { outcome: "failed" as const, reason: providerTemplate.reason };
  }
  const snapshotted = await snapshotEmailDeliveryAttemptBrevoTemplate({
    organizationId: instance.organization_id,
    attemptId: attempt.id,
    emailTemplateId: context.email_template_id,
    recipientEmail: context.contact_email,
    recipientName: context.contact_display_name,
    variablesSnapshot: { ...variables, LIEN_QUESTIONNAIRE: "[lien sécurisé non conservé]", accessId },
    brevoTemplateId: context.brevo_template_id,
    subjectSnapshot: providerTemplate.template.subject,
    brevoTemplateModifiedAt: providerTemplate.template.modifiedAt,
    reservationId: instance.reservation_id,
    userId: context.actor_profile_id,
  }, client as unknown as TypedClient);
  if (snapshotted.outcome === "error") {
    await markEmailDeliveryAttemptFailed({ organizationId: instance.organization_id, attemptId: attempt.id, lastErrorCode: snapshotted.error.code, userId: context.actor_profile_id }, client as unknown as TypedClient);
    await recordFailure(client, instance, kind, snapshotted.error.code, attempt.id);
    return { outcome: "failed" as const, reason: snapshotted.error.code };
  }
  const sent = await sendBrevoTransactionalEmail({
    templateId: context.brevo_template_id,
    to: { email: context.contact_email, name: context.contact_display_name },
    params: variables,
    idempotencyKey: `adopter-profile:${attempt.id}`,
    tags: ["saas_elevage", "adopter_profile", kind],
  });
  if (!sent.ok) {
    await markEmailDeliveryAttemptFailed({ organizationId: instance.organization_id, attemptId: attempt.id, lastErrorCode: sent.reason, userId: context.actor_profile_id }, client as unknown as TypedClient);
    await recordFailure(client, instance, kind, sent.reason, attempt.id);
    return { outcome: "failed" as const, reason: sent.reason };
  }
  const marked = await markEmailDeliveryAttemptSent({ organizationId: instance.organization_id, attemptId: attempt.id, brevoMessageId: sent.messageId, userId: context.actor_profile_id }, client as unknown as TypedClient);
  if (marked.outcome !== "updated") return { outcome: "uncertain" as const, attemptId: attempt.id };
  if (!(await finalizeDelivery(client, instance.id, attempt.id, kind))) {
    return { outcome: "uncertain" as const, attemptId: attempt.id };
  }
  return { outcome: "sent" as const, attemptId: attempt.id };
}

export async function runAdopterProfileDelivery(limit = 4) {
  const client = serviceClient();
  await client.rpc("reconcile_adopter_profile_questionnaire_instances");
  const result = await client.rpc("list_due_adopter_profile_questionnaire_deliveries", {
    p_limit: Math.max(1, Math.min(limit, 20)),
  });
  if (result.error) throw result.error;
  const outcomes: Array<{ instanceId: string; outcome: string }> = [];
  for (const raw of result.data ?? []) {
    const row = raw as { instance_id: string; delivery_kind: Kind };
    const dispatched = await dispatchAdopterProfileQuestionnaire(row.instance_id, row.delivery_kind);
    outcomes.push({ instanceId: row.instance_id, outcome: dispatched.outcome });
  }
  return { processed: outcomes.length, outcomes };
}

export async function dispatchAdopterProfileAfterPayment(reservationId: string) {
  const client = serviceClient();
  const result = await client.from("adopter_profile_questionnaire_instances")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (result.error || !result.data) return { outcome: "not_found" as const };
  return dispatchAdopterProfileQuestionnaire(String(result.data.id), "invitation");
}
