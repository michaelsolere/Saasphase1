import { updateLitterGestationAnchorsAndRecalculatePlanCore } from "./litter-gestation-anchors-core";
import { createClient } from "@/lib/supabase/server";

export async function updateLitterGestationAnchorsAndRecalculatePlan(
  input: Parameters<typeof updateLitterGestationAnchorsAndRecalculatePlanCore>[0],
) {
  const supabase = await createClient();
  return updateLitterGestationAnchorsAndRecalculatePlanCore(input, supabase);
}
