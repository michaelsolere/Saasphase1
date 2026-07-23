import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  createLitterCareTaskCore,
  createLitterCareTaskTemplateCore,
  generateLitterCareTasksFromPlanCore,
  importLitterCareTaskLibraryTemplatesCore,
  listLitterCareTaskLibraryCore,
  listLitterCareTaskTemplatesForOrganizationCore,
  listLitterCareTaskTemplatesCore,
  listLitterCareTasksForLitterCore,
  planLitterCareTaskGenerationCore,
  reapplyLitterCareTaskScheduleSuggestionCore,
  replaceLockedLitterCareTaskPointScheduleCore,
  replaceLockedLitterCareTaskWindowScheduleCore,
  rescheduleLitterCareTaskPointCore,
  rescheduleLitterCareTaskWindowCore,
  resolveLitterCareTaskCore,
  setLitterCareTaskScheduleLockCore,
  setLitterCareTaskTemplateActiveCore,
  updateLitterCareTaskTemplateCore,
} from "./litter-care-tasks-core";

type Supabase = SupabaseClient<Database>;

export type {
  CreateLitterCareTaskInput,
  CreateLitterCareTaskResult,
  CreateLitterCareTaskTemplateInput,
  GenerateLitterCareTasksFromPlanInput,
  GenerateLitterCareTasksFromPlanResult,
  ImportLitterCareTaskLibraryTemplatesInput,
  ImportLitterCareTaskLibraryTemplatesResult,
  LitterCareTaskAnchorType,
  LitterCareTaskCategory,
  LitterCareTaskItemKind,
  LitterCareTaskPriority,
  LitterCareTaskResolutionStatus,
  LitterCareTaskScheduleCommandResult,
  LitterCareTaskScheduleSource,
  LitterCareTaskServiceError,
  LitterCareTaskServiceErrorCode,
  LitterCareTaskGenerationPlanEntry,
  LitterCareTaskGenerationReadyPlanItem,
  LitterCareTaskGenerationState,
  LitterCareTaskGenerationTaskResult,
  LitterCareTaskLibraryImportedVersionSummary,
  LitterCareTaskLibraryImportItemResult,
  LitterCareTaskLibraryPackSummary,
  LitterCareTaskLibrarySelection,
  LitterCareTaskLibraryTemplateSummary,
  LitterCareTaskSummary,
  LitterCareTaskTargetScope,
  LitterCareTaskTemplateSummary,
  LitterCareTaskTemplateMutationResult,
  LitterCareTaskWindowState,
  ListLitterCareTaskTemplatesForOrganizationInput,
  ListLitterCareTaskTemplatesForOrganizationResult,
  ListLitterCareTaskLibraryInput,
  ListLitterCareTaskLibraryResult,
  ListLitterCareTaskTemplatesInput,
  ListLitterCareTaskTemplatesResult,
  ListLitterCareTasksForLitterInput,
  ListLitterCareTasksForLitterResult,
  PlanLitterCareTaskGenerationInput,
  PlanLitterCareTaskGenerationResult,
  ReapplyLitterCareTaskScheduleSuggestionInput,
  RescheduleLitterCareTaskPointInput,
  RescheduleLitterCareTaskWindowInput,
  ResolveLitterCareTaskInput,
  ResolveLitterCareTaskResult,
  SetLitterCareTaskScheduleLockInput,
  SetLitterCareTaskTemplateActiveInput,
  UpdateLitterCareTaskTemplateInput,
} from "./litter-care-tasks-core";

export {
  LITTER_CARE_TASK_ANCHOR_TYPES,
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_GENERATION_STATES,
  LITTER_CARE_TASK_ITEM_KINDS,
  LITTER_CARE_TASK_PRIORITIES,
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

export async function listLitterCareTaskTemplatesForOrganization(
  input: Parameters<
    typeof listLitterCareTaskTemplatesForOrganizationCore
  >[0],
  suppliedClient?: Supabase,
) {
  return listLitterCareTaskTemplatesForOrganizationCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function listLitterCareTaskLibrary(
  input: Parameters<typeof listLitterCareTaskLibraryCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterCareTaskLibraryCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function importLitterCareTaskLibraryTemplates(
  input: Parameters<typeof importLitterCareTaskLibraryTemplatesCore>[0],
  suppliedClient?: Supabase,
) {
  return importLitterCareTaskLibraryTemplatesCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function createLitterCareTaskTemplate(
  input: Parameters<typeof createLitterCareTaskTemplateCore>[0],
  suppliedClient?: Supabase,
) {
  return createLitterCareTaskTemplateCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function updateLitterCareTaskTemplate(
  input: Parameters<typeof updateLitterCareTaskTemplateCore>[0],
  suppliedClient?: Supabase,
) {
  return updateLitterCareTaskTemplateCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function setLitterCareTaskTemplateActive(
  input: Parameters<typeof setLitterCareTaskTemplateActiveCore>[0],
  suppliedClient?: Supabase,
) {
  return setLitterCareTaskTemplateActiveCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function listLitterCareTasksForLitter(
  input: Parameters<typeof listLitterCareTasksForLitterCore>[0],
  suppliedClient?: Supabase,
) {
  return listLitterCareTasksForLitterCore(input, await serverClient(suppliedClient));
}

export async function planLitterCareTaskGeneration(
  input: Parameters<typeof planLitterCareTaskGenerationCore>[0],
  suppliedClient?: Supabase,
) {
  return planLitterCareTaskGenerationCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function generateLitterCareTasksFromPlan(
  input: Parameters<typeof generateLitterCareTasksFromPlanCore>[0],
  suppliedClient?: Supabase,
) {
  return generateLitterCareTasksFromPlanCore(
    input,
    await serverClient(suppliedClient),
  );
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

export async function rescheduleLitterCareTaskPoint(
  input: Parameters<typeof rescheduleLitterCareTaskPointCore>[0],
  suppliedClient?: Supabase,
) {
  return rescheduleLitterCareTaskPointCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function replaceLockedLitterCareTaskPointSchedule(
  input: Parameters<typeof replaceLockedLitterCareTaskPointScheduleCore>[0],
  suppliedClient?: Supabase,
) {
  return replaceLockedLitterCareTaskPointScheduleCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function rescheduleLitterCareTaskWindow(
  input: Parameters<typeof rescheduleLitterCareTaskWindowCore>[0],
  suppliedClient?: Supabase,
) {
  return rescheduleLitterCareTaskWindowCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function replaceLockedLitterCareTaskWindowSchedule(
  input: Parameters<typeof replaceLockedLitterCareTaskWindowScheduleCore>[0],
  suppliedClient?: Supabase,
) {
  return replaceLockedLitterCareTaskWindowScheduleCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function setLitterCareTaskScheduleLock(
  input: Parameters<typeof setLitterCareTaskScheduleLockCore>[0],
  suppliedClient?: Supabase,
) {
  return setLitterCareTaskScheduleLockCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function reapplyLitterCareTaskScheduleSuggestion(
  input: Parameters<typeof reapplyLitterCareTaskScheduleSuggestionCore>[0],
  suppliedClient?: Supabase,
) {
  return reapplyLitterCareTaskScheduleSuggestionCore(
    input,
    await serverClient(suppliedClient),
  );
}
