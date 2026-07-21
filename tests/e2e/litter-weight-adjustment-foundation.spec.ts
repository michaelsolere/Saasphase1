import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  cancelLitterRoutineWeightCore,
  cancelLitterWeighingSessionCore,
  correctLitterRoutineWeightCore,
  listLitterAgeComparisonCore,
  listLitterWeightAdjustmentHistoryCore,
  listLitterWeightHistoryCore,
  recordLitterRoutineWeightsCore,
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
const prefix = "9f200003-0000-4000-8000-0000000000";
const namePrefix = "E2E litter weight adjustment foundation";

const ids = {
  mother: `${prefix}01`, father: `${prefix}02`, mainLitter: `${prefix}03`, comparisonLitter: `${prefix}04`,
  foreignOrganization: `${prefix}05`, foreignLitter: `${prefix}06`,
  animalOne: `${prefix}11`, animalTwo: `${prefix}12`, comparisonAnimal: `${prefix}13`, foreignAnimal: `${prefix}14`,
  whelpingMain: `${prefix}21`, whelpingComparison: `${prefix}22`,
  birthEventOne: `${prefix}23`, birthEventTwo: `${prefix}24`, birthEventComparison: `${prefix}25`,
  birthOne: `${prefix}26`, birthTwo: `${prefix}27`, birthComparison: `${prefix}28`,
  sessionOne: `${prefix}31`, sessionTwo: `${prefix}32`, sessionThree: `${prefix}33`,
  sessionFour: `${prefix}34`, sessionFive: `${prefix}35`, sessionSix: `${prefix}36`,
  comparisonSession: `${prefix}37`, foreignSession: `${prefix}38`,
  birthWeightOne: `${prefix}41`, birthWeightTwo: `${prefix}42`, birthWeightComparison: `${prefix}43`,
  measurementOne: `${prefix}44`, measurementTwo: `${prefix}45`, measurementThree: `${prefix}46`,
  measurementFour: `${prefix}47`, measurementFive: `${prefix}48`, measurementSix: `${prefix}49`,
  measurementSeven: `${prefix}50`, measurementEight: `${prefix}51`, measurementNine: `${prefix}52`,
  measurementTen: `${prefix}53`, measurementEleven: `${prefix}54`, measurementTwelve: `${prefix}55`,
  comparisonMeasurement: `${prefix}56`, foreignMeasurement: `${prefix}57`, clinicalMeasurement: `${prefix}58`,
  viewerUser: `${prefix}61`, viewerIdentity: `${prefix}62`, viewerMembership: `${prefix}63`,
  adminUser: `${prefix}64`, adminIdentity: `${prefix}65`, adminMembership: `${prefix}66`,
  memberUser: `${prefix}67`, memberIdentity: `${prefix}68`, memberMembership: `${prefix}69`,
  correctCommand: `${prefix}71`, cancelMeasurementCommand: `${prefix}72`, cancelSessionCommand: `${prefix}73`,
  recreateCommand: `${prefix}74`, viewerCommand: `${prefix}75`, anonymousCommand: `${prefix}76`,
  foreignCommand: `${prefix}77`, birthCommand: `${prefix}78`, clinicalCommand: `${prefix}79`,
  concurrentCorrectionOne: `${prefix}81`, concurrentCorrectionTwo: `${prefix}82`,
  mixedCorrection: `${prefix}83`, mixedCancellation: `${prefix}84`,
} as const;

