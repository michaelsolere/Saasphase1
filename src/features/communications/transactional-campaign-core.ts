import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  claimEmailDeliveryAttemptForSend,
  markEmailDeliveryAttemptFailed,
  markEmailDeliveryAttemptSent,
  prepareEmailDeliveryAttempt,
  snapshotEmailDeliveryAttemptBrevoTemplate,
  type EmailDeliveryAttemptTransitionResult,
} from "@/features/communications/email-delivery-attempts-core";
import {
  attachmentSnapshotsEqual,
  normalizeTransactionalEmailAttachmentSnapshotJson,
  validateTransactionalEmailAttachments,
  type TransactionalEmailAttachment,
} from "@/features/communications/transactional-email-attachments";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type TransactionalProviderErrorReason =
  | "not_configured"
  | "unauthorized"
  | "timeout"
  | "invalid_request"
  | "template_not_found"
  | "template_inactive"
  | "rate_limited"
  | "provider_unavailable"
  | "api_error";

export type TransactionalEmailIdentity = { email: string; name?: string };

export type TransactionalEmailTransport = {
  isConfigured: () => boolean;
  getTemplate: (templateId: number) => Promise<
    | {
        ok: true;
        template: {
          id: number;
          name: string;
          subject: string;
          isActive: boolean;
          modifiedAt: string | null;
          sender: TransactionalEmailIdentity | null;
          replyTo: TransactionalEmailIdentity | null;
        };
      }
    | { ok: false; reason: TransactionalProviderErrorReason }
  >;
  sendEmail: (input: {
    templateId: number;
    to: TransactionalEmailIdentity;
    params: Record<string, string>;
    idempotencyKey: string;
    tags?: string[];
    attachments?: Array<{ name: string; content: string }>;
  }) => Promise<
    | { ok: true; messageId: string }
    | { ok: false; reason: TransactionalProviderErrorReason }
  >;
};

type PreparedOperation = {
  dossierId: string;
  contactId: string;
  applicationId?: string | null;
  reservationId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  litterId?: string | null;
  litterGroupId?: string | null;
  variables: Record<string, string>;
  variablesSnapshot?: Record<string, unknown>;
};

export type ClaimedOperation = {
  operation?: PreparedOperation;
  attachments?: TransactionalEmailAttachment[];
  resourceAction?: "created" | "reactivated" | "reused";
  metadata?: Record<string, boolean | string | number | null>;
  preSendErrorCode?: string;
  compensate?: () => Promise<{ ok: true } | { ok: false; errorCode: string }>;
};

export type TransactionalCampaignResult = {
  outcome: "success" | "already_sent" | "in_progress" | "uncertain" | "failed";
  attemptId?: string;
  errorCode?: string;
  resourceAction?: ClaimedOperation["resourceAction"];
  compensated?: boolean;
  metadata?: ClaimedOperation["metadata"];
};

type TransitionDependencies = {
  markSent?: typeof markEmailDeliveryAttemptSent;
};

function normalizeBrevoModifiedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function buildOperationKey(input: {
  organizationId: string;
  campaignKey: string;
  dossierId: string;
  operationVersion: string;
}) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        ["organization", input.organizationId],
        ["campaign", input.campaignKey],
        ["dossier", input.dossierId],
        ["version", input.operationVersion],
      ]),
    )
    .digest("hex")
    .slice(0, 40);

  return `${input.campaignKey}:${fingerprint}`;
}

function isUncertainProviderReason(reason: TransactionalProviderErrorReason) {
  return (
    reason === "timeout" ||
    reason === "rate_limited" ||
    reason === "provider_unavailable" ||
    reason === "api_error"
  );
}

async function readWritableContext(supabase: Supabase) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", authData.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", ["owner", "admin", "member"])
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { userId: authData.user.id, organizationId: data.organization_id };
}

