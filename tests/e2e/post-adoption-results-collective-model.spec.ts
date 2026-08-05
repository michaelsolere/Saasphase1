import { expect, test } from "@playwright/test";

import { buildPostAdoptionCollectiveResults } from "../../src/features/post-adoption-questionnaire/collective-results-model";
import type { PostAdoptionResultsReadRow } from "../../src/features/post-adoption-questionnaire/results-model";

const activityOptions = [
  { value: "very_calm", label: "Très calme" },
  { value: "rather_calm", label: "Plutôt calme" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "rather_active", label: "Plutôt actif" },
  { value: "very_active", label: "Très actif" },
];

function row(
  animalId: string,
  animalName: string,
  answer: string | null,
): PostAdoptionResultsReadRow {
  return {
    litterId: "litter-collective",
    litterName: "Portée collective",
    litterDate: "2026-06-01",
    reservationId: `reservation-${animalId}`,
    reservationLitterId: "litter-collective",
    animalId,
    animalLitterId: "litter-collective",
    animalName,
    animalBirthDate: "2026-04-01",
    animalSex: "female",
    instanceId: `instance-${animalId}`,
    milestone: "t1",
    questionnaireCode: "post-adoption-t1",
    questionnaireVersion: 1,
    instanceStatus: answer === null ? "due" : "submitted",
    dueAt: "2026-08-01T10:00:00Z",
    responseDeadlineAt: "2026-08-31T10:00:00Z",
    latestRevisionNo: answer === null ? null : 1,
    latestSubmittedAt: answer === null ? null : "2026-08-02T10:00:00Z",
    latestAnswers: answer === null ? null : { activity: answer },
    definitionValid: true,
    definition: {
      schemaVersion: 1,
      rules: { noGlobalScore: true },
      code: "post-adoption-t1",
      version: 1,
      questions: [
        {
          key: "activity",
          type: "single_choice",
          longitudinalAxis: "activity",
          options: activityOptions,
        },
      ],
    },
  };
}

test("agrège un jalon en nombres et conserve les prénoms derrière chaque catégorie", () => {
  const collective = buildPostAdoptionCollectiveResults(
    [
      row("nova", "Nova", "intermediate"),
      row("orion", "Orion", "intermediate"),
      row("atlas", "Atlas", "very_active"),
      row("plume", "Plume", null),
    ],
    "t1",
  );

  expect(collective.counts).toEqual({
    concernedAnimals: 4,
    receivedQuestionnaires: 3,
  });
  const activity = collective.axes.find((axis) => axis.axis === "activity");
  expect(activity).toMatchObject({
    label: "Niveau d’activité",
    representedAnswers: 3,
    categories: [
      { value: "intermediate", label: "Intermédiaire", count: 2, animalNames: ["Nova", "Orion"] },
      { value: "very_active", label: "Très actif", count: 1, animalNames: ["Atlas"] },
    ],
  });
});

test("sépare non observable et question non applicable sans demander de graphique vide", () => {
  const nova = row("nova", "Nova", "not_exposed");
  nova.latestAnswers = {
    novelty: "not_exposed",
    solitude_exposure: "never",
  };
  nova.definition = {
    schemaVersion: 1,
    rules: { noGlobalScore: true },
    code: "post-adoption-t1",
    version: 1,
    questions: [
      {
        key: "novelty",
        type: "single_choice",
        longitudinalAxis: "novelty",
        options: [
          { value: "very_comfortable", label: "Très à l’aise" },
          { value: "rather_comfortable", label: "Plutôt à l’aise" },
          { value: "variable", label: "Variable" },
          { value: "often_worried", label: "Souvent inquiet" },
          { value: "very_often_worried", label: "Très souvent inquiet" },
          { value: "not_exposed", label: "Non observable" },
        ],
      },
      {
        key: "solitude_exposure",
        type: "single_choice",
        longitudinalAxis: "solitude_exposure",
        options: [
          { value: "never", label: "Jamais" },
          { value: "occasionally", label: "Occasionnellement" },
          { value: "regularly", label: "Régulièrement" },
        ],
      },
      {
        key: "solitude_duration",
        type: "single_choice",
        longitudinalAxis: "solitude_duration",
        visibleWhen: { question: "solitude_exposure", notEquals: "never" },
        options: [
          { value: "under_30m", label: "Moins de 30 min" },
          { value: "30m_1h", label: "30 min à 1 h" },
          { value: "1h_2h", label: "1 à 2 h" },
          { value: "2h_4h", label: "2 à 4 h" },
          { value: "over_4h", label: "Plus de 4 h" },
        ],
      },
    ],
  };

  const collective = buildPostAdoptionCollectiveResults([nova], "t1");
  const novelty = collective.axes.find((axis) => axis.axis === "novelty");
  const solitudeDuration = collective.axes.find(
    (axis) => axis.axis === "solitude_duration",
  );

  expect(novelty).toMatchObject({
    representedAnswers: 0,
    hasChart: false,
    explicitUnobservable: { count: 1, animalNames: ["Nova"] },
    notApplicable: { count: 0, animalNames: [] },
  });
  expect(solitudeDuration).toMatchObject({
    representedAnswers: 0,
    hasChart: false,
    explicitUnobservable: { count: 0, animalNames: [] },
    notApplicable: { count: 1, animalNames: ["Nova"] },
  });
});

