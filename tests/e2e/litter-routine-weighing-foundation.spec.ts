import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  listLitterWeightHistoryCore,
  recordLitterRoutineWeightsCore,
  type RecordLitterRoutineWeightsInput,
} from "../../src/features/litter-weights/litter-weights-core";
import { DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY } from "../../src/features/litter-weights/litter-weighing-schedule-model";
import {
  openWhelpingSessionCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f190005-0000-4000-8000-0000000000";
const namePrefix = "E2E litter routine weighing foundation";

const ids = {
  father: `${prefix}01`,
  mother: `${prefix}02`,
  journalLitter: `${prefix}11`,
  adminLitter: `${prefix}12`,
  otherLitter: `${prefix}13`,
  foreignLitter: `${prefix}14`,
  adminFirst: `${prefix}21`,
  adminSecond: `${prefix}22`,
  wrongLitterAnimal: `${prefix}23`,
  foreignAnimal: `${prefix}24`,
  deletedAnimal: `${prefix}25`,
  notProducedAnimal: `${prefix}26`,
  stillbornAnimal: `${prefix}27`,
  futureAnimal: `${prefix}28`,
  deceasedAnimal: `${prefix}29`,
  openJournalCommand: `${prefix}31`,
  journalBirthOneCommand: `${prefix}32`,
  journalBirthTwoCommand: `${prefix}33`,
  journalBirthThreeCommand: `${prefix}34`,
  collectiveCommand: `${prefix}41`,
  partialCommand: `${prefix}42`,
  memberCommand: `${prefix}43`,
  identicalConcurrentCommand: `${prefix}44`,
  exactConcurrentOneCommand: `${prefix}45`,
  exactConcurrentTwoCommand: `${prefix}46`,
  invalidPartialCommand: `${prefix}47`,
  duplicateCommand: `${prefix}48`,
  wrongLitterCommand: `${prefix}49`,
  foreignAnimalCommand: `${prefix}50`,
  deletedAnimalCommand: `${prefix}51`,
  notProducedCommand: `${prefix}52`,
  stillbornCommand: `${prefix}53`,
  beforeBirthCommand: `${prefix}54`,
  afterDeathCommand: `${prefix}55`,
  viewerCommand: `${prefix}56`,
  directSession: `${prefix}57`,
  directMeasurement: `${prefix}58`,
  viewerUser: `${prefix}81`,
  viewerIdentity: `${prefix}82`,
  viewerMembership: `${prefix}83`,
  foreignOrganization: `${prefix}91`,
} as const;

const viewer = {
  id: ids.viewerUser,
  identityId: ids.viewerIdentity,
  membershipId: ids.viewerMembership,
  email: "litter-routine-weighing-viewer@saasphase1.invalid",
  password: "LitterRoutineWeighingViewer-2026!",
} as const;

const litterIds = [
  ids.journalLitter,
  ids.adminLitter,
  ids.otherLitter,
  ids.foreignLitter,
] as const;
const deterministicAnimalIds = [
  ids.father,
  ids.mother,
  ids.adminFirst,
  ids.adminSecond,
  ids.wrongLitterAnimal,
  ids.foreignAnimal,
  ids.deletedAnimal,
  ids.notProducedAnimal,
  ids.stillbornAnimal,
  ids.futureAnimal,
  ids.deceasedAnimal,
] as const;
const created = {
  journalSession: null as string | null,
  journalBirths: [] as string[],
  journalEvents: [] as string[],
  journalAnimals: [] as string[],
  birthWeights: [] as string[],
  weighingSessions: [] as string[],
  routineWeights: [] as string[],
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
    delete from public.litter_weight_commands
    where client_command_id::text like '9f190005-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_commands
    where client_command_id::text like '9f190005-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.animal_weight_measurements
    where id::text like '9f190005-%'
       or litter_weighing_session_id in (
         select id from public.litter_weighing_sessions
         where id::text like '9f190005-%'
            or litter_id in (${uuidList(litterIds)})
       )
       or source_birth_id in (
         select birth.id
         from public.whelping_births birth
         join public.whelping_sessions session
           on session.organization_id = birth.organization_id
          and session.id = birth.session_id
         where session.litter_id in (${uuidList(litterIds)})
       )
       or animal_id in (
         select id from public.animals
         where id::text like '9f190005-%'
            or litter_id in (${uuidList(litterIds)})
       );

    delete from public.litter_weighing_sessions
    where id::text like '9f190005-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.whelping_births birth
    using public.whelping_sessions session
    where session.organization_id = birth.organization_id
      and session.id = birth.session_id
      and session.litter_id in (${uuidList(litterIds)});

    delete from public.whelping_events event
    using public.whelping_sessions session
    where session.organization_id = event.organization_id
      and session.id = event.session_id
      and session.litter_id in (${uuidList(litterIds)});

    delete from public.whelping_sessions
    where id::text like '9f190005-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.animals
    where litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id::text like '9f190005-%'
       or name like ${q(`${namePrefix}%`)};

    delete from public.animals
    where id::text like '9f190005-%'
       or call_name like ${q(`${namePrefix}%`)};

    delete from public.memberships where id::text like '9f190005-%';
    delete from auth.identities where user_id::text like '9f190005-%';
    delete from auth.users where id::text like '9f190005-%';
    delete from public.organizations
    where id::text like '9f190005-%'
       or slug = 'e2e-litter-routine-weighing-isolated';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litter_weight_commands', (select count(*) from public.litter_weight_commands
          where client_command_id::text like '9f190005-%'
             or litter_id in (${uuidList(litterIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f190005-%'
             or animal_id in (select id from public.animals
               where id::text like '9f190005-%' or litter_id in (${uuidList(litterIds)}))
             or litter_weighing_session_id in (select id from public.litter_weighing_sessions
               where id::text like '9f190005-%' or litter_id in (${uuidList(litterIds)}))
             or source_birth_id in (select birth.id from public.whelping_births birth
               join public.whelping_sessions session
                 on session.organization_id = birth.organization_id and session.id = birth.session_id
               where session.litter_id in (${uuidList(litterIds)}))),
        'litter_weighing_sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like '9f190005-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_commands', (select count(*) from public.whelping_commands
          where client_command_id::text like '9f190005-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_births', (select count(*) from public.whelping_births birth
          join public.whelping_sessions session
            on session.organization_id = birth.organization_id and session.id = birth.session_id
          where session.litter_id in (${uuidList(litterIds)})),
        'whelping_events', (select count(*) from public.whelping_events event
          join public.whelping_sessions session
            on session.organization_id = event.organization_id and session.id = event.session_id
          where session.litter_id in (${uuidList(litterIds)})),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like '9f190005-%' or litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id::text like '9f190005-%'
             or litter_id in (${uuidList(litterIds)})
             or call_name like ${q(`${namePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like '9f190005-%' or name like ${q(`${namePrefix}%`)}),
        'memberships', (select count(*) from public.memberships where id::text like '9f190005-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f190005-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190005-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f190005-%'),
        'organizations', (select count(*) from public.organizations
          where id::text like '9f190005-%' or slug = 'e2e-litter-routine-weighing-isolated')
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function createViewerAndFixtures() {
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
      '{"display_name":"Routine weighing viewer"}'::jsonb, now(), now()
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

    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrganization)}::uuid,
      'E2E Litter Routine Weighing Isolated',
      'e2e-litter-routine-weighing-isolated');

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} father`)}, 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} mother`)}, 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      created_by, updated_by
    ) values
      (${q(ids.journalLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} journal`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'birth_expected',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.adminLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} administrative`)}, 'dog', 'Golden Retriever',
       null, null, 'puppies_created', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${namePrefix} other`)}, 'dog', 'Golden Retriever',
       null, null, 'puppies_created', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid,
       ${q(`${namePrefix} foreign`)}, 'dog', 'Golden Retriever',
       null, null, 'puppies_created', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, species, breed, sex, status,
      ownership_status, call_name, official_name, birth_date, birth_time,
      birth_order, birth_weight_grams, collar_color_initial,
      collar_color_current, death_date, deleted_at, created_by, updated_by
    ) values
      (${q(ids.adminFirst)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'female', 'born', 'produced', 'Admin A',
       'Admin A du Test', '2026-07-18', '08:00:00', 2, 350, 'rose', 'violet',
       null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.adminSecond)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', 'Admin B',
       'Admin B du Test', '2026-07-18', '08:05:00', 1, null, 'bleu', 'bleu',
       null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.wrongLitterAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.otherLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', 'Other', null,
       '2026-07-18', '08:00:00', 1, null, null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignAnimal)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', 'Foreign', null,
       '2026-07-18', '08:00:00', 1, null, null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.deletedAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', 'Deleted', null,
       '2026-07-18', '08:00:00', null, null, null, null, null, now(),
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.notProducedAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'owned', 'Not produced', null,
       '2026-07-18', '08:00:00', null, null, null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.stillbornAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'stillborn', 'produced', 'Stillborn', null,
       '2026-07-18', '08:00:00', null, null, null, null, '2026-07-18', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.futureAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born', 'produced', 'Future', null,
       '2026-07-21', '08:00:00', null, null, null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.deceasedAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminLitter)}::uuid,
       'dog', 'Golden Retriever', 'male', 'deceased', 'produced', 'Deceased', null,
       '2026-07-17', '08:00:00', null, null, null, null, '2026-07-18', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
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
  return result as Extract<T, { outcome: "success" }>;
}

