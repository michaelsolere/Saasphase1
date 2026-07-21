import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  closeWhelpingSessionCore,
  recordWhelpingBirthCore,
  reopenWhelpingSessionCore,
} from "../../src/features/whelping/whelping-core";
import type { Database } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f200002-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E whelping reopen";

const ids = {
  mother: `${prefix}01`,
  father: `${prefix}02`,
  blockedMother: `${prefix}03`,
  concurrentMother: `${prefix}04`,
  foreignMother: `${prefix}05`,
  mainLitter: `${prefix}11`,
  blockedLitter: `${prefix}12`,
  concurrentLitter: `${prefix}13`,
  foreignLitter: `${prefix}14`,
  mainSession: `${prefix}21`,
  blockedSession: `${prefix}22`,
  otherOpenSession: `${prefix}23`,
  concurrentSession: `${prefix}24`,
  foreignSession: `${prefix}25`,
  initialCloseEvent: `${prefix}31`,
  blockedCloseEvent: `${prefix}32`,
  concurrentCloseEvent: `${prefix}33`,
  foreignCloseEvent: `${prefix}34`,
  viewerUser: `${prefix}41`,
  viewerIdentity: `${prefix}42`,
  viewerMembership: `${prefix}43`,
  foreignOrganization: `${prefix}44`,
  reopenOneCommand: `${prefix}51`,
  birthCommand: `${prefix}52`,
  closeOneCommand: `${prefix}53`,
  reopenTwoCommand: `${prefix}54`,
  closeTwoCommand: `${prefix}55`,
  alreadyOpenCommand: `${prefix}56`,
  blockedCommand: `${prefix}57`,
  viewerCommand: `${prefix}58`,
  anonymousCommand: `${prefix}59`,
  foreignCommand: `${prefix}60`,
  concurrentOneCommand: `${prefix}61`,
  concurrentTwoCommand: `${prefix}62`,
  genericReopenCommand: `${prefix}63`,
  adminReopenCommand: `${prefix}64`,
  adminCloseCommand: `${prefix}65`,
  memberReopenCommand: `${prefix}66`,
  memberCloseCommand: `${prefix}67`,
} as const;

