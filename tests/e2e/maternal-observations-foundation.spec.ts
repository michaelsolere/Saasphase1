import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  listMaternalObservationsForLitterCore,
  recordMaternalObservationCore,
} from "../../src/features/litter-journal/maternal-observations-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f180005-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E maternal observations";
const foreignLitterLockKey = 9_180_005;
const motherLockKey = 9_180_006;

const ids = {
  mother: `${prefix}01`,
  secondMother: `${prefix}02`,
  maleMother: `${prefix}03`,
  lockedMother: `${prefix}04`,
  foreignMother: `${prefix}05`,
  mainLitter: `${prefix}10`,
  secondLitter: `${prefix}11`,
  noMotherLitter: `${prefix}12`,
  maleMotherLitter: `${prefix}13`,
  lockedMotherLitter: `${prefix}14`,
  closedLitter: `${prefix}15`,
  cancelledLitter: `${prefix}16`,
  notPregnantLitter: `${prefix}17`,
  archivedLitter: `${prefix}18`,
  foreignLitter: `${prefix}19`,
  otherOrganization: `${prefix}90`,
  viewerUser: `${prefix}30`,
  viewerIdentity: `${prefix}31`,
  viewerMembership: `${prefix}32`,
  inactiveUser: `${prefix}40`,
  inactiveIdentity: `${prefix}41`,
  inactiveMembership: `${prefix}42`,
  temperatureCommand: `${prefix}51`,
  appetiteCommand: `${prefix}52`,
  concurrentCommand: `${prefix}53`,
  conflictCommand: `${prefix}54`,
  viewerCommand: `${prefix}55`,
  lockedMotherCommand: `${prefix}56`,
} as const;

const users = {
  viewer: {
    id: ids.viewerUser,
    identityId: ids.viewerIdentity,
    membershipId: ids.viewerMembership,
    email: "maternal-observations-viewer@saasphase1.invalid",
    password: "MaternalObservationsViewer-2026!",
    role: "viewer",
    status: "active",
  },
  inactive: {
    id: ids.inactiveUser,
    identityId: ids.inactiveIdentity,
    membershipId: ids.inactiveMembership,
    email: "maternal-observations-inactive@saasphase1.invalid",
    password: "MaternalObservationsInactive-2026!",
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

function fixtureLitterIdsSql() {
  return Object.values(ids)
    .filter((id) => id.includes(`${prefix.slice(0, -2)}`))
    .filter((id) => /0000000000(10|11|12|13|14|15|16|17|18|19)$/.test(id))
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function fixtureAnimalIdsSql() {
  return [
    ids.mother,
    ids.secondMother,
    ids.maleMother,
    ids.lockedMother,
    ids.foreignMother,
  ]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function cleanup() {
  sql(`
    drop function if exists public.e2e_hold_foreign_maternal_litter(uuid);
    drop function if exists public.e2e_hold_maternal_observation_mother(uuid);

    delete from public.maternal_observations
    where litter_id in (${fixtureLitterIdsSql()})
       or client_command_id::text like '9f180005-%';

    delete from public.litters
    where id in (${fixtureLitterIdsSql()})
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${fixtureAnimalIdsSql()});

    delete from public.memberships where id::text like '9f180005-%';
    delete from auth.identities where user_id::text like '9f180005-%';
    delete from auth.users where id::text like '9f180005-%';
    delete from public.organizations where id = ${q(ids.otherOrganization)}::uuid;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'maternal_observations', (
          select count(*) from public.maternal_observations
          where litter_id in (${fixtureLitterIdsSql()})
             or client_command_id::text like '9f180005-%'
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${fixtureLitterIdsSql()})
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${fixtureAnimalIdsSql()})
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f180005-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f180005-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f180005-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f180005-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.otherOrganization)}::uuid
        ),
        'foreign_litter_lock_function', (
          select count(*) from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname = 'e2e_hold_foreign_maternal_litter'
        ),
        'mother_lock_function', (
          select count(*) from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname = 'e2e_hold_maternal_observation_mother'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [table, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function outOfScopeCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (select count(*) from public.events),
        'notes', (select count(*) from public.notes),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments),
        'reservations', (select count(*) from public.reservations),
        'applications', (select count(*) from public.applications),
        'litter_care_tasks_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'litter_care_tasks'
        ),
        'whelping_sessions_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_sessions'
        ),
        'whelping_births_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_births'
        ),
        'animal_weight_measurements_table', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'animal_weight_measurements'
        )
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
        jsonb_build_object('display_name', ${q(`Maternal observations ${user.role}`)}),
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

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E observations maternelles isolée',
      'e2e-observations-maternelles-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       'Mère observations E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondMother)}::uuid, ${q(organizationId)}::uuid,
       'Deuxième mère observations E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.maleMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère mâle invalide E2E', 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.lockedMother)}::uuid, ${q(organizationId)}::uuid,
       'Mère verrouillée E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Mère étrangère E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} seconde`)}, 'dog', 'Golden Retriever',
       ${q(ids.secondMother)}::uuid, 'born', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.noMotherLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} sans mère`)}, 'dog', 'Golden Retriever',
       null, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.maleMotherLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} mère mâle`)}, 'dog', 'Golden Retriever',
       ${q(ids.maleMother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.lockedMotherLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} mère verrouillée`)}, 'dog', 'Golden Retriever',
       ${q(ids.lockedMother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} close`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'closed', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.cancelledLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} annulée`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'cancelled', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.notPregnantLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} non gestante`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'not_pregnant', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.archivedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} archivée`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'archived', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} étrangère`)}, 'dog', 'Golden Retriever',
       ${q(ids.foreignMother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
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

async function rawRecord(
  client: ReturnType<typeof createClient<Database>>,
  overrides: Record<string, unknown> = {},
) {
  return client.rpc("record_maternal_observation", {
    p_litter_id: ids.mainLitter,
    p_client_command_id: crypto.randomUUID(),
    p_observed_at: "2026-07-18T08:00:00.000Z",
    p_timezone_name: "Europe/Paris",
    p_observation_type: "temperature",
    p_numeric_value: 38.4,
    p_unit: "celsius",
    p_severity: "routine",
    p_note: null,
    ...overrides,
  });
}

async function waitForForeignLitterLock() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const lockCount = Number(
      sql(`
        select count(*) from pg_catalog.pg_locks
        where locktype = 'advisory' and classid = 0 and objid = ${foreignLitterLockKey};
      `),
    );
    if (lockCount > 0) return;
    await delay(100);
  }
  throw new Error("The E2E foreign-litter lock was not acquired in time.");
}

