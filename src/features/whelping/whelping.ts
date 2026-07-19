import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  closeWhelpingSessionCore,
  getOpenWhelpingSessionForLitterCore,
  listWhelpingEventsForSessionCore,
  listWhelpingBirthsForSessionCore,
  listWhelpingSessionsForLitterCore,
  openWhelpingSessionCore,
  recordWhelpingEventCore,
  recordWhelpingBirthCore,
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
  OpenWhelpingSessionInput,
  OpenWhelpingSessionResult,
  RecordWhelpingEventInput,
  RecordWhelpingEventResult,
  RecordWhelpingBirthInput,
  RecordWhelpingBirthResult,
  BirthWeightMeasurementSummary,
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

export async function closeWhelpingSession(
  input: Parameters<typeof closeWhelpingSessionCore>[0],
  suppliedClient?: Supabase,
) {
  return closeWhelpingSessionCore(input, await serverClient(suppliedClient));
}
