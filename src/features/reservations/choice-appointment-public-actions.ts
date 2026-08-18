"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  CHOICE_APPOINTMENT_SESSION_COOKIE,
  respondChoiceAppointmentSession,
} from "@/features/reservations/choice-appointment-public-service";

export async function respondChoiceAppointment(formData: FormData) {
  const response = formData.get("response_kind");
  if (response !== "in_person" && response !== "video" && response !== "prechoice") {
    redirect("/choix/indisponible");
  }
  const sessionToken = (await cookies()).get(CHOICE_APPOINTMENT_SESSION_COOKIE)?.value;
  if (!sessionToken) redirect("/choix/indisponible");
  const result = await respondChoiceAppointmentSession({
    sessionToken,
    responseKind: response,
    clientCommandId: randomUUID(),
  });
  if (!result) redirect("/choix/indisponible");
  redirect(`/choix/rendez-vous?confirmation=${response}`);
}
