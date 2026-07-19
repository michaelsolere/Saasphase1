"use server";

import { revalidatePath } from "next/cache";

import {
  recordLitterRoutineWeightsActionCore,
  type LitterRoutineWeightsActionState,
  type RecordLitterRoutineWeightsIntention,
} from "./litter-weights-actions-core";
import { recordLitterRoutineWeights } from "./litter-weights";

const dependencies = {
  recordWeights: recordLitterRoutineWeights,
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