const viewer = {
  email: "whelping-reopen-viewer@saasphase1.invalid",
  password: "WhelpingReopenViewer-2026!",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.whelping_commands
    where client_command_id::text like '9f200002-%'
       or litter_id::text like '9f200002-%'
       or session_id::text like '9f200002-%';

    delete from public.animal_weight_measurements measurement
    where measurement.animal_id::text like '9f200002-%'
       or measurement.source_birth_id in (
         select birth.id from public.whelping_births birth
         where birth.session_id::text like '9f200002-%'
       );

    delete from public.whelping_births
    where session_id::text like '9f200002-%'
       or id::text like '9f200002-%';

    delete from public.whelping_events
    where session_id::text like '9f200002-%'
       or id::text like '9f200002-%';

    delete from public.animals
    where litter_id::text like '9f200002-%';

    delete from public.whelping_sessions
    where litter_id::text like '9f200002-%'
       or id::text like '9f200002-%';

    delete from public.litters
    where id::text like '9f200002-%'
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id::text like '9f200002-%'
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.memberships where id::text like '9f200002-%';
    delete from auth.identities where user_id::text like '9f200002-%';
    delete from auth.users where id::text like '9f200002-%';
    delete from public.organizations
    where id = ${q(ids.foreignOrganization)}::uuid
       or slug = 'e2e-whelping-reopen-foreign';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'whelping_commands', (select count(*) from public.whelping_commands where client_command_id::text like '9f200002-%' or litter_id::text like '9f200002-%' or session_id::text like '9f200002-%'),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements where animal_id::text like '9f200002-%' or source_birth_id::text like '9f200002-%'),
        'whelping_births', (select count(*) from public.whelping_births where id::text like '9f200002-%' or session_id::text like '9f200002-%'),
        'whelping_events', (select count(*) from public.whelping_events where id::text like '9f200002-%' or session_id::text like '9f200002-%'),
        'whelping_sessions', (select count(*) from public.whelping_sessions where id::text like '9f200002-%' or litter_id::text like '9f200002-%'),
        'litters', (select count(*) from public.litters where id::text like '9f200002-%' or name like ${q(`${fixtureNamePrefix}%`)}),
        'animals', (select count(*) from public.animals where id::text like '9f200002-%' or litter_id::text like '9f200002-%' or call_name like ${q(`${fixtureNamePrefix}%`)}),
        'memberships', (select count(*) from public.memberships where id::text like '9f200002-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f200002-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f200002-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f200002-%'),
        'organizations', (select count(*) from public.organizations where id = ${q(ids.foreignOrganization)}::uuid or slug = 'e2e-whelping-reopen-foreign')
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function createFixtures() {
  sql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(ids.viewerUser)}::uuid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${q(viewer.email)},
      extensions.crypt(${q(viewer.password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Whelping reopen viewer"}'::jsonb,
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(ids.viewerIdentity)}::uuid, ${q(viewer.email)}, ${q(ids.viewerUser)}::uuid,
      jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewer.email)}, 'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.viewerUser)}::uuid, 'viewer', 'active',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrganization)}::uuid, 'E2E whelping reopen foreign', 'e2e-whelping-reopen-foreign');

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, is_breeder, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} mother`)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} father`)}, 'dog', 'Golden Retriever', 'male', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.blockedMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} blocked mother`)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} concurrent mother`)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(`${fixtureNamePrefix} foreign mother`)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id,
      status, expected_birth_date, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} main`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'birth_expected', '2026-07-20', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.blockedLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} blocked`)}, 'dog', 'Golden Retriever', ${q(ids.blockedMother)}::uuid, null, 'birth_expected', '2026-07-20', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixtureNamePrefix} concurrent`)}, 'dog', 'Golden Retriever', ${q(ids.concurrentMother)}::uuid, null, 'birth_expected', '2026-07-20', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(`${fixtureNamePrefix} foreign`)}, 'dog', 'Golden Retriever', ${q(ids.foreignMother)}::uuid, null, 'birth_expected', '2026-07-20', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values
      (${q(ids.mainSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.blockedSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.blockedLitter)}::uuid, ${q(ids.blockedMother)}::uuid, 'closed', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherOpenSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.blockedLitter)}::uuid, ${q(ids.blockedMother)}::uuid, 'open', '2026-07-20T09:30:00Z', null, 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.concurrentLitter)}::uuid, ${q(ids.concurrentMother)}::uuid, 'closed', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignSession)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignMother)}::uuid, 'closed', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at, event_type, note, author_id
    ) values
      (${q(ids.initialCloseEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainSession)}::uuid, 1, '2026-07-20T09:00:00Z', 'session_closed', 'Clôture initiale', ${q(ownerId)}::uuid),
      (${q(ids.blockedCloseEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.blockedSession)}::uuid, 1, '2026-07-20T09:00:00Z', 'session_closed', null, ${q(ownerId)}::uuid),
      (${q(ids.concurrentCloseEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.concurrentSession)}::uuid, 1, '2026-07-20T09:00:00Z', 'session_closed', null, ${q(ownerId)}::uuid),
      (${q(ids.foreignCloseEvent)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignSession)}::uuid, 1, '2026-07-20T09:00:00Z', 'session_closed', null, ${q(ownerId)}::uuid);
  `);
}

async function viewerClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword(viewer);
  if (signedIn.error) throw signedIn.error;
  return client;
}

function setViewerRole(role: "admin" | "member" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships
    set role = ${q(role)}
    where id = ${q(ids.viewerMembership)}::uuid;
    set session_replication_role = origin;
  `);
}

function requireSuccess<T extends { outcome: string }>(result: T) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected success.");
  return result;
}

function mainTimeline() {
  return JSON.parse(
    sql(`
      select coalesce(json_agg(json_build_object(
        'id', event.id,
        'sequenceNo', event.sequence_no,
        'eventType', event.event_type,
        'note', event.note
      ) order by event.sequence_no), '[]'::json)::text
      from public.whelping_events event
      where event.session_id = ${q(ids.mainSession)}::uuid;
    `),
  ) as Array<{ id: string; sequenceNo: number; eventType: string; note: string | null }>;
}

function createdArtifactIds() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions', coalesce((select json_agg(id::text order by id) from public.whelping_sessions where litter_id::text like '9f200002-%'), '[]'::json),
        'events', coalesce((select json_agg(event.id::text order by event.sequence_no) from public.whelping_events event where event.session_id::text like '9f200002-%'), '[]'::json),
        'births', coalesce((select json_agg(id::text order by id) from public.whelping_births where session_id::text like '9f200002-%'), '[]'::json),
        'animals', coalesce((select json_agg(id::text order by id) from public.animals where id::text like '9f200002-%' or litter_id::text like '9f200002-%'), '[]'::json),
        'commands', coalesce((select json_agg(id::text order by id) from public.whelping_commands where litter_id::text like '9f200002-%'), '[]'::json)
      )::text;
    `),
  ) as Record<string, string[]>;
}

