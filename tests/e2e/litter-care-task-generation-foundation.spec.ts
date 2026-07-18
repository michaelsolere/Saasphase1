import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  generateLitterCareTasksFromPlanCore,
  planLitterCareTaskGenerationCore,
  type LitterCareTaskGenerationReadyPlanItem,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f180010-0000-4000-8000-0000000000";
const fixturePrefix = "E2E génération jalons 9f180010";

const ids = {
  mother: `${prefix}01`,
  mainLitter: `${prefix}02`,
  complementaryLitter: `${prefix}03`,
  concurrencyLitter: `${prefix}04`,
  staleLitter: `${prefix}05`,
  closedLitter: `${prefix}06`,
  deletedLitter: `${prefix}07`,
  duplicateLitter: `${prefix}08`,
  anchorRaceLitter: `${prefix}09`,
  firstMatingTemplate: `${prefix}10`,
  ovulationTemplate: `${prefix}11`,
  expectedBirthTemplate: `${prefix}12`,
  actualBirthTemplate: `${prefix}13`,
  offspringAgeTemplate: `${prefix}14`,
  speciesMismatchTemplate: `${prefix}15`,
  breedMismatchTemplate: `${prefix}16`,
  inactiveTemplate: `${prefix}17`,
  staleTemplateA: `${prefix}18`,
  staleTemplateB: `${prefix}19`,
  otherOrganization: `${prefix}20`,
  otherLitter: `${prefix}21`,
  adminUser: `${prefix}30`,
  adminIdentity: `${prefix}31`,
  adminMembership: `${prefix}32`,
  memberUser: `${prefix}33`,
  memberIdentity: `${prefix}34`,
  memberMembership: `${prefix}35`,
  viewerUser: `${prefix}36`,
  viewerIdentity: `${prefix}37`,
  viewerMembership: `${prefix}38`,
  inactiveUser: `${prefix}39`,
  inactiveIdentity: `${prefix}40`,
  inactiveMembership: `${prefix}41`,
} as const;

const credentials = {
  admin: ["generation-admin@saasphase1.invalid", "GenerationAdmin-2026!"],
  member: ["generation-member@saasphase1.invalid", "GenerationMember-2026!"],
  viewer: ["generation-viewer@saasphase1.invalid", "GenerationViewer-2026!"],
  inactive: ["generation-inactive@saasphase1.invalid", "GenerationInactive-2026!"],
} as const;

function command(suffix: number) {
  return `${prefix}${String(suffix).padStart(2, "0")}`;
}

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForActiveSqlFunction(functionName: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const active = Number(sql(`
      select count(*)
      from pg_catalog.pg_stat_activity
      where pid <> pg_catalog.pg_backend_pid()
        and state = 'active'
        and query like ${q(`%${functionName}%`)};
    `));
    if (active > 0) {
      await delay(100);
      return;
    }
    await delay(50);
  }

  throw new Error(`Concurrent SQL function did not become active: ${functionName}`);
}

