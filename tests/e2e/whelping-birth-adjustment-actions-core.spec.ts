import { expect, test } from "@playwright/test";

import {
  cancelWhelpingBirthActionCore,
  correctWhelpingBirthActionCore,
  initialWhelpingBirthAdjustmentActionState,
  type WhelpingBirthAdjustmentActionDependencies,
  type WhelpingBirthAdjustmentIntention,
} from "../../src/features/whelping/whelping-actions-core";

const ids = {
  litter: "9f220001-0000-4000-8000-000000000001",
  session: "9f220001-0000-4000-8000-000000000002",
  birth: "9f220001-0000-4000-8000-000000000003",
  animal: "9f220001-0000-4000-8000-000000000004",
  command: "9f220001-0000-4000-8000-000000000005",
  event: "9f220001-0000-4000-8000-000000000006",
};

const intention: WhelpingBirthAdjustmentIntention = {
  litterId: ids.litter,
  sessionId: ids.session,
  birthId: ids.birth,
  animalId: ids.animal,
  expectedRevisionNo: 3,
  clientCommandId: ids.command,
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function validCorrection(overrides: Record<string, string> = {}) {
  return form({
    occurred_at: "2026-07-22T10:00:00+02:00",
    sex: "female",
    viability: "alive",
    initial_collar_color: " Rose ",
    birth_note: " Vigoureuse ",
    birth_weight_grams: " 420 ",
    weight_measured_at: "2026-07-22T10:02:00+02:00",
    weight_note: " Après séchage ",
    reason: " Erreur de saisie ",
    ...overrides,
  });
}

function harness(options: { correctionError?: string; cancellationError?: string; throws?: boolean } = {}) {
  const calls: unknown[] = [];
  const paths: string[] = [];
  const failure = (code: string) => ({
    outcome: "error" as const,
    error: { code: code as never, message: "sql secret" },
  });
  const success = {
    outcome: "success" as const,
    birthId: ids.birth,
    animalId: ids.animal,
    eventId: ids.event,
    weightMeasurementId: null,
    revisionNo: 4,
    eventSequenceNo: 8,
    replayed: false,
  };
  const dependencies: WhelpingBirthAdjustmentActionDependencies = {
    correctBirth: async (input) => {
      calls.push(input);
      if (options.throws) throw new Error("sql secret");
      return options.correctionError ? failure(options.correctionError) : success;
    },
    cancelBirth: async (input) => {
      calls.push(input);
      if (options.throws) throw new Error("sql secret");
      return options.cancellationError ? failure(options.cancellationError) : success;
    },
    revalidatePath: (path) => paths.push(path),
  };
  return { calls, paths, dependencies };
}

test("refuse une intention liée invalide", async () => {
  const testHarness = harness();
  const state = await correctWhelpingBirthActionCore(
    { ...intention, animalId: "forged", expectedRevisionNo: -1 },
    initialWhelpingBirthAdjustmentActionState,
    validCorrection(),
    testHarness.dependencies,
  );
  expect(state).toMatchObject({ status: "error" });
  expect(testHarness.calls).toHaveLength(0);
});

test("ignore tous les identifiants et la révision forgés dans FormData", async () => {
  const testHarness = harness();
  const data = validCorrection({
    litterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    birthId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    animalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expectedRevisionNo: "99",
    clientCommandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  const state = await correctWhelpingBirthActionCore(intention, initialWhelpingBirthAdjustmentActionState, data, testHarness.dependencies);
  expect(state.status).toBe("success");
  expect(testHarness.calls).toEqual([{
    birthId: ids.birth,
    clientCommandId: ids.command,
    expectedRevisionNo: 3,
    occurredAt: "2026-07-22T08:00:00.000Z",
    sex: "female",
    viability: "alive",
    initialCollarColor: "Rose",
    birthNote: "Vigoureuse",
    weightGrams: 420,
    weightMeasuredAt: "2026-07-22T08:02:00.000Z",
    weightNote: "Après séchage",
    reason: "Erreur de saisie",
  }]);
  expect(testHarness.paths).toEqual([
    "/litters/journal",
    "/litters",
    `/litters/${ids.litter}`,
    "/litters/journal/comparison",
    "/animals",
    `/animals/${ids.animal}`,
  ]);
});

test("valide les champs métier, le motif et les combinaisons de poids", async () => {
  const testHarness = harness();
  for (const values of [
    { occurred_at: "invalid" },
    { sex: "forged" },
    { viability: "forged" },
    { birth_weight_grams: "0" },
    { birth_weight_grams: "1.5" },
    { birth_weight_grams: "100001" },
    { reason: " " },
    { birth_weight_grams: "", weight_measured_at: "2026-07-22T10:02:00+02:00" },
    { birth_weight_grams: "", weight_measured_at: "", weight_note: "Sans poids" },
    { birth_weight_grams: "420", weight_measured_at: "" },
  ]) {
    expect((await correctWhelpingBirthActionCore(intention, initialWhelpingBirthAdjustmentActionState, validCorrection(values), testHarness.dependencies)).status).toBe("error");
  }
  expect(testHarness.calls).toHaveLength(0);
});

test("annule avec un motif et l’horodatage soumis", async () => {
  const testHarness = harness();
  const state = await cancelWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ cancelled_at: "2026-07-22T12:00:00+02:00", reason: " Doublon " }),
    testHarness.dependencies,
  );
  expect(state.status).toBe("success");
  expect(testHarness.calls).toEqual([{
    birthId: ids.birth,
    clientCommandId: ids.command,
    expectedRevisionNo: 3,
    cancelledAt: "2026-07-22T10:00:00.000Z",
    reason: "Doublon",
  }]);
  expect(testHarness.paths).toHaveLength(6);
});

