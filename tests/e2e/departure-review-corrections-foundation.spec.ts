import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202608180004_departure_review_corrections.sql"), "utf8");

test("enforces one organization-wide appointment schedule and plan-litter eligibility", () => {
  expect(sql).toContain("departure_slots_no_organization_overlap");
  expect(sql).toContain("exclude using gist");
  expect(sql).toContain("enforce_departure_slot_eligibility");
  expect(sql).toContain("reservation_litter_not_in_plan");
  expect(sql).toContain("departure_before_litter_release");
});

test("finalizes the prepared departure and existing adoption RPC in one transaction", () => {
  expect(sql).toContain("finalize_departure_adoption_handover");
  expect(sql).toContain("departure_finalization_contexts");
  expect(sql).toContain("txid_current()");
  expect(sql).toContain("public.finalize_adoption_handover(");
  expect(sql).toContain("reopen_departure_slot_after_adoption_reversal");
});

test("records the authoritative remaining balance idempotently", () => {
  expect(sql).toContain("record_departure_final_balance");
  expect(sql).toContain("final_balance_already_recorded");
  expect(sql).toContain("p_client_command_id");
});

test("protects signature evidence and calendar projection", () => {
  expect(sql).toContain("archive_sale_certificate_signature_service");
  expect(sql).toContain("consent_hash_mismatch");
  expect(sql).toContain("departure_calendar_projection_rpc_required");
  expect(sql).toContain("sync_departure_calendar_projection");
});