function cleanup() {
  sql(`
    drop function if exists public.e2e_generation_update_template_and_hold(uuid);
    drop function if exists public.e2e_generation_update_anchor_and_hold(uuid);

    delete from public.litter_care_task_generation_commands
    where client_command_id::text like '9f180010-%'
       or litter_id::text like '9f180010-%';

    delete from public.litter_care_tasks
    where litter_id::text like '9f180010-%'
       or id::text like '9f180010-%';

    delete from public.litter_care_task_template_commands
    where client_command_id::text like '9f180010-%'
       or template_id::text like '9f180010-%';

    delete from public.litter_care_task_templates
    where id::text like '9f180010-%'
       or title like ${q(`${fixturePrefix}%`)};

    delete from public.litters
    where id::text like '9f180010-%'
       or name like ${q(`${fixturePrefix}%`)};
    delete from public.animals
    where id::text like '9f180010-%'
       or call_name like ${q(`${fixturePrefix}%`)};
    delete from public.memberships where id::text like '9f180010-%';
    delete from auth.identities where user_id::text like '9f180010-%';
    delete from auth.users where id::text like '9f180010-%';
    delete from public.organizations where id::text like '9f180010-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'generation_commands', (
        select count(*) from public.litter_care_task_generation_commands
        where client_command_id::text like '9f180010-%'
           or litter_id::text like '9f180010-%'
      ),
      'tasks', (
        select count(*) from public.litter_care_tasks
        where litter_id::text like '9f180010-%'
           or id::text like '9f180010-%'
      ),
      'template_commands', (
        select count(*) from public.litter_care_task_template_commands
        where client_command_id::text like '9f180010-%'
           or template_id::text like '9f180010-%'
      ),
      'templates', (
        select count(*) from public.litter_care_task_templates
        where id::text like '9f180010-%'
           or title like ${q(`${fixturePrefix}%`)}
      ),
      'litters', (
        select count(*) from public.litters
        where id::text like '9f180010-%'
           or name like ${q(`${fixturePrefix}%`)}
      ),
      'animals', (
        select count(*) from public.animals
        where id::text like '9f180010-%'
           or call_name like ${q(`${fixturePrefix}%`)}
      ),
      'memberships', (select count(*) from public.memberships where id::text like '9f180010-%'),
      'profiles', (select count(*) from public.profiles where id::text like '9f180010-%'),
      'auth_identities', (select count(*) from auth.identities where user_id::text like '9f180010-%'),
      'auth_users', (select count(*) from auth.users where id::text like '9f180010-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9f180010-%'),
      'temporary_functions', (
        select count(*)
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname in (
            'e2e_generation_update_template_and_hold',
            'e2e_generation_update_anchor_and_hold'
          )
      )
    )::text;
  `)) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function unrelatedCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'events', (select count(*) from public.events),
      'maternal_observations', (select count(*) from public.maternal_observations),
      'notes', (select count(*) from public.notes),
      'documents', (select count(*) from public.documents),
      'payments', (select count(*) from public.payments),
      'reservations', (select count(*) from public.reservations),
      'applications', (select count(*) from public.applications),
      'contacts', (select count(*) from public.contacts)
    )::text;
  `)) as Record<string, number>;
}

function createFixtures() {
  const authUsers = [
    [ids.adminUser, credentials.admin[0], credentials.admin[1], "Admin génération E2E"],
    [ids.memberUser, credentials.member[0], credentials.member[1], "Member génération E2E"],
    [ids.viewerUser, credentials.viewer[0], credentials.viewer[1], "Viewer génération E2E"],
    [ids.inactiveUser, credentials.inactive[0], credentials.inactive[1], "Inactive génération E2E"],
  ] as const;
  const identities = [
    [ids.adminIdentity, ids.adminUser, credentials.admin[0]],
    [ids.memberIdentity, ids.memberUser, credentials.member[0]],
    [ids.viewerIdentity, ids.viewerUser, credentials.viewer[0]],
    [ids.inactiveIdentity, ids.inactiveUser, credentials.inactive[0]],
  ] as const;

  sql(`
    insert into public.organizations (id, name, slug) values (
      ${q(ids.otherOrganization)}::uuid,
      ${q(`${fixturePrefix} autre organisation`)},
      'e2e-generation-jalons-autre-organisation'
    );

    ${authUsers.map(([id, email, password, displayName]) => `
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, phone_change,
        phone_change_token, email_change_token_current, reauthentication_token,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        ${q(id)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', ${q(email)},
        extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(displayName)}), now(), now()
      );
    `).join("\n")}

    ${identities.map(([id, userId, email]) => `
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(id)}::uuid, ${q(email)}, ${q(userId)}::uuid,
        jsonb_build_object(
          'sub', ${q(userId)}, 'email', ${q(email)},
          'email_verified', true, 'phone_verified', false
        ), 'email', now(), now()
      );
    `).join("\n")}

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (${q(ids.adminMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.adminUser)}::uuid,
       'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.memberUser)}::uuid,
       'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.viewerUser)}::uuid,
       'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactiveMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.inactiveUser)}::uuid,
       'member', 'disabled', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixturePrefix} mère`)}, 'dog', 'Golden Retriever', 'female',
      'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      mating_date, estimated_ovulation_date, expected_birth_date, actual_birth_date,
      created_by, updated_by, deleted_at
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} principale`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.complementaryLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} complémentaire`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected',
       '2026-07-01', '2026-07-03', '2026-08-30', null,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.concurrencyLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} concurrence`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.staleLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} obsolète`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.closedLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} fermée`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'closed',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.deletedLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} supprimée`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now()),
      (${q(ids.duplicateLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} doublon`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.anchorRaceLitter)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} ancre concurrente`)},
       'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null),
      (${q(ids.otherLitter)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(`${fixturePrefix} autre portée`)},
       'dog', 'Golden Retriever', null, 'born',
       '2026-07-01', '2026-07-03', '2026-08-30', '2026-09-01',
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, null);

    insert into public.litter_care_task_templates (
      id, organization_id, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, is_active, sort_order,
      revision, created_by, updated_by
    ) values
      (${q(ids.firstMatingTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} première saillie`)},
       'Snapshot saillie.', 'reproduction', 'mother', 'first_mating', 1,
       'dog', null, true, 10, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.ovulationTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} ovulation`)},
       'Snapshot ovulation.', 'maternal_health', 'mother', 'estimated_ovulation', -2,
       'dog', '  golden retriever  ', true, 20, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.expectedBirthTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} naissance prévue`)},
       'Snapshot naissance prévue.', 'preparation', 'litter', 'expected_birth', 3,
       'dog', null, true, 30, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.actualBirthTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} naissance réelle`)},
       'Snapshot naissance réelle.', 'offspring_health', 'all_offspring', 'actual_birth', 0,
       'dog', 'Golden Retriever', true, 40, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.offspringAgeTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} âge chiots`)},
       'Snapshot âge chiots.', 'offspring_weight', 'all_offspring', 'offspring_age', 7,
       'dog', null, true, 50, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.speciesMismatchTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} mauvaise espèce`)},
       null, 'other', 'litter', 'actual_birth', 0,
       'cat', null, true, 60, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.breedMismatchTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} mauvaise race`)},
       null, 'other', 'litter', 'actual_birth', 0,
       'dog', 'Labrador Retriever', true, 70, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactiveTemplate)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} inactif`)},
       null, 'other', 'organization', 'actual_birth', 0,
       'dog', null, false, 80, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    create or replace function public.e2e_generation_update_template_and_hold(p_template_id uuid)
    returns void language plpgsql as $$
    begin
      update public.litter_care_task_templates
      set revision = revision + 1, updated_by = ${q(ownerId)}::uuid
      where id = p_template_id;
      perform pg_catalog.pg_sleep(1.5);
    end;
    $$;

    create or replace function public.e2e_generation_update_anchor_and_hold(p_litter_id uuid)
    returns void language plpgsql as $$
    begin
      update public.litters
      set expected_birth_date = expected_birth_date + 1, updated_by = ${q(ownerId)}::uuid
      where id = p_litter_id;
      perform pg_catalog.pg_sleep(1.5);
    end;
    $$;
  `);
}

