import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { PublicQuestionnaireDefinition } from "./public-model";

export type PublicAccessSummary = {
  instanceId: string;
  questionnaireCode: string;
  milestone: "t1" | "t2";
  instanceStatus: string;
  dueAt: string;
  responseDeadlineAt: string | null;
  accessId: string | null;
  tokenHint: string | null;
  activatedAt: string | null;
  publicReadUntil: string | null;
  revokedAt: string | null;
  latestRevisionNo: number | null;
  latestSubmittedAt: string | null;
  latestAnswers: Record<string, unknown> | null;
  definition: PublicQuestionnaireDefinition;
};

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult> };

function rpc(client: SupabaseClient) {
  return client as unknown as RpcClient;
}

export async function listPublicAccessSummaries(
  reservationId: string,
  suppliedClient?: SupabaseClient,
) {
  const client = suppliedClient ?? (await createClient());
  const result = await rpc(client).rpc(
    "list_post_adoption_questionnaire_public_access_summary",
    { p_reservation_id: reservationId },
  );
  if (result.error || !Array.isArray(result.data)) return null;
  return result.data.map((value) => {
    const row = value as Record<string, unknown>;
    return {
      instanceId: String(row.instance_id),
      questionnaireCode: String(row.questionnaire_code),
      milestone: row.milestone as "t1" | "t2",
      instanceStatus: String(row.instance_status),
      dueAt: String(row.due_at),
      responseDeadlineAt: row.response_deadline_at ? String(row.response_deadline_at) : null,
      accessId: row.access_id ? String(row.access_id) : null,
      tokenHint: row.token_hint ? String(row.token_hint) : null,
      activatedAt: row.activated_at ? String(row.activated_at) : null,
      publicReadUntil: row.public_read_until ? String(row.public_read_until) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      latestRevisionNo: row.latest_revision_no === null ? null : Number(row.latest_revision_no),
      latestSubmittedAt: row.latest_submitted_at ? String(row.latest_submitted_at) : null,
      latestAnswers: row.latest_answers && typeof row.latest_answers === "object" ? row.latest_answers as Record<string, unknown> : null,
      definition: row.definition as PublicQuestionnaireDefinition,
    } satisfies PublicAccessSummary;
  });
}

export async function createOrRotatePublicAccess(input: {
  instanceId: string;
  tokenHash: string;
  tokenHint: string;
  suppliedClient?: SupabaseClient;
}) {
  const client = input.suppliedClient ?? (await createClient());
  const result = await rpc(client).rpc(
    "create_or_rotate_post_adoption_questionnaire_public_access",
    {
      p_instance_id: input.instanceId,
      p_token_hash: input.tokenHash,
      p_token_hint: input.tokenHint,
    },
  );
  if (result.error || !Array.isArray(result.data)) return null;
  return (result.data[0] as Record<string, unknown> | undefined) ?? null;
}

export async function revokePublicAccess(input: {
  instanceId: string;
  suppliedClient?: SupabaseClient;
}) {
  const client = input.suppliedClient ?? (await createClient());
  const result = await rpc(client).rpc(
    "revoke_post_adoption_questionnaire_public_access",
    { p_instance_id: input.instanceId },
  );
  if (result.error || !Array.isArray(result.data)) return null;
  return (result.data[0] as Record<string, unknown> | undefined) ?? null;
}
