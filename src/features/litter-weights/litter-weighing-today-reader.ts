import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import { listOrganizationLitterWeighingTodayCore } from "./litter-weighing-today-core";

type Supabase = SupabaseClient<Database>;

export async function listOrganizationLitterWeighingToday(
  input: Parameters<typeof listOrganizationLitterWeighingTodayCore>[1],
  suppliedClient?: Supabase,
) {
  return listOrganizationLitterWeighingTodayCore(
    suppliedClient ?? (await createClient()),
    input,
  );
}
