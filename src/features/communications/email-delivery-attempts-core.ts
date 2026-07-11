import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type EmailDeliveryAttempt =
  Database["public"]["Tables"]["email_delivery_attempts"]["Row"];
type JsonObject = { [key: string]: Json | undefined };

type NullableId = string | null | undefined;

export type PrepareEmailDeliveryAttemptInput = {
  organizationId: string;
  contactId: string;
  reservationId?: NullableId;
  litterId?: NullableId;
  litterGroupId?: NullableId;
  emailTemplateId?: NullableId;
  messageType: string;
  recipientEmail: string;
  recipientName?: string | null;
  subjectSnapshot?: string | null;
  variablesSnapshot?: unknown;
  idempotencyKey: string;
  userId: string;
};

export type EmailDeliveryAttemptErrorCode =
  | "invalid_input"
  | "linked_record_not_found"
  | "linked_record_mismatch"
  | "not_found"
  | "database_error";

export type EmailDeliveryAttemptResult =
  | {
      outcome: "created" | "existing";
      attempt: EmailDeliveryAttempt;
    }
  | {
      outcome: "error";
      error: {
        code: EmailDeliveryAttemptErrorCode;
        message: string;
      };
    };

export type ClaimEmailDeliveryAttemptForSendResult =
  | {
      outcome: "claimed";
      attempt: EmailDeliveryAttempt;
    }
  | {
      outcome: "already_sent" | "in_progress" | "not_found";
      attempt?: EmailDeliveryAttempt;
    }
  | {
      outcome: "error";
      error: {
        code: EmailDeliveryAttemptErrorCode;
        message: string;
      };
    };

export type EmailDeliveryAttemptTransitionResult =
  | {
      outcome: "updated";
      attempt: EmailDeliveryAttempt;
    }
  | {
      outcome: "error";
      error: {
        code: EmailDeliveryAttemptErrorCode;
        message: string;
      };
    };

export type EmailDeliveryAttemptSnapshotResult =
  | {
      outcome: "updated";
      attempt: EmailDeliveryAttempt;
    }
  | {
      outcome: "error";
      error: {
        code: EmailDeliveryAttemptErrorCode;
        message: string;
      };
    };

export type BuildEmailDeliveryIdempotencyKeyInput = {
  organizationId: string;
  messageType: string;
  contactId: string;
  reservationId?: NullableId;
  litterId?: NullableId;
  litterGroupId?: NullableId;
  operationVersion: string;
};

function errorResult(
  code: EmailDeliveryAttemptErrorCode,
  message: string,
): Extract<EmailDeliveryAttemptResult, { outcome: "error" }> {
  return { outcome: "error", error: { code, message } };
}

function transitionErrorResult(
  code: EmailDeliveryAttemptErrorCode,
  message: string,
): Extract<EmailDeliveryAttemptTransitionResult, { outcome: "error" }> {
  return { outcome: "error", error: { code, message } };
}

function snapshotErrorResult(
  code: EmailDeliveryAttemptErrorCode,
  message: string,
): Extract<EmailDeliveryAttemptSnapshotResult, { outcome: "error" }> {
  return { outcome: "error", error: { code, message } };
}

function claimErrorResult(
  code: EmailDeliveryAttemptErrorCode,
  message: string,
): Extract<ClaimEmailDeliveryAttemptForSendResult, { outcome: "error" }> {
  return { outcome: "error", error: { code, message } };
}

function normalizeRequiredText(value: string, maxLength = 255) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue.slice(0, maxLength) : null;
}

function normalizeOptionalText(value: string | null | undefined, maxLength = 255) {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeRequiredText(value, maxLength);
}

function normalizeOptionalId(value: NullableId) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEmail(value: string) {
  const email = normalizeRequiredText(value, 320)?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
}

function normalizeVariablesSnapshot(value: unknown): JsonObject | null {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    const parsed = JSON.parse(serialized) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as JsonObject;
  } catch {
    return null;
  }
}

function normalizeExternalMessageId(value: string) {
  const messageId = normalizeRequiredText(value, 255);
  return messageId;
}

function normalizePositiveInteger(value: number | null | undefined) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return value;
  }

  return null;
}

