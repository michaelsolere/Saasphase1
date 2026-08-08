import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { validateAdopterProfileAnswers } from "@/features/adopter-profile-questionnaire/definition";
import { parseAdopterProfilePublicCommand } from "@/features/adopter-profile-questionnaire/public-request";
import {
  ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE,
  readAdopterProfileSession,
  saveAdopterProfileDraft,
  submitAdopterProfileFinal,
} from "@/features/adopter-profile-questionnaire/public-service";
import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";

export const dynamic = "force-dynamic";

function headers() {
  return { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
}

export async function POST(request: Request) {
  const token = (await cookies()).get(ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unavailable" }, { status: 401, headers: headers() });
  const sessionHash = createHash("sha256").update(token, "utf8").digest("hex");
  if (!(await allowPublicQuestionnaireRequest(`adopter-profile:command:${sessionHash}`, 120))) {
    return NextResponse.json({ error: "unavailable" }, { status: 429, headers: headers() });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: headers() });
  }
  const parsed = parseAdopterProfilePublicCommand(body);
  if (!parsed.ok) return NextResponse.json({ error: "invalid" }, { status: 400, headers: headers() });
  const session = await readAdopterProfileSession({ sessionHash });
  if (!session) return NextResponse.json({ error: "unavailable" }, { status: 401, headers: headers() });

  const errors = validateAdopterProfileAnswers(
    session.definition,
    parsed.value.answers,
    { relevantLitters: session.relevantLitters },
    parsed.value.mode === "draft" ? "draft" : "complete",
  );
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation", fields: errors }, { status: 422, headers: headers() });
  }

  if (parsed.value.mode === "submit") {
    const result = await submitAdopterProfileFinal({
      sessionHash,
      expectedRevision: parsed.value.expectedRevision,
      answers: parsed.value.answers,
      clientCommandId: parsed.value.clientCommandId,
    });
    if (!result) return NextResponse.json({ error: "unavailable" }, { status: 500, headers: headers() });
    return NextResponse.json(result, { status: result.outcome === "conflict" ? 409 : 200, headers: headers() });
  }

  const result = await saveAdopterProfileDraft({
    sessionHash,
    expectedRevision: parsed.value.expectedRevision,
    answers: parsed.value.answers,
    clientCommandId: parsed.value.clientCommandId,
  });
  if (!result) return NextResponse.json({ error: "unavailable" }, { status: 500, headers: headers() });
  return NextResponse.json(result, { status: result.outcome === "conflict" ? 409 : 200, headers: headers() });
}
