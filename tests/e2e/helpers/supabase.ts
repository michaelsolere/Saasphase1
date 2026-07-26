import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "../../../src/types/database.types";

const execFileAsync = promisify(execFile);

const E2E_STACKS = {
  "saasphase1-e2e": {
    supabaseUrl: "http://127.0.0.1:55321",
    dbContainer: "supabase_db_saasphase1-e2e",
  },
  "saasphase1-e2e-trial": {
    supabaseUrl: "http://127.0.0.1:56321",
    dbContainer: "supabase_db_saasphase1-e2e-trial",
  },
} as const;

type E2eProjectId = keyof typeof E2E_STACKS;

export const E2E_OWNER_EMAIL = "e2e-owner@saasphase1.invalid";
export const E2E_OWNER_PASSWORD = "LocalE2EOwner-2026!";

type SupabaseResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required test environment variable: ${name}`);
  }

  return value;
}

function assertE2eEnvironment() {
  const projectId = requiredEnv("SUPABASE_PROJECT_ID");
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const ownerEmail = requiredEnv("E2E_OWNER_EMAIL");
  const ownerPassword = requiredEnv("E2E_OWNER_PASSWORD");
  const dbContainer = requiredEnv("SUPABASE_E2E_DB_CONTAINER");

  const stack = E2E_STACKS[projectId as E2eProjectId];
  if (!stack) {
    throw new Error(`Refusing to run E2E against Supabase project ${projectId}`);
  }

  if (supabaseUrl !== stack.supabaseUrl || supabaseUrl.includes("54321")) {
    throw new Error(`Refusing to run E2E against Supabase URL ${supabaseUrl}`);
  }

  const forbiddenDbContainer: string = "supabase_db_saasphase1";

  if (dbContainer !== stack.dbContainer || dbContainer === forbiddenDbContainer) {
    throw new Error(`Refusing to run E2E SQL against container ${dbContainer}`);
  }

  if (ownerEmail !== E2E_OWNER_EMAIL || ownerPassword !== E2E_OWNER_PASSWORD) {
    throw new Error("Refusing to run E2E with non-E2E owner credentials");
  }
}

export type SupabaseTestClient = SupabaseClient<Database>;

export function createAnonymousSupabaseClient() {
  assertE2eEnvironment();

  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

export async function createAuthenticatedSupabaseClient() {
  assertE2eEnvironment();

  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
  });

  if (error) {
    throw new Error(`Unable to authenticate test Supabase client: ${error.message}`);
  }

  return supabase;
}

export function runE2eSqlSync(sql: string) {
  assertE2eEnvironment();
  const dbContainer = requiredEnv("SUPABASE_E2E_DB_CONTAINER");

  return execFileSync(
    "docker",
    [
      "exec",
      dbContainer,
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

export async function runE2eSql(sql: string) {
  assertE2eEnvironment();
  const dbContainer = requiredEnv("SUPABASE_E2E_DB_CONTAINER");

  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      dbContainer,
      "psql",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );

  return stdout;
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
