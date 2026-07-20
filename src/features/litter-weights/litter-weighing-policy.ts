import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import { resolveLitterWeighingSchedulePolicyForLitterCore } from "./litter-weighing-policy-core";

type Supabase = SupabaseClient<Database>;

export type {
  ResolveLitterWeighingSchedulePolicyResult,
  ResolveLitterWeighingSchedulePolicySource,
} from "./litter-weighing-policy-core";

export async function resolveLitterWeighingSchedulePolicyForLitter(
  input: Parameters<
    typeof resolveLitterWeighingSchedulePolicyForLitterCore
  >[0],
  suppliedClient?: Supabase,
) {
  const supabase = suppliedClient ?? (await createClient());
  return resolveLitterWeighingSchedulePolicyForLitterCore(input, supabase);
}
