import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ADOPTER_PROFILE_QUESTIONNAIRE_V1, type AdopterProfileAnswers } from "./definition";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE = "adopter_profile_questionnaire_session";

type Client = SupabaseClient;
type PublicContextRow = {
  instance_id: string;
  family_name: string;
  organization_name: string;
  initial_sex_preference: string;
  relevant_litters_snapshot: unknown;
  due_at: string;
  draft_answers: AdopterProfileAnswers;
  draft_revision: number;
  final_submitted_at: string | null;
  waived_at: string | null;
};

export type AdopterProfilePublicSession = {
  instanceId: string;
  familyName: string;
  organizationName: string;
  initialSexPreference: string;
  relevantLitters: Array<{ id: string; label: string }>;
  dueAt: string;
  draftAnswers: AdopterProfileAnswers;
  draftRevision: number;
  finalSubmittedAt: string | null;
  waivedAt: string | null;
  definition: typeof ADOPTER_PROFILE_QUESTIONNAIRE_V1;
};

function client(input?: SupabaseClient) {
  return (input ?? createServiceRoleClient()) as unknown as Client;
}

function firstRow<T>(data: unknown) {
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

function validLitters(value: unknown): Array<{ id: string; label: string }> {
  return Array.isArray(value)
    ? value.filter((item): item is { id: string; label: string } =>
      Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.label === "string"))
    : [];
}

export async function exchangeAdopterProfileToken(input: {
  tokenHash: string;
  sessionHash: string;
  client?: SupabaseClient;
}) {
  const result = await client(input.client).rpc("exchange_adopter_profile_questionnaire_token", {
    p_token_hash: input.tokenHash,
    p_session_hash: input.sessionHash,
  });
  if (result.error) return null;
  const row = firstRow<{ outcome?: string; session_expires_at?: string }>(result.data);
  return row?.outcome === "success" && row.session_expires_at
    ? { sessionExpiresAt: row.session_expires_at }
    : null;
}

export async function readAdopterProfileSession(input: {
  sessionHash: string;
  client?: SupabaseClient;
}): Promise<AdopterProfilePublicSession | null> {
  const supabase = client(input.client);
  const result = await supabase.rpc("read_adopter_profile_questionnaire_public_context", {
    p_session_hash: input.sessionHash,
  });
  if (result.error) return null;
  const instance = firstRow<PublicContextRow>(result.data);
  if (!instance) return null;
  return {
    instanceId: instance.instance_id,
    familyName: instance.family_name,
    organizationName: instance.organization_name,
    initialSexPreference: instance.initial_sex_preference,
    relevantLitters: validLitters(instance.relevant_litters_snapshot),
    dueAt: instance.due_at,
    draftAnswers: instance.draft_answers ?? {},
    draftRevision: instance.draft_revision,
    finalSubmittedAt: instance.final_submitted_at,
    waivedAt: instance.waived_at,
    definition: ADOPTER_PROFILE_QUESTIONNAIRE_V1,
  };
}

export async function saveAdopterProfileDraft(input: {
  sessionHash: string;
  expectedRevision: number;
  answers: AdopterProfileAnswers;
  clientCommandId: string;
  client?: SupabaseClient;
}) {
  const result = await client(input.client).rpc("save_adopter_profile_questionnaire_draft", {
    p_session_hash: input.sessionHash,
    p_expected_revision: input.expectedRevision,
    p_answers: input.answers,
    p_client_command_id: input.clientCommandId,
  });
  if (result.error) return null;
  const row = firstRow<{ outcome?: string; revision?: number }>(result.data);
  return row?.outcome ? { outcome: row.outcome, revision: row.revision ?? null } : null;
}

export async function submitAdopterProfileFinal(input: {
  sessionHash: string;
  expectedRevision: number;
  answers: AdopterProfileAnswers;
  clientCommandId: string;
  client?: SupabaseClient;
}) {
  const result = await client(input.client).rpc("submit_adopter_profile_questionnaire", {
    p_session_hash: input.sessionHash,
    p_expected_revision: input.expectedRevision,
    p_answers: input.answers,
    p_client_command_id: input.clientCommandId,
  });
  if (result.error) return null;
  const row = firstRow<{ outcome?: string; submitted_at?: string }>(result.data);
  return row?.outcome ? { outcome: row.outcome, submittedAt: row.submitted_at ?? null } : null;
}
