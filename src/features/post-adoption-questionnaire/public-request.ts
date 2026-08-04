import type { QuestionnaireAnswers } from "./public-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SUBMISSION_BYTES = 120 * 1024;

export type PublicQuestionnaireSubmission = {
  clientCommandId: string;
  baseRevisionNo: number;
  answers: QuestionnaireAnswers;
  completionStartedAt: string | null;
  completionDurationSeconds: number | null;
};

export function parsePublicQuestionnaireSubmission(
  input: unknown,
): { ok: true; value: PublicQuestionnaireSubmission } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false };
  }
  const value = input as Record<string, unknown>;
  if (
    typeof value.clientCommandId !== "string" ||
    !UUID.test(value.clientCommandId) ||
    !Number.isSafeInteger(value.baseRevisionNo) ||
    Number(value.baseRevisionNo) < 0 ||
    !value.answers ||
    typeof value.answers !== "object" ||
    Array.isArray(value.answers)
  ) {
    return { ok: false };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value.answers);
  } catch {
    return { ok: false };
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_SUBMISSION_BYTES) {
    return { ok: false };
  }

  const completionStartedAt =
    typeof value.completionStartedAt === "string"
      ? value.completionStartedAt
      : null;
  if (
    completionStartedAt !== null &&
    Number.isNaN(Date.parse(completionStartedAt))
  ) {
    return { ok: false };
  }
  const completionDurationSeconds =
    value.completionDurationSeconds === undefined ||
    value.completionDurationSeconds === null
      ? null
      : Number(value.completionDurationSeconds);
  if (
    completionDurationSeconds !== null &&
    (!Number.isSafeInteger(completionDurationSeconds) ||
      completionDurationSeconds < 0 ||
      completionDurationSeconds > 7_200)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      clientCommandId: value.clientCommandId,
      baseRevisionNo: Number(value.baseRevisionNo),
      answers: value.answers as QuestionnaireAnswers,
      completionStartedAt,
      completionDurationSeconds,
    },
  };
}
