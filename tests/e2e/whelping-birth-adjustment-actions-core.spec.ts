import { expect, test } from "@playwright/test";

import {
  cancelWhelpingBirthActionCore,
  correctWhelpingBirthActionCore,
  initialWhelpingBirthAdjustmentActionState,
  type WhelpingBirthAdjustmentActionDependencies,
  type WhelpingBirthAdjustmentIntention,
} from "../../src/features/whelping/whelping-actions-core";
import type {
  WhelpingBirthCancellationSuccessReason,
} from "../../src/features/whelping/whelping-core";

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

function harness(options: {
  correctionError?: string;
  cancellationError?: string;
  errorMessage?: string;
  replayed?: boolean;
  successReason?: WhelpingBirthCancellationSuccessReason | null;
  throws?: boolean;
} = {}) {
  const calls: unknown[] = [];
  const paths: string[] = [];
  const failure = (code: string) => ({
    outcome: "error" as const,
    error: { code: code as never, message: options.errorMessage ?? "sql secret" },
  });
  const correctionSuccess = {
    outcome: "success" as const,
    birthId: ids.birth,
    animalId: ids.animal,
    eventId: ids.event,
    weightMeasurementId: null,
    revisionNo: 4,
    eventSequenceNo: 8,
    replayed: options.replayed ?? false,
  };
  const cancellationSuccess = {
    ...correctionSuccess,
    successReason: options.successReason ?? null,
  };
  const dependencies: WhelpingBirthAdjustmentActionDependencies = {
    correctBirth: async (input) => {
      calls.push(input);
      if (options.throws) throw new Error("sql secret");
      return options.correctionError
        ? failure(options.correctionError)
        : correctionSuccess;
    },
    cancelBirth: async (input) => {
      calls.push(input);
      if (options.throws) throw new Error("sql secret");
      return options.cancellationError
        ? failure(options.cancellationError)
        : cancellationSuccess;
    },
    revalidatePath: (path) => paths.push(path),
  };
  return { calls, paths, dependencies };
}

test("refuse une intention liée invalide", async () => {
  const testHarness = harness();
  const state = await correctWhelpingBirthActionCore(
    { ...intention, expectedRevisionNo: -1 },
    initialWhelpingBirthAdjustmentActionState,
    validCorrection(),
    testHarness.dependencies,
  );
  expect(state).toMatchObject({ status: "error" });
  expect(testHarness.calls).toHaveLength(0);
});

test("corrige une naissance depuis la révision initiale zéro", async () => {
  const testHarness = harness();
  const state = await correctWhelpingBirthActionCore(
    { ...intention, expectedRevisionNo: 0 },
    initialWhelpingBirthAdjustmentActionState,
    validCorrection(),
    testHarness.dependencies,
  );
  expect(state.status).toBe("success");
  expect(testHarness.calls).toHaveLength(1);
  expect(testHarness.calls[0]).toMatchObject({ expectedRevisionNo: 0 });
});

test("annule une naissance depuis la révision initiale zéro", async () => {
  const testHarness = harness();
  const state = await cancelWhelpingBirthActionCore(
    { ...intention, expectedRevisionNo: 0 },
    initialWhelpingBirthAdjustmentActionState,
    form({ cancelled_at: "2026-07-22T12:00:00+02:00", reason: "Doublon" }),
    testHarness.dependencies,
  );
  expect(state.status).toBe("success");
  expect(testHarness.calls).toHaveLength(1);
  expect(testHarness.calls[0]).toMatchObject({ expectedRevisionNo: 0 });
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
  const invalidValues: Array<Record<string, string>> = [
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
  ];
  for (const values of invalidValues) {
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
  expect(state).toEqual({
    status: "success",
    message: "Les données actives de la portée ont été recalculées.",
    replayed: false,
  });
  expect(testHarness.calls).toEqual([{
    birthId: ids.birth,
    clientCommandId: ids.command,
    expectedRevisionNo: 3,
    cancelledAt: "2026-07-22T10:00:00.000Z",
    reason: "Doublon",
  }]);
  expect(testHarness.paths).toHaveLength(6);
});

test("conserve le rejeu idempotent dans l’état de succès", async () => {
  const testHarness = harness({
    replayed: true,
    successReason: "birth_cancellation_planning_preserved",
  });
  const state = await cancelWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ cancelled_at: "2026-07-22T12:00:00+02:00", reason: "Doublon" }),
    testHarness.dependencies,
  );

  expect(state).toEqual({
    status: "success",
    message: "Une autre naissance reste active. La date réelle de naissance et le suivi postnatal de la portée ont été conservés.",
    replayed: true,
  });
  expect(testHarness.calls).toHaveLength(1);
});

for (const [successReason, expectedMessage] of [
  [
    "birth_cancellation_planning_restored",
    "La date réelle de naissance a été retirée et le suivi de la portée a été remis dans son état antérieur.",
  ],
  [
    "birth_cancellation_planning_preserved",
    "Une autre naissance reste active. La date réelle de naissance et le suivi postnatal de la portée ont été conservés.",
  ],
  [
    "birth_cancellation_no_planning_change",
    "Cette annulation n’a nécessité aucune modification de la date réelle ni du planning de la portée.",
  ],
] as const) {
  test(`présente le message de succès structuré ${successReason}`, async () => {
    const testHarness = harness({ successReason });
    const state = await cancelWhelpingBirthActionCore(
      intention,
      initialWhelpingBirthAdjustmentActionState,
      form({
        cancelled_at: "2026-07-22T12:00:00+02:00",
        reason: "Doublon",
      }),
      testHarness.dependencies,
    );

    expect(state).toEqual({
      status: "success",
      message: expectedMessage,
      replayed: false,
    });
  });
}

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

