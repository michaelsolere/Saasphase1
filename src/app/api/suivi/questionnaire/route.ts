import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { allowPublicQuestionnaireRequest } from "@/features/post-adoption-questionnaire/public-rate-limit";
import { parsePublicQuestionnaireSubmission } from "@/features/post-adoption-questionnaire/public-request";
import {
  POST_ADOPTION_PUBLIC_SESSION_COOKIE,
  submitPublicQuestionnaireResponse,
} from "@/features/post-adoption-questionnaire/public-service";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

async function readBoundedJson(request: Request, limit: number) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host");
  if (origin) {
    try {
      if (!requestHost || new URL(origin).host !== requestHost) {
        return json({ outcome: "unavailable" }, 403);
      }
    } catch {
      return json({ outcome: "unavailable" }, 403);
    }
  }
  if (Number(request.headers.get("content-length") ?? 0) > 128 * 1024) {
    return json({ outcome: "invalid" }, 413);
  }
  const sessionToken = (await cookies()).get(
    POST_ADOPTION_PUBLIC_SESSION_COOKIE,
  )?.value;
  if (!sessionToken) return json({ outcome: "unavailable" }, 401);

  const sessionHash = createHash("sha256")
    .update(sessionToken, "utf8")
    .digest("hex");
  if (!(await allowPublicQuestionnaireRequest(`submit:${sessionHash}`))) {
    return json({ outcome: "rate_limited" }, 429);
  }

  const parsed = parsePublicQuestionnaireSubmission(
    await readBoundedJson(request, 128 * 1024),
  );
  if (!parsed.ok) return json({ outcome: "invalid" }, 400);

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(parsed.value.answers), "utf8")
    .digest("hex");
  const result = await submitPublicQuestionnaireResponse({
    sessionHash,
    payloadHash,
    ...parsed.value,
  }).catch(() => null);
  if (!result) return json({ outcome: "uncertain" }, 503);
  const status =
    result.outcome === "success"
      ? 200
      : result.outcome === "conflict"
        ? 409
        : result.outcome === "invalid"
          ? 400
          : 410;
  return json(result, status);
}
