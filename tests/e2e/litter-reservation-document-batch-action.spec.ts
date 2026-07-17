import { expect, test } from "@playwright/test";

import type {
  LitterReservationDocumentBatchInput,
  LitterReservationDocumentBatchResult,
} from "../../src/features/documents/litter-reservation-document-batch-core";
import {
  generateLitterReservationDocumentsBatchActionCore,
  initialLitterReservationDocumentBatchActionState,
  type LitterReservationDocumentBatchActionDependencies,
  type LitterReservationDocumentBatchIntention,
} from "../../src/features/litters/litter-reservation-document-batch-action-core";

const litterId = "10000000-0000-4000-8000-000000000001";
const operationId = "20000000-0000-4000-8000-000000000002";
const commitmentTemplateId = "30000000-0000-4000-8000-000000000003";
const contractTemplateId = "40000000-0000-4000-8000-000000000004";
const reservationId = "50000000-0000-4000-8000-000000000005";
const otherReservationId = "60000000-0000-4000-8000-000000000006";
const capturedAt = "2026-07-17T14:15:16.000+02:00";

const intention: LitterReservationDocumentBatchIntention = {
  litterId,
  operationId,
  capturedAt,
};

const counts: LitterReservationDocumentBatchResult["counts"] = {
  created: 0,
  existing: 0,
  alreadyPresent: 0,
  protected: 0,
  ineligible: 0,
  missingData: 0,
  invalidData: 0,
  invalidSource: 0,
  incoherent: 0,
  errors: 0,
};

function batchResult(
  status: LitterReservationDocumentBatchResult["status"],
): LitterReservationDocumentBatchResult {
  return {
    status,
    ...(status === "error" ? { reasonCode: "context_error" as const } : {}),
    reservations: [],
    counts: { ...counts },
  };
}

function validFormData(reservationIds = [reservationId]) {
  const formData = new FormData();
  formData.set("batch_confirmation", "confirmed");
  for (const id of reservationIds) formData.append("reservation_ids[]", id);
  formData.set("commitment_template_id", commitmentTemplateId);
  formData.set("contract_template_id", contractTemplateId);
  return formData;
}

function harness(result = batchResult("success")) {
  const inputs: LitterReservationDocumentBatchInput[] = [];
  const paths: string[] = [];
  const dependencies: LitterReservationDocumentBatchActionDependencies = {
    generateBatch: async (input) => {
      inputs.push(input);
      return result;
    },
    revalidatePath: (path) => paths.push(path),
  };
  return { dependencies, inputs, paths };
}

async function run(
  formData: FormData,
  testIntention = intention,
  result = batchResult("success"),
) {
  const context = harness(result);
  const state = await generateLitterReservationDocumentsBatchActionCore(
    testIntention,
    initialLitterReservationDocumentBatchActionState,
    formData,
    context.dependencies,
  );
  return { ...context, state, result };
}

test("refuse une intention invalide sans appeler le noyau", async () => {
  for (const invalidIntention of [
    { ...intention, litterId: "not-a-uuid" },
    { ...intention, operationId: "not-a-uuid" },
    { ...intention, capturedAt: "2026-07-17T14:15:16" },
    { ...intention, capturedAt: "2026-02-31T14:15:16+02:00" },
    { ...intention, capturedAt: "not-a-date+02:00" },
  ]) {
    const { state, inputs } = await run(validFormData(), invalidIntention);
    expect(state).toEqual({ status: "invalid_input" });
    expect(inputs).toEqual([]);
  }
});

test("exige la confirmation exacte avant d'appeler le noyau", async () => {
  for (const confirmation of [null, "Confirmed", " confirmed", "confirmed "]) {
    const formData = validFormData();
    if (confirmation === null) formData.delete("batch_confirmation");
    else formData.set("batch_confirmation", confirmation);
    const { state, inputs } = await run(formData);
    expect(state).toEqual({ status: "confirmation_required" });
    expect(inputs).toEqual([]);
  }
});

