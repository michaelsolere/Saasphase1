export type AdopterProfileDeliveryEvidence = {
  automaticInvitationAllowed: boolean;
  invitationAttemptId: string | null;
  invitationFailedAt: string | null;
  invitationSentAt: string | null;
  reminderAttemptId: string | null;
  reminderFailedAt: string | null;
  finalSubmittedAt: string | null;
  waivedAt: string | null;
};

export function buildAdopterProfileDeliveryIdempotencyKey(
  instanceId: string,
  kind: "invitation" | "reminder",
  accessId: string,
) {
  return `adopter_profile_${kind}:${instanceId}:${accessId}:v1`;
}

const ADOPTER_PROFILE_DELIVERY_LEASE_MS = 5 * 60 * 1000;

export function isAdopterProfileDeliveryLeaseExpired(lastAttemptAt: string | null, now = new Date()) {
  if (!lastAttemptAt) return true;
  const claimedAt = Date.parse(lastAttemptAt);
  return !Number.isFinite(claimedAt) || now.getTime() - claimedAt >= ADOPTER_PROFILE_DELIVERY_LEASE_MS;
}

export function chooseAdopterProfileStaleDeliveryAction(
  attempt: { lastAttemptAt: string | null; providerCallStartedAt: string | null; attemptCount: number },
  now = new Date(),
): "wait" | "retry" | "uncertain" | "exhausted" {
  if (!isAdopterProfileDeliveryLeaseExpired(attempt.lastAttemptAt, now)) return "wait";
  if (attempt.providerCallStartedAt) return "uncertain";
  return attempt.attemptCount >= 3 ? "exhausted" : "retry";
}

export function chooseAdopterProfileDeliveryKind(
  evidence: AdopterProfileDeliveryEvidence,
  now = new Date(),
): "invitation" | "reminder" | null {
  if (evidence.finalSubmittedAt || evidence.waivedAt) return null;
  if (
    evidence.automaticInvitationAllowed
    && !evidence.invitationAttemptId
    && !evidence.invitationFailedAt
  ) return "invitation";
  if (
    evidence.invitationAttemptId
    && evidence.invitationSentAt
    && !evidence.reminderAttemptId
    && !evidence.reminderFailedAt
    && now.getTime() >= new Date(evidence.invitationSentAt).getTime() + 7 * 86_400_000
  ) return "reminder";
  return null;
}
