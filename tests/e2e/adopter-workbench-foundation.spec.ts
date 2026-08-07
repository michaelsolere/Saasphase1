import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608120001_adopter_workbench_foundation.sql"),
  "utf8",
);

test("adopter workbench foundation restricts business writes and records idempotent manual contacts", () => {
  expect(migration).toContain("drop policy if exists payments_insert_writer on public.payments");
  expect(migration).toContain("array['owner', 'admin']");
  expect(migration).toContain("create table public.adopter_manual_contacts");
  expect(migration).toContain("unique (organization_id, client_command_id)");
  expect(migration).toContain("p_expected_reservation_updated_at timestamptz");
  expect(migration).toContain("outcome := 'conflict'");
  expect(migration).toContain("outcome := 'already_recorded'");
  expect(migration).toContain("array['owner', 'admin', 'member']");
  expect(migration).toContain("with (security_invoker = true)");
  expect(migration).not.toContain("current_stage");
});
