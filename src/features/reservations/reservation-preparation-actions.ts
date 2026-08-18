"use server";

import { revalidatePath } from "next/cache";

import { sendBirthDocumentsDepositEmailForReservation } from "@/features/communications/birth-documents-deposit-email";
import {
  confirmReservationPreparationActionCore,
  type ReservationPreparationActionState,
} from "@/features/reservations/reservation-preparation-action-core";
import { loadReservationPreparation } from "@/features/reservations/reservation-preparation-data";

export async function confirmReservationPreparation(
  previousState: ReservationPreparationActionState,
  formData: FormData,
) {
  return confirmReservationPreparationActionCore(previousState, formData, {
    loadPreparation: loadReservationPreparation,
    send: sendBirthDocumentsDepositEmailForReservation,
    revalidate: revalidatePath,
  });
}
