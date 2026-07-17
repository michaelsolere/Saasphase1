import type {
  LitterReservationDocumentBatchInput,
  LitterReservationDocumentBatchResult,
} from "@/features/documents/litter-reservation-document-batch-core";
import { z } from "zod";

const UUID_SCHEMA = z.string().uuid();
const ISO_WITH_TIMEZONE_SCHEMA = z.string().datetime({ offset: true });
const MAX_RESERVATIONS = 30;

export type LitterReservationDocumentBatchIntention = {
  litterId: string;
  operationId: string;
  capturedAt: string;
};

export type LitterReservationDocumentBatchActionState =
  | { status: "idle" }
  | { status: "confirmation_required" }
  | { status: "no_selection" }
  | { status: "invalid_input" }
  | {
      status: "completed";
      result: LitterReservationDocumentBatchResult;
    };

export const initialLitterReservationDocumentBatchActionState = {
  status: "idle",
} satisfies LitterReservationDocumentBatchActionState;

export type LitterReservationDocumentBatchActionDependencies = {
  generateBatch: (
    input: LitterReservationDocumentBatchInput,
  ) => Promise<LitterReservationDocumentBatchResult>;
  revalidatePath: (path: string) => void;
};

function isUuid(value: unknown): value is string {
  return UUID_SCHEMA.safeParse(value).success;
}

function isIsoDateTimeWithTimezone(value: unknown): value is string {
  return ISO_WITH_TIMEZONE_SCHEMA.safeParse(value).success;
}

function isValidIntention(
  intention: LitterReservationDocumentBatchIntention,
): boolean {
  return (
    isUuid(intention?.litterId) &&
    isUuid(intention?.operationId) &&
    isIsoDateTimeWithTimezone(intention?.capturedAt)
  );
}

export async function generateLitterReservationDocumentsBatchActionCore(
  intention: LitterReservationDocumentBatchIntention,
  _previousState: LitterReservationDocumentBatchActionState,
  formData: FormData,
  dependencies: LitterReservationDocumentBatchActionDependencies,
): Promise<LitterReservationDocumentBatchActionState> {
  if (!isValidIntention(intention)) return { status: "invalid_input" };

  if (formData.get("batch_confirmation") !== "confirmed") {
    return { status: "confirmation_required" };
  }

  const reservationIds = formData.getAll("reservation_ids[]");
  if (reservationIds.length === 0) return { status: "no_selection" };
  if (
    reservationIds.length > MAX_RESERVATIONS ||
    reservationIds.some((reservationId) => typeof reservationId !== "string")
  ) {
    return { status: "invalid_input" };
  }

  const commitmentTemplateId = formData.get("commitment_template_id");
  const contractTemplateId = formData.get("contract_template_id");
  if (!isUuid(commitmentTemplateId) || !isUuid(contractTemplateId)) {
    return { status: "invalid_input" };
  }

  const result = await dependencies.generateBatch({
    litterId: intention.litterId,
    operationId: intention.operationId,
    capturedAt: intention.capturedAt,
    reservationIds: reservationIds as string[],
    commitmentTemplateId,
    contractTemplateId,
  });

  if (result.status === "success" || result.status === "partial") {
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    dependencies.revalidatePath("/reservations");
    dependencies.revalidatePath("/documents");
  }

  return { status: "completed", result };
}