async function readCampaignTemplate(
  supabase: Supabase,
  organizationId: string,
  campaignKey: string,
) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, brevo_template_id")
    .eq("organization_id", organizationId)
    .eq("template_key", campaignKey)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data?.brevo_template_id) return null;
  return { id: data.id, brevoTemplateId: data.brevo_template_id };
}

async function recordCertainFailure(input: {
  supabase: Supabase;
  organizationId: string;
  attemptId: string;
  userId: string;
  errorCode: string;
}) {
  return markEmailDeliveryAttemptFailed(
    {
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      lastErrorCode: input.errorCode,
      userId: input.userId,
    },
    input.supabase,
  );
}

export async function runTransactionalCampaignDelivery(
  input: {
    campaignKey: string;
    operationVersion: string;
    // Compatibility path for existing attachment-free campaigns with business mutations.
    prepareClaimedOperationAfterTemplate?: boolean;
    transport?: TransactionalEmailTransport;
    prepareOperation: (context: {
      supabase: Supabase;
      organizationId: string;
      userId: string;
    }) => Promise<
      | { ok: true; operation: PreparedOperation }
      | { ok: false; errorCode: string }
    >;
    prepareClaimedOperation?: (context: {
      supabase: Supabase;
      organizationId: string;
      userId: string;
      attemptId: string;
      attempt: Database["public"]["Tables"]["email_delivery_attempts"]["Row"];
      operation: PreparedOperation;
    }) => Promise<
      | { ok: true; claimed: ClaimedOperation }
      | { ok: false; errorCode: string }
    >;
  },
  options: {
    supabase: Supabase;
    transitions?: TransitionDependencies;
  },
): Promise<TransactionalCampaignResult> {
  const context = await readWritableContext(options.supabase);
  if (!context) return { outcome: "failed", errorCode: "not_eligible" };

  const prepared = await input.prepareOperation({
    supabase: options.supabase,
    ...context,
  });
  if (!prepared.ok) return { outcome: "failed", errorCode: prepared.errorCode };

  const template = await readCampaignTemplate(
    options.supabase,
    context.organizationId,
    input.campaignKey,
  );
  if (!template) return { outcome: "failed", errorCode: "missing_template" };
  if (!input.transport?.isConfigured()) {
    return { outcome: "failed", errorCode: "brevo_not_configured" };
  }

  const operation = prepared.operation;
  const idempotencyKey = buildOperationKey({
    organizationId: context.organizationId,
    campaignKey: input.campaignKey,
    dossierId: operation.dossierId,
    operationVersion: input.operationVersion,
  });
  const variablesSnapshot =
    operation.variablesSnapshot ?? operation.variables;

  const attempt = await prepareEmailDeliveryAttempt(
    {
      organizationId: context.organizationId,
      contactId: operation.contactId,
      reservationId: operation.reservationId,
      litterId: operation.litterId,
      litterGroupId: operation.litterGroupId,
      emailTemplateId: template.id,
      messageType: input.campaignKey,
      recipientEmail: operation.recipientEmail,
      recipientName: operation.recipientName,
      variablesSnapshot,
      idempotencyKey,
      userId: context.userId,
    },
    options.supabase,
  );
  if (attempt.outcome === "error") {
    return { outcome: "failed", errorCode: attempt.error.code };
  }
  if (attempt.attempt.status === "sent") {
    return { outcome: "already_sent", attemptId: attempt.attempt.id };
  }

  const claim = await claimEmailDeliveryAttemptForSend(
    {
      organizationId: context.organizationId,
      attemptId: attempt.attempt.id,
      userId: context.userId,
    },
    options.supabase,
  );
  if (claim.outcome === "already_sent") {
    return { outcome: "already_sent", attemptId: claim.attempt?.id };
  }
  if (claim.outcome === "in_progress") {
    return { outcome: "in_progress", attemptId: claim.attempt?.id };
  }
  if (claim.outcome !== "claimed") {
    return {
      outcome: "failed",
      attemptId: attempt.attempt.id,
      errorCode: claim.outcome === "error" ? claim.error.code : claim.outcome,
    };
  }

  let finalOperation = operation;
  let claimedResource: ClaimedOperation = {};
  let providerTemplate;
  if (input.prepareClaimedOperationAfterTemplate) {
    try {
      const result = await input.transport.getTemplate(template.brevoTemplateId);
      if (!result.ok) {
        const transition = await recordCertainFailure({
          supabase: options.supabase,
          ...context,
          attemptId: claim.attempt.id,
          errorCode: result.reason,
        });
        return transition.outcome === "updated"
          ? {
              outcome: "failed",
              attemptId: claim.attempt.id,
              errorCode: result.reason,
            }
          : {
              outcome: "uncertain",
              attemptId: claim.attempt.id,
              errorCode: transition.error.code,
            };
      }
      providerTemplate = result.template;
    } catch {
      const transition = await recordCertainFailure({
        supabase: options.supabase,
        ...context,
        attemptId: claim.attempt.id,
        errorCode: "provider_exception",
      });
      return transition.outcome === "updated"
        ? {
            outcome: "failed",
            attemptId: claim.attempt.id,
            errorCode: "provider_exception",
          }
        : {
            outcome: "uncertain",
            attemptId: claim.attempt.id,
            errorCode: transition.error.code,
          };
    }
  }
  if (input.prepareClaimedOperation) {
    let claimedPreparation;
    try {
      claimedPreparation = await input.prepareClaimedOperation({
        supabase: options.supabase,
        ...context,
        attemptId: claim.attempt.id,
        attempt: claim.attempt,
        operation,
      });
    } catch {
      return {
        outcome: "uncertain",
        attemptId: claim.attempt.id,
        errorCode: "claimed_operation_exception",
      };
    }
    if (!claimedPreparation.ok) {
      const transition = await recordCertainFailure({
        supabase: options.supabase,
        ...context,
        attemptId: claim.attempt.id,
        errorCode: claimedPreparation.errorCode,
      });
      return transition.outcome === "updated"
        ? { outcome: "failed", attemptId: claim.attempt.id, errorCode: claimedPreparation.errorCode }
        : { outcome: "uncertain", attemptId: claim.attempt.id, errorCode: transition.error.code };
    }
    claimedResource = claimedPreparation.claimed;
    finalOperation = claimedResource.operation ?? operation;
  }

  const failCertainly = async (errorCode: string): Promise<TransactionalCampaignResult> => {
    let compensated = false;
    if (claimedResource.compensate) {
      let compensation;
      try {
        compensation = await claimedResource.compensate();
      } catch {
        return {
          outcome: "uncertain",
          attemptId: claim.attempt.id,
          errorCode: "compensation_exception",
          resourceAction: claimedResource.resourceAction,
          metadata: claimedResource.metadata,
        };
      }
      if (!compensation.ok) {
        return {
          outcome: "uncertain",
          attemptId: claim.attempt.id,
          errorCode: compensation.errorCode,
          resourceAction: claimedResource.resourceAction,
          metadata: claimedResource.metadata,
        };
      }
      compensated = true;
    }
    const transition = await recordCertainFailure({
      supabase: options.supabase,
      ...context,
      attemptId: claim.attempt.id,
      errorCode,
    });
    return transition.outcome === "updated"
      ? { outcome: "failed", attemptId: claim.attempt.id, errorCode, resourceAction: claimedResource.resourceAction, compensated, metadata: claimedResource.metadata }
      : { outcome: "uncertain", attemptId: claim.attempt.id, errorCode: transition.error.code, resourceAction: claimedResource.resourceAction, compensated, metadata: claimedResource.metadata };
  };

  if (claimedResource.preSendErrorCode) {
    return failCertainly(claimedResource.preSendErrorCode);
  }

  const validatedAttachments = validateTransactionalEmailAttachments(
    claimedResource.attachments,
  );
  if (!validatedAttachments.ok) {
    return failCertainly(validatedAttachments.errorCode);
  }
  if (
    input.prepareClaimedOperationAfterTemplate &&
    validatedAttachments.attachments.length > 0
  ) {
    return failCertainly("attachments_require_pre_provider_preparation");
  }

  const storedAttachmentsSnapshot =
    normalizeTransactionalEmailAttachmentSnapshotJson(
      claim.attempt.attachments_snapshot,
    );
  if (!storedAttachmentsSnapshot) {
    return failCertainly("database_error");
  }
  const preparedAttachmentsSnapshot = validatedAttachments.attachments.map(
    (attachment) => attachment.snapshot,
  );
  if (
    storedAttachmentsSnapshot.length > 0 &&
    !attachmentSnapshotsEqual(
      storedAttachmentsSnapshot,
      preparedAttachmentsSnapshot,
    )
  ) {
    return failCertainly("attachment_snapshot_mismatch");
  }

  if (!providerTemplate) {
    try {
      const result = await input.transport.getTemplate(template.brevoTemplateId);
      if (!result.ok) return failCertainly(result.reason);
      providerTemplate = result.template;
    } catch {
      return failCertainly("provider_exception");
    }
  }

  const finalVariablesSnapshot =
    finalOperation.variablesSnapshot ?? finalOperation.variables;

  const snapshot = await snapshotEmailDeliveryAttemptBrevoTemplate(
    {
      organizationId: context.organizationId,
      attemptId: claim.attempt.id,
      emailTemplateId: template.id,
      recipientEmail: finalOperation.recipientEmail,
      recipientName: finalOperation.recipientName,
      variablesSnapshot: finalVariablesSnapshot,
      brevoTemplateId: providerTemplate.id,
      brevoTemplateModifiedAt: normalizeBrevoModifiedAt(providerTemplate.modifiedAt),
      subjectSnapshot: providerTemplate.subject,
      reservationId: finalOperation.reservationId,
      applicationId: finalOperation.applicationId,
      attachmentsSnapshot: preparedAttachmentsSnapshot,
      userId: context.userId,
    },
    options.supabase,
  );
  if (snapshot.outcome === "error") {
    return failCertainly(snapshot.error.code);
  }

  let sendResult;
  try {
    sendResult = await input.transport.sendEmail({
      templateId: providerTemplate.id,
      to: {
        email: finalOperation.recipientEmail,
        ...(finalOperation.recipientName ? { name: finalOperation.recipientName } : {}),
      },
      params: finalOperation.variables,
      idempotencyKey,
      tags: ["saas_elevage", input.campaignKey],
      ...(validatedAttachments.attachments.length > 0
        ? {
            attachments: validatedAttachments.attachments.map(
              ({ name, content }) => ({ name, content }),
            ),
          }
        : {}),
    });
  } catch {
    return { outcome: "uncertain", attemptId: claim.attempt.id, errorCode: "provider_exception", resourceAction: claimedResource.resourceAction, metadata: claimedResource.metadata };
  }

  if (!sendResult.ok) {
    if (isUncertainProviderReason(sendResult.reason)) {
      return { outcome: "uncertain", attemptId: claim.attempt.id, errorCode: sendResult.reason, resourceAction: claimedResource.resourceAction, metadata: claimedResource.metadata };
    }
    return failCertainly(sendResult.reason);
  }

  const markSent = options.transitions?.markSent ?? markEmailDeliveryAttemptSent;
  const sent: EmailDeliveryAttemptTransitionResult = await markSent(
    {
      organizationId: context.organizationId,
      attemptId: claim.attempt.id,
      brevoMessageId: sendResult.messageId,
      userId: context.userId,
    },
    options.supabase,
  );
  if (sent.outcome === "error") {
    return { outcome: "uncertain", attemptId: claim.attempt.id, errorCode: sent.error.code, resourceAction: claimedResource.resourceAction, metadata: claimedResource.metadata };
  }
  return { outcome: "success", attemptId: sent.attempt.id, resourceAction: claimedResource.resourceAction, metadata: claimedResource.metadata };
}
