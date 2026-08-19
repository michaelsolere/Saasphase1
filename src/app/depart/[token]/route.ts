import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { hashDepartureToken, isDepartureToken } from "@/features/communications/departure-appointment-email";
import { DEPARTURE_SESSION_COOKIE, exchangeDepartureToken, hashDepartureSession } from "@/features/departures/departure-public-service";
import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";

export const dynamic = "force-dynamic";
const unavailable = () => new NextResponse(null, { status: 303, headers: { Location: "/depart/indisponible", "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isDepartureToken(token)) return unavailable();
  const tokenHash = hashDepartureToken(token);
  const client = process.env.VERCEL === "1" ? (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for"))?.split(",")[0]?.trim() : null;
  const checks = [allowPublicQuestionnaireRequest("departure:open:global", 240), allowPublicQuestionnaireRequest(`departure:open:token:${tokenHash}`, 12)];
  if (client) checks.push(allowPublicQuestionnaireRequest(`departure:open:client:${client}`, 30));
  if ((await Promise.all(checks)).some((allowed) => !allowed)) return unavailable();
  const sessionToken = randomBytes(32).toString("base64url");
  const exchanged = await exchangeDepartureToken(tokenHash, hashDepartureSession(sessionToken)).catch(() => null);
  if (!exchanged) return unavailable();
  const response = new NextResponse(null, { status: 303, headers: { Location: "/depart/rendez-vous", "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
  response.cookies.set(DEPARTURE_SESSION_COOKIE, sessionToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/depart", expires: new Date(exchanged.sessionExpiresAt) });
  return response;
}
