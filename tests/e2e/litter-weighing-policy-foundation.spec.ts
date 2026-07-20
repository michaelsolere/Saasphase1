import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { resolveLitterWeighingSchedulePolicyForLitterCore } from "../../src/features/litter-weights/litter-weighing-policy-core";
import { listLitterWeightHistoryCore } from "../../src/features/litter-weights/litter-weights-core";
import {
  DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
  parseLitterWeighingSchedulePolicy,
} from "../../src/features/litter-weights/litter-weighing-schedule-model";
import { recordWhelpingBirthCore } from "../../src/features/whelping/whelping-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationA = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f200001-0000-4000-8000-0000000000";
const namePrefix = "E2E litter weighing policy foundation";

const ids = {
  organizationB: `${prefix}01`,
  settingsB: `${prefix}02`,
  unbornA: `${prefix}10`,
  customA: `${prefix}11`,
  recommendedA: `${prefix}12`,
  directBornA: `${prefix}13`,
  clearableA: `${prefix}14`,
  postAnimalA: `${prefix}15`,
  postSessionA: `${prefix}16`,
  postMeasurementA: `${prefix}17`,
  journalA: `${prefix}18`,
  concurrentA: `${prefix}19`,
  sameFreezeA: `${prefix}20`,
  unbornB: `${prefix}21`,
  bornB: `${prefix}22`,
  postAnimal: `${prefix}30`,
  measuredAnimal: `${prefix}31`,
  weighingSession: `${prefix}32`,
  clinicalMeasurement: `${prefix}33`,
  journalSession: `${prefix}40`,
  journalCommand: `${prefix}41`,
  user: `${prefix}80`,
  identity: `${prefix}81`,
  membership: `${prefix}82`,
} as const;

const testUser = {
  email: "litter-weighing-policy-viewer@saasphase1.invalid",
  password: "LitterWeighingPolicyViewer-2026!",
} as const;

const policyA1 = {
  phases: [{ startAgeDay: 0, endAgeDay: 10, intervalDays: 2 }],
};
const policyA2 = {
  phases: [
    { startAgeDay: 0, endAgeDay: 6, intervalDays: 3 },
    { startAgeDay: 7, endAgeDay: 9, intervalDays: 1 },
  ],
};
const policyB = {
  phases: [{ startAgeDay: 0, endAgeDay: 4, intervalDays: 1 }],
};

const litterIds = [
  ids.unbornA,
  ids.customA,
  ids.recommendedA,
  ids.directBornA,
  ids.clearableA,
  ids.postAnimalA,
  ids.postSessionA,
  ids.postMeasurementA,
  ids.journalA,
  ids.concurrentA,
  ids.sameFreezeA,
  ids.unbornB,
  ids.bornB,
] as const;

