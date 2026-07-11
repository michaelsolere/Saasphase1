import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEmailDeliveryIdempotencyKey,
  claimEmailDeliveryAttemptForSend,
  markEmailDeliveryAttemptFailed,
  markEmailDeliveryAttemptSent,
  prepareEmailDeliveryAttempt,
  snapshotEmailDeliveryAttemptBrevoTemplate,
} from "@/features/communications/email-delivery-attempts";
import {
  getBrevoConfigurationStatus,
  getBrevoTransactionalTemplate,
  sendBrevoTransactionalEmail,
  type BrevoApiErrorReason,
  type BrevoTransactionalTemplateResult,
  type SendBrevoTransactionalEmailInput,
  type SendBrevoTransactionalEmailResult,
} from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

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

export type PreReservationEmailTransport = {
  getTemplate: (templateId: number) => Promise<BrevoTransactionalTemplateResult>;
  sendEmail: (
    input: SendBrevoTransactionalEmailInput,
  ) => Promise<SendBrevoTransactionalEmailResult>;
  isConfigured: () => boolean;
};

export type SendPreReservationEmailResult = {
  status: ReservationEmailStatus;
  attemptId?: string;
  errorCode?: string;
};

const PRE_RESERVATION_MESSAGE_TYPE = "pre_reservation";
const PRE_RESERVATION_OPERATION_VERSION = "v1";

function defaultTransport(): PreReservationEmailTransport {
  return {
    getTemplate: getBrevoTransactionalTemplate,
    sendEmail: sendBrevoTransactionalEmail,
    isConfigured: () => getBrevoConfigurationStatus().isConfigured,
  };
}

function isValidEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function formatFullName(contact: ContactForEmail) {
  return (
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    contact.display_name ||
    ""
  );
}

function formatEuros(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function formatParisDate(value: string | null) {
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

function toFailedStatus(reason: BrevoApiErrorReason): ReservationEmailStatus {
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
  const fullName = formatFullName(contact);

  return {
    prenom: contact.first_name ?? "",
    nom: contact.last_name ?? "",
    nom_complet: fullName,
    portee: scope.litterName,
    groupe_portees: scope.litterGroupName,
    montant_pre_reservation: formatEuros(payment.amount_cents),
    echeance_pre_reservation: formatParisDate(
      payment.due_date ?? reservation.pre_reservation_deadline,
    ),
    nom_elevage:
      organization?.dog_affix_name ??
      organization?.affix_name ??
      organization?.name ??
      "",
  };
}

export async function sendPreReservationEmailForReservation(
  input: {
    reservationId: string;
  },
  options?: {
    supabase?: Supabase;
    transport?: PreReservationEmailTransport;
  },
): Promise<SendPreReservationEmailResult> {
  const supabase = options?.supabase ?? (await createClient());
  const transport = options?.transport ?? defaultTransport();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "not_eligible" };
  }

  const membership = await readWritableMembership(supabase, user.id);
  if (!membership) {
    return { status: "not_eligible" };
  }

  const reservation = await readReservation(
    supabase,
    membership.organization_id,
    input.reservationId,
  );
  if (!reservation || reservation.status !== "pre_reservation_requested") {
    return { status: "not_eligible" };
  }

  if (!reservation.pre_reservation_deadline) {
    return { status: "not_eligible" };
  }

  if (!reservation.litter_id && !reservation.litter_group_id) {
    return { status: "not_eligible" };
  }

  const [contact, payment, template, organization, scope] = await Promise.all([
    readContact(supabase, reservation.organization_id, reservation.contact_id),
    readPayment(supabase, reservation.organization_id, reservation),
    readTemplate(supabase, reservation.organization_id),
    readOrganization(supabase, reservation.organization_id),
    readScope(supabase, reservation.organization_id, reservation),
  ]);

  if (!contact || !isValidEmail(contact.email)) {
    return { status: "missing_email" };
  }
  const recipientEmail = contact.email?.trim().toLowerCase() ?? "";

  if (!payment) {
    return { status: "missing_payment" };
  }

  if (!template?.brevo_template_id) {
    return { status: "missing_template" };
  }

  if (!scope) {
    return { status: "not_eligible" };
  }

  if (!transport.isConfigured()) {
    return { status: "brevo_not_configured" };
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
    return { status: "failed", errorCode: "invalid_idempotency_key" };
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
    return { status: "failed", errorCode: preparedAttempt.error.code };
  }

  if (preparedAttempt.attempt.status === "sent") {
    return { status: "already_sent", attemptId: preparedAttempt.attempt.id };
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
    return { status: "already_sent", attemptId: claim.attempt?.id };
  }

  if (claim.outcome === "in_progress") {
    return { status: "in_progress", attemptId: claim.attempt?.id };
  }

  if (claim.outcome !== "claimed") {
    return {
      status: "failed",
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
      attemptId: claim.attempt.id,
      errorCode: templateResult.reason,
    };
  }

  const snapshot = await snapshotEmailDeliveryAttemptBrevoTemplate(
    {
      organizationId: reservation.organization_id,
      attemptId: claim.attempt.id,
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
      attemptId: claim.attempt.id,
      errorCode: sentResult.error.code,
    };
  }

  return { status: "success", attemptId: sentResult.attempt.id };
}
