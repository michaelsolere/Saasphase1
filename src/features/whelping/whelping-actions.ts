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
import { mobileSelectionMatches } from "./whelping-mobile-selection-server";

const STALE_MOBILE_SELECTION_MESSAGE =
  "La portée affichée a changé. Rechargez le mode mise-bas avant de continuer.";

async function hasStaleMobileSelection(intention: {
  litterId: string;
  mobileSelectionRevision?: string;
}) {
  return intention.mobileSelectionRevision !== undefined &&
    !(await mobileSelectionMatches(
      intention.litterId,
      intention.mobileSelectionRevision,
    ));
}

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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE, stale: true };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE, stale: true };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE, stale: true };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE };
  }
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
  if (await hasStaleMobileSelection(intention)) {
    return { status: "error" as const, message: STALE_MOBILE_SELECTION_MESSAGE };
  }
  return reopenWhelpingSessionActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}
