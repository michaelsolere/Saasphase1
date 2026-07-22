import { expect, test } from "@playwright/test";

import {
  initialWhelpingBirthAdjustmentActionState,
  quickCompleteWhelpingBirthActionCore,
  type WhelpingBirthAdjustmentIntention,
  type WhelpingQuickCompletionActionDependencies,
} from "../../src/features/whelping/whelping-actions-core";

const ids = {
  litter: "9f270001-0000-4000-8000-000000000001",
  session: "9f270001-0000-4000-8000-000000000002",
  birth: "9f270001-0000-4000-8000-000000000003",
  animal: "9f270001-0000-4000-8000-000000000004",
  command: "9f270001-0000-4000-8000-000000000005",
};

const intention: WhelpingBirthAdjustmentIntention = {
  litterId: ids.litter,
  sessionId: ids.session,
  birthId: ids.birth,
  animalId: ids.animal,
  expectedRevisionNo: 0,
  clientCommandId: ids.command,
};

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function harness(result?: Awaited<ReturnType<WhelpingQuickCompletionActionDependencies["quickCompleteBirth"]>>, throws = false) {
  const calls: unknown[] = [];
  const paths: string[] = [];
  const dependencies: WhelpingQuickCompletionActionDependencies = {
    quickCompleteBirth: async (input) => {
      calls.push(input);
      if (throws) throw new Error("private sql detail");
      return result ?? {
        outcome: "success",
        birthOrder: 4,
        initialCollarColor: input.initialCollarColor ?? null,
        birthWeightGrams: input.birthWeightGrams ?? null,
        replayed: false,
      };
    },
    revalidatePath: (path) => paths.push(path),
  };
  return { calls, paths, dependencies };
}

test("refuse une intention serveur invalide", async () => {
  const context = harness();
  const state = await quickCompleteWhelpingBirthActionCore(
    { ...intention, clientCommandId: "forged" },
    initialWhelpingBirthAdjustmentActionState,
    form({ initial_collar_color: "Orange" }),
    context.dependencies,
  );
  expect(state.status).toBe("error");
  expect(context.calls).toEqual([]);
});

test("transmet uniquement le poids, la couleur, l’heure et le consentement autorisés", async () => {
  const context = harness();
  const data = form({
    initial_collar_color: " Orange ",
    birth_weight_grams: " 430 ",
    weight_measured_at: "2026-07-22T03:19:00+02:00",
    allow_duplicate_color: "true",
    occurred_at: "1900-01-01T00:00:00Z",
    sex: "female",
    viability: "stillborn",
    birth_note: "forged",
    weight_note: "forged",
    birth_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expected_revision_no: "99",
  });
  const state = await quickCompleteWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    data,
    context.dependencies,
  );
  expect(state).toMatchObject({
    status: "success",
    message: "Naissance n°4 complétée : 430 g · collier orange.",
  });
  expect(context.calls).toEqual([{
    ...intention,
    initialCollarColor: "Orange",
    birthWeightGrams: 430,
    weightMeasuredAt: "2026-07-22T01:19:00.000Z",
    allowDuplicateColor: true,
  }]);
  expect(context.paths).toEqual([
    "/whelping",
    "/litters/journal",
    "/litters",
    `/litters/${ids.litter}`,
    "/animals",
    `/animals/${ids.animal}`,
  ]);
});

test("autorise les sauvegardes partielles et produit leur confirmation", async () => {
  const weightContext = harness();
  const weight = await quickCompleteWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ birth_weight_grams: "431", weight_measured_at: "2026-07-22T03:20:00+02:00" }),
    weightContext.dependencies,
  );
  expect(weight.message).toBe("Naissance n°4 complétée : 431 g.");
  expect(weightContext.calls[0]).toMatchObject({ initialCollarColor: null, birthWeightGrams: 431 });

  const colorContext = harness();
  const color = await quickCompleteWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ initial_collar_color: "Turquoise" }),
    colorContext.dependencies,
  );
  expect(color.message).toBe("Naissance n°4 complétée : collier turquoise.");
  expect(colorContext.calls[0]).toMatchObject({ initialCollarColor: "Turquoise", birthWeightGrams: null });
});

test("refuse une soumission vide, un poids invalide ou une heure absente", async () => {
  for (const values of [
    {},
    { initial_collar_color: " " },
    { birth_weight_grams: "0", weight_measured_at: "2026-07-22T03:20:00+02:00" },
    { birth_weight_grams: "1.5", weight_measured_at: "2026-07-22T03:20:00+02:00" },
    { birth_weight_grams: "100001", weight_measured_at: "2026-07-22T03:20:00+02:00" },
    { birth_weight_grams: "430" },
    { weight_measured_at: "2026-07-22T03:20:00+02:00" },
    { initial_collar_color: "x".repeat(256) },
  ]) {
    const context = harness();
    const state = await quickCompleteWhelpingBirthActionCore(
      intention,
      initialWhelpingBirthAdjustmentActionState,
      form(values),
      context.dependencies,
    );
    expect(state.status).toBe("error");
    expect(context.calls).toEqual([]);
  }
});

test("représente la confirmation de doublon sans divulguer de détail technique", async () => {
  const context = harness({
    outcome: "error",
    error: { code: "duplicate_color_confirmation_required", message: "private sql detail" },
    duplicateColorBirthOrder: 2,
  });
  const state = await quickCompleteWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ initial_collar_color: "Bleu" }),
    context.dependencies,
  );
  expect(state).toEqual({
    status: "error",
    message: "Cette couleur est déjà attribuée à la naissance n°2.",
    duplicateColorBirthOrder: 2,
  });
  expect(JSON.stringify(state)).not.toContain("private sql detail");
});

for (const [code, stale] of [
  ["unauthenticated", false],
  ["forbidden", false],
  ["not_found", false],
  ["birth_weight_already_recorded", false],
  ["birth_color_already_recorded", false],
  ["stale_revision", true],
] as const) {
  test(`neutralise l’erreur serveur ${code}`, async () => {
    const context = harness({
      outcome: "error",
      error: { code, message: "private sql detail" },
    });
    const state = await quickCompleteWhelpingBirthActionCore(
      intention,
      initialWhelpingBirthAdjustmentActionState,
      form({ initial_collar_color: "Orange" }),
      context.dependencies,
    );
    expect(state.status).toBe("error");
    expect(state.stale ?? false).toBe(stale);
    expect(JSON.stringify(state)).not.toMatch(/private sql|supabase|rpc|whelping_births/i);
  });
}

test("masque les exceptions techniques", async () => {
  const context = harness(undefined, true);
  const state = await quickCompleteWhelpingBirthActionCore(
    intention,
    initialWhelpingBirthAdjustmentActionState,
    form({ initial_collar_color: "Orange" }),
    context.dependencies,
  );
  expect(state).toEqual({ status: "error", message: "Une erreur technique empêche momentanément cette opération." });
  expect(JSON.stringify(state)).not.toContain(ids.birth);
});
