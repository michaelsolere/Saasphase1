import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { isPostAdoptionQuestionnaireTokenFormat } from "./public-token";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

type EncryptedQuestionnaireToken = {
  algorithm: typeof ALGORITHM;
  keyVersion: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type PostAdoptionEncryptionConfig = {
  currentVersion: string;
  currentKey: Buffer;
  keysByVersion: ReadonlyMap<string, Buffer>;
};

function isValidKeyVersion(value: string) {
  return /^[A-Za-z0-9._-]{1,32}$/.test(value);
}

function requireEncryptionKey(key: Buffer) {
  if (key.byteLength !== 32) {
    throw new Error("Post-adoption token encryption key must contain 32 bytes.");
  }
}

function decodeConfiguredKey(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`${label} must use canonical base64url encoding.`);
  }
  const key = Buffer.from(value, "base64url");
  if (key.byteLength !== 32) {
    throw new Error(`${label} must decode to exactly 32 bytes.`);
  }
  return key;
}

export function getPostAdoptionEncryptionConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PostAdoptionEncryptionConfig {
  const currentVersion = environment.POST_ADOPTION_TOKEN_ENCRYPTION_KEY_VERSION?.trim() || "v1";
  const currentValue = environment.POST_ADOPTION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!isValidKeyVersion(currentVersion) || !currentValue) {
    throw new Error("Post-adoption token encryption configuration is incomplete.");
  }
  const currentKey = decodeConfiguredKey(currentValue, "Current post-adoption token encryption key");
  const keys = new Map<string, Buffer>([[currentVersion, currentKey]]);
  const previousRaw = environment.POST_ADOPTION_TOKEN_ENCRYPTION_PREVIOUS_KEYS?.trim();
  if (previousRaw) {
    let previous: unknown;
    try {
      previous = JSON.parse(previousRaw);
    } catch {
      throw new Error("Previous post-adoption token encryption keys must be valid JSON.");
    }
    if (!previous || Array.isArray(previous) || typeof previous !== "object") {
      throw new Error("Previous post-adoption token encryption keys must be a JSON object.");
    }
    for (const [version, value] of Object.entries(previous)) {
      if (!isValidKeyVersion(version) || typeof value !== "string" || version === currentVersion) {
        throw new Error("Previous post-adoption token encryption key entry is invalid.");
      }
      keys.set(version, decodeConfiguredKey(value, `Post-adoption token encryption key ${version}`));
    }
  }
  return { currentVersion, currentKey, keysByVersion: keys };
}

export function encryptPostAdoptionQuestionnaireToken(
  token: string,
  key: Buffer,
  keyVersion: string,
): EncryptedQuestionnaireToken {
  if (!isPostAdoptionQuestionnaireTokenFormat(token)) {
    throw new Error("Invalid post-adoption questionnaire token.");
  }
  requireEncryptionKey(key);
  if (!isValidKeyVersion(keyVersion)) {
    throw new Error("Invalid post-adoption token encryption key version.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return {
    algorithm: ALGORITHM,
    keyVersion,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptPostAdoptionQuestionnaireToken(
  encrypted: EncryptedQuestionnaireToken,
  key: Buffer,
) {
  requireEncryptionKey(key);
  if (encrypted.algorithm !== ALGORITHM) {
    throw new Error("Unsupported post-adoption token encryption algorithm.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encrypted.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
  const token = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!isPostAdoptionQuestionnaireTokenFormat(token)) {
    throw new Error("Decrypted post-adoption questionnaire token is invalid.");
  }
  return token;
}
