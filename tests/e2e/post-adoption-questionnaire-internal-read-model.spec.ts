import { expect, test } from "@playwright/test";

import {
  buildInternalQuestionnaireSections,
  formatInternalQuestionnaireSectionLabel,
} from "../../src/features/post-adoption-questionnaire/internal-read-model";
import type { PublicQuestionnaireDefinition } from "../../src/features/post-adoption-questionnaire/public-model";

const definition: PublicQuestionnaireDefinition = {
  schemaVersion: 1,
  code: "post-adoption-t1",
  version: 1,
  title: "Questionnaire post-adoption T1",
  estimatedMinutes: { min: 8, max: 10 },
  sectionOrder: ["behavior", "adaptation", "future_section"],
  questions: [
    {
      key: "adaptation_comment",
      section: "adaptation",
      type: "long_text",
      label: "Comment se passe l’adaptation ?",
      required: false,
    },
    {
      key: "behavior_activity",
      section: "behavior",
      type: "single_choice",
      label: "Niveau d’activité",
      required: true,
      options: [
        { value: "calm", label: "Calme" },
        { value: "active", label: "Actif" },
      ],
    },
    {
      key: "behavior_comment",
      section: "behavior",
      type: "long_text",
      label: "Précisions comportementales",
      required: false,
    },
    {
      key: "future_answer",
      section: "future_section",
      type: "short_text",
      label: "Question future",
      required: false,
    },
  ],
};

test("la lecture interne conserve l’ordre publié et exclut les questions sans réponse", () => {
  expect(
    buildInternalQuestionnaireSections(definition, {
      adaptation_comment: "Adaptation progressive",
      behavior_activity: "active",
      future_answer: "Réponse future",
    }),
  ).toEqual([
    {
      key: "behavior",
      label: "Comportement",
      questions: [definition.questions[1]],
    },
    {
      key: "adaptation",
      label: "Adaptation",
      questions: [definition.questions[0]],
    },
    {
      key: "future_section",
      label: "Future section",
      questions: [definition.questions[3]],
    },
  ]);
});

test("les sections T1 et T2 possèdent des intitulés français lisibles", () => {
  expect(formatInternalQuestionnaireSectionLabel("cleanliness")).toBe("Propreté");
  expect(formatInternalQuestionnaireSectionLabel("health_events")).toBe(
    "Événements de santé",
  );
  expect(formatInternalQuestionnaireSectionLabel("sterilization")).toBe(
    "Stérilisation",
  );
});

test("une réponse explicitement vide reste distinguée d’une question absente", () => {
  expect(
    buildInternalQuestionnaireSections(definition, {
      adaptation_comment: "",
    }),
  ).toEqual([
    {
      key: "adaptation",
      label: "Adaptation",
      questions: [definition.questions[0]],
    },
  ]);
});
