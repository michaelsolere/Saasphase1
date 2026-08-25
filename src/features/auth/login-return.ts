// HOME-TODAY-01: `/` is the single daily action queue, so it is the natural
// post-login landing page (previously /candidatures?connexion=success).
export const defaultLoginSuccessPath = "/";

export function validateLoginReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "/whelping" || value === "/whelping/selection") return value;

  const match = /^\/whelping\?litter=(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;

  const index = Number(match[1]);
  return Number.isSafeInteger(index) ? value : null;
}
