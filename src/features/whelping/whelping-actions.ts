"use server";

import { revalidatePath } from "next/cache";

import {
  closeWhelpingSessionActionCore,
  openWhelpingSessionActionCore,
  recordWhelpingBirthActionCore,
  recordWhelpingBirthWeightActionCore,
  recordWhelpingEventActionCore,
  reopenWhelpingSessionActionCore,
  type CloseWhelpingSessionIntention,
  type OpenWhelpingSessionIntention,
  type RecordWhelpingBirthIntention,
  type RecordWhelpingBirthWeightIntention,
  type RecordWhelpingEventIntention,
  type ReopenWhelpingSessionIntention,
  type WhelpingActionDependencies,
  type WhelpingActionState,
  type WhelpingBirthActionState,
} from "./whelping-actions-core";
import {
  closeWhelpingSession,
  openWhelpingSession,
  recordWhelpingBirth,
  recordWhelpingBirthWeight,
  recordWhelpingEvent,
  reopenWhelpingSession,
} from "./whelping";

const dependencies: WhelpingActionDependencies = {
  openSession: openWhelpingSession,
  recordEvent: recordWhelpingEvent,
  recordBirth: recordWhelpingBirth,
  recordBirthWeight: recordWhelpingBirthWeight,
  closeSession: closeWhelpingSession,
  reopenSession: reopenWhelpingSession,
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

export async function recordWhelpingBirthWeightAction(
  intention: RecordWhelpingBirthWeightIntention,
  previousState: WhelpingActionState,
  formData: FormData,
) {
  return recordWhelpingBirthWeightActionCore(
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

export async function reopenWhelpingSessionAction(
  intention: ReopenWhelpingSessionIntention,
  previousState: WhelpingActionState,
  formData: FormData,
) {
  return reopenWhelpingSessionActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}
