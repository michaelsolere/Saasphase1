import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  listWhelpingBirthsForSessionCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f190003-0000-4000-8000-0000000000";
const namePrefix = "E2E whelping births foundation";

const ids = {
  father: `${prefix}01`,
  mainMother: `${prefix}02`,
  concurrentMother: `${prefix}03`,
  conflictMother: `${prefix}04`,
  mixedMother: `${prefix}05`,
  closedMother: `${prefix}06`,
  incoherentMother: `${prefix}07`,
  foreignMother: `${prefix}08`,
  mainLitter: `${prefix}11`,
  concurrentLitter: `${prefix}12`,
  conflictLitter: `${prefix}13`,
  mixedLitter: `${prefix}14`,
  closedLitter: `${prefix}15`,
  incoherentLitter: `${prefix}16`,
  foreignLitter: `${prefix}17`,
  mainSession: `${prefix}21`,
  concurrentSession: `${prefix}22`,
  conflictSession: `${prefix}23`,
  mixedSession: `${prefix}24`,
  closedSession: `${prefix}25`,
  incoherentSession: `${prefix}26`,
  foreignSession: `${prefix}27`,
  administrativeOffspring: `${prefix}28`,
  duplicateOrderAnimal: `${prefix}29`,
  otherOrganization: `${prefix}30`,
  adminUser: `${prefix}31`,
  adminIdentity: `${prefix}32`,
  adminMembership: `${prefix}33`,
  memberUser: `${prefix}41`,
  memberIdentity: `${prefix}42`,
  memberMembership: `${prefix}43`,
  viewerUser: `${prefix}51`,
  viewerIdentity: `${prefix}52`,
  viewerMembership: `${prefix}53`,
  ownerBirthCommand: `${prefix}61`,
  adminBirthCommand: `${prefix}62`,
  memberBirthCommand: `${prefix}63`,
  viewerBirthCommand: `${prefix}64`,
  concurrentBirthOneCommand: `${prefix}65`,
  concurrentBirthTwoCommand: `${prefix}66`,
  conflictDateCommand: `${prefix}67`,
  mixedModeCommand: `${prefix}68`,
  closedCommand: `${prefix}69`,
  incoherentCommand: `${prefix}70`,
  foreignCommand: `${prefix}71`,
  invalidWeightCommand: `${prefix}72`,
  invalidMeasuredAtCommand: `${prefix}73`,
} as const;

const users = {
  admin: {
    id: ids.adminUser,
    identityId: ids.adminIdentity,
    membershipId: ids.adminMembership,
    role: "admin",
    email: "whelping-birth-admin@saasphase1.invalid",
    password: "WhelpingBirthAdmin-2026!",
  },
  member: {
    id: ids.memberUser,
    identityId: ids.memberIdentity,
    membershipId: ids.memberMembership,
    role: "member",
    email: "whelping-birth-member@saasphase1.invalid",
    password: "WhelpingBirthMember-2026!",
  },
  viewer: {
    id: ids.viewerUser,
    identityId: ids.viewerIdentity,
    membershipId: ids.viewerMembership,
    role: "viewer",
    email: "whelping-birth-viewer@saasphase1.invalid",
    password: "WhelpingBirthViewer-2026!",
  },
} as const;