const viewer = {
  email: "litter-weight-adjustment-viewer@saasphase1.invalid",
  password: "LitterWeightAdjustmentViewer-2026!",
} as const;
const rolePassword = "LitterWeightAdjustmentRoles-2026!";

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function cleanup() {
  sql(`
    delete from public.litter_weight_adjustment_commands where client_command_id::text like '9f200003-%';
    delete from public.litter_weight_commands where client_command_id::text like '9f200003-%';
    delete from public.animal_weight_measurements
    where id::text like '9f200003-%'
       or animal_id::text like '9f200003-%'
       or litter_weighing_session_id in (
         select id from public.litter_weighing_sessions where litter_id::text like '9f200003-%'
       );
    delete from public.litter_weighing_sessions
    where id::text like '9f200003-%' or litter_id::text like '9f200003-%';
    delete from public.whelping_births where id::text like '9f200003-%';
    delete from public.whelping_events where id::text like '9f200003-%';
    delete from public.whelping_sessions where id::text like '9f200003-%';
    delete from public.animals where (id::text like '9f200003-%' or call_name like ${q(`${namePrefix}%`)}) and litter_id is not null;
    delete from public.litters where id::text like '9f200003-%' or name like ${q(`${namePrefix}%`)};
    delete from public.animals where id::text like '9f200003-%' or call_name like ${q(`${namePrefix}%`)};
    delete from public.memberships where id::text like '9f200003-%';
    delete from auth.identities where user_id::text like '9f200003-%';
    delete from auth.users where id::text like '9f200003-%';
    delete from public.organizations where id::text like '9f200003-%';
  `);
}

function remainingCounts() {
  return JSON.parse(sql(`select json_build_object(
    'adjustment_commands', (select count(*) from public.litter_weight_adjustment_commands where client_command_id::text like '9f200003-%'),
    'creation_commands', (select count(*) from public.litter_weight_commands where client_command_id::text like '9f200003-%'),
    'measurements', (select count(*) from public.animal_weight_measurements where id::text like '9f200003-%'),
    'sessions', (select count(*) from public.litter_weighing_sessions where id::text like '9f200003-%'),
    'births', (select count(*) from public.whelping_births where id::text like '9f200003-%'),
    'events', (select count(*) from public.whelping_events where id::text like '9f200003-%'),
    'whelping_sessions', (select count(*) from public.whelping_sessions where id::text like '9f200003-%'),
    'animals', (select count(*) from public.animals where id::text like '9f200003-%' or call_name like ${q(`${namePrefix}%`)}),
    'litters', (select count(*) from public.litters where id::text like '9f200003-%' or name like ${q(`${namePrefix}%`)}),
    'memberships', (select count(*) from public.memberships where id::text like '9f200003-%'),
    'auth_users', (select count(*) from auth.users where id::text like '9f200003-%'),
    'organizations', (select count(*) from public.organizations where id::text like '9f200003-%')
  )::text;`)) as Record<string, number>;
}

