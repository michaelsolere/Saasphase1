import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f350002-0000-4000-8000-0000000000";
const ids = {
  contact: `${prefix}01`,
  animal: `${prefix}02`,
  reservation: `${prefix}03`,
  instance: `${prefix}04`,
  createdEvent: `${prefix}05`,
  dueEvent: `${prefix}06`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const parseSqlJson = (output: string) => {
  const line = output
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.startsWith("{"));
  if (!line) throw new Error(`Résultat JSON absent : ${output}`);
  return JSON.parse(line) as Record<string, unknown>;
};
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const publicToken = Buffer.alloc(32, 13).toString("base64url");
const tokenHash = hash(publicToken);
const sessionHash = hash("post-adoption-revocation-e2e-session");

function cleanup() {
  sql(`
    begin;
    set local app.qa_hard_delete = 'on';
    delete from public.post_adoption_questionnaire_public_sessions
    where access_id in (
      select id from public.post_adoption_questionnaire_public_accesses
      where instance_id = ${q(ids.instance)}::uuid
    );
    delete from public.post_adoption_questionnaire_public_accesses
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_events
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_response_revisions
    where instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_instances
    where id = ${q(ids.instance)}::uuid;
    delete from public.reservations where id = ${q(ids.reservation)}::uuid;
    delete from public.animals where id = ${q(ids.animal)}::uuid;
    delete from public.contacts where id = ${q(ids.contact)}::uuid;
    commit;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`select json_build_object(
      'sessions', (select count(*) from public.post_adoption_questionnaire_public_sessions where access_id in (select id from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid)),
      'accesses', (select count(*) from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid),
      'events', (select count(*) from public.post_adoption_questionnaire_events where instance_id = ${q(ids.instance)}::uuid),
      'responses', (select count(*) from public.post_adoption_questionnaire_response_revisions where instance_id = ${q(ids.instance)}::uuid),
      'instances', (select count(*) from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid),
      'reservations', (select count(*) from public.reservations where id = ${q(ids.reservation)}::uuid),
      'animals', (select count(*) from public.animals where id = ${q(ids.animal)}::uuid),
      'contacts', (select count(*) from public.contacts where id = ${q(ids.contact)}::uuid)
    )::text;`),
  ) as Record<string, number>;
}

function createFixture() {
  sql(`
    begin;
    insert into public.contacts (id, organization_id, display_name, email, origin_channel, primary_status, created_by, updated_by)
    values (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Famille E2E révocation accès public', 'e2e-public-revocation@example.test', 'other', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.animals (id, organization_id, call_name, official_name, species, breed, sex, birth_date, status, ownership_status, created_by, updated_by)
    values (${q(ids.animal)}::uuid, ${q(organizationId)}::uuid, 'Orage', 'Orage E2E', 'dog', 'Golden Retriever', 'male', '2025-02-01', 'active', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    set local session_replication_role = replica;
    insert into public.reservations (id, organization_id, contact_id, animal_id, species, breed, status, adoption_completed_at, created_by, updated_by)
    values (${q(ids.reservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.animal)}::uuid, 'dog', 'Golden Retriever', 'adopted', statement_timestamp() - interval '60 days', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    set local session_replication_role = origin;
    insert into public.post_adoption_questionnaire_instances (id, organization_id, questionnaire_code, questionnaire_version, contact_id, reservation_id, animal_id, due_at, status, created_by, updated_by)
    values (${q(ids.instance)}::uuid, ${q(organizationId)}::uuid, 'post-adoption-t1', 1, ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid, ${q(ids.animal)}::uuid, statement_timestamp(), 'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.post_adoption_questionnaire_events (id, organization_id, instance_id, event_type, actor_kind, actor_profile_id, details)
    values (${q(ids.createdEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid, 'instance_created', 'member', ${q(ownerId)}::uuid, '{}'::jsonb);
    insert into public.post_adoption_questionnaire_events (id, organization_id, instance_id, event_type, from_status, to_status, actor_kind, details)
    values (${q(ids.dueEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid, 'became_due', 'planned', 'due', 'system', '{}'::jsonb);
    commit;
  `);
}

function revokeAsOwner() {
  return parseSqlJson(
    sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select row_to_json(result)::text from public.revoke_post_adoption_questionnaire_public_access(${q(ids.instance)}::uuid) result; commit;`),
  );
}

test("révocation de l'accès public : succès, invalidation des sessions, échange barré et idempotence", () => {
  try {
    cleanup();
    expect(Object.values(remainingCounts()).every((count) => count === 0)).toBe(true);
    createFixture();

    const activation = parseSqlJson(
      sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select row_to_json(result)::text from public.create_or_rotate_post_adoption_questionnaire_public_access(${q(ids.instance)}::uuid, ${q(tokenHash)}, 'e2e-revoc') result; commit;`),
    );
    expect(activation.outcome).toBe("success");

    const exchanged = parseSqlJson(
      sql(`select row_to_json(result)::text from public.exchange_post_adoption_questionnaire_public_token(${q(tokenHash)}, ${q(sessionHash)}) result;`),
    );
    expect(exchanged.outcome).toBe("success");

    const revocation = revokeAsOwner();
    expect(revocation.outcome).toBe("success");
    expect(revocation.revoked_at).toBeTruthy();
    expect(
      Number(sql(`select count(*) from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid and revoked_at is not null and revoked_by = ${q(ownerId)}::uuid;`)),
    ).toBe(1);

    expect(
      Number(sql(`select count(*) from public.post_adoption_questionnaire_public_sessions where access_id in (select id from public.post_adoption_questionnaire_public_accesses where instance_id = ${q(ids.instance)}::uuid) and invalidated_at is null;`)),
    ).toBe(0);

    expect(
      sql(`select outcome from public.exchange_post_adoption_questionnaire_public_token(${q(tokenHash)}, ${q(hash("post-adoption-revocation-second-session"))});`),
    ).toBe("unavailable");

    const replay = revokeAsOwner();
    expect(replay.outcome).toBe("already_revoked");
    expect(replay.revoked_at).toBeNull();
  } finally {
    cleanup();
    expect(remainingCounts()).toEqual({
      sessions: 0,
      accesses: 0,
      events: 0,
      responses: 0,
      instances: 0,
      reservations: 0,
      animals: 0,
      contacts: 0,
    });
  }
});
