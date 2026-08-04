import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";
import {
  exchangePublicQuestionnaireToken,
  POST_ADOPTION_PUBLIC_SESSION_COOKIE,
} from "@/features/post-adoption-questionnaire/public-service";
import {
  hashPostAdoptionQuestionnaireToken,
  isPostAdoptionQuestionnaireTokenFormat,
} from "@/features/post-adoption-questionnaire/public-token";

export const dynamic = "force-dynamic";

function redirectPath(path: string) {
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

function unavailable() {
  return redirectPath("/suivi/indisponible");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isPostAdoptionQuestionnaireTokenFormat(token)) return unavailable();

  const tokenHash = hashPostAdoptionQuestionnaireToken(token);
  const trustedForwardedFor = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for")
    : null;
  const clientAddress = trustedForwardedFor?.split(",")[0]?.trim();
  const checks = [
    allowPublicQuestionnaireRequest("open:global", 240),
    allowPublicQuestionnaireRequest(`open:token:${tokenHash}`, 12),
  ];
  if (clientAddress) {
    checks.push(allowPublicQuestionnaireRequest(`open:client:${clientAddress}`, 30));
  }
  if ((await Promise.all(checks)).some((allowed) => !allowed)) return unavailable();

  const sessionToken = randomBytes(32).toString("base64url");
  const sessionHash = createHash("sha256")
    .update(sessionToken, "utf8")
    .digest("hex");
  const exchanged = await exchangePublicQuestionnaireToken({
    tokenHash,
    sessionHash,
  }).catch(() => null);
  if (!exchanged) return unavailable();

  const response = redirectPath("/suivi/questionnaire");
  response.cookies.set(POST_ADOPTION_PUBLIC_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(exchanged.session.sessionExpiresAt),
  });
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
