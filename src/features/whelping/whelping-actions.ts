"use server";

import { revalidatePath } from "next/cache";

import {
  closeWhelpingSessionActionCore,
  cancelWhelpingBirthActionCore,
  correctWhelpingBirthActionCore,
  openWhelpingSessionActionCore,
  recordWhelpingBirthActionCore,
  recordWhelpingBirthWeightActionCore,
  quickCompleteWhelpingBirthActionCore,
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
  type WhelpingBirthAdjustmentActionState,
  type WhelpingBirthAdjustmentActionDependencies,
  type WhelpingBirthAdjustmentIntention,
  type WhelpingQuickCompletionActionDependencies,
} from "./whelping-actions-core";
import {
  closeWhelpingSession,
  cancelWhelpingBirth,
  correctWhelpingBirth,
  openWhelpingSession,
  recordWhelpingBirth,
  recordWhelpingBirthWeight,
  quickCompleteWhelpingBirth,
  recordWhelpingEvent,
  reopenWhelpingSession,
} from "./whelping";

const dependencies: WhelpingActionDependencies & WhelpingBirthAdjustmentActionDependencies & WhelpingQuickCompletionActionDependencies = {
  openSession: openWhelpingSession,
  recordEvent: recordWhelpingEvent,
  recordBirth: recordWhelpingBirth,
  recordBirthWeight: recordWhelpingBirthWeight,
  quickCompleteBirth: quickCompleteWhelpingBirth,
  closeSession: closeWhelpingSession,
  reopenSession: reopenWhelpingSession,
  correctBirth: correctWhelpingBirth,
  cancelBirth: cancelWhelpingBirth,
  revalidatePath,
};

export async function quickCompleteWhelpingBirthAction(
  intention: WhelpingBirthAdjustmentIntention,
  previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
) {
  return quickCompleteWhelpingBirthActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}

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

export async function correctWhelpingBirthAction(
  intention: WhelpingBirthAdjustmentIntention,
  previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
) {
  return correctWhelpingBirthActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}

export async function cancelWhelpingBirthAction(
  intention: WhelpingBirthAdjustmentIntention,
  previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
) {
  return cancelWhelpingBirthActionCore(
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