const generatedFixtureIds = {
  births: [] as string[],
  events: [] as string[],
  animals: [] as string[],
  weightMeasurements: [] as string[],
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function json(value: unknown) {
  return `${q(JSON.stringify(value))}::jsonb`;
}

function uuidList(values: readonly string[]) {
  return values.map((value) => `${q(value)}::uuid`).join(", ");
}

function cleanup() {
  sql(`
    alter table public.litters enable trigger litters_freeze_weighing_schedule_policy;

    update public.organization_settings
    set litter_weighing_schedule_policy = null,
        deleted_at = null
    where organization_id = ${q(organizationA)}::uuid;

    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'litters_litter_weighing_schedule_policy_snapshot_check'
          and conrelid = 'public.litters'::regclass
      ) then
        alter table public.litters
          add constraint litters_litter_weighing_schedule_policy_snapshot_check
          check (
            litter_weighing_schedule_policy_snapshot is null
            or public.is_valid_litter_weighing_schedule_policy(
              litter_weighing_schedule_policy_snapshot
            )
          );
      end if;

      if not exists (
        select 1 from pg_constraint
        where conname = 'organization_settings_litter_weighing_schedule_policy_check'
          and conrelid = 'public.organization_settings'::regclass
      ) then
        alter table public.organization_settings
          add constraint organization_settings_litter_weighing_schedule_policy_check
          check (
            litter_weighing_schedule_policy is null
            or public.is_valid_litter_weighing_schedule_policy(
              litter_weighing_schedule_policy
            )
          );
      end if;
    end;
    $$;

    delete from public.litter_weight_commands
    where litter_id in (${uuidList(litterIds)});

    delete from public.whelping_commands
    where litter_id in (${uuidList(litterIds)})
       or client_command_id::text like '9f200001-%';

    delete from public.animal_weight_measurements
    where id::text like '9f200001-%'
       or animal_id in (
         select id from public.animals where litter_id in (${uuidList(litterIds)})
       );

    delete from public.litter_weighing_sessions
    where id::text like '9f200001-%'
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
    where id::text like '9f200001-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.animals
    where id::text like '9f200001-%'
       or litter_id in (${uuidList(litterIds)});

    delete from public.litters
    where id::text like '9f200001-%'
       or name like ${q(`${namePrefix}%`)};

    update public.organization_settings
    set litter_weighing_schedule_policy = null,
        deleted_at = null
    where organization_id = ${q(organizationA)}::uuid;

    delete from public.organization_settings
    where organization_id = ${q(ids.organizationB)}::uuid;
    delete from public.memberships where id::text like '9f200001-%';
    delete from auth.identities where user_id::text like '9f200001-%';
    delete from auth.users where id::text like '9f200001-%';
    delete from public.organizations
    where id::text like '9f200001-%'
       or slug = 'e2e-litter-weighing-policy-isolated';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'litter_weight_commands', (select count(*) from public.litter_weight_commands
          where litter_id in (${uuidList(litterIds)})),
        'animal_weight_measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f200001-%'
             or animal_id in (select id from public.animals
               where id::text like '9f200001-%' or litter_id in (${uuidList(litterIds)}))),
        'litter_weighing_sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like '9f200001-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_commands', (select count(*) from public.whelping_commands
          where client_command_id::text like '9f200001-%' or litter_id in (${uuidList(litterIds)})),
        'whelping_births', (select count(*) from public.whelping_births birth
          join public.whelping_sessions session
            on session.organization_id = birth.organization_id and session.id = birth.session_id
          where session.litter_id in (${uuidList(litterIds)})),
        'whelping_events', (select count(*) from public.whelping_events event
          join public.whelping_sessions session
            on session.organization_id = event.organization_id and session.id = event.session_id
          where session.litter_id in (${uuidList(litterIds)})),
        'whelping_sessions', (select count(*) from public.whelping_sessions
          where id::text like '9f200001-%' or litter_id in (${uuidList(litterIds)})),
        'animals', (select count(*) from public.animals
          where id::text like '9f200001-%' or litter_id in (${uuidList(litterIds)})),
        'litters', (select count(*) from public.litters
          where id::text like '9f200001-%' or name like ${q(`${namePrefix}%`)}),
        'organization_settings', (select count(*) from public.organization_settings
          where organization_id = ${q(ids.organizationB)}::uuid),
        'memberships', (select count(*) from public.memberships where id::text like '9f200001-%'),
        'profiles', (select count(*) from public.profiles where id::text like '9f200001-%'),
        'auth_identities', (select count(*) from auth.identities where user_id::text like '9f200001-%'),
        'auth_users', (select count(*) from auth.users where id::text like '9f200001-%'),
        'organizations', (select count(*) from public.organizations
          where id::text like '9f200001-%' or slug = 'e2e-litter-weighing-policy-isolated'),
        'seed_policy', (select count(*) from public.organization_settings
          where organization_id = ${q(organizationA)}::uuid
            and (litter_weighing_schedule_policy is not null or deleted_at is not null))
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.organizationB)}::uuid,
      'E2E Litter Weighing Policy Isolated',
      'e2e-litter-weighing-policy-isolated'
    );

    insert into public.organization_settings (
      id, organization_id, litter_weighing_schedule_policy,
      created_by, updated_by
    ) values (
      ${q(ids.settingsB)}::uuid, ${q(ids.organizationB)}::uuid,
      ${json(policyB)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, status, actual_birth_date,
      litter_weighing_schedule_policy_snapshot,
      litter_weighing_schedule_policy_source,
      litter_weighing_schedule_policy_frozen_at,
      created_by, updated_by
    ) values
      (${q(ids.unbornA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} unborn A`)},
       'dog', 'Golden Retriever', 'planned', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.customA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} custom A`)},
       'dog', 'Golden Retriever', 'birth_expected', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.recommendedA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} recommended A`)},
       'dog', 'Golden Retriever', 'birth_expected', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.directBornA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} direct born A`)},
       'dog', 'Golden Retriever', 'born', '2026-07-01', ${json(policyA1)}, 'organization', now() - interval '1 year',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.clearableA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} clearable A`)},
       'dog', 'Golden Retriever', 'born', '2026-07-02', null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.postAnimalA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} post animal A`)},
       'dog', 'Golden Retriever', 'born', '2026-07-03', null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.postSessionA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} post session A`)},
       'dog', 'Golden Retriever', 'born', '2026-07-04', null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.postMeasurementA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} post measurement A`)},
       'dog', 'Golden Retriever', 'born', '2026-07-05', null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.journalA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} journal A`)},
       'dog', 'Golden Retriever', 'birth_in_progress', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} concurrent A`)},
       'dog', 'Golden Retriever', 'birth_expected', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.sameFreezeA)}::uuid, ${q(organizationA)}::uuid, ${q(`${namePrefix} same freeze A`)},
       'dog', 'Golden Retriever', 'birth_expected', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.unbornB)}::uuid, ${q(ids.organizationB)}::uuid, ${q(`${namePrefix} unborn B`)},
       'dog', 'Golden Retriever', 'planned', null, null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.bornB)}::uuid, ${q(ids.organizationB)}::uuid, ${q(`${namePrefix} born B`)},
       'dog', 'Golden Retriever', 'born', '2026-07-06', null, null, null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, species, breed, sex, status,
      ownership_status, birth_date, deleted_at, created_by, updated_by
    ) values
      (${q(ids.postAnimal)}::uuid, ${q(organizationA)}::uuid, ${q(ids.postAnimalA)}::uuid,
       'dog', 'Golden Retriever', 'unknown', 'born', 'produced', '2026-07-03', now(),
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.measuredAnimal)}::uuid, ${q(organizationA)}::uuid, ${q(ids.postMeasurementA)}::uuid,
       'dog', 'Golden Retriever', 'unknown', 'born', 'owned', '2026-07-05', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, created_by
    ) values (
      ${q(ids.weighingSession)}::uuid, ${q(organizationA)}::uuid,
      ${q(ids.postSessionA)}::uuid, '2026-07-05T10:00:00Z', 'Europe/Paris',
      ${q(ownerId)}::uuid
    );

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams,
      measurement_kind, source_birth_id, litter_weighing_session_id, created_by
    ) values (
      ${q(ids.clinicalMeasurement)}::uuid, ${q(organizationA)}::uuid,
      ${q(ids.measuredAnimal)}::uuid, '2026-07-06T10:00:00Z', 500,
      'clinical', null, null, ${q(ownerId)}::uuid
    );

    update public.litters
    set mother_id = 'd0000000-0000-4000-8000-000000000001'::uuid,
        father_id = 'd0000000-0000-4000-8000-000000000006'::uuid
    where id = ${q(ids.journalA)}::uuid;

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at,
      timezone_name, created_by, updated_by
    ) values (
      ${q(ids.journalSession)}::uuid, ${q(organizationA)}::uuid,
      ${q(ids.journalA)}::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
      'open', '2026-07-10T08:00:00Z', 'Europe/Paris',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(ids.user)}::uuid, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${q(testUser.email)},
      extensions.crypt(${q(testUser.password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Policy viewer"}'::jsonb, now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(ids.identity)}::uuid, ${q(testUser.email)}, ${q(ids.user)}::uuid,
      jsonb_build_object(
        'sub', ${q(ids.user)}, 'email', ${q(testUser.email)},
        'email_verified', true, 'phone_verified', false
      ), 'email', now(), now()
    );

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(ids.membership)}::uuid, ${q(organizationA)}::uuid,
      ${q(ids.user)}::uuid, 'viewer', 'active',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

async function testUserClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword(testUser);
  if (signedIn.error) throw signedIn.error;
  return client;
}

function requirePolicySuccess(
  result: Awaited<ReturnType<typeof resolveLitterWeighingSchedulePolicyForLitterCore>>,
) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected policy success");
  return result;
}

function requireHistorySuccess(
  result: Awaited<ReturnType<typeof listLitterWeightHistoryCore>>,
) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected history success");
  return result;
}

function snapshot(litterId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'actualBirthDate', actual_birth_date,
        'policy', litter_weighing_schedule_policy_snapshot,
        'source', litter_weighing_schedule_policy_source,
        'frozenAt', litter_weighing_schedule_policy_frozen_at
      )::text
      from public.litters where id = ${q(litterId)}::uuid;
    `),
  ) as {
    actualBirthDate: string | null;
    policy: unknown;
    source: string | null;
    frozenAt: string | null;
  };
}

