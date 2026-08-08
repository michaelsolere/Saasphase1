import { createHash, createHmac, randomBytes } from "node:crypto";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TOKEN_BYTES = 32;

export function generateAdopterProfileQuestionnaireToken() {
  return randomBytes(32).toString("base64url");
}

export function deriveAdopterProfileQuestionnaireToken(
  accessId: string,
  secret: string,
) {
  if (!accessId.trim() || secret.length < 32) {
    throw new Error("adopter_profile_token_derivation_config_invalid");
  }

  return createHmac("sha256", secret)
    .update(`adopter-profile-questionnaire:${accessId}`)
    .digest("base64url");
}

export function isAdopterProfileQuestionnaireTokenFormat(token: string) {
  if (!BASE64URL.test(token) || token.length !== 43) return false;
  try {
    return Buffer.from(token, "base64url").byteLength === TOKEN_BYTES;
  } catch {
    return false;
  }
}

export function hashAdopterProfileQuestionnaireToken(token: string) {
  if (!isAdopterProfileQuestionnaireTokenFormat(token)) {
    throw new Error("Invalid adopter profile questionnaire token.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildAdopterProfileQuestionnairePath(token: string) {
  if (!isAdopterProfileQuestionnaireTokenFormat(token)) {
    throw new Error("Invalid adopter profile questionnaire token.");
  }
  return `/profil-adoptant/${token}`;
}
