import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { PublicQuestionnaireDefinition } from "./public-model";
import type { PostAdoptionResultsReadRow } from "./results-model";

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

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapResultsReadRow(value: unknown): PostAdoptionResultsReadRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !row.litter_id ||
    !row.litter_name ||
    !row.litter_date ||
    !row.reservation_id ||
    !row.animal_id ||
    !row.animal_name
  ) return null;
  const milestone = row.milestone === "t1" || row.milestone === "t2"
    ? row.milestone
    : null;
  return {
    litterId: String(row.litter_id),
    litterName: String(row.litter_name),
    litterDate: String(row.litter_date),
    reservationId: String(row.reservation_id),
    reservationLitterId: nullableString(row.reservation_litter_id),
    animalId: String(row.animal_id),
    animalLitterId: nullableString(row.animal_litter_id),
    animalName: String(row.animal_name),
    animalBirthDate: nullableString(row.animal_birth_date),
    animalSex: nullableString(row.animal_sex),
    instanceId: nullableString(row.instance_id),
    milestone,
    questionnaireCode: nullableString(row.questionnaire_code),
    questionnaireVersion: nullableFiniteNumber(row.questionnaire_version),
    instanceStatus: nullableString(row.instance_status),
    dueAt: nullableString(row.due_at),
    responseDeadlineAt: nullableString(row.response_deadline_at),
    latestRevisionNo: nullableFiniteNumber(row.latest_revision_no),
    latestSubmittedAt: nullableString(row.latest_submitted_at),
    latestAnswers: (row.latest_answers ?? row.latest_structured_answers) &&
      typeof (row.latest_answers ?? row.latest_structured_answers) === "object" &&
      !Array.isArray(row.latest_answers ?? row.latest_structured_answers)
      ? (row.latest_answers ?? row.latest_structured_answers) as Record<string, unknown>
      : null,
    definition: row.definition && typeof row.definition === "object" && !Array.isArray(row.definition)
      ? row.definition
      : null,
    definitionValid: typeof row.definition_valid === "boolean" ? row.definition_valid : null,
  };
}

async function readResultsRows(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
) {
  const result = await rpc(client).rpc(functionName, args);
  if (result.error || !Array.isArray(result.data)) return null;
  const rows = result.data.map(mapResultsReadRow);
  return rows.every((row): row is PostAdoptionResultsReadRow => row !== null)
    ? rows
    : null;
}

export async function listPostAdoptionResultsRows(
  organizationId: string,
  litterId: string | null = null,
  suppliedClient?: SupabaseClient,
) {
  const client = suppliedClient ?? (await createClient());
  return readResultsRows(
    client,
    "list_post_adoption_results_for_organization",
    { p_organization_id: organizationId, p_litter_id: litterId },
  );
}

export async function readPostAdoptionIndividualResultsRows(
  animalId: string,
  suppliedClient?: SupabaseClient,
) {
  const client = suppliedClient ?? (await createClient());
  return readResultsRows(
    client,
    "read_post_adoption_questionnaire_individual_results",
    { p_animal_id: animalId },
  );
}

export async function readPostAdoptionCollectiveResultsRows(
  litterId: string,
  suppliedClient?: SupabaseClient,
) {
  const client = suppliedClient ?? (await createClient());
  return readResultsRows(
    client,
    "read_post_adoption_questionnaire_collective_results",
    { p_litter_id: litterId },
  );
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
