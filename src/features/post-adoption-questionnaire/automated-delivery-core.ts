import type { BrevoApiErrorReason } from "@/lib/brevo/server";

export type PostAdoptionDispatchMessageKind =
  | "initial"
  | "reminder_7"
  | "reminder_14";

export function getPostAdoptionTemplateKey(
  questionnaireCode: string,
  messageKind: PostAdoptionDispatchMessageKind,
) {
  if (messageKind === "reminder_7") return "post_adoption_reminder_7" as const;
  if (messageKind === "reminder_14") return "post_adoption_reminder_14" as const;
  if (questionnaireCode === "post-adoption-t1") return "post_adoption_t1" as const;
  if (questionnaireCode === "post-adoption-t2") return "post_adoption_t2" as const;
  throw new Error("Unsupported post-adoption questionnaire code.");
}

export function classifyPostAdoptionProviderFailure(
  reason: BrevoApiErrorReason,
): "retryable" | "uncertain" {
  return reason === "timeout" || reason === "api_error"
    ? "uncertain"
    : "retryable";
}

function formatDate(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: timezone,
  }).format(date);
}

export function buildPostAdoptionEmailVariables(input: {
  contactFirstName: string | null;
  contactName: string;
  animalName: string;
  organizationName: string;
  milestone: "t1" | "t2";
  publicUrl: string;
  responseDeadline: string;
  timezone: string;
}) {
  return {
    prenom: input.contactFirstName ?? "",
    nom_complet: input.contactName,
    animal: input.animalName,
    nom_elevage: input.organizationName,
    questionnaire: input.milestone === "t1" ? "suivi T1" : "suivi T2",
    lien_questionnaire: input.publicUrl,
    date_limite_reponse: formatDate(input.responseDeadline, input.timezone),
  };
}

export function buildPostAdoptionVariablesSnapshot(
  variables: ReturnType<typeof buildPostAdoptionEmailVariables>,
) {
  return {
    ...variables,
    lien_questionnaire: "[secret temporaire non journalisé]",
  };
}

export function selectPostAdoptionOrganization<T extends { organizationId: string }>(
  organizations: readonly T[],
  requestedOrganizationId: string | null,
) {
  if (requestedOrganizationId) {
    return organizations.find((organization) => organization.organizationId === requestedOrganizationId) ?? null;
  }
  return organizations.length === 1 ? organizations[0] : null;
}
