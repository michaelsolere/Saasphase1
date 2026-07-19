import { expect, test } from "@playwright/test";

import {
  initialLitterRoutineWeightsActionState,
  litterRoutineWeightsErrorMessage,
  recordLitterRoutineWeightsActionCore,
  type LitterRoutineWeightsActionDependencies,
  type RecordLitterRoutineWeightsIntention,
} from "../../src/features/litter-weights/litter-weights-actions-core";
import type {
  LitterWeightServiceErrorCode,
  RecordLitterRoutineWeightsInput,
  RecordLitterRoutineWeightsResult,
} from "../../src/features/litter-weights/litter-weights-core";

const litterId = "9f190007-0000-4000-8000-000000000010";
const commandId = "9f190007-0000-4000-8000-000000000020";
const animalIds = [
  "9f190007-0000-4000-8000-000000000031",
  "9f190007-0000-4000-8000-000000000032",
  "9f190007-0000-4000-8000-000000000033",
];

function intention(ids = animalIds): RecordLitterRoutineWeightsIntention {
  return { litterId, clientCommandId: commandId, animalIds: ids };
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = {
    measured_at: "2026-07-19T12:30:00+02:00",
    timezone_name: "Europe/Paris",
    note: " Séance commune ",
    weight_0: "410",
    item_note_0: " Après tétée ",
    weight_1: "420",
    item_note_1: "",
    weight_2: "430",
    item_note_2: "",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

function harness(
  result: RecordLitterRoutineWeightsResult = {
    outcome: "success",
    litterId,
    sessionId: "9f190007-0000-4000-8000-000000000040",
    measurementIds: ["9f190007-0000-4000-8000-000000000050"],
    measurementCount: 3,
    replayed: false,
  },
) {
  const calls: RecordLitterRoutineWeightsInput[] = [];
  const paths: string[] = [];
  const dependencies: LitterRoutineWeightsActionDependencies = {
    recordWeights: async (input) => {
      calls.push(input);
      return result;
    },
    revalidatePath: (path) => paths.push(path),
  };
  return { calls, paths, dependencies };
}

async function submit(
  data: FormData,
  linked = intention(),
  result?: RecordLitterRoutineWeightsResult,
) {
  const testHarness = harness(result);
  const state = await recordLitterRoutineWeightsActionCore(
    linked,
    initialLitterRoutineWeightsActionState,
    data,
    testHarness.dependencies,
  );
  return { state, ...testHarness };
}

test("valide l’intention liée et associe chaque index à l’animal serveur", async () => {
  const { state, calls } = await submit(form());
  expect(state).toEqual({
    status: "success",
    message: "3 poids ont été enregistrés.",
    measurementCount: 3,
    replayed: false,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    litterId,
    clientCommandId: commandId,
    measuredAt: "2026-07-19T10:30:00.000Z",
    timezoneName: "Europe/Paris",
    note: "Séance commune",
    items: [
      { animalId: animalIds[0], grams: 410, note: "Après tétée" },
      { animalId: animalIds[1], grams: 420, note: null },
      { animalId: animalIds[2], grams: 430, note: null },
    ],
  });
});

test("ignore les champs techniques forgés", async () => {
  const data = form();
  for (const name of [
    "animal_id",
    "animal_ids",
    "litter_id",
    "organization_id",
    "client_command_id",
    "session_id",
    "measurement_id",
    "items",
  ]) {
    data.set(name, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  }
  const { calls } = await submit(data);
  expect(calls[0].litterId).toBe(litterId);
  expect(calls[0].clientCommandId).toBe(commandId);
  expect(calls[0].items.map((item) => item.animalId)).toEqual(animalIds);
  expect(JSON.stringify(calls[0])).not.toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});

test("accepte une séance partielle et ignore les lignes entièrement vides", async () => {
  const { calls } = await submit(
    form({ weight_1: "", item_note_1: "", weight_2: "", item_note_2: "" }),
  );
  expect(calls[0].items).toEqual([
    { animalId: animalIds[0], grams: 410, note: "Après tétée" },
  ]);
});

test("refuse une note individuelle sans poids", async () => {
  const { state, calls } = await submit(form({ weight_0: "", item_note_0: "Note seule" }));
  expect(state).toEqual({
    status: "error",
    message: "Une note individuelle doit être accompagnée d’un poids.",
  });
  expect(calls).toHaveLength(0);
});

test("refuse une séance sans aucun poids", async () => {
  const { state } = await submit(
    form({ weight_0: "", item_note_0: "", weight_1: "", weight_2: "" }),
  );
  expect(state.message).toBe("Saisissez au moins un poids.");
});

for (const invalidWeight of [" ", "1.5", "0", "-1", "100001"]) {
  test(`refuse le poids invalide ${JSON.stringify(invalidWeight)}`, async () => {
    const { state, calls } = await submit(form({ weight_0: invalidWeight }));
    expect(state.status).toBe("error");
    expect(calls).toHaveLength(0);
  });
}

test("refuse un timestamp sans offset", async () => {
  const { state } = await submit(form({ measured_at: "2026-07-19T12:30:00" }));
  expect(state.message).toBe("Le formulaire de pesée est invalide.");
});

test("refuse un fuseau IANA invalide", async () => {
  const { state } = await submit(form({ timezone_name: "Paris/Invalid" }));
  expect(state.message).toBe("Le formulaire de pesée est invalide.");
});

test("refuse les notes communes et individuelles trop longues", async () => {
  const tooLong = "x".repeat(5001);
  const common = await submit(form({ note: tooLong }));
  const individual = await submit(form({ item_note_0: tooLong }));
  expect(common.state.status).toBe("error");
  expect(individual.state.status).toBe("error");
  expect(common.calls).toHaveLength(0);
  expect(individual.calls).toHaveLength(0);
});

test("refuse les listes liées vides, dupliquées ou supérieures à 30", async () => {
  const empty = await submit(form(), intention([]));
  const duplicated = await submit(form(), intention([animalIds[0], animalIds[0]]));
  const tooManyIds = Array.from(
    { length: 31 },
    (_, index) => `9f190007-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
  );
  const tooMany = await submit(form(), intention(tooManyIds));
  expect(empty.state.message).toBe("Le formulaire de pesée est invalide.");
  expect(duplicated.state.message).toBe("Un animal apparaît plusieurs fois dans la séance.");
  expect(tooMany.state.message).toBe("Une séance est limitée à 30 animaux.");
});

test("traduit distinctement tous les codes métier", () => {
  const codes: LitterWeightServiceErrorCode[] = [
    "invalid_input",
    "too_many_animals",
    "duplicate_animal",
    "unauthenticated",
    "forbidden",
    "not_found",
    "animal_ineligible",
    "measured_before_birth",
    "measured_after_death",
    "measurement_already_recorded",
    "command_conflict",
    "inconsistent_relations",
    "database_error",
  ];
  const messages = codes.map((code) =>
    litterRoutineWeightsErrorMessage({ code, message: "technical detail" }),
  );
  expect(messages).toEqual([
    "Le formulaire de pesée est invalide.",
    "Une séance est limitée à 30 animaux.",
    "Un animal apparaît plusieurs fois dans la séance.",
    "Vous n’avez pas les droits nécessaires pour enregistrer cette pesée.",
    "Vous n’avez pas les droits nécessaires pour enregistrer cette pesée.",
    "La portée ou l’un des animaux est introuvable.",
    "Un animal n’est pas éligible à cette pesée.",
    "La pesée ne peut pas précéder la naissance.",
    "La pesée ne peut pas être postérieure au décès.",
    "Une mesure existe déjà pour un animal à cet instant.",
    "Cette pesée entre en conflit avec une tentative précédente.",
    "Les relations entre la portée et les animaux sont incohérentes.",
    "Une erreur technique empêche momentanément l’enregistrement.",
  ]);
});

test("revalide exactement le journal, la portée et les animaux réellement pesés", async () => {
  const { paths } = await submit(
    form({ weight_1: "", item_note_1: "", weight_2: "425" }),
    intention(),
    {
      outcome: "success",
      litterId,
      sessionId: "9f190007-0000-4000-8000-000000000040",
      measurementIds: [
        "9f190007-0000-4000-8000-000000000050",
        "9f190007-0000-4000-8000-000000000051",
      ],
      measurementCount: 2,
      replayed: false,
    },
  );
  expect(paths).toEqual([
    "/litters/journal",
    `/litters/${litterId}`,
    `/animals/${animalIds[0]}`,
    `/animals/${animalIds[2]}`,
  ]);
  expect(paths).not.toContain("/litters");
  expect(paths).not.toContain("/animals");
});

test("ne revalide rien après une erreur métier", async () => {
  const { paths } = await submit(form(), intention(), {
    outcome: "error",
    error: { code: "animal_ineligible", message: "technical detail" },
  });
  expect(paths).toEqual([]);
});

test("ne retourne aucun UUID ni identifiant technique", async () => {
  const { state } = await submit(form());
  const serialized = JSON.stringify(state);
  expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  expect(serialized).not.toMatch(/session|measurementId|animalId|commandId|litterId/i);
});

test("masque une exception technique et ne revalide rien", async () => {
  const paths: string[] = [];
  const state = await recordLitterRoutineWeightsActionCore(
    intention(),
    initialLitterRoutineWeightsActionState,
    form(),
    {
      recordWeights: async () => {
        throw new Error(`secret ${animalIds[0]}`);
      },
      revalidatePath: (path) => paths.push(path),
    },
  );
  expect(state).toEqual({
    status: "error",
    message: "Une erreur technique empêche momentanément l’enregistrement.",
  });
  expect(paths).toEqual([]);
});