function normalizeLastErrorCode(value: string) {
  const normalized = normalizeRequiredText(value, 120)
    ?.toLowerCase()
    .replaceAll(/\s+/g, "_");

  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9_.:-]+$/.test(normalized)) {
    return "provider_error";
  }

  if (
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("<html")
  ) {
    return "provider_error";
  }

  return normalized;
}

async function ensureRecordExists(
  supabase: Supabase,
  table: "contacts" | "litters" | "litter_groups" | "email_templates",
  organizationId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function readReservationForAttempt(
  supabase: Supabase,
  organizationId: string,
  reservationId: string,
) {
  const { data, error } = await supabase
    .from("reservations")
    .select("id, contact_id")
    .eq("organization_id", organizationId)
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function readAttemptByIdempotencyKey(
  supabase: Supabase,
  organizationId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("idempotency_key", idempotencyKey)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

export function buildEmailDeliveryIdempotencyKey({
  organizationId,
  messageType,
  contactId,
  reservationId,
  litterId,
  litterGroupId,
  operationVersion,
}: BuildEmailDeliveryIdempotencyKeyInput) {
  const normalizedMessageType = normalizeRequiredText(messageType, 80);
  const normalizedVersion = normalizeRequiredText(operationVersion, 80);

  if (!normalizedMessageType || !normalizedVersion) {
    return null;
  }

  const logicalParts = [
    ["organization", organizationId],
    ["message_type", normalizedMessageType],
    ["contact", contactId],
    ["reservation", normalizeOptionalId(reservationId) ?? "none"],
    ["litter", normalizeOptionalId(litterId) ?? "none"],
    ["litter_group", normalizeOptionalId(litterGroupId) ?? "none"],
    ["version", normalizedVersion],
  ];

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(logicalParts))
    .digest("hex")
    .slice(0, 40);
  const prefix = normalizedMessageType
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return `${prefix || "email"}:${fingerprint}`;
}

export async function prepareEmailDeliveryAttempt(
  input: PrepareEmailDeliveryAttemptInput,
  supabaseClient: Supabase,
): Promise<EmailDeliveryAttemptResult> {
  const supabase = supabaseClient;
  const organizationId = normalizeRequiredText(input.organizationId, 64);
  const contactId = normalizeRequiredText(input.contactId, 64);
  const reservationId = normalizeOptionalId(input.reservationId);
  const litterId = normalizeOptionalId(input.litterId);
  const litterGroupId = normalizeOptionalId(input.litterGroupId);
  const emailTemplateId = normalizeOptionalId(input.emailTemplateId);
  const messageType = normalizeRequiredText(input.messageType, 120);
  const recipientEmail = normalizeEmail(input.recipientEmail);
  const recipientName = normalizeOptionalText(input.recipientName);
  const subjectSnapshot = normalizeOptionalText(input.subjectSnapshot, 500);
  const idempotencyKey = normalizeRequiredText(input.idempotencyKey, 255);
  const userId = normalizeRequiredText(input.userId, 64);
  const variablesSnapshot = normalizeVariablesSnapshot(input.variablesSnapshot);

  if (
    !organizationId ||
    !contactId ||
    !messageType ||
    !recipientEmail ||
    !idempotencyKey ||
    !userId ||
    !variablesSnapshot
  ) {
    return errorResult("invalid_input", "Invalid email delivery attempt input.");
  }

  const contact = await ensureRecordExists(
    supabase,
    "contacts",
    organizationId,
    contactId,
  );
  if (!contact) {
    return errorResult("linked_record_not_found", "Contact not found.");
  }

  if (reservationId) {
    const reservation = await readReservationForAttempt(
      supabase,
      organizationId,
      reservationId,
    );
    if (!reservation) {
      return errorResult("linked_record_not_found", "Reservation not found.");
    }
    if (reservation.contact_id !== contactId) {
      return errorResult(
        "linked_record_mismatch",
        "Reservation does not belong to the selected contact.",
      );
    }
  }

  for (const [table, linkedId] of [
    ["litters", litterId],
    ["litter_groups", litterGroupId],
    ["email_templates", emailTemplateId],
  ] as const) {
    if (!linkedId) {
      continue;
    }

    const linkedRecord = await ensureRecordExists(
      supabase,
      table,
      organizationId,
      linkedId,
    );
    if (!linkedRecord) {
      return errorResult("linked_record_not_found", `${table} record not found.`);
    }
  }

  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      reservation_id: reservationId,
      litter_id: litterId,
      litter_group_id: litterGroupId,
      email_template_id: emailTemplateId,
      message_type: messageType,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject_snapshot: subjectSnapshot,
      variables_snapshot: variablesSnapshot,
      idempotency_key: idempotencyKey,
      status: "pending",
      attempt_count: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (!error && data) {
    return { outcome: "created", attempt: data };
  }

  if (isUniqueViolation(error)) {
    const existingAttempt = await readAttemptByIdempotencyKey(
      supabase,
      organizationId,
      idempotencyKey,
    );

    if (existingAttempt) {
      return { outcome: "existing", attempt: existingAttempt };
    }
  }

  return errorResult("database_error", "Unable to prepare email delivery attempt.");
}

async function readAttemptForTransition(
  supabase: Supabase,
  organizationId: string,
  attemptId: string,
) {
  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", attemptId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function markEmailDeliveryAttemptSent(
  input: {
    organizationId: string;
    attemptId: string;
    brevoMessageId: string;
    userId: string;
    sentAt?: string;
  },
  supabaseClient: Supabase,
): Promise<EmailDeliveryAttemptTransitionResult> {
  const supabase = supabaseClient;
  const organizationId = normalizeRequiredText(input.organizationId, 64);
  const attemptId = normalizeRequiredText(input.attemptId, 64);
  const brevoMessageId = normalizeExternalMessageId(input.brevoMessageId);
  const userId = normalizeRequiredText(input.userId, 64);

  if (!organizationId || !attemptId || !brevoMessageId || !userId) {
    return transitionErrorResult("invalid_input", "Invalid sent transition input.");
  }

  const sentAt = input.sentAt ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .update({
      status: "sent",
      brevo_message_id: brevoMessageId,
      sent_at: sentAt,
      failed_at: null,
      last_error_code: null,
      updated_by: userId,
    })
    .eq("organization_id", organizationId)
    .eq("id", attemptId)
    .is("deleted_at", null)
    .eq("status", "sending")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return transitionErrorResult(
      error ? "database_error" : "not_found",
      "Unable to mark sending attempt sent.",
    );
  }

  return { outcome: "updated", attempt: data };
}

export async function markEmailDeliveryAttemptFailed(
  input: {
    organizationId: string;
    attemptId: string;
    lastErrorCode: string;
    userId: string;
    failedAt?: string;
  },
  supabaseClient: Supabase,
): Promise<EmailDeliveryAttemptTransitionResult> {
  const supabase = supabaseClient;
  const organizationId = normalizeRequiredText(input.organizationId, 64);
  const attemptId = normalizeRequiredText(input.attemptId, 64);
  const lastErrorCode = normalizeLastErrorCode(input.lastErrorCode);
  const userId = normalizeRequiredText(input.userId, 64);

  if (!organizationId || !attemptId || !lastErrorCode || !userId) {
    return transitionErrorResult("invalid_input", "Invalid failed transition input.");
  }

  const failedAt = input.failedAt ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .update({
      status: "failed",
      failed_at: failedAt,
      last_error_code: lastErrorCode,
      updated_by: userId,
    })
    .eq("organization_id", organizationId)
    .eq("id", attemptId)
    .is("deleted_at", null)
    .eq("status", "sending")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return transitionErrorResult(
      error ? "database_error" : "not_found",
      "Unable to mark sending attempt failed.",
    );
  }

  return { outcome: "updated", attempt: data };
}

