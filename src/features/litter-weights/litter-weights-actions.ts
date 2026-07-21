"use server";

import { revalidatePath } from "next/cache";

import {
  cancelLitterRoutineWeightActionCore,
  cancelLitterWeighingSessionActionCore,
  correctLitterRoutineWeightActionCore,
  recordLitterRoutineWeightsActionCore,
  type LitterRoutineWeightsActionState,
  type RecordLitterRoutineWeightsIntention,
  type LitterWeightAdjustmentActionState,
  type LitterWeightMeasurementAdjustmentIntention,
  type LitterWeightSessionCancellationIntention,
} from "./litter-weights-actions-core";
import { cancelLitterRoutineWeight, cancelLitterWeighingSession, correctLitterRoutineWeight, recordLitterRoutineWeights } from "./litter-weights";

const dependencies = {
  recordWeights: recordLitterRoutineWeights,
  correctWeight: correctLitterRoutineWeight,
  cancelWeight: cancelLitterRoutineWeight,
  cancelSession: cancelLitterWeighingSession,
  revalidatePath,
};

export async function recordLitterRoutineWeightsAction(
  intention: RecordLitterRoutineWeightsIntention,
  previousState: LitterRoutineWeightsActionState,
  formData: FormData,
) {
  return recordLitterRoutineWeightsActionCore(
    intention,
    previousState,
    formData,
    dependencies,
  );
}

export async function correctLitterRoutineWeightAction(intention: LitterWeightMeasurementAdjustmentIntention, previousState: LitterWeightAdjustmentActionState, formData: FormData) {
  return correctLitterRoutineWeightActionCore(intention, previousState, formData, dependencies);
}

export async function cancelLitterRoutineWeightAction(intention: LitterWeightMeasurementAdjustmentIntention, previousState: LitterWeightAdjustmentActionState, formData: FormData) {
  return cancelLitterRoutineWeightActionCore(intention, previousState, formData, dependencies);
}

export async function cancelLitterWeighingSessionAction(intention: LitterWeightSessionCancellationIntention, previousState: LitterWeightAdjustmentActionState, formData: FormData) {
  return cancelLitterWeighingSessionActionCore(intention, previousState, formData, dependencies);
}