const litterIds = [
  ids.mainLitter,
  ids.concurrentLitter,
  ids.conflictLitter,
  ids.mixedLitter,
  ids.closedLitter,
  ids.incoherentLitter,
  ids.foreignLitter,
];
const sessionIds = [
  ids.mainSession,
  ids.concurrentSession,
  ids.conflictSession,
  ids.mixedSession,
  ids.closedSession,
  ids.incoherentSession,
  ids.foreignSession,
];
const parentIds = [
  ids.father,
  ids.mainMother,
  ids.concurrentMother,
  ids.conflictMother,
  ids.mixedMother,
  ids.closedMother,
  ids.incoherentMother,
  ids.foreignMother,
];
const created = {
  births: [] as string[],
  events: [] as string[],
  animals: [] as string[],
  weights: [] as string[],
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function uuidList(values: string[]) {
  return values.map((value) => `${q(value)}::uuid`).join(", ");
}

function cleanup() {
  sql(`
    delete from public.whelping_commands
    where client_command_id::text like '9f190003-%'
       or litter_id in (${uuidList(litterIds)})
       or session_id in (${uuidList(sessionIds)});

    delete from public.animal_weight_measurements
    where source_birth_id in (
      select birth.id from public.whelping_births birth
      where birth.session_id in (${uuidList(sessionIds)})
    ) or animal_id in (
      select animal.id from public.animals animal
      where animal.litter_id in (${uuidList(litterIds)})
    );

    delete from public.whelping_births
    where session_id in (${uuidList(sessionIds)})
       or id::text like '9f190003-%';

    delete from public.whelping_events
    where session_id in (${uuidList(sessionIds)})
       or id::text like '9f190003-%';

    delete from public.animals
    where litter_id in (${uuidList(litterIds)});

    delete from public.whelping_sessions
    where id in (${uuidList(sessionIds)})
       or id::text like '9f190003-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id in (${uuidList(litterIds)})
       or id::text like '9f190003-%'
       or name like ${q(`${namePrefix}%`)};

    delete from public.animals
    where id in (${uuidList(parentIds)})
       or id::text like '9f190003-%'
       or call_name like ${q(`${namePrefix}%`)};

    delete from public.memberships where id::text like '9f190003-%';
    delete from auth.identities where user_id::text like '9f190003-%';
    delete from auth.users where id::text like '9f190003-%';
    delete from public.organizations
    where id = ${q(ids.otherOrganization)}::uuid
       or slug = 'e2e-whelping-births-isolated';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'whelping_commands', (select count(*) from public.whelping_commands
          where client_command_id::text like '9f190003-%'
             or litter_id in (${uuidList(litterIds)})
             or session_id in (${uuidList(sessionIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f190003-%'
             or animal_id in (select id from public.animals where litter_id in (${uuidList(litterIds)}))
             or source_birth_id in (select id from public.whelping_births where session_id in (${uuidList(sessionIds)}))),
        'whelping_births', (select count(*) from public.whelping_births
          where id::text like '9f190003-%' or session_id in (${uuidList(sessionIds)})),
        'whelping_events', (select count(*) from public.whelping_events
          where id::text like '9f190003-%' or session_id in (${uuidList(sessionIds)})),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like '9f190003-%' or litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id::text like '9f190003-%'
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${namePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like '9f190003-%' or name like ${q(`${namePrefix}%`)}),
        'memberships', (select count(*) from public.memberships where id::text like '9f190003-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f190003-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190003-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f190003-%'),
        'organizations', (select count(*) from public.organizations
          where id::text like '9f190003-%' or slug = 'e2e-whelping-births-isolated')
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function createUsers() {
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
        ${q(user.id)}::uuid, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', ${q(user.email)},
        extensions.crypt(${q(user.password)}, extensions.gen_salt('bf')),
        now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(`Birth ${user.role}`)}), now(), now()
      );

      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(user.identityId)}::uuid, ${q(user.email)}, ${q(user.id)}::uuid,
        jsonb_build_object(
          'sub', ${q(user.id)}, 'email', ${q(user.email)},
          'email_verified', true, 'phone_verified', false
        ), 'email', now(), now()
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
    values (${q(ids.otherOrganization)}::uuid, 'E2E Whelping Births Isolated',
      'e2e-whelping-births-isolated');

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} father`)},
       'dog', 'Golden Retriever', 'male', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mainMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} main mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} concurrent mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.conflictMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} conflict mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mixedMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} mixed mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} closed mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incoherentMother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} incoherent mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(`${namePrefix} foreign mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      actual_birth_date, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} main litter`)},
       'dog', 'Golden Retriever', ${q(ids.mainMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} concurrent litter`)},
       'dog', 'Golden Retriever', ${q(ids.concurrentMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_in_progress', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.conflictLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} conflict litter`)},
       'dog', 'Golden Retriever', ${q(ids.conflictMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', '2026-07-18', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mixedLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} mixed litter`)},
       'dog', 'Golden Retriever', ${q(ids.mixedMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} closed litter`)},
       'dog', 'Golden Retriever', ${q(ids.closedMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incoherentLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} incoherent litter`)},
       'dog', 'Golden Retriever', ${q(ids.incoherentMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(`${namePrefix} foreign litter`)},
       'dog', 'Golden Retriever', ${q(ids.foreignMother)}::uuid, null,
       'birth_expected', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, father_id, species, breed,
      sex, status, ownership_status, birth_order, created_by, updated_by
    ) values (
      ${q(ids.administrativeOffspring)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.mixedLitter)}::uuid, ${q(ids.mixedMother)}::uuid, ${q(ids.father)}::uuid,
      'dog', 'Golden Retriever', 'unknown', 'born', 'produced', 1,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values
      (${q(ids.mainSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       ${q(ids.mainMother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.concurrentLitter)}::uuid,
       ${q(ids.concurrentMother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.conflictSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.conflictLitter)}::uuid,
       ${q(ids.conflictMother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mixedSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mixedLitter)}::uuid,
       ${q(ids.mixedMother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.closedLitter)}::uuid,
       ${q(ids.closedMother)}::uuid, 'closed', '2026-07-19T20:00:00Z', '2026-07-19T21:00:00Z',
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incoherentSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.incoherentLitter)}::uuid,
       ${q(ids.incoherentMother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignSession)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(ids.foreignLitter)}::uuid,
       ${q(ids.foreignMother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    update public.litters
    set deleted_at = now()
    where id = ${q(ids.incoherentLitter)}::uuid;
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
  if (result.outcome !== "success") throw new Error("Expected success");
  return result;
}

function intent(sessionId: string, commandId: string, overrides = {}) {
  return {
    sessionId,
    clientCommandId: commandId,
    occurredAt: "2026-07-19T21:58:00.000Z",
    sex: "male" as const,
    viability: "alive" as const,
    ...overrides,
  };
}

function sideEffectCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (select count(*) from public.events),
        'tasks', (select count(*) from public.litter_care_tasks),
        'reservations', (select count(*) from public.reservations),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments)
      )::text;
    `),
  );
}

test("records atomic idempotent births and protects journal projections", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createUsers();
    createBusinessFixtures();

    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecond = await createAuthenticatedSupabaseClient();
    const admin = await clientFor(users.admin);
    const member = await clientFor(users.member);
    const viewer = await clientFor(users.viewer);
    const sideEffectsBefore = sideEffectCounts();

    const viewerWrite = await recordWhelpingBirthCore(
      intent(ids.mainSession, ids.viewerBirthCommand),
      viewer,
    );
    expect(viewerWrite).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

    const foreignWrite = await recordWhelpingBirthCore(
      intent(ids.foreignSession, ids.foreignCommand),
      owner,
    );
    expect(foreignWrite).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    const foreignRead = await listWhelpingBirthsForSessionCore(
      { sessionId: ids.foreignSession },
      owner,
    );
    expect(foreignRead).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const closedWrite = await recordWhelpingBirthCore(
      intent(ids.closedSession, ids.closedCommand, { occurredAt: "2026-07-19T20:30:00Z" }),
      owner,
    );
    expect(closedWrite).toMatchObject({ outcome: "error", error: { code: "session_closed" } });

    const incoherentWrite = await recordWhelpingBirthCore(
      intent(ids.incoherentSession, ids.incoherentCommand),
      owner,
    );
    expect(incoherentWrite).toMatchObject({ outcome: "error", error: { code: "invalid_session" } });

    const invalidWeight = await recordWhelpingBirthCore(
      intent(ids.mainSession, ids.invalidWeightCommand, { birthWeightGrams: 420 }),
      owner,
    );
    const invalidMeasuredAt = await recordWhelpingBirthCore(
      intent(ids.mainSession, ids.invalidMeasuredAtCommand, {
        measuredAt: "2026-07-19T22:05:00Z",
      }),
      owner,
    );
    expect(invalidWeight).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    expect(invalidMeasuredAt).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });

    const ownerBirthIntent = intent(ids.mainSession, ids.ownerBirthCommand, {
      initialCollarColor: "Bleu",
      birthWeightGrams: 420,
      measuredAt: "2026-07-19T22:05:00.000Z",
      note: "Première naissance",
    });
    const ownerBirth = requireSuccess(await recordWhelpingBirthCore(ownerBirthIntent, owner));
    created.births.push(ownerBirth.birthId);
    created.events.push(ownerBirth.eventId);
    created.animals.push(ownerBirth.animalId);
    created.weights.push(ownerBirth.weightMeasurementId!);
    expect(ownerBirth).toMatchObject({
      eventSequenceNo: 1,
      birthOrder: 1,
      replayed: false,
    });

    const replay = requireSuccess(await recordWhelpingBirthCore(ownerBirthIntent, owner));
    expect(replay).toEqual({ ...ownerBirth, replayed: true });

    const commandConflict = await recordWhelpingBirthCore(
      { ...ownerBirthIntent, sex: "female" },
      owner,
    );
    expect(commandConflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const adminBirth = requireSuccess(
      await recordWhelpingBirthCore(
        intent(ids.mainSession, ids.adminBirthCommand, {
          occurredAt: "2026-07-19T22:10:00.000Z",
          sex: "female",
          viability: "stillborn",
          initialCollarColor: "Rose",
        }),
        admin,
      ),
    );
    const memberBirth = requireSuccess(
      await recordWhelpingBirthCore(
        intent(ids.mainSession, ids.memberBirthCommand, {
          occurredAt: "2026-07-19T22:20:00.000Z",
          sex: "unknown",
          viability: "unknown",
        }),
        member,
      ),
    );
    for (const result of [adminBirth, memberBirth]) {
      created.births.push(result.birthId);
      created.events.push(result.eventId);
      created.animals.push(result.animalId);
    }
    expect(adminBirth.weightMeasurementId).toBeNull();
    expect(memberBirth.weightMeasurementId).toBeNull();

    for (const [client, role] of [
      [owner, "owner"],
      [admin, "admin"],
      [member, "member"],
      [viewer, "viewer"],
    ] as const) {
      const read = requireSuccess(
        await listWhelpingBirthsForSessionCore({ sessionId: ids.mainSession }, client),
      );
      expect(read.role).toBe(role);
      expect(read.births.map((birth) => birth.birthOrder)).toEqual([1, 2, 3]);
      expect(read.births[0]).toMatchObject({
        id: ownerBirth.birthId,
        event: { id: ownerBirth.eventId, occurredAt: "2026-07-19T21:58:00+00:00" },
        animal: { id: ownerBirth.animalId, birthWeightGrams: 420 },
        birthWeightMeasurement: {
          id: ownerBirth.weightMeasurementId,
          grams: 420,
          measuredAt: "2026-07-19T22:05:00+00:00",
        },
      });
    }

    const mainProjection = JSON.parse(
      sql(`
        select json_build_object(
          'actual_birth_date', actual_birth_date,
          'born_total_count', born_total_count,
          'born_male_count', born_male_count,
          'born_female_count', born_female_count,
          'alive_count', alive_count,
          'status', status
        )::text
        from public.litters where id = ${q(ids.mainLitter)}::uuid;
      `),
    );
    expect(mainProjection).toEqual({
      actual_birth_date: "2026-07-19",
      born_total_count: 3,
      born_male_count: 1,
      born_female_count: 1,
      alive_count: 1,
      status: "birth_expected",
    });

    const animalProjection = JSON.parse(
      sql(`
        select json_build_object(
          'organization_id', organization_id,
          'litter_id', litter_id,
          'mother_id', mother_id,
          'father_id', father_id,
          'species', species,
          'breed', breed,
          'birth_date', birth_date,
          'birth_time', birth_time,
          'birth_order', birth_order,
          'birth_weight_grams', birth_weight_grams,
          'sex', sex,
          'collar_color_initial', collar_color_initial,
          'collar_color_current', collar_color_current,
          'ownership_status', ownership_status,
          'status', status,
          'death_date', death_date,
          'call_name', call_name,
          'official_name', official_name
        )::text from public.animals where id = ${q(ownerBirth.animalId)}::uuid;
      `),
    );
    expect(animalProjection).toMatchObject({
      organization_id: organizationId,
      litter_id: ids.mainLitter,
      mother_id: ids.mainMother,
      father_id: ids.father,
      species: "dog",
      breed: "Golden Retriever",
      birth_date: "2026-07-19",
      birth_time: "23:58:00",
      birth_order: 1,
      birth_weight_grams: 420,
      sex: "male",
      collar_color_initial: "Bleu",
      collar_color_current: "Bleu",
      ownership_status: "produced",
      status: "born",
      death_date: null,
      call_name: null,
      official_name: null,
    });
    expect(
      JSON.parse(
        sql(`select json_build_object('status', status, 'birth_date', birth_date,
          'death_date', death_date)::text from public.animals
          where id = ${q(adminBirth.animalId)}::uuid;`),
      ),
    ).toEqual({ status: "stillborn", birth_date: "2026-07-20", death_date: "2026-07-20" });

    const [concurrentOne, concurrentTwo] = await Promise.all([
      recordWhelpingBirthCore(
        intent(ids.concurrentSession, ids.concurrentBirthOneCommand, {
          occurredAt: "2026-07-19T22:30:00Z",
        }),
        ownerSecond,
      ),
      recordWhelpingBirthCore(
        intent(ids.concurrentSession, ids.concurrentBirthTwoCommand, {
          occurredAt: "2026-07-19T22:31:00Z",
          sex: "female",
        }),
        admin,
      ),
    ]);
    const concurrentResults = [requireSuccess(concurrentOne), requireSuccess(concurrentTwo)];
    expect(new Set(concurrentResults.map((result) => result.eventId)).size).toBe(2);
    expect(new Set(concurrentResults.map((result) => result.animalId)).size).toBe(2);
    expect(new Set(concurrentResults.map((result) => result.eventSequenceNo)).size).toBe(2);
    expect(new Set(concurrentResults.map((result) => result.birthOrder)).size).toBe(2);
    for (const result of concurrentResults) {
      created.births.push(result.birthId);
      created.events.push(result.eventId);
      created.animals.push(result.animalId);
    }

    const conflictDateBefore = sql(`select count(*) from public.whelping_events
      where session_id = ${q(ids.conflictSession)}::uuid;`);
    const conflictDate = await recordWhelpingBirthCore(
      intent(ids.conflictSession, ids.conflictDateCommand),
      owner,
    );
    expect(conflictDate).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(sql(`select count(*) from public.whelping_events
      where session_id = ${q(ids.conflictSession)}::uuid;`)).toBe(conflictDateBefore);

    const mixedMode = await recordWhelpingBirthCore(
      intent(ids.mixedSession, ids.mixedModeCommand),
      owner,
    );
    expect(mixedMode).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(sql(`select count(*) from public.whelping_events
      where session_id in (${q(ids.mixedSession)}::uuid, ${q(ids.conflictSession)}::uuid);`)).toBe("0");

    const adminInsertDuringSession = await owner.from("animals").insert({
      organization_id: organizationId,
      litter_id: ids.concurrentLitter,
      mother_id: ids.concurrentMother,
      father_id: ids.father,
      species: "dog",
      breed: "Golden Retriever",
      sex: "unknown",
      status: "born",
      ownership_status: "produced",
    });
    const adminInsertAfterBirth = await owner.from("animals").insert({
      organization_id: organizationId,
      litter_id: ids.mainLitter,
      mother_id: ids.mainMother,
      father_id: ids.father,
      species: "dog",
      breed: "Golden Retriever",
      sex: "unknown",
      status: "born",
      ownership_status: "produced",
    });
    expect(adminInsertDuringSession.error).not.toBeNull();
    expect(adminInsertAfterBirth.error).not.toBeNull();

    expect(
      sql(`
        do $$
        begin
          begin
            perform pg_catalog.set_config('app.whelping_birth_rpc', 'on', true);
            insert into public.animals (
              id, organization_id, litter_id, mother_id, father_id, species, breed,
              sex, status, ownership_status, birth_order, created_by, updated_by
            ) values (
              ${q(ids.duplicateOrderAnimal)}::uuid, ${q(organizationId)}::uuid,
              ${q(ids.mainLitter)}::uuid, ${q(ids.mainMother)}::uuid, ${q(ids.father)}::uuid,
              'dog', 'Golden Retriever', 'unknown', 'born', 'produced', 1,
              ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
            );
            raise exception 'expected unique violation';
          exception when unique_violation then
            null;
          end;
        end;
        $$;
        select 'unique_violation';
      `),
    ).toBe("DO\nunique_violation");

    const protectedAnimal = await owner
      .from("animals")
      .update({ birth_weight_grams: 421 })
      .eq("id", ownerBirth.animalId);
    const evolvingAnimal = await owner
      .from("animals")
      .update({ collar_color_current: "Vert" })
      .eq("id", ownerBirth.animalId);
    const protectedLitterProjection = await owner
      .from("litters")
      .update({ born_total_count: 99 })
      .eq("id", ids.mainLitter);
    const protectedLitterParentage = await owner
      .from("litters")
      .update({ breed: "Labrador Retriever" })
      .eq("id", ids.mainLitter);
    expect(protectedAnimal.error).not.toBeNull();
    expect(evolvingAnimal.error).toBeNull();
    expect(protectedLitterProjection.error).not.toBeNull();
    expect(protectedLitterParentage.error).not.toBeNull();

    const directBirthUpdate = await owner
      .from("whelping_births")
      .update({ viability: "unknown" })
      .eq("id", ownerBirth.birthId);
    const directBirthDelete = await owner
      .from("whelping_births")
      .delete()
      .eq("id", ownerBirth.birthId);
    const directWeightUpdate = await owner
      .from("animal_weight_measurements")
      .update({ grams: 421 })
      .eq("id", ownerBirth.weightMeasurementId!);
    const directWeightDelete = await owner
      .from("animal_weight_measurements")
      .delete()
      .eq("id", ownerBirth.weightMeasurementId!);
    expect(directBirthUpdate.error).not.toBeNull();
    expect(directBirthDelete.error).not.toBeNull();
    expect(directWeightUpdate.error).not.toBeNull();
    expect(directWeightDelete.error).not.toBeNull();

    const atomicCounts = JSON.parse(
      sql(`
        select json_build_object(
          'events', (select count(*) from public.whelping_events where session_id = ${q(ids.mainSession)}::uuid and event_type = 'birth'),
          'births', (select count(*) from public.whelping_births where session_id = ${q(ids.mainSession)}::uuid),
          'animals', (select count(*) from public.animals where litter_id = ${q(ids.mainLitter)}::uuid),
          'weights', (select count(*) from public.animal_weight_measurements
            where source_birth_id in (
              select id from public.whelping_births where session_id = ${q(ids.mainSession)}::uuid
            ))
        )::text;
      `),
    );
    expect(atomicCounts).toEqual({ events: 3, births: 3, animals: 3, weights: 1 });
    expect(sideEffectCounts()).toEqual(sideEffectsBefore);

    console.info(
      JSON.stringify({
        whelpingBirthFixtureCleanup: {
          created: {
            sessions: sessionIds,
            litters: litterIds,
            parents: parentIds,
            ...created,
          },
        },
      }),
    );
  } finally {
    cleanup();
    const remaining = remainingCounts();
    expectCleanupAtZero();
    console.info(
      JSON.stringify({
        whelpingBirthFixtureCleanup: {
          deleted: {
            sessions: sessionIds,
            litters: litterIds,
            parents: parentIds,
            ...created,
          },
          remaining,
        },
      }),
    );
  }
});
