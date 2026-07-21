import { expect, test } from "@playwright/test";

import {
  cancelLitterRoutineWeightActionCore,
  cancelLitterWeighingSessionActionCore,
  correctLitterRoutineWeightActionCore,
  initialLitterWeightAdjustmentActionState,
  type LitterWeightAdjustmentActionDependencies,
  type LitterWeightMeasurementAdjustmentIntention,
  type LitterWeightSessionCancellationIntention,
} from "../../src/features/litter-weights/litter-weights-actions-core";

const ids = {
  litter: "9f200004-0000-4000-8000-000000000001",
  session: "9f200004-0000-4000-8000-000000000002",
  measurement: "9f200004-0000-4000-8000-000000000003",
  animal: "9f200004-0000-4000-8000-000000000004",
  command: "9f200004-0000-4000-8000-000000000005",
};

const measurementIntention: LitterWeightMeasurementAdjustmentIntention = {
  litterId: ids.litter, sessionId: ids.session, measurementId: ids.measurement,
  animalId: ids.animal, expectedRevisionNo: 3, clientCommandId: ids.command,
};
const sessionIntention: LitterWeightSessionCancellationIntention = {
  litterId: ids.litter, sessionId: ids.session, expectedRevisionNo: 2, clientCommandId: ids.command,
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function harness(options: { correctionError?: string; cancellationError?: string; sessionError?: string; throws?: boolean } = {}) {
  const calls: unknown[] = []; const paths: string[] = [];
  const failure = (code: string) => ({ outcome: "error" as const, error: { code: code as never, message: "secret" } });
  const dependencies: LitterWeightAdjustmentActionDependencies = {
    correctWeight: async (input) => { calls.push(input); if (options.throws) throw new Error("secret"); return options.correctionError ? failure(options.correctionError) : { outcome: "success", measurementId: ids.measurement, sessionId: ids.session, revisionNo: 4, replayed: false }; },
    cancelWeight: async (input) => { calls.push(input); if (options.throws) throw new Error("secret"); return options.cancellationError ? failure(options.cancellationError) : { outcome: "success", measurementId: ids.measurement, sessionId: ids.session, revisionNo: 4, replayed: false }; },
    cancelSession: async (input) => { calls.push(input); if (options.throws) throw new Error("secret"); return options.sessionError ? failure(options.sessionError) : { outcome: "success", sessionId: ids.session, revisionNo: 3, affectedMeasurementCount: 2, replayed: false }; },
    revalidatePath: (path) => paths.push(path),
  };
  return { dependencies, calls, paths };
}

test("corrige avec l’intention serveur et ignore les identifiants et révisions forgés", async () => {
  const testHarness = harness();
  const data = form({ grams: " 540 ", note: " Après contrôle ", reason: " Erreur de saisie ", litterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", measurementId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", animalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevisionNo: "99", clientCommandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  const state = await correctLitterRoutineWeightActionCore(measurementIntention, initialLitterWeightAdjustmentActionState, data, testHarness.dependencies);
  expect(state).toEqual({ status: "success", message: "La mesure a été corrigée." });
  expect(testHarness.calls).toEqual([{ measurementId: ids.measurement, clientCommandId: ids.command, expectedRevisionNo: 3, grams: 540, note: "Après contrôle", reason: "Erreur de saisie" }]);
  expect(testHarness.paths).toEqual(["/litters/journal", "/litters/journal/comparison", `/litters/${ids.litter}`, `/animals/${ids.animal}`]);
});

test("refuse intention, poids et motif invalides", async () => {
  const testHarness = harness();
  expect((await correctLitterRoutineWeightActionCore({ ...measurementIntention, measurementId: "forged" }, initialLitterWeightAdjustmentActionState, form({ grams: "500", reason: "Motif" }), testHarness.dependencies)).status).toBe("error");
  for (const grams of ["0", "1.5", "100001"]) expect((await correctLitterRoutineWeightActionCore(measurementIntention, initialLitterWeightAdjustmentActionState, form({ grams, reason: "Motif" }), testHarness.dependencies)).message).toContain("entier");
  expect((await correctLitterRoutineWeightActionCore(measurementIntention, initialLitterWeightAdjustmentActionState, form({ grams: "500", reason: " " }), testHarness.dependencies)).message).toContain("motif");
  expect(testHarness.calls).toHaveLength(0);
});

test("annule une mesure et une séance avec timestamp ISO transmis au moment de la soumission", async () => {
  const measurementHarness = harness();
  const cancellationForm = form({ reason: " Doublon ", cancelled_at: "2026-07-21T10:00:00+02:00", measurementId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevisionNo: "99" });
  expect(await cancelLitterRoutineWeightActionCore(measurementIntention, initialLitterWeightAdjustmentActionState, cancellationForm, measurementHarness.dependencies)).toMatchObject({ status: "success" });
  expect(measurementHarness.calls[0]).toEqual({ measurementId: ids.measurement, clientCommandId: ids.command, expectedRevisionNo: 3, cancelledAt: "2026-07-21T08:00:00.000Z", reason: "Doublon" });
  const sessionHarness = harness();
  expect(await cancelLitterWeighingSessionActionCore(sessionIntention, initialLitterWeightAdjustmentActionState, form({ reason: " Heure erronée ", cancelled_at: "2026-07-21T08:01:00Z" }), sessionHarness.dependencies)).toMatchObject({ status: "success" });
  expect(sessionHarness.paths).toEqual(["/litters/journal", "/litters/journal/comparison", `/litters/${ids.litter}`]);
});

for (const [code, message] of [
  ["stale_revision", "Cette pesée a été modifiée depuis son affichage. Rechargez les données avant de recommencer."],
  ["no_change", "Aucune modification n’a été détectée."],
  ["last_measurement_requires_session_cancellation", "Il s’agit de la dernière mesure active de cette séance. Annulez la séance entière."],
] as const) {
  test(`affiche le message métier ${code}`, async () => {
    const testHarness = harness({ correctionError: code });
    const state = await correctLitterRoutineWeightActionCore(measurementIntention, initialLitterWeightAdjustmentActionState, form({ grams: "500", reason: "Motif" }), testHarness.dependencies);
    expect(state.message).toBe(message); expect(state.stale).toBe(code === "stale_revision" ? true : undefined); expect(testHarness.paths).toEqual([]);
  });
}

test("masque une exception et ne divulgue aucun identifiant", async () => {
  const testHarness = harness({ throws: true });
  const state = await correctLitterRoutineWeightActionCore(measurementIntention, initialLitterWeightAdjustmentActionState, form({ grams: "500", reason: "Motif" }), testHarness.dependencies);
  expect(state).toEqual({ status: "error", message: "Une erreur technique empêche momentanément cette opération." });
  expect(JSON.stringify(state)).not.toContain(ids.measurement); expect(testHarness.paths).toEqual([]);
});