export async function claimEmailDeliveryAttemptForSend(
  input: {
    organizationId: string;
    attemptId: string;
    userId: string;
    claimedAt?: string;
  },
  supabaseClient: Supabase,
): Promise<ClaimEmailDeliveryAttemptForSendResult> {
  const supabase = supabaseClient;
  const organizationId = normalizeRequiredText(input.organizationId, 64);
  const attemptId = normalizeRequiredText(input.attemptId, 64);
  const userId = normalizeRequiredText(input.userId, 64);

  if (!organizationId || !attemptId || !userId) {
    return claimErrorResult("invalid_input", "Invalid claim input.");
  }

  const currentAttempt = await readAttemptForTransition(
    supabase,
    organizationId,
    attemptId,
  );

  if (!currentAttempt) {
    return { outcome: "not_found" };
  }

  if (currentAttempt.status === "sent") {
    return { outcome: "already_sent", attempt: currentAttempt };
  }

  if (currentAttempt.status === "sending") {
    return { outcome: "in_progress", attempt: currentAttempt };
  }

  if (currentAttempt.status !== "pending" && currentAttempt.status !== "failed") {
    return { outcome: "not_found", attempt: currentAttempt };
  }

  const claimedAt = input.claimedAt ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .update({
      status: "sending",
      attempt_count: currentAttempt.attempt_count + 1,
      last_attempt_at: claimedAt,
      updated_by: userId,
    })
    .eq("organization_id", organizationId)
    .eq("id", attemptId)
    .is("deleted_at", null)
    .eq("status", currentAttempt.status)
    .eq("attempt_count", currentAttempt.attempt_count)
    .select("*")
    .maybeSingle();

  if (error) {
    return claimErrorResult("database_error", "Unable to claim attempt.");
  }

  if (data) {
    return { outcome: "claimed", attempt: data };
  }

  const refreshedAttempt = await readAttemptForTransition(
    supabase,
    organizationId,
    attemptId,
  );

  if (!refreshedAttempt) {
    return { outcome: "not_found" };
  }

  if (refreshedAttempt.status === "sent") {
    return { outcome: "already_sent", attempt: refreshedAttempt };
  }

  if (refreshedAttempt.status === "sending") {
    return { outcome: "in_progress", attempt: refreshedAttempt };
  }

  return { outcome: "not_found", attempt: refreshedAttempt };
}