async function authenticatedClient(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

function planItem(
  plan: LitterCareTaskGenerationReadyPlanItem[],
  templateId: string,
) {
  const item = plan.find((candidate) => candidate.templateId === templateId);
  if (!item) throw new Error(`Missing ready plan item for ${templateId}`);
  return item;
}

function taskCount(litterId: string, templateId?: string) {
  return Number(sql(`
    select count(*)
    from public.litter_care_tasks
    where litter_id = ${q(litterId)}::uuid
      ${templateId ? `and organization_template_id = ${q(templateId)}::uuid` : ""};
  `));
}

test("planifie puis génère atomiquement les tâches exactes d'une portée", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const unrelatedBefore = unrelatedCounts();
    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecond = await createAuthenticatedSupabaseClient();
    const admin = await authenticatedClient(...credentials.admin);
    const member = await authenticatedClient(...credentials.member);
    const viewer = await authenticatedClient(...credentials.viewer);
    const inactive = await authenticatedClient(...credentials.inactive);
    const anonymous = createAnonymousSupabaseClient();

    const writesBeforePlanning = JSON.parse(sql(`
      select json_build_object(
        'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.mainLitter)}::uuid),
        'commands', (select count(*) from public.litter_care_task_generation_commands where litter_id = ${q(ids.mainLitter)}::uuid)
      )::text;
    `));
    const mainPlan = await planLitterCareTaskGenerationCore(
      { litterId: ids.mainLitter },
      owner,
    );
    expect(mainPlan).toMatchObject({ outcome: "success", role: "owner" });
    if (mainPlan.outcome !== "success") throw new Error("Main plan failed");
    expect(JSON.parse(sql(`
      select json_build_object(
        'tasks', (select count(*) from public.litter_care_tasks where litter_id = ${q(ids.mainLitter)}::uuid),
        'commands', (select count(*) from public.litter_care_task_generation_commands where litter_id = ${q(ids.mainLitter)}::uuid)
      )::text;
    `))).toEqual(writesBeforePlanning);

    const mainStates = Object.fromEntries(
      mainPlan.entries.map((entry) => [entry.template.id, entry.state]),
    );
    expect(mainStates).toMatchObject({
      [ids.firstMatingTemplate]: "ready",
      [ids.ovulationTemplate]: "ready",
      [ids.expectedBirthTemplate]: "ready",
      [ids.actualBirthTemplate]: "ready",
      [ids.offspringAgeTemplate]: "ready",
      [ids.speciesMismatchTemplate]: "species_mismatch",
      [ids.breedMismatchTemplate]: "breed_mismatch",
      [ids.inactiveTemplate]: "inactive",
    });
    expect(mainPlan.readyPlan).toEqual([
      {
        templateId: ids.firstMatingTemplate,
        revision: 1,
        anchorType: "first_mating",
        anchorDate: "2026-07-01",
        plannedFor: "2026-07-02",
      },
      {
        templateId: ids.ovulationTemplate,
        revision: 1,
        anchorType: "estimated_ovulation",
        anchorDate: "2026-07-03",
        plannedFor: "2026-07-01",
      },
      {
        templateId: ids.expectedBirthTemplate,
        revision: 1,
        anchorType: "expected_birth",
        anchorDate: "2026-08-30",
        plannedFor: "2026-09-02",
      },
      {
        templateId: ids.actualBirthTemplate,
        revision: 1,
        anchorType: "actual_birth",
        anchorDate: "2026-09-01",
        plannedFor: "2026-09-01",
      },
      {
        templateId: ids.offspringAgeTemplate,
        revision: 1,
        anchorType: "offspring_age",
        anchorDate: "2026-09-01",
        plannedFor: "2026-09-08",
      },
    ]);

    const generated = await generateLitterCareTasksFromPlanCore(
      {
        litterId: ids.mainLitter,
        clientCommandId: command(70),
        plan: mainPlan.readyPlan,
      },
      owner,
    );
    expect(generated).toMatchObject({
      outcome: "success",
      createdCount: 5,
      alreadyGeneratedCount: 0,
      replayed: false,
    });
    if (generated.outcome !== "success") throw new Error("Generation failed");
    expect(generated.tasks).toHaveLength(5);
    expect(new Set(generated.tasks.map((task) => task.taskId)).size).toBe(5);
    expect(taskCount(ids.mainLitter)).toBe(5);
    expect(JSON.parse(sql(`
      select json_agg(json_build_object(
        'template_id', organization_template_id,
        'occurrence_no', occurrence_no,
        'anchor_type', anchor_type,
        'anchor_date', anchor_date::text,
        'planned_for', planned_for::text
      ) order by organization_template_id)::text
      from public.litter_care_tasks
      where litter_id = ${q(ids.mainLitter)}::uuid;
    `))).toEqual([
      { template_id: ids.firstMatingTemplate, occurrence_no: 1, anchor_type: "first_mating", anchor_date: "2026-07-01", planned_for: "2026-07-02" },
      { template_id: ids.ovulationTemplate, occurrence_no: 1, anchor_type: "estimated_ovulation", anchor_date: "2026-07-03", planned_for: "2026-07-01" },
      { template_id: ids.expectedBirthTemplate, occurrence_no: 1, anchor_type: "expected_birth", anchor_date: "2026-08-30", planned_for: "2026-09-02" },
      { template_id: ids.actualBirthTemplate, occurrence_no: 1, anchor_type: "actual_birth", anchor_date: "2026-09-01", planned_for: "2026-09-01" },
      { template_id: ids.offspringAgeTemplate, occurrence_no: 1, anchor_type: "offspring_age", anchor_date: "2026-09-01", planned_for: "2026-09-08" },
    ]);
    expect(Number(sql(`
      select count(distinct creation_command_id)
      from public.litter_care_tasks
      where litter_id = ${q(ids.mainLitter)}::uuid;
    `))).toBe(5);
    expect(sql(`
      select count(*)
      from public.litter_care_tasks
      where litter_id = ${q(ids.mainLitter)}::uuid
        and creation_command_id = ${q(command(70))}::uuid;
    `)).toBe("0");

    const replayed = await generateLitterCareTasksFromPlanCore(
      { litterId: ids.mainLitter, clientCommandId: command(70), plan: mainPlan.readyPlan },
      ownerSecond,
    );
    expect(replayed).toEqual({ ...generated, replayed: true });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.mainLitter, clientCommandId: command(70), plan: mainPlan.readyPlan.slice(0, 4) },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.complementaryLitter, clientCommandId: command(70), plan: mainPlan.readyPlan },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const newCommand = await generateLitterCareTasksFromPlanCore(
      { litterId: ids.mainLitter, clientCommandId: command(71), plan: mainPlan.readyPlan },
      owner,
    );
    expect(newCommand).toMatchObject({
      outcome: "success",
      createdCount: 0,
      alreadyGeneratedCount: 5,
      replayed: false,
    });
    expect(taskCount(ids.mainLitter)).toBe(5);

    sql(`
      update public.litter_care_tasks
      set status = 'cancelled',
        resolution_command_id = ${q(command(95))}::uuid,
        resolved_at = '2026-09-10T10:00:00+02:00'::timestamptz,
        resolved_timezone_name = 'Europe/Paris',
        resolved_by = ${q(ownerId)}::uuid,
        resolution_note = 'État historique à préserver',
        updated_by = ${q(ownerId)}::uuid
      where litter_id = ${q(ids.mainLitter)}::uuid
        and organization_template_id = ${q(ids.offspringAgeTemplate)}::uuid;
    `);
    const resolvedTaskBeforeReplay = sql(`
      select row_to_json(task)::text from (
        select id, status, planned_for::text, resolved_at::text,
          resolved_timezone_name, resolved_by, resolution_note
        from public.litter_care_tasks
        where litter_id = ${q(ids.mainLitter)}::uuid
          and organization_template_id = ${q(ids.offspringAgeTemplate)}::uuid
      ) task;
    `);
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.mainLitter, clientCommandId: command(87), plan: mainPlan.readyPlan },
        owner,
      ),
    ).toMatchObject({ outcome: "success", createdCount: 0, alreadyGeneratedCount: 5 });
    expect(sql(`
      select row_to_json(task)::text from (
        select id, status, planned_for::text, resolved_at::text,
          resolved_timezone_name, resolved_by, resolution_note
        from public.litter_care_tasks
        where litter_id = ${q(ids.mainLitter)}::uuid
          and organization_template_id = ${q(ids.offspringAgeTemplate)}::uuid
      ) task;
    `)).toBe(resolvedTaskBeforeReplay);

    const planAfterGeneration = await planLitterCareTaskGenerationCore(
      { litterId: ids.mainLitter },
      owner,
    );
    expect(planAfterGeneration.outcome).toBe("success");
    if (planAfterGeneration.outcome === "success") {
      expect(planAfterGeneration.readyPlan).toEqual([]);
      expect(
        planAfterGeneration.entries
          .filter((entry) => mainPlan.readyPlan.some((item) => item.templateId === entry.template.id))
          .every((entry) => entry.state === "already_generated"),
      ).toBe(true);
    }

    const complementaryPlan = await planLitterCareTaskGenerationCore(
      { litterId: ids.complementaryLitter },
      owner,
    );
    expect(complementaryPlan.outcome).toBe("success");
    if (complementaryPlan.outcome !== "success") throw new Error("Complementary plan failed");
    expect(complementaryPlan.readyPlan).toHaveLength(3);
    expect(Object.fromEntries(complementaryPlan.entries.map((entry) => [entry.template.id, entry.state]))).toMatchObject({
      [ids.actualBirthTemplate]: "missing_anchor",
      [ids.offspringAgeTemplate]: "missing_anchor",
    });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.complementaryLitter, clientCommandId: command(72), plan: complementaryPlan.readyPlan },
        owner,
      ),
    ).toMatchObject({ outcome: "success", createdCount: 3 });
    sql(`update public.litters set actual_birth_date = '2026-09-01' where id = ${q(ids.complementaryLitter)}::uuid;`);
    const complementaryAfterAnchor = await planLitterCareTaskGenerationCore(
      { litterId: ids.complementaryLitter },
      owner,
    );
    expect(complementaryAfterAnchor.outcome).toBe("success");
    if (complementaryAfterAnchor.outcome !== "success") throw new Error("Second complementary plan failed");
    expect(complementaryAfterAnchor.readyPlan.map((item) => item.templateId)).toEqual([
      ids.actualBirthTemplate,
      ids.offspringAgeTemplate,
    ]);
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.complementaryLitter, clientCommandId: command(73), plan: complementaryAfterAnchor.readyPlan },
        owner,
      ),
    ).toMatchObject({ outcome: "success", createdCount: 2 });
    expect(taskCount(ids.complementaryLitter)).toBe(5);

    const snapshotBefore = JSON.parse(sql(`
      select row_to_json(snapshot)::text from (
        select category, target_scope, title, description, anchor_type,
          anchor_date::text, offset_days, planned_for::text, status
        from public.litter_care_tasks
        where litter_id = ${q(ids.mainLitter)}::uuid
          and organization_template_id = ${q(ids.firstMatingTemplate)}::uuid
      ) snapshot;
    `));
    sql(`
      update public.litter_care_task_templates
      set title = ${q(`${fixturePrefix} modèle modifié`)}, description = 'Modifié',
        category = 'veterinary', target_scope = 'organization', anchor_type = 'expected_birth',
        offset_days = 99, is_active = false, revision = revision + 1
      where id = ${q(ids.firstMatingTemplate)}::uuid;
      update public.litters set mating_date = '2026-07-10' where id = ${q(ids.mainLitter)}::uuid;
    `);
    expect(JSON.parse(sql(`
      select row_to_json(snapshot)::text from (
        select category, target_scope, title, description, anchor_type,
          anchor_date::text, offset_days, planned_for::text, status
        from public.litter_care_tasks
        where litter_id = ${q(ids.mainLitter)}::uuid
          and organization_template_id = ${q(ids.firstMatingTemplate)}::uuid
      ) snapshot;
    `))).toEqual(snapshotBefore);

    sql(`
      insert into public.litter_care_task_templates (
        id, organization_id, title, description, category, target_scope,
        anchor_type, offset_days, species, breed, is_active, sort_order,
        revision, created_by, updated_by
      ) values
        (${q(ids.staleTemplateA)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} stale A`)},
         null, 'other', 'litter', 'expected_birth', 1, 'dog', null, true, 90, 1,
         ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
        (${q(ids.staleTemplateB)}::uuid, ${q(organizationId)}::uuid, ${q(`${fixturePrefix} stale B`)},
         null, 'other', 'litter', 'actual_birth', 2, 'dog', null, true, 91, 1,
         ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    `);
    const stalePlan = await planLitterCareTaskGenerationCore({ litterId: ids.staleLitter }, owner);
    expect(stalePlan.outcome).toBe("success");
    if (stalePlan.outcome !== "success") throw new Error("Stale plan failed");
    const templateUpdate = runE2eSql(
      `select public.e2e_generation_update_template_and_hold(${q(ids.staleTemplateA)}::uuid);`,
    );
    await waitForActiveSqlFunction("e2e_generation_update_template_and_hold");
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.staleLitter, clientCommandId: command(74), plan: stalePlan.readyPlan },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "stale_plan" } });
    await templateUpdate;
    expect(taskCount(ids.staleLitter)).toBe(0);
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.staleLitter, clientCommandId: command(74), plan: stalePlan.readyPlan },
        ownerSecond,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "stale_plan" } });
    expect(Number(sql(`
      select count(*) from public.litter_care_task_generation_commands
      where client_command_id = ${q(command(74))}::uuid;
    `))).toBe(1);

    const duplicatePlan = await planLitterCareTaskGenerationCore({ litterId: ids.duplicateLitter }, owner);
    expect(duplicatePlan.outcome).toBe("success");
    if (duplicatePlan.outcome !== "success") throw new Error("Duplicate plan failed");
    const duplicatedItem = planItem(duplicatePlan.readyPlan, ids.staleTemplateB);
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.duplicateLitter, clientCommandId: command(75), plan: [duplicatedItem, duplicatedItem] },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "stale_plan" } });
    expect(taskCount(ids.duplicateLitter)).toBe(0);

    const anchorRacePlan = await planLitterCareTaskGenerationCore({ litterId: ids.anchorRaceLitter }, owner);
    expect(anchorRacePlan.outcome).toBe("success");
    if (anchorRacePlan.outcome !== "success") throw new Error("Anchor race plan failed");
    const expectedBirthItem = planItem(anchorRacePlan.readyPlan, ids.expectedBirthTemplate);
    const anchorUpdate = runE2eSql(
      `select public.e2e_generation_update_anchor_and_hold(${q(ids.anchorRaceLitter)}::uuid);`,
    );
    await waitForActiveSqlFunction("e2e_generation_update_anchor_and_hold");
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.anchorRaceLitter, clientCommandId: command(76), plan: [expectedBirthItem] },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "stale_plan" } });
    await anchorUpdate;
    expect(taskCount(ids.anchorRaceLitter)).toBe(0);

    const concurrencyPlan = await planLitterCareTaskGenerationCore({ litterId: ids.concurrencyLitter }, viewer);
    expect(concurrencyPlan).toMatchObject({ outcome: "success", role: "viewer" });
    if (concurrencyPlan.outcome !== "success") throw new Error("Concurrency plan failed");
    const concurrencyItem = planItem(concurrencyPlan.readyPlan, ids.staleTemplateB);
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.concurrencyLitter, clientCommandId: command(77), plan: [concurrencyItem] },
        viewer,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    const concurrent = await Promise.all([
      generateLitterCareTasksFromPlanCore(
        { litterId: ids.concurrencyLitter, clientCommandId: command(78), plan: [concurrencyItem] },
        owner,
      ),
      generateLitterCareTasksFromPlanCore(
        { litterId: ids.concurrencyLitter, clientCommandId: command(79), plan: [concurrencyItem] },
        member,
      ),
    ]);
    expect(concurrent.every((result) => result.outcome === "success")).toBe(true);
    expect(concurrent.reduce((sum, result) =>
      sum + (result.outcome === "success" ? result.createdCount : 0), 0)).toBe(1);
    expect(concurrent.reduce((sum, result) =>
      sum + (result.outcome === "success" ? result.alreadyGeneratedCount : 0), 0)).toBe(1);
    expect(taskCount(ids.concurrencyLitter, ids.staleTemplateB)).toBe(1);
    expect(taskCount(ids.concurrencyLitter)).toBe(1);
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.concurrencyLitter, clientCommandId: command(80), plan: [concurrencyItem] },
        admin,
      ),
    ).toMatchObject({ outcome: "success", createdCount: 0, alreadyGeneratedCount: 1 });

    expect(
      await planLitterCareTaskGenerationCore({ litterId: ids.mainLitter }, inactive),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.mainLitter, clientCommandId: command(81), plan: [] },
        inactive,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await planLitterCareTaskGenerationCore({ litterId: ids.otherLitter }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.otherLitter, clientCommandId: command(82), plan: [] },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await planLitterCareTaskGenerationCore({ litterId: ids.closedLitter }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "invalid_litter" } });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.closedLitter, clientCommandId: command(83), plan: [] },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "invalid_litter" } });
    expect(
      await planLitterCareTaskGenerationCore({ litterId: ids.deletedLitter }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await generateLitterCareTasksFromPlanCore(
        { litterId: ids.deletedLitter, clientCommandId: command(84), plan: [] },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "invalid_litter" } });
    expect(
      await planLitterCareTaskGenerationCore({ litterId: ids.mainLitter }, anonymous),
    ).toMatchObject({ outcome: "error", error: { code: "unauthenticated" } });
    const anonymousRpc = await anonymous.rpc("generate_litter_care_tasks_from_plan", {
      p_litter_id: ids.mainLitter,
      p_client_command_id: command(85),
      p_plan: [],
    });
    expect(anonymousRpc.error).not.toBeNull();

    await expect(owner.from("litter_care_task_generation_commands").select("id"))
      .resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_generation_commands").insert({
      organization_id: organizationId,
      client_command_id: command(86),
      litter_id: ids.mainLitter,
      plan: [],
      outcome: "success",
      result: [],
      created_by: ownerId,
    })).resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_generation_commands")
      .update({ outcome: "error", reason: "stale_plan" })
      .eq("client_command_id", command(70)))
      .resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_generation_commands")
      .delete()
      .eq("client_command_id", command(70)))
      .resolves.toMatchObject({ error: expect.anything() });

    expect(unrelatedCounts()).toEqual(unrelatedBefore);
    expect(Number(sql(`
      select count(*) from public.litter_care_tasks
      where source <> 'organization_template'
        and litter_id::text like '9f180010-%';
    `))).toBe(0);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
