import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  claimEmailDeliveryAttemptForSend,
  markEmailDeliveryAttemptFailed,
  markEmailDeliveryAttemptSent,
  prepareEmailDeliveryAttempt,
  snapshotEmailDeliveryAttemptBrevoTemplate,
} from "@/features/communications/email-delivery-attempts-core";
import {
  formatPreReservationContactFullName,
  formatPreReservationParisDate,
} from "@/features/communications/pre-reservation-email-core";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

type MatingConfirmationStatus =
  | "success"
  | "already_sent"
  | "in_progress"
  | "failed"
  | "not_eligible"
  | "missing_email"
  | "missing_template"
  | "brevo_not_configured";

export type MatingConfirmationDeliveryState =
  | "sent"
  | "not_sent"
  | "in_progress"
  | "uncertain";

type ApplicationForEmail = {
  id: string;
  organization_id: string;
  contact_id: string | null;
  desired_litter_id: string | null;
  desired_litter_group_id: string | null;
  status: string;
};

type ContactForEmail = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
};

type LitterForEmail = {
  id: string;
  organization_id: string;
  name: string | null;
  litter_group_id: string | null;
  mating_date: string | null;
  mating_date_2: string | null;
};

type LitterOverviewForEmail = {
  id: string;
  litter_group_name: string | null;
  mother_display_name: string | null;
  father_display_name: string | null;
};

type OrganizationForEmail = {
  id: string;
  name: string;
  affix_name: string | null;
  dog_affix_name: string | null;
};

type EmailTemplateForSend = {
  id: string;
  brevo_template_id: number | null;
};

export type MatingConfirmationProviderErrorReason =
  | "not_configured"
  | "unauthorized"
  | "timeout"
  | "invalid_request"
  | "template_not_found"
  | "template_inactive"
  | "rate_limited"
  | "provider_unavailable"
  | "api_error";

export type MatingConfirmationEmailIdentity = {
  email: string;
  name?: string;
};

export type MatingConfirmationTemplateResult =
  | {
      ok: true;
      template: {
        id: number;
        name: string;
        subject: string;
        isActive: boolean;
        modifiedAt: string | null;
        sender: MatingConfirmationEmailIdentity | null;
        replyTo: MatingConfirmationEmailIdentity | null;
      };
    }
  | {
      ok: false;
      reason: MatingConfirmationProviderErrorReason;
    };

export type SendMatingConfirmationProviderEmailInput = {
  templateId: number;
  to: MatingConfirmationEmailIdentity;
  params: Record<string, string>;
  idempotencyKey: string;
  tags?: string[];
};

export type SendMatingConfirmationProviderEmailResult =
  | {
      ok: true;
      messageId: string;
    }
  | {
      ok: false;
      reason: MatingConfirmationProviderErrorReason;
    };

export type MatingConfirmationEmailTransport = {
  getTemplate: (
    templateId: number,
  ) => Promise<MatingConfirmationTemplateResult>;
  sendEmail: (
    input: SendMatingConfirmationProviderEmailInput,
  ) => Promise<SendMatingConfirmationProviderEmailResult>;
  isConfigured: () => boolean;
};

export type SendMatingConfirmationEmailResult = {
  status: MatingConfirmationStatus;
  deliveryState: MatingConfirmationDeliveryState;
  attemptId?: string;
  errorCode?: string;
};

const MATING_CONFIRMATION_MESSAGE_TYPE = "mating_confirmation";
const MATING_CONFIRMATION_OPERATION_VERSION = "v1";

function isValidEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function normalizeBrevoModifiedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function buildMatingConfirmationIdempotencyKey({
  organizationId,
  applicationId,
  contactId,
  litterId,
}: {
  organizationId: string;
  applicationId: string;
  contactId: string;
  litterId: string;
}) {
  const logicalParts = [
    ["organization", organizationId],
    ["message_type", MATING_CONFIRMATION_MESSAGE_TYPE],
    ["application", applicationId],
    ["contact", contactId],
    ["litter", litterId],
    ["version", MATING_CONFIRMATION_OPERATION_VERSION],
  ];

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(logicalParts))
    .digest("hex")
    .slice(0, 40);

  return `${MATING_CONFIRMATION_MESSAGE_TYPE}:${fingerprint}`;
}

