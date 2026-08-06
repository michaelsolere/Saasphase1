import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608100001_post_adoption_automated_delivery.sql",
);

function migration() {
  return readFileSync(migrationPath, "utf8");
}

test("crée un registre durable et unique des communications T1/T2", () => {
  const sql = migration();
  expect(sql).toContain("create table public.post_adoption_questionnaire_dispatches");
  expect(sql).toContain("unique (organization_id, instance_id, message_kind)");
  expect(sql).toContain("for update of dispatch skip locked");
});

test("réserve les mutations automatiques au service serveur", () => {
  const sql = migration();
  expect(sql).toContain("claim_post_adoption_questionnaire_dispatches");
  expect(sql).toContain("complete_post_adoption_questionnaire_dispatch");
  expect(sql).toContain("revoke all on function public.claim_post_adoption_questionnaire_dispatches");
  expect(sql).toContain("grant execute on function public.claim_post_adoption_questionnaire_dispatches");
  expect(sql).toContain("p_organization_id uuid default null");
  expect(sql).toContain("to service_role");
});

test("conserve un historique immuable et interdit les écritures directes", () => {
  const sql = migration();
  expect(sql).toContain("post_adoption_questionnaire_automation_events");
  expect(sql).toContain("post_adoption_questionnaire_automation_events_immutable");
  expect(sql).toContain("revoke insert, update, delete, truncate");
  expect(sql).toContain("revoke insert, update on table public.organization_settings from authenticated");
  const updateGrant = sql.match(/grant update \(([\s\S]*?)\) on public\.organization_settings/);
  expect(updateGrant?.[1]).not.toContain("post_adoption_automation_activated_at");
});

test("porte le secret chiffré temporaire sans stocker le jeton brut", () => {
  const sql = migration();
  expect(sql).toContain("token_ciphertext");
  expect(sql).toContain("token_auth_tag");
  expect(sql).toContain("token_key_version");
  expect(sql).toContain("encrypted_token_purged_at");
  expect(sql).not.toContain("raw_token");
  expect(sql).toContain("sensitive_snapshot_rejected");
  expect(sql).toContain("reencrypt_post_adoption_questionnaire_public_access");
});

test("prépare un snapshot sans bearer avant l’appel Brevo", () => {
  const sql = migration();
  expect(sql).toContain("p_variables_snapshot jsonb");
  expect(sql).toContain("provider_call_started_at = statement_timestamp()");
  expect(sql).toContain("p_variables_snapshot->>'lien_questionnaire'");
});

test("ferme l’existant sans relance et active seulement les adoptions futures", () => {
  const sql = migration();
  expect(sql).toContain("post_adoption_automation_activated_at");
  expect(sql).toContain("legacy_not_automated");
  expect(sql).toContain("legacy_access_preserved");
});

test("filtre la vue globale des résultats sur l’organisation explicitement choisie", () => {
  const sql = migration();
  expect(sql).toContain("list_post_adoption_results_for_organization");
  expect(sql).toContain("selected_litter.organization_id = p_organization_id");
  expect(sql).toContain("membership.profile_id = auth.uid()");
});
