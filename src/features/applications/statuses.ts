export const APPLICATION_TO_VALIDATE_STATUSES = [
  "new",
  "to_review",
  "to_call",
] as const;

export function isApplicationToValidateStatus(status: string | null) {
  return (
    status === "new" ||
    status === "to_review" ||
    status === "to_call"
  );
}