function toFailedStatus(reason: MatingConfirmationProviderErrorReason) {
  if (reason === "not_configured") {
    return "brevo_not_configured";
  }

  if (
    reason === "invalid_request" ||
    reason === "template_not_found" ||
    reason === "template_inactive"
  ) {
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

async function readApplication(
  supabase: Supabase,
  organizationId: string,
  applicationId: string,
  litterId: string,
) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, organization_id, contact_id, desired_litter_id, desired_litter_group_id, status")
    .eq("organization_id", organizationId)
    .eq("id", applicationId)
    .eq("desired_litter_id", litterId)
    .eq("status", "qualified")
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ApplicationForEmail;
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

async function readLitter(
  supabase: Supabase,
  organizationId: string,
  litterId: string,
) {
  const { data, error } = await supabase
    .from("litters")
    .select("id, organization_id, name, litter_group_id, mating_date, mating_date_2")
    .eq("organization_id", organizationId)
    .eq("id", litterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as LitterForEmail;
}

async function readLitterOverview(supabase: Supabase, litterId: string) {
  const { data, error } = await supabase
    .from("litter_overview")
    .select("id, litter_group_name, mother_display_name, father_display_name")
    .eq("id", litterId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as LitterOverviewForEmail;
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

async function readTemplate(supabase: Supabase, organizationId: string) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, brevo_template_id")
    .eq("organization_id", organizationId)
    .eq("template_key", MATING_CONFIRMATION_MESSAGE_TYPE)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as EmailTemplateForSend;
}

function buildVariables({
  contact,
  litter,
  overview,
  organization,
}: {
  contact: ContactForEmail;
  litter: LitterForEmail;
  overview: LitterOverviewForEmail | null;
  organization: OrganizationForEmail | null;
}) {
  const fullName = formatPreReservationContactFullName(contact);

  return {
    prenom: contact.first_name ?? "",
    nom: contact.last_name ?? "",
    nom_complet: fullName,
    portee: litter.name ?? "",
    groupe_portees: overview?.litter_group_name ?? "",
    mere: overview?.mother_display_name ?? "",
    pere: overview?.father_display_name ?? "",
    date_saillie: formatPreReservationParisDate(litter.mating_date),
    date_saillie_2: formatPreReservationParisDate(litter.mating_date_2),
    nom_elevage:
      organization?.dog_affix_name ??
      organization?.affix_name ??
      organization?.name ??
      "",
  };
}

export async function sendMatingConfirmationEmailForApplication(
  input: {
    applicationId: string;
    litterId: string;
  },
  options: {
    supabase: Supabase;
    transport?: MatingConfirmationEmailTransport;
  },
): Promise<SendMatingConfirmationEmailResult> {
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

  const application = await readApplication(
    supabase,
    membership.organization_id,
    input.applicationId,
    input.litterId,
  );

  if (!application?.contact_id) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  const [contact, litter, overview, organization, template] = await Promise.all([
    readContact(supabase, application.organization_id, application.contact_id),
    readLitter(supabase, application.organization_id, input.litterId),
    readLitterOverview(supabase, input.litterId),
    readOrganization(supabase, application.organization_id),
    readTemplate(supabase, application.organization_id),
  ]);

  if (!contact || !isValidEmail(contact.email)) {
    return { status: "missing_email", deliveryState: "not_sent" };
  }

  if (!litter) {
    return { status: "not_eligible", deliveryState: "not_sent" };
  }

  if (!template?.brevo_template_id) {
    return { status: "missing_template", deliveryState: "not_sent" };
  }

  if (!transport.isConfigured()) {
    return { status: "brevo_not_configured", deliveryState: "not_sent" };
  }

  const recipientEmail = contact.email?.trim().toLowerCase() ?? "";
  const recipientName =
    formatPreReservationContactFullName(contact) || contact.display_name || null;
  const variables = buildVariables({ contact, litter, overview, organization });
  const idempotencyKey = buildMatingConfirmationIdempotencyKey({
    organizationId: application.organization_id,
    applicationId: application.id,
    contactId: contact.id,
    litterId: litter.id,
  });

  if (!idempotencyKey) {
    return {
      status: "failed",
      deliveryState: "not_sent",
      errorCode: "invalid_idempotency_key",
    };
  }

  const preparedAttempt = await prepareEmailDeliveryAttempt(
    {
      organizationId: application.organization_id,
      contactId: contact.id,
      litterId: litter.id,
      litterGroupId: litter.litter_group_id,
      emailTemplateId: template.id,
      messageType: MATING_CONFIRMATION_MESSAGE_TYPE,
      recipientEmail,
      recipientName,
      variablesSnapshot: { ...variables, application_id: application.id },
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
      organizationId: application.organization_id,
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
        organizationId: application.organization_id,
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
      organizationId: application.organization_id,
      attemptId: claim.attempt.id,
      emailTemplateId: template.id,
      recipientEmail,
      recipientName,
      variablesSnapshot: { ...variables, application_id: application.id },
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
        organizationId: application.organization_id,
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
    tags: ["saas_elevage", MATING_CONFIRMATION_MESSAGE_TYPE],
  });

  if (!sendResult.ok) {
    await markEmailDeliveryAttemptFailed(
      {
        organizationId: application.organization_id,
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
      organizationId: application.organization_id,
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
