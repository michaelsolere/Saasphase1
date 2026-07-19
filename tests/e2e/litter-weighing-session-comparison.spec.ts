import { expect, test } from "@playwright/test";

import {
  buildLitterWeightLatestSessionComparison,
  type LitterWeighingSessionComparisonMeasurement,
  type LitterWeighingSessionComparisonSession,
} from "../../src/features/litter-weights/litter-weighing-session-comparison";

const sessions: LitterWeighingSessionComparisonSession[] = [
  {
    sessionId: "10000000-0000-4000-8000-000000000001",
    measuredAt: "2026-07-19T08:00:00.000Z",
    timezoneName: "Europe/Paris",
    createdAt: "2026-07-19T08:05:00.000Z",
  },
  {
    sessionId: "10000000-0000-4000-8000-000000000002",
    measuredAt: "2026-07-20T08:00:00.000Z",
    timezoneName: "Europe/Paris",
    createdAt: "2026-07-20T08:05:00.000Z",
  },
];

const partialCommonMeasurements: LitterWeighingSessionComparisonMeasurement[] = [
  { sessionId: sessions[0]!.sessionId, animalId: "animal-a", grams: 430 },
  { sessionId: sessions[0]!.sessionId, animalId: "animal-b", grams: 440 },
  { sessionId: sessions[0]!.sessionId, animalId: "animal-c", grams: 450 },
  { sessionId: sessions[1]!.sessionId, animalId: "animal-a", grams: 455 },
  { sessionId: sessions[1]!.sessionId, animalId: "animal-b", grams: 465 },
];

test("compare les deux dernières séances sur leur groupe partiel commun", () => {
  expect(
    buildLitterWeightLatestSessionComparison(sessions, partialCommonMeasurements),
  ).toEqual({
    status: "available",
    previousMeasuredAt: "2026-07-19T08:00:00.000Z",
    previousTimezoneName: "Europe/Paris",
    previousMeasurementCount: 3,
    currentMeasuredAt: "2026-07-20T08:00:00.000Z",
    currentTimezoneName: "Europe/Paris",
    currentMeasurementCount: 2,
    commonAnimalCount: 2,
    previousCommonAverageGrams: 435,
    currentCommonAverageGrams: 460,
    averageDifferenceGrams: 25,
    previousCommonRangeGrams: 10,
    currentCommonRangeGrams: 10,
    rangeDifferenceGrams: 0,
  });
});

test("reste indépendant de l’ordre, ignore une séance vide plus récente et ne mute pas les entrées", () => {
  const emptyLatest = {
    sessionId: "10000000-0000-4000-8000-000000000003",
    measuredAt: "2026-07-21T08:00:00.000Z",
    timezoneName: "UTC",
    createdAt: "2026-07-21T08:05:00.000Z",
  };
  const shuffledSessions = [sessions[1]!, emptyLatest, sessions[0]!];
  const shuffledMeasurements = [
    partialCommonMeasurements[4]!,
    partialCommonMeasurements[2]!,
    partialCommonMeasurements[0]!,
    partialCommonMeasurements[3]!,
    partialCommonMeasurements[1]!,
  ];
  const sessionsBefore = structuredClone(shuffledSessions);
  const measurementsBefore = structuredClone(shuffledMeasurements);

  expect(
    buildLitterWeightLatestSessionComparison(
      shuffledSessions,
      shuffledMeasurements,
    ),
  ).toEqual(
    buildLitterWeightLatestSessionComparison(sessions, partialCommonMeasurements),
  );
  expect(shuffledSessions).toEqual(sessionsBefore);
  expect(shuffledMeasurements).toEqual(measurementsBefore);
});

test("retourne un état insuffisant avec une seule séance non vide", () => {
  expect(
    buildLitterWeightLatestSessionComparison(sessions, [
      partialCommonMeasurements[0]!,
    ]),
  ).toEqual({ status: "insufficient_sessions" });
});

