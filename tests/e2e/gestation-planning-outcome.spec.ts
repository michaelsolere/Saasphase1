import { expect, test } from "@playwright/test";

import {
  GESTATION_PLANNING_SETTINGS_PATH,
  matingSuccessMessage,
  type GestationPlanningOutcome,
} from "../../src/features/reproduction/gestation-planning-outcome";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const OUTCOMES: readonly GestationPlanningOutcome[] = [
  "applied",
  "already_applied",
  "not_configured",
  "default_model_unavailable",
  "variant_conflict",
  "not_applicable",
];

test("couvre les six issues avec un message non vide", () => {
  for (const outcome of OUTCOMES) {
    const result = matingSuccessMessage(outcome, "Gestation");
    expect(result.outcome).toBe(outcome);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  }
});

test("« applied » cite le titre du modèle entre guillemets français", () => {
  expect(matingSuccessMessage("applied", "Gestation").message).toContain(
    "« Gestation »",
  );
  expect(
    matingSuccessMessage("applied", "Gestation + herpèsvirose").message,
  ).toContain("« Gestation + herpèsvirose »");
});

test("« applied » retombe sur « Gestation » sans titre exploitable", () => {
  expect(matingSuccessMessage("applied", null).message).toContain(
    "« Gestation »",
  );
  expect(matingSuccessMessage("applied", undefined).message).toContain(
    "« Gestation »",
  );
  expect(matingSuccessMessage("applied", "   ").message).toContain(
    "« Gestation »",
  );
});

test("« already_applied » ne mentionne aucun titre de modèle", () => {
  const result = matingSuccessMessage("already_applied", "Gestation");
  expect(result.message).not.toContain("Gestation »");
  expect(result.message).toContain("déjà présent");
});

test("seul « not_configured » expose un lien vers les paramètres", () => {
  const result = matingSuccessMessage("not_configured");
  expect(result).toMatchObject({
    outcome: "not_configured",
    settingsPath: GESTATION_PLANNING_SETTINGS_PATH,
  });

  for (const outcome of OUTCOMES) {
    if (outcome === "not_configured") continue;
    expect(matingSuccessMessage(outcome, "Gestation")).not.toHaveProperty(
      "settingsPath",
    );
  }
});

test("« default_model_unavailable » et « variant_conflict » orientent vers une vérification manuelle", () => {
  expect(matingSuccessMessage("default_model_unavailable").message).toContain(
    "paramètres de l’organisation",
  );
  expect(matingSuccessMessage("variant_conflict").message).toContain(
    "Journal de la portée",
  );
});

test("« not_applicable » retourne un message générique", () => {
  expect(matingSuccessMessage("not_applicable", "Gestation").message).toBe(
    "La saillie a été enregistrée.",
  );
});

test("les issues autres que « applied » ignorent le titre reçu, même un UUID", () => {
  const uuidLikeTitle = "123e4567-e89b-12d3-a456-426614174000";

  for (const outcome of OUTCOMES) {
    if (outcome === "applied") continue;
    const result = matingSuccessMessage(outcome, uuidLikeTitle);
    expect(result.message).not.toContain(uuidLikeTitle);
    expect(result.message).not.toMatch(UUID_PATTERN);
  }
});

test("aucun message ni lien ne fuit un identifiant UUID avec des titres réalistes", () => {
  const realisticTitles: Array<string | null | undefined> = [
    "Gestation",
    "Gestation + herpèsvirose",
    null,
    undefined,
  ];

  for (const outcome of OUTCOMES) {
    for (const title of realisticTitles) {
      const result = matingSuccessMessage(outcome, title);
      expect(result.message).not.toMatch(UUID_PATTERN);
      if ("settingsPath" in result) {
        expect(result.settingsPath).not.toMatch(UUID_PATTERN);
      }
    }
  }
});
