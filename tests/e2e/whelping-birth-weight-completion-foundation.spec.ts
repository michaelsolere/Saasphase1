import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  closeWhelpingSessionCore,
  listWhelpingBirthsForSessionCore,
  recordWhelpingBirthCore,
  recordWhelpingBirthWeightCore,
} from "../../src/features/whelping/whelping-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f190004-0000-4000-8000-0000000000";
const namePrefix = "E2E whelping birth weight completion";

const ids = {
  father: `${prefix}01`,
  mother: `${prefix}02`,
  foreignMother: `${prefix}03`,
  inconsistentMother: `${prefix}04`,
  mainLitter: `${prefix}11`,
  foreignLitter: `${prefix}12`,
  inconsistentLitter: `${prefix}13`,
  mainSession: `${prefix}21`,
  foreignSession: `${prefix}22`,
  inconsistentSession: `${prefix}23`,
  foreignEvent: `${prefix}31`,
  foreignAnimal: `${prefix}32`,
  foreignBirth: `${prefix}33`,
  inconsistentEvent: `${prefix}34`,
  inconsistentAnimal: `${prefix}35`,
  inconsistentBirth: `${prefix}36`,
  viewerUser: `${prefix}41`,
  viewerIdentity: `${prefix}42`,
  viewerMembership: `${prefix}43`,
  missingBirthCommand: `${prefix}51`,
  beforeBirthCommand: `${prefix}52`,
  concurrentBirthCommand: `${prefix}53`,
  initialWeightBirthCommand: `${prefix}54`,
  closeCommand: `${prefix}55`,
  completionCommand: `${prefix}61`,
  secondCompletionCommand: `${prefix}62`,
  beforeTimeCommand: `${prefix}63`,
  viewerCommand: `${prefix}64`,
  foreignCommand: `${prefix}65`,
  initialWeightCompletionCommand: `${prefix}66`,
  concurrentCompletionOneCommand: `${prefix}67`,
  concurrentCompletionTwoCommand: `${prefix}68`,
  inconsistentWeightCommand: `${prefix}69`,
  memberCompletionCommand: `${prefix}70`,
} as const;

const viewer = {
  id: ids.viewerUser,
  identityId: ids.viewerIdentity,
  membershipId: ids.viewerMembership,
  email: "whelping-birth-weight-viewer@saasphase1.invalid",
  password: "WhelpingBirthWeightViewer-2026!",
} as const;

const litterIds = [ids.mainLitter, ids.foreignLitter, ids.inconsistentLitter];
const sessionIds = [ids.mainSession, ids.foreignSession, ids.inconsistentSession];
const parentIds = [ids.father, ids.mother, ids.foreignMother, ids.inconsistentMother];
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

function uuidList(values: readonly string[]) {
  return values.map((value) => `${q(value)}::uuid`).join(", ");
}

