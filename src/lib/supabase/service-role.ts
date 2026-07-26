import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

function requiredServerEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

/**
 * Privileged Supabase client for server-only token resolution and org-scoped reads.
 * Never import from client components. Never log the service role key.
 */
export function createServiceRoleClient() {
  const url = requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
