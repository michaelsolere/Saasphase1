import { expect, test } from "@playwright/test";

import {
  buildPostAdoptionQuestionnairePath,
  generatePostAdoptionQuestionnaireToken,
  hashPostAdoptionQuestionnaireToken,
  isPostAdoptionQuestionnaireTokenFormat,
} from "../../src/features/post-adoption-questionnaire/public-token";
import {
  getPublicQuestionnaireState,
  isQuestionVisible,
  validateQuestionnaireSection,
  type PublicQuestionnaireDefinition,
} from "../../src/features/post-adoption-questionnaire/public-model";
import { parsePublicQuestionnaireSubmission } from "../../src/features/post-adoption-questionnaire/public-request";

const definition: PublicQuestionnaireDefinition = {
  schemaVersion: 1,
  code: "post-adoption-t1",
  version: 1,
  title: "Questionnaire post-adoption T1",
  estimatedMinutes: { min: 8, max: 10 },
  sectionOrder: ["adaptation", "behavior"],
  questions: [
    {
      key: "adaptation_status",
      section: "adaptation",
      type: "single_choice",
      label: "Adaptation",
      required: true,
      options: [
        { value: "well", label: "Bien" },
        { value: "difficult", label: "Difficile" },
      ],
    },
    {
      key: "adaptation_details",
      section: "adaptation",
      type: "long_text",
      label: "Précisions",
      required: false,
      visibleWhen: { question: "adaptation_status", equals: "difficult" },
      requiredWhen: { question: "adaptation_status", equals: "difficult" },
    },
    {
      key: "behavior_activity",
      section: "behavior",
      type: "single_choice",
      label: "Activité",
      required: true,
      options: [{ value: "calm", label: "Calme" }],
    },
  ],
};

test("le jeton public opaque est fort, validé et jamais exposé sous forme d’identifiant métier", () => {
  const token = generatePostAdoptionQuestionnaireToken();

  expect(isPostAdoptionQuestionnaireTokenFormat(token)).toBe(true);
  expect(token).toHaveLength(43);
  expect(hashPostAdoptionQuestionnaireToken(token)).toMatch(/^[0-9a-f]{64}$/);
  expect(buildPostAdoptionQuestionnairePath(token)).toBe(`/suivi/${token}`);
  expect(isPostAdoptionQuestionnaireTokenFormat("20000000-0000-4000-8000-000000000001")).toBe(false);
});

test("la validation progressive suit la visibilité avant l’obligation", () => {
  expect(isQuestionVisible(definition.questions[1], { adaptation_status: "well" })).toBe(false);
  expect(validateQuestionnaireSection(definition, "adaptation", { adaptation_status: "well" })).toEqual({});
  expect(
    validateQuestionnaireSection(definition, "adaptation", {
      adaptation_status: "difficult",
    }),
  ).toEqual({ adaptation_details: "Ce champ est obligatoire." });
  expect(
    validateQuestionnaireSection(definition, "adaptation", {
      adaptation_status: "difficult",
      adaptation_details: "Il lui faut davantage de temps.",
    }),
  ).toEqual({});
});

test("l’état public est dérivé des échéances serveur sans exposer les réponses", () => {
  const common = {
    accessState: "active" as const,
    instanceStatus: "submitted" as const,
    responseDeadlineAt: "2026-09-01T12:00:00.000Z",
    publicReadUntil: "2026-10-01T12:00:00.000Z",
    latestRevisionNo: 2,
    latestSubmittedAt: "2026-08-20T12:00:00.000Z",
  };

  expect(getPublicQuestionnaireState(common, new Date("2026-08-21T12:00:00.000Z"))).toBe("revisable");
  expect(getPublicQuestionnaireState(common, new Date("2026-09-02T12:00:00.000Z"))).toBe("expired");
  expect(getPublicQuestionnaireState({ ...common, accessState: "revoked" }, new Date("2026-08-21T12:00:00.000Z"))).toBe("unavailable");
  expect(getPublicQuestionnaireState({ ...common, instanceStatus: "validated" }, new Date("2026-08-21T12:00:00.000Z"))).toBe("validated");
});

test("la requête de soumission refuse les rejeux ambigus et les charges non bornées", () => {
  const valid = parsePublicQuestionnaireSubmission({
    clientCommandId: "9f350001-0000-4000-8000-000000000099",
    baseRevisionNo: 1,
    answers: { behavior_activity: "calm" },
    completionStartedAt: "2026-08-21T12:00:00.000Z",
    completionDurationSeconds: 300,
  });
  expect(valid.ok).toBe(true);
  expect(
    parsePublicQuestionnaireSubmission({
      clientCommandId: "reservation-123",
      baseRevisionNo: 1,
      answers: {},
    }),
  ).toEqual({ ok: false });
  expect(
    parsePublicQuestionnaireSubmission({
      clientCommandId: "9f350001-0000-4000-8000-000000000099",
      baseRevisionNo: 1,
      answers: { comment: "x".repeat(130_000) },
    }),
  ).toEqual({ ok: false });
});

test("la validation de section contrôle les matrices, répétitions et bornes numériques", () => {
  const complex: PublicQuestionnaireDefinition = {
    ...definition,
    sectionOrder: ["care"],
    questions: [
      {
        key: "handling",
        section: "care",
        type: "matrix_single_choice",
        label: "Manipulations",
        required: true,
        rows: [{ key: "paws" }, { key: "ears" }],
        options: [{ value: "easy", label: "Facile" }],
      },
      {
        key: "events",
        section: "care",
        type: "repeater",
        label: "Événements",
        required: true,
        fields: [
          { key: "category", type: "single_choice", required: true },
          { key: "details", type: "long_text", required: true },
        ],
      },
      {
        key: "weight",
        section: "care",
        type: "decimal",
        label: "Poids",
        required: true,
        min: 0.1,
        max: 150,
      },
    ],
  };
  expect(
    validateQuestionnaireSection(complex, "care", {
      handling: { paws: "easy" },
      events: [{ category: "illness" }],
      weight: 200,
    }),
  ).toEqual({
    handling: "Répondez à chaque ligne.",
    events: "Complétez chaque événement obligatoire.",
    weight: "La valeur saisie est hors limites.",
  });
});