export async function snapshotEmailDeliveryAttemptBrevoTemplate(
  input: {
    organizationId: string;
    attemptId: string;
    emailTemplateId: string;
    recipientEmail: string;
    recipientName?: string | null;
    variablesSnapshot: unknown;
    brevoTemplateId: number;
    subjectSnapshot: string;
    brevoTemplateModifiedAt?: string | null;
    userId: string;
  },
  supabaseClient: Supabase,
): Promise<EmailDeliveryAttemptSnapshotResult> {
  const supabase = supabaseClient;
  const organizationId = normalizeRequiredText(input.organizationId, 64);
  const attemptId = normalizeRequiredText(input.attemptId, 64);
  const emailTemplateId = normalizeOptionalId(input.emailTemplateId);
  const recipientEmail = normalizeEmail(input.recipientEmail);
  const recipientName = normalizeOptionalText(input.recipientName);
  const variablesSnapshot = normalizeVariablesSnapshot(input.variablesSnapshot);
  const brevoTemplateId = normalizePositiveInteger(input.brevoTemplateId);
  const subjectSnapshot = normalizeOptionalText(input.subjectSnapshot, 500);
  const userId = normalizeRequiredText(input.userId, 64);

  if (
    !organizationId ||
    !attemptId ||
    !emailTemplateId ||
    !recipientEmail ||
    !variablesSnapshot ||
    !brevoTemplateId ||
    !subjectSnapshot ||
    !userId
  ) {
    return snapshotErrorResult("invalid_input", "Invalid template snapshot input.");
  }

  const { data, error } = await supabase
    .from("email_delivery_attempts")
    .update({
      email_template_id: emailTemplateId,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      variables_snapshot: variablesSnapshot,
      brevo_template_id: brevoTemplateId,
      brevo_template_modified_at: input.brevoTemplateModifiedAt ?? null,
      subject_snapshot: subjectSnapshot,
      updated_by: userId,
    })
    .eq("organization_id", organizationId)
    .eq("id", attemptId)
    .is("deleted_at", null)
    .eq("status", "sending")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return snapshotErrorResult(
      "database_error",
      "Unable to snapshot Brevo template.",
    );
  }

  return { outcome: "updated", attempt: data };
}