function routineIntent(
  litterId: string,
  commandId: string,
  measuredAt: string,
  items: RecordLitterRoutineWeightsInput["items"],
  overrides: Partial<RecordLitterRoutineWeightsInput> = {},
): RecordLitterRoutineWeightsInput {
  return {
    litterId,
    clientCommandId: commandId,
    measuredAt,
    timezoneName: "Europe/Paris",
    note: "  Séance commune  ",
    items,
    ...overrides,
  };
}

function writeCounts(litterId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'commands', (select count(*) from public.litter_weight_commands
          where litter_id = ${q(litterId)}::uuid),
        'sessions', (select count(*) from public.litter_weighing_sessions
          where litter_id = ${q(litterId)}::uuid),
        'measurements', (select count(*) from public.animal_weight_measurements measurement
          join public.animals animal on animal.organization_id = measurement.organization_id
            and animal.id = measurement.animal_id
          where animal.litter_id = ${q(litterId)}::uuid and measurement.measurement_kind = 'routine')
      )::text;
    `),
  );
}

function stableBusinessState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'journal_events', (select json_agg(row_to_json(value) order by sequence_no) from (
          select event.id, event.sequence_no, event.occurred_at, event.event_type, event.note
          from public.whelping_events event
          join public.whelping_sessions session
            on session.organization_id = event.organization_id and session.id = event.session_id
          where session.litter_id = ${q(ids.journalLitter)}::uuid
        ) value),
        'journal_births', (select json_agg(row_to_json(value) order by birth_order) from (
          select birth.id, birth.event_id, birth.animal_id, birth.birth_order, birth.sex, birth.viability
          from public.whelping_births birth
          join public.whelping_sessions session
            on session.organization_id = birth.organization_id and session.id = birth.session_id
          where session.litter_id = ${q(ids.journalLitter)}::uuid
        ) value),
        'animals', (select json_agg(row_to_json(value) order by id) from (
          select id, litter_id, status, ownership_status, birth_date, birth_time,
            birth_order, birth_weight_grams, death_date, deleted_at
          from public.animals where litter_id in (${q(ids.journalLitter)}::uuid, ${q(ids.adminLitter)}::uuid)
        ) value),
        'litters', (select json_agg(row_to_json(value) order by id) from (
          select id, status, actual_birth_date, born_total_count, born_male_count,
            born_female_count, alive_count
          from public.litters where id in (${q(ids.journalLitter)}::uuid, ${q(ids.adminLitter)}::uuid)
        ) value),
        'generic_events', (select count(*) from public.events),
        'tasks', (select count(*) from public.litter_care_tasks),
        'payments', (select count(*) from public.payments),
        'reservations', (select count(*) from public.reservations),
        'documents', (select count(*) from public.documents)
      )::text;
    `),
  );
}

