import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  closeWhelpingSessionCore,
  getOpenWhelpingSessionForLitterCore,
  listWhelpingEventsForSessionCore,
  listWhelpingSessionsForLitterCore,
  openWhelpingSessionCore,
  recordWhelpingEventCore,
} from "../../src/features/whelping/whelping-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f190002-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E whelping foundation";

const ids = {
  mainMother: `${prefix}01`,
  adminMother: `${prefix}02`,
  memberMother: `${prefix}03`,
  viewerMother: `${prefix}04`,
  concurrentMother: `${prefix}05`,
  foreignMother: `${prefix}06`,
  mainLitter: `${prefix}11`,
  adminLitter: `${prefix}12`,
  memberLitter: `${prefix}13`,
  viewerLitter: `${prefix}14`,
  concurrentLitter: `${prefix}15`,
  foreignLitter: `${prefix}16`,
  foreignSession: `${prefix}17`,
  otherOrganization: `${prefix}20`,
  adminUser: `${prefix}31`,
  adminIdentity: `${prefix}32`,
  adminMembership: `${prefix}33`,
  memberUser: `${prefix}41`,
  memberIdentity: `${prefix}42`,
  memberMembership: `${prefix}43`,
  viewerUser: `${prefix}51`,
  viewerIdentity: `${prefix}52`,
  viewerMembership: `${prefix}53`,
  openMainCommand: `${prefix}61`,
  openAdminCommand: `${prefix}62`,
  openMemberCommand: `${prefix}63`,
  openViewerCommand: `${prefix}64`,
  openConcurrentOneCommand: `${prefix}65`,
  openConcurrentTwoCommand: `${prefix}66`,
  eventMainCommand: `${prefix}71`,
  eventAdminCommand: `${prefix}72`,
  eventMemberCommand: `${prefix}73`,
  eventViewerCommand: `${prefix}74`,
  eventConcurrentOneCommand: `${prefix}75`,
  eventConcurrentTwoCommand: `${prefix}76`,
  eventBirthCommand: `${prefix}77`,
  eventSessionClosedCommand: `${prefix}78`,
  closeInvalidCommand: `${prefix}81`,
  closeMainCommand: `${prefix}82`,
  closeAdminCommand: `${prefix}83`,
  closeMemberCommand: `${prefix}84`,
  eventAfterCloseCommand: `${prefix}85`,
  foreignOpenCommand: `${prefix}91`,
  foreignEventCommand: `${prefix}92`,
} as const;

const users = {
  admin: {
    id: ids.adminUser,
    identityId: ids.adminIdentity,
    membershipId: ids.adminMembership,
    role: "admin",
    email: "whelping-admin@saasphase1.invalid",
    password: "WhelpingAdmin-2026!",
  },
  member: {
    id: ids.memberUser,
    identityId: ids.memberIdentity,
    membershipId: ids.memberMembership,
    role: "member",
    email: "whelping-member@saasphase1.invalid",
    password: "WhelpingMember-2026!",
  },
  viewer: {
    id: ids.viewerUser,
    identityId: ids.viewerIdentity,
    membershipId: ids.viewerMembership,
    role: "viewer",
    email: "whelping-viewer@saasphase1.invalid",
    password: "WhelpingViewer-2026!",
  },
} as const;

