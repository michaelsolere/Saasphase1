"use server";

import { revalidatePath } from "next/cache";

import { generateLitterGroupReservationDocumentsBatch } from "@/features/documents/litter-group-reservation-document-batch";
import {
  generateLitterGroupReservationDocumentsBatchActionCore,
  type LitterGroupReservationDocumentBatchActionState,
  type LitterGroupReservationDocumentBatchIntention,
} from "@/features/litters/litter-group-reservation-document-batch-action-core";

export async function generateLitterGroupReservationDocumentsBatchAction(
  intention: LitterGroupReservationDocumentBatchIntention,
  previousState: LitterGroupReservationDocumentBatchActionState,
  formData: FormData,
): Promise<LitterGroupReservationDocumentBatchActionState> {
  return generateLitterGroupReservationDocumentsBatchActionCore(
    intention,
    previousState,
    formData,
    {
      generateBatch: generateLitterGroupReservationDocumentsBatch,
      revalidatePath,
    },
  );
}
