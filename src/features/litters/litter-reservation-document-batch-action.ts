"use server";

import { revalidatePath } from "next/cache";

import { generateLitterReservationDocumentsBatch } from "@/features/documents/litter-reservation-document-batch";
import {
  generateLitterReservationDocumentsBatchActionCore,
  type LitterReservationDocumentBatchActionState,
  type LitterReservationDocumentBatchIntention,
} from "@/features/litters/litter-reservation-document-batch-action-core";

export async function generateLitterReservationDocumentsBatchAction(
  intention: LitterReservationDocumentBatchIntention,
  previousState: LitterReservationDocumentBatchActionState,
  formData: FormData,
): Promise<LitterReservationDocumentBatchActionState> {
  return generateLitterReservationDocumentsBatchActionCore(
    intention,
    previousState,
    formData,
    {
      generateBatch: generateLitterReservationDocumentsBatch,
      revalidatePath,
    },
  );
}