test("retient défensivement la révision la plus récente d’un chiot sans le compter deux fois", () => {
  const oldRevision = row("nova", "Nova", "intermediate");
  const latestRevision = row("nova", "Nova", "very_active");
  latestRevision.latestRevisionNo = 2;
  latestRevision.latestSubmittedAt = "2026-08-03T10:00:00Z";

  const collective = buildPostAdoptionCollectiveResults(
    [oldRevision, latestRevision],
    "t1",
  );
  const activity = collective.axes.find((axis) => axis.axis === "activity");

  expect(collective.counts.receivedQuestionnaires).toBe(1);
  expect(activity?.representedAnswers).toBe(1);
  expect(activity?.categories).toMatchObject([
    { value: "very_active", label: "Très actif", count: 1, animalNames: ["Nova"] },
  ]);
});

test("écarte du camembert un chiot dont le rattachement à la portée est à vérifier", () => {
  const nova = row("nova", "Nova", "intermediate");
  nova.animalLitterId = "another-litter";

  const collective = buildPostAdoptionCollectiveResults([nova], "t1");
  expect(collective.axes).toEqual([]);
  expect(collective.questionnaireStates.linkageIssue).toEqual({
    count: 1,
    animalNames: ["Nova"],
    animals: [{ animalId: "nova", animalName: "Nova" }],
  });
});

test("compte un questionnaire reçu mais écarte une définition invalide des réponses représentées", () => {
  const nova = row("nova", "Nova", "intermediate");
  nova.definitionValid = false;

  const collective = buildPostAdoptionCollectiveResults([nova], "t1");
  expect(collective.counts.receivedQuestionnaires).toBe(1);
  expect(collective.axes).toEqual([]);
  expect(collective.questionnaireStates.invalid).toMatchObject({
    count: 1,
    animalNames: ["Nova"],
  });
});

test("écarte entièrement une révision dont les réponses structurées sont invalides", () => {
  const nova = row("nova", "Nova", "intermediate");
  nova.latestAnswers = null;

  const collective = buildPostAdoptionCollectiveResults([nova], "t1");

  expect(collective.axes).toEqual([]);
  expect(collective.questionnaireStates.invalid.animalNames).toEqual(["Nova"]);
});

test("ne génère pas onze cartes vides pour une révision structurée vide", () => {
  const nova = row("nova", "Nova", "intermediate");
  nova.latestAnswers = {};

  const collective = buildPostAdoptionCollectiveResults([nova], "t1");

  expect(collective.usableQuestionnaires).toBe(0);
  expect(collective.axes).toEqual([]);
  expect(collective.questionnaireStates.invalid.animalNames).toEqual(["Nova"]);
});

test("distingue au niveau du questionnaire un jalon absent d’un questionnaire non soumis", () => {
  const nova = row("nova", "Nova", null);
  const orion = row("orion", "Orion", "intermediate");
  orion.instanceId = null;
  orion.milestone = null;
  orion.questionnaireCode = null;
  orion.questionnaireVersion = null;
  orion.latestRevisionNo = null;
  orion.latestSubmittedAt = null;
  orion.latestAnswers = null;
  orion.definition = null;
  orion.definitionValid = null;

  const collective = buildPostAdoptionCollectiveResults([nova, orion], "t1");

  expect(collective.questionnaireStates.notSubmitted.animalNames).toEqual(["Nova"]);
  expect(collective.questionnaireStates.absent.animalNames).toEqual(["Orion"]);
  expect(collective.usableQuestionnaires).toBe(0);
});
