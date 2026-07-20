import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  areLitterAgeComparisonRelationsConsistent,
  listLitterAgeComparisonCore,
  type ListLitterAgeComparisonInput,
  type ListLitterAgeComparisonResult,
} from "../../src/features/litter-weights/litter-weights-core";
import type { Database } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const fixtureNamePrefix = "E2E litter age comparison read";

const ids = {
  mother: "9f190009-0000-4000-8000-000000000001",
  firstLitter: "9f190009-0000-4000-8000-000000000011",
  secondLitter: "9f190009-0000-4000-8000-000000000012",
  deletedLitter: "9f190009-0000-4000-8000-000000000013",
  catLitter: "9f190009-0000-4000-8000-000000000014",
  otherBreedLitter: "9f190009-0000-4000-8000-000000000015",
  missingBreedLitter: "9f190009-0000-4000-8000-000000000016",
  caseBreedLitter: "9f190009-0000-4000-8000-000000000017",
  paginationLitter: "9f190009-0000-4000-8000-000000000018",
  paginationPeerLitter: "9f190009-0000-4000-8000-000000000019",
  animalLimitLitter: "9f190009-0000-4000-8000-00000000001a",
  animalLimitPeerLitter: "9f190009-0000-4000-8000-00000000001b",
  foreignLitter: "9f190009-0000-4000-8000-00000000001c",
  firstActiveAnimal: "9f190009-0000-4000-8000-000000000021",
  firstDeletedAnimal: "9f190009-0000-4000-8000-000000000022",
  firstNoBirthAnimal: "9f190009-0000-4000-8000-000000000023",
  firstStillbornAnimal: "9f190009-0000-4000-8000-000000000024",
  firstNotProducedAnimal: "9f190009-0000-4000-8000-000000000025",
  secondActiveAnimal: "9f190009-0000-4000-8000-000000000026",
  firstExternalAnimal: "9f190009-0000-4000-8000-000000000027",
  foreignOrganization: "9f190009-0000-4000-8000-000000000091",
  viewerUser: "9f190009-0000-4000-8000-000000000081",
  viewerIdentity: "9f190009-0000-4000-8000-000000000082",
  viewerMembership: "9f190009-0000-4000-8000-000000000083",
} as const;

