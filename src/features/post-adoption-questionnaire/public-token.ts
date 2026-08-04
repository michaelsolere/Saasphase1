import { createHash, randomBytes } from "node:crypto";

export const POST_ADOPTION_QUESTIONNAIRE_TOKEN_BYTE_LENGTH = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function generatePostAdoptionQuestionnaireToken() {
  return randomBytes(POST_ADOPTION_QUESTIONNAIRE_TOKEN_BYTE_LENGTH).toString(
    "base64url",
  );
}

export function isPostAdoptionQuestionnaireTokenFormat(token: string) {
  if (!BASE64URL.test(token) || token.length !== 43) return false;
  try {
    return (
      Buffer.from(token, "base64url").byteLength ===
      POST_ADOPTION_QUESTIONNAIRE_TOKEN_BYTE_LENGTH
    );
  } catch {
    return false;
  }
}

export function hashPostAdoptionQuestionnaireToken(token: string) {
  if (!isPostAdoptionQuestionnaireTokenFormat(token)) {
    throw new Error("Invalid post-adoption questionnaire token.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildPostAdoptionQuestionnairePath(token: string) {
  if (!isPostAdoptionQuestionnaireTokenFormat(token)) {
    throw new Error("Invalid post-adoption questionnaire token.");
  }
  return `/suivi/${token}`;
}
