import { expect, test } from "@playwright/test";

import {
  buildLitterRoutineWeightEntries,
  buildLitterWeightEntryHref,
  getLitterRoutineWeightEntryProgress,
  removeWeightEntryFromUrl,
} from "@/features/litter-weights/litter-routine-weight-entry";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "@/features/litter-weights/litter-weights-core";

const ids = {
  animals: [
    "d7290005-0000-4000-8000-000000000201",
    "d7290005-0000-4000-8000-000000000202",
    "d7290005-0000-4000-8000-000000000203",
  ],
  session: "d7290005-0000-4000-8000-000000000301",
  measurements: [
    "d7290005-0000-4000-8000-000000000401",
    "d7290005-0000-4000-8000-000000000402",
    "d7290005-0000-4000-8000-000000000403",
  ],
  command: "d7290005-0000-4000-8000-000000000501",
} as const;

function animal(
  index: number,
  overrides: Partial<LitterWeightHistoryAnimal> = {},
): LitterWeightHistoryAnimal {
  return {
    id: ids.animals[index]!,
    ownershipStatus: "produced",
    birthOrder: index + 1,
    sex: index % 2 === 0 ? "female" : "male",
    callName: `Chiot ${index + 1}`,
    officialName: null,
    initialCollarColor: index === 0 ? "Bleu" : null,
    currentCollarColor: null,
    status: "born",
    birthDate: "2026-07-20",
    deathDate: null,
    birthWeightGrams: 350 + index * 10,
    ...overrides,
  };
}

function measurement({
  id,
  animalId,
  grams,
  measuredAt,
  createdAt,
}: {
  id: string;
  animalId: string;
  grams: number;
  measuredAt: string;
  createdAt: string;
}): LitterWeightHistoryMeasurement {
  return {
    id,
    revisionNo: 0,
    animalId,
    sessionId: ids.session,
    type: "routine",
    grams,
    measuredAt,
    note: null,
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt,
  };
}

test("préserve l’ordre existant des animaux éligibles", () => {
  const animals = [animal(2), animal(0), animal(1)];
  const entries = buildLitterRoutineWeightEntries({ animals, measurements: [] });
  expect(entries.map(({ animalId }) => animalId)).toEqual(
    animals.map(({ id }) => id),
  );
});

test("sélectionne la dernière mesure par date métier", () => {
  const measurements = [
    measurement({
      id: ids.measurements[0],
      animalId: ids.animals[0],
      grams: 610,
      measuredAt: "2026-07-25T08:00:00.000Z",
      createdAt: "2026-07-25T08:01:00.000Z",
    }),
    measurement({
      id: ids.measurements[1],
      animalId: ids.animals[0],
      grams: 640,
      measuredAt: "2026-07-26T08:00:00.000Z",
      createdAt: "2026-07-26T08:01:00.000Z",
    }),
  ];
  expect(
    buildLitterRoutineWeightEntries({
      animals: [animal(0)],
      measurements,
    })[0],
  ).toMatchObject({
    latestWeightGrams: 640,
    latestMeasuredAt: "2026-07-26T08:00:00.000Z",
  });
});

test("départage les mesures de même date avec createdAt", () => {
  const measurements = [
    measurement({
      id: ids.measurements[0],
      animalId: ids.animals[0],
      grams: 630,
      measuredAt: "2026-07-26T08:00:00.000Z",
      createdAt: "2026-07-26T08:02:00.000Z",
    }),
    measurement({
      id: ids.measurements[1],
      animalId: ids.animals[0],
      grams: 620,
      measuredAt: "2026-07-26T08:00:00.000Z",
      createdAt: "2026-07-26T08:01:00.000Z",
    }),
  ];
  expect(
    buildLitterRoutineWeightEntries({
      animals: [animal(0)],
      measurements,
    })[0]?.latestWeightGrams,
  ).toBe(630);
});

test("se replie sur le poids de naissance sans mesure historique", () => {
  expect(
    buildLitterRoutineWeightEntries({
      animals: [animal(0, { birthWeightGrams: 365 })],
      measurements: [],
    })[0],
  ).toMatchObject({ latestWeightGrams: 365, latestMeasuredAt: null });
});