const viewer = {
  email: "litter-age-comparison-viewer@saasphase1.invalid",
  password: "LitterAgeComparisonViewer-2026!",
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function cleanup() {
  sql(`
    delete from public.animal_weight_measurements
    where id::text like '9f190009-%'
       or animal_id::text like '9f190009-%'
       or litter_weighing_session_id::text like '9f190009-%';

    delete from public.litter_weighing_sessions
    where id::text like '9f190009-%'
       or litter_id::text like '9f190009-%';

    delete from public.whelping_births
    where id::text like '9f190009-%'
       or animal_id::text like '9f190009-%';

    delete from public.whelping_events
    where id::text like '9f190009-%'
       or session_id::text like '9f190009-%';

    delete from public.whelping_sessions
    where id::text like '9f190009-%'
       or litter_id::text like '9f190009-%';

    delete from public.animals
    where litter_id::text like '9f190009-%';

    delete from public.litters
    where id::text like '9f190009-%'
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id::text like '9f190009-%'
       or call_name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.memberships where id::text like '9f190009-%';
    delete from auth.identities where user_id::text like '9f190009-%';
    delete from auth.users where id::text like '9f190009-%';
    delete from public.organizations
    where id::text like '9f190009-%'
       or slug = 'e2e-litter-age-comparison-foreign';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'animal_weight_measurements', (select count(*)
          from public.animal_weight_measurements
          where id::text like '9f190009-%'
             or animal_id::text like '9f190009-%'
             or litter_weighing_session_id::text like '9f190009-%'),
        'litter_weighing_sessions', (select count(*)
          from public.litter_weighing_sessions
          where id::text like '9f190009-%'
             or litter_id::text like '9f190009-%'),
        'whelping_births', (select count(*)
          from public.whelping_births
          where id::text like '9f190009-%'
             or animal_id::text like '9f190009-%'),
        'whelping_events', (select count(*)
          from public.whelping_events
          where id::text like '9f190009-%'
             or session_id::text like '9f190009-%'),
        'whelping_sessions', (select count(*)
          from public.whelping_sessions
          where id::text like '9f190009-%'
             or litter_id::text like '9f190009-%'),
        'animals', (select count(*) from public.animals
          where id::text like '9f190009-%'
             or litter_id::text like '9f190009-%'
             or call_name like ${q(`${fixtureNamePrefix}%`)}),
        'litters', (select count(*) from public.litters
          where id::text like '9f190009-%'
             or name like ${q(`${fixtureNamePrefix}%`)}),
        'memberships', (select count(*) from public.memberships
          where id::text like '9f190009-%'),
        'profiles', (select count(*) from public.profiles
          where id::text like '9f190009-%'),
        'auth_identities', (select count(*) from auth.identities
          where user_id::text like '9f190009-%'),
        'auth_users', (select count(*) from auth.users
          where id::text like '9f190009-%'),
        'organizations', (select count(*) from public.organizations
          where id::text like '9f190009-%'
             or slug = 'e2e-litter-age-comparison-foreign')
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
      '{"display_name":"Age comparison viewer"}'::jsonb,
      now(), now()
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(ids.viewerIdentity)}::uuid, ${q(viewer.email)},
      ${q(ids.viewerUser)}::uuid,
      jsonb_build_object(
        'sub', ${q(ids.viewerUser)}, 'email', ${q(viewer.email)},
        'email_verified', true, 'phone_verified', false
      ),
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
    values (
      ${q(ids.foreignOrganization)}::uuid,
      'E2E Litter Age Comparison Foreign',
      'e2e-litter-age-comparison-foreign'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} mother`)}, 'dog', 'Golden Retriever',
      'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      deleted_at, created_by, updated_by
    ) values
      (${q(ids.firstLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Alpha`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'puppies_created', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Bravo`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'puppies_created', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.deletedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Deleted`)}, 'dog', 'Golden Retriever', null,
       'puppies_created', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.catLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Cat`)}, 'cat', 'Golden Retriever', null,
       'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherBreedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Other breed`)}, 'dog', 'Labrador Retriever', null,
       'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.missingBreedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Missing breed`)}, 'dog', '', null,
       'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.caseBreedLitter)}::uuid, ${q(organizationId)}::uuid,
       '', 'dog', '  golden retriever  ', null,
       'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.paginationLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Pagination`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'puppies_created', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.paginationPeerLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Pagination peer`)}, 'dog', 'Golden Retriever',
       null, 'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.animalLimitLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Animal limit`)}, 'dog', 'Golden Retriever',
       null, 'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.animalLimitPeerLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Animal limit peer`)}, 'dog', 'Golden Retriever',
       null, 'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} Foreign`)}, 'dog', 'Golden Retriever', null,
       'puppies_created', null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, litter_id, mother_id, species, breed, sex, status,
      ownership_status, call_name, birth_date, birth_time, birth_order,
      deleted_at, created_by, updated_by
    ) values
      (${q(ids.firstActiveAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'female', 'born',
       'produced', ${q(`${fixtureNamePrefix} active`)}, '2026-01-01', '08:00', 1,
       null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.firstDeletedAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born',
       'produced', ${q(`${fixtureNamePrefix} soft deleted`)}, '2026-01-01', '08:05', 2,
       now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.firstNoBirthAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'female', 'born',
       'produced', ${q(`${fixtureNamePrefix} no birth`)}, '2026-01-01', '08:10', 3,
       null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.firstStillbornAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'male', 'stillborn',
       'produced', ${q(`${fixtureNamePrefix} stillborn`)}, '2026-01-01', '08:15', 4,
       null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.firstNotProducedAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born',
       'produced', ${q(`${fixtureNamePrefix} not produced`)}, '2026-01-01', '08:20', 5,
       null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondActiveAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.secondLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'female', 'born',
       'produced', ${q(`${fixtureNamePrefix} second`)}, '2026-01-01', '09:00', 1,
       null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.firstExternalAnimal)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid,
       'dog', 'Golden Retriever', 'male', 'born',
       'external_stud', ${q(`${fixtureNamePrefix} external`)}, '2026-01-01', '08:30', 6,
       null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    update public.animals
    set is_external = true
    where id = ${q(ids.firstExternalAnimal)}::uuid;

    insert into public.animals (
      id, organization_id, litter_id, mother_id, species, breed, sex, status,
      ownership_status, call_name, birth_date, birth_time, birth_order,
      created_by, updated_by
    )
    select
      ('9f190009-1000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid, ${q(ids.paginationLitter)}::uuid,
      ${q(ids.mother)}::uuid,
      'dog', 'Golden Retriever',
      case when value % 2 = 0 then 'female' else 'male' end,
      'born', 'produced', ${q(`${fixtureNamePrefix} pagination `)} || value,
      '2026-02-01', '08:00', value, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    from generate_series(1, 30) value;

    insert into public.animals (
      id, organization_id, litter_id, species, breed, sex, status,
      ownership_status, call_name, created_by, updated_by
    )
    select
      ('9f190009-1100-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid, ${q(ids.animalLimitLitter)}::uuid,
      'dog', 'Golden Retriever', 'unknown', 'born', 'produced',
      ${q(`${fixtureNamePrefix} limit `)} || value,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    from generate_series(1, 151) value;

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, created_by, updated_by
    ) values
      ('9f190009-0100-4000-8000-000000000001', ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-01-01T07:00:00Z', '2026-01-01T10:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      ('9f190009-0100-4000-8000-000000000002', ${q(organizationId)}::uuid,
       ${q(ids.secondLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-01-01T08:00:00Z', '2026-01-01T10:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      ('9f190009-0100-4000-8000-000000000003', ${q(organizationId)}::uuid,
       ${q(ids.paginationLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed',
       '2026-02-01T07:00:00Z', '2026-02-01T10:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at,
      event_type, author_id
    ) values
      ('9f190009-5000-4000-8000-000000000001', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001', 1, '2026-01-01T08:00:00Z',
       'birth', ${q(ownerId)}::uuid),
      ('9f190009-5000-4000-8000-000000000002', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001', 2, '2026-01-01T08:05:00Z',
       'birth', ${q(ownerId)}::uuid),
      ('9f190009-5000-4000-8000-000000000004', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001', 4, '2026-01-01T08:15:00Z',
       'birth', ${q(ownerId)}::uuid),
      ('9f190009-5000-4000-8000-000000000005', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001', 5, '2026-01-01T08:20:00Z',
       'birth', ${q(ownerId)}::uuid),
      ('9f190009-5000-4000-8000-000000000006', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000002', 1, '2026-01-01T09:00:00Z',
       'birth', ${q(ownerId)}::uuid);

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at,
      event_type, author_id
    )
    select
      ('9f190009-5001-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid, '9f190009-0100-4000-8000-000000000003',
      value, '2026-02-01T08:00:00Z'::timestamptz + value * interval '1 minute',
      'birth', ${q(ownerId)}::uuid
    from generate_series(1, 30) value;

    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, created_by
    ) values
      ('9f190009-4000-4000-8000-000000000001', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001',
       '9f190009-5000-4000-8000-000000000001', ${q(ids.firstActiveAnimal)}::uuid,
       1, 'female', 'alive', ${q(ownerId)}::uuid),
      ('9f190009-4000-4000-8000-000000000002', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001',
       '9f190009-5000-4000-8000-000000000002', ${q(ids.firstDeletedAnimal)}::uuid,
       2, 'male', 'alive', ${q(ownerId)}::uuid),
      ('9f190009-4000-4000-8000-000000000004', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001',
       '9f190009-5000-4000-8000-000000000004', ${q(ids.firstStillbornAnimal)}::uuid,
       4, 'male', 'stillborn', ${q(ownerId)}::uuid),
      ('9f190009-4000-4000-8000-000000000005', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000001',
       '9f190009-5000-4000-8000-000000000005', ${q(ids.firstNotProducedAnimal)}::uuid,
       5, 'male', 'alive', ${q(ownerId)}::uuid),
      ('9f190009-4000-4000-8000-000000000006', ${q(organizationId)}::uuid,
       '9f190009-0100-4000-8000-000000000002',
       '9f190009-5000-4000-8000-000000000006', ${q(ids.secondActiveAnimal)}::uuid,
       1, 'female', 'alive', ${q(ownerId)}::uuid);

    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, created_by
    )
    select
      ('9f190009-4001-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid, '9f190009-0100-4000-8000-000000000003',
      ('9f190009-5001-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ('9f190009-1000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      value, case when value % 2 = 0 then 'female' else 'male' end,
      'alive', ${q(ownerId)}::uuid
    from generate_series(1, 30) value;

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      source_birth_id, created_by
    ) values
      ('9f190009-6000-4000-8000-000000000001', ${q(organizationId)}::uuid,
       ${q(ids.firstActiveAnimal)}::uuid, '2026-01-01T08:00:00Z', 400, 'birth',
       '9f190009-4000-4000-8000-000000000001', ${q(ownerId)}::uuid),
      ('9f190009-6000-4000-8000-000000000002', ${q(organizationId)}::uuid,
       ${q(ids.firstDeletedAnimal)}::uuid, '2026-01-01T08:00:00Z', 300, 'birth',
       '9f190009-4000-4000-8000-000000000002', ${q(ownerId)}::uuid),
      ('9f190009-6000-4000-8000-000000000004', ${q(organizationId)}::uuid,
       ${q(ids.firstStillbornAnimal)}::uuid, '2026-01-01T08:15:00Z', 250, 'birth',
       '9f190009-4000-4000-8000-000000000004', ${q(ownerId)}::uuid),
      ('9f190009-6000-4000-8000-000000000005', ${q(organizationId)}::uuid,
       ${q(ids.firstNotProducedAnimal)}::uuid, '2026-01-01T08:20:00Z', 450, 'birth',
       '9f190009-4000-4000-8000-000000000005', ${q(ownerId)}::uuid),
      ('9f190009-6000-4000-8000-000000000006', ${q(organizationId)}::uuid,
       ${q(ids.secondActiveAnimal)}::uuid, '2026-01-01T09:00:00Z', 500, 'birth',
       '9f190009-4000-4000-8000-000000000006', ${q(ownerId)}::uuid);

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      source_birth_id, created_by
    )
    select
      ('9f190009-6001-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid,
      ('9f190009-1000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      '2026-02-01T08:00:00Z'::timestamptz,
      100, 'birth',
      ('9f190009-4001-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      ${q(ownerId)}::uuid
    from generate_series(1, 30) value;

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, created_by
    ) values
      ('9f190009-2000-4000-8000-000000000001', ${q(organizationId)}::uuid,
       ${q(ids.firstLitter)}::uuid, '2026-01-02T09:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid),
      ('9f190009-2000-4000-8000-000000000002', ${q(organizationId)}::uuid,
       ${q(ids.secondLitter)}::uuid, '2026-01-02T09:00:00Z', 'Europe/Paris',
       ${q(ownerId)}::uuid);

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, litter_weighing_session_id, measured_at,
      grams, measurement_kind, created_by
    ) values
      ('9f190009-8000-4000-8000-000000000001', ${q(organizationId)}::uuid,
       ${q(ids.firstActiveAnimal)}::uuid,
       '9f190009-2000-4000-8000-000000000001', '2026-01-02T09:00:00Z', 600,
       'routine', ${q(ownerId)}::uuid),
      ('9f190009-8000-4000-8000-000000000002', ${q(organizationId)}::uuid,
       ${q(ids.firstDeletedAnimal)}::uuid,
       '9f190009-2000-4000-8000-000000000001', '2026-01-02T09:00:00Z', 450,
       'routine', ${q(ownerId)}::uuid),
      ('9f190009-8000-4000-8000-000000000005', ${q(organizationId)}::uuid,
       ${q(ids.firstNotProducedAnimal)}::uuid,
       '9f190009-2000-4000-8000-000000000001', '2026-01-02T09:00:00Z', 675,
       'routine', ${q(ownerId)}::uuid),
      ('9f190009-8000-4000-8000-000000000006', ${q(organizationId)}::uuid,
       ${q(ids.secondActiveAnimal)}::uuid,
       '9f190009-2000-4000-8000-000000000002', '2026-01-02T09:00:00Z', 750,
       'routine', ${q(ownerId)}::uuid);

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, created_by
    )
    select
      ('9f190009-2100-4000-8000-' || lpad(day::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid, ${q(ids.paginationLitter)}::uuid,
      '2026-02-01T08:00:00Z'::timestamptz + day * interval '1 day',
      'Europe/Paris', ${q(ownerId)}::uuid
    from generate_series(1, 34) day;

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, litter_weighing_session_id, measured_at,
      grams, measurement_kind, created_by
    )
    select
      ('9f190009-3000-4000-8000-' ||
        lpad((((day - 1) * 30) + animal)::text, 12, '0'))::uuid,
      ${q(organizationId)}::uuid,
      ('9f190009-1000-4000-8000-' || lpad(animal::text, 12, '0'))::uuid,
      ('9f190009-2100-4000-8000-' || lpad(day::text, 12, '0'))::uuid,
      '2026-02-01T08:00:00Z'::timestamptz + day * interval '1 day',
      100 + day, 'routine', ${q(ownerId)}::uuid
    from generate_series(1, 34) day
    cross join generate_series(1, 30) animal;
  `);

  sql(`
    update public.animals
    set ownership_status = 'adopted_out', status = 'adopted'
    where id in (
      ${q(ids.firstNotProducedAnimal)}::uuid,
      ${q(ids.firstNoBirthAnimal)}::uuid
    );
  `);
}

async function createViewerClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword(viewer);
  if (signedIn.error) throw signedIn.error;
  return client;
}

function requireSuccess(result: ListLitterAgeComparisonResult) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected success");
  return result;
}

function expectErrorCode(
  result: ListLitterAgeComparisonResult,
  code: Extract<ListLitterAgeComparisonResult, { outcome: "error" }>["error"]["code"],
) {
  expect(result).toEqual({
    outcome: "error",
    error: expect.objectContaining({ code }),
  });
  expect(result).not.toHaveProperty("model");
}

function comparisonCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'animals', (select count(*) from public.animals
          where id::text like '9f190009-%'),
        'sessions', (select count(*) from public.litter_weighing_sessions
          where id::text like '9f190009-%'),
        'measurements', (select count(*) from public.animal_weight_measurements
          where id::text like '9f190009-%')
      )::text;
    `),
  );
}

test("lecture serveur bornée, globale, paginée et sans identité technique", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const viewerClient = await createViewerClient();
    const anonymous = createAnonymousSupabaseClient();

    await test.step("owner et viewer lisent le même modèle sans écriture", async () => {
      const before = comparisonCounts();
      let authenticationCalls = 0;
      const originalGetUser = owner.auth.getUser.bind(owner.auth);
      owner.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
        authenticationCalls += 1;
        return originalGetUser(...args);
      }) as typeof owner.auth.getUser;

      const ownerResult = requireSuccess(
        await listLitterAgeComparisonCore(
          { litterIds: [ids.secondLitter, ids.firstLitter] },
          owner,
        ),
      );
      expect(authenticationCalls).toBe(1);
      owner.auth.getUser = originalGetUser;

      expect(ownerResult.role).toBe("owner");
      expect(ownerResult.species).toBe("dog");
      expect(ownerResult.breed).toBe("Golden Retriever");
      expect(ownerResult.model.series.map((series) => series.seriesIndex)).toEqual([
        0, 1,
      ]);
      expect(ownerResult.model.series.map((series) => series.publicLabel)).toEqual([
        `${fixtureNamePrefix} Bravo`,
        `${fixtureNamePrefix} Alpha`,
      ]);

      const firstSeries = ownerResult.model.series[1];
      expect(firstSeries).toMatchObject({
        totalAnimalCount: 3,
        eligibleAnimalCount: 2,
        excludedAnimalCount: 1,
        status: "available",
      });
      expect(firstSeries.points.find((point) => point.ageDay === 1)).toEqual({
        ageDay: 1,
        observedAnimalCount: 2,
        averageGrams: 637.5,
        averageRelativeIndex: 150,
        averageRelativeProgressPercentage: 50,
      });
      expect(ownerResult.model.series[0].points.find((point) => point.ageDay === 1))
        .toEqual({
          ageDay: 1,
          observedAnimalCount: 1,
          averageGrams: 750,
          averageRelativeIndex: 150,
          averageRelativeProgressPercentage: 50,
        });

      const serialized = JSON.stringify(ownerResult);
      expect(serialized).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      for (const forbiddenKey of [
        "litterId",
        "animalId",
        "measurementId",
        "sessionId",
        "organizationId",
        "profileId",
        "createdBy",
        "internalId",
      ]) {
        expect(serialized).not.toContain(`\"${forbiddenKey}\"`);
      }

      const viewerResult = requireSuccess(
        await listLitterAgeComparisonCore(
          { litterIds: [ids.secondLitter, ids.firstLitter] },
          viewerClient,
        ),
      );
      expect(viewerResult.role).toBe("viewer");
      expect(viewerResult.model).toEqual(ownerResult.model);
      expect(comparisonCounts()).toEqual(before);
    });

    await test.step("un client anonyme est refusé", async () => {
      expectErrorCode(
        await listLitterAgeComparisonCore(
          { litterIds: [ids.firstLitter, ids.secondLitter] },
          anonymous,
        ),
        "unauthenticated",
      );
    });

    await test.step("l'autorisation globale ne retourne jamais de résultat partiel", async () => {
      for (const litterIds of [
        [ids.firstLitter, ids.foreignLitter],
        [ids.firstLitter, "9f190009-ffff-4fff-8fff-ffffffffffff"],
        [ids.firstLitter, ids.deletedLitter],
      ]) {
        expectErrorCode(
          await listLitterAgeComparisonCore({ litterIds }, owner),
          "not_found",
        );
      }
    });

    await test.step("les identifiants sont validés avant toute lecture", async () => {
      const invalidInputs: Array<{
        input: ListLitterAgeComparisonInput;
        code: "invalid_input" | "too_many_litters";
      }> = [
        { input: { litterIds: [ids.firstLitter] }, code: "invalid_input" },
        {
          input: {
            litterIds: [
              ids.firstLitter,
              ids.secondLitter,
              ids.catLitter,
              ids.otherBreedLitter,
              ids.caseBreedLitter,
              ids.paginationPeerLitter,
            ],
          },
          code: "too_many_litters",
        },
        {
          input: { litterIds: [ids.firstLitter, "not-an-uuid"] },
          code: "invalid_input",
        },
        {
          input: { litterIds: [ids.firstLitter, ids.firstLitter.toUpperCase()] },
          code: "invalid_input",
        },
        {
          input: { litterIds: "not-an-array" } as unknown as ListLitterAgeComparisonInput,
          code: "invalid_input",
        },
      ];

      for (const { input, code } of invalidInputs) {
        expectErrorCode(await listLitterAgeComparisonCore(input, owner), code);
      }
    });

    await test.step("espèce et race doivent être compatibles", async () => {
      for (const incompatibleId of [
        ids.catLitter,
        ids.otherBreedLitter,
        ids.missingBreedLitter,
      ]) {
        expectErrorCode(
          await listLitterAgeComparisonCore(
            { litterIds: [ids.firstLitter, incompatibleId] },
            owner,
          ),
          "incompatible_litters",
        );
      }

      const caseInsensitive = requireSuccess(
        await listLitterAgeComparisonCore(
          { litterIds: [ids.firstLitter, ids.caseBreedLitter] },
          owner,
        ),
      );
      expect(caseInsensitive.breed).toBe("Golden Retriever");
      expect(caseInsensitive.model.series[1].publicLabel).toBe(
        "Portée sélectionnée 2",
      );
    });

    await test.step("la population est bornée à 150 animaux", async () => {
      expectErrorCode(
        await listLitterAgeComparisonCore(
          { litterIds: [ids.animalLimitLitter, ids.animalLimitPeerLitter] },
          owner,
        ),
        "comparison_too_large",
      );
    });

    await test.step("plus de 1000 mesures sont réellement paginées", async () => {
      const result = requireSuccess(
        await listLitterAgeComparisonCore(
          { litterIds: [ids.paginationLitter, ids.paginationPeerLitter] },
          owner,
        ),
      );
      const paginationSeries = result.model.series[0];
      expect(paginationSeries.totalAnimalCount).toBe(30);
      expect(paginationSeries.eligibleAnimalCount).toBe(30);
      expect(paginationSeries.points).toHaveLength(35);
      expect(paginationSeries.points.at(-1)).toMatchObject({
        ageDay: 34,
        observedAnimalCount: 30,
        averageGrams: 134,
      });
      expect(
        Number(
          sql(`select count(*) from public.animal_weight_measurements
            where animal_id::text like '9f190009-1000-%';`),
        ),
      ).toBe(1_050);
    });

    await test.step("la cohérence séance-animal est validée par le helper utilisé", async () => {
      const animals = new Map([
        [ids.firstActiveAnimal, ids.firstLitter],
        [ids.secondActiveAnimal, ids.secondLitter],
      ]);
      const sessions = new Map([
        ["9f190009-2000-4000-8000-000000000001", ids.firstLitter],
        ["9f190009-2000-4000-8000-000000000002", ids.secondLitter],
      ]);

      expect(
        areLitterAgeComparisonRelationsConsistent(animals, sessions, [
          {
            animal_id: ids.firstActiveAnimal,
            litter_weighing_session_id:
              "9f190009-2000-4000-8000-000000000002",
            measurement_kind: "routine",
          },
        ]),
      ).toBe(false);
      expect(
        areLitterAgeComparisonRelationsConsistent(animals, sessions, [
          {
            animal_id: ids.firstActiveAnimal,
            litter_weighing_session_id:
              "9f190009-2000-4000-8000-000000000001",
            measurement_kind: "routine",
          },
          {
            animal_id: ids.secondActiveAnimal,
            litter_weighing_session_id: null,
            measurement_kind: "birth",
          },
        ]),
      ).toBe(true);
    });
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