test("retourne un état neutre quand les deux séances n’ont aucun animal commun", () => {
  const result = buildLitterWeightLatestSessionComparison(sessions, [
    { sessionId: sessions[0]!.sessionId, animalId: "animal-a", grams: 430 },
    { sessionId: sessions[1]!.sessionId, animalId: "animal-b", grams: 455 },
  ]);

  expect(result).toEqual({
    status: "no_common_animals",
    previousMeasuredAt: sessions[0]!.measuredAt,
    previousTimezoneName: "Europe/Paris",
    currentMeasuredAt: sessions[1]!.measuredAt,
    currentTimezoneName: "Europe/Paris",
  });
});

test("calcule les moyennes et des amplitudes nulles avec un seul animal commun", () => {
  expect(
    buildLitterWeightLatestSessionComparison(sessions, [
      { sessionId: sessions[0]!.sessionId, animalId: "common", grams: 447 },
      { sessionId: sessions[0]!.sessionId, animalId: "previous-only", grams: 500 },
      { sessionId: sessions[1]!.sessionId, animalId: "common", grams: 437 },
      { sessionId: sessions[1]!.sessionId, animalId: "current-only", grams: 600 },
    ]),
  ).toMatchObject({
    status: "available",
    commonAnimalCount: 1,
    previousCommonAverageGrams: 447,
    currentCommonAverageGrams: 437,
    averageDifferenceGrams: -10,
    previousCommonRangeGrams: 0,
    currentCommonRangeGrams: 0,
    rangeDifferenceGrams: 0,
  });
});

test("conserve les évolutions positive, nulle et négative sans arrondi prématuré", () => {
  const fractional = buildLitterWeightLatestSessionComparison(sessions, [
    { sessionId: sessions[0]!.sessionId, animalId: "a", grams: 430 },
    { sessionId: sessions[0]!.sessionId, animalId: "b", grams: 440 },
    { sessionId: sessions[0]!.sessionId, animalId: "c", grams: 455 },
    { sessionId: sessions[1]!.sessionId, animalId: "a", grams: 435 },
    { sessionId: sessions[1]!.sessionId, animalId: "b", grams: 445 },
    { sessionId: sessions[1]!.sessionId, animalId: "c", grams: 460 },
  ]);
  expect(fractional).toMatchObject({
    status: "available",
    previousCommonAverageGrams: 1325 / 3,
    currentCommonAverageGrams: 1340 / 3,
    averageDifferenceGrams: 5,
    rangeDifferenceGrams: 0,
  });

  const negativeRange = buildLitterWeightLatestSessionComparison(sessions, [
    { sessionId: sessions[0]!.sessionId, animalId: "a", grams: 400 },
    { sessionId: sessions[0]!.sessionId, animalId: "b", grams: 440 },
    { sessionId: sessions[1]!.sessionId, animalId: "a", grams: 410 },
    { sessionId: sessions[1]!.sessionId, animalId: "b", grams: 430 },
  ]);
  expect(negativeRange).toMatchObject({
    status: "available",
    averageDifferenceGrams: 0,
    rangeDifferenceGrams: -20,
  });
});

test("départage les dates identiques par création puis identifiant sans exposer d’identifiant", () => {
  const tiedSessions = [
    {
      ...sessions[0]!,
      sessionId: "10000000-0000-4000-8000-000000000011",
      measuredAt: "2026-07-20T08:00:00.000Z",
      createdAt: "2026-07-20T08:05:00.000Z",
    },
    {
      ...sessions[0]!,
      sessionId: "10000000-0000-4000-8000-000000000012",
      measuredAt: "2026-07-20T08:00:00.000Z",
      createdAt: "2026-07-20T08:06:00.000Z",
    },
    {
      ...sessions[0]!,
      sessionId: "10000000-0000-4000-8000-000000000010",
      measuredAt: "2026-07-20T08:00:00.000Z",
      createdAt: "2026-07-20T08:06:00.000Z",
    },
  ];
  const result = buildLitterWeightLatestSessionComparison(
    tiedSessions,
    tiedSessions.map((session, index) => ({
      sessionId: session.sessionId,
      animalId: "common",
      grams: 430 + index * 10,
    })),
  );
  const serialized = JSON.stringify(result);

  expect(result).toMatchObject({
    status: "available",
    previousCommonAverageGrams: 440,
    currentCommonAverageGrams: 450,
    averageDifferenceGrams: 10,
  });
  expect(serialized).not.toMatch(
    /10000000-0000-4000-8000-00000000001[0-2]|sessionId|animalId/,
  );
});
