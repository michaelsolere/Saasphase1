import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEmailDeliveryIdempotencyKey,
  claimEmailDeliveryAttemptForSend,
  markEmailDeliveryAttemptFailed,
  markEmailDeliveryAttemptSent,
  prepareEmailDeliveryAttempt,
  snapshotEmailDeliveryAttemptBrevoTemplate,
} from "@/features/communications/email-delivery-attempts-core";
import type { Database } from "@/types/database.types";
import {
  runTransactionalCampaignDelivery,
  type TransactionalEmailTransport,
} from "@/features/communications/transactional-campaign-core";
import { compensateUnsentPreReservationCreation } from "@/features/reservations/pre-reservation-campaign";

type Supabase = SupabaseClient<Database>;

type ReservationEmailStatus =
  | "success"
  | "already_sent"
  | "in_progress"
  | "failed"
  | "not_eligible"
  | "missing_email"
  | "missing_payment"
  | "missing_template"
  | "brevo_not_configured";

export type PreReservationEmailDeliveryState =
  | "sent"
  | "not_sent"
  | "in_progress"
  | "uncertain";

type RelatedReservation = {
  id: string;
  organization_id: string;
  contact_id: string;
  litter_id: string | null;
  litter_group_id: string | null;
  status: string;
  pre_reservation_deadline: string | null;
  currency: string;
};

type ContactForEmail = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
};

type PaymentForEmail = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
};

type EmailTemplateForSend = {
  id: string;
  subject: string;
  brevo_template_id: number | null;
};

type OrganizationForEmail = {
  id: string;
  name: string;
  affix_name: string | null;
  dog_affix_name: string | null;
};

type LitterScopeForEmail = {
  litterName: string;
  litterGroupName: string;
};

export type PreReservationEmailProviderErrorReason =
  | "not_configured"
  | "unauthorized"
  | "timeout"
  | "invalid_request"
  | "template_not_found"
  | "template_inactive"
  | "rate_limited"
  | "provider_unavailable"
  | "api_error";

export type PreReservationEmailIdentity = {
  email: string;
  name?: string;
};

export type PreReservationEmailTemplateResult =
  | {
      ok: true;
      template: {
        id: number;
        name: string;
        subject: string;
        isActive: boolean;
        modifiedAt: string | null;
        sender: PreReservationEmailIdentity | null;
        replyTo: PreReservationEmailIdentity | null;
      };
    }
  | {
      ok: false;
      reason: PreReservationEmailProviderErrorReason;
    };

export type SendPreReservationProviderEmailInput = {
  templateId: number;
  to: PreReservationEmailIdentity;
  params: Record<string, string>;
  idempotencyKey: string;
  tags?: string[];
};

export type SendPreReservationProviderEmailResult =
  | {
      ok: true;
      messageId: string;
    }
  | {
      ok: false;
      reason: PreReservationEmailProviderErrorReason;
    };

export type PreReservationEmailTransport = {
  getTemplate: (templateId: number) => Promise<PreReservationEmailTemplateResult>;
  sendEmail: (
    input: SendPreReservationProviderEmailInput,
  ) => Promise<SendPreReservationProviderEmailResult>;
  isConfigured: () => boolean;
};

export type SendPreReservationEmailResult = {
  status: ReservationEmailStatus;
  deliveryState: PreReservationEmailDeliveryState;
  attemptId?: string;
  errorCode?: string;
  rpcOutcome?: string | null;
  rpcReason?: string | null;
  reservationPrepared?: boolean;
  paymentCreated?: boolean;
  compensated?: boolean;
};

const PRE_RESERVATION_MESSAGE_TYPE = "pre_reservation";
const PRE_RESERVATION_OPERATION_VERSION = "v1";

function isValidEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export function formatPreReservationContactFullName(contact: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
}) {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    contact.display_name ||
    ""
  );
}

export function formatPreReservationEuros(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function formatPreReservationParisDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(date);
}

function normalizeBrevoModifiedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toFailedStatus(
  reason: PreReservationEmailProviderErrorReason,
): ReservationEmailStatus {
  if (reason === "not_configured") {
    return "brevo_not_configured";
  }

  if (reason === "template_not_found" || reason === "template_inactive") {
    return "missing_template";
  }

  return "failed";
}

async function readWritableMembership(supabase: Supabase, userId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", ["owner", "admin", "member"])
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function readReservation(
  supabase: Supabase,
  organizationId: string,
  reservationId: string,
) {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, organization_id, contact_id, litter_id, litter_group_id, status, pre_reservation_deadline, currency",
    )
    .eq("organization_id", organizationId)
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as RelatedReservation;
}

async function readContact(
  supabase: Supabase,
  organizationId: string,
  contactId: string,
) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, display_name, email")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ContactForEmail;
}

async function readPayment(
  supabase: Supabase,
  organizationId: string,
  reservation: RelatedReservation,
) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount_cents, currency, status, due_date")
    .eq("organization_id", organizationId)
    .eq("reservation_id", reservation.id)
    .eq("contact_id", reservation.contact_id)
    .in("payment_type", ["pre_reservation_deposit_refundable", "arrhes"])
    .in("status", ["requested", "pending", "partially_paid"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PaymentForEmail;
}

async function readTemplate(supabase: Supabase, organizationId: string) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, subject, brevo_template_id")
    .eq("organization_id", organizationId)
    .eq("template_key", PRE_RESERVATION_MESSAGE_TYPE)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as EmailTemplateForSend;
}

