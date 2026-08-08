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
