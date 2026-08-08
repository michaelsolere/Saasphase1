export type AdopterProfileDisplayState =
  | "to_send"
  | "send_failed"
  | "awaiting_response"
  | "overdue"
  | "received_to_read"
  | "reviewed"
  | "waived";

export type AdopterProfileEvidence = {
  instanceCreatedAt: string | null;
  dueAt: string | null;
  invitationSentAt: string | null;
  invitationFailedAt: string | null;
  finalSubmittedAt: string | null;
  reviewedAt: string | null;
  waivedAt: string | null;
};

export type AdopterProfileWorkbenchSummary = AdopterProfileEvidence & {
  instanceId: string;
  initialSexPreference: string | null;
  draftUpdatedAt: string | null;
  finalAnswers: Record<string, unknown> | null;
  reviewedBy: string | null;
  waivedBy: string | null;
  waiverReason: string | null;
  proposedSexPreference: string | null;
  sexPreferenceDecision: "keep" | "update" | null;
  invitationDeliveryAttemptId: string | null;
};

export function requiresAdopterProfileSexPreferenceDecision(
  profile: Pick<AdopterProfileWorkbenchSummary, "initialSexPreference" | "proposedSexPreference">,
) {
  return Boolean(
    profile.proposedSexPreference
    && profile.proposedSexPreference !== profile.initialSexPreference,
  );
}

export const adopterProfileStateLabels: Record<AdopterProfileDisplayState, string> = {
  to_send: "Questionnaire à envoyer",
  send_failed: "Envoi en échec",
  awaiting_response: "En attente de réponse",
  overdue: "En retard",
  received_to_read: "Questionnaire reçu — à lire",
  reviewed: "Profil relu",
  waived: "Profil traité par dérogation",
};

export function deriveAdopterProfileState(
  evidence: AdopterProfileEvidence,
  now = new Date(),
): AdopterProfileDisplayState {
  if (evidence.waivedAt) return "waived";
  if (evidence.reviewedAt && evidence.finalSubmittedAt) return "reviewed";
  if (evidence.finalSubmittedAt) return "received_to_read";
  if (evidence.invitationFailedAt && !evidence.invitationSentAt) return "send_failed";
  if (!evidence.invitationSentAt) return "to_send";
  if (evidence.dueAt && new Date(evidence.dueAt).getTime() < now.getTime()) return "overdue";
  return "awaiting_response";
}

export function isAdopterProfileMilestoneComplete(
  evidence: Pick<AdopterProfileEvidence, "finalSubmittedAt" | "reviewedAt" | "waivedAt">,
) {
  return Boolean(evidence.waivedAt || (evidence.finalSubmittedAt && evidence.reviewedAt));
}
