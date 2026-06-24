import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "../../../src/types/database.types";

type SupabaseResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), fileName), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
          continue;
        }

        const [key, ...rawValueParts] = trimmed.split("=");
        if (!process.env[key]) {
          process.env[key] = rawValueParts.join("=").replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // Missing env files are fine if the variables are provided by the shell.
    }
  }
}

function requiredEnv(name: string) {
  loadLocalEnv();

  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required test environment variable: ${name}`);
  }

  return value;
}

export type SupabaseTestClient = SupabaseClient<Database>;

export async function createAuthenticatedSupabaseClient() {
  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: "owner@saasphase1.invalid",
    password: "LocalDevOwner-2026!",
  });

  if (error) {
    throw new Error(`Unable to authenticate test Supabase client: ${error.message}`);
  }

  return supabase;
}

export function expectSupabaseData<T>(
  result: SupabaseResult<T>,
  label: string,
) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.data;
}
