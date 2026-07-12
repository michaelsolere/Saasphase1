import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEmailDeliveryIdempotencyKey,
  claimEmailDeliveryAttemptForSend,
  markEmailDeliveryAttemptFailed,
  markEmailDeliveryAttemptSent,
  prepareEmailDeliveryAttempt,
  snapshotEmailDeliveryAttemptBrevoTemplate,
} from "@/features/communications/email-delivery-attempts-core";
import {
  formatPreReservationContactFullName,
  type PreReservationEmailProviderErrorReason,
  type PreReservationEmailTemplateResult,
  type SendPreReservationProviderEmailInput,
  type SendPreReservationProviderEmailResult,
} from "@/features/communications/pre-reservation-email-core";
import { buildBirthDocumentsDepositVariables } from "@/features/reservations/birth-documents-deposit-variables";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
export type BirthDocumentsDepositDeliveryState = "sent" | "not_sent" | "in_progress" | "uncertain";
export type BirthDocumentsDepositEmailTransport = {
  getTemplate: (templateId: number) => Promise<PreReservationEmailTemplateResult>;
  sendEmail: (input: SendPreReservationProviderEmailInput) => Promise<SendPreReservationProviderEmailResult>;
  isConfigured: () => boolean;
};
export type SendBirthDocumentsDepositEmailResult = {
  status: "success" | "already_sent" | "in_progress" | "failed" | "not_eligible" | "missing_email" | "missing_payment" | "missing_template" | "brevo_not_configured";
  deliveryState: BirthDocumentsDepositDeliveryState;
  attemptId?: string;
  errorCode?: string;
};

const MESSAGE_TYPE = "birth_documents_deposit";
const OPERATION_VERSION = "v1";
const validEmail = (value: string | null) => Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
const failedStatus = (reason: PreReservationEmailProviderErrorReason) =>
  reason === "not_configured" ? "brevo_not_configured" as const :
    reason === "template_not_found" || reason === "template_inactive" ? "missing_template" as const : "failed" as const;

