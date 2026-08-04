import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { PublicQuestionnaireDefinition } from "./public-model";

export const POST_ADOPTION_PUBLIC_SESSION_COOKIE = "post_adoption_questionnaire_session";

export type PublicQuestionnaireSession = {
  outcome: "success";
  sessionExpiresAt: string;
  animalName: string;
  milestone: string;
  questionnaireTitle: string;
  definition: PublicQuestionnaireDefinition;
  instanceStatus: "invited" | "in_progress" | "submitted" | "under_review" | "validated" | "expired";
  responseDeadlineAt: string;
  publicReadUntil: string;
  latestRevisionNo: number | null;
  latestSubmittedAt: string | null;
};

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

type SessionRow = {
  outcome?: string;
  session_created_at?: string;
  session_expires_at?: string;
  animal_name?: string;
  milestone?: string;
  questionnaire_title?: string;
  definition?: unknown;
  instance_status?: string;
  response_deadline_at?: string;
  public_read_until?: string;
  latest_revision_no?: number | null;
  latest_submitted_at?: string | null;
};

function rpcClient(client?: SupabaseClient) {
  return (client ?? createServiceRoleClient()) as unknown as RpcClient;
}

function firstRow(data: unknown): SessionRow | null {
  if (Array.isArray(data)) return (data[0] as SessionRow | undefined) ?? null;
  return data && typeof data === "object" ? (data as SessionRow) : null;
}

function mapSession(row: SessionRow | null): PublicQuestionnaireSession | null {
  if (
    row?.outcome !== "success" ||
    !row.session_expires_at ||
    !row.animal_name ||
    !row.milestone ||
    !row.questionnaire_title ||
    !row.definition ||
    !row.instance_status ||
    !row.response_deadline_at ||
    !row.public_read_until
  ) {
    return null;
  }
  return {
    outcome: "success",
    sessionExpiresAt: row.session_expires_at,
    animalName: row.animal_name,
    milestone: row.milestone,
    questionnaireTitle: row.questionnaire_title,
    definition: row.definition as PublicQuestionnaireDefinition,
    instanceStatus: row.instance_status as PublicQuestionnaireSession["instanceStatus"],
    responseDeadlineAt: row.response_deadline_at,
    publicReadUntil: row.public_read_until,
    latestRevisionNo: row.latest_revision_no ?? null,
    latestSubmittedAt: row.latest_submitted_at ?? null,
  };
}

export async function exchangePublicQuestionnaireToken(input: {
  tokenHash: string;
  sessionHash: string;
  client?: SupabaseClient;
}) {
  const result = await rpcClient(input.client).rpc(
    "exchange_post_adoption_questionnaire_public_token",
    { p_token_hash: input.tokenHash, p_session_hash: input.sessionHash },
  );
  if (result.error) return null;
  const row = firstRow(result.data);
  const session = mapSession(row);
  return session && row?.session_created_at
    ? { session, sessionCreatedAt: row.session_created_at }
    : null;
}

export async function readPublicQuestionnaireSession(input: {
  sessionHash: string;
  client?: SupabaseClient;
}) {
  const result = await rpcClient(input.client).rpc(
    "read_post_adoption_questionnaire_public_session",
    { p_session_hash: input.sessionHash },
  );
  return result.error ? null : mapSession(firstRow(result.data));
}

export async function submitPublicQuestionnaireResponse(input: {
  sessionHash: string;
  clientCommandId: string;
  payloadHash: string;
  baseRevisionNo: number;
  answers: Record<string, unknown>;
  completionStartedAt: string | null;
  completionDurationSeconds: number | null;
  client?: SupabaseClient;
}) {
  const result = await rpcClient(input.client).rpc(
    "submit_post_adoption_questionnaire_public_response",
    {
      p_session_hash: input.sessionHash,
      p_client_command_id: input.clientCommandId,
      p_payload_hash: input.payloadHash,
      p_base_revision_no: input.baseRevisionNo,
      p_answers: input.answers,
      p_completion_started_at: input.completionStartedAt,
      p_completion_duration_seconds: input.completionDurationSeconds,
    },
  );
  if (result.error) return null;
  const row = firstRow(result.data) as (SessionRow & {
    revision_no?: number;
    submitted_at?: string;
    replayed?: boolean;
  }) | null;
  if (!row?.outcome) return null;
  return {
    outcome: row.outcome,
    revisionNo: row.revision_no ?? null,
    submittedAt: row.submitted_at ?? null,
    replayed: row.replayed === true,
  };
}

export async function readPublicQuestionnaireSubmissionResult(input: {
  sessionHash: string;
  clientCommandId: string;
  client?: SupabaseClient;
}) {
  const result = await rpcClient(input.client).rpc(
    "read_post_adoption_questionnaire_public_submission_result",
    {
      p_session_hash: input.sessionHash,
      p_client_command_id: input.clientCommandId,
    },
  );
  if (result.error) return null;
  const row = firstRow(result.data) as (SessionRow & {
    revision_no?: number;
    submitted_at?: string;
  }) | null;
  return row?.outcome
    ? {
        outcome: row.outcome,
        revisionNo: row.revision_no ?? null,
        submittedAt: row.submitted_at ?? null,
      }
    : null;
}
