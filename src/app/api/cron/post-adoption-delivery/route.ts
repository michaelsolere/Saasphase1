import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runPostAdoptionAutomatedDelivery } from "@/features/post-adoption-questionnaire/automated-delivery-service";
import { runAdopterProfileDelivery } from "@/features/adopter-profile-questionnaire/delivery-service";
import { runChoiceAppointmentReminders } from "@/features/communications/choice-appointment-reminder-service";
import { runDepartureReminders } from "@/features/communications/departure-reminder-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.byteLength === suppliedBuffer.byteLength
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [postAdoption, adopterProfile, choiceAppointments, departures] = await Promise.allSettled([
      runPostAdoptionAutomatedDelivery(),
      runAdopterProfileDelivery(),
      runChoiceAppointmentReminders(),
      runDepartureReminders(),
    ]);
    if (
      postAdoption.status === "rejected" &&
      adopterProfile.status === "rejected" &&
      choiceAppointments.status === "rejected" &&
      departures.status === "rejected"
    ) {
      return NextResponse.json({ error: "delivery_runners_failed" }, { status: 500 });
    }
    return NextResponse.json({
      postAdoption: postAdoption.status === "fulfilled" ? postAdoption.value : { error: "post_adoption_delivery_failed" },
      adopterProfile: adopterProfile.status === "fulfilled" ? adopterProfile.value : { error: "adopter_profile_delivery_failed" },
      choiceAppointments: choiceAppointments.status === "fulfilled" ? choiceAppointments.value : { error: "choice_appointment_reminders_failed" },
      departures: departures.status === "fulfilled" ? departures.value : { error: "departure_reminders_failed" },
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "delivery_runner_failed" }, { status: 500 });
  }
}
