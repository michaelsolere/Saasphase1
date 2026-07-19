"use server";

import { revalidatePath } from "next/cache";

import {
  closeWhelpingSessionActionCore,
  openWhelpingSessionActionCore,
  recordWhelpingBirthActionCore,
  recordWhelpingEventActionCore,
  type CloseWhelpingSessionIntention,
  type OpenWhelpingSessionIntention,
  type RecordWhelpingBirthIntention,
  type RecordWhelpingEventIntention,
  type WhelpingActionDependencies,
  type WhelpingActionState,
  type WhelpingBirthActionState,
} from "./whelping-actions-core";
import {
  closeWhelpingSession,
  openWhelpingSession,
  recordWhelpingBirth,
  recordWhelpingEvent,
} from "./whelping";

const dependencies: WhelpingActionDependencies = {
  openSession: openWhelpingSession,
  recordEvent: recordWhelpingEvent,
  recordBirth: recordWhelpingBirth,
  closeSession: closeWhelpingSession,
  revalidatePath,
};

export async function openWhelpingSessionAction(
  intention: OpenWhelpingSessionIntention,
  previousState: WhelpingActionState,
  formData: FormData,
) {
  return openWhelpingSessionActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}

export async function recordWhelpingEventAction(
  intention: RecordWhelpingEventIntention,
  previousState: WhelpingActionState,
  formData: FormData,
) {
  return recordWhelpingEventActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}

export async function recordWhelpingBirthAction(
  intention: RecordWhelpingBirthIntention,
  previousState: WhelpingBirthActionState,
  formData: FormData,
) {
  return recordWhelpingBirthActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}

export async function closeWhelpingSessionAction(
  intention: CloseWhelpingSessionIntention,
  previousState: WhelpingActionState,
  formData: FormData,
) {
  return closeWhelpingSessionActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}
