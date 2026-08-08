import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608130001_adopter_profile_questionnaire.sql"),
  "utf8",
);
const privacyMigrationPath = resolve(process.cwd(), "supabase/migrations/202608140001_adopter_profile_privacy_and_delivery_recovery.sql");
const privacyMigration = existsSync(privacyMigrationPath) ? readFileSync(privacyMigrationPath, "utf8") : "";
const deliveryService = readFileSync(
  resolve(process.cwd(), "src/features/adopter-profile-questionnaire/delivery-service.ts"),
  "utf8",
);

test("le schéma Profil conserve des preuves compactes sans statut synthétique", () => {
  expect(migration).toContain("create table public.adopter_profile_questionnaire_definitions");
  expect(migration).toContain("create table public.adopter_profile_questionnaire_instances");
  expect(migration).toContain("unique (organization_id, reservation_id)");
  expect(migration).toContain("draft_revision integer not null default 0");
  expect(migration).toContain("final_answers jsonb");
  expect(migration).toContain("reviewed_at timestamptz");
  expect(migration).toContain("waived_at timestamptz");
  expect(migration).not.toContain("current_stage");
});

test("l’accès public ne donne aucun accès anon direct aux tables privées", () => {
  expect(migration).toContain("create table public.adopter_profile_questionnaire_accesses");
  expect(migration).toContain("create table public.adopter_profile_questionnaire_sessions");
  expect(migration).toContain("token_hash text not null");
  expect(migration).toContain("session_hash text not null");
  expect(migration).toContain("create unique index adopter_profile_single_active_access_idx");
  expect(migration).toContain("revoke all on public.adopter_profile_questionnaire_instances from anon");
  expect(migration).toContain("revoke all on public.adopter_profile_questionnaire_accesses from anon");
  expect(migration).toContain("revoke all on public.adopter_profile_questionnaire_sessions from anon");
  expect(migration).toContain("grant select, insert, update on public.adopter_profile_questionnaire_sessions to service_role");
  expect(migration).toContain("grant select, insert, update, delete on public.adopter_profile_questionnaire_rate_limits to service_role");
});

test("les mutations internes sensibles sont owner/admin et les preuves append-only", () => {
  expect(migration).toContain("array['owner', 'admin']");
  expect(migration).toContain("array['owner', 'admin', 'member', 'viewer']");
  expect(migration).toContain("create or replace function public.review_adopter_profile_questionnaire");
  expect(migration).toContain("create or replace function public.waive_adopter_profile_questionnaire");
  expect(migration).toContain("p_manual_contact_id uuid");
  expect(migration).toContain("create table public.adopter_profile_questionnaire_events");
  expect(migration).toContain("adopter profile questionnaire events are append-only");
});

test("le provisioning et la reprise couvrent les preuves de versement sans email historique", () => {
  expect(migration).toContain("create or replace function public.ensure_adopter_profile_questionnaire_instance");
  expect(migration).toContain("create or replace function public.reconcile_adopter_profile_questionnaire_instances");
  expect(migration).toContain("candidate_first_payment_accepted");
  expect(migration).toContain("automatic_invitation_allowed");
  expect(migration).toContain("false -- historical activation never sends automatically");
  expect(migration).toContain("adopter_profile_questionnaire_payment_provisioning");
});

test("les commandes de brouillon et d’envoi final sont atomiques et idempotentes", () => {
  expect(migration).toContain("create table public.adopter_profile_questionnaire_commands");
  expect(migration).toContain("unique (instance_id, command_type, client_command_id)");
  expect(migration).toContain("create or replace function public.save_adopter_profile_questionnaire_draft");
  expect(migration).toContain("p_expected_revision integer");
  expect(migration).toContain("outcome := 'conflict'");
  expect(migration).toContain("create or replace function public.submit_adopter_profile_questionnaire");
  expect(migration).toContain("outcome := 'already_submitted'");
});

test("la finalisation d’un email lie atomiquement la tentative et sa preuve métier", () => {
  expect(migration).toContain("create unique index adopter_profile_single_delivery_event_idx");
  expect(migration).toContain("create or replace function public.finalize_adopter_profile_questionnaire_delivery");
  expect(migration).toContain("profile_questionnaire_reminder_sent");
  expect(migration).toContain("on conflict do nothing");
  expect(migration).toContain("create or replace function public.record_adopter_profile_questionnaire_delivery_failure");
  expect(migration).toContain("create or replace function public.list_due_adopter_profile_questionnaire_deliveries");
  expect(migration).toContain("create or replace function public.revoke_adopter_profile_questionnaire_access");
});

test("les rôles de consultation ne reçoivent qu’une projection sans réponses familiales", () => {
  expect(privacyMigration).toContain("drop policy if exists adopter_profile_instances_read");
  expect(privacyMigration).toContain("array['owner', 'admin']");
  expect(privacyMigration).toContain("read_adopter_profile_questionnaire_summaries");
  expect(privacyMigration).not.toContain("final_answers");
  expect(privacyMigration).not.toContain("draft_answers");
  expect(privacyMigration).toContain("grant execute on function public.read_adopter_profile_questionnaire_summaries(uuid[]) to authenticated");
  expect(privacyMigration).toContain("provider_call_started_at timestamptz");
});

test("l’appel Brevo commence seulement après la preuve durable et suspend les issues incertaines", () => {
  const providerStart = deliveryService.indexOf("update({ provider_call_started_at:");
  const providerSend = deliveryService.indexOf("const sent = await sendBrevoTransactionalEmail");
  expect(providerStart).toBeGreaterThan(0);
  expect(providerSend).toBeGreaterThan(providerStart);
  expect(deliveryService).toContain("provider_outcome_uncertain");
  expect(deliveryService).toContain("chooseAdopterProfileStaleDeliveryAction");
});