async function readOrganization(supabase: Supabase, organizationId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, affix_name, dog_affix_name")
    .eq("id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as OrganizationForEmail;
}

async function readScope(
  supabase: Supabase,
  organizationId: string,
  reservation: RelatedReservation,
): Promise<LitterScopeForEmail | null> {
  let litterName = "";
  let litterGroupName = "";

  if (reservation.litter_id) {
    const { data: litter } = await supabase
      .from("litters")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", reservation.litter_id)
      .is("deleted_at", null)
      .maybeSingle();

    litterName = litter?.name ?? "";
  }

  if (reservation.litter_group_id) {
    const { data: litterGroup } = await supabase
      .from("litter_groups")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", reservation.litter_group_id)
      .is("deleted_at", null)
      .maybeSingle();

    litterGroupName = litterGroup?.name ?? "";
  }

  if (!reservation.litter_id && !reservation.litter_group_id) {
    return null;
  }

  return { litterName, litterGroupName };
}

function buildVariables({
  contact,
  organization,
  payment,
  reservation,
  scope,
}: {
  contact: ContactForEmail;
  organization: OrganizationForEmail | null;
  payment: PaymentForEmail;
  reservation: RelatedReservation;
  scope: LitterScopeForEmail;
}) {
  const fullName = formatPreReservationContactFullName(contact);

  return {
    prenom: contact.first_name ?? "",
    nom: contact.last_name ?? "",
    nom_complet: fullName,
    portee: scope.litterName,
    groupe_portees: scope.litterGroupName,
    montant_pre_reservation: formatPreReservationEuros(payment.amount_cents),
    echeance_pre_reservation: formatPreReservationParisDate(
      payment.due_date ?? reservation.pre_reservation_deadline,
    ),
    nom_elevage:
      organization?.dog_affix_name ??
      organization?.affix_name ??
      organization?.name ??
      "",
  };
}

type PreReservationRpcResult = {
  outcome: string | null;
  application_id: string | null;
  reservation_id: string | null;
  payment_id: string | null;
  reservation_created: boolean | null;
  payment_created: boolean | null;
  reason: string | null;
};

function mapTransactionalResult(
  result: Awaited<ReturnType<typeof runTransactionalCampaignDelivery>>,
): SendPreReservationEmailResult {
  const metadata = result.metadata ?? {};
  const base = {
    attemptId: result.attemptId,
    errorCode: result.errorCode,
    rpcOutcome: typeof metadata.rpcOutcome === "string" ? metadata.rpcOutcome : null,
    rpcReason: typeof metadata.rpcReason === "string" ? metadata.rpcReason : null,
    reservationPrepared: metadata.reservationPrepared === true,
    paymentCreated: metadata.paymentCreated === true,
    compensated: result.compensated ?? false,
  };
  if (result.outcome === "success") return { status: "success", deliveryState: "sent", ...base };
  if (result.outcome === "already_sent") return { status: "already_sent", deliveryState: "sent", ...base };
  if (result.outcome === "in_progress") return { status: "in_progress", deliveryState: "in_progress", ...base };
  if (result.outcome === "uncertain") return { status: "failed", deliveryState: "uncertain", ...base };
  if (result.errorCode === "missing_email") return { status: "missing_email", deliveryState: "not_sent", ...base };
  if (["missing_template", "invalid_request", "template_not_found", "template_inactive"].includes(result.errorCode ?? "")) return { status: "missing_template", deliveryState: "not_sent", ...base };
  if (["brevo_not_configured", "not_configured"].includes(result.errorCode ?? "")) return { status: "brevo_not_configured", deliveryState: "not_sent", ...base };
  return { status: result.errorCode === "not_eligible" ? "not_eligible" : "failed", deliveryState: "not_sent", ...base };
}

export async function sendPreReservationEmailForApplication(
  input: {
    applicationId: string;
    targetLitterId?: string | null;
    targetLitterGroupId?: string | null;
  },
  options: {
    supabase: Supabase;
    transport?: PreReservationEmailTransport;
    transitions?: Parameters<typeof runTransactionalCampaignDelivery>[1]["transitions"];
  },
): Promise<SendPreReservationEmailResult> {
  let preparedContact: ContactForEmail | null = null;
  let preparedOrganization: OrganizationForEmail | null = null;

  const result = await runTransactionalCampaignDelivery(
    {
      campaignKey: PRE_RESERVATION_MESSAGE_TYPE,
      operationVersion: PRE_RESERVATION_OPERATION_VERSION,
      transport: options.transport as TransactionalEmailTransport | undefined,
      prepareOperation: async ({ supabase, organizationId }) => {
        const { data: application, error } = await supabase
          .from("applications")
          .select("id, contact_id, desired_litter_id, desired_litter_group_id, status")
          .eq("organization_id", organizationId)
          .eq("id", input.applicationId)
          .eq("status", "qualified")
          .is("deleted_at", null)
          .maybeSingle();
        if (error || !application?.contact_id) return { ok: false, errorCode: "not_eligible" };
        if (input.targetLitterId && application.desired_litter_id !== input.targetLitterId) return { ok: false, errorCode: "not_eligible" };
        if (input.targetLitterGroupId && application.desired_litter_group_id !== input.targetLitterGroupId && !input.targetLitterId) return { ok: false, errorCode: "not_eligible" };
        const [contact, organization, targetLitter, targetGroup] = await Promise.all([
          readContact(supabase, organizationId, application.contact_id),
          readOrganization(supabase, organizationId),
          input.targetLitterId
            ? supabase.from("litters").select("id").eq("organization_id", organizationId).eq("id", input.targetLitterId).is("deleted_at", null).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          input.targetLitterGroupId
            ? supabase.from("litter_groups").select("id").eq("organization_id", organizationId).eq("id", input.targetLitterGroupId).is("deleted_at", null).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (!contact || !isValidEmail(contact.email)) return { ok: false, errorCode: "missing_email" };
        if ((input.targetLitterId && !targetLitter.data) || (input.targetLitterGroupId && !targetGroup.data)) return { ok: false, errorCode: "not_eligible" };
        preparedContact = contact;
        preparedOrganization = organization;
        const fullName = formatPreReservationContactFullName(contact);
        return {
          ok: true,
          operation: {
            dossierId: application.id,
            applicationId: application.id,
            contactId: contact.id,
            recipientEmail: contact.email!.trim().toLowerCase(),
            recipientName: fullName || contact.display_name,
            litterId: input.targetLitterId,
            litterGroupId: input.targetLitterGroupId,
            variables: {
              prenom: contact.first_name ?? "",
              nom: contact.last_name ?? "",
              nom_complet: fullName,
              portee: "",
              groupe_portees: "",
              montant_pre_reservation: "",
              echeance_pre_reservation: "",
              nom_elevage: organization?.dog_affix_name ?? organization?.affix_name ?? organization?.name ?? "",
            },
          },
        };
      },
      prepareClaimedOperation: async ({ supabase, organizationId, userId, operation }) => {
        const { data, error } = await supabase.rpc(
          "create_pre_reservation_request_for_application",
          {
            p_application_id: input.applicationId,
            p_target_litter_id: input.targetLitterId ?? undefined,
            p_target_litter_group_id: input.targetLitterGroupId ?? undefined,
          },
        );
        if (error) return { ok: false, errorCode: "rpc_error" };
        const rpc = data?.[0] as PreReservationRpcResult | undefined;
        const metadata = {
          rpcOutcome: rpc?.outcome ?? "unknown",
          rpcReason: rpc?.reason ?? null,
          reservationPrepared: false,
          paymentCreated: false,
        };
        if (!rpc || !["created", "already_exists"].includes(rpc.outcome ?? "")) {
          return { ok: true, claimed: { metadata, preSendErrorCode: rpc?.outcome === "ineligible" ? "not_eligible" : rpc?.outcome === "conflict" ? `conflict:${rpc.reason ?? "unknown"}` : "invalid_rpc_result" } };
        }
        if (!rpc.reservation_id || !rpc.payment_id || !preparedContact) {
          return { ok: true, claimed: { metadata, preSendErrorCode: "invalid_rpc_result" } };
        }
        const shouldCompensate = rpc.outcome === "created" && rpc.reservation_created === true && rpc.payment_created === true;
        const compensate = shouldCompensate
          ? () => compensateUnsentPreReservationCreation({ supabase, result: rpc, userId })
          : undefined;
        const [reservationResult, paymentResult] = await Promise.all([
          supabase.from("reservations").select("id, organization_id, contact_id, application_id, litter_id, litter_group_id, status, pre_reservation_deadline, currency").eq("id", rpc.reservation_id).eq("organization_id", organizationId).eq("application_id", input.applicationId).eq("contact_id", preparedContact.id).eq("status", "pre_reservation_requested").is("deleted_at", null).maybeSingle(),
          supabase.from("payments").select("id, organization_id, contact_id, reservation_id, amount_cents, currency, status, due_date").eq("id", rpc.payment_id).eq("organization_id", organizationId).eq("reservation_id", rpc.reservation_id).eq("contact_id", preparedContact.id).in("payment_type", ["pre_reservation_deposit_refundable", "arrhes"]).in("status", ["requested", "pending", "partially_paid"]).is("deleted_at", null).maybeSingle(),
        ]);
        const reservation = reservationResult.data;
        const payment = paymentResult.data;
        const finalMetadata = { ...metadata, reservationPrepared: Boolean(reservation), paymentCreated: rpc.payment_created === true };
        if (reservationResult.error || paymentResult.error || !reservation || !payment) {
          return { ok: true, claimed: { metadata: finalMetadata, compensate, preSendErrorCode: "created_resource_read_failed" } };
        }
        if (reservation.litter_id !== (input.targetLitterId ?? null) || reservation.litter_group_id !== (input.targetLitterGroupId ?? null)) {
          return { ok: true, claimed: { metadata: finalMetadata, compensate, preSendErrorCode: "created_resource_scope_mismatch" } };
        }
        const scope = await readScope(supabase, organizationId, reservation as RelatedReservation);
        if (!scope) return { ok: true, claimed: { metadata: finalMetadata, compensate, preSendErrorCode: "created_resource_scope_missing" } };
        const variables = buildVariables({ contact: preparedContact, organization: preparedOrganization, payment, reservation: reservation as RelatedReservation, scope });
        return {
          ok: true,
          claimed: {
            operation: { ...operation, applicationId: input.applicationId, reservationId: reservation.id, litterId: reservation.litter_id, litterGroupId: reservation.litter_group_id, variables, variablesSnapshot: { ...variables, application_id: input.applicationId, payment_request_id: payment.id } },
            resourceAction: rpc.outcome === "created" ? "created" : "reused",
            metadata: finalMetadata,
            compensate,
          },
        };
      },
    },
    { supabase: options.supabase, transitions: options.transitions },
  );

  return mapTransactionalResult(result);
}

export async function sendPreReservationEmailForReservation(
  input: {
    reservationId: string;
  },
  options: {
    supabase: Supabase;
    transport?: PreReservationEmailTransport;
  },
): Promise<SendPreReservationEmailResult> {
  const supabase = options.supabase;
  const transport = options.transport;

  if (!transport) {
    return { status: "brevo_not_configured", deliveryState: "not_sent" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  const membership = await readWritableMembership(supabase, user.id);
  if (!membership) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  const reservation = await readReservation(
    supabase,
    membership.organization_id,
    input.reservationId,
  );
  if (!reservation || reservation.status !== "pre_reservation_requested") {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  if (!reservation.pre_reservation_deadline) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  if (!reservation.litter_id && !reservation.litter_group_id) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  const [contact, payment, template, organization, scope] = await Promise.all([
    readContact(supabase, reservation.organization_id, reservation.contact_id),
    readPayment(supabase, reservation.organization_id, reservation),
    readTemplate(supabase, reservation.organization_id),
    readOrganization(supabase, reservation.organization_id),
    readScope(supabase, reservation.organization_id, reservation),
  ]);

  if (!contact || !isValidEmail(contact.email)) {
    return { status: "missing_email", deliveryState: "not_sent" };
  }
  const recipientEmail = contact.email?.trim().toLowerCase() ?? "";

  if (!payment) {
    return { status: "missing_payment", deliveryState: "not_sent" };
  }

  if (!template?.brevo_template_id) {
    return { status: "missing_template", deliveryState: "not_sent" };
  }

  if (!scope) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  if (!transport.isConfigured()) {
    return { status: "brevo_not_configured", deliveryState: "not_sent" };
  }

  const variables = buildVariables({
    contact,
    organization,
    payment,
    reservation,
    scope,
  });
  const idempotencyKey = buildEmailDeliveryIdempotencyKey({
    organizationId: reservation.organization_id,
    messageType: PRE_RESERVATION_MESSAGE_TYPE,
    contactId: reservation.contact_id,
    reservationId: reservation.id,
    litterId: reservation.litter_id,
    litterGroupId: reservation.litter_group_id,
    operationVersion: PRE_RESERVATION_OPERATION_VERSION,
  });

  if (!idempotencyKey) {
    return {
      status: "failed",
      deliveryState: "not_sent",
      errorCode: "invalid_idempotency_key",
    };
  }

  const recipientName = variables.nom_complet || contact.display_name || null;
  const preparedAttempt = await prepareEmailDeliveryAttempt(
    {
      organizationId: reservation.organization_id,
      contactId: reservation.contact_id,
      reservationId: reservation.id,
      litterId: reservation.litter_id,
      litterGroupId: reservation.litter_group_id,
      emailTemplateId: template.id,
      messageType: PRE_RESERVATION_MESSAGE_TYPE,
      recipientEmail,
      recipientName,
      subjectSnapshot: template.subject,
      variablesSnapshot: variables,
      idempotencyKey,
      userId: user.id,
    },
    supabase,
  );

  if (preparedAttempt.outcome === "error") {
    return {
      status: "failed",
      deliveryState: "not_sent",
      errorCode: preparedAttempt.error.code,
    };
  }

  if (preparedAttempt.attempt.status === "sent") {
    return {
      status: "already_sent",
      deliveryState: "sent",
      attemptId: preparedAttempt.attempt.id,
    };
  }

  const claim = await claimEmailDeliveryAttemptForSend(
    {
      organizationId: reservation.organization_id,
      attemptId: preparedAttempt.attempt.id,
      userId: user.id,
    },
    supabase,
  );

  if (claim.outcome === "already_sent") {
    return {
      status: "already_sent",
      deliveryState: "sent",
      attemptId: claim.attempt?.id,
    };
  }

  if (claim.outcome === "in_progress") {
    return {
      status: "in_progress",
      deliveryState: "in_progress",
      attemptId: claim.attempt?.id,
    };
  }

  if (claim.outcome !== "claimed") {
    return {
      status: "failed",
      deliveryState: "not_sent",
      attemptId: preparedAttempt.attempt.id,
      errorCode: claim.outcome === "error" ? claim.error.code : claim.outcome,
    };
  }

  const templateResult = await transport.getTemplate(template.brevo_template_id);

  if (!templateResult.ok) {
    await markEmailDeliveryAttemptFailed(
      {
        organizationId: reservation.organization_id,
        attemptId: claim.attempt.id,
        lastErrorCode: templateResult.reason,
        userId: user.id,
      },
      supabase,
    );

    return {
      status: toFailedStatus(templateResult.reason),
      deliveryState: "not_sent",
      attemptId: claim.attempt.id,
      errorCode: templateResult.reason,
    };
  }

  const snapshot = await snapshotEmailDeliveryAttemptBrevoTemplate(
    {
      organizationId: reservation.organization_id,
      attemptId: claim.attempt.id,
      emailTemplateId: template.id,
      recipientEmail,
      recipientName,
      variablesSnapshot: variables,
      brevoTemplateId: templateResult.template.id,
      brevoTemplateModifiedAt: normalizeBrevoModifiedAt(
        templateResult.template.modifiedAt,
      ),
      subjectSnapshot: templateResult.template.subject,
      userId: user.id,
    },
    supabase,
  );

  if (snapshot.outcome === "error") {
    await markEmailDeliveryAttemptFailed(
      {
        organizationId: reservation.organization_id,
        attemptId: claim.attempt.id,
        lastErrorCode: snapshot.error.code,
        userId: user.id,
      },
      supabase,
    );

    return {
      status: "failed",
      deliveryState: "not_sent",
      attemptId: claim.attempt.id,
      errorCode: snapshot.error.code,
    };
  }

  const sendResult = await transport.sendEmail({
    templateId: templateResult.template.id,
    to: {
      email: recipientEmail,
      ...(recipientName ? { name: recipientName } : {}),
    },
    params: variables,
    idempotencyKey,
    tags: ["saas_elevage", "pre_reservation"],
  });

  if (!sendResult.ok) {
    await markEmailDeliveryAttemptFailed(
      {
        organizationId: reservation.organization_id,
        attemptId: claim.attempt.id,
        lastErrorCode: sendResult.reason,
        userId: user.id,
      },
      supabase,
    );

    return {
      status: toFailedStatus(sendResult.reason),
      deliveryState: "not_sent",
      attemptId: claim.attempt.id,
      errorCode: sendResult.reason,
    };
  }

  const sentResult = await markEmailDeliveryAttemptSent(
    {
      organizationId: reservation.organization_id,
      attemptId: claim.attempt.id,
      brevoMessageId: sendResult.messageId,
      userId: user.id,
    },
    supabase,
  );

  if (sentResult.outcome === "error") {
    return {
      status: "failed",
      deliveryState: "uncertain",
      attemptId: claim.attempt.id,
      errorCode: sentResult.error.code,
    };
  }

  return {
    status: "success",
    deliveryState: "sent",
    attemptId: sentResult.attempt.id,
  };
}