async function waitForMotherLock() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const lockCount = Number(
      sql(`
        select count(*) from pg_catalog.pg_locks
        where locktype = 'advisory' and classid = 0 and objid = ${motherLockKey};
      `),
    );
    if (lockCount > 0) return;
    await delay(100);
  }
  throw new Error("The E2E maternal-observation mother lock was not acquired in time.");
}

test("records append-only maternal observations with idempotence and isolated access", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createUserFixtures();
    createFixtures();
    const outOfScopeBefore = outOfScopeCounts();

    const owner = await createAuthenticatedSupabaseClient();
    const concurrentOwner = await createAuthenticatedSupabaseClient();
    const viewer = await clientFor(users.viewer);
    const inactive = await clientFor(users.inactive);

    const temperatureInput = {
      litterId: ids.mainLitter,
      clientCommandId: ids.temperatureCommand,
      observedAt: "2026-07-18T10:15:30+02:00",
      timezoneName: "Europe/Paris",
      observationType: "temperature" as const,
      numericValue: 38.4,
      unit: "celsius" as const,
      severity: "watch" as const,
      note: "",
    };
    const temperature = await recordMaternalObservationCore(temperatureInput, owner);
    expect(temperature).toMatchObject({ outcome: "success", replayed: false });
    if (temperature.outcome !== "success") throw new Error("Temperature was not recorded.");

    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'observed_at', observed_at::text,
            'timezone_name', timezone_name,
            'numeric_value', numeric_value::text,
            'unit', unit,
            'severity', severity,
            'note', note,
            'mother_id', mother_id::text
          )::text
          from public.maternal_observations
          where id = ${q(temperature.observationId)}::uuid;
        `),
      ),
    ).toEqual({
      observed_at: "2026-07-18 08:15:30+00",
      timezone_name: "Europe/Paris",
      numeric_value: "38.4000",
      unit: "celsius",
      severity: "watch",
      note: null,
      mother_id: ids.mother,
    });

    const replay = await recordMaternalObservationCore(temperatureInput, owner);
    expect(replay).toEqual({ ...temperature, replayed: true });

    const appetite = await recordMaternalObservationCore(
      {
        litterId: ids.mainLitter,
        clientCommandId: ids.appetiteCommand,
        observedAt: "2026-07-18T12:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "appetite",
        severity: "concern",
        note: "Appétit diminué depuis le matin.",
      },
      owner,
    );
    expect(appetite).toMatchObject({ outcome: "success", replayed: false });
    if (appetite.outcome !== "success") throw new Error("Appetite was not recorded.");

    const listed = await listMaternalObservationsForLitterCore(
      { litterId: ids.mainLitter },
      owner,
    );
    expect(listed).toMatchObject({ outcome: "success", role: "owner" });
    if (listed.outcome === "success") {
      expect(listed.observations.map((observation) => observation.id)).toEqual([
        appetite.observationId,
        temperature.observationId,
      ]);
      expect(listed.observations[0]).toMatchObject({
        observationType: "appetite",
        numericValue: null,
        unit: null,
        note: "Appétit diminué depuis le matin.",
      });
    }

    const concurrentInput = {
      litterId: ids.mainLitter,
      clientCommandId: ids.concurrentCommand,
      observedAt: "2026-07-18T13:00:00+02:00",
      timezoneName: "Europe/Paris",
      observationType: "behavior" as const,
      severity: "routine" as const,
      note: "Repos calme.",
    };
    const concurrent = await Promise.all([
      recordMaternalObservationCore(concurrentInput, owner),
      recordMaternalObservationCore(concurrentInput, concurrentOwner),
    ]);
    expect(concurrent.map((result) => result.outcome)).toEqual(["success", "success"]);
    const concurrentSuccess = concurrent.filter(
      (result): result is Extract<typeof result, { outcome: "success" }> =>
        result.outcome === "success",
    );
    expect(concurrentSuccess.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(concurrentSuccess[0].observationId).toBe(concurrentSuccess[1].observationId);
    expect(
      Number(
        sql(`
          select count(*) from public.maternal_observations
          where organization_id = ${q(organizationId)}::uuid
            and client_command_id = ${q(ids.concurrentCommand)}::uuid;
        `),
      ),
    ).toBe(1);

    const conflict = await recordMaternalObservationCore(
      {
        litterId: ids.secondLitter,
        clientCommandId: ids.temperatureCommand,
        observedAt: "2026-07-18T14:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "health",
        note: "Commande déjà utilisée ailleurs.",
      },
      owner,
    );
    expect(conflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    for (const partialInput of [
      { numericValue: null, unit: "celsius" as const },
      { numericValue: 38.4, unit: null },
    ]) {
      const rejected = await recordMaternalObservationCore(
        {
          litterId: ids.mainLitter,
          clientCommandId: crypto.randomUUID(),
          observedAt: "2026-07-18T14:00:00+02:00",
          timezoneName: "Europe/Paris",
          observationType: "temperature",
          ...partialInput,
        },
        owner,
      );
      expect(rejected).toMatchObject({
        outcome: "error",
        error: { code: "invalid_input" },
      });
    }

    for (const [overrides, reason] of [
      [{ p_unit: "kelvin" }, "invalid_temperature"],
      [{ p_observation_type: "health", p_numeric_value: 2, p_unit: null, p_note: "Note" }, "invalid_observation_values"],
      [{ p_observation_type: "health", p_numeric_value: null, p_unit: null, p_note: " " }, "invalid_observation_values"],
      [{ p_observation_type: "invalid", p_numeric_value: null, p_unit: null, p_note: "Note" }, "invalid_observation_type"],
      [{ p_severity: "critical" }, "invalid_severity"],
      [{ p_timezone_name: "Mars/Olympus" }, "invalid_timezone"],
    ] as const) {
      const rejected = await rawRecord(owner, overrides);
      expect(rejected.error).toBeNull();
      expect(rejected.data?.[0]).toMatchObject({ outcome: "error", reason });
    }

    for (const litterId of [ids.noMotherLitter, ids.maleMotherLitter]) {
      const rejected = await rawRecord(owner, { p_litter_id: litterId });
      expect(rejected.error).toBeNull();
      expect(rejected.data?.[0]).toMatchObject({ outcome: "error", reason: "mother_ineligible" });
    }

    for (const litterId of [
      ids.closedLitter,
      ids.cancelledLitter,
      ids.notPregnantLitter,
      ids.archivedLitter,
    ]) {
      const rejected = await rawRecord(owner, { p_litter_id: litterId });
      expect(rejected.error).toBeNull();
      expect(rejected.data?.[0]).toMatchObject({ outcome: "error", reason: "litter_not_open" });
    }

    sql(`
      create function public.e2e_hold_maternal_observation_mother(p_mother_id uuid)
      returns void language plpgsql as $$
      begin
        update public.animals
        set sex = 'male', updated_at = now(), updated_by = ${q(ownerId)}::uuid
        where id = p_mother_id;
        perform pg_catalog.pg_advisory_lock(${motherLockKey});
        perform pg_sleep(3);
        perform pg_catalog.pg_advisory_unlock(${motherLockKey});
      end;
      $$;
    `);
    const holdMother = runE2eSql(`
      select public.e2e_hold_maternal_observation_mother(${q(ids.lockedMother)}::uuid);
    `);
    await waitForMotherLock();
    const motherLockStartedAt = Date.now();
    const lockedMother = await recordMaternalObservationCore(
      {
        litterId: ids.lockedMotherLitter,
        clientCommandId: ids.lockedMotherCommand,
        observedAt: "2026-07-18T15:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "health",
        note: "Validation après verrou mère.",
      },
      owner,
    );
    const motherLockElapsedMs = Date.now() - motherLockStartedAt;
    await holdMother;
    expect(motherLockElapsedMs).toBeGreaterThanOrEqual(1_500);
    expect(lockedMother).toMatchObject({
      outcome: "error",
      error: { code: "invalid_mother" },
    });

    const viewerWrite = await recordMaternalObservationCore(
      {
        litterId: ids.mainLitter,
        clientCommandId: ids.viewerCommand,
        observedAt: "2026-07-18T16:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "health",
        note: "Le viewer ne peut pas écrire.",
      },
      viewer,
    );
    expect(viewerWrite).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    const viewerRead = await listMaternalObservationsForLitterCore(
      { litterId: ids.mainLitter },
      viewer,
    );
    expect(viewerRead).toMatchObject({ outcome: "success", role: "viewer" });

    const inactiveWrite = await recordMaternalObservationCore(
      {
        litterId: ids.mainLitter,
        clientCommandId: crypto.randomUUID(),
        observedAt: "2026-07-18T16:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "health",
        note: "Membre inactif.",
      },
      inactive,
    );
    expect(inactiveWrite).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const foreignWrite = await recordMaternalObservationCore(
      {
        litterId: ids.foreignLitter,
        clientCommandId: crypto.randomUUID(),
        observedAt: "2026-07-18T16:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "health",
        note: "Organisation étrangère.",
      },
      owner,
    );
    const missingWrite = await recordMaternalObservationCore(
      {
        litterId: `${prefix}99`,
        clientCommandId: crypto.randomUUID(),
        observedAt: "2026-07-18T16:00:00+02:00",
        timezoneName: "Europe/Paris",
        observationType: "health",
        note: "Portée absente.",
      },
      owner,
    );
    expect(foreignWrite).toEqual(missingWrite);
    expect(foreignWrite).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    sql(`
      create function public.e2e_hold_foreign_maternal_litter(p_litter_id uuid)
      returns void language plpgsql as $$
      begin
        perform 1 from public.litters where id = p_litter_id for update;
        perform pg_catalog.pg_advisory_lock(${foreignLitterLockKey});
        perform pg_sleep(3);
        perform pg_catalog.pg_advisory_unlock(${foreignLitterLockKey});
      end;
      $$;
    `);
    const holdForeignLitter = runE2eSql(`
      select public.e2e_hold_foreign_maternal_litter(${q(ids.foreignLitter)}::uuid);
    `);
    await waitForForeignLitterLock();
    const foreignLockStartedAt = Date.now();
    const lockedForeign = await rawRecord(owner, {
      p_litter_id: ids.foreignLitter,
      p_client_command_id: crypto.randomUUID(),
    });
    const foreignLockElapsedMs = Date.now() - foreignLockStartedAt;
    await holdForeignLitter;
    expect(foreignLockElapsedMs).toBeLessThan(1_500);
    expect(lockedForeign.error).toBeNull();
    expect(lockedForeign.data?.[0]).toMatchObject({ outcome: "error", reason: "litter_not_found" });

    const directInsert = await owner.from("maternal_observations").insert({
      organization_id: organizationId,
      litter_id: ids.mainLitter,
      mother_id: ids.mother,
      observation_type: "temperature",
      observed_at: "2026-07-18T16:30:00.000Z",
      timezone_name: "Europe/Paris",
      numeric_value: 38.4,
      unit: "celsius",
      severity: "routine",
      client_command_id: crypto.randomUUID(),
      created_by: ownerId,
      updated_by: ownerId,
    });
    const directUpdate = await owner
      .from("maternal_observations")
      .update({ severity: "urgent" })
      .eq("id", temperature.observationId);
    const directDelete = await owner
      .from("maternal_observations")
      .delete()
      .eq("id", temperature.observationId);
    expect(directInsert.error).not.toBeNull();
    expect(directUpdate.error).not.toBeNull();
    expect(directDelete.error).not.toBeNull();

    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