function expectClean() {
  for (const [table, count] of Object.entries(remainingCounts())) {
    expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
}

function setup() {
  sql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      ${q(ids.viewerUser)}::uuid, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${q(viewer.email)},
      extensions.crypt(${q(viewer.password)}, extensions.gen_salt('bf')), now(),
      '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Weight adjustment viewer"}'::jsonb, now(), now()
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(ids.viewerIdentity)}::uuid, ${q(viewer.email)}, ${q(ids.viewerUser)}::uuid,
      jsonb_build_object('sub', ${q(ids.viewerUser)}, 'email', ${q(viewer.email)}, 'email_verified', true),
      'email', now(), now());
    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by)
    values (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.viewerUser)}::uuid,
      'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      (${q(ids.adminUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'litter-weight-admin@saasphase1.invalid', extensions.crypt(${q(rolePassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
      (${q(ids.memberUser)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'litter-weight-member@saasphase1.invalid', extensions.crypt(${q(rolePassword)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at) values
      (${q(ids.adminIdentity)}::uuid, 'litter-weight-admin@saasphase1.invalid', ${q(ids.adminUser)}::uuid, jsonb_build_object('sub', ${q(ids.adminUser)}, 'email', 'litter-weight-admin@saasphase1.invalid', 'email_verified', true), 'email', now(), now()),
      (${q(ids.memberIdentity)}::uuid, 'litter-weight-member@saasphase1.invalid', ${q(ids.memberUser)}::uuid, jsonb_build_object('sub', ${q(ids.memberUser)}, 'email', 'litter-weight-member@saasphase1.invalid', 'email_verified', true), 'email', now(), now());
    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by) values
      (${q(ids.adminMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminUser)}::uuid, 'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.memberUser)}::uuid, 'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrganization)}::uuid, ${q(`${namePrefix} foreign`)}, 'e2e-weight-adjustment-foreign');
    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} mother`)}, 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} father`)}, 'dog', 'Golden Retriever', 'male', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.litters (id, organization_id, name, species, breed, mother_id, father_id, status, actual_birth_date, created_by, updated_by)
    values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} main`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'puppies_created', '2026-07-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.comparisonLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${namePrefix} comparison`)}, 'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'puppies_created', '2026-07-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(`${namePrefix} foreign litter`)}, 'dog', 'Golden Retriever', null, null, 'puppies_created', '2026-07-10', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.animals (
      id, organization_id, litter_id, call_name, species, breed, sex, status,
      ownership_status, mother_id, father_id, birth_date, birth_time, birth_order,
      birth_weight_grams, created_by, updated_by
    ) values
      (${q(ids.animalOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, 'Adjustment A', 'dog', 'Golden Retriever', 'female', 'born', 'produced', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, '2026-07-10', '08:00', 1, 400, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.animalTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, 'Adjustment B', 'dog', 'Golden Retriever', 'male', 'born', 'produced', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, '2026-07-10', '08:05', 2, 420, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.comparisonAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.comparisonLitter)}::uuid, 'Adjustment C', 'dog', 'Golden Retriever', 'female', 'born', 'produced', ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, '2026-07-10', '08:10', 1, 410, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignAnimal)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignLitter)}::uuid, 'Adjustment foreign', 'dog', 'Golden Retriever', 'female', 'born', 'produced', null, null, '2026-07-10', '08:00', 1, 400, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.whelping_sessions (id, organization_id, litter_id, mother_id, status, started_at, ended_at, timezone_name, created_by, updated_by)
    values
      (${q(ids.whelpingMain)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed', '2026-07-10T07:00Z', '2026-07-10T09:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.whelpingComparison)}::uuid, ${q(organizationId)}::uuid, ${q(ids.comparisonLitter)}::uuid, ${q(ids.mother)}::uuid, 'closed', '2026-07-10T07:00Z', '2026-07-10T09:00Z', 'Europe/Paris', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.whelping_events (id, organization_id, session_id, sequence_no, occurred_at, event_type, author_id)
    values
      (${q(ids.birthEventOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.whelpingMain)}::uuid, 1, '2026-07-10T08:00Z', 'birth', ${q(ownerId)}::uuid),
      (${q(ids.birthEventTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.whelpingMain)}::uuid, 2, '2026-07-10T08:05Z', 'birth', ${q(ownerId)}::uuid),
      (${q(ids.birthEventComparison)}::uuid, ${q(organizationId)}::uuid, ${q(ids.whelpingComparison)}::uuid, 1, '2026-07-10T08:10Z', 'birth', ${q(ownerId)}::uuid);
    insert into public.whelping_births (id, organization_id, session_id, event_id, animal_id, birth_order, sex, viability, created_by)
    values
      (${q(ids.birthOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.whelpingMain)}::uuid, ${q(ids.birthEventOne)}::uuid, ${q(ids.animalOne)}::uuid, 1, 'female', 'alive', ${q(ownerId)}::uuid),
      (${q(ids.birthTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.whelpingMain)}::uuid, ${q(ids.birthEventTwo)}::uuid, ${q(ids.animalTwo)}::uuid, 2, 'male', 'alive', ${q(ownerId)}::uuid),
      (${q(ids.birthComparison)}::uuid, ${q(organizationId)}::uuid, ${q(ids.whelpingComparison)}::uuid, ${q(ids.birthEventComparison)}::uuid, ${q(ids.comparisonAnimal)}::uuid, 1, 'female', 'alive', ${q(ownerId)}::uuid);

    insert into public.litter_weighing_sessions (id, organization_id, litter_id, measured_at, timezone_name, created_by)
    values
      (${q(ids.sessionOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, '2026-07-11T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.sessionTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, '2026-07-12T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.sessionThree)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, '2026-07-13T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.sessionFour)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, '2026-07-14T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.sessionFive)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, '2026-07-15T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.sessionSix)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, '2026-07-16T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.comparisonSession)}::uuid, ${q(organizationId)}::uuid, ${q(ids.comparisonLitter)}::uuid, '2026-07-11T08:10Z', 'Europe/Paris', ${q(ownerId)}::uuid),
      (${q(ids.foreignSession)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignLitter)}::uuid, '2026-07-11T08:00Z', 'Europe/Paris', ${q(ownerId)}::uuid);

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, litter_weighing_session_id, measured_at,
      grams, measurement_kind, source_birth_id, note, created_by
    ) values
      (${q(ids.birthWeightOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, null, '2026-07-10T08:00Z', 400, 'birth', ${q(ids.birthOne)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.birthWeightTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalTwo)}::uuid, null, '2026-07-10T08:05Z', 420, 'birth', ${q(ids.birthTwo)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.birthWeightComparison)}::uuid, ${q(organizationId)}::uuid, ${q(ids.comparisonAnimal)}::uuid, null, '2026-07-10T08:10Z', 410, 'birth', ${q(ids.birthComparison)}::uuid, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, ${q(ids.sessionOne)}::uuid, '2026-07-11T08:00Z', 500, 'routine', null, 'Avant', ${q(ownerId)}::uuid),
      (${q(ids.measurementTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalTwo)}::uuid, ${q(ids.sessionOne)}::uuid, '2026-07-11T08:00Z', 520, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementThree)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, ${q(ids.sessionTwo)}::uuid, '2026-07-12T08:00Z', 600, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementFour)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalTwo)}::uuid, ${q(ids.sessionTwo)}::uuid, '2026-07-12T08:00Z', 620, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementFive)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, ${q(ids.sessionThree)}::uuid, '2026-07-13T08:00Z', 700, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementSix)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalTwo)}::uuid, ${q(ids.sessionThree)}::uuid, '2026-07-13T08:00Z', 720, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementSeven)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, ${q(ids.sessionFour)}::uuid, '2026-07-14T08:00Z', 800, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementEight)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, ${q(ids.sessionFive)}::uuid, '2026-07-15T08:00Z', 900, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementNine)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalTwo)}::uuid, ${q(ids.sessionFive)}::uuid, '2026-07-15T08:00Z', 920, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementTen)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, ${q(ids.sessionSix)}::uuid, '2026-07-16T08:00Z', 1000, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.measurementEleven)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalTwo)}::uuid, ${q(ids.sessionSix)}::uuid, '2026-07-16T08:00Z', 1020, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.comparisonMeasurement)}::uuid, ${q(organizationId)}::uuid, ${q(ids.comparisonAnimal)}::uuid, ${q(ids.comparisonSession)}::uuid, '2026-07-11T08:10Z', 510, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.foreignMeasurement)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignAnimal)}::uuid, ${q(ids.foreignSession)}::uuid, '2026-07-11T08:00Z', 500, 'routine', null, null, ${q(ownerId)}::uuid),
      (${q(ids.clinicalMeasurement)}::uuid, ${q(organizationId)}::uuid, ${q(ids.animalOne)}::uuid, null, '2026-07-17T08:00Z', 1100, 'clinical', null, null, ${q(ownerId)}::uuid);
  `);
}

async function viewerClient() {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const auth = await client.auth.signInWithPassword(viewer);
  if (auth.error) throw auth.error;
  return client;
}

async function roleClient(email: string) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const auth = await client.auth.signInWithPassword({ email, password: rolePassword });
  if (auth.error) throw auth.error;
  return client;
}

function requireSuccess<T extends { outcome: string }>(result: T) {
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("Expected success");
  return result as Extract<T, { outcome: "success" }>;
}

test("audits corrections and cancellations while active reads remain coherent", async () => {
  cleanup();
  expectClean();
  try {
    setup();
    console.log(JSON.stringify({ litterWeightAdjustmentFixtures: { created: { prefix: "9f200003-", ids } } }));
    const owner = await createAuthenticatedSupabaseClient();
    const viewerRole = await viewerClient();
    const adminRole = await roleClient("litter-weight-admin@saasphase1.invalid");
    const memberRole = await roleClient("litter-weight-member@saasphase1.invalid");
    const anonymous = createAnonymousSupabaseClient();

    const immutableBefore = JSON.parse(sql(`select row_to_json(value)::text from (
      select id, organization_id, animal_id, litter_weighing_session_id, measurement_kind,
        source_birth_id, measured_at, created_at, created_by
      from public.animal_weight_measurements where id = ${q(ids.measurementOne)}::uuid
    ) value;`));
    const corrected = requireSuccess(await correctLitterRoutineWeightCore({
      measurementId: ids.measurementOne, clientCommandId: ids.correctCommand,
      expectedRevisionNo: 0, grams: 550, note: "  Après contrôle  ", reason: "  Erreur de saisie  ",
    }, owner));
    expect(corrected).toMatchObject({ measurementId: ids.measurementOne, sessionId: ids.sessionOne, revisionNo: 1, replayed: false });
    expect(JSON.parse(sql(`select json_build_object('grams', grams, 'note', note, 'revision', revision_no)::text
      from public.animal_weight_measurements where id = ${q(ids.measurementOne)}::uuid;`)))
      .toEqual({ grams: 550, note: "Après contrôle", revision: 1 });
    expect(JSON.parse(sql(`select row_to_json(value)::text from (
      select id, organization_id, animal_id, litter_weighing_session_id, measurement_kind,
        source_birth_id, measured_at, created_at, created_by
      from public.animal_weight_measurements where id = ${q(ids.measurementOne)}::uuid
    ) value;`))).toEqual(immutableBefore);

    const audit = JSON.parse(sql(`select json_build_object(
      'type', command_type, 'expected', expected_revision_no, 'previous', previous_revision_no,
      'result', result_revision_no, 'reason', reason,
      'before_grams', before_snapshot #>> '{measurement,grams}',
      'after_grams', after_snapshot #>> '{measurement,grams}'
    )::text from public.litter_weight_adjustment_commands where client_command_id = ${q(ids.correctCommand)}::uuid;`));
    expect(audit).toEqual({ type: "correct_measurement", expected: 0, previous: 0, result: 1, reason: "Erreur de saisie", before_grams: "500", after_grams: "550" });
    expect((await owner.from("litter_weight_adjustment_commands").select("id")).error).not.toBeNull();

    const history = requireSuccess(await listLitterWeightHistoryCore({ litterId: ids.mainLitter, schedule: { todayDate: "2026-07-18" } }, owner));
    expect(history.measurements.find(({ id }) => id === ids.measurementOne)).toMatchObject({ grams: 550, note: "Après contrôle", revisionNo: 1 });
    expect(history.sessions.find(({ id }) => id === ids.sessionOne)).toMatchObject({ averageGrams: 535, minimumGrams: 520, maximumGrams: 550, revisionNo: 0 });
    const comparison = requireSuccess(await listLitterAgeComparisonCore({ litterIds: [ids.mainLitter, ids.comparisonLitter] }, owner));
    expect(comparison.model.series[0]?.points.find(({ ageDay }) => ageDay === 1)?.averageGrams).toBe(585);

    expect(await correctLitterRoutineWeightCore({ measurementId: ids.measurementOne, clientCommandId: `${prefix}85`, expectedRevisionNo: 1, grams: 550, note: "Après contrôle", reason: "Même valeur" }, owner))
      .toMatchObject({ outcome: "error", error: { code: "no_change" } });
    expect(await correctLitterRoutineWeightCore({ measurementId: ids.measurementOne, clientCommandId: `${prefix}86`, expectedRevisionNo: 0, grams: 560, note: null, reason: "Révision périmée" }, owner))
      .toMatchObject({ outcome: "error", error: { code: "stale_revision" } });
    expect(requireSuccess(await correctLitterRoutineWeightCore({ measurementId: ids.measurementOne, clientCommandId: ids.correctCommand, expectedRevisionNo: 0, grams: 550, note: "Après contrôle", reason: "Erreur de saisie" }, owner)).replayed).toBe(true);
    expect(await correctLitterRoutineWeightCore({ measurementId: ids.measurementOne, clientCommandId: ids.correctCommand, expectedRevisionNo: 0, grams: 551, note: "Après contrôle", reason: "Erreur de saisie" }, owner))
      .toMatchObject({ outcome: "error", error: { code: "command_conflict" } });

    const cancelledMeasurement = requireSuccess(await cancelLitterRoutineWeightCore({
      measurementId: ids.measurementThree, clientCommandId: ids.cancelMeasurementCommand,
      expectedRevisionNo: 0, cancelledAt: "2026-07-20T10:00:00+02:00", reason: "  Mesure attribuée au mauvais chiot  ",
    }, owner));
    expect(cancelledMeasurement).toMatchObject({ measurementId: ids.measurementThree, revisionNo: 1 });
    expect(sql(`select count(*) from public.animal_weight_measurements where id = ${q(ids.measurementThree)}::uuid;`)).toBe("1");
    const afterIndividual = requireSuccess(await listLitterWeightHistoryCore({ litterId: ids.mainLitter, schedule: { todayDate: "2026-07-18" } }, owner));
    expect(afterIndividual.measurements.some(({ id }) => id === ids.measurementThree)).toBe(false);
    expect(afterIndividual.sessions.find(({ id }) => id === ids.sessionTwo)).toMatchObject({ measurementCount: 1, averageGrams: 620 });
    expect(afterIndividual.weighingSchedule?.status).toBe("available");
    const comparisonAfterIndividual = requireSuccess(await listLitterAgeComparisonCore({ litterIds: [ids.mainLitter, ids.comparisonLitter] }, owner));
    expect(comparisonAfterIndividual.model.series[0]?.points.find(({ ageDay }) => ageDay === 2)?.averageGrams).toBe(720);
    expect(await cancelLitterRoutineWeightCore({ measurementId: ids.measurementSeven, clientCommandId: `${prefix}87`, expectedRevisionNo: 0, cancelledAt: "2026-07-20T10:01:00+02:00", reason: "Dernière mesure" }, owner))
      .toMatchObject({ outcome: "error", error: { code: "last_measurement_requires_session_cancellation" } });

    const countBeforeSessionCancellation = Number(sql(`select count(*) from public.animal_weight_measurements where id::text like '9f200003-%';`));
    const cancelledSession = requireSuccess(await cancelLitterWeighingSessionCore({
      sessionId: ids.sessionThree, clientCommandId: ids.cancelSessionCommand,
      expectedRevisionNo: 0, cancelledAt: "2026-07-20T10:02:00+02:00", reason: "  Heure de séance erronée  ",
    }, owner));
    expect(cancelledSession).toMatchObject({ sessionId: ids.sessionThree, revisionNo: 1, affectedMeasurementCount: 2 });
    expect(JSON.parse(sql(`select json_build_object(
      'session', (select json_build_object('revision', revision_no, 'cancelled', cancelled_at is not null) from public.litter_weighing_sessions where id = ${q(ids.sessionThree)}::uuid),
      'measurements', (select json_agg(json_build_object('revision', revision_no, 'cancelled', cancelled_at is not null) order by id) from public.animal_weight_measurements where litter_weighing_session_id = ${q(ids.sessionThree)}::uuid)
    )::text;`))).toEqual({ session: { revision: 1, cancelled: true }, measurements: [{ revision: 1, cancelled: true }, { revision: 1, cancelled: true }] });
    expect(JSON.parse(sql(`select json_build_object(
      'before_count', jsonb_array_length(before_snapshot -> 'measurements'),
      'after_count', jsonb_array_length(after_snapshot -> 'measurements'),
      'before_session_cancelled', before_snapshot #>> '{session,cancelled_at}',
      'after_session_cancelled', after_snapshot #>> '{session,cancelled_at}'
    )::text from public.litter_weight_adjustment_commands where client_command_id = ${q(ids.cancelSessionCommand)}::uuid;`)))
      .toEqual({ before_count: 2, after_count: 2, before_session_cancelled: null, after_session_cancelled: "2026-07-20T08:02:00+00:00" });
    expect(Number(sql(`select count(*) from public.animal_weight_measurements where id::text like '9f200003-%';`))).toBe(countBeforeSessionCancellation);
    const ownerAudit = requireSuccess(await listLitterWeightAdjustmentHistoryCore({ litterId: ids.mainLitter }, owner));
    expect(ownerAudit.entries).toHaveLength(3);
    expect(ownerAudit.entries.map((entry) => entry.commandType)).toEqual(["cancel_session", "cancel_measurement", "correct_measurement"]);
    expect(ownerAudit.entries.find((entry) => entry.commandType === "correct_measurement")).toMatchObject({ animalLabel: "Adjustment A", beforeGrams: 500, afterGrams: 550, beforeNote: "Avant", afterNote: "Après contrôle", affectedMeasurementCount: 1 });
    expect(ownerAudit.entries.find((entry) => entry.commandType === "cancel_measurement")).toMatchObject({ animalLabel: "Adjustment A", beforeGrams: 600, afterGrams: null, beforeNote: null, afterNote: null, affectedMeasurementCount: 1 });
    expect(ownerAudit.entries.find((entry) => entry.commandType === "cancel_session")).toMatchObject({ animalLabel: null, beforeGrams: null, afterGrams: null, affectedMeasurementCount: 2 });
    expect(requireSuccess(await listLitterWeightAdjustmentHistoryCore({ litterId: ids.mainLitter, limit: 2 }, owner)).entries).toEqual(ownerAudit.entries.slice(0, 2));
    for (const client of [adminRole, memberRole, viewerRole]) expect(requireSuccess(await listLitterWeightAdjustmentHistoryCore({ litterId: ids.mainLitter }, client)).entries).toHaveLength(3);
    expect((await listLitterWeightAdjustmentHistoryCore({ litterId: ids.mainLitter }, anonymous)).outcome).toBe("error");
    expect((await listLitterWeightAdjustmentHistoryCore({ litterId: ids.foreignLitter }, owner)).outcome).toBe("error");
    const serializedAudit = JSON.stringify(ownerAudit.entries);
    expect(serializedAudit).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    expect(serializedAudit).not.toMatch(/snapshot|client_command|measurement_id|session_id/i);
    const afterSession = requireSuccess(await listLitterWeightHistoryCore({ litterId: ids.mainLitter, schedule: { todayDate: "2026-07-18" } }, owner));
    expect(afterSession.sessions.some(({ id }) => id === ids.sessionThree)).toBe(false);
    expect(afterSession.measurements.some(({ sessionId }) => sessionId === ids.sessionThree)).toBe(false);
    if (afterSession.weighingSchedule?.status === "available") {
      expect(afterSession.weighingSchedule.schedule.flatMap(({ observations }) => observations)
        .some(({ observedOn }) => observedOn === "2026-07-13")).toBe(false);
    }
    const comparisonAfterSession = requireSuccess(await listLitterAgeComparisonCore({ litterIds: [ids.mainLitter, ids.comparisonLitter] }, owner));
    expect(comparisonAfterSession.model.series[0]?.points.some(({ ageDay }) => ageDay === 3)).toBe(false);

    const recreated = requireSuccess(await recordLitterRoutineWeightsCore({
      litterId: ids.mainLitter, clientCommandId: ids.recreateCommand,
      measuredAt: "2026-07-13T08:00:00Z", timezoneName: "Europe/Paris", note: "Séance recréée",
      items: [{ animalId: ids.animalOne, grams: 705 }],
    }, owner));
    expect(recreated.sessionId).not.toBe(ids.sessionThree);
    expect(sql(`select count(*) from public.litter_weighing_sessions where litter_id = ${q(ids.mainLitter)}::uuid and measured_at = '2026-07-13T08:00Z';`)).toBe("2");
    expect(await correctLitterRoutineWeightCore({ measurementId: ids.measurementFive, clientCommandId: `${prefix}88`, expectedRevisionNo: 1, grams: 701, note: null, reason: "Après annulation" }, owner))
      .toMatchObject({ outcome: "error", error: { code: "session_cancelled" } });

    expect(await correctLitterRoutineWeightCore({ measurementId: ids.measurementSeven, clientCommandId: ids.viewerCommand, expectedRevisionNo: 0, grams: 801, note: null, reason: "Viewer" }, viewerRole))
      .toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect((await anonymous.rpc("correct_litter_routine_weight", {
      p_measurement_id: ids.measurementSeven, p_client_command_id: ids.anonymousCommand,
      p_expected_revision_no: 0, p_grams: 801, p_note: null, p_reason: "Anonyme",
    })).error).not.toBeNull();
    expect(await correctLitterRoutineWeightCore({ measurementId: ids.foreignMeasurement, clientCommandId: ids.foreignCommand, expectedRevisionNo: 0, grams: 501, note: null, reason: "Autre organisation" }, owner))
      .toMatchObject({ outcome: "error", error: { code: "measurement_not_found" } });
    for (const [measurementId, commandId] of [[ids.birthWeightOne, ids.birthCommand], [ids.clinicalMeasurement, ids.clinicalCommand]] as const) {
      expect(await correctLitterRoutineWeightCore({ measurementId, clientCommandId: commandId, expectedRevisionNo: 0, grams: 999, note: null, reason: "Type protégé" }, owner)).toMatchObject({ outcome: "error" });
      expect(await cancelLitterRoutineWeightCore({ measurementId, clientCommandId: `${commandId.slice(0, -2)}9${commandId.slice(-1)}`, expectedRevisionNo: 0, cancelledAt: "2026-07-20T10:03:00+02:00", reason: "Type protégé" }, owner)).toMatchObject({ outcome: "error" });
    }
    expect(JSON.parse(sql(`select json_agg(json_build_object('id', id, 'grams', grams, 'revision', revision_no, 'cancelled', cancelled_at) order by id)::text
      from public.animal_weight_measurements where id in (${q(ids.birthWeightOne)}::uuid, ${q(ids.clinicalMeasurement)}::uuid);`)))
      .toEqual([
        { id: ids.birthWeightOne, grams: 400, revision: 0, cancelled: null },
        { id: ids.clinicalMeasurement, grams: 1100, revision: 0, cancelled: null },
      ]);

    const correctionRace = await Promise.all([
      correctLitterRoutineWeightCore({ measurementId: ids.measurementEight, clientCommandId: ids.concurrentCorrectionOne, expectedRevisionNo: 0, grams: 901, note: null, reason: "Concurrence A" }, owner),
      correctLitterRoutineWeightCore({ measurementId: ids.measurementEight, clientCommandId: ids.concurrentCorrectionTwo, expectedRevisionNo: 0, grams: 902, note: null, reason: "Concurrence B" }, owner),
    ]);
    expect(correctionRace.filter(({ outcome }) => outcome === "success")).toHaveLength(1);
    expect(correctionRace.filter(({ outcome }) => outcome === "error")[0]).toMatchObject({ error: { code: "stale_revision" } });

    const mixedRace = await Promise.all([
      correctLitterRoutineWeightCore({ measurementId: ids.measurementTen, clientCommandId: ids.mixedCorrection, expectedRevisionNo: 0, grams: 1001, note: "Corrigé", reason: "Concurrence correction" }, owner),
      cancelLitterRoutineWeightCore({ measurementId: ids.measurementTen, clientCommandId: ids.mixedCancellation, expectedRevisionNo: 0, cancelledAt: "2026-07-20T10:04:00+02:00", reason: "Concurrence annulation" }, owner),
    ]);
    expect(mixedRace.filter(({ outcome }) => outcome === "success")).toHaveLength(1);
    const mixedState = JSON.parse(sql(`select json_build_object('revision', revision_no, 'grams', grams, 'cancelled', cancelled_at is not null)::text from public.animal_weight_measurements where id = ${q(ids.measurementTen)}::uuid;`));
    expect(mixedState.revision).toBe(1);
    expect([[1001, false], [1000, true]]).toContainEqual([mixedState.grams, mixedState.cancelled]);

    const directUpdate = await owner.from("animal_weight_measurements").update({ grams: 777 }).eq("id", ids.measurementTwo);
    const directDelete = await owner.from("animal_weight_measurements").delete().eq("id", ids.measurementTwo);
    expect(directUpdate.error).not.toBeNull();
    expect(directDelete.error).not.toBeNull();
    expect(sql(`select count(*) from public.animal_weight_measurements where id = ${q(ids.measurementTwo)}::uuid;`)).toBe("1");
  } finally {
    cleanup();
    expectClean();
    console.log(JSON.stringify({ litterWeightAdjustmentFixtures: { deleted: { prefix: "9f200003-", ids }, remaining: remainingCounts() } }));
  }
});
