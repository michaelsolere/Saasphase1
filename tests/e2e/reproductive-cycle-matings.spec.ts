import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  createReproductiveCycleCore,
  listReproductiveCycleMatingsForCycleCore,
  recordReproductiveCycleMatingCore,
} from "../../src/features/reproduction/reproductive-cycles-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f180002-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E reproductive cycle matings";

const ids = {
  mainMother: `${prefix}01`,
  concurrentMother: `${prefix}02`,
  allocationMother: `${prefix}03`,
  protectedMother: `${prefix}04`,
  closedMother: `${prefix}05`,
  cancelledMother: `${prefix}06`,
  lockedFatherMother: `${prefix}07`,
  foreignMother: `${prefix}08`,
  father: `${prefix}10`,
  otherFather: `${prefix}11`,
  retiredFather: `${prefix}12`,
  catFather: `${prefix}13`,
  externalFather: `${prefix}14`,
  lockedFather: `${prefix}15`,
  otherOrganization: `${prefix}90`,
  foreignCycle: `${prefix}70`,
  missingCycle: `${prefix}71`,
  viewerUser: `${prefix}30`,
  viewerIdentity: `${prefix}31`,
  viewerMembership: `${prefix}32`,
  inactiveUser: `${prefix}40`,
  inactiveIdentity: `${prefix}41`,
  inactiveMembership: `${prefix}42`,
  commandFirst: `${prefix}51`,
  commandSecond: `${prefix}52`,
  commandThird: `${prefix}53`,
  commandDifferentFather: `${prefix}54`,
  commandRetiredFather: `${prefix}55`,
  commandCatFather: `${prefix}56`,
  commandExternalFather: `${prefix}57`,
  commandViewer: `${prefix}58`,
  commandInactive: `${prefix}59`,
  commandConcurrent: `${prefix}60`,
  commandAllocationOne: `${prefix}61`,
  commandAllocationTwo: `${prefix}62`,
  commandClosed: `${prefix}63`,
  commandCancelled: `${prefix}64`,
  commandLockedFather: `${prefix}67`,
  commandForeignCycle: `${prefix}68`,
  commandMissingCycle: `${prefix}69`,
} as const;

const users = {
  viewer: {
    id: ids.viewerUser,
    identityId: ids.viewerIdentity,
    membershipId: ids.viewerMembership,
    email: "reproductive-matings-viewer@saasphase1.invalid",
    password: "ReproductiveMatingsViewer-2026!",
    role: "viewer",
    status: "active",
  },
  inactive: {
    id: ids.inactiveUser,
    identityId: ids.inactiveIdentity,
    membershipId: ids.inactiveMembership,
    email: "reproductive-matings-inactive@saasphase1.invalid",
    password: "ReproductiveMatingsInactive-2026!",
    role: "member",
    status: "disabled",
  },
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function fixtureAnimalIdsSql() {
  return [
    ids.mainMother,
    ids.concurrentMother,
    ids.allocationMother,
    ids.protectedMother,
    ids.closedMother,
    ids.cancelledMother,
    ids.lockedFatherMother,
    ids.foreignMother,
    ids.father,
    ids.otherFather,
    ids.retiredFather,
    ids.catFather,
    ids.externalFather,
    ids.lockedFather,
  ]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function cleanup() {
  sql(`
    drop function if exists public.e2e_hold_reproductive_mating_father(uuid);

    delete from public.reproductive_cycle_matings
    where cycle_id in (
      select id
      from public.reproductive_cycles
      where mother_id in (${fixtureAnimalIdsSql()})
         or notes like ${q(`${fixtureNamePrefix}%`)}
    )
       or id::text like '9f180002-%';

    delete from public.progesterone_measurements
    where cycle_id in (
      select id
      from public.reproductive_cycles
      where mother_id in (${fixtureAnimalIdsSql()})
         or notes like ${q(`${fixtureNamePrefix}%`)}
    );

    delete from public.reproductive_cycles
    where mother_id in (${fixtureAnimalIdsSql()})
       or notes like ${q(`${fixtureNamePrefix}%`)}
       or id::text like '9f180002-%';

    delete from public.litters
    where name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${fixtureAnimalIdsSql()});

    delete from public.memberships where id::text like '9f180002-%';
    delete from auth.identities where user_id::text like '9f180002-%';
    delete from auth.users where id::text like '9f180002-%';
    delete from public.organizations where id = ${q(ids.otherOrganization)}::uuid;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'reproductive_cycle_matings', (
          select count(*)
          from public.reproductive_cycle_matings
          where cycle_id in (
            select id
            from public.reproductive_cycles
            where mother_id in (${fixtureAnimalIdsSql()})
               or notes like ${q(`${fixtureNamePrefix}%`)}
          )
             or id::text like '9f180002-%'
        ),
        'progesterone_measurements', (
          select count(*)
          from public.progesterone_measurements
          where cycle_id in (
            select id
            from public.reproductive_cycles
            where mother_id in (${fixtureAnimalIdsSql()})
               or notes like ${q(`${fixtureNamePrefix}%`)}
          )
        ),
        'reproductive_cycles', (
          select count(*)
          from public.reproductive_cycles
          where mother_id in (${fixtureAnimalIdsSql()})
             or notes like ${q(`${fixtureNamePrefix}%`)}
             or id::text like '9f180002-%'
        ),
        'litters', (
          select count(*)
          from public.litters
          where name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${fixtureAnimalIdsSql()})
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f180002-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f180002-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f180002-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f180002-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
        ),
        'e2e_lock_function', (
          select count(*)
          from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname = 'e2e_hold_reproductive_mating_father'
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

function outOfScopeCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'applications', (select count(*) from public.applications),
        'reservations', (select count(*) from public.reservations),
        'payments', (select count(*) from public.payments),
        'documents', (select count(*) from public.documents),
        'events', (select count(*) from public.events),
        'litter_groups', (select count(*) from public.litter_groups)
      )::text;
    `),
  ) as Record<string, number>;
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
        jsonb_build_object('display_name', ${q(`Reproductive matings ${user.role}`)}),
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
        ${q(user.id)}::uuid, ${q(user.role)}, ${q(user.status)},
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
  }
}

function createAnimalFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E saillies isolée',
      'e2e-saillies-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, is_breeder, is_external, is_retired,
      created_by, updated_by
    ) values
      (${q(ids.mainMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère principale saillies E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.concurrentMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère concurrence saillies E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.allocationMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère allocation saillies E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.protectedMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère protection saillies E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère cycle clos E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelledMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère cycle annulé E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.lockedFatherMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère verrou père E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Mère cycle étrangère E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid,
       'Père principal saillies E2E', 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherFather)}::uuid, ${q(organizationId)}::uuid,
       'Autre père saillies E2E', 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.retiredFather)}::uuid, ${q(organizationId)}::uuid,
       'Père retraité saillies E2E', 'dog', 'Golden Retriever', 'male',
       'retired', 'owned', true, false, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.catFather)}::uuid, ${q(organizationId)}::uuid,
       'Père chat saillies E2E', 'cat', 'Maine Coon', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.externalFather)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Père autre organisation saillies E2E', 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.lockedFather)}::uuid, ${q(organizationId)}::uuid,
       'Père verrou concurrent E2E', 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, false, false, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

function createForeignCycleFixture() {
  sql(`
    insert into public.reproductive_cycles (
      id, organization_id, mother_id, species, breed, status, started_on,
      notes, created_by, updated_by
    ) values (
      ${q(ids.foreignCycle)}::uuid, ${q(ids.otherOrganization)}::uuid,
      ${q(ids.foreignMother)}::uuid, 'dog', 'Golden Retriever', 'in_progress',
      '2026-07-01', ${q(`${fixtureNamePrefix} foreign cycle`)},
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

function successful<T extends { outcome: string }>(result: T) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") {
    throw new Error("Expected a successful reproductive cycle mating result.");
  }
  return result;
}

test("records idempotent reproductive cycle matings and links exactly one litter", async () => {
  cleanup();
  expectCleanupAtZero();

  const outOfScopeBefore = outOfScopeCounts();

  try {
    createUserFixtures();
    createAnimalFixtures();
    createForeignCycleFixture();

    const owner = await createAuthenticatedSupabaseClient();
    const viewer = await clientFor(users.viewer);
    const inactive = await clientFor(users.inactive);

    const createCycle = async (
      motherId: string,
      status: "in_progress" | "closed" | "cancelled" = "in_progress",
    ) => {
      const result = await createReproductiveCycleCore(
        {
          motherId,
          status,
          startedOn: "2026-07-01",
          endedOn: status === "in_progress" ? null : "2026-07-02",
          notes: `${fixtureNamePrefix} ${motherId}`,
        },
        owner,
      );
      return successful(result).cycle;
    };

    const mainCycle = await createCycle(ids.mainMother);
    const concurrentCycle = await createCycle(ids.concurrentMother);
    const allocationCycle = await createCycle(ids.allocationMother);
    const protectedCycle = await createCycle(ids.protectedMother);
    const closedCycle = await createCycle(ids.closedMother, "closed");
    const cancelledCycle = await createCycle(ids.cancelledMother, "cancelled");
    const lockedFatherCycle = await createCycle(ids.lockedFatherMother);

    const inaccessibleCycleInput = {
      clientCommandId: ids.commandForeignCycle,
      fatherId: ids.father,
      occurredAt: "2026-07-20T08:00:00+02:00",
      timezoneName: "Europe/Paris",
      method: "natural" as const,
    };
    const foreignCycleResult = await recordReproductiveCycleMatingCore(
      { ...inaccessibleCycleInput, cycleId: ids.foreignCycle },
      owner,
    );
    const missingCycleResult = await recordReproductiveCycleMatingCore(
      {
        ...inaccessibleCycleInput,
        cycleId: ids.missingCycle,
        clientCommandId: ids.commandMissingCycle,
      },
      owner,
    );
    expect(foreignCycleResult).toEqual(missingCycleResult);
    expect(foreignCycleResult).toMatchObject({
      outcome: "error",
      error: { code: "not_found" },
    });

    const [foreignCycleRpc, missingCycleRpc] = await Promise.all([
      owner.rpc("record_reproductive_cycle_mating", {
        p_cycle_id: ids.foreignCycle,
        p_client_command_id: ids.commandForeignCycle,
        p_father_id: ids.father,
        p_occurred_at: "2026-07-20T06:00:00.000Z",
        p_timezone_name: "Europe/Paris",
        p_method: "natural",
      }),
      owner.rpc("record_reproductive_cycle_mating", {
        p_cycle_id: ids.missingCycle,
        p_client_command_id: ids.commandMissingCycle,
        p_father_id: ids.father,
        p_occurred_at: "2026-07-20T06:00:00.000Z",
        p_timezone_name: "Europe/Paris",
        p_method: "natural",
      }),
    ]);
    expect(foreignCycleRpc.error).toBeNull();
    expect(missingCycleRpc.error).toBeNull();
    expect(foreignCycleRpc.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "cycle_not_found",
      mating_id: null,
      litter_id: null,
      sequence_no: null,
      replayed: false,
    });
    expect(missingCycleRpc.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "cycle_not_found",
      mating_id: null,
      litter_id: null,
      sequence_no: null,
      replayed: false,
    });

    const first = successful(
      await recordReproductiveCycleMatingCore(
        {
          cycleId: mainCycle.id,
          clientCommandId: ids.commandFirst,
          fatherId: ids.father,
          occurredAt: "2026-07-20T10:30:00+02:00",
          timezoneName: "Europe/Paris",
          method: "natural",
          location: "Élevage E2E",
          note: `${fixtureNamePrefix} première saillie`,
          litterName: `${fixtureNamePrefix} principale`,
        },
        owner,
      ),
    );

    expect(first).toMatchObject({
      cycleId: mainCycle.id,
      sequenceNo: 1,
      replayed: false,
    });

    const firstState = JSON.parse(
      sql(`
        select json_build_object(
          'litter_count', (
            select count(*) from public.litters
            where name = ${q(`${fixtureNamePrefix} principale`)}
          ),
          'cycle_litter_id', (
            select litter_id::text from public.reproductive_cycles
            where id = ${q(mainCycle.id)}::uuid
          ),
          'cycle_status', (
            select status from public.reproductive_cycles
            where id = ${q(mainCycle.id)}::uuid
          ),
          'litter_status', (
            select status from public.litters where id = ${q(first.litterId)}::uuid
          ),
          'mating_date', (
            select mating_date::text from public.litters where id = ${q(first.litterId)}::uuid
          ),
          'mating_date_2', (
            select mating_date_2::text from public.litters where id = ${q(first.litterId)}::uuid
          )
        )::text;
      `),
    ) as Record<string, string | number | null>;

    expect(firstState).toEqual({
      litter_count: 1,
      cycle_litter_id: first.litterId,
      cycle_status: "mated",
      litter_status: "mating_done",
      mating_date: "2026-07-20",
      mating_date_2: null,
    });

    const replay = successful(
      await recordReproductiveCycleMatingCore(
        {
          cycleId: mainCycle.id,
          clientCommandId: ids.commandFirst,
          fatherId: ids.father,
          occurredAt: "2026-07-20T10:30:00+02:00",
          timezoneName: "Europe/Paris",
          method: "natural",
        },
        owner,
      ),
    );
    expect(replay).toEqual({ ...first, replayed: true });

    const concurrentOwner = await createAuthenticatedSupabaseClient();
    const concurrentResults = await Promise.all([
      recordReproductiveCycleMatingCore(
        {
          cycleId: concurrentCycle.id,
          clientCommandId: ids.commandConcurrent,
          fatherId: ids.father,
          occurredAt: "2026-07-20T11:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "ai_fresh",
          litterName: `${fixtureNamePrefix} concurrence`,
        },
        owner,
      ),
      recordReproductiveCycleMatingCore(
        {
          cycleId: concurrentCycle.id,
          clientCommandId: ids.commandConcurrent,
          fatherId: ids.father,
          occurredAt: "2026-07-20T11:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "ai_fresh",
          litterName: `${fixtureNamePrefix} concurrence`,
        },
        concurrentOwner,
      ),
    ]);
    const concurrentFirst = successful(concurrentResults[0]);
    const concurrentReplay = successful(concurrentResults[1]);
    expect([concurrentFirst.replayed, concurrentReplay.replayed].sort()).toEqual([
      false,
      true,
    ]);
    expect(concurrentFirst.matingId).toBe(concurrentReplay.matingId);
    expect(concurrentFirst.litterId).toBe(concurrentReplay.litterId);
    expect(
      Number(
        sql(`
          select count(*)
          from public.litters
          where name = ${q(`${fixtureNamePrefix} concurrence`)};
        `),
      ),
    ).toBe(1);

    const second = successful(
      await recordReproductiveCycleMatingCore(
        {
          cycleId: mainCycle.id,
          clientCommandId: ids.commandSecond,
          fatherId: ids.father,
          occurredAt: "2026-07-21T09:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "ai_chilled",
        },
        owner,
      ),
    );
    expect(second).toMatchObject({
      cycleId: mainCycle.id,
      litterId: first.litterId,
      sequenceNo: 2,
      replayed: false,
    });
    expect(
      sql(`select mating_date_2::text from public.litters where id = ${q(first.litterId)}::uuid;`),
    ).toBe("2026-07-21");

    const third = successful(
      await recordReproductiveCycleMatingCore(
        {
          cycleId: mainCycle.id,
          clientCommandId: ids.commandThird,
          fatherId: ids.father,
          occurredAt: "2026-07-22T09:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "ai_frozen",
        },
        owner,
      ),
    );
    expect(third).toMatchObject({ sequenceNo: 3, litterId: first.litterId });
    expect(
      Number(
        sql(`
          select count(*) from public.reproductive_cycle_matings
          where cycle_id = ${q(mainCycle.id)}::uuid;
        `),
      ),
    ).toBe(3);
    expect(
      Number(
        sql(`
          select count(*) from public.litters
          where id = ${q(first.litterId)}::uuid;
        `),
      ),
    ).toBe(1);

    const allocationFirst = successful(
      await recordReproductiveCycleMatingCore(
        {
          cycleId: allocationCycle.id,
          clientCommandId: ids.commandAllocationOne,
          fatherId: ids.father,
          occurredAt: "2026-07-20T12:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "natural",
          litterName: `${fixtureNamePrefix} allocation`,
        },
        owner,
      ),
    );
    const allocationOwner = await createAuthenticatedSupabaseClient();
    const allocated = await Promise.all([
      recordReproductiveCycleMatingCore(
        {
          cycleId: allocationCycle.id,
          clientCommandId: ids.commandAllocationTwo,
          fatherId: ids.father,
          occurredAt: "2026-07-21T12:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "other",
        },
        owner,
      ),
      recordReproductiveCycleMatingCore(
        {
          cycleId: allocationCycle.id,
          clientCommandId: "9f180002-0000-4000-8000-000000000065",
          fatherId: ids.father,
          occurredAt: "2026-07-22T12:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "other",
        },
        allocationOwner,
      ),
    ]);
    const allocatedSequences = allocated.map(successful).map((result) => result.sequenceNo).sort();
    expect(allocationFirst.sequenceNo).toBe(1);
    expect(allocatedSequences).toEqual([2, 3]);

    for (const [fatherId, commandId, expectedCode] of [
      [ids.otherFather, ids.commandDifferentFather, "conflict"],
      [ids.retiredFather, ids.commandRetiredFather, "invalid_father"],
      [ids.catFather, ids.commandCatFather, "invalid_father"],
      [ids.externalFather, ids.commandExternalFather, "invalid_father"],
    ] as const) {
      const rejected = await recordReproductiveCycleMatingCore(
        {
          cycleId: mainCycle.id,
          clientCommandId: commandId,
          fatherId,
          occurredAt: "2026-07-23T09:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "natural",
        },
        owner,
      );
      expect(rejected.outcome).toBe("error");
      if (rejected.outcome === "error") {
        expect(rejected.error.code).toBe(expectedCode);
      }
    }

    sql(`
      create function public.e2e_hold_reproductive_mating_father(
        p_father_id uuid
      )
      returns void
      language plpgsql
      as $$
      begin
        update public.animals
        set
          is_retired = true,
          status = 'retired',
          updated_at = now(),
          updated_by = ${q(ownerId)}::uuid
        where id = p_father_id;

        perform pg_sleep(4);
      end;
      $$;
    `);
    const retireFather = runE2eSql(`
      select public.e2e_hold_reproductive_mating_father(
        ${q(ids.lockedFather)}::uuid
      );
    `);
    await delay(150);
    const lockWaitStartedAt = Date.now();
    const lockedFatherResult = await recordReproductiveCycleMatingCore(
      {
        cycleId: lockedFatherCycle.id,
        clientCommandId: ids.commandLockedFather,
        fatherId: ids.lockedFather,
        occurredAt: "2026-07-23T10:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
        litterName: `${fixtureNamePrefix} père verrouillé`,
      },
      owner,
    );
    const lockWaitElapsedMs = Date.now() - lockWaitStartedAt;
    await retireFather;
    expect(lockWaitElapsedMs).toBeGreaterThanOrEqual(2_000);
    expect(lockedFatherResult).toMatchObject({
      outcome: "error",
      error: { code: "invalid_father" },
    });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'matings', (
              select count(*) from public.reproductive_cycle_matings
              where cycle_id = ${q(lockedFatherCycle.id)}::uuid
            ),
            'litters', (
              select count(*) from public.litters
              where name = ${q(`${fixtureNamePrefix} père verrouillé`)}
            )
          )::text;
        `),
      ),
    ).toEqual({ matings: 0, litters: 0 });

    for (const cycle of [closedCycle, cancelledCycle]) {
      const rejected = await recordReproductiveCycleMatingCore(
        {
          cycleId: cycle.id,
          clientCommandId:
            cycle.id === closedCycle.id ? ids.commandClosed : ids.commandCancelled,
          fatherId: ids.father,
          occurredAt: "2026-07-23T09:00:00+02:00",
          timezoneName: "Europe/Paris",
          method: "natural",
          litterName: `${fixtureNamePrefix} forbidden cycle`,
        },
        owner,
      );
      expect(rejected).toMatchObject({
        outcome: "error",
        error: { code: "invalid_cycle" },
      });
    }

    const viewerWrite = await recordReproductiveCycleMatingCore(
      {
        cycleId: mainCycle.id,
        clientCommandId: ids.commandViewer,
        fatherId: ids.father,
        occurredAt: "2026-07-23T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
      },
      viewer,
    );
    expect(viewerWrite).toMatchObject({ outcome: "error", error: { code: "forbidden" } });

    const inactiveWrite = await recordReproductiveCycleMatingCore(
      {
        cycleId: mainCycle.id,
        clientCommandId: ids.commandInactive,
        fatherId: ids.father,
        occurredAt: "2026-07-23T09:00:00+02:00",
        timezoneName: "Europe/Paris",
        method: "natural",
      },
      inactive,
    );
    expect(inactiveWrite).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const viewerMatings = await listReproductiveCycleMatingsForCycleCore(
      { cycleId: mainCycle.id },
      viewer,
    );
    expect(viewerMatings).toMatchObject({ outcome: "success", role: "viewer" });
    if (viewerMatings.outcome === "success") {
      expect(viewerMatings.matings.map((mating) => mating.sequenceNo)).toEqual([1, 2, 3]);
    }

    const directMatingInsert = await owner.from("reproductive_cycle_matings").insert({
      organization_id: organizationId,
      cycle_id: mainCycle.id,
      father_id: ids.father,
      sequence_no: 99,
      occurred_at: "2026-07-24T08:00:00.000Z",
      timezone_name: "Europe/Paris",
      method: "natural",
      client_command_id: "9f180002-0000-4000-8000-000000000066",
      created_by: ownerId,
      updated_by: ownerId,
    });
    expect(directMatingInsert.error).not.toBeNull();

    const directLitterLink = await owner
      .from("reproductive_cycles")
      .update({ litter_id: first.litterId })
      .eq("id", protectedCycle.id);
    expect(directLitterLink.error).not.toBeNull();

    const directMatedStatus = await owner
      .from("reproductive_cycles")
      .update({ status: "mated" })
      .eq("id", protectedCycle.id);
    expect(directMatedStatus.error).not.toBeNull();

    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