function cleanup() {
  sql(`
    delete from public.whelping_commands
    where client_command_id::text like '9f190004-%'
       or litter_id in (${uuidList(litterIds)})
       or session_id in (${uuidList(sessionIds)});

    delete from public.animal_weight_measurements
    where id::text like '9f190004-%'
       or source_birth_id in (
         select id from public.whelping_births
         where id::text like '9f190004-%'
            or session_id in (${uuidList(sessionIds)})
       )
       or animal_id in (
         select id from public.animals
         where id::text like '9f190004-%'
            or litter_id in (${uuidList(litterIds)})
       );

    delete from public.whelping_births
    where id::text like '9f190004-%'
       or session_id in (${uuidList(sessionIds)});

    delete from public.whelping_events
    where id::text like '9f190004-%'
       or session_id in (${uuidList(sessionIds)});

    delete from public.animals
    where litter_id in (${uuidList(litterIds)});

    delete from public.whelping_sessions
    where id::text like '9f190004-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id::text like '9f190004-%'
       or name like ${q(`${namePrefix}%`)};

    delete from public.animals
    where id::text like '9f190004-%'
       or call_name like ${q(`${namePrefix}%`)};

    delete from public.memberships where id::text like '9f190004-%';
    delete from auth.identities where user_id::text like '9f190004-%';
    delete from auth.users where id::text like '9f190004-%';
    delete from public.organizations
    where id::text like '9f190004-%'
       or slug = 'e2e-whelping-birth-weight-isolated';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'whelping_commands', (select count(*) from public.whelping_commands
          where client_command_id::text like '9f190004-%'
             or litter_id in (${uuidList(litterIds)})
             or session_id in (${uuidList(sessionIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f190004-%'
             or source_birth_id in (select id from public.whelping_births
               where id::text like '9f190004-%' or session_id in (${uuidList(sessionIds)}))
             or animal_id in (select id from public.animals
               where id::text like '9f190004-%' or litter_id in (${uuidList(litterIds)}))),
        'whelping_births', (select count(*) from public.whelping_births
          where id::text like '9f190004-%' or session_id in (${uuidList(sessionIds)})),
        'whelping_events', (select count(*) from public.whelping_events
          where id::text like '9f190004-%' or session_id in (${uuidList(sessionIds)})),
        'animals', (select count(*) from public.animals
          where id::text like '9f190004-%'
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${namePrefix}%`)}),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like '9f190004-%' or litter_id in (${uuidList(litterIds)})),
        'litters', (select count(*) from public.litters
          where id::text like '9f190004-%' or name like ${q(`${namePrefix}%`)}),
        'memberships', (select count(*) from public.memberships where id::text like '9f190004-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f190004-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190004-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f190004-%'),
        'organizations', (select count(*) from public.organizations
          where id::text like '9f190004-%' or slug = 'e2e-whelping-birth-weight-isolated')
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function createViewer() {
  sql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(viewer.id)}::uuid, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${q(viewer.email)},
      extensions.crypt(${q(viewer.password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Birth weight viewer"}'::jsonb, now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(viewer.identityId)}::uuid, ${q(viewer.email)}, ${q(viewer.id)}::uuid,
      jsonb_build_object(
        'sub', ${q(viewer.id)}, 'email', ${q(viewer.email)},
        'email_verified', true, 'phone_verified', false
      ), 'email', now(), now()
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(viewer.membershipId)}::uuid, ${q(organizationId)}::uuid,
      ${q(viewer.id)}::uuid, 'viewer', 'active',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function createBusinessFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values ('${prefix}71'::uuid, 'E2E Whelping Birth Weight Isolated',
      'e2e-whelping-birth-weight-isolated');

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} father`)},
       'dog', 'Golden Retriever', 'male', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentMother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} inconsistent mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, '${prefix}71'::uuid, ${q(`${namePrefix} foreign mother`)},
       'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} main litter`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} inconsistent litter`)}, 'dog', 'Golden Retriever',
       ${q(ids.inconsistentMother)}::uuid, ${q(ids.father)}::uuid,
       'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, '${prefix}71'::uuid, ${q(`${namePrefix} foreign litter`)},
       'dog', 'Golden Retriever', ${q(ids.foreignMother)}::uuid, null,
       'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values
      (${q(ids.mainSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
       ${q(ids.mother)}::uuid, 'open', '2026-07-19T20:00:00Z', null,
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inconsistentSession)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inconsistentLitter)}::uuid, ${q(ids.inconsistentMother)}::uuid,
       'closed', '2026-07-19T20:00:00Z', '2026-07-19T22:00:00Z',
       'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignSession)}::uuid, '${prefix}71'::uuid, ${q(ids.foreignLitter)}::uuid,
       ${q(ids.foreignMother)}::uuid, 'closed', '2026-07-19T20:00:00Z',
       '2026-07-19T22:00:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at,
      event_type, author_id
    ) values
      (${q(ids.inconsistentEvent)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inconsistentSession)}::uuid, 1, '2026-07-19T21:00:00Z',
       'birth', ${q(ownerId)}::uuid),
      (${q(ids.foreignEvent)}::uuid, '${prefix}71'::uuid,
       ${q(ids.foreignSession)}::uuid, 1, '2026-07-19T21:00:00Z',
       'birth', ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, father_id, species, breed, sex, status,
      ownership_status, birth_date, birth_time, birth_order, birth_weight_grams,
      created_by, updated_by
    ) values
      (${q(ids.inconsistentAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inconsistentLitter)}::uuid, ${q(ids.inconsistentMother)}::uuid,
       ${q(ids.father)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', '2026-07-19',
       '23:00:00', 1, 333, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignAnimal)}::uuid, '${prefix}71'::uuid,
       ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignMother)}::uuid,
       null,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', '2026-07-19',
       '23:00:00', 1, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, created_by
    ) values
      (${q(ids.inconsistentBirth)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inconsistentSession)}::uuid, ${q(ids.inconsistentEvent)}::uuid,
       ${q(ids.inconsistentAnimal)}::uuid, 1, 'male', 'alive', ${q(ownerId)}::uuid),
      (${q(ids.foreignBirth)}::uuid, '${prefix}71'::uuid,
       ${q(ids.foreignSession)}::uuid, ${q(ids.foreignEvent)}::uuid,
       ${q(ids.foreignAnimal)}::uuid, 1, 'male', 'alive', ${q(ownerId)}::uuid);
  `);
}

