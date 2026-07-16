import type { SupabaseClient } from "@supabase/supabase-js";

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
  application_id: string | null;
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
      "id, organization_id, contact_id, application_id, litter_id, litter_group_id, status, pre_reservation_deadline, currency",
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

async function readBlockingHistoricalPreReservationAttempt(
  supabase: Supabase,
  applicationId: string,
): Promise<SendPreReservationEmailResult | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const membership = await readWritableMembership(supabase, authData.user.id);
  if (!membership) return null;
  const { data: application } = await supabase
    .from("applications")
    .select("id, contact_id")
    .eq("organization_id", membership.organization_id)
    .eq("id", applicationId)
    .eq("status", "qualified")
    .is("deleted_at", null)
    .maybeSingle();
  if (!application?.contact_id) return null;
  const { data: reservations } = await supabase
    .from("reservations")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .eq("application_id", application.id)
    .eq("contact_id", application.contact_id)
    .is("deleted_at", null);
  const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
  if (!reservationIds.length) return null;
  const { data: attempts } = await supabase
    .from("email_delivery_attempts")
    .select("id, status")
    .eq("organization_id", membership.organization_id)
    .eq("contact_id", application.contact_id)
    .eq("message_type", PRE_RESERVATION_MESSAGE_TYPE)
    .in("reservation_id", reservationIds)
    .in("status", ["sent", "sending"])
    .is("deleted_at", null);
  const sent = attempts?.find((attempt) => attempt.status === "sent");
  if (sent) {
    return { status: "already_sent", deliveryState: "sent", attemptId: sent.id };
  }
  const sending = attempts?.find((attempt) => attempt.status === "sending");
  return sending
    ? { status: "in_progress", deliveryState: "in_progress", attemptId: sending.id }
    : null;
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
  const historical = await readBlockingHistoricalPreReservationAttempt(
    options.supabase,
    input.applicationId,
  );
  if (historical) return historical;

  let preparedContact: ContactForEmail | null = null;
  let preparedOrganization: OrganizationForEmail | null = null;

  const result = await runTransactionalCampaignDelivery(
    {
      campaignKey: PRE_RESERVATION_MESSAGE_TYPE,
      operationVersion: PRE_RESERVATION_OPERATION_VERSION,
      prepareClaimedOperationAfterTemplate: true,
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
  input: { reservationId: string },
  options: {
    supabase: Supabase;
    transport?: PreReservationEmailTransport;
  },
): Promise<SendPreReservationEmailResult> {
  const { data: authData } = await options.supabase.auth.getUser();
  if (!authData.user) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }
  const membership = await readWritableMembership(
    options.supabase,
    authData.user.id,
  );
  if (!membership) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }
  const reservation = await readReservation(
    options.supabase,
    membership.organization_id,
    input.reservationId,
  );
  if (
    !reservation ||
    reservation.status !== "pre_reservation_requested" ||
    !reservation.contact_id ||
    !reservation.application_id ||
    (!reservation.litter_id && !reservation.litter_group_id)
  ) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }
  return sendPreReservationEmailForApplication(
    {
      applicationId: reservation.application_id,
      targetLitterId: reservation.litter_id,
      targetLitterGroupId: reservation.litter_group_id,
    },
    options,
  );
}
