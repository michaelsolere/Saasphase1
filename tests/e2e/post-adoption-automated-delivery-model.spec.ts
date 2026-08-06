import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  addCalendarMonths,
  addExactDays,
  evaluateAutomaticQuestionnaireEligibility,
} from "../../src/features/post-adoption-questionnaire/automated-delivery-model";
import {
  decryptPostAdoptionQuestionnaireToken,
  encryptPostAdoptionQuestionnaireToken,
  getPostAdoptionEncryptionConfig,
} from "../../src/features/post-adoption-questionnaire/token-encryption";
import { generatePostAdoptionQuestionnaireToken } from "../../src/features/post-adoption-questionnaire/public-token";

test("programme T1 exactement 60 jours après la date d’adoption", () => {
  expect(addExactDays("2026-01-31", 60)).toBe("2026-04-01");
  expect(addExactDays("2028-01-31", 60)).toBe("2028-03-31");
});

test("calcule les anniversaires mensuels en bornant la fin du mois", () => {
  expect(addCalendarMonths("2026-01-31", 5)).toBe("2026-06-30");
  expect(addCalendarMonths("2026-01-31", 15)).toBe("2027-04-30");
});

test("autorise automatiquement T1 le jour des cinq mois mais pas après", () => {
  expect(
    evaluateAutomaticQuestionnaireEligibility({
      milestone: "t1",
      adoptionDate: "2026-01-01",
      birthDate: "2025-10-02",
      today: "2026-03-02",
    }),
  ).toEqual({ outcome: "eligible", dueDate: "2026-03-02" });

  expect(
    evaluateAutomaticQuestionnaireEligibility({
      milestone: "t1",
      adoptionDate: "2026-01-02",
      birthDate: "2025-10-02",
      today: "2026-03-03",
    }),
  ).toEqual({
    outcome: "suspended",
    dueDate: "2026-03-03",
    reason: "t1_age_limit_exceeded",
  });
});

test("suspend T2 si ses quinze mois précèdent l’adoption", () => {
  expect(
    evaluateAutomaticQuestionnaireEligibility({
      milestone: "t2",
      adoptionDate: "2026-08-05",
      birthDate: "2025-04-01",
      today: "2026-08-05",
    }),
  ).toEqual({
    outcome: "suspended",
    dueDate: "2026-07-01",
    reason: "t2_due_before_adoption",
  });
});

test("rattrape T2 pendant trente jours puis le suspend", () => {
  expect(
    evaluateAutomaticQuestionnaireEligibility({
      milestone: "t2",
      adoptionDate: "2025-09-01",
      birthDate: "2025-01-15",
      today: "2026-05-14",
    }),
  ).toEqual({ outcome: "eligible", dueDate: "2026-04-15" });

  expect(
    evaluateAutomaticQuestionnaireEligibility({
      milestone: "t2",
      adoptionDate: "2025-09-01",
      birthDate: "2025-01-15",
      today: "2026-05-16",
    }),
  ).toEqual({
    outcome: "suspended",
    dueDate: "2026-04-15",
    reason: "t2_automatic_catchup_expired",
  });
});

test("suspend le calcul quand une date indispensable manque", () => {
  expect(
    evaluateAutomaticQuestionnaireEligibility({
      milestone: "t1",
      adoptionDate: "2026-01-01",
      birthDate: null,
      today: "2026-03-02",
    }),
  ).toEqual({ outcome: "suspended", dueDate: null, reason: "birth_date_missing" });
});

test("chiffre le jeton public avec authentification et permet sa relecture", () => {
  const token = generatePostAdoptionQuestionnaireToken();
  const key = randomBytes(32);
  const encrypted = encryptPostAdoptionQuestionnaireToken(token, key, "v1");

  expect(encrypted.keyVersion).toBe("v1");
  expect(encrypted.ciphertext).not.toContain(token);
  expect(decryptPostAdoptionQuestionnaireToken(encrypted, key)).toBe(token);
});

test("refuse de déchiffrer un jeton avec une autre clé", () => {
  const encrypted = encryptPostAdoptionQuestionnaireToken(
    generatePostAdoptionQuestionnaireToken(),
    randomBytes(32),
    "v1",
  );

  expect(() =>
    decryptPostAdoptionQuestionnaireToken(encrypted, randomBytes(32)),
  ).toThrow();
});

test("valide la clé courante et conserve les anciennes versions pendant la rotation", () => {
  const current = randomBytes(32).toString("base64url");
  const previous = randomBytes(32).toString("base64url");
  const configuration = getPostAdoptionEncryptionConfig({
    POST_ADOPTION_TOKEN_ENCRYPTION_KEY: current,
    POST_ADOPTION_TOKEN_ENCRYPTION_KEY_VERSION: "v2",
    POST_ADOPTION_TOKEN_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({ v1: previous }),
  });

  expect(configuration.currentVersion).toBe("v2");
  expect(configuration.keysByVersion.get("v1")?.byteLength).toBe(32);
  expect(configuration.keysByVersion.get("v2")?.byteLength).toBe(32);
});

test("refuse une configuration de chiffrement mal formée avant activation", () => {
  expect(() => getPostAdoptionEncryptionConfig({
    POST_ADOPTION_TOKEN_ENCRYPTION_KEY: "trop-court",
    POST_ADOPTION_TOKEN_ENCRYPTION_KEY_VERSION: "v1",
  })).toThrow("canonical base64url");
});