function routineAnimalLinkState(
  animalId: string,
  measurementId: string,
  sessionId: string,
) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'animal', (select json_build_object(
          'organization_id', organization_id, 'litter_id', litter_id
        ) from public.animals where id = ${q(animalId)}::uuid),
        'session', (select row_to_json(session) from (
          select id, organization_id, litter_id, measured_at, timezone_name,
            note, created_at, created_by
          from public.litter_weighing_sessions where id = ${q(sessionId)}::uuid
        ) session),
        'measurement', (select row_to_json(measurement) from (
          select id, organization_id, animal_id, litter_weighing_session_id,
            measured_at, grams, measurement_kind, source_birth_id, note,
            created_at, created_by
          from public.animal_weight_measurements where id = ${q(measurementId)}::uuid
        ) measurement)
      )::text;
    `),
  );
}

test("records collective routine weights atomically, idempotently and without side effects", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createViewerAndFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const viewerOrMember = await viewerClient();

    const opened = requireSuccess(
      await openWhelpingSessionCore(
        {
          litterId: ids.journalLitter,
          clientCommandId: ids.openJournalCommand,
          startedAt: "2026-07-19T07:00:00.000Z",
          timezoneName: "Europe/Paris",
          note: "Journal E2E",
        },
        owner,
      ),
    );
    created.journalSession = opened.sessionId;

    for (const [index, commandId] of [
      ids.journalBirthOneCommand,
      ids.journalBirthTwoCommand,
      ids.journalBirthThreeCommand,
    ].entries()) {
      const birth = requireSuccess(
        await recordWhelpingBirthCore(
          {
            sessionId: opened.sessionId,
            clientCommandId: commandId,
            occurredAt: `2026-07-19T07:${String(10 + index).padStart(2, "0")}:00.000Z`,
            sex: index === 1 ? "female" : "male",
            viability: "alive",
            initialCollarColor: ["rouge", "vert", "jaune"][index],
            birthWeightGrams: 390 + index * 10,
            measuredAt: `2026-07-19T07:${String(20 + index).padStart(2, "0")}:00.000Z`,
            note: `Naissance ${index + 1}`,
          },
          owner,
        ),
      );
      created.journalBirths.push(birth.birthId);
      created.journalEvents.push(birth.eventId);
      created.journalAnimals.push(birth.animalId);
      if (birth.weightMeasurementId) created.birthWeights.push(birth.weightMeasurementId);
    }

    const stableBefore = stableBusinessState();
    const birthProjectionBefore = sql(`select json_agg(json_build_array(id, birth_weight_grams) order by id)::text
      from public.animals where id in (${uuidList(created.journalAnimals)});`);

    const collectiveInput = routineIntent(
      ids.journalLitter,
      ids.collectiveCommand,
      "2026-07-19T10:30:00+02:00",
      [
        { animalId: created.journalAnimals[2]!, grams: 450, note: "  Calme  " },
        { animalId: created.journalAnimals[0]!, grams: 430 },
        { animalId: created.journalAnimals[1]!, grams: 440, note: "Vif" },
      ],
    );
    const collective = requireSuccess(
      await recordLitterRoutineWeightsCore(collectiveInput, owner),
    );
    created.weighingSessions.push(collective.sessionId);
    created.routineWeights.push(...collective.measurementIds);
    expect(collective).toMatchObject({
      litterId: ids.journalLitter,
      measurementCount: 3,
      replayed: false,
    });

    const exact = JSON.parse(
      sql(`
        select json_build_object(
          'session', (select json_build_object(
            'id', id, 'litter_id', litter_id, 'measured_at', measured_at,
            'timezone_name', timezone_name, 'note', note, 'created_by', created_by
          ) from public.litter_weighing_sessions where id = ${q(collective.sessionId)}::uuid),
          'weights', (select json_agg(json_build_object(
            'animal_id', animal_id, 'grams', grams, 'measured_at', measured_at,
            'note', note, 'kind', measurement_kind, 'source_birth_id', source_birth_id,
            'session_id', litter_weighing_session_id, 'created_by', created_by
          ) order by animal_id) from public.animal_weight_measurements
          where litter_weighing_session_id = ${q(collective.sessionId)}::uuid),
          'command', (select json_build_object(
            'items', items_snapshot, 'count', measurement_count, 'note', note,
            'timezone_name', timezone_name, 'measured_at', measured_at
          ) from public.litter_weight_commands
          where client_command_id = ${q(ids.collectiveCommand)}::uuid)
        )::text;
      `),
    );
    expect(exact.session).toMatchObject({
      id: collective.sessionId,
      litter_id: ids.journalLitter,
      measured_at: "2026-07-19T08:30:00+00:00",
      timezone_name: "Europe/Paris",
      note: "Séance commune",
      created_by: ownerId,
    });
    expect(exact.weights).toHaveLength(3);
    expect(exact.weights.every((weight: { kind: string }) => weight.kind === "routine")).toBe(true);
    expect(exact.weights.every((weight: { source_birth_id: string | null }) => weight.source_birth_id === null)).toBe(true);
    expect(exact.weights.every((weight: { session_id: string }) => weight.session_id === collective.sessionId)).toBe(true);
    expect(exact.command.items.map((item: { animal_id: string }) => item.animal_id)).toEqual(
      [...created.journalAnimals].sort(),
    );
    expect(
      requireSuccess(
        await listLitterWeightHistoryCore({ litterId: ids.journalLitter }, owner),
      ).latestSessionComparison,
    ).toEqual({ status: "insufficient_sessions" });

    const partial = requireSuccess(
      await recordLitterRoutineWeightsCore(
        routineIntent(
          ids.journalLitter,
          ids.partialCommand,
          "2026-07-19T12:00:00+02:00",
          [
            { animalId: created.journalAnimals[0]!, grams: 455, note: "Après tétée" },
            { animalId: created.journalAnimals[1]!, grams: 465 },
          ],
          { note: "Pesée partielle" },
        ),
        owner,
      ),
    );
    created.weighingSessions.push(partial.sessionId);
    created.routineWeights.push(...partial.measurementIds);
    expect(partial.measurementCount).toBe(2);

    const history = requireSuccess(
      await listLitterWeightHistoryCore({ litterId: ids.journalLitter }, owner),
    );
    expect(history.weighingSchedule).toBeNull();
    expect(history.role).toBe("owner");
    expect(history.animals.map((animal) => animal.birthOrder)).toEqual([1, 2, 3]);
    expect(history.animals.map((animal) => animal.id)).toEqual(created.journalAnimals);
    expect(history.animals.map((animal) => animal.birthWeightGrams)).toEqual([390, 400, 410]);
    expect(history.sessions.map((session) => session.id)).toEqual([
      partial.sessionId,
      collective.sessionId,
    ]);
    expect(history.sessions.map((session) => session.measurementCount)).toEqual([2, 3]);
    expect(history.sessions.map((session) => ({
      averageGrams: session.averageGrams,
      minimumGrams: session.minimumGrams,
      maximumGrams: session.maximumGrams,
    }))).toEqual([
      { averageGrams: 460, minimumGrams: 455, maximumGrams: 465 },
      { averageGrams: 440, minimumGrams: 430, maximumGrams: 450 },
    ]);
    expect(history.latestSessionComparison).toEqual({
      status: "available",
      previousMeasuredAt: "2026-07-19T08:30:00+00:00",
      previousTimezoneName: "Europe/Paris",
      previousMeasurementCount: 3,
      currentMeasuredAt: "2026-07-19T10:00:00+00:00",
      currentTimezoneName: "Europe/Paris",
      currentMeasurementCount: 2,
      commonAnimalCount: 2,
      previousCommonAverageGrams: 435,
      currentCommonAverageGrams: 460,
      averageDifferenceGrams: 25,
      previousCommonRangeGrams: 10,
      currentCommonRangeGrams: 10,
      rangeDifferenceGrams: 0,
    });
    expect(JSON.stringify(history.latestSessionComparison)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|animalId|sessionId/i,
    );
    expect(history.measurements.filter((measurement) => measurement.type === "birth")).toHaveLength(3);
    expect(history.measurements.filter((measurement) => measurement.type === "routine")).toHaveLength(5);
    for (const animalId of created.journalAnimals) {
      const dates = history.measurements
        .filter((measurement) => measurement.animalId === animalId)
        .map((measurement) => measurement.measuredAt);
      expect(dates).toEqual([...dates].sort());
    }

    const scheduleReadStateBefore = {
      business: stableBusinessState(),
      writes: writeCounts(ids.journalLitter),
    };
    const scheduledHistory = requireSuccess(
      await listLitterWeightHistoryCore(
        {
          litterId: ids.journalLitter,
          schedule: {
            todayDate: "2026-07-20",
            policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
          },
        },
        owner,
      ),
    );
    expect(scheduledHistory.weighingSchedule?.status).toBe("available");
    if (scheduledHistory.weighingSchedule?.status !== "available") {
      throw new Error("Expected an available weighing schedule");
    }
    const scheduledObservations = scheduledHistory.weighingSchedule.schedule.flatMap(
      (item) => item.observations,
    );
    expect(scheduledHistory.weighingSchedule.schedule.find(({ ageDay }) => ageDay === 0))
      .toMatchObject({
        status: "completed",
      });
    expect(scheduledObservations.filter(({ source }) => source === "birth")).toHaveLength(1);
    expect(scheduledObservations.filter(({ source }) => source === "routine")).toEqual([
      { observationIndex: 1, observedOn: "2026-07-19", source: "routine" },
      { observationIndex: 2, observedOn: "2026-07-19", source: "routine" },
    ]);
    expect(scheduledHistory.weighingSchedule.schedule.find(({ ageDay }) => ageDay === 0)?.observations)
      .toHaveLength(3);
    expect(JSON.stringify(scheduledHistory.weighingSchedule)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    const customSchedule = requireSuccess(
      await listLitterWeightHistoryCore(
        {
          litterId: ids.journalLitter,
          schedule: {
            todayDate: "2026-07-20",
            policy: {
              phases: [{ startAgeDay: 0, endAgeDay: 6, intervalDays: 2 }],
            },
          },
        },
        owner,
      ),
    ).weighingSchedule;
    expect(customSchedule?.status).toBe("available");
    if (customSchedule?.status === "available") {
      expect(customSchedule.schedule.map(({ ageDay }) => ageDay)).toEqual([0, 2, 4, 6]);
    }

    for (const schedule of [
      {
        todayDate: "2026-02-30",
        policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
      },
      {
        todayDate: "2026-07-20",
        policy: { phases: [] },
      },
    ]) {
      expect(
        requireSuccess(
          await listLitterWeightHistoryCore(
            { litterId: ids.journalLitter, schedule },
            owner,
          ),
        ).weighingSchedule,
      ).toMatchObject({ status: "invalid_input", schedule: [] });
    }
    expect({
      business: stableBusinessState(),
      writes: writeCounts(ids.journalLitter),
    }).toEqual(scheduleReadStateBefore);

    try {
      sql(`update public.animals set deleted_at = now()
        where id = ${q(created.journalAnimals[0]!)}::uuid;`);
      const historyAfterSoftDelete = requireSuccess(
        await listLitterWeightHistoryCore(
          {
            litterId: ids.journalLitter,
            schedule: {
              todayDate: "2026-07-20",
              policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
            },
          },
          owner,
        ),
      );
      expect(
        historyAfterSoftDelete.animals.some(
          (animal) => animal.id === created.journalAnimals[0],
        ),
      ).toBe(false);
      expect(
        historyAfterSoftDelete.measurements.some(
          (measurement) => measurement.animalId === created.journalAnimals[0],
        ),
      ).toBe(false);
      expect(historyAfterSoftDelete.latestSessionComparison).toEqual(
        history.latestSessionComparison,
      );
      expect(historyAfterSoftDelete.weighingSchedule).toEqual(
        scheduledHistory.weighingSchedule,
      );
    } finally {
      sql(`update public.animals set deleted_at = null
        where id = ${q(created.journalAnimals[0]!)}::uuid;`);
    }

    const adminHistory = requireSuccess(
      await listLitterWeightHistoryCore({ litterId: ids.adminLitter }, owner),
    );
    expect(adminHistory.animals.slice(0, 2).map((animal) => animal.id)).toEqual([
      ids.adminSecond,
      ids.adminFirst,
    ]);
    expect(adminHistory.animals.find((animal) => animal.id === ids.adminFirst)?.birthWeightGrams).toBe(350);
    expect(adminHistory.measurements).toEqual([]);

    const replay = requireSuccess(
      await recordLitterRoutineWeightsCore(
        {
          ...collectiveInput,
          items: [...collectiveInput.items].reverse(),
        },
        owner,
      ),
    );
    expect(replay).toEqual({ ...collective, replayed: true });
    expect(sql(`select count(*) from public.litter_weighing_sessions where id = ${q(collective.sessionId)}::uuid;`)).toBe("1");
    expect(sql(`select count(*) from public.animal_weight_measurements where litter_weighing_session_id = ${q(collective.sessionId)}::uuid;`)).toBe("3");

    const changedIntentions: RecordLitterRoutineWeightsInput[] = [
      { ...collectiveInput, measuredAt: "2026-07-19T10:31:00+02:00" },
      { ...collectiveInput, timezoneName: "UTC" },
      { ...collectiveInput, note: "Autre note" },
      { ...collectiveInput, items: [{ ...collectiveInput.items[0]!, animalId: created.journalAnimals[1]! }] },
      { ...collectiveInput, items: collectiveInput.items.map((item, index) => index === 0 ? { ...item, grams: item.grams + 1 } : item) },
      { ...collectiveInput, items: collectiveInput.items.map((item, index) => index === 0 ? { ...item, note: "Autre note individuelle" } : item) },
    ];
    for (const changed of changedIntentions) {
      expect(await recordLitterRoutineWeightsCore(changed, owner)).toMatchObject({
        outcome: "error",
        error: { code: "command_conflict" },
      });
    }

    const viewerBefore = writeCounts(ids.adminLitter);
    const viewerHistory = requireSuccess(
      await listLitterWeightHistoryCore(
        {
          litterId: ids.journalLitter,
          schedule: {
            todayDate: "2026-07-20",
            policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
          },
        },
        viewerOrMember,
      ),
    );
    expect(viewerHistory.role).toBe("viewer");
    expect(viewerHistory.weighingSchedule).toEqual(scheduledHistory.weighingSchedule);
    expect(
      await listLitterWeightHistoryCore(
        {
          litterId: ids.foreignLitter,
          schedule: {
            todayDate: "2026-07-20",
            policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
          },
        },
        viewerOrMember,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await recordLitterRoutineWeightsCore(
        routineIntent(ids.adminLitter, ids.viewerCommand, "2026-07-19T11:00:00Z", [
          { animalId: ids.adminFirst, grams: 380 },
        ]),
        viewerOrMember,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(writeCounts(ids.adminLitter)).toEqual(viewerBefore);

    sql(`update public.memberships set role = 'member'
      where id = ${q(ids.viewerMembership)}::uuid;`);
    const memberResult = requireSuccess(
      await recordLitterRoutineWeightsCore(
        routineIntent(ids.adminLitter, ids.memberCommand, "2026-07-19T11:01:00Z", [
          { animalId: ids.adminFirst, grams: 381 },
        ]),
        viewerOrMember,
      ),
    );
    created.weighingSessions.push(memberResult.sessionId);
    created.routineWeights.push(...memberResult.measurementIds);

    const memberMeasurementId = memberResult.measurementIds[0]!;
    const structuralLinkBefore = routineAnimalLinkState(
      ids.adminFirst,
      memberMeasurementId,
      memberResult.sessionId,
    );
    const forbiddenMove = await owner
      .from("animals")
      .update({ litter_id: ids.otherLitter })
      .eq("id", ids.adminFirst);
    expect(forbiddenMove.error).not.toBeNull();
    expect(
      routineAnimalLinkState(
        ids.adminFirst,
        memberMeasurementId,
        memberResult.sessionId,
      ),
    ).toEqual(structuralLinkBefore);

    const collarUpdate = await owner
      .from("animals")
      .update({ collar_color_current: "orange" })
      .eq("id", ids.adminFirst)
      .select("collar_color_current")
      .single();
    expect(collarUpdate.error).toBeNull();
    expect(collarUpdate.data?.collar_color_current).toBe("orange");

    try {
      sql(`
        begin;
        set local session_replication_role = replica;
        update public.animals
        set litter_id = ${q(ids.otherLitter)}::uuid
        where id = ${q(ids.adminFirst)}::uuid;
        commit;
      `);
      expect(
        await listLitterWeightHistoryCore({ litterId: ids.otherLitter }, owner),
      ).toMatchObject({
        outcome: "error",
        error: { code: "database_error" },
      });
    } finally {
      sql(`
        begin;
        set local session_replication_role = replica;
        update public.animals
        set litter_id = ${q(ids.adminLitter)}::uuid
        where id = ${q(ids.adminFirst)}::uuid;
        commit;
      `);
    }
    expect(
      routineAnimalLinkState(
        ids.adminFirst,
        memberMeasurementId,
        memberResult.sessionId,
      ),
    ).toEqual(structuralLinkBefore);

    const identicalInput = routineIntent(
      ids.adminLitter,
      ids.identicalConcurrentCommand,
      "2026-07-19T11:02:00Z",
      [{ animalId: ids.adminSecond, grams: 390, note: "Concurrence identique" }],
    );
    const identicalResults = await Promise.all([
      recordLitterRoutineWeightsCore(identicalInput, owner),
      recordLitterRoutineWeightsCore(identicalInput, viewerOrMember),
    ]);
    expect(identicalResults.every((result) => result.outcome === "success")).toBe(true);
    const identicalSuccesses = identicalResults.map(requireSuccess);
    expect(new Set(identicalSuccesses.map((result) => result.sessionId)).size).toBe(1);
    expect(identicalSuccesses.filter((result) => result.replayed)).toHaveLength(1);
    created.weighingSessions.push(identicalSuccesses[0]!.sessionId);
    created.routineWeights.push(...identicalSuccesses[0]!.measurementIds);

    const exactResults = await Promise.all([
      recordLitterRoutineWeightsCore(
        routineIntent(ids.adminLitter, ids.exactConcurrentOneCommand, "2026-07-19T11:03:00Z", [
          { animalId: ids.adminFirst, grams: 382 },
        ]),
        owner,
      ),
      recordLitterRoutineWeightsCore(
        routineIntent(ids.adminLitter, ids.exactConcurrentTwoCommand, "2026-07-19T11:03:00Z", [
          { animalId: ids.adminFirst, grams: 383 },
        ]),
        viewerOrMember,
      ),
    ]);
    expect(exactResults.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(exactResults.filter((result) => result.outcome === "error")).toHaveLength(1);
    expect(exactResults.find((result) => result.outcome === "error")).toMatchObject({
      error: { code: "measurement_already_recorded" },
    });
    const exactSuccess = requireSuccess(exactResults.find((result) => result.outcome === "success")!);
    created.weighingSessions.push(exactSuccess.sessionId);
    created.routineWeights.push(...exactSuccess.measurementIds);
    expect(sql(`select count(*) from public.animal_weight_measurements
      where animal_id = ${q(ids.adminFirst)}::uuid and measurement_kind = 'routine'
        and measured_at = '2026-07-19T11:03:00Z'::timestamptz;`)).toBe("1");

    const invalidBefore = writeCounts(ids.journalLitter);
    expect(
      await recordLitterRoutineWeightsCore(
        routineIntent(ids.journalLitter, ids.invalidPartialCommand, "2026-07-19T11:04:00Z", [
          { animalId: created.journalAnimals[0]!, grams: 440 },
          { animalId: ids.wrongLitterAnimal, grams: 450 },
        ]),
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(writeCounts(ids.journalLitter)).toEqual(invalidBefore);

    const errorCases = [
      {
        input: routineIntent(ids.adminLitter, ids.duplicateCommand, "2026-07-19T12:00:00Z", [
          { animalId: ids.adminFirst, grams: 380 }, { animalId: ids.adminFirst, grams: 381 },
        ]),
        code: "duplicate_animal",
      },
      {
        input: routineIntent(ids.adminLitter, ids.wrongLitterCommand, "2026-07-19T12:01:00Z", [{ animalId: ids.wrongLitterAnimal, grams: 380 }]),
        code: "not_found",
      },
      {
        input: routineIntent(ids.adminLitter, ids.foreignAnimalCommand, "2026-07-19T12:02:00Z", [{ animalId: ids.foreignAnimal, grams: 380 }]),
        code: "not_found",
      },
      {
        input: routineIntent(ids.foreignLitter, `${prefix}62`, "2026-07-19T12:02:30Z", [{ animalId: ids.foreignAnimal, grams: 380 }]),
        code: "not_found",
      },
      {
        input: routineIntent(ids.adminLitter, ids.deletedAnimalCommand, "2026-07-19T12:03:00Z", [{ animalId: ids.deletedAnimal, grams: 380 }]),
        code: "animal_ineligible",
      },
      {
        input: routineIntent(ids.adminLitter, ids.notProducedCommand, "2026-07-19T12:04:00Z", [{ animalId: ids.notProducedAnimal, grams: 380 }]),
        code: "animal_ineligible",
      },
      {
        input: routineIntent(ids.adminLitter, ids.stillbornCommand, "2026-07-19T12:05:00Z", [{ animalId: ids.stillbornAnimal, grams: 380 }]),
        code: "animal_ineligible",
      },
      {
        input: routineIntent(ids.adminLitter, ids.beforeBirthCommand, "2026-07-20T23:59:00+02:00", [{ animalId: ids.futureAnimal, grams: 380 }]),
        code: "measured_before_birth",
      },
      {
        input: routineIntent(ids.adminLitter, ids.afterDeathCommand, "2026-07-19T00:01:00+02:00", [{ animalId: ids.deceasedAnimal, grams: 380 }]),
        code: "measured_after_death",
      },
    ] as const;
    for (const errorCase of errorCases) {
      expect(await recordLitterRoutineWeightsCore(errorCase.input, owner)).toMatchObject({
        outcome: "error",
        error: { code: errorCase.code },
      });
    }

    expect(
      await recordLitterRoutineWeightsCore(
        routineIntent(ids.adminLitter, `${prefix}60`, "2026-07-19T12:10:00Z", [
          { animalId: ids.adminFirst, grams: 0 },
        ]),
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    expect(
      await recordLitterRoutineWeightsCore(
        routineIntent(
          ids.adminLitter,
          `${prefix}61`,
          "2026-07-19T12:11:00Z",
          Array.from({ length: 31 }, (_, index) => ({
            animalId: `9f190005-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
            grams: 400,
          })),
        ),
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "too_many_animals" } });

    const directSession = await owner.from("litter_weighing_sessions").insert({
      id: ids.directSession,
      organization_id: organizationId,
      litter_id: ids.adminLitter,
      measured_at: "2026-07-19T13:00:00Z",
      timezone_name: "Europe/Paris",
      created_by: ownerId,
    });
    const directMeasurement = await owner.from("animal_weight_measurements").insert({
      id: ids.directMeasurement,
      organization_id: organizationId,
      animal_id: ids.adminSecond,
      measured_at: "2026-07-19T13:00:00Z",
      grams: 400,
      measurement_kind: "routine",
      litter_weighing_session_id: collective.sessionId,
      created_by: ownerId,
    });
    const updateSession = await owner
      .from("litter_weighing_sessions")
      .update({ note: "Modification interdite" })
      .eq("id", collective.sessionId);
    const deleteSession = await owner
      .from("litter_weighing_sessions")
      .delete()
      .eq("id", collective.sessionId);
    const updateMeasurement = await owner
      .from("animal_weight_measurements")
      .update({ grams: 999 })
      .eq("id", collective.measurementIds[0]!);
    const deleteMeasurement = await owner
      .from("animal_weight_measurements")
      .delete()
      .eq("id", collective.measurementIds[0]!);
    for (const directResult of [
      directSession,
      directMeasurement,
      updateSession,
      deleteSession,
      updateMeasurement,
      deleteMeasurement,
    ]) {
      expect(directResult.error).not.toBeNull();
    }

    expect(sql(`select json_agg(json_build_array(id, birth_weight_grams) order by id)::text
      from public.animals where id in (${uuidList(created.journalAnimals)});`)).toBe(birthProjectionBefore);
    expect(stableBusinessState()).toEqual(stableBefore);

    console.info(
      JSON.stringify({
        litterRoutineWeighingFixtureCleanup: {
          created: {
            prefix: "9f190005-",
            litterIds,
            deterministicAnimalIds,
            viewerUserId: viewer.id,
            viewerMembershipId: viewer.membershipId,
            foreignOrganizationId: ids.foreignOrganization,
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
        litterRoutineWeighingFixtureCleanup: {
          deleted: {
            prefix: "9f190005-",
            litterIds,
            deterministicAnimalIds,
            viewerUserId: viewer.id,
            viewerMembershipId: viewer.membershipId,
            foreignOrganizationId: ids.foreignOrganization,
            ...created,
          },
          remaining,
        },
      }),
    );
  }
});
