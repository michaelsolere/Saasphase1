"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  generateAndStoreReservationDocumentPdf,
  type GenerateAndStoreReservationDocumentPdfInput,
} from "@/features/documents/generated-reservation-document-orchestrator";

export type ReservationDocumentGenerationIntention = Omit<
  GenerateAndStoreReservationDocumentPdfInput,
  "templateId"
>;

function redirectPath(
  reservationId: string,
  status: "created" | "existing" | "error" | "missing_data",
) {
  return `/reservations/${reservationId}?document_generation_status=${status}#documents`;
}

export async function generateReservationDocumentPdf(
  intention: ReservationDocumentGenerationIntention,
  formData: FormData,
) {
  const templateId = formData.get("template_id");

  if (typeof templateId !== "string") {
    redirect(redirectPath(intention.reservationId, "error"));
  }

  const result = await generateAndStoreReservationDocumentPdf({
    ...intention,
    templateId,
  });

  if (result.outcome === "error") {
    if (
      result.error.stage === "render" &&
      result.error.code === "missing_template_variables"
    ) {
      redirect(redirectPath(intention.reservationId, "missing_data"));
    }
    redirect(redirectPath(intention.reservationId, "error"));
  }

  revalidatePath(`/reservations/${intention.reservationId}`);
  revalidatePath("/reservations");
  revalidatePath("/documents");

  redirect(redirectPath(intention.reservationId, result.outcome));
}
