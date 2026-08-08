import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";
import {
  ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE,
  exchangeAdopterProfileToken,
} from "@/features/adopter-profile-questionnaire/public-service";
import {
  hashAdopterProfileQuestionnaireToken,
  isAdopterProfileQuestionnaireTokenFormat,
} from "@/features/adopter-profile-questionnaire/public-token";

export const dynamic = "force-dynamic";

function redirect(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAdopterProfileQuestionnaireTokenFormat(token)) return redirect("/profil-adoptant/indisponible");
  const tokenHash = hashAdopterProfileQuestionnaireToken(token);
  const trustedForwardedFor = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for")
    : null;
  const clientAddress = trustedForwardedFor?.split(",")[0]?.trim();
  const checks = [
    allowPublicQuestionnaireRequest("adopter-profile:open:global", 240),
    allowPublicQuestionnaireRequest(`adopter-profile:open:token:${tokenHash}`, 12),
  ];
  if (clientAddress) checks.push(allowPublicQuestionnaireRequest(`adopter-profile:open:client:${clientAddress}`, 30));
  if ((await Promise.all(checks)).some((allowed) => !allowed)) return redirect("/profil-adoptant/indisponible");

  const sessionToken = randomBytes(32).toString("base64url");
  const sessionHash = createHash("sha256").update(sessionToken, "utf8").digest("hex");
  const exchanged = await exchangeAdopterProfileToken({ tokenHash, sessionHash }).catch(() => null);
  if (!exchanged) return redirect("/profil-adoptant/indisponible");
  const response = redirect("/profil-adoptant/questionnaire");
  response.cookies.set(ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(exchanged.sessionExpiresAt),
  });
  return response;
}