for (const [code, uxReason, expected, stale] of [
  ["stale_revision", "stale_revision", "Cette naissance a été modifiée depuis l’ouverture de cette fenêtre.\nAucune donnée n’a été changée.", true],
  ["later_active_birth_exists", "later_active_birth", "Cette naissance ne peut pas être annulée tant qu’une naissance enregistrée après elle reste active.\n\nLa naissance la plus récente doit être traitée en premier.", false],
  ["birth_has_downstream_data", "protected_downstream", "Des informations ont été ajoutées ou modifiées depuis cette naissance.\nLe SaaS ne peut pas annuler la saisie sans risquer d’effacer un travail effectué ensuite.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_planning_modified", "birth_planning_modified", "Le planning a été modifié après cette naissance.\n\nL’annulation automatique risquerait d’effacer un choix ou une action\nenregistrée ensuite.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_planning_task_added", "birth_planning_task_added", "Une tâche a été ajoutée au planning après cette naissance.\n\nLe SaaS ne peut pas déterminer automatiquement si cette tâche doit être\nconservée ou supprimée.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_planning_dependency_exists", "birth_planning_dependency_exists", "Une tâche créée lors de la naissance est maintenant utilisée par un rappel\nou une autre action du SaaS.\n\nCette dépendance doit être examinée avant de pouvoir annuler la saisie.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_date_changed_after_activation", "birth_date_changed_after_activation", "La date de naissance utilisée pour activer le planning a été corrigée.\n\nL’ancien état du planning ne peut plus être restauré automatiquement\navec suffisamment de sécurité.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_planning_history_incomplete", "birth_planning_history_incomplete", "Cette naissance ne possède pas tout l’historique nécessaire à une\nrestauration automatique du planning.\n\nL’annulation reste protégée afin de préserver les données existantes.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_planning_entity_missing", "birth_planning_entity_missing", "Un élément attendu du planning n’existe plus.\n\nLe SaaS ne peut pas reconstituer automatiquement un état complet et fiable.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_planning_state_inconsistent", "birth_planning_state_inconsistent", "L’historique de cette activation ne permet pas une annulation automatique sûre.\n\nAucune donnée n’a été modifiée.", false],
  ["birth_cancelled", "already_cancelled", "Cette naissance est déjà annulée.\nRechargez le Journal pour afficher son état actuel.", false],
  ["conflict", "conflict", "Cette tentative entre en conflit avec une tentative précédente.\nAucune donnée n’a été modifiée.\n\nRechargez le Journal avant de réessayer.", false],
  ["database_error", "technical", "Un problème technique empêche momentanément l’annulation.\nAucune donnée n’a été modifiée.\n\nRechargez le Journal avant de réessayer.", false],
] as const) {
  test(`présente le motif UX structuré ${uxReason} pour ${code}`, async () => {
    const testHarness = harness({ cancellationError: code });
    const state = await cancelWhelpingBirthActionCore(
      intention,
      initialWhelpingBirthAdjustmentActionState,
      form({ cancelled_at: "2026-07-22T12:00:00+02:00", reason: "Doublon" }),
      testHarness.dependencies,
    );
    expect(state).toEqual({
      status: "error",
      message: expected,
      uxReason,
      ...(stale ? { stale: true } : {}),
    });
    expect(JSON.stringify(state)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    expect(JSON.stringify(state)).not.toContain("sql secret");
    expect(testHarness.paths).toEqual([]);
  });
}

test("ne déduit jamais le motif UX depuis le texte de l’erreur", async () => {
  const states = await Promise.all([
    "texte SQL qui ressemble à stale_revision",
    "un autre détail interne sans rapport",
  ].map(async (errorMessage) => {
    const testHarness = harness({
      cancellationError: "birth_has_downstream_data",
      errorMessage,
    });
    return cancelWhelpingBirthActionCore(
      intention,
      initialWhelpingBirthAdjustmentActionState,
      form({ cancelled_at: "2026-07-22T12:00:00+02:00", reason: "Doublon" }),
      testHarness.dependencies,
    );
  }));

  expect(states[0]).toEqual(states[1]);
  expect(states[0]).toMatchObject({
    status: "error",
    uxReason: "protected_downstream",
  });
  expect(JSON.stringify(states)).not.toContain("stale_revision");
  expect(JSON.stringify(states)).not.toContain("détail interne");
});

test("ne déduit aucun diagnostic détaillé depuis le texte d’une erreur générique", async () => {
  const testHarness = harness({
    cancellationError: "birth_has_downstream_data",
    errorMessage: "birth_planning_dependency_exists WHELPING_REVERSAL_TASK_ADDED",
  });
  const state = await cancelWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ cancelled_at: "2026-07-22T12:00:00+02:00", reason: "Doublon" }),
    testHarness.dependencies,
  );

  expect(state).toMatchObject({
    status: "error",
    uxReason: "protected_downstream",
  });
  expect(JSON.stringify(state)).not.toContain("WHELPING_REVERSAL_TASK_ADDED");
  expect(JSON.stringify(state)).not.toContain("birth_planning_dependency_exists");
});

test("masque une exception et ne divulgue aucun identifiant", async () => {
  const testHarness = harness({ throws: true });
  const state = await correctWhelpingBirthActionCore(intention, initialWhelpingBirthAdjustmentActionState, validCorrection(), testHarness.dependencies);
  expect(state).toEqual({
    status: "error",
    message: "Une erreur technique empêche momentanément cette opération.",
    uxReason: "technical",
  });
  expect(JSON.stringify(state)).not.toContain(ids.birth);
  expect(testHarness.paths).toEqual([]);
});
