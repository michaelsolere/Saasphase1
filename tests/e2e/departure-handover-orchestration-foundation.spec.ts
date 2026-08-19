import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202608180003_departure_handover_orchestration.sql"), "utf8");

test("handover migration requires signed sale certificate, zero balance and one-shot authorization", () => {
  expect(sql).toContain("departure_signature_events");
  expect(sql).toContain("departure_finalization_authorizations");
  expect(sql).toContain("archive_sale_certificate_signature");
  expect(sql).toContain("authorize_departure_finalization");
  expect(sql).toContain("identification_missing");
  expect(sql).toContain("balance_remaining");
  expect(sql).toContain("sale_certificate_not_signed");
  expect(sql).toContain("sensitive_incident_open");
  expect(sql).toContain("departure_finalization_authorization_required");
});

test("finalization remains the existing RPC and completion provisions the slot", () => {
  expect(sql).not.toContain("create or replace function public.finalize_adoption_handover");
  expect(sql).toContain("reservations_complete_departure_slot");
  expect(sql).toContain("status='completed'");
});

test("new veterinary and birth document types are bounded instead of hidden under other", () => {
  expect(sql).toContain("'veterinary_certificate'");
  expect(sql).toContain("'birth_certificate'");
  expect(sql).toContain("document_template_families_type_check");
});
