import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  createLitterCareTaskCore,
  listLitterCareTaskTemplatesCore,
  listLitterCareTasksForLitterCore,
  resolveLitterCareTaskCore,
} from "./litter-care-tasks-core";

type Supabase = SupabaseClient<Database>;

export type {
  CreateLitterCareTaskInput,
  CreateLitterCareTaskResult,
  LitterCareTaskAnchorType,
  LitterCareTaskCategory,
  LitterCareTaskResolutionStatus,
  LitterCareTaskServiceError,
  LitterCareTaskServiceErrorCode,
  LitterCareTaskSummary,
  LitterCareTaskTargetScope,
  LitterCareTaskTemplateSummary,
  ListLitterCareTaskTemplatesInput,
  ListLitterCareTaskTemplatesResult,
  ListLitterCareTasksForLitterInput,
  ListLitterCareTasksForLitterResult,
  ResolveLitterCareTaskInput,
  ResolveLitterCareTaskResult,
} from "./litter-care-tasks-core";

export {
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_RESOLUTION_STATUSES,
  LITTER_CARE_TASK_TARGET_SCOPES,
} from "./litter-care-tasks-core";

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function listLitterCareTaskTemplates(
  input: Parameters<typeof listLitterCareTaskTemplatesCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterCareTaskTemplatesCore(input, await serverClient(suppliedClient));
}

export async function listLitterCareTasksForLitter(
  input: Parameters<typeof listLitterCareTasksForLitterCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterCareTasksForLitterCore(input, await serverClient(suppliedClient));
}

export async function createLitterCareTask(
  input: Parameters<typeof createLitterCareTaskCore>[0],
  suppliedClient?: Supabase,
) {
  return createLitterCareTaskCore(input, await serverClient(suppliedClient));
}

export async function resolveLitterCareTask(
  input: Parameters<typeof resolveLitterCareTaskCore>[0],
  suppliedClient?: Supabase,
) {
  return resolveLitterCareTaskCore(input, await serverClient(suppliedClient));
}
