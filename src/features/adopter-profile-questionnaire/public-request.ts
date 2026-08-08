const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 120 * 1024;

export type AdopterProfilePublicCommand = {
  mode: "draft" | "submit";
  clientCommandId: string;
  expectedRevision: number;
  answers: Record<string, unknown>;
};

export function parseAdopterProfilePublicCommand(
  input: unknown,
): { ok: true; value: AdopterProfilePublicCommand } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  const value = input as Record<string, unknown>;
  if (
    (value.mode !== "draft" && value.mode !== "submit") ||
    typeof value.clientCommandId !== "string" ||
    !UUID.test(value.clientCommandId) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    !value.answers ||
    typeof value.answers !== "object" ||
    Array.isArray(value.answers)
  ) return { ok: false };
  try {
    if (Buffer.byteLength(JSON.stringify(value.answers), "utf8") > MAX_BYTES) return { ok: false };
  } catch {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      mode: value.mode,
      clientCommandId: value.clientCommandId,
      expectedRevision: Number(value.expectedRevision),
      answers: value.answers as Record<string, unknown>,
    },
  };
}
