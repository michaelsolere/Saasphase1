import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202608180002_departure_planning.sql"), "utf8");

test("departure planning owns versioned plans, litters, one-family slots and append-only history", () => {
  for (const table of [
    "departure_plans",
    "departure_plan_litters",
    "departure_slots",
    "departure_public_accesses",
    "departure_public_sessions",
    "departure_commands",
    "departure_events",
  ]) {
    expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  }
  expect(sql).toContain("departure_slots_one_active_reservation_idx");
  expect(sql).toContain("guard_departure_append_only");
  expect(sql).toContain("app.qa_hard_delete");
});

test("browser writes use narrow owner-admin and public service RPCs", () => {
  expect(sql).toContain("create or replace function public.create_departure_plan");
  expect(sql).toContain("create or replace function public.upsert_departure_slot");
  expect(sql).toContain("create or replace function public.publish_departure_plan");
  expect(sql).toContain("create or replace function public.book_departure_public_session");
  expect(sql).toContain("create or replace function public.assign_departure_slot");
  expect(sql).toContain("create or replace function public.move_departure_appointment");
  expect(sql).toContain("owner_or_admin_required");
  expect(sql).toMatch(/grant execute on function[\s\S]*public\.book_departure_public_session\(text,uuid,uuid\)[\s\S]*to service_role/);
});

test("public bearer tables are hidden and raw tokens are never modeled", () => {
  expect(sql).toContain("token_hash text not null");
  expect(sql).toContain("session_hash text not null");
  expect(sql).not.toMatch(/raw_token|token_value|bearer_token/);
  expect(sql).toContain("revoke all on public.departure_public_accesses,public.departure_public_sessions from public,anon,authenticated");
});

test("calendar projection is relational and cannot become a second writer", () => {
  expect(sql).toContain("departure_slot_id uuid");
  expect(sql).toContain("events_departure_slot_fk");
  expect(sql).toContain("guard_departure_calendar_projection");
  expect(sql).toContain("departure_projection_rpc_required");
});
