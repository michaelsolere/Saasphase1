import { expect, test } from "@playwright/test";

import {
  buildPostAdoptionResultsOverview,
  type PostAdoptionResultsReadRow,
} from "../../src/features/post-adoption-questionnaire/results-model";

function row(
  overrides: Partial<PostAdoptionResultsReadRow> = {},
): PostAdoptionResultsReadRow {
  return {
    litterId: "litter-recent",
    litterName: "Portée Nova",
    litterDate: "2026-06-01",
    reservationId: "reservation-nova",
    reservationLitterId: "litter-recent",
    animalId: "animal-nova",
    animalLitterId: "litter-recent",
    animalName: "Nova",
    animalBirthDate: "2026-04-01",
    animalSex: "female",
    instanceId: "instance-t1-nova",
    milestone: "t1",
    questionnaireCode: "post-adoption-t1",
    questionnaireVersion: 1,
    instanceStatus: "submitted",
    dueAt: "2026-08-01T10:00:00Z",
    responseDeadlineAt: "2026-08-31T10:00:00Z",
    latestRevisionNo: 1,
    latestSubmittedAt: "2026-08-02T10:00:00Z",
    latestAnswers: { behavior_activity: "intermediate" },
    definitionValid: true,
    definition: {
      schemaVersion: 1,
      rules: { noGlobalScore: true },
      code: "post-adoption-t1",
      version: 1,
      sectionOrder: [],
      questions: [],
    },
    ...overrides,
  };
}

test("liste les portées récentes en premier avec une couverture en nombres concrets", () => {
  const overview = buildPostAdoptionResultsOverview([
    row(),
    row({
      litterId: "litter-old",
      litterName: "Portée ancienne",
      litterDate: "2025-03-01",
      reservationId: "reservation-older",
      reservationLitterId: "litter-old",
      animalId: "animal-older",
      animalLitterId: "litter-old",
      animalName: "Orion",
      instanceId: null,
      milestone: null,
      questionnaireCode: null,
      questionnaireVersion: null,
      instanceStatus: null,
      dueAt: null,
      responseDeadlineAt: null,
      latestRevisionNo: null,
      latestSubmittedAt: null,
      latestAnswers: null,
      definition: null,
    }),
  ]);

  expect(overview.litters.map((litter) => litter.id)).toEqual([
    "litter-recent",
    "litter-old",
  ]);
  expect(overview.litters[0].coverage).toEqual({
    concernedAnimals: 1,
    t1Received: 1,
    t2Received: 0,
  });
  expect(overview.litters[1].coverage).toEqual({
    concernedAnimals: 1,
    t1Received: 0,
    t2Received: 0,
  });
});

test("un jalon absent ne masque pas la réponse reçue sur l’autre jalon", () => {
  const overview = buildPostAdoptionResultsOverview([row()]);

  expect(overview.litters[0].animals[0].milestones).toEqual({
    t1: {
      state: "received",
      instanceId: "instance-t1-nova",
      revisionNo: 1,
    },
    t2: {
      state: "absent",
      instanceId: null,
      revisionNo: null,
    },
  });
});

test("une version non homologuée reste incompatible sans masquer le jalon homologué", () => {
  const overview = buildPostAdoptionResultsOverview([
    row(),
    row({
      instanceId: "instance-t2-nova",
      milestone: "t2",
      questionnaireCode: "post-adoption-t2",
      questionnaireVersion: 2,
      latestRevisionNo: 1,
      latestSubmittedAt: "2026-08-03T10:00:00Z",
      definition: {
        schemaVersion: 1,
        rules: { noGlobalScore: true },
        code: "post-adoption-t2",
        version: 2,
        sectionOrder: [],
        questions: [],
      },
    }),
  ]);

  expect(overview.litters[0].animals[0].milestones.t1.state).toBe("received");
  expect(overview.litters[0].animals[0].milestones.t2.state).toBe("incompatible");
});

test("distingue un questionnaire non soumis, une donnée invalide et un rattachement à vérifier", () => {
  const stateFor = (candidate: PostAdoptionResultsReadRow) =>
    buildPostAdoptionResultsOverview([candidate]).litters[0].animals[0].milestones.t1.state;

  expect(
    stateFor(row({ latestRevisionNo: null, latestSubmittedAt: null, latestAnswers: null })),
  ).toBe("available_not_submitted");
  expect(
    stateFor(
      row({
        definition: {
          schemaVersion: 1,
          rules: { noGlobalScore: true },
          code: "post-adoption-t2",
          version: 1,
          sectionOrder: [],
          questions: [],
        },
      }),
    ),
  ).toBe("invalid");
  expect(
    stateFor(row({ animalLitterId: "other-litter" })),
  ).toBe("linkage_issue");
});