test("persists, freezes and securely resolves organization weighing policies", async () => {
  for (const idsForTable of Object.values(generatedFixtureIds)) idsForTable.length = 0;
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const viewer = await testUserClient();

    expect(
      JSON.parse(sql("select public.recommended_litter_weighing_schedule_policy()::text;")),
    ).toEqual(DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY);

    const invalidPolicies = [
      null,
      {},
      { phases: [] },
      { phases: [{ startAgeDay: 0, endAgeDay: 1, intervalDays: 1 }], extra: true },
      { phases: [{ startAgeDay: 0, endAgeDay: 1, intervalDays: 1, extra: true }] },
      { phases: [{ startAgeDay: 0.5, endAgeDay: 1, intervalDays: 1 }] },
      { phases: [{ startAgeDay: 0, endAgeDay: 366, intervalDays: 1 }] },
      {
        phases: [
          { startAgeDay: 10, endAgeDay: 12, intervalDays: 1 },
          { startAgeDay: 0, endAgeDay: 2, intervalDays: 1 },
        ],
      },
      {
        phases: [
          { startAgeDay: 0, endAgeDay: 10, intervalDays: 1 },
          { startAgeDay: 10, endAgeDay: 20, intervalDays: 2 },
        ],
      },
      {
        phases: Array.from({ length: 13 }, (_, index) => ({
          startAgeDay: index * 2,
          endAgeDay: index * 2,
          intervalDays: 1,
        })),
      },
    ];
    for (const invalidPolicy of invalidPolicies) {
      expect(parseLitterWeighingSchedulePolicy(invalidPolicy).ok).toBe(false);
    }
    expect(
      sql(`
        select bool_and(not public.is_valid_litter_weighing_schedule_policy(value))
        from jsonb_array_elements(${json(invalidPolicies)}) candidate(value);
      `),
    ).toBe("t");

    const invalidSqlWrite = await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: { phases: [] } })
      .eq("organization_id", organizationA);
    expect(invalidSqlWrite.error).not.toBeNull();

    const recommendedResolution = requirePolicySuccess(
      await resolveLitterWeighingSchedulePolicyForLitterCore(
        { litterId: ids.unbornA },
        owner,
      ),
    );
    expect(recommendedResolution).toEqual({
      outcome: "success",
      policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
      source: "recommended",
    });
    const historyWithoutSchedule = requireHistorySuccess(
      await listLitterWeightHistoryCore({ litterId: ids.unbornA }, owner),
    );
    expect(historyWithoutSchedule.weighingSchedule).toBeNull();
    expect(historyWithoutSchedule.weighingSchedulePolicy).toBeNull();

    const recommendedHistory = requireHistorySuccess(
      await listLitterWeightHistoryCore(
        { litterId: ids.unbornA, schedule: { todayDate: "2026-07-20" } },
        owner,
      ),
    );
    expect(recommendedHistory.weighingSchedule).toMatchObject({
      status: "missing_actual_birth_date",
    });
    expect(recommendedHistory.weighingSchedulePolicy).toEqual({
      source: "recommended",
      phases: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY.phases,
    });
    expect(JSON.stringify(recommendedHistory.weighingSchedulePolicy)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );

    sql(`update public.organization_settings set deleted_at = now()
      where organization_id = ${q(organizationA)}::uuid;`);
    expect(
      requireHistorySuccess(
        await listLitterWeightHistoryCore(
          { litterId: ids.unbornA, schedule: { todayDate: "2026-07-20" } },
          owner,
        ),
      ).weighingSchedulePolicy,
    ).toEqual({
      source: "recommended",
      phases: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY.phases,
    });
    sql(`update public.organization_settings set deleted_at = null
      where organization_id = ${q(organizationA)}::uuid;`);

    const initialUnborn = snapshot(ids.unbornA);
    expect(initialUnborn).toEqual({
      actualBirthDate: null,
      policy: null,
      source: null,
      frozenAt: null,
    });

    const directBorn = snapshot(ids.directBornA);
    expect(directBorn.policy).toEqual(DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY);
    expect(directBorn.source).toBe("recommended");
    expect(directBorn.frozenAt).not.toBeNull();

    const historical = JSON.parse(
      sql(`
        select json_build_object(
          'born_policy', born.litter_weighing_schedule_policy_snapshot,
          'born_source', born.litter_weighing_schedule_policy_source,
          'born_frozen', born.litter_weighing_schedule_policy_frozen_at is not null,
          'unborn_policy', unborn.litter_weighing_schedule_policy_snapshot,
          'unborn_source', unborn.litter_weighing_schedule_policy_source,
          'unborn_frozen', unborn.litter_weighing_schedule_policy_frozen_at
        )::text
        from public.litters born
        cross join public.litters unborn
        where born.id = 'c0000000-0000-4000-8000-000000000001'::uuid
          and unborn.id = 'c0000000-0000-4000-8000-000000000002'::uuid;
      `),
    );
    expect(historical).toEqual({
      born_policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
      born_source: "recommended",
      born_frozen: true,
      unborn_policy: null,
      unborn_source: null,
      unborn_frozen: null,
    });
    const historicalHistory = requireHistorySuccess(
      await listLitterWeightHistoryCore(
        {
          litterId: "c0000000-0000-4000-8000-000000000001",
          schedule: { todayDate: "2026-07-20" },
        },
        owner,
      ),
    );
    expect(historicalHistory.weighingSchedulePolicy).toEqual({
      source: "litter_snapshot",
      phases: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY.phases,
    });

    const customWrite = await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA1 as Json })
      .eq("organization_id", organizationA);
    expect(customWrite.error).toBeNull();

    expect(
      requirePolicySuccess(
        await resolveLitterWeighingSchedulePolicyForLitterCore(
          { litterId: ids.unbornA },
          owner,
        ),
      ),
    ).toEqual({ outcome: "success", policy: policyA1, source: "organization" });
    const unbornOrganizationHistory = requireHistorySuccess(
      await listLitterWeightHistoryCore(
        { litterId: ids.unbornA, schedule: { todayDate: "2026-07-20" } },
        owner,
      ),
    );
    expect(unbornOrganizationHistory.weighingSchedule).toMatchObject({
      status: "missing_actual_birth_date",
    });
    expect(unbornOrganizationHistory.weighingSchedulePolicy).toEqual({
      source: "organization",
      phases: policyA1.phases,
    });

    expect(snapshot(ids.bornB)).toMatchObject({ policy: policyB, source: "organization" });
    expect(snapshot(ids.bornB).policy).not.toEqual(policyA1);

    const customFreeze = await owner
      .from("litters")
      .update({ actual_birth_date: "2026-07-10" })
      .eq("id", ids.customA);
    expect(customFreeze.error).toBeNull();
    const frozenCustom = snapshot(ids.customA);
    expect(frozenCustom).toMatchObject({ policy: policyA1, source: "organization" });
    const frozenCustomHistory = requireHistorySuccess(
      await listLitterWeightHistoryCore(
        { litterId: ids.customA, schedule: { todayDate: "2026-07-20" } },
        owner,
      ),
    );
    expect(frozenCustomHistory.weighingSchedulePolicy).toEqual({
      source: "litter_snapshot",
      phases: policyA1.phases,
    });

    const clearOrganizationPolicy = await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: null })
      .eq("organization_id", organizationA);
    expect(clearOrganizationPolicy.error).toBeNull();
    const recommendedFreeze = await owner
      .from("litters")
      .update({ actual_birth_date: "2026-07-11" })
      .eq("id", ids.recommendedA);
    expect(recommendedFreeze.error).toBeNull();
    expect(snapshot(ids.recommendedA)).toMatchObject({
      policy: DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY,
      source: "recommended",
    });

    await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA1 as Json })
      .eq("organization_id", organizationA);
    const journalBirth = await recordWhelpingBirthCore(
      {
        sessionId: ids.journalSession,
        clientCommandId: ids.journalCommand,
        occurredAt: "2026-07-10T09:00:00Z",
        sex: "male",
        viability: "alive",
      },
      owner,
    );
    expect(journalBirth.outcome).toBe("success");
    if (journalBirth.outcome === "success") {
      generatedFixtureIds.births.push(journalBirth.birthId);
      generatedFixtureIds.events.push(journalBirth.eventId);
      generatedFixtureIds.animals.push(journalBirth.animalId);
      if (journalBirth.weightMeasurementId) {
        generatedFixtureIds.weightMeasurements.push(journalBirth.weightMeasurementId);
      }
    }
    const journalSnapshot = snapshot(ids.journalA);
    expect(journalSnapshot).toMatchObject({ policy: policyA1, source: "organization" });

    await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA2 as Json })
      .eq("organization_id", organizationA);
    expect(snapshot(ids.customA)).toEqual(frozenCustom);
    expect(snapshot(ids.journalA)).toEqual(journalSnapshot);
    expect(
      requireHistorySuccess(
        await listLitterWeightHistoryCore(
          { litterId: ids.customA, schedule: { todayDate: "2026-07-20" } },
          owner,
        ),
      ).weighingSchedulePolicy,
    ).toEqual({ source: "litter_snapshot", phases: policyA1.phases });

    for (const date of ["2026-07-10", "2026-07-12"]) {
      const correction = await owner
        .from("litters")
        .update({ actual_birth_date: date })
        .eq("id", ids.customA);
      expect(correction.error).toBeNull();
      expect(snapshot(ids.customA)).toMatchObject({
        policy: frozenCustom.policy,
        source: frozenCustom.source,
        frozenAt: frozenCustom.frozenAt,
      });
    }

    for (const mutation of [
      { litter_weighing_schedule_policy_snapshot: policyA2 as Json },
      { litter_weighing_schedule_policy_source: "recommended" },
      { litter_weighing_schedule_policy_frozen_at: null },
    ]) {
      const refused = await owner.from("litters").update(mutation).eq("id", ids.customA);
      expect(refused.error).not.toBeNull();
    }

    const clearEmpty = await owner
      .from("litters")
      .update({ actual_birth_date: null })
      .eq("id", ids.clearableA);
    expect(clearEmpty.error).toBeNull();
    expect(snapshot(ids.clearableA)).toEqual({
      actualBirthDate: null,
      policy: null,
      source: null,
      frozenAt: null,
    });

    for (const litterId of [ids.postAnimalA, ids.postSessionA, ids.postMeasurementA]) {
      const refused = await owner
        .from("litters")
        .update({ actual_birth_date: null })
        .eq("id", litterId);
      expect(refused.error).not.toBeNull();
    }

    for (const date of [null, "2026-07-11"]) {
      const protectedJournal = await owner
        .from("litters")
        .update({ actual_birth_date: date })
        .eq("id", ids.journalA);
      expect(protectedJournal.error).not.toBeNull();
    }

    await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA1 as Json })
      .eq("organization_id", organizationA);
    await Promise.all([
      runE2eSql(`
        begin;
        update public.organization_settings
        set litter_weighing_schedule_policy = ${json(policyA2)}
        where organization_id = ${q(organizationA)}::uuid;
        select pg_catalog.pg_sleep(1);
        commit;
      `),
      runE2eSql(`
        select pg_catalog.pg_sleep(0.2);
        update public.litters
        set actual_birth_date = '2026-07-13'
        where id = ${q(ids.concurrentA)}::uuid;
      `),
    ]);
    expect(snapshot(ids.concurrentA)).toMatchObject({
      policy: policyA2,
      source: "organization",
    });

    await owner
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA1 as Json })
      .eq("organization_id", organizationA);
    await Promise.all([
      runE2eSql(`update public.litters set actual_birth_date = '2026-07-14'
        where id = ${q(ids.sameFreezeA)}::uuid;`),
      runE2eSql(`update public.litters set actual_birth_date = '2026-07-14'
        where id = ${q(ids.sameFreezeA)}::uuid;`),
    ]);
    expect(snapshot(ids.sameFreezeA)).toMatchObject({
      policy: policyA1,
      source: "organization",
    });

    const viewerRead = requirePolicySuccess(
      await resolveLitterWeighingSchedulePolicyForLitterCore(
        { litterId: ids.unbornA },
        viewer,
      ),
    );
    expect(viewerRead.source).toBe("organization");
    const viewerHistory = requireHistorySuccess(
      await listLitterWeightHistoryCore(
        { litterId: ids.unbornA, schedule: { todayDate: "2026-07-20" } },
        viewer,
      ),
    );
    expect(viewerHistory.role).toBe("viewer");
    expect(viewerHistory.weighingSchedulePolicy?.source).toBe("organization");
    expect(JSON.stringify(viewerRead)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    const settingsBeforeForbiddenWrites = sql(`select litter_weighing_schedule_policy::text
      from public.organization_settings
      where organization_id = ${q(organizationA)}::uuid;`);
    await viewer
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA2 as Json })
      .eq("organization_id", organizationA);
    expect(
      sql(`select litter_weighing_schedule_policy::text
        from public.organization_settings
        where organization_id = ${q(organizationA)}::uuid;`),
    ).toBe(settingsBeforeForbiddenWrites);

    sql(`update public.memberships set role = 'member'
      where id = ${q(ids.membership)}::uuid;`);
    await viewer
      .from("organization_settings")
      .update({ litter_weighing_schedule_policy: policyA2 as Json })
      .eq("organization_id", organizationA);
    expect(
      sql(`select litter_weighing_schedule_policy::text
        from public.organization_settings
        where organization_id = ${q(organizationA)}::uuid;`),
    ).toBe(settingsBeforeForbiddenWrites);

    expect(
      await resolveLitterWeighingSchedulePolicyForLitterCore(
        { litterId: ids.unbornB },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await listLitterWeightHistoryCore(
        { litterId: ids.unbornB, schedule: { todayDate: "2026-07-20" } },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    sql(`update public.memberships set status = 'disabled'
      where id = ${q(ids.membership)}::uuid;`);
    expect(
      await resolveLitterWeighingSchedulePolicyForLitterCore(
        { litterId: ids.unbornA },
        viewer,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await listLitterWeightHistoryCore(
        { litterId: ids.unbornA, schedule: { todayDate: "2026-07-20" } },
        viewer,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    sql(`
      alter table public.organization_settings
        drop constraint organization_settings_litter_weighing_schedule_policy_check;
      update public.organization_settings
      set litter_weighing_schedule_policy = '{"phases":[]}'::jsonb,
          deleted_at = null
      where organization_id = ${q(organizationA)}::uuid;
    `);
    expect(
      await listLitterWeightHistoryCore(
        { litterId: ids.unbornA, schedule: { todayDate: "2026-07-20" } },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "database_error" } });
    sql(`
      update public.organization_settings
      set litter_weighing_schedule_policy = null
      where organization_id = ${q(organizationA)}::uuid;
      alter table public.organization_settings
        add constraint organization_settings_litter_weighing_schedule_policy_check
        check (
          litter_weighing_schedule_policy is null
          or public.is_valid_litter_weighing_schedule_policy(
            litter_weighing_schedule_policy
          )
        );
    `);

    sql(`
      alter table public.litters disable trigger litters_freeze_weighing_schedule_policy;
      alter table public.litters
        drop constraint litters_litter_weighing_schedule_policy_snapshot_check;
      update public.litters
      set litter_weighing_schedule_policy_snapshot = '{"phases":[]}'::jsonb
      where id = ${q(ids.directBornA)}::uuid;
      alter table public.litters enable trigger litters_freeze_weighing_schedule_policy;
    `);
    expect(
      await resolveLitterWeighingSchedulePolicyForLitterCore(
        { litterId: ids.directBornA },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "inconsistent_data" } });
    expect(
      await listLitterWeightHistoryCore(
        { litterId: ids.directBornA, schedule: { todayDate: "2026-07-20" } },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "database_error" } });

    sql(`
      alter table public.litters disable trigger litters_freeze_weighing_schedule_policy;
      update public.litters
      set litter_weighing_schedule_policy_snapshot =
        public.recommended_litter_weighing_schedule_policy()
      where id = ${q(ids.directBornA)}::uuid;
      alter table public.litters enable trigger litters_freeze_weighing_schedule_policy;
      alter table public.litters
        add constraint litters_litter_weighing_schedule_policy_snapshot_check
        check (
          litter_weighing_schedule_policy_snapshot is null
          or public.is_valid_litter_weighing_schedule_policy(
            litter_weighing_schedule_policy_snapshot
          )
        );
    `);
  } finally {
    cleanup();
    expectCleanupAtZero();
    console.info(
      JSON.stringify({
        litterWeighingPolicyFixtureCleanup: {
          created: {
            deterministicPrefix: "9f200001-",
            litterIds,
            organizationId: ids.organizationB,
            userId: ids.user,
            membershipId: ids.membership,
            ...generatedFixtureIds,
          },
          deleted: "all created fixture rows, in reverse dependency order",
          remaining: remainingCounts(),
        },
      }),
    );
  }
});