test("reopens the same session idempotently, preserves closure history and serializes concurrent attempts", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecond = await createAuthenticatedSupabaseClient();
    const readOnly = await viewerClient();
    const anonymous = createAnonymousSupabaseClient();

    const firstReopen = requireSuccess(
      await reopenWhelpingSessionCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.reopenOneCommand,
          reopenedAt: "2026-07-20T09:15:00+00:00",
          reason: "  Clôture déclenchée trop tôt  ",
        },
        owner,
      ),
    );
    expect(firstReopen.sessionId).toBe(ids.mainSession);
    expect(firstReopen.sequenceNo).toBe(2);
    expect(Number(sql(`select count(*) from public.whelping_sessions where litter_id = ${q(ids.mainLitter)}::uuid;`))).toBe(1);
    expect(sql(`select status || ':' || coalesce(ended_at::text, 'null') from public.whelping_sessions where id = ${q(ids.mainSession)}::uuid;`)).toBe("open:null");
    expect(mainTimeline()).toMatchObject([
      { id: ids.initialCloseEvent, sequenceNo: 1, eventType: "session_closed" },
      { id: firstReopen.eventId, sequenceNo: 2, eventType: "session_reopened", note: "Clôture déclenchée trop tôt" },
    ]);

    const forbiddenGenericReopen = await owner.rpc("record_whelping_event", {
      p_session_id: ids.mainSession,
      p_client_command_id: ids.genericReopenCommand,
      p_occurred_at: "2026-07-20T09:15:30.000Z",
      p_event_type: "session_reopened",
      p_note: "Chemin générique interdit",
    });
    expect(forbiddenGenericReopen.error).toBeNull();
    expect(forbiddenGenericReopen.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "invalid_event_type",
    });

    const replay = requireSuccess(
      await reopenWhelpingSessionCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.reopenOneCommand,
          reopenedAt: "2026-07-20T09:15:00.000Z",
          reason: "Clôture déclenchée trop tôt",
        },
        owner,
      ),
    );
    expect(replay).toMatchObject({
      sessionId: ids.mainSession,
      eventId: firstReopen.eventId,
      sequenceNo: 2,
      replayed: true,
    });

    const beforeConflict = mainTimeline();
    const conflict = await reopenWhelpingSessionCore(
      {
        sessionId: ids.mainSession,
        clientCommandId: ids.reopenOneCommand,
        reopenedAt: "2026-07-20T09:15:00.000Z",
        reason: "Motif différent",
      },
      owner,
    );
    expect(conflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(mainTimeline()).toEqual(beforeConflict);

    const alreadyOpen = await reopenWhelpingSessionCore(
      {
        sessionId: ids.mainSession,
        clientCommandId: ids.alreadyOpenCommand,
        reopenedAt: "2026-07-20T09:16:00.000Z",
        reason: "Ne doit pas passer",
      },
      owner,
    );
    expect(alreadyOpen).toMatchObject({ outcome: "error", error: { code: "already_open" } });

    const birth = requireSuccess(
      await recordWhelpingBirthCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.birthCommand,
          occurredAt: "2026-07-20T09:20:00.000Z",
          sex: "female",
          viability: "alive",
          initialCollarColor: "Rose",
          note: "Naissance après réouverture",
        },
        owner,
      ),
    );
    expect(birth.eventSequenceNo).toBe(3);

    const firstClose = requireSuccess(
      await closeWhelpingSessionCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.closeOneCommand,
          endedAt: "2026-07-20T09:30:00.000Z",
          note: "Nouvelle clôture",
        },
        owner,
      ),
    );
    expect(firstClose.sequenceNo).toBe(4);

    const secondReopen = requireSuccess(
      await reopenWhelpingSessionCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.reopenTwoCommand,
          reopenedAt: "2026-07-20T09:35:00.000Z",
          reason: "Surveillance complémentaire",
        },
        owner,
      ),
    );
    expect(secondReopen.sequenceNo).toBe(5);
    const secondClose = requireSuccess(
      await closeWhelpingSessionCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.closeTwoCommand,
          endedAt: "2026-07-20T09:45:00.000Z",
          note: "Clôture finale",
        },
        owner,
      ),
    );
    expect(secondClose.sequenceNo).toBe(6);
    expect(mainTimeline().map((event) => event.eventType)).toEqual([
      "session_closed",
      "session_reopened",
      "birth",
      "session_closed",
      "session_reopened",
      "session_closed",
    ]);
    expect(() => sql(`
      select pg_catalog.set_config('request.jwt.claim.sub', ${q(ownerId)}, true);
      select pg_catalog.set_config('app.whelping_session_rpc', 'on', true);
      update public.whelping_sessions
      set status = 'open', ended_at = null
      where id = ${q(ids.mainSession)}::uuid;
    `)).toThrow(/reopened exclusively by the dedicated command/);
    expect(mainTimeline().map((event) => event.eventType)).toHaveLength(6);

    const blocked = await reopenWhelpingSessionCore(
      {
        sessionId: ids.blockedSession,
        clientCommandId: ids.blockedCommand,
        reopenedAt: "2026-07-20T10:00:00.000Z",
        reason: "Autre session ouverte",
      },
      owner,
    );
    expect(blocked).toMatchObject({ outcome: "error", error: { code: "already_open" } });

    const viewerDenied = await reopenWhelpingSessionCore(
      {
        sessionId: ids.concurrentSession,
        clientCommandId: ids.viewerCommand,
        reopenedAt: "2026-07-20T10:00:00.000Z",
        reason: "Viewer refusé",
      },
      readOnly,
    );
    expect(viewerDenied).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

    setViewerRole("admin");
    const adminReopen = requireSuccess(await reopenWhelpingSessionCore(
      {
        sessionId: ids.concurrentSession,
        clientCommandId: ids.adminReopenCommand,
        reopenedAt: "2026-07-20T10:01:00.000Z",
        reason: "Réouverture admin",
      },
      readOnly,
    ));
    requireSuccess(await closeWhelpingSessionCore(
      {
        sessionId: adminReopen.sessionId,
        clientCommandId: ids.adminCloseCommand,
        endedAt: "2026-07-20T10:02:00.000Z",
      },
      readOnly,
    ));

    setViewerRole("member");
    const memberReopen = requireSuccess(await reopenWhelpingSessionCore(
      {
        sessionId: ids.concurrentSession,
        clientCommandId: ids.memberReopenCommand,
        reopenedAt: "2026-07-20T10:03:00.000Z",
        reason: "Réouverture membre",
      },
      readOnly,
    ));
    requireSuccess(await closeWhelpingSessionCore(
      {
        sessionId: memberReopen.sessionId,
        clientCommandId: ids.memberCloseCommand,
        endedAt: "2026-07-20T10:04:00.000Z",
      },
      readOnly,
    ));
    setViewerRole("viewer");

    const anonymousDenied = await reopenWhelpingSessionCore(
      {
        sessionId: ids.concurrentSession,
        clientCommandId: ids.anonymousCommand,
        reopenedAt: "2026-07-20T10:00:00.000Z",
        reason: "Anonyme refusé",
      },
      anonymous,
    );
    expect(anonymousDenied).toMatchObject({ outcome: "error", error: { code: "database_error" } });
    const foreignDenied = await reopenWhelpingSessionCore(
      {
        sessionId: ids.foreignSession,
        clientCommandId: ids.foreignCommand,
        reopenedAt: "2026-07-20T10:00:00.000Z",
        reason: "Inter-organisation refusé",
      },
      owner,
    );
    expect(foreignDenied).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const [concurrentOne, concurrentTwo] = await Promise.all([
      reopenWhelpingSessionCore(
        {
          sessionId: ids.concurrentSession,
          clientCommandId: ids.concurrentOneCommand,
          reopenedAt: "2026-07-20T10:10:00.000Z",
          reason: "Tentative concurrente une",
        },
        owner,
      ),
      reopenWhelpingSessionCore(
        {
          sessionId: ids.concurrentSession,
          clientCommandId: ids.concurrentTwoCommand,
          reopenedAt: "2026-07-20T10:10:01.000Z",
          reason: "Tentative concurrente deux",
        },
        ownerSecond,
      ),
    ]);
    expect([concurrentOne, concurrentTwo].filter((result) => result.outcome === "success")).toHaveLength(1);
    expect([concurrentOne, concurrentTwo].filter((result) => result.outcome === "error")).toHaveLength(1);
    expect([concurrentOne, concurrentTwo].find((result) => result.outcome === "error")).toMatchObject({
      error: { code: "already_open" },
    });
    expect(Number(sql(`select count(*) from public.whelping_events where session_id = ${q(ids.concurrentSession)}::uuid and event_type = 'session_reopened';`))).toBe(3);
    console.info(`E2E whelping reopen fixture prefix: ${prefix}`);
    console.info(`E2E whelping reopen created artifact IDs: ${JSON.stringify(createdArtifactIds())}`);
  } finally {
    cleanup();
    expectCleanupAtZero();
    console.info(`E2E whelping reopen final fixture counts: ${JSON.stringify(remainingFixtureCounts())}`);
  }
});
