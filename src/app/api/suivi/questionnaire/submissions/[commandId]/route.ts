import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";
import {
  POST_ADOPTION_PUBLIC_SESSION_COOKIE,
  readPublicQuestionnaireSubmissionResult,
} from "@/features/post-adoption-questionnaire/public-service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ commandId: string }> },
) {
  const { commandId } = await params;
  const sessionToken = (await cookies()).get(POST_ADOPTION_PUBLIC_SESSION_COOKIE)?.value;
  if (!sessionToken || !UUID.test(commandId)) {
    return NextResponse.json({ outcome: "unavailable" }, { status: 404, headers });
  }
  const sessionHash = createHash("sha256").update(sessionToken, "utf8").digest("hex");
  if (!(await allowPublicQuestionnaireRequest(`command:${sessionHash}`))) {
    return NextResponse.json({ outcome: "rate_limited" }, { status: 429, headers });
  }
  const result = await readPublicQuestionnaireSubmissionResult({
    sessionHash,
    clientCommandId: commandId,
  }).catch(() => null);
  return NextResponse.json(result ?? { outcome: "uncertain" }, {
    status: result?.outcome === "success" ? 200 : result?.outcome === "not_found" ? 404 : 503,
    headers,
  });
}