test("compte uniquement les poids valides", () => {
  const entries = buildLitterRoutineWeightEntries({
    animals: [animal(0), animal(1), animal(2)],
    measurements: [],
    drafts: [
      { animalId: ids.animals[0], weightDraft: "640" },
      { animalId: ids.animals[1], weightDraft: "100000" },
      { animalId: ids.animals[2], weightDraft: "12.5" },
    ],
  });
  expect(getLitterRoutineWeightEntryProgress(entries).validWeightCount).toBe(2);
});

test("reconnaît les valeurs vides comme manquantes", () => {
  const entries = buildLitterRoutineWeightEntries({
    animals: [animal(0), animal(1)],
    measurements: [],
    drafts: [
      { animalId: ids.animals[0], weightDraft: "" },
      { animalId: ids.animals[1], weightDraft: "   " },
    ],
  });
  expect(getLitterRoutineWeightEntryProgress(entries)).toMatchObject({
    missingAnimalLabels: ["Chiot 1", "Chiot 2"],
    invalidAnimalLabels: [],
  });
});

test("distingue les poids invalides des poids manquants", () => {
  const entries = buildLitterRoutineWeightEntries({
    animals: [animal(0), animal(1), animal(2)],
    measurements: [],
    drafts: [
      { animalId: ids.animals[0], weightDraft: "" },
      { animalId: ids.animals[1], weightDraft: "0" },
      { animalId: ids.animals[2], weightDraft: "100001" },
    ],
  });
  expect(getLitterRoutineWeightEntryProgress(entries)).toEqual({
    validWeightCount: 0,
    missingAnimalLabels: ["Chiot 1"],
    invalidAnimalLabels: ["Chiot 2", "Chiot 3"],
  });
});

test("n’expose aucun identifiant de séance, mesure ou commande", () => {
  const entries = buildLitterRoutineWeightEntries({
    animals: [animal(0)],
    measurements: [
      measurement({
        id: ids.measurements[0],
        animalId: ids.animals[0],
        grams: 640,
        measuredAt: "2026-07-26T08:00:00.000Z",
        createdAt: "2026-07-26T08:01:00.000Z",
      }),
    ],
  });
  expect(Object.keys(entries[0]!)).toEqual([
    "animalId",
    "publicLabel",
    "details",
    "collarColor",
    "latestWeightGrams",
    "latestMeasuredAt",
    "weightDraft",
    "isValidWeightDraft",
  ]);
  const publicJson = JSON.stringify(entries);
  for (const technicalId of [
    ids.session,
    ...ids.measurements,
    ids.command,
  ]) {
    expect(publicJson).not.toContain(technicalId);
  }
});

test("ne modifie ni animaux, ni mesures, ni brouillons sources", () => {
  const animals = [animal(0), animal(1)];
  const measurements = [
    measurement({
      id: ids.measurements[0],
      animalId: ids.animals[0],
      grams: 640,
      measuredAt: "2026-07-26T08:00:00.000Z",
      createdAt: "2026-07-26T08:01:00.000Z",
    }),
  ];
  const drafts = [{ animalId: ids.animals[0], weightDraft: "650" }];
  const snapshot = structuredClone({ animals, measurements, drafts });
  buildLitterRoutineWeightEntries({ animals, measurements, drafts });
  expect({ animals, measurements, drafts }).toEqual(snapshot);
});

test("construit et nettoie weightEntry en préservant paramètres et hash", () => {
  expect(buildLitterWeightEntryHref(ids.animals[0])).toBe(
    `/litters/journal?litter=${ids.animals[0]}&weightEntry=1#litter-weights`,
  );
  expect(
    removeWeightEntryFromUrl(
      `http://localhost:3100/litters/journal?tab=table&litter=${ids.animals[0]}&weightEntry=1&filter=active#litter-weights`,
    ),
  ).toBe(
    `/litters/journal?tab=table&litter=${ids.animals[0]}&filter=active#litter-weights`,
  );
});