const createdSessionIds = new Set<string>([ids.foreignSession]);
const createdEventIds = new Set<string>();

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function fixtureAnimalIdsSql() {
  return [
    ids.mainMother,
    ids.adminMother,
    ids.memberMother,
    ids.viewerMother,
    ids.concurrentMother,
    ids.foreignMother,
  ]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function fixtureLitterIdsSql() {
  return [
    ids.mainLitter,
    ids.adminLitter,
    ids.memberLitter,
    ids.viewerLitter,
    ids.concurrentLitter,
    ids.foreignLitter,
  ]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function dynamicIdsSql(values: Set<string>) {
  if (values.size === 0) return "null::uuid";
  return [...values].map((id) => `${q(id)}::uuid`).join(", ");
}

function cleanup() {
  sql(`
    delete from public.whelping_commands
    where client_command_id::text like '9f190002-%'
       or litter_id in (${fixtureLitterIdsSql()})
       or session_id in (${dynamicIdsSql(createdSessionIds)});

    delete from public.whelping_events
    where id in (${dynamicIdsSql(createdEventIds)})
       or session_id in (${dynamicIdsSql(createdSessionIds)})
       or session_id in (
         select session.id
         from public.whelping_sessions session
         where session.litter_id in (${fixtureLitterIdsSql()})
       );

    delete from public.whelping_sessions
    where id in (${dynamicIdsSql(createdSessionIds)})
       or id::text like '9f190002-%'
       or litter_id in (${fixtureLitterIdsSql()});

    delete from public.litter_care_tasks
    where litter_id in (${fixtureLitterIdsSql()})
       or creation_command_id::text like '9f190002-%';

    delete from public.events
    where litter_id in (${fixtureLitterIdsSql()})
       or id::text like '9f190002-%';

    delete from public.litters
    where id in (${fixtureLitterIdsSql()})
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${fixtureAnimalIdsSql()})
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.memberships where id::text like '9f190002-%';
    delete from auth.identities where user_id::text like '9f190002-%';
    delete from auth.users where id::text like '9f190002-%';
    delete from public.organizations
    where id = ${q(ids.otherOrganization)}::uuid
       or slug = 'e2e-whelping-isolated';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'whelping_commands', (
          select count(*) from public.whelping_commands
          where client_command_id::text like '9f190002-%'
             or litter_id in (${fixtureLitterIdsSql()})
             or session_id in (${dynamicIdsSql(createdSessionIds)})
        ),
        'whelping_events', (
          select count(*) from public.whelping_events
          where id in (${dynamicIdsSql(createdEventIds)})
             or session_id in (${dynamicIdsSql(createdSessionIds)})
             or id::text like '9f190002-%'
        ),
        'whelping_sessions', (
          select count(*) from public.whelping_sessions
          where id in (${dynamicIdsSql(createdSessionIds)})
             or id::text like '9f190002-%'
             or litter_id in (${fixtureLitterIdsSql()})
        ),
        'litter_care_tasks', (
          select count(*) from public.litter_care_tasks
          where litter_id in (${fixtureLitterIdsSql()})
             or creation_command_id::text like '9f190002-%'
        ),
        'events', (
          select count(*) from public.events
          where litter_id in (${fixtureLitterIdsSql()})
             or id::text like '9f190002-%'
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${fixtureLitterIdsSql()})
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${fixtureAnimalIdsSql()})
             or call_name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f190002-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f190002-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f190002-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f190002-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
             or slug = 'e2e-whelping-isolated'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const remaining = remainingFixtureCounts();
  for (const [table, count] of Object.entries(remaining)) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function createUserFixtures() {
  for (const user of Object.values(users)) {
    sql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, phone_change,
        phone_change_token, email_change_token_current,
        reauthentication_token, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        ${q(user.id)}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', ${q(user.email)},
        extensions.crypt(${q(user.password)}, extensions.gen_salt('bf')),
        now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(`Whelping ${user.role}`)}),
        now(), now()
      );

      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(user.identityId)}::uuid, ${q(user.email)}, ${q(user.id)}::uuid,
        jsonb_build_object(
          'sub', ${q(user.id)}, 'email', ${q(user.email)},
          'email_verified', true, 'phone_verified', false
        ),
        'email', now(), now()
      );

      insert into public.memberships (
        id, organization_id, profile_id, role, status, created_by, updated_by
      ) values (
        ${q(user.membershipId)}::uuid, ${q(organizationId)}::uuid,
        ${q(user.id)}::uuid, ${q(user.role)}, 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
  }
}

function createBusinessFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E mise bas isolée',
      'e2e-whelping-isolated'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values
      (${q(ids.mainMother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} main mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.adminMother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} admin mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberMother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} member mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} viewer mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentMother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} concurrent mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} foreign mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      expected_birth_date, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} main litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.mainMother)}::uuid, 'birth_expected', '2026-07-19',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.adminLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} admin litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.adminMother)}::uuid, 'pregnancy_confirmed', '2026-07-20',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} member litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.memberMother)}::uuid, 'birth_in_progress', '2026-07-19',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} viewer litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.viewerMother)}::uuid, 'planned', '2026-07-19',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} concurrent litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.concurrentMother)}::uuid, 'birth_expected', '2026-07-19',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} foreign litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.foreignMother)}::uuid, 'birth_expected', '2026-07-19',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at,
      timezone_name, note, created_by, updated_by
    ) values (
      ${q(ids.foreignSession)}::uuid, ${q(ids.otherOrganization)}::uuid,
      ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignMother)}::uuid, 'open',
      '2026-07-19T06:00:00Z', 'Europe/Paris', 'Foreign E2E session',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

async function clientFor(user: (typeof users)[keyof typeof users]) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signedIn.error) throw signedIn.error;
  return client;
}

function requireSuccess<T extends { outcome: string }>(result: T) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected a successful result.");
  return result;
}

function businessSnapshot() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litters', (
          select jsonb_agg(to_jsonb(litter) order by litter.id)
          from public.litters litter
          where litter.id in (${fixtureLitterIdsSql()})
        ),
        'animals', (
          select jsonb_agg(to_jsonb(animal) order by animal.id)
          from public.animals animal
          where animal.id in (${fixtureAnimalIdsSql()})
        ),
        'litter_care_tasks_count', (select count(*) from public.litter_care_tasks),
        'events_count', (select count(*) from public.events)
      )::text;
    `),
  ) as Record<string, unknown>;
}

test("secures idempotent concurrent whelping sessions and append-only events", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createUserFixtures();
    createBusinessFixtures();

    const before = businessSnapshot();
    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecond = await createAuthenticatedSupabaseClient();
    const admin = await clientFor(users.admin);
    const member = await clientFor(users.member);
    const viewer = await clientFor(users.viewer);

    const mainOpen = requireSuccess(
      await openWhelpingSessionCore(
        {
          litterId: ids.mainLitter,
          clientCommandId: ids.openMainCommand,
          startedAt: "2026-07-19T06:00:00+02:00",
          timezoneName: "Europe/Paris",
          note: "Début de surveillance",
        },
        owner,
      ),
    );
    createdSessionIds.add(mainOpen.sessionId);
    expect(mainOpen.motherId).toBe(ids.mainMother);

    const mainReplay = requireSuccess(
      await openWhelpingSessionCore(
        {
          litterId: ids.mainLitter,
          clientCommandId: ids.openMainCommand,
          startedAt: "2026-07-19T04:00:00.000Z",
          timezoneName: "Europe/Paris",
          note: "Début de surveillance",
        },
        owner,
      ),
    );
    expect(mainReplay).toMatchObject({
      sessionId: mainOpen.sessionId,
      motherId: ids.mainMother,
      replayed: true,
    });

    const conflictingOpen = await openWhelpingSessionCore(
      {
        litterId: ids.mainLitter,
        clientCommandId: ids.openMainCommand,
        startedAt: "2026-07-19T04:01:00.000Z",
        timezoneName: "Europe/Paris",
        note: "Début de surveillance",
      },
      owner,
    );
    expect(conflictingOpen).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const adminOpen = requireSuccess(
      await openWhelpingSessionCore(
        {
          litterId: ids.adminLitter,
          clientCommandId: ids.openAdminCommand,
          startedAt: "2026-07-19T05:00:00.000Z",
          timezoneName: "Europe/Paris",
        },
        admin,
      ),
    );
    createdSessionIds.add(adminOpen.sessionId);

    const memberOpen = requireSuccess(
      await openWhelpingSessionCore(
        {
          litterId: ids.memberLitter,
          clientCommandId: ids.openMemberCommand,
          startedAt: "2026-07-19T05:30:00.000Z",
          timezoneName: "Europe/Paris",
        },
        member,
      ),
    );
    createdSessionIds.add(memberOpen.sessionId);

    const viewerOpen = await openWhelpingSessionCore(
      {
        litterId: ids.viewerLitter,
        clientCommandId: ids.openViewerCommand,
        startedAt: "2026-07-19T05:45:00.000Z",
        timezoneName: "Europe/Paris",
      },
      viewer,
    );
    expect(viewerOpen).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    const disallowedLitterOpen = await openWhelpingSessionCore(
      {
        litterId: ids.viewerLitter,
        clientCommandId: ids.openViewerCommand,
        startedAt: "2026-07-19T05:45:00.000Z",
        timezoneName: "Europe/Paris",
      },
      owner,
    );
    expect(disallowedLitterOpen).toMatchObject({
      outcome: "error",
      error: { code: "invalid_litter" },
    });

    const [concurrentOpenOne, concurrentOpenTwo] = await Promise.all([
      openWhelpingSessionCore(
        {
          litterId: ids.concurrentLitter,
          clientCommandId: ids.openConcurrentOneCommand,
          startedAt: "2026-07-19T06:15:00.000Z",
          timezoneName: "Europe/Paris",
        },
        owner,
      ),
      openWhelpingSessionCore(
        {
          litterId: ids.concurrentLitter,
          clientCommandId: ids.openConcurrentTwoCommand,
          startedAt: "2026-07-19T06:16:00.000Z",
          timezoneName: "Europe/Paris",
        },
        ownerSecond,
      ),
    ]);
    const concurrentSuccess = [concurrentOpenOne, concurrentOpenTwo].filter(
      (result) => result.outcome === "success",
    );
    const concurrentFailure = [concurrentOpenOne, concurrentOpenTwo].filter(
      (result) => result.outcome === "error",
    );
    expect(concurrentSuccess).toHaveLength(1);
    expect(concurrentFailure).toHaveLength(1);
    expect(concurrentFailure[0]).toMatchObject({ error: { code: "already_open" } });
    if (concurrentSuccess[0].outcome !== "success") throw new Error("Missing open session.");
    createdSessionIds.add(concurrentSuccess[0].sessionId);
    expect(
      Number(
        sql(`
          select count(*) from public.whelping_sessions
          where litter_id = ${q(ids.concurrentLitter)}::uuid and status = 'open';
        `),
      ),
    ).toBe(1);

    const occurredAt = "2026-07-19T04:20:00.000Z";
    const recordedAfter = new Date().toISOString();
    const mainEvent = requireSuccess(
      await recordWhelpingEventCore(
        {
          sessionId: mainOpen.sessionId,
          clientCommandId: ids.eventMainCommand,
          occurredAt,
          eventType: "labor_started",
          note: "Travail observé",
        },
        owner,
      ),
    );
    createdEventIds.add(mainEvent.eventId);

    const adminEvent = requireSuccess(
      await recordWhelpingEventCore(
        {
          sessionId: adminOpen.sessionId,
          clientCommandId: ids.eventAdminCommand,
          occurredAt: "2026-07-19T05:10:00.000Z",
          eventType: "observation",
          note: "Observation admin",
        },
        admin,
      ),
    );
    createdEventIds.add(adminEvent.eventId);

    const memberEvent = requireSuccess(
      await recordWhelpingEventCore(
        {
          sessionId: memberOpen.sessionId,
          clientCommandId: ids.eventMemberCommand,
          occurredAt: "2026-07-19T05:40:00.000Z",
          eventType: "contractions",
        },
        member,
      ),
    );
    createdEventIds.add(memberEvent.eventId);

    const viewerEvent = await recordWhelpingEventCore(
      {
        sessionId: mainOpen.sessionId,
        clientCommandId: ids.eventViewerCommand,
        occurredAt: "2026-07-19T05:50:00.000Z",
        eventType: "observation",
      },
      viewer,
    );
    expect(viewerEvent).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

    const eventReplay = requireSuccess(
      await recordWhelpingEventCore(
        {
          sessionId: mainOpen.sessionId,
          clientCommandId: ids.eventMainCommand,
          occurredAt,
          eventType: "labor_started",
          note: "Travail observé",
        },
        owner,
      ),
    );
    expect(eventReplay).toMatchObject({
      eventId: mainEvent.eventId,
      sequenceNo: mainEvent.sequenceNo,
      replayed: true,
    });

    const eventConflict = await recordWhelpingEventCore(
      {
        sessionId: mainOpen.sessionId,
        clientCommandId: ids.eventMainCommand,
        occurredAt,
        eventType: "labor_started",
        note: "Intention différente",
      },
      owner,
    );
    expect(eventConflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const crossTypeCommandConflict = await recordWhelpingEventCore(
      {
        sessionId: mainOpen.sessionId,
        clientCommandId: ids.openMainCommand,
        occurredAt,
        eventType: "observation",
      },
      owner,
    );
    expect(crossTypeCommandConflict).toMatchObject({
      outcome: "error",
      error: { code: "conflict" },
    });

    const [concurrentEventOne, concurrentEventTwo] = await Promise.all([
      recordWhelpingEventCore(
        {
          sessionId: mainOpen.sessionId,
          clientCommandId: ids.eventConcurrentOneCommand,
          occurredAt: "2026-07-19T04:30:00.000Z",
          eventType: "contractions",
        },
        owner,
      ),
      recordWhelpingEventCore(
        {
          sessionId: mainOpen.sessionId,
          clientCommandId: ids.eventConcurrentTwoCommand,
          occurredAt: "2026-07-19T04:31:00.000Z",
          eventType: "water_broke",
        },
        ownerSecond,
      ),
    ]);
    const concurrentEventSuccessOne = requireSuccess(concurrentEventOne);
    const concurrentEventSuccessTwo = requireSuccess(concurrentEventTwo);
    createdEventIds.add(concurrentEventSuccessOne.eventId);
    createdEventIds.add(concurrentEventSuccessTwo.eventId);
    expect(concurrentEventSuccessOne.sequenceNo).not.toBe(
      concurrentEventSuccessTwo.sequenceNo,
    );
    expect(
      new Set([
        mainEvent.sequenceNo,
        concurrentEventSuccessOne.sequenceNo,
        concurrentEventSuccessTwo.sequenceNo,
      ]).size,
    ).toBe(3);

    for (const [commandId, eventType] of [
      [ids.eventBirthCommand, "birth"],
      [ids.eventSessionClosedCommand, "session_closed"],
    ] as const) {
      const forbiddenType = await owner.rpc("record_whelping_event", {
        p_session_id: mainOpen.sessionId,
        p_client_command_id: commandId,
        p_occurred_at: "2026-07-19T04:35:00.000Z",
        p_event_type: eventType,
        p_note: null,
      });
      expect(forbiddenType.error).toBeNull();
      expect(forbiddenType.data?.[0]).toMatchObject({
        outcome: "error",
        reason: "invalid_event_type",
      });
    }

    const viewerRead = requireSuccess(
      await listWhelpingEventsForSessionCore({ sessionId: mainOpen.sessionId }, viewer),
    );
    expect(viewerRead.role).toBe("viewer");
    expect(viewerRead.events.map((event) => event.sequenceNo)).toEqual(
      [...viewerRead.events.map((event) => event.sequenceNo)].sort((a, b) => a - b),
    );

    const recordedRow = viewerRead.events.find((event) => event.id === mainEvent.eventId);
    expect(Date.parse(recordedRow!.occurredAt)).toBe(Date.parse(occurredAt));
    expect(Date.parse(recordedRow!.recordedAt)).not.toBe(Date.parse(occurredAt));
    expect(Date.parse(recordedRow!.recordedAt)).toBeGreaterThanOrEqual(
      Date.parse(recordedAfter) - 2_000,
    );

    const foreignOpen = await openWhelpingSessionCore(
      {
        litterId: ids.foreignLitter,
        clientCommandId: ids.foreignOpenCommand,
        startedAt: "2026-07-19T06:00:00.000Z",
        timezoneName: "Europe/Paris",
      },
      owner,
    );
    expect(foreignOpen).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    const foreignEvent = await recordWhelpingEventCore(
      {
        sessionId: ids.foreignSession,
        clientCommandId: ids.foreignEventCommand,
        occurredAt: "2026-07-19T06:10:00.000Z",
        eventType: "observation",
      },
      owner,
    );
    expect(foreignEvent).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    const foreignRead = await listWhelpingEventsForSessionCore(
      { sessionId: ids.foreignSession },
      owner,
    );
    expect(foreignRead).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const invalidClose = await closeWhelpingSessionCore(
      {
        sessionId: mainOpen.sessionId,
        clientCommandId: ids.closeInvalidCommand,
        endedAt: "2026-07-19T03:59:59.000Z",
      },
      owner,
    );
    expect(invalidClose).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'status', status,
            'ended_at', ended_at,
            'closed_events', (
              select count(*) from public.whelping_events event
              where event.session_id = session.id and event.event_type = 'session_closed'
            )
          )::text
          from public.whelping_sessions session
          where id = ${q(mainOpen.sessionId)}::uuid;
        `),
      ),
    ).toEqual({ status: "open", ended_at: null, closed_events: 0 });

    const mainClose = requireSuccess(
      await closeWhelpingSessionCore(
        {
          sessionId: mainOpen.sessionId,
          clientCommandId: ids.closeMainCommand,
          endedAt: "2026-07-19T08:00:00.000Z",
          note: "Clôture confirmée",
        },
        owner,
      ),
    );
    createdEventIds.add(mainClose.eventId);
    const closeReplay = requireSuccess(
      await closeWhelpingSessionCore(
        {
          sessionId: mainOpen.sessionId,
          clientCommandId: ids.closeMainCommand,
          endedAt: "2026-07-19T08:00:00.000Z",
          note: "Clôture confirmée",
        },
        owner,
      ),
    );
    expect(closeReplay).toMatchObject({
      eventId: mainClose.eventId,
      sequenceNo: mainClose.sequenceNo,
      replayed: true,
    });

    const closeRow = JSON.parse(
      sql(`
        select json_build_object(
          'status', session.status,
          'ended_at', session.ended_at,
          'closed_event_count', count(event.id),
          'closed_event_id', min(event.id::text),
          'sequence_no', min(event.sequence_no)
        )::text
        from public.whelping_sessions session
        left join public.whelping_events event
          on event.organization_id = session.organization_id
         and event.session_id = session.id
         and event.event_type = 'session_closed'
        where session.id = ${q(mainOpen.sessionId)}::uuid
        group by session.id;
      `),
    ) as Record<string, unknown>;
    expect(closeRow).toMatchObject({
      status: "closed",
      ended_at: "2026-07-19T08:00:00+00:00",
      closed_event_count: 1,
      closed_event_id: mainClose.eventId,
      sequence_no: mainClose.sequenceNo,
    });

    const afterClose = await recordWhelpingEventCore(
      {
        sessionId: mainOpen.sessionId,
        clientCommandId: ids.eventAfterCloseCommand,
        occurredAt: "2026-07-19T08:01:00.000Z",
        eventType: "observation",
      },
      owner,
    );
    expect(afterClose).toMatchObject({
      outcome: "error",
      error: { code: "session_closed" },
    });

    for (const [client, sessionId, commandId, endedAt] of [
      [admin, adminOpen.sessionId, ids.closeAdminCommand, "2026-07-19T07:00:00.000Z"],
      [member, memberOpen.sessionId, ids.closeMemberCommand, "2026-07-19T07:30:00.000Z"],
    ] as const) {
      const closed = requireSuccess(
        await closeWhelpingSessionCore(
          { sessionId, clientCommandId: commandId, endedAt },
          client,
        ),
      );
      createdEventIds.add(closed.eventId);
    }

    const openSessionRead = requireSuccess(
      await getOpenWhelpingSessionForLitterCore(
        { litterId: ids.concurrentLitter },
        viewer,
      ),
    );
    expect(openSessionRead).toMatchObject({ role: "viewer" });
    expect(openSessionRead.session?.status).toBe("open");
    const historyRead = requireSuccess(
      await listWhelpingSessionsForLitterCore({ litterId: ids.mainLitter }, viewer),
    );
    expect(historyRead.sessions).toHaveLength(1);
    expect(historyRead.sessions[0]).toMatchObject({
      id: mainOpen.sessionId,
      status: "closed",
      motherId: ids.mainMother,
    });

    const directSessionInsert = await viewer.from("whelping_sessions").insert({
      organization_id: organizationId,
      litter_id: ids.viewerLitter,
      mother_id: ids.viewerMother,
      status: "open",
      started_at: "2026-07-19T09:00:00.000Z",
      timezone_name: "Europe/Paris",
    });
    expect(directSessionInsert.error).not.toBeNull();
    const directEventUpdate = await owner
      .from("whelping_events")
      .update({ note: "Mutation interdite" })
      .eq("id", mainEvent.eventId);
    expect(directEventUpdate.error).not.toBeNull();
    const directEventDelete = await owner
      .from("whelping_events")
      .delete()
      .eq("id", mainEvent.eventId);
    expect(directEventDelete.error).not.toBeNull();

    expect(businessSnapshot()).toEqual(before);

    console.log(
      `WHELPING_FIXTURE_IDS sessions=${[...createdSessionIds].sort().join(",")} events=${[
        ...createdEventIds,
      ]
        .sort()
        .join(",")}`,
    );
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
