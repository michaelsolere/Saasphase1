import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import type {
  LitterGroupReservationDocumentBatchInput,
  LitterGroupReservationDocumentBatchResult,
} from "../../src/features/documents/litter-group-reservation-document-batch-core";
import {
  generateLitterGroupReservationDocumentsBatchActionCore,
  initialLitterGroupReservationDocumentBatchActionState,
  type LitterGroupReservationDocumentBatchActionDependencies,
  type LitterGroupReservationDocumentBatchActionState,
  type LitterGroupReservationDocumentBatchIntention,
} from "../../src/features/litters/litter-group-reservation-document-batch-action-core";

const litterGroupId = "10000000-0000-4000-8000-000000000001";
const operationId = "20000000-0000-4000-8000-000000000002";
const reservationId = "30000000-0000-4000-8000-000000000003";
const otherReservationId = "40000000-0000-4000-8000-000000000004";
const commitmentTemplateId = "50000000-0000-4000-8000-000000000005";
const contractTemplateId = "60000000-0000-4000-8000-000000000006";
const litterId = "70000000-0000-4000-8000-000000000007";
const otherLitterId = "80000000-0000-4000-8000-000000000008";
const capturedAt = "2026-07-17T14:15:16.000+02:00";

const intention: LitterGroupReservationDocumentBatchIntention = {
  litterGroupId,
  operationId,
  capturedAt,
};