async function viewerClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({
    email: viewer.email,
    password: viewer.password,
  });
  if (signedIn.error) throw signedIn.error;
  return client;
}

function requireSuccess<T extends { outcome: string }>(result: T) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected success");
  return result;
}

function birthIntent(commandId: string, occurredAt: string, overrides = {}) {
  return {
    sessionId: ids.mainSession,
    clientCommandId: commandId,
    occurredAt,
    sex: "male" as const,
    viability: "alive" as const,
    ...overrides,
  };
}

function completionIntent(birthId: string, commandId: string, overrides = {}) {
  return {
    birthId,
    clientCommandId: commandId,
    weightGrams: 420,
    measuredAt: "2026-07-19T21:05:00.000Z",
    note: "  Pesée après clôture  ",
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

function stableJournalState(birthId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'event_count', (select count(*) from public.whelping_events
          where session_id = ${q(ids.mainSession)}::uuid),
        'event_order', (select json_agg(json_build_array(id, sequence_no, occurred_at)
          order by sequence_no) from public.whelping_events
          where session_id = ${q(ids.mainSession)}::uuid),
        'birth', (select json_build_object(
          'session_id', session_id, 'event_id', event_id, 'animal_id', animal_id,
          'birth_order', birth_order
        ) from public.whelping_births where id = ${q(birthId)}::uuid),
        'litter', (select json_build_object(
          'actual_birth_date', actual_birth_date,
          'born_total_count', born_total_count,
          'born_male_count', born_male_count,
          'born_female_count', born_female_count,
          'alive_count', alive_count,
          'status', status
        ) from public.litters where id = ${q(ids.mainLitter)}::uuid)
      )::text;
    `),
  );
}

test("completes one missing birth weight idempotently without changing the timeline", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createViewer();
    createBusinessFixtures();

    const owner = await createAuthenticatedSupabaseClient();
    const readOnlyViewer = await viewerClient();
    const sideEffectsBefore = sideEffectCounts();

    const missingBirth = requireSuccess(
      await recordWhelpingBirthCore(
        birthIntent(ids.missingBirthCommand, "2026-07-19T21:00:00.000Z"),
        owner,
      ),
    );
    const beforeBirth = requireSuccess(
      await recordWhelpingBirthCore(
        birthIntent(ids.beforeBirthCommand, "2026-07-19T21:10:00.000Z", {
          sex: "female" as const,
        }),
        owner,
      ),
    );
    const concurrentBirth = requireSuccess(
      await recordWhelpingBirthCore(
        birthIntent(ids.concurrentBirthCommand, "2026-07-19T21:20:00.000Z"),
        owner,
      ),
    );
    const initialWeightBirth = requireSuccess(
      await recordWhelpingBirthCore(
        birthIntent(ids.initialWeightBirthCommand, "2026-07-19T21:30:00.000Z", {
          sex: "female" as const,
          birthWeightGrams: 390,
          measuredAt: "2026-07-19T21:31:00.000Z",
          note: "Poids saisi à la naissance",
        }),
        owner,
      ),
    );

    for (const result of [missingBirth, beforeBirth, concurrentBirth, initialWeightBirth]) {
      created.births.push(result.birthId);
      created.events.push(result.eventId);
      created.animals.push(result.animalId);
      if (result.weightMeasurementId) created.weights.push(result.weightMeasurementId);
    }
    expect(missingBirth.weightMeasurementId).toBeNull();

    const closed = requireSuccess(
      await closeWhelpingSessionCore(
        {
          sessionId: ids.mainSession,
          clientCommandId: ids.closeCommand,
          endedAt: "2026-07-19T22:00:00.000Z",
          note: "Clôture avant pesée",
        },
        owner,
      ),
    );
    created.events.push(closed.eventId);
    expect(sql(`select status from public.whelping_sessions where id = ${q(ids.mainSession)}::uuid;`)).toBe("closed");

    const journalBefore = stableJournalState(missingBirth.birthId);
    const completionInput = completionIntent(
      missingBirth.birthId,
      ids.completionCommand,
    );
    const completion = requireSuccess(
      await recordWhelpingBirthWeightCore(completionInput, owner),
    );
    created.weights.push(completion.weightMeasurementId);
    expect(completion).toMatchObject({
      birthId: missingBirth.birthId,
      animalId: missingBirth.animalId,
      replayed: false,
    });

    const exactMeasurement = JSON.parse(
      sql(`
        select json_build_object(
          'id', id, 'organization_id', organization_id, 'animal_id', animal_id,
          'source_birth_id', source_birth_id, 'measurement_kind', measurement_kind,
          'grams', grams, 'measured_at', measured_at, 'note', note,
          'created_by', created_by
        )::text
        from public.animal_weight_measurements
        where id = ${q(completion.weightMeasurementId)}::uuid;
      `),
    );
    expect(exactMeasurement).toEqual({
      id: completion.weightMeasurementId,
      organization_id: organizationId,
      animal_id: missingBirth.animalId,
      source_birth_id: missingBirth.birthId,
      measurement_kind: "birth",
      grams: 420,
      measured_at: "2026-07-19T21:05:00+00:00",
      note: "Pesée après clôture",
      created_by: ownerId,
    });
    expect(
      sql(`select birth_weight_grams from public.animals where id = ${q(missingBirth.animalId)}::uuid;`),
    ).toBe("420");
    expect(stableJournalState(missingBirth.birthId)).toEqual(journalBefore);

    const command = JSON.parse(
      sql(`
        select row_to_json(command)::text from (
          select command_type, litter_id, session_id, birth_id, animal_id,
            weight_measurement_id, weight_grams, measured_at, note,
            event_id, started_at, ended_at, occurred_at, timezone_name,
            event_type, result_sequence_no, sex, viability,
            initial_collar_color, result_birth_order, created_by
          from public.whelping_commands
          where client_command_id = ${q(ids.completionCommand)}::uuid
        ) command;
      `),
    );
    expect(command).toEqual({
      command_type: "record_birth_weight",
      litter_id: ids.mainLitter,
      session_id: ids.mainSession,
      birth_id: missingBirth.birthId,
      animal_id: missingBirth.animalId,
      weight_measurement_id: completion.weightMeasurementId,
      weight_grams: 420,
      measured_at: "2026-07-19T21:05:00+00:00",
      note: "Pesée après clôture",
      event_id: null,
      started_at: null,
      ended_at: null,
      occurred_at: null,
      timezone_name: null,
      event_type: null,
      result_sequence_no: null,
      sex: null,
      viability: null,
      initial_collar_color: null,
      result_birth_order: null,
      created_by: ownerId,
    });

    const listed = requireSuccess(
      await listWhelpingBirthsForSessionCore(
        { sessionId: ids.mainSession },
        owner,
      ),
    );
    expect(
      listed.births.find((birth) => birth.id === missingBirth.birthId),
    ).toMatchObject({
      animal: { id: missingBirth.animalId, birthWeightGrams: 420 },
      birthWeightMeasurement: {
        id: completion.weightMeasurementId,
        animalId: missingBirth.animalId,
        grams: 420,
        measuredAt: "2026-07-19T21:05:00+00:00",
        note: "Pesée après clôture",
        createdBy: ownerId,
      },
    });

    const replay = requireSuccess(
      await recordWhelpingBirthWeightCore(completionInput, owner),
    );
    expect(replay).toEqual({ ...completion, replayed: true });
    expect(sql(`select count(*) from public.animal_weight_measurements where source_birth_id = ${q(missingBirth.birthId)}::uuid;`)).toBe("1");

    for (const conflictingInput of [
      { ...completionInput, weightGrams: 421 },
      { ...completionInput, measuredAt: "2026-07-19T21:06:00.000Z" },
      { ...completionInput, note: "Autre note" },
    ]) {
      const conflict = await recordWhelpingBirthWeightCore(conflictingInput, owner);
      expect(conflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });
      expect(sql(`select count(*) from public.animal_weight_measurements where source_birth_id = ${q(missingBirth.birthId)}::uuid;`)).toBe("1");
      expect(sql(`select birth_weight_grams from public.animals where id = ${q(missingBirth.animalId)}::uuid;`)).toBe("420");
    }

    const secondCommand = await recordWhelpingBirthWeightCore(
      completionIntent(missingBirth.birthId, ids.secondCompletionCommand),
      owner,
    );
    expect(secondCommand).toMatchObject({
      outcome: "error",
      error: { code: "birth_weight_already_recorded" },
    });

    const tooEarly = await recordWhelpingBirthWeightCore(
      completionIntent(beforeBirth.birthId, ids.beforeTimeCommand, {
        measuredAt: "2026-07-19T21:09:59.999Z",
      }),
      owner,
    );
    expect(tooEarly).toMatchObject({
      outcome: "error",
      error: { code: "measured_before_birth" },
    });

    for (const invalidInput of [
      completionIntent(beforeBirth.birthId, `${prefix}81`, { weightGrams: 0 }),
      completionIntent(beforeBirth.birthId, `${prefix}82`, { weightGrams: 100_001 }),
      completionIntent(beforeBirth.birthId, `${prefix}83`, { weightGrams: 420.5 }),
      completionIntent(beforeBirth.birthId, `${prefix}84`, {
        measuredAt: "2026-07-19T21:11:00",
      }),
      completionIntent(beforeBirth.birthId, `${prefix}85`, { note: "x".repeat(5_001) }),
    ]) {
      const invalid = await recordWhelpingBirthWeightCore(invalidInput, owner);
      expect(invalid).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    }
    expect(sql(`select count(*) from public.animal_weight_measurements where source_birth_id = ${q(beforeBirth.birthId)}::uuid;`)).toBe("0");
    expect(sql(`select birth_weight_grams is null from public.animals where id = ${q(beforeBirth.animalId)}::uuid;`)).toBe("t");

    const viewerWrite = await recordWhelpingBirthWeightCore(
      completionIntent(beforeBirth.birthId, ids.viewerCommand, {
        measuredAt: "2026-07-19T21:11:00Z",
      }),
      readOnlyViewer,
    );
    expect(viewerWrite).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

    const foreignWrite = await recordWhelpingBirthWeightCore(
      completionIntent(ids.foreignBirth, ids.foreignCommand, {
        measuredAt: "2026-07-19T21:01:00Z",
      }),
      owner,
    );
    expect(foreignWrite).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const inconsistentProjection = await recordWhelpingBirthWeightCore(
      completionIntent(ids.inconsistentBirth, ids.inconsistentWeightCommand, {
        measuredAt: "2026-07-19T21:01:00Z",
      }),
      owner,
    );
    expect(inconsistentProjection).toMatchObject({
      outcome: "error",
      error: { code: "invalid_birth_relations" },
    });

    const directInsert = await owner.from("animal_weight_measurements").insert({
      organization_id: organizationId,
      animal_id: beforeBirth.animalId,
      measured_at: "2026-07-19T21:11:00Z",
      grams: 410,
      measurement_kind: "birth",
      source_birth_id: beforeBirth.birthId,
      created_by: ownerId,
    });
    const directProjectionUpdate = await owner
      .from("animals")
      .update({ birth_weight_grams: 410 })
      .eq("id", beforeBirth.animalId);
    const directMeasurementUpdate = await owner
      .from("animal_weight_measurements")
      .update({ grams: 421 })
      .eq("id", completion.weightMeasurementId);
    const directMeasurementDelete = await owner
      .from("animal_weight_measurements")
      .delete()
      .eq("id", completion.weightMeasurementId);
    expect(directInsert.error).not.toBeNull();
    expect(directProjectionUpdate.error).not.toBeNull();
    expect(directMeasurementUpdate.error).not.toBeNull();
    expect(directMeasurementDelete.error).not.toBeNull();

    sql(`update public.memberships set role = 'member'
      where id = ${q(ids.viewerMembership)}::uuid;`);
    const memberCompletion = requireSuccess(
      await recordWhelpingBirthWeightCore(
        completionIntent(beforeBirth.birthId, ids.memberCompletionCommand, {
          measuredAt: "2026-07-19T21:11:00Z",
          note: "Poids saisi par un membre",
        }),
        readOnlyViewer,
      ),
    );
    created.weights.push(memberCompletion.weightMeasurementId);
    expect(memberCompletion.animalId).toBe(beforeBirth.animalId);

    const initialWeightCompletion = await recordWhelpingBirthWeightCore(
      completionIntent(initialWeightBirth.birthId, ids.initialWeightCompletionCommand, {
        measuredAt: "2026-07-19T21:32:00Z",
      }),
      owner,
    );
    expect(initialWeightCompletion).toMatchObject({
      outcome: "error",
      error: { code: "birth_weight_already_recorded" },
    });
    expect(sql(`select count(*) from public.animal_weight_measurements where source_birth_id = ${q(initialWeightBirth.birthId)}::uuid;`)).toBe("1");
    expect(sql(`select birth_weight_grams from public.animals where id = ${q(initialWeightBirth.animalId)}::uuid;`)).toBe("390");

    sql(`update public.memberships set role = 'admin'
      where id = ${q(ids.viewerMembership)}::uuid;`);

    const concurrentInputs = [
      completionIntent(concurrentBirth.birthId, ids.concurrentCompletionOneCommand, {
        measuredAt: "2026-07-19T21:21:00Z",
        note: "Concurrence un",
      }),
      completionIntent(concurrentBirth.birthId, ids.concurrentCompletionTwoCommand, {
        measuredAt: "2026-07-19T21:21:01Z",
        note: "Concurrence deux",
      }),
    ] as const;
    const concurrentResults = await Promise.all([
      recordWhelpingBirthWeightCore(concurrentInputs[0], owner),
      recordWhelpingBirthWeightCore(concurrentInputs[1], readOnlyViewer),
    ]);
    const concurrentSuccesses = concurrentResults.filter(
      (result) => result.outcome === "success",
    );
    const concurrentFailures = concurrentResults.filter(
      (result) => result.outcome === "error",
    );
    expect(concurrentSuccesses).toHaveLength(1);
    expect(concurrentFailures).toHaveLength(1);
    expect(concurrentFailures[0]).toMatchObject({
      error: { code: "birth_weight_already_recorded" },
    });
    if (concurrentSuccesses[0]?.outcome === "success") {
      created.weights.push(concurrentSuccesses[0].weightMeasurementId);
    }
    expect(sql(`select count(*) from public.animal_weight_measurements where source_birth_id = ${q(concurrentBirth.birthId)}::uuid;`)).toBe("1");

    expect(stableJournalState(missingBirth.birthId)).toEqual(journalBefore);
    expect(sideEffectCounts()).toEqual(sideEffectsBefore);

    console.info(
      JSON.stringify({
        whelpingBirthWeightCompletionFixtureCleanup: {
          created: {
            commandPrefix: "9f190004-",
            sessions: sessionIds,
            litters: litterIds,
            parents: parentIds,
            deterministicBirths: [ids.foreignBirth, ids.inconsistentBirth],
            deterministicAnimals: [ids.foreignAnimal, ids.inconsistentAnimal],
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
        whelpingBirthWeightCompletionFixtureCleanup: {
          deleted: {
            commandPrefix: "9f190004-",
            sessions: sessionIds,
            litters: litterIds,
            parents: parentIds,
            deterministicBirths: [ids.foreignBirth, ids.inconsistentBirth],
            deterministicAnimals: [ids.foreignAnimal, ids.inconsistentAnimal],
            ...created,
          },
          remaining,
        },
      }),
    );
  }
});
