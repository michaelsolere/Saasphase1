import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelWhelpingBirthCore,
  correctWhelpingBirthCore,
  type WhelpingBirthCancellationSuccessReason,
} from "../../src/features/whelping/whelping-core";
import type { Database } from "../../src/types/database.types";

const ids = {
  user: "9f310013-0000-4000-8000-000000000001",
  birth: "9f310013-0000-4000-8000-000000000002",
  animal: "9f310013-0000-4000-8000-000000000003",
  event: "9f310013-0000-4000-8000-000000000004",
  command: "9f310013-0000-4000-8000-000000000005",
};

function client(reason: string | null) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: ids.user } },
        error: null,
      }),
    },
    rpc: async () => ({
      data: [{
        outcome: "success",
        birth_id: ids.birth,
        animal_id: ids.animal,
        event_id: ids.event,
        weight_measurement_id: null,
        revision_no: 1,
        event_sequence_no: 2,
        replayed: false,
        reason,
      }],
      error: null,
    }),
  } as unknown as SupabaseClient<Database>;
}

const cancellationInput = {
  birthId: ids.birth,
  clientCommandId: ids.command,
  expectedRevisionNo: 0,
  cancelledAt: "2026-07-31T10:00:00+02:00",
  reason: "Naissance enregistrée par erreur",
};

test("mappe uniquement les trois raisons structurées du succès d’annulation", async () => {
  for (const successReason of [
    "birth_cancellation_planning_restored",
    "birth_cancellation_planning_preserved",
    "birth_cancellation_no_planning_change",
  ] as const satisfies readonly WhelpingBirthCancellationSuccessReason[]) {
    await expect(cancelWhelpingBirthCore(
      cancellationInput,
      client(successReason),
    )).resolves.toMatchObject({
      outcome: "success",
      successReason,
    });
  }
});

test("conserve les anciens succès sans code reconnu avec un repli nul", async () => {
  for (const reason of [null, "legacy_success", "birth_planning_modified"]) {
    await expect(cancelWhelpingBirthCore(
      cancellationInput,
      client(reason),
    )).resolves.toMatchObject({
      outcome: "success",
      successReason: null,
    });
  }
});

test("ne change pas le mapping du succès de correction", async () => {
  const corrected = await correctWhelpingBirthCore({
    birthId: ids.birth,
    clientCommandId: ids.command,
    expectedRevisionNo: 0,
    occurredAt: "2026-07-31T09:00:00+02:00",
    sex: "female",
    viability: "alive",
    initialCollarColor: "Rose",
    birthNote: "État corrigé",
    weightGrams: null,
    weightMeasuredAt: null,
    weightNote: null,
    reason: "Erreur de saisie",
  }, client("birth_cancellation_planning_restored"));

  expect(corrected).toMatchObject({ outcome: "success" });
  expect(corrected).not.toHaveProperty("successReason");
});
