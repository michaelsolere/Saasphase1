import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  addProgesteroneMeasurementCore,
  createReproductiveCycleCore,
  listProgesteroneMeasurementsForCycleCore,
  listReproductiveCyclesForMotherCore,
  type AddProgesteroneMeasurementInput,
} from "../../src/features/reproduction/reproductive-cycles-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f180001-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E reproduction foundation";

const ids = {
  mother: `${prefix}01`,
  male: `${prefix}02`,
  catMother: `${prefix}03`,
  otherMother: `${prefix}04`,
  sqlCycle: `${prefix}10`,
  sqlMeasurement: `${prefix}20`,
  viewerUser: `${prefix}30`,
  viewerIdentity: `${prefix}31`,
  viewerMembership: `${prefix}32`,
  inactiveUser: `${prefix}40`,
  inactiveIdentity: `${prefix}41`,
  inactiveMembership: `${prefix}42`,
  otherOrganization: `${prefix}90`,
} as const;

const users = {
  viewer: {
    id: ids.viewerUser,
    identityId: ids.viewerIdentity,
    membershipId: ids.viewerMembership,
    email: "reproduction-viewer@saasphase1.invalid",
    password: "ReproductionViewer-2026!",
    role: "viewer",
    status: "active",
  },
  inactive: {
    id: ids.inactiveUser,
    identityId: ids.inactiveIdentity,
    membershipId: ids.inactiveMembership,
    email: "reproduction-inactive@saasphase1.invalid",
    password: "ReproductionInactive-2026!",
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

function fixtureAnimalIdsSql() {
  return [ids.mother, ids.male, ids.catMother, ids.otherMother]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function cleanup() {
  sql(`
    delete from public.progesterone_measurements
    where cycle_id in (
      select id
      from public.reproductive_cycles
      where mother_id in (${fixtureAnimalIdsSql()})
         or notes like ${q(`${fixtureNamePrefix}%`)}
    )
       or id::text like '9f180001-%';

    delete from public.reproductive_cycles
    where mother_id in (${fixtureAnimalIdsSql()})
       or notes like ${q(`${fixtureNamePrefix}%`)}
       or id::text like '9f180001-%';

    delete from public.animals
    where id in (${fixtureAnimalIdsSql()});

    delete from public.memberships where id::text like '9f180001-%';
    delete from auth.identities where user_id::text like '9f180001-%';
    delete from auth.users where id::text like '9f180001-%';
    delete from public.organizations where id = ${q(ids.otherOrganization)}::uuid;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'progesterone_measurements', (
          select count(*)
          from public.progesterone_measurements
          where cycle_id in (
            select id
            from public.reproductive_cycles
            where mother_id in (${fixtureAnimalIdsSql()})
               or notes like ${q(`${fixtureNamePrefix}%`)}
          )
             or id::text like '9f180001-%'
        ),
        'reproductive_cycles', (
          select count(*)
          from public.reproductive_cycles
          where mother_id in (${fixtureAnimalIdsSql()})
             or notes like ${q(`${fixtureNamePrefix}%`)}
             or id::text like '9f180001-%'
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${fixtureAnimalIdsSql()})
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f180001-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f180001-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f180001-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f180001-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
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
  return remaining;
}

function expectSqlFailure(statement: string, expected: RegExp) {
  expect(() => sql(statement)).toThrow(expected);
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
        jsonb_build_object('display_name', ${q(`Reproduction ${user.role}`)}),
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
      'Organisation E2E reproduction isolée',
      'e2e-reproduction-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, is_breeder, created_by, updated_by
    ) values
      (
        ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
        'Mère reproduction E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.male)}::uuid, ${q(organizationId)}::uuid,
        'Mâle reproduction E2E', 'dog', 'Golden Retriever', 'male',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.catMother)}::uuid, ${q(organizationId)}::uuid,
        'Chatte reproduction E2E', 'cat', 'Maine Coon', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.otherMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
        'Mère autre organisation E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
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

test("secures reproductive cycles and preserves progesterone history", async () => {
  cleanup();
  expectCleanupAtZero();

  const createdCycleIds: string[] = [];
  const createdMeasurementIds: string[] = [];

  try {
    createUserFixtures();
    createAnimalFixtures();

    const owner = await createAuthenticatedSupabaseClient();
    const viewer = await clientFor(users.viewer);
    const inactive = await clientFor(users.inactive);

    const activeCycle = await createReproductiveCycleCore(
      {
        motherId: ids.mother,
        status: "in_progress",
        startedOn: "2026-07-10",
        notes: `${fixtureNamePrefix} active`,
      },
      owner,
    );
    expect(activeCycle.outcome).toBe("success");
    if (activeCycle.outcome !== "success") throw new Error("cycle not created");
    createdCycleIds.push(activeCycle.cycle.id);
    expect(activeCycle.cycle).toMatchObject({
      motherId: ids.mother,
      species: "dog",
      breed: "Golden Retriever",
      status: "in_progress",
      startedOn: "2026-07-10",
    });

    const maleCycle = await createReproductiveCycleCore(
      {
        motherId: ids.male,
        startedOn: "2026-07-10",
        notes: `${fixtureNamePrefix} male rejected`,
      },
      owner,
    );
    expect(maleCycle).toEqual({
      outcome: "error",
      error: {
        code: "invalid_mother",
        message: "L’animal sélectionné ne peut pas être utilisé comme reproductrice.",
      },
    });

    expectSqlFailure(
      `
        insert into public.reproductive_cycles (
          id, organization_id, mother_id, species, breed, status,
          started_on, notes
        ) values (
          ${q(ids.sqlCycle)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.catMother)}::uuid, 'dog', 'Maine Coon', 'closed',
          '2026-06-01', ${q(`${fixtureNamePrefix} invalid species`)}
        );
      `,
      /species must match mother species/i,
    );

    expectSqlFailure(
      `
        insert into public.reproductive_cycles (
          id, organization_id, mother_id, species, breed, status,
          started_on, notes
        ) values (
          ${q(ids.sqlCycle)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.otherMother)}::uuid, 'dog', 'Golden Retriever', 'closed',
          '2026-06-01', ${q(`${fixtureNamePrefix} cross organization`)}
        );
      `,
      /mother not found in organization/i,
    );

    const duplicateActiveCycle = await createReproductiveCycleCore(
      {
        motherId: ids.mother,
        status: "planned",
        startedOn: "2026-07-11",
        notes: `${fixtureNamePrefix} duplicate active`,
      },
      owner,
    );
    expect(duplicateActiveCycle.outcome).toBe("error");
    if (duplicateActiveCycle.outcome === "error") {
      expect(duplicateActiveCycle.error.code).toBe("conflict");
    }

    for (const [startedOn, endedOn] of [
      ["2025-01-01", "2025-01-20"],
      ["2025-08-01", "2025-08-25"],
    ] as const) {
      const historicalCycle = await createReproductiveCycleCore(
        {
          motherId: ids.mother,
          status: "closed",
          startedOn,
          endedOn,
          notes: `${fixtureNamePrefix} closed ${startedOn}`,
        },
        owner,
      );
      expect(historicalCycle.outcome).toBe("success");
      if (historicalCycle.outcome === "success") {
        createdCycleIds.push(historicalCycle.cycle.id);
      }
    }

    const ownerCycles = await listReproductiveCyclesForMotherCore(
      { motherId: ids.mother },
      owner,
    );
    expect(ownerCycles.outcome).toBe("success");
    if (ownerCycles.outcome === "success") {
      expect(ownerCycles.cycles).toHaveLength(3);
      expect(ownerCycles.cycles.filter((cycle) => cycle.status === "closed"))
        .toHaveLength(2);
    }

    const firstMeasurement = await addProgesteroneMeasurementCore(
      {
        cycleId: activeCycle.cycle.id,
        measuredAt: "2026-07-12T08:15:00+02:00",
        resultedAt: "2026-07-12T11:00:00+02:00",
        value: 2.45,
        unit: "ng_ml",
        laboratoryName: "Laboratoire E2E",
        sampleReference: "E2E-PROG-001",
        method: "Immunoanalyse",
        note: `${fixtureNamePrefix} measurement one`,
      },
      owner,
    );
    expect(firstMeasurement.outcome).toBe("success");
    if (firstMeasurement.outcome === "success") {
      createdMeasurementIds.push(firstMeasurement.measurement.id);
      expect(firstMeasurement.measurement).toMatchObject({
        value: 2.45,
        unit: "ng_ml",
        laboratoryName: "Laboratoire E2E",
      });
    }

    const secondMeasurement = await addProgesteroneMeasurementCore(
      {
        cycleId: activeCycle.cycle.id,
        measuredAt: "2026-07-13T08:20:00+02:00",
        value: 18.7,
        unit: "nmol_l",
        note: `${fixtureNamePrefix} measurement two`,
      },
      owner,
    );
    expect(secondMeasurement.outcome).toBe("success");
    if (secondMeasurement.outcome === "success") {
      createdMeasurementIds.push(secondMeasurement.measurement.id);
    }

    const measurements = await listProgesteroneMeasurementsForCycleCore(
      { cycleId: activeCycle.cycle.id },
      owner,
    );
    expect(measurements.outcome).toBe("success");
    if (measurements.outcome === "success") {
      expect(measurements.measurements.map((measurement) => measurement.unit))
        .toEqual(["ng_ml", "nmol_l"]);
      expect(measurements.measurements.map((measurement) => measurement.value))
        .toEqual([2.45, 18.7]);
    }

    const invalidValue = await addProgesteroneMeasurementCore(
      {
        cycleId: activeCycle.cycle.id,
        measuredAt: "2026-07-14T08:20:00+02:00",
        value: 0,
        unit: "ng_ml",
      },
      owner,
    );
    expect(invalidValue.outcome).toBe("error");
    if (invalidValue.outcome === "error") {
      expect(invalidValue.error.code).toBe("invalid_input");
    }

    const invalidUnitInput = {
      cycleId: activeCycle.cycle.id,
      measuredAt: "2026-07-14T08:20:00+02:00",
      value: 3.2,
      unit: "unknown_unit",
    } as unknown as AddProgesteroneMeasurementInput;
    const invalidUnit = await addProgesteroneMeasurementCore(
      invalidUnitInput,
      owner,
    );
    expect(invalidUnit.outcome).toBe("error");
    if (invalidUnit.outcome === "error") {
      expect(invalidUnit.error.code).toBe("invalid_input");
    }

    expectSqlFailure(
      `
        insert into public.progesterone_measurements (
          id, organization_id, cycle_id, measured_at, value, unit, note
        ) values (
          ${q(ids.sqlMeasurement)}::uuid, ${q(organizationId)}::uuid,
          ${q(activeCycle.cycle.id)}::uuid, now(), -1, 'ng_ml',
          ${q(`${fixtureNamePrefix} invalid value`)}
        );
      `,
      /progesterone_measurements_value_check/i,
    );

    expectSqlFailure(
      `
        insert into public.progesterone_measurements (
          id, organization_id, cycle_id, measured_at, value, unit, note
        ) values (
          ${q(ids.sqlMeasurement)}::uuid, ${q(organizationId)}::uuid,
          ${q(activeCycle.cycle.id)}::uuid, now(), 1, 'invalid',
          ${q(`${fixtureNamePrefix} invalid unit`)}
        );
      `,
      /progesterone_measurements_unit_check/i,
    );

    const viewerCycles = await listReproductiveCyclesForMotherCore(
      { motherId: ids.mother },
      viewer,
    );
    expect(viewerCycles.outcome).toBe("success");
    if (viewerCycles.outcome === "success") {
      expect(viewerCycles.role).toBe("viewer");
      expect(viewerCycles.cycles).toHaveLength(3);
    }

    const viewerMeasurements = await listProgesteroneMeasurementsForCycleCore(
      { cycleId: activeCycle.cycle.id },
      viewer,
    );
    expect(viewerMeasurements.outcome).toBe("success");
    if (viewerMeasurements.outcome === "success") {
      expect(viewerMeasurements.measurements).toHaveLength(2);
    }

    const viewerWrite = await addProgesteroneMeasurementCore(
      {
        cycleId: activeCycle.cycle.id,
        measuredAt: "2026-07-15T08:00:00+02:00",
        value: 4.5,
        unit: "ng_ml",
      },
      viewer,
    );
    expect(viewerWrite.outcome).toBe("error");
    if (viewerWrite.outcome === "error") {
      expect(viewerWrite.error.code).toBe("forbidden");
    }

    const viewerDirectWrite = await viewer.from("reproductive_cycles").insert({
      organization_id: organizationId,
      mother_id: ids.catMother,
      species: "cat",
      breed: "Maine Coon",
      status: "closed",
      started_on: "2026-01-01",
      notes: `${fixtureNamePrefix} viewer direct write`,
    });
    expect(viewerDirectWrite.error).not.toBeNull();

    const interOrganizationRead = await listReproductiveCyclesForMotherCore(
      { motherId: ids.otherMother },
      owner,
    );
    expect(interOrganizationRead.outcome).toBe("error");
    if (interOrganizationRead.outcome === "error") {
      expect(interOrganizationRead.error.code).toBe("not_found");
    }

    const interOrganizationWrite = await owner.from("reproductive_cycles").insert({
      organization_id: ids.otherOrganization,
      mother_id: ids.otherMother,
      species: "dog",
      breed: "Golden Retriever",
      status: "closed",
      started_on: "2026-01-01",
      notes: `${fixtureNamePrefix} owner cross organization`,
    });
    expect(interOrganizationWrite.error).not.toBeNull();

    const inactiveRead = await listReproductiveCyclesForMotherCore(
      { motherId: ids.mother },
      inactive,
    );
    expect(inactiveRead.outcome).toBe("error");
    if (inactiveRead.outcome === "error") {
      expect(inactiveRead.error.code).toBe("not_found");
    }

    const inactiveDirectRows = await inactive
      .from("reproductive_cycles")
      .select("id")
      .eq("mother_id", ids.mother);
    expect(inactiveDirectRows.error).toBeNull();
    expect(inactiveDirectRows.data).toEqual([]);
  } finally {
    cleanup();
    const remaining = expectCleanupAtZero();
    console.info(
      JSON.stringify({
        fixtureCleanup: {
          created: {
            fixedIds: ids,
            cycleIds: createdCycleIds,
            measurementIds: createdMeasurementIds,
          },
          deleted: "hard-delete in dependency order",
          remaining,
        },
      }),
    );
  }
});
