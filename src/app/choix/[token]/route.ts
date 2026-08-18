import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";
import {
  hashChoiceAppointmentToken,
  isChoiceAppointmentToken,
} from "@/features/communications/choice-appointment-email";
import {
  CHOICE_APPOINTMENT_SESSION_COOKIE,
  exchangeChoiceAppointmentToken,
  hashChoiceAppointmentSession,
} from "@/features/reservations/choice-appointment-public-service";

export const dynamic = "force-dynamic";

function unavailable() {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/choix/indisponible",
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isChoiceAppointmentToken(token)) return unavailable();
  const tokenHash = hashChoiceAppointmentToken(token);
  const trustedForwardedFor = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for")
    : null;
  const clientAddress = trustedForwardedFor?.split(",")[0]?.trim();
  const checks = [
    allowPublicQuestionnaireRequest("choice-appointment:open:global", 240),
    allowPublicQuestionnaireRequest(`choice-appointment:open:token:${tokenHash}`, 12),
  ];
  if (clientAddress) {
    checks.push(
      allowPublicQuestionnaireRequest(
        `choice-appointment:open:client:${clientAddress}`,
        30,
      ),
    );
  }
  if ((await Promise.all(checks)).some((allowed) => !allowed)) return unavailable();
  const sessionToken = randomBytes(32).toString("base64url");
  const exchanged = await exchangeChoiceAppointmentToken({
    tokenHash,
    sessionHash: hashChoiceAppointmentSession(sessionToken),
  }).catch(() => null);
  if (!exchanged) return unavailable();
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/choix/rendez-vous",
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
  response.cookies.set(CHOICE_APPOINTMENT_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/choix",
    expires: new Date(exchanged.sessionExpiresAt),
  });
  return response;
}