test("retourne no_selection quand aucune réservation n'est soumise", async () => {
  const formData = validFormData([]);
  const { state, inputs } = await run(formData);
  expect(state).toEqual({ status: "no_selection" });
  expect(inputs).toEqual([]);
});

test("refuse plus de 30 entrées", async () => {
  const formData = validFormData(Array.from({ length: 31 }, (_, index) => `id-${index}`));
  const { state, inputs } = await run(formData);
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse un identifiant de modèle absent ou invalide", async () => {
  for (const [field, value] of [
    ["commitment_template_id", null],
    ["commitment_template_id", "invalid"],
    ["contract_template_id", null],
    ["contract_template_id", "invalid"],
  ] as const) {
    const formData = validFormData();
    if (value === null) formData.delete(field);
    else formData.set(field, value);
    const { state, inputs } = await run(formData);
    expect(state).toEqual({ status: "invalid_input" });
    expect(inputs).toEqual([]);
  }
});

test("refuse une entrée File ou non textuelle", async () => {
  const formData = validFormData();
  formData.append("reservation_ids[]", new Blob(["file-content"]), "reservation.txt");
  const { state, inputs } = await run(formData);
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("transmet l'ordre et les doublons sans filtrage", async () => {
  const submitted = [otherReservationId, reservationId, otherReservationId];
  const { inputs } = await run(validFormData(submitted));
  expect(inputs).toHaveLength(1);
  expect(inputs[0].reservationIds).toEqual(submitted);
});

test("transmet un UUID de réservation invalide au noyau", async () => {
  const submitted = [reservationId, "uuid-invalide", otherReservationId];
  const { inputs } = await run(validFormData(submitted));
  expect(inputs).toHaveLength(1);
  expect(inputs[0].reservationIds).toEqual(submitted);
});

test("ignore les champs techniques forgés et utilise exactement l'intention liée", async () => {
  const formData = validFormData();
  formData.set("litter_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  formData.set("organization_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  formData.set("operation_id", "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  formData.set("captured_at", "2030-01-01T00:00:00.000Z");
  formData.set("document_id", "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  formData.set("variant_id", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");

  const { inputs } = await run(formData);
  expect(inputs).toEqual([
    {
      litterId,
      operationId,
      capturedAt,
      reservationIds: [reservationId],
      commitmentTemplateId,
      contractTemplateId,
    },
  ]);
});

test("retourne le résultat détaillé sans transformation ni donnée technique", async () => {
  const detailedResult: LitterReservationDocumentBatchResult = {
    status: "partial",
    reservations: [
      {
        reservationId,
        commitment: { outcome: "created" },
        contract: { outcome: "invalid_source", reasonCode: "invalid_template" },
      },
    ],
    counts: { ...counts, created: 1, invalidSource: 1 },
  };
  const { state } = await run(validFormData(), intention, detailedResult);
  expect(state).toEqual({ status: "completed", result: detailedResult });
  if (state.status !== "completed") throw new Error("Unexpected state");
  expect(state.result).toBe(detailedResult);
  expect(Object.keys(state)).toEqual(["status", "result"]);
  expect(JSON.stringify(state)).not.toMatch(
    /organization_id|document_id|variant_id|storage|sha256|snapshot/i,
  );
});

for (const status of ["success", "partial"] as const) {
  test(`revalide les trois chemins sur ${status}`, async () => {
    const { paths } = await run(validFormData(), intention, batchResult(status));
    expect(paths).toEqual([
      `/litters/${litterId}`,
      "/reservations",
      "/documents",
    ]);
  });
}

test("ne revalide aucun chemin sur une erreur globale", async () => {
  const result = batchResult("error");
  const { state, paths } = await run(validFormData(), intention, result);
  expect(paths).toEqual([]);
  expect(state).toEqual({ status: "completed", result });
});
