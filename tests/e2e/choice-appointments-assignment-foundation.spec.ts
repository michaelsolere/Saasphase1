import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608180001_choice_appointments_assignment.sql",
  ),
  "utf8",
);
const emailService = readFileSync(
  resolve(
    process.cwd(),
    "src/features/communications/choice-appointment-email.ts",
  ),
  "utf8",
);

test("migration owns planning, secure response, ranked choice and assignment history", () => {
  for (const table of [
    "choice_appointment_plans",
    "choice_appointment_slots",
    "choice_appointment_accesses",
    "choice_appointment_sessions",
    "choice_appointment_ranked_preferences",
    "choice_appointment_commands",
    "choice_appointment_events",
    "animal_assignment_commands",
    "animal_assignment_events",
  ]) {
    expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  }
  expect(migration).toContain("guard_choice_appointment_append_only");
  expect(migration).toContain("app.qa_hard_delete");
});

test("assignment is owner-admin only, atomic and structurally unique", () => {
  expect(migration).toContain("create unique index reservations_one_active_assignment_per_animal_idx");
  expect(migration).toContain("create or replace function public.assign_choice_appointment_animal");
  expect(migration).toMatch(/array\['owner',\s*'admin'\]/);
  expect(migration).toContain("for update of reservation_row");
  expect(migration).toContain("for update of animal_row");
  expect(migration).toContain("animal_assignment_locked");
  expect(migration).toContain("document.animal_id=reservation.animal_id");
  expect(migration).toContain("post_birth_positions");
});

test("public bearer records are browser-invisible and expose only RPCs", () => {
  expect(migration).toContain("token_hash text not null");
  expect(migration).toContain("session_hash text not null");
  expect(migration).toContain("revoke all on public.choice_appointment_accesses from anon, authenticated");
  expect(migration).toContain("exchange_choice_appointment_public_token");
  expect(migration).toContain("respond_choice_appointment_public_session");
});

test("gallery storage accepts private multiple photos and preserves one selected presentation", () => {
  expect(migration).toContain("(primary|photos)");
  expect(migration).toContain("select_animal_presentation_photo");
  expect(migration).toMatch(/bucket_id\s*=\s*'animal-media'/);
  expect(migration).toContain("animal.id=split_part(name,'/',4)::uuid");
});

test("invitation and reminder keep a stable logical identity across slot changes", () => {
  expect(emailService).toContain("operationVersion: `slot:${slot.id}:${kind}:v1`");
  expect(emailService).not.toContain("slot:${slot.version}");
  expect(emailService).toContain("invitation_no_longer_applicable");
});