const documentCounts: LitterGroupReservationDocumentBatchResult["documentCounts"] = {
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

const planningCounts: LitterGroupReservationDocumentBatchResult["planningCounts"] = {
  rawSelected: 1,
  selected: 1,
  planned: 1,
  excluded: 0,
  groupOnly: 0,
  incoherentAttachments: 0,
  preIneligible: 0,
  missingTaxonomy: 0,
  missingOrAmbiguousModels: 0,
};

function batchResult(
  status: LitterGroupReservationDocumentBatchResult["status"],
  litterIds: string[] = [],
): LitterGroupReservationDocumentBatchResult {
  return {
    status,
    ...(status === "error" ? { reasonCode: "context_error" as const } : {}),
    reservations: [],
    litters: litterIds.map((id) => ({
      litterId: id,
      reservationCount: 1,
      status: "success",
      documentCounts: { ...documentCounts },
    })),
    planningCounts: { ...planningCounts },
    documentCounts: { ...documentCounts },
  };
}

function selection(
  taxonomyKey = "dog::golden retriever",
  commitmentId = commitmentTemplateId,
  contractId = contractTemplateId,
) {
  return {
    taxonomyKey,
    commitmentTemplateId: commitmentId,
    contractTemplateId: contractId,
  };
}

function validFormData(
  reservationIds = [reservationId],
  templateSelections = [selection()],
) {
  const formData = new FormData();
  formData.set("batch_confirmation", "confirmed");
  for (const id of reservationIds) formData.append("reservation_ids[]", id);
  for (const value of templateSelections) {
    formData.append("taxonomy_template_selections[]", JSON.stringify(value));
  }
  return formData;
}

function harness(result = batchResult("success")) {
  const inputs: LitterGroupReservationDocumentBatchInput[] = [];
  const paths: string[] = [];
  const dependencies: LitterGroupReservationDocumentBatchActionDependencies = {
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
  previousState: LitterGroupReservationDocumentBatchActionState =
    initialLitterGroupReservationDocumentBatchActionState,
) {
  const context = harness(result);
  const state = await generateLitterGroupReservationDocumentsBatchActionCore(
    testIntention,
    previousState,
    formData,
    context.dependencies,
  );
  return { ...context, state, result };
}

test("accepte une intention serveur valide", async () => {
  const { state, inputs } = await run(validFormData());
  expect(state.status).toBe("completed");
  expect(inputs).toHaveLength(1);
});

test("refuse un litterGroupId invalide", async () => {
  const { state, inputs } = await run(validFormData(), {
    ...intention,
    litterGroupId: "not-a-uuid",
  });
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse un operationId invalide", async () => {
  const { state, inputs } = await run(validFormData(), {
    ...intention,
    operationId: "not-a-uuid",
  });
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse capturedAt sans fuseau ou invalide", async () => {
  for (const invalidCapturedAt of [
    "2026-07-17T14:15:16",
    "2026-02-31T14:15:16+02:00",
    "not-a-date+02:00",
  ]) {
    const { state, inputs } = await run(validFormData(), {
      ...intention,
      capturedAt: invalidCapturedAt,
    });
    expect(state).toEqual({ status: "invalid_input" });
    expect(inputs).toEqual([]);
  }
});

test("exige la confirmation exacte", async () => {
  for (const confirmation of [null, "Confirmed", " confirmed", "confirmed "]) {
    const formData = validFormData();
    if (confirmation === null) formData.delete("batch_confirmation");
    else formData.set("batch_confirmation", confirmation);
    const { state, inputs } = await run(formData);
    expect(state).toEqual({ status: "confirmation_required" });
    expect(inputs).toEqual([]);
  }
});

test("retourne no_selection pour zéro réservation", async () => {
  const { state, inputs } = await run(validFormData([]));
  expect(state).toEqual({ status: "no_selection" });
  expect(inputs).toEqual([]);
});

test("accepte exactement 30 valeurs de réservation brutes", async () => {
  const submitted = Array.from({ length: 30 }, (_, index) => `raw-${index}`);
  const { state, inputs } = await run(validFormData(submitted));
  expect(state.status).toBe("completed");
  expect(inputs[0].reservationIds).toEqual(submitted);
});

test("refuse 31 valeurs de réservation brutes", async () => {
  const submitted = Array.from({ length: 31 }, (_, index) => `raw-${index}`);
  const { state, inputs } = await run(validFormData(submitted));
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse une réservation non textuelle ou trop longue", async () => {
  const withFile = validFormData();
  withFile.append("reservation_ids[]", new Blob(["file"]), "reservation.txt");
  const fileRun = await run(withFile);
  expect(fileRun.state).toEqual({ status: "invalid_input" });
  expect(fileRun.inputs).toEqual([]);

  const longRun = await run(validFormData(["x".repeat(101)]));
  expect(longRun.state).toEqual({ status: "invalid_input" });
  expect(longRun.inputs).toEqual([]);
});

test("transmet zéro sélection de modèles comme tableau vide", async () => {
  const { inputs } = await run(validFormData([reservationId], []));
  expect(inputs).toHaveLength(1);
  expect(inputs[0].templateSelections).toEqual([]);
});

test("accepte une sélection JSON stricte valide", async () => {
  const submitted = selection();
  const { inputs } = await run(validFormData([reservationId], [submitted]));
  expect(inputs[0].templateSelections).toEqual([submitted]);
});

test("conserve plusieurs taxonomies dans leur ordre", async () => {
  const submitted = [
    selection("dog::golden retriever"),
    selection(
      "dog::labrador retriever",
      "90000000-0000-4000-8000-000000000009",
      "a0000000-0000-4000-8000-00000000000a",
    ),
  ];
  const { inputs } = await run(validFormData([reservationId], submitted));
  expect(inputs[0].templateSelections).toEqual(submitted);
});

test("conserve les clés de taxonomie dupliquées", async () => {
  const submitted = [selection(), selection()];
  const { inputs } = await run(validFormData([reservationId], submitted));
  expect(inputs[0].templateSelections).toEqual(submitted);
});

test("refuse un JSON invalide", async () => {
  const formData = validFormData();
  formData.set("taxonomy_template_selections[]", "{invalid-json");
  const { state, inputs } = await run(formData);
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse un objet de sélection avec un champ supplémentaire", async () => {
  const formData = validFormData();
  formData.set(
    "taxonomy_template_selections[]",
    JSON.stringify({ ...selection(), organizationId: litterGroupId }),
  );
  const { state, inputs } = await run(formData);
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse une clé de taxonomie vide ou trop longue", async () => {
  for (const taxonomyKey of ["", "   ", "x".repeat(501)]) {
    const { state, inputs } = await run(
      validFormData([reservationId], [selection(taxonomyKey)]),
    );
    expect(state).toEqual({ status: "invalid_input" });
    expect(inputs).toEqual([]);
  }
});

test("refuse un UUID de certificat invalide", async () => {
  const { state, inputs } = await run(
    validFormData([reservationId], [selection("taxonomy", "invalid")]),
  );
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse un UUID de contrat invalide", async () => {
  const { state, inputs } = await run(
    validFormData(
      [reservationId],
      [selection("taxonomy", commitmentTemplateId, "invalid")],
    ),
  );
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse plus de 30 sélections de modèles", async () => {
  const submitted = Array.from({ length: 31 }, (_, index) =>
    selection(`taxonomy-${index}`),
  );
  const { state, inputs } = await run(validFormData([reservationId], submitted));
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("refuse une chaîne JSON de sélection trop longue avant parsing", async () => {
  const formData = validFormData();
  formData.set("taxonomy_template_selections[]", `{"padding":"${"x".repeat(1_001)}"}`);
  const { state, inputs } = await run(formData);
  expect(state).toEqual({ status: "invalid_input" });
  expect(inputs).toEqual([]);
});

test("ignore tous les champs techniques forgés", async () => {
  const formData = validFormData();
  for (const [field, value] of Object.entries({
    organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    litter_group_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    operation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    captured_at: "2030-01-01T00:00:00.000Z",
    litter_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    species: "cat",
    breed: "forged",
    document_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    variant_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    storage_path: "forged/path.pdf",
  })) {
    formData.set(field, value);
  }

  const { inputs } = await run(formData);
  expect(inputs).toEqual([
    {
      litterGroupId,
      operationId,
      capturedAt,
      reservationIds: [reservationId],
      templateSelections: [selection()],
    },
  ]);
});

test("transmet exactement l'intention liée et les tableaux soumis", async () => {
  const submittedReservations = [otherReservationId, reservationId, otherReservationId];
  const submittedSelections = [selection("taxonomy-a"), selection("taxonomy-a")];
  const { inputs } = await run(
    validFormData(submittedReservations, submittedSelections),
  );
  expect(inputs).toEqual([
    {
      litterGroupId,
      operationId,
      capturedAt,
      reservationIds: submittedReservations,
      templateSelections: submittedSelections,
    },
  ]);
});

test("ignore previousState pour l'intention et les données soumises", async () => {
  const forgedPreviousResult = batchResult("partial", [otherLitterId]);
  const previousState: LitterGroupReservationDocumentBatchActionState = {
    status: "completed",
    result: forgedPreviousResult,
  };
  const { inputs } = await run(
    validFormData([otherReservationId], [selection("new-taxonomy")]),
    intention,
    batchResult("success"),
    previousState,
  );
  expect(inputs).toEqual([
    {
      litterGroupId,
      operationId,
      capturedAt,
      reservationIds: [otherReservationId],
      templateSelections: [selection("new-taxonomy")],
    },
  ]);
});

for (const status of ["success", "partial", "error"] as const) {
  test(`retourne le résultat ${status} dans completed`, async () => {
    const result = batchResult(status);
    const { state } = await run(validFormData(), intention, result);
    expect(state).toEqual({ status: "completed", result });
    if (state.status !== "completed") throw new Error("Unexpected state");
    expect(state.result).toBe(result);
  });
}

for (const status of ["success", "partial"] as const) {
  test(`revalide groupe, listes et portées après ${status}`, async () => {
    const result = batchResult(status, [litterId, otherLitterId]);
    const { paths } = await run(validFormData(), intention, result);
    expect(paths).toEqual([
      `/litter-groups/${litterGroupId}`,
      "/reservations",
      "/documents",
      `/litters/${litterId}`,
      `/litters/${otherLitterId}`,
    ]);
  });
}

test("ne revalide aucun chemin après error", async () => {
  const result = batchResult("error", [litterId]);
  const { paths } = await run(validFormData(), intention, result);
  expect(paths).toEqual([]);
});

test("revalide chaque portée une seule fois dans l'ordre de première apparition", async () => {
  const result = batchResult("success", [otherLitterId, litterId, otherLitterId]);
  const { paths } = await run(validFormData(), intention, result);
  expect(paths).toEqual([
    `/litter-groups/${litterGroupId}`,
    "/reservations",
    "/documents",
    `/litters/${otherLitterId}`,
    `/litters/${litterId}`,
  ]);
});

test("ne redirige pas, n'utilise aucun paramètre d'URL et n'ajoute aucune donnée documentaire technique à l'état", async () => {
  const detailedResult: LitterGroupReservationDocumentBatchResult = {
    ...batchResult("partial", [litterId]),
    reservations: [
      {
        reservationId,
        litterId,
        taxonomy: { species: "dog", breed: "Golden Retriever" },
        status: "processed",
        commitment: { outcome: "created" },
        contract: { outcome: "invalid_source", reasonCode: "invalid_template" },
      },
    ],
  };
  const { state } = await run(validFormData(), intention, detailedResult);
  expect(state).toEqual({ status: "completed", result: detailedResult });
  expect(Object.keys(state)).toEqual(["status", "result"]);
  expect(JSON.stringify(state)).not.toMatch(
    /organization_id|document_id|variant_id|storage_path|sha256|snapshot/i,
  );

  const coreSource = readFileSync(
    resolve(
      process.cwd(),
      "src/features/litters/litter-group-reservation-document-batch-action-core.ts",
    ),
    "utf8",
  );
  expect(coreSource).not.toContain("redirect(");
  expect(coreSource).not.toContain("URLSearchParams");
  expect(coreSource).not.toContain("/reservations/");
});

test("la Server Action réelle délègue au core avec l'adaptateur serveur", async () => {
  const actionSource = readFileSync(
    resolve(
      process.cwd(),
      "src/features/litters/litter-group-reservation-document-batch-action.ts",
    ),
    "utf8",
  );
  expect(actionSource).toMatch(/^"use server";/);
  expect(actionSource).toContain(
    'from "@/features/documents/litter-group-reservation-document-batch"',
  );
  expect(actionSource).toContain("generateLitterGroupReservationDocumentsBatchActionCore(");
  expect(actionSource).toContain(
    "generateBatch: generateLitterGroupReservationDocumentsBatch",
  );
  expect(actionSource).toContain("revalidatePath,");
  expect(actionSource).not.toContain("formData.get(");
  expect(actionSource).not.toContain("redirect(");

  const adapterSource = readFileSync(
    resolve(
      process.cwd(),
      "src/features/documents/litter-group-reservation-document-batch.ts",
    ),
    "utf8",
  );
  expect(adapterSource).toMatch(/^import "server-only";/);
  expect(adapterSource).toContain("generateLitterGroupReservationDocumentsBatchCore(");
  expect(adapterSource).toContain("supabase ?? (await createClient())");
});
