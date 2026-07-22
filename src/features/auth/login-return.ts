export const defaultLoginSuccessPath = "/candidatures?connexion=success";

export function validateLoginReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "/whelping") return value;

  const match = /^\/whelping\?litter=(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;

  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? value : null;
}
