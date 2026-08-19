"use server";


import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { sendDepartureAppointmentEmail } from "@/features/communications/departure-appointment-email";
import { DEPARTURE_SESSION_COOKIE, bookDepartureSession, departureDeliveryContextForSession, departurePublicCommandId, declineDepartureSession } from "@/features/departures/departure-public-service";

export async function bookDepartureAppointment(formData: FormData) {
  const slotId = formData.get("slot_id");
  const token = (await cookies()).get(DEPARTURE_SESSION_COOKIE)?.value;
  if (!token || typeof slotId !== "string" || !/^[0-9a-f-]{36}$/i.test(slotId)) redirect("/depart/indisponible");
  const result = await bookDepartureSession(token, slotId, departurePublicCommandId(token, "book", slotId));
  if (!result) redirect("/depart/indisponible");
  if (result.outcome !== "booked") redirect(`/depart/rendez-vous?conflit=${encodeURIComponent(result.reason ?? "slot_unavailable")}`);
  const context = await departureDeliveryContextForSession(token);
  if (context) {
    await sendDepartureAppointmentEmail(context.accessId, "booking_confirmation", {
      systemActorUserId: context.actorUserId,
    }).catch(() => null);
  }
  redirect("/depart/rendez-vous?confirmation=booked");
}

export async function declineDepartureAppointment() {
  const token = (await cookies()).get(DEPARTURE_SESSION_COOKIE)?.value;
  if (!token) redirect("/depart/indisponible");
  const result = await declineDepartureSession(token, departurePublicCommandId(token, "decline", "none_fit"));
  if (!result || result.outcome !== "recorded") redirect("/depart/indisponible");
  redirect("/depart/rendez-vous?confirmation=none_fit");
}
