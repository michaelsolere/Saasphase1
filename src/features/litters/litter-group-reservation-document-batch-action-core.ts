import type {
  LitterGroupReservationDocumentBatchInput,
  LitterGroupReservationDocumentBatchResult,
} from "@/features/documents/litter-group-reservation-document-batch-core";
import { z } from "zod";

const UUID_SCHEMA = z.string().uuid();
const ISO_WITH_TIMEZONE_SCHEMA = z.string().datetime({ offset: true });
const TEMPLATE_SELECTION_SCHEMA = z
  .object({
    taxonomyKey: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => value.trim().length > 0),
    commitmentTemplateId: UUID_SCHEMA,
    contractTemplateId: UUID_SCHEMA,
  })
  .strict();
const MAX_RESERVATIONS = 30;
const MAX_RESERVATION_ID_LENGTH = 100;
const MAX_TEMPLATE_SELECTIONS = 30;
const MAX_TEMPLATE_SELECTION_JSON_LENGTH = 1_000;

export type LitterGroupReservationDocumentBatchIntention = {
  litterGroupId: string;
  operationId: string;
  capturedAt: string;
};

export type LitterGroupReservationDocumentBatchActionState =
  | { status: "idle" }
  | { status: "confirmation_required" }
  | { status: "no_selection" }
  | { status: "invalid_input" }
  | {
      status: "completed";
      result: LitterGroupReservationDocumentBatchResult;
    };

export const initialLitterGroupReservationDocumentBatchActionState = {
  status: "idle",
} satisfies LitterGroupReservationDocumentBatchActionState;

export type LitterGroupReservationDocumentBatchActionDependencies = {
  generateBatch: (
    input: LitterGroupReservationDocumentBatchInput,
  ) => Promise<LitterGroupReservationDocumentBatchResult>;
  revalidatePath: (path: string) => void;
};

function isValidIntention(
  intention: LitterGroupReservationDocumentBatchIntention,
): boolean {
  return (
    UUID_SCHEMA.safeParse(intention?.litterGroupId).success &&
    UUID_SCHEMA.safeParse(intention?.operationId).success &&
    ISO_WITH_TIMEZONE_SCHEMA.safeParse(intention?.capturedAt).success
  );
}

function parseTemplateSelections(formData: FormData) {
  const rawSelections = formData.getAll("taxonomy_template_selections[]");
  if (rawSelections.length > MAX_TEMPLATE_SELECTIONS) return null;

  const selections: LitterGroupReservationDocumentBatchInput["templateSelections"] = [];
  for (const rawSelection of rawSelections) {
    if (
      typeof rawSelection !== "string" ||
      rawSelection.length > MAX_TEMPLATE_SELECTION_JSON_LENGTH
    ) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawSelection);
    } catch {
      return null;
    }
    const selection = TEMPLATE_SELECTION_SCHEMA.safeParse(parsed);
    if (!selection.success) return null;
    selections.push(selection.data);
  }
  return selections;
}

export async function generateLitterGroupReservationDocumentsBatchActionCore(
  intention: LitterGroupReservationDocumentBatchIntention,
  _previousState: LitterGroupReservationDocumentBatchActionState,
  formData: FormData,
  dependencies: LitterGroupReservationDocumentBatchActionDependencies,
): Promise<LitterGroupReservationDocumentBatchActionState> {
  if (!isValidIntention(intention)) return { status: "invalid_input" };

  if (formData.get("batch_confirmation") !== "confirmed") {
    return { status: "confirmation_required" };
  }

  const reservationIds = formData.getAll("reservation_ids[]");
  if (reservationIds.length === 0) return { status: "no_selection" };
  if (
    reservationIds.length > MAX_RESERVATIONS ||
    reservationIds.some(
      (reservationId) =>
        typeof reservationId !== "string" ||
        reservationId.length > MAX_RESERVATION_ID_LENGTH,
    )
  ) {
    return { status: "invalid_input" };
  }

  const templateSelections = parseTemplateSelections(formData);
  if (!templateSelections) return { status: "invalid_input" };

  const result = await dependencies.generateBatch({
    litterGroupId: intention.litterGroupId,
    operationId: intention.operationId,
    capturedAt: intention.capturedAt,
    reservationIds: reservationIds as string[],
    templateSelections,
  });

  if (result.status === "success" || result.status === "partial") {
    dependencies.revalidatePath(`/litter-groups/${intention.litterGroupId}`);
    dependencies.revalidatePath("/reservations");
    dependencies.revalidatePath("/documents");

    const revalidatedLitterIds = new Set<string>();
    for (const litter of result.litters) {
      if (revalidatedLitterIds.has(litter.litterId)) continue;
      revalidatedLitterIds.add(litter.litterId);
      dependencies.revalidatePath(`/litters/${litter.litterId}`);
    }
  }

  return { status: "completed", result };
}