export async function sendBirthDocumentsDepositEmailForReservation(
  input: { reservationId: string; litterId: string; paymentId: string; paidArrhesCents: number; completeDepositCents: number },
  options: { supabase: Supabase; transport?: BirthDocumentsDepositEmailTransport },
): Promise<SendBirthDocumentsDepositEmailResult> {
  const { supabase, transport } = options;
  if (!transport) return { status: "brevo_not_configured", deliveryState: "not_sent" };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "not_eligible", deliveryState: "not_sent" };
  const { data: membership } = await supabase.from("memberships").select("organization_id").eq("profile_id", user.id).eq("status", "active").is("deleted_at", null).in("role", ["owner", "admin", "member"]).limit(1).maybeSingle();
  if (!membership) return { status: "not_eligible", deliveryState: "not_sent" };
  const { data: reservation } = await supabase.from("reservations").select("id, organization_id, contact_id, litter_id, litter_group_id, status, application_id").eq("organization_id", membership.organization_id).eq("id", input.reservationId).eq("litter_id", input.litterId).eq("status", "pre_reservation_paid").is("deleted_at", null).maybeSingle();
  if (!reservation?.contact_id || !reservation.application_id) return { status: "not_eligible", deliveryState: "not_sent" };
  const [contactResult, paymentResult, templateResult, organizationResult, litterResult, overviewResult, applicationResult] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, display_name, email").eq("organization_id", reservation.organization_id).eq("id", reservation.contact_id).is("deleted_at", null).maybeSingle(),
    supabase.from("payments").select("id, amount_cents, due_date, status").eq("organization_id", reservation.organization_id).eq("id", input.paymentId).eq("reservation_id", reservation.id).eq("contact_id", reservation.contact_id).in("status", ["requested", "pending", "partially_paid"]).is("deleted_at", null).maybeSingle(),
    supabase.from("email_templates").select("id, brevo_template_id").eq("organization_id", reservation.organization_id).eq("template_key", MESSAGE_TYPE).eq("is_active", true).is("deleted_at", null).maybeSingle(),
    supabase.from("organizations").select("name, affix_name, dog_affix_name").eq("id", reservation.organization_id).is("deleted_at", null).maybeSingle(),
    supabase.from("litters").select("id, name, actual_birth_date").eq("organization_id", reservation.organization_id).eq("id", input.litterId).is("deleted_at", null).maybeSingle(),
    supabase.from("litter_overview").select("id, litter_group_name, mother_display_name, father_display_name").eq("id", input.litterId).maybeSingle(),
    supabase.from("applications").select("desired_sex_preference").eq("organization_id", reservation.organization_id).eq("id", reservation.application_id).is("deleted_at", null).maybeSingle(),
  ]);
  const contact = contactResult.data;
  if (!contact || !validEmail(contact.email)) return { status: "missing_email", deliveryState: "not_sent" };
  const payment = paymentResult.data;
  if (!payment) return { status: "missing_payment", deliveryState: "not_sent" };
  const template = templateResult.data;
  if (!template?.brevo_template_id) return { status: "missing_template", deliveryState: "not_sent" };
  if (!litterResult.data) return { status: "not_eligible", deliveryState: "not_sent" };
  if (!transport.isConfigured()) return { status: "brevo_not_configured", deliveryState: "not_sent" };
  const fullName = formatPreReservationContactFullName(contact);
  const variables = {
    ...buildBirthDocumentsDepositVariables({
      firstName: contact.first_name,
      lastName: contact.last_name,
      fullName,
      litterName: litterResult.data.name,
      litterGroupName: overviewResult.data?.litter_group_name ?? null,
      motherName: overviewResult.data?.mother_display_name ?? null,
      fatherName: overviewResult.data?.father_display_name ?? null,
      birthDate: litterResult.data.actual_birth_date,
      desiredSexPreference:
        applicationResult.data?.desired_sex_preference ?? null,
      paidArrhesCents: input.paidArrhesCents,
      complementAmountCents: payment.amount_cents,
      complementDueDate: payment.due_date,
      completeDepositCents: input.completeDepositCents,
      organizationName:
        organizationResult.data?.dog_affix_name ??
        organizationResult.data?.affix_name ??
        organizationResult.data?.name ??
        null,
    }),
    payment_request_id: payment.id,
  };
  const idempotencyKey = buildEmailDeliveryIdempotencyKey({ organizationId: reservation.organization_id, messageType: MESSAGE_TYPE, contactId: reservation.contact_id, reservationId: reservation.id, litterId: input.litterId, litterGroupId: reservation.litter_group_id, operationVersion: OPERATION_VERSION });
  if (!idempotencyKey) return { status: "failed", deliveryState: "not_sent", errorCode: "invalid_idempotency_key" };
  const recipientEmail = contact.email!.trim().toLowerCase();
  const prepared = await prepareEmailDeliveryAttempt({ organizationId: reservation.organization_id, contactId: reservation.contact_id, reservationId: reservation.id, litterId: input.litterId, litterGroupId: reservation.litter_group_id, emailTemplateId: template.id, messageType: MESSAGE_TYPE, recipientEmail, recipientName: fullName || contact.display_name, variablesSnapshot: variables, idempotencyKey, userId: user.id }, supabase);
  if (prepared.outcome === "error") return { status: "failed", deliveryState: "not_sent", errorCode: prepared.error.code };
  if (prepared.attempt.status === "sent") return { status: "already_sent", deliveryState: "sent", attemptId: prepared.attempt.id };
  const claim = await claimEmailDeliveryAttemptForSend({ organizationId: reservation.organization_id, attemptId: prepared.attempt.id, userId: user.id }, supabase);
  if (claim.outcome === "already_sent") return { status: "already_sent", deliveryState: "sent", attemptId: claim.attempt?.id };
  if (claim.outcome === "in_progress") return { status: "in_progress", deliveryState: "in_progress", attemptId: claim.attempt?.id };
  if (claim.outcome !== "claimed") return { status: "failed", deliveryState: "not_sent", attemptId: prepared.attempt.id, errorCode: claim.outcome === "error" ? claim.error.code : claim.outcome };
  const brevoTemplate = await transport.getTemplate(template.brevo_template_id);
  if (!brevoTemplate.ok) {
    await markEmailDeliveryAttemptFailed({ organizationId: reservation.organization_id, attemptId: claim.attempt.id, lastErrorCode: brevoTemplate.reason, userId: user.id }, supabase);
    return { status: failedStatus(brevoTemplate.reason), deliveryState: "not_sent", attemptId: claim.attempt.id, errorCode: brevoTemplate.reason };
  }
  const snapshot = await snapshotEmailDeliveryAttemptBrevoTemplate({ organizationId: reservation.organization_id, attemptId: claim.attempt.id, emailTemplateId: template.id, recipientEmail, recipientName: fullName || contact.display_name, variablesSnapshot: variables, brevoTemplateId: brevoTemplate.template.id, brevoTemplateModifiedAt: brevoTemplate.template.modifiedAt, subjectSnapshot: brevoTemplate.template.subject, userId: user.id }, supabase);
  if (snapshot.outcome === "error") { await markEmailDeliveryAttemptFailed({ organizationId: reservation.organization_id, attemptId: claim.attempt.id, lastErrorCode: snapshot.error.code, userId: user.id }, supabase); return { status: "failed", deliveryState: "not_sent", attemptId: claim.attempt.id, errorCode: snapshot.error.code }; }
  const sent = await transport.sendEmail({ templateId: brevoTemplate.template.id, to: { email: recipientEmail, ...(fullName ? { name: fullName } : {}) }, params: variables, idempotencyKey, tags: ["saas_elevage", MESSAGE_TYPE] });
  if (!sent.ok) {
    await markEmailDeliveryAttemptFailed({ organizationId: reservation.organization_id, attemptId: claim.attempt.id, lastErrorCode: sent.reason, userId: user.id }, supabase);
    const deliveryState = ["timeout", "provider_unavailable", "api_error"].includes(sent.reason)
      ? "uncertain" as const
      : "not_sent" as const;
    return { status: failedStatus(sent.reason), deliveryState, attemptId: claim.attempt.id, errorCode: sent.reason };
  }
  const marked = await markEmailDeliveryAttemptSent({ organizationId: reservation.organization_id, attemptId: claim.attempt.id, brevoMessageId: sent.messageId, userId: user.id }, supabase);
  if (marked.outcome === "error") return { status: "failed", deliveryState: "uncertain", attemptId: claim.attempt.id, errorCode: marked.error.code };
  return { status: "success", deliveryState: "sent", attemptId: marked.attempt.id };
}
