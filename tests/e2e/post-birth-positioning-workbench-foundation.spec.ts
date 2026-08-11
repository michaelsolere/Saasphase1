import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608160001_positioning_workbench_integration.sql",
);

test("positioning workbench persists active-file order, proposal exceptions and immutable audit", () => {
  expect(existsSync(migrationPath)).toBe(true);
  const migration = readFileSync(migrationPath, "utf8");

  expect(migration).toContain("add column active_order integer");
  expect(migration).toContain("add column has_order_override boolean");
  expect(migration).toContain("add column preference_exception_active boolean");
  expect(migration).toContain("create or replace function public.override_post_birth_active_order");
  expect(migration).toContain("create or replace function public.move_post_birth_proposal");
  expect(migration).toContain("length(btrim(coalesce(p_reason, ''))) < 5");
  expect(migration).toContain("p_manual_contact_id uuid");
  expect(migration).toContain("post_birth_active_order_overridden");
  expect(migration).toContain("post_birth_preference_exception_recorded");
  expect(migration).toContain("'beforeOrder'");
  expect(migration).toContain("'afterOrder'");
  expect(migration).toContain("'historicalRank'");
  expect(migration).toContain("reason:='capacity_overflow'");
  expect(migration).toContain("revoke all on function public.override_post_birth_active_order");
  expect(migration).toContain("grant execute on function public.move_post_birth_proposal");
});