test("refuse une annulation sans motif ou horodatage valide", async () => {
  const testHarness = harness();
  for (const values of [
    { cancelled_at: "2026-07-22T12:00:00+02:00", reason: "" },
    { cancelled_at: "invalid", reason: "Motif" },
  ]) {
    expect((await cancelWhelpingBirthActionCore(intention, initialWhelpingBirthAdjustmentActionState, form(values), testHarness.dependencies)).status).toBe("error");
  }
  expect(testHarness.calls).toHaveLength(0);
});

for (const [code, expected, stale] of [
  ["stale_revision", "Cette naissance a été modifiée depuis son affichage. Rechargez les données avant de recommencer.", true],
  ["no_change", "Aucune modification n’a été détectée.", false],
  ["later_active_birth_exists", "Seule la dernière naissance active peut être annulée.", false],
  ["birth_has_downstream_data", "Cette naissance possède déjà des données ultérieures. Elle ne peut plus être annulée, mais ses informations peuvent éventuellement être corrigées.", false],
  ["birth_time_out_of_order", "L’heure indiquée est incompatible avec l’ordre des naissances.", false],
  ["birth_weight_inconsistent", "Les données du poids de naissance ont changé depuis l’affichage.", false],
  ["birth_cancelled", "Cette naissance a déjà été annulée.", false],
  ["conflict", "Cette commande entre en conflit avec une tentative précédente. Rechargez les données.", false],
  ["forbidden", "Vous n’avez pas les droits nécessaires pour modifier cette naissance.", false],
  ["not_found", "La naissance demandée est introuvable ou inaccessible.", false],
  ["database_error", "Une erreur technique empêche momentanément cette opération.", false],
] as const) {
  test(`présente le message métier ${code} sans détail technique`, async () => {
    const testHarness = harness({ correctionError: code });
    const state = await correctWhelpingBirthActionCore(intention, initialWhelpingBirthAdjustmentActionState, validCorrection(), testHarness.dependencies);
    expect(state).toEqual({ status: "error", message: expected, ...(stale ? { stale: true } : {}) });
    expect(JSON.stringify(state)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    expect(JSON.stringify(state)).not.toContain("sql secret");
    expect(testHarness.paths).toEqual([]);
  });
}

test("masque une exception et ne divulgue aucun identifiant", async () => {
  const testHarness = harness({ throws: true });
  const state = await correctWhelpingBirthActionCore(intention, initialWhelpingBirthAdjustmentActionState, validCorrection(), testHarness.dependencies);
  expect(state).toEqual({ status: "error", message: "Une erreur technique empêche momentanément cette opération." });
  expect(JSON.stringify(state)).not.toContain(ids.birth);
  expect(testHarness.paths).toEqual([]);
});
