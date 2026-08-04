import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

export function hashPublicQuestionnaireRateBucket(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export async function allowPublicQuestionnaireRequest(
  key: string,
  maxAttempts = 12,
  windowSeconds = 60,
) {
  const client = createServiceRoleClient() as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc(
    "allow_post_adoption_questionnaire_public_request",
    {
      p_bucket_hash: hashPublicQuestionnaireRateBucket(key),
      p_max_attempts: maxAttempts,
      p_window_seconds: windowSeconds,
    },
  );
  if (error) return false;
  return data === true;
}
