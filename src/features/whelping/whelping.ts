import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  closeWhelpingSessionCore,
  correctWhelpingBirthCore,
  cancelWhelpingBirthCore,
  getOpenWhelpingSessionForLitterCore,
  listWhelpingEventsForSessionCore,
  listWhelpingBirthsForSessionCore,
  listWhelpingSessionsForLitterCore,
  listWhelpingBirthAdjustmentHistoryCore,
  openWhelpingSessionCore,
  recordWhelpingEventCore,
  recordWhelpingBirthCore,
  recordWhelpingBirthWeightCore,
  quickCompleteWhelpingBirthCore,
  reopenWhelpingSessionCore,
} from "./whelping-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export type {
  CloseWhelpingSessionInput,
  CloseWhelpingSessionResult,
  GenericWhelpingEventType,
  GetOpenWhelpingSessionForLitterInput,
  GetOpenWhelpingSessionForLitterResult,
  ListWhelpingEventsForSessionInput,
  ListWhelpingEventsForSessionResult,
  ListWhelpingBirthsForSessionInput,
  ListWhelpingBirthsForSessionResult,
  ListWhelpingSessionsForLitterInput,
  ListWhelpingSessionsForLitterResult,
  ListWhelpingBirthAdjustmentHistoryInput,
  ListWhelpingBirthAdjustmentHistoryResult,
  OpenWhelpingSessionInput,
  OpenWhelpingSessionResult,
  RecordWhelpingEventInput,
  RecordWhelpingEventResult,
  RecordWhelpingBirthInput,
  RecordWhelpingBirthResult,
  RecordWhelpingBirthWeightInput,
  RecordWhelpingBirthWeightResult,
  QuickCompleteWhelpingBirthInput,
  QuickCompleteWhelpingBirthResult,
  ReopenWhelpingSessionInput,
  ReopenWhelpingSessionResult,
  BirthWeightMeasurementSummary,
  CorrectWhelpingBirthInput,
  CancelWhelpingBirthInput,
  WhelpingBirthAdjustmentResult,
  WhelpingBirthAdjustmentHistoryEntry,
  WhelpingBirthWeightChangeType,
  WhelpingBirthAnimalSummary,
  WhelpingBirthSex,
  WhelpingBirthSummary,
  WhelpingBirthViability,
  WhelpingEventSummary,
  WhelpingEventType,
  WhelpingServiceError,
  WhelpingServiceErrorCode,
  WhelpingSessionStatus,
  WhelpingSessionSummary,
} from "./whelping-core";

async function serverClient(suppliedClient?: Supabase) {
  return suppliedClient ?? (await createClient());
}

export async function getOpenWhelpingSessionForLitter(
  input: Parameters<typeof getOpenWhelpingSessionForLitterCore>[0],
  suppliedClient?: Supabase,
) {
  return getOpenWhelpingSessionForLitterCore(input, await serverClient(suppliedClient));
}

export async function listWhelpingSessionsForLitter(
  input: Parameters<typeof listWhelpingSessionsForLitterCore>[0],
  suppliedClient?: Supabase,
) {
  return listWhelpingSessionsForLitterCore(input, await serverClient(suppliedClient));
}

export async function listWhelpingEventsForSession(
  input: Parameters<typeof listWhelpingEventsForSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return listWhelpingEventsForSessionCore(input, await serverClient(suppliedClient));
}

export async function listWhelpingBirthsForSession(
  input: Parameters<typeof listWhelpingBirthsForSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return listWhelpingBirthsForSessionCore(input, await serverClient(suppliedClient));
}

export async function listWhelpingBirthAdjustmentHistory(
  input: Parameters<typeof listWhelpingBirthAdjustmentHistoryCore>[0],
  suppliedClient?: Supabase,
) {
  return listWhelpingBirthAdjustmentHistoryCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function openWhelpingSession(
  input: Parameters<typeof openWhelpingSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return openWhelpingSessionCore(input, await serverClient(suppliedClient));
}

export async function recordWhelpingEvent(
  input: Parameters<typeof recordWhelpingEventCore>[0],
  suppliedClient?: Supabase,
) {
  return recordWhelpingEventCore(input, await serverClient(suppliedClient));
}

export async function recordWhelpingBirth(
  input: Parameters<typeof recordWhelpingBirthCore>[0],
  suppliedClient?: Supabase,
) {
  return recordWhelpingBirthCore(input, await serverClient(suppliedClient));
}

export async function recordWhelpingBirthWeight(
  input: Parameters<typeof recordWhelpingBirthWeightCore>[0],
  suppliedClient?: Supabase,
) {
  return recordWhelpingBirthWeightCore(
    input,
    await serverClient(suppliedClient),
  );
}

export async function correctWhelpingBirth(
  input: Parameters<typeof correctWhelpingBirthCore>[0],
  suppliedClient?: Supabase,
) {
  return correctWhelpingBirthCore(input, await serverClient(suppliedClient));
}

export async function quickCompleteWhelpingBirth(
  input: Parameters<typeof quickCompleteWhelpingBirthCore>[0],
  suppliedClient?: Supabase,
) {
  return quickCompleteWhelpingBirthCore(input, await serverClient(suppliedClient));
}

export async function cancelWhelpingBirth(
  input: Parameters<typeof cancelWhelpingBirthCore>[0],
  suppliedClient?: Supabase,
) {
  return cancelWhelpingBirthCore(input, await serverClient(suppliedClient));
}

export async function closeWhelpingSession(
  input: Parameters<typeof closeWhelpingSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return closeWhelpingSessionCore(input, await serverClient(suppliedClient));
}

export async function reopenWhelpingSession(
  input: Parameters<typeof reopenWhelpingSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return reopenWhelpingSessionCore(input, await serverClient(suppliedClient));
}
