import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  createLitterCareTaskCore,
  listLitterCareTaskTemplatesCore,
  listLitterCareTasksForLitterCore,
  resolveLitterCareTaskCore,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f180007-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E litter care tasks";

const ids = {
  mother: `${prefix}01`,
  foreignMother: `${prefix}02`,
  mainLitter: `${prefix}10`,
  secondLitter: `${prefix}11`,
  closedLitter: `${prefix}12`,
  cancelledLitter: `${prefix}13`,
  notPregnantLitter: `${prefix}14`,
  archivedLitter: `${prefix}15`,
  foreignLitter: `${prefix}16`,
  otherOrganization: `${prefix}90`,
  template: `${prefix}20`,
  inactiveTemplate: `${prefix}21`,
  foreignTemplate: `${prefix}22`,
  templateTask: `${prefix}30`,
  foreignTask: `${prefix}31`,
  viewerUser: `${prefix}40`,
  viewerIdentity: `${prefix}41`,
  viewerMembership: `${prefix}42`,
  inactiveUser: `${prefix}43`,
  inactiveIdentity: `${prefix}44`,
  inactiveMembership: `${prefix}45`,
  createCommand: `${prefix}51`,
  secondCreateCommand: `${prefix}52`,
  concurrentCreateCommand: `${prefix}53`,
  conflictCreateCommand: `${prefix}54`,
  doneCreateCommand: `${prefix}55`,
  cancelledCreateCommand: `${prefix}56`,
  notApplicableCreateCommand: `${prefix}57`,
  closedResolveCreateCommand: `${prefix}58`,
  doneResolutionCommand: `${prefix}61`,
  cancelledResolutionCommand: `${prefix}62`,
  notApplicableResolutionCommand: `${prefix}63`,
  concurrentResolutionCommand: `${prefix}64`,
  closedResolutionCommand: `${prefix}65`,
  directActiveCommand: `${prefix}85`,
  directClosedCommand: `${prefix}86`,
  directCancelledCommand: `${prefix}87`,
  directNotPregnantCommand: `${prefix}88`,
  directArchivedCommand: `${prefix}89`,
  directDeletedCommand: `${prefix}91`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function litterIdsSql() {
  return [
    ids.mainLitter,
    ids.secondLitter,
    ids.closedLitter,
    ids.cancelledLitter,
    ids.notPregnantLitter,
    ids.archivedLitter,
    ids.foreignLitter,
  ]
    .map((id) => `${q(id)}::uuid`)
    .join(", ");
}

function cleanup() {
  sql(`
    drop function if exists public.e2e_hold_foreign_litter_care_litter(uuid);
    drop function if exists public.e2e_hold_foreign_litter_care_task(uuid);

    delete from public.litter_care_tasks
    where litter_id in (${litterIdsSql()})
       or creation_command_id::text like '9f180007-%'
       or resolution_command_id::text like '9f180007-%';

    delete from public.litter_care_task_templates
    where id in (
      ${q(ids.template)}::uuid,
      ${q(ids.inactiveTemplate)}::uuid,
      ${q(ids.foreignTemplate)}::uuid
    );

    delete from public.litters
    where id in (${litterIdsSql()})
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.foreignMother)}::uuid);

    delete from public.memberships where id::text like '9f180007-%';
    delete from auth.identities where user_id::text like '9f180007-%';
    delete from auth.users where id::text like '9f180007-%';
    delete from public.organizations where id = ${q(ids.otherOrganization)}::uuid;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'tasks', (
          select count(*) from public.litter_care_tasks
          where litter_id in (${litterIdsSql()})
             or creation_command_id::text like '9f180007-%'
             or resolution_command_id::text like '9f180007-%'
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id::text like '9f180007-%'
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${litterIdsSql()})
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals where id::text like '9f180007-%'
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f180007-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f180007-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f180007-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f180007-%'
        ),
        'temporary_functions', (
          select count(*) from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname in (
              'e2e_hold_foreign_litter_care_litter',
              'e2e_hold_foreign_litter_care_task'
            )
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function outOfScopeCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (select count(*) from public.events),
        'maternal_observations', (select count(*) from public.maternal_observations),
        'notes', (select count(*) from public.notes),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments),
        'animals', (select count(*) from public.animals),
        'whelping_sessions', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_sessions'
        ),
        'whelping_births', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'whelping_births'
        ),
        'weight_measurements', (
          select count(*) from pg_catalog.pg_class relation
          join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public' and relation.relname = 'animal_weight_measurements'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.otherOrganization)}::uuid,
      'Organisation E2E tâches de portée isolée',
      'e2e-taches-portee-isolee'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       'Mère tâches E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMother)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Mère étrangère tâches E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} seconde`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, 'birth_expected', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.closedLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} clôturée`)}, 'dog', 'Golden Retriever',
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

    insert into public.litter_care_task_templates (
      id, organization_id, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, is_active, sort_order, created_by, updated_by
    ) values
      (${q(ids.template)}::uuid, ${q(organizationId)}::uuid,
       'Pesée personnalisée', 'Snapshot initial.', 'offspring_weight', 'all_offspring',
       'actual_birth', 3, 'dog', 'Golden Retriever', true, 10,
       ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.inactiveTemplate)}::uuid, ${q(organizationId)}::uuid,
       'Modèle inactif', null, 'preparation', 'litter', 'expected_birth', -2,
       'dog', null, false, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignTemplate)}::uuid, ${q(ids.otherOrganization)}::uuid,
       'Modèle étranger', null, 'preparation', 'litter', 'expected_birth', 0,
       'dog', null, true, 0, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, organization_template_id,
      occurrence_no, category, target_scope, title, description,
      anchor_type, anchor_date, offset_days, planned_for, status,
      creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.templateTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid,
      'organization_template', ${q(ids.template)}::uuid, 1,
      'offspring_weight', 'all_offspring', 'Pesée personnalisée', 'Snapshot initial.',
      'actual_birth', '2026-07-18', 3, '2026-07-21', 'planned',
      ${q(`${prefix}71`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, system_template_code,
      occurrence_no, category, target_scope, title, anchor_type, anchor_date,
      offset_days, planned_for, status, creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.foreignTask)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(ids.foreignLitter)}::uuid,
      'system_template', 'foreign-care', 1, 'preparation', 'litter', 'Tâche étrangère',
      'expected_birth', '2026-07-20', 0, '2026-07-20', 'planned',
      ${q(`${prefix}72`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values
      (${q(ids.viewerUser)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'litter-care-viewer@saasphase1.invalid',
       extensions.crypt('LitterCareViewer-2026!', extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"display_name":"Viewer tâches E2E"}'::jsonb, now(), now()),
      (${q(ids.inactiveUser)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'litter-care-inactive@saasphase1.invalid',
       extensions.crypt('LitterCareInactive-2026!', extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"display_name":"Inactive tâches E2E"}'::jsonb, now(), now());

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values
      (${q(ids.viewerIdentity)}::uuid, 'litter-care-viewer@saasphase1.invalid',
       ${q(ids.viewerUser)}::uuid,
       jsonb_build_object(
         'sub', ${q(ids.viewerUser)}, 'email', 'litter-care-viewer@saasphase1.invalid',
         'email_verified', true, 'phone_verified', false
       ),
       'email', now(), now()),
      (${q(ids.inactiveIdentity)}::uuid, 'litter-care-inactive@saasphase1.invalid',
       ${q(ids.inactiveUser)}::uuid,
       jsonb_build_object(
         'sub', ${q(ids.inactiveUser)}, 'email', 'litter-care-inactive@saasphase1.invalid',
         'email_verified', true, 'phone_verified', false
       ),
       'email', now(), now());

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by, created_at, updated_at
    ) values
      (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.viewerUser)}::uuid, 'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now(), now()),
      (${q(ids.inactiveMembership)}::uuid, ${q(organizationId)}::uuid,
       ${q(ids.inactiveUser)}::uuid, 'member', 'disabled', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now(), now());

    create or replace function public.e2e_hold_foreign_litter_care_litter(p_litter_id uuid)
    returns void language plpgsql as $$
    begin
      perform 1 from public.litters where id = p_litter_id for update;
      perform pg_catalog.pg_sleep(2);
    end;
    $$;

    create or replace function public.e2e_hold_foreign_litter_care_task(p_task_id uuid)
    returns void language plpgsql as $$
    begin
      perform 1 from public.litter_care_tasks where id = p_task_id for update;
      perform pg_catalog.pg_sleep(2);
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

function manualInput(command: string, plannedFor = "2026-07-20") {
  return {
    litterId: ids.mainLitter,
    clientCommandId: command,
    category: "preparation" as const,
    targetScope: "litter" as const,
    title: `Préparation ${command.slice(-2)}`,
    description: "Tâche ponctuelle manuelle.",
    plannedFor,
  };
}

function insertManualTaskDirect(litterId: string, commandId: string) {
  sql(`
    insert into public.litter_care_tasks (
      organization_id, litter_id, source, occurrence_no, category, target_scope,
      title, planned_for, status, creation_command_id, created_by, updated_by
    ) values (
      ${q(organizationId)}::uuid, ${q(litterId)}::uuid, 'manual', 1,
      'preparation', 'litter', 'Insertion SQL directe', '2026-07-23', 'planned',
      ${q(commandId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

test("fonde les modèles et tâches de suivi de portée", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    expect(Number(sql("select count(*) from public.litter_care_task_templates;"))).toBe(0);
    createFixtures();
    const outOfScopeBefore = outOfScopeCounts();

    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecondClient = await createAuthenticatedSupabaseClient();
    const viewer = await authenticatedClient(
      "litter-care-viewer@saasphase1.invalid",
      "LitterCareViewer-2026!",
    );
    const inactive = await authenticatedClient(
      "litter-care-inactive@saasphase1.invalid",
      "LitterCareInactive-2026!",
    );

    const templates = await listLitterCareTaskTemplatesCore(
      { litterId: ids.mainLitter },
      owner,
    );
    expect(templates).toMatchObject({ outcome: "success", role: "owner" });
    if (templates.outcome === "success") {
      expect(templates.templates.map((template) => template.id)).toEqual([
        ids.template,
        ids.inactiveTemplate,
      ]);
    }
    const viewerTemplates = await listLitterCareTaskTemplatesCore(
      { litterId: ids.mainLitter },
      viewer,
    );
    expect(viewerTemplates).toMatchObject({ outcome: "success", role: "viewer" });
    expect(
      await listLitterCareTaskTemplatesCore({ litterId: ids.foreignLitter }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await listLitterCareTaskTemplatesCore({ litterId: ids.mainLitter }, inactive),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    await expect(
      viewer.from("litter_care_task_templates").insert({
        organization_id: organizationId,
        title: "Interdit",
        category: "preparation",
        target_scope: "litter",
        anchor_type: "expected_birth",
        offset_days: 0,
        species: "dog",
      }),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      viewer
        .from("litter_care_task_templates")
        .update({ title: "Interdit" })
        .eq("id", ids.template),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      viewer
        .from("litter_care_task_templates")
        .delete()
        .eq("id", ids.template),
    ).resolves.toMatchObject({ error: expect.anything() });
    expect(() =>
      sql(`insert into public.litter_care_task_templates (
        organization_id, title, category, target_scope, anchor_type, offset_days, species
      ) values (${q(organizationId)}::uuid, 'x', 'invalid', 'litter', 'expected_birth', 0, 'dog');`),
    ).toThrow();
    expect(() =>
      sql(`insert into public.litter_care_task_templates (
        organization_id, title, category, target_scope, anchor_type, offset_days, species
      ) values (${q(organizationId)}::uuid, '', 'preparation', 'invalid', 'expected_birth', 0, 'rabbit');`),
    ).toThrow();

    const templateTask = JSON.parse(
      sql(`select json_build_object(
        'title', title, 'category', category, 'target_scope', target_scope,
        'anchor_type', anchor_type, 'anchor_date', anchor_date::text, 'offset_days', offset_days
      )::text from public.litter_care_tasks where id = ${q(ids.templateTask)}::uuid;`),
    );
    expect(templateTask).toEqual({
      title: "Pesée personnalisée",
      category: "offspring_weight",
      target_scope: "all_offspring",
      anchor_type: "actual_birth",
      anchor_date: "2026-07-18",
      offset_days: 3,
    });
    sql(`update public.litter_care_task_templates
      set title = 'Modèle modifié', category = 'veterinary', target_scope = 'mother'
      where id = ${q(ids.template)}::uuid;`);
    expect(
      JSON.parse(sql(`select json_build_object('title', title, 'category', category, 'target_scope', target_scope)::text
        from public.litter_care_tasks where id = ${q(ids.templateTask)}::uuid;`)),
    ).toEqual({
      title: "Pesée personnalisée",
      category: "offspring_weight",
      target_scope: "all_offspring",
    });
    expect(() =>
      sql(`insert into public.litter_care_tasks (
        organization_id, litter_id, source, organization_template_id, occurrence_no,
        category, target_scope, title, anchor_type, anchor_date, offset_days,
        planned_for, status, creation_command_id
      ) values (
        ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, 'organization_template',
        ${q(ids.foreignTemplate)}::uuid, 1, 'preparation', 'litter', 'Croisé',
        'expected_birth', '2026-07-20', 0, '2026-07-20', 'planned', ${q(`${prefix}73`)}::uuid
      );`),
    ).toThrow();
    expect(() =>
      sql(`insert into public.litter_care_tasks (
        organization_id, litter_id, source, organization_template_id, occurrence_no,
        category, target_scope, title, anchor_type, anchor_date, offset_days,
        planned_for, status, creation_command_id
      ) values (
        ${q(organizationId)}::uuid, ${q(ids.mainLitter)}::uuid, 'organization_template',
        ${q(ids.template)}::uuid, 1, 'offspring_weight', 'all_offspring', 'Doublon',
        'actual_birth', '2026-07-18', 3, '2026-07-21', 'planned', ${q(`${prefix}74`)}::uuid
      );`),
    ).toThrow();

    insertManualTaskDirect(ids.secondLitter, ids.directActiveCommand);
    expect(
      Number(sql(`select count(*) from public.litter_care_tasks
        where creation_command_id = ${q(ids.directActiveCommand)}::uuid;`)),
    ).toBe(1);
    for (const [litterId, commandId] of [
      [ids.closedLitter, ids.directClosedCommand],
      [ids.cancelledLitter, ids.directCancelledCommand],
      [ids.notPregnantLitter, ids.directNotPregnantCommand],
      [ids.archivedLitter, ids.directArchivedCommand],
    ] as const) {
      expect(() => insertManualTaskDirect(litterId, commandId)).toThrow();
      expect(
        Number(sql(`select count(*) from public.litter_care_tasks
          where creation_command_id = ${q(commandId)}::uuid;`)),
      ).toBe(0);
    }
    sql(`update public.litters set deleted_at = now()
      where id = ${q(ids.secondLitter)}::uuid;`);
    expect(() => insertManualTaskDirect(ids.secondLitter, ids.directDeletedCommand)).toThrow();
    expect(
      Number(sql(`select count(*) from public.litter_care_tasks
        where creation_command_id = ${q(ids.directDeletedCommand)}::uuid;`)),
    ).toBe(0);
    sql(`update public.litters set deleted_at = null
      where id = ${q(ids.secondLitter)}::uuid;`);

    const created = await createLitterCareTaskCore(manualInput(ids.createCommand, "2026-07-19"), owner);
    expect(created).toMatchObject({ outcome: "success", replayed: false, status: "planned" });
    if (created.outcome !== "success") throw new Error("Manual task creation failed");
    expect(
      JSON.parse(sql(`select json_build_object(
        'source', source, 'organization_template_id', organization_template_id,
        'system_template_code', system_template_code, 'anchor_type', anchor_type,
        'anchor_date', anchor_date, 'offset_days', offset_days, 'status', status,
        'category', category, 'target_scope', target_scope, 'title', title,
        'description', description, 'planned_for', planned_for::text
      )::text from public.litter_care_tasks where id = ${q(created.taskId)}::uuid;`)),
    ).toEqual({
      source: "manual",
      organization_template_id: null,
      system_template_code: null,
      anchor_type: null,
      anchor_date: null,
      offset_days: null,
      status: "planned",
      category: "preparation",
      target_scope: "litter",
      title: `Préparation ${ids.createCommand.slice(-2)}`,
      description: "Tâche ponctuelle manuelle.",
      planned_for: "2026-07-19",
    });
    expect(
      await createLitterCareTaskCore(manualInput(ids.createCommand, "2026-07-19"), owner),
    ).toMatchObject({ outcome: "success", taskId: created.taskId, replayed: true });
    expect(
      await createLitterCareTaskCore(
        { ...manualInput(ids.conflictCreateCommand), litterId: ids.mainLitter }, owner,
      ),
    ).toMatchObject({ outcome: "success" });
    expect(
      await createLitterCareTaskCore(
        { ...manualInput(ids.conflictCreateCommand), litterId: ids.secondLitter }, owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(
      await createLitterCareTaskCore(
        manualInput(ids.secondCreateCommand, "2026-07-22"),
        owner,
      ),
    ).toMatchObject({ outcome: "success", replayed: false });

    const concurrentResults = await Promise.all([
      createLitterCareTaskCore(manualInput(ids.concurrentCreateCommand, "2026-07-18"), owner),
      createLitterCareTaskCore(manualInput(ids.concurrentCreateCommand, "2026-07-18"), ownerSecondClient),
    ]);
    expect(concurrentResults.every((result) => result.outcome === "success")).toBe(true);
    expect(concurrentResults.map((result) => result.outcome === "success" && result.taskId)).toEqual([
      concurrentResults[0].outcome === "success" ? concurrentResults[0].taskId : false,
      concurrentResults[0].outcome === "success" ? concurrentResults[0].taskId : false,
    ]);
    expect(
      Number(sql(`select count(*) from public.litter_care_tasks
        where creation_command_id = ${q(ids.concurrentCreateCommand)}::uuid;`)),
    ).toBe(1);

    const list = await listLitterCareTasksForLitterCore({ litterId: ids.mainLitter }, owner);
    expect(list).toMatchObject({ outcome: "success", role: "owner" });
    if (list.outcome === "success") {
      expect(list.tasks.slice(0, 2).every((task) => task.status === "planned")).toBe(true);
      expect(list.tasks[0].plannedFor <= list.tasks[1].plannedFor).toBe(true);
    }

    const done = await createLitterCareTaskCore(manualInput(ids.doneCreateCommand, "2026-07-25"), owner);
    const cancelled = await createLitterCareTaskCore(manualInput(ids.cancelledCreateCommand, "2026-07-26"), owner);
    const notApplicable = await createLitterCareTaskCore(manualInput(ids.notApplicableCreateCommand, "2026-07-27"), owner);
    const closedResolution = await createLitterCareTaskCore(manualInput(ids.closedResolveCreateCommand, "2026-07-28"), owner);
    if (
      done.outcome !== "success" ||
      cancelled.outcome !== "success" ||
      notApplicable.outcome !== "success" ||
      closedResolution.outcome !== "success"
    ) throw new Error("Resolution fixtures could not be created");

    const resolvedDone = await resolveLitterCareTaskCore({
      taskId: done.taskId,
      clientCommandId: ids.doneResolutionCommand,
      resolutionStatus: "done",
      resolvedAt: "2026-07-19T09:30:00.000Z",
      timezoneName: "Europe/Paris",
      resolutionNote: "Réalisée.",
    }, owner);
    expect(resolvedDone).toMatchObject({ outcome: "success", status: "done", replayed: false });
    expect(
      await resolveLitterCareTaskCore({
        taskId: done.taskId,
        clientCommandId: ids.doneResolutionCommand,
        resolutionStatus: "done",
        resolvedAt: "2026-07-19T09:30:00.000Z",
        timezoneName: "Europe/Paris",
        resolutionNote: "Réalisée.",
      }, owner),
    ).toMatchObject({ outcome: "success", replayed: true });
    expect(
      JSON.parse(sql(`select json_build_object(
        'status', status, 'resolved_at', resolved_at, 'resolved_timezone_name', resolved_timezone_name,
        'resolved_by', resolved_by, 'resolution_note', resolution_note
      )::text from public.litter_care_tasks where id = ${q(done.taskId)}::uuid;`)),
    ).toMatchObject({
      status: "done",
      resolved_timezone_name: "Europe/Paris",
      resolved_by: ownerId,
      resolution_note: "Réalisée.",
    });
    expect(
      await resolveLitterCareTaskCore({
        taskId: cancelled.taskId,
        clientCommandId: ids.doneResolutionCommand,
        resolutionStatus: "cancelled",
        resolvedAt: "2026-07-19T09:45:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(
      await resolveLitterCareTaskCore({
        taskId: cancelled.taskId,
        clientCommandId: ids.cancelledResolutionCommand,
        resolutionStatus: "cancelled",
        resolvedAt: "2026-07-19T10:00:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
    ).toMatchObject({ outcome: "success", status: "cancelled" });
    expect(
      await resolveLitterCareTaskCore({
        taskId: notApplicable.taskId,
        clientCommandId: ids.notApplicableResolutionCommand,
        resolutionStatus: "not_applicable",
        resolvedAt: "2026-07-19T10:30:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
    ).toMatchObject({ outcome: "success", status: "not_applicable" });

    const concurrentResolution = await createLitterCareTaskCore(
      manualInput(`${prefix}59`, "2026-07-29"),
      owner,
    );
    if (concurrentResolution.outcome !== "success") throw new Error("Concurrent resolution fixture failed");
    const concurrentResolutionResults = await Promise.all([
      resolveLitterCareTaskCore({
        taskId: concurrentResolution.taskId,
        clientCommandId: ids.concurrentResolutionCommand,
        resolutionStatus: "done",
        resolvedAt: "2026-07-19T11:00:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
      resolveLitterCareTaskCore({
        taskId: concurrentResolution.taskId,
        clientCommandId: ids.concurrentResolutionCommand,
        resolutionStatus: "done",
        resolvedAt: "2026-07-19T11:00:00.000Z",
        timezoneName: "Europe/Paris",
      }, ownerSecondClient),
    ]);
    expect(concurrentResolutionResults.every((result) => result.outcome === "success")).toBe(true);
    expect(
      Number(sql(`select count(*) from public.litter_care_tasks
        where resolution_command_id = ${q(ids.concurrentResolutionCommand)}::uuid;`)),
    ).toBe(1);
    expect(
      await resolveLitterCareTaskCore({
        taskId: concurrentResolution.taskId,
        clientCommandId: `${prefix}66`,
        resolutionStatus: "cancelled",
        resolvedAt: "2026-07-19T11:05:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_planned" } });

    sql(`update public.litters set status = 'closed' where id = ${q(ids.mainLitter)}::uuid;`);
    expect(
      await resolveLitterCareTaskCore({
        taskId: closedResolution.taskId,
        clientCommandId: ids.closedResolutionCommand,
        resolutionStatus: "done",
        resolvedAt: "2026-07-19T12:00:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
    ).toMatchObject({ outcome: "success", status: "done" });
    const orderedAfterResolution = await listLitterCareTasksForLitterCore(
      { litterId: ids.mainLitter },
      owner,
    );
    if (orderedAfterResolution.outcome === "success") {
      const firstTerminalTask = orderedAfterResolution.tasks.find(
        (task) => task.status !== "planned",
      );
      expect(firstTerminalTask?.id).toBe(closedResolution.taskId);
    }
    for (const [litterId, commandId] of [
      [ids.closedLitter, `${prefix}92`],
      [ids.cancelledLitter, `${prefix}93`],
      [ids.notPregnantLitter, `${prefix}94`],
      [ids.archivedLitter, `${prefix}95`],
    ] as const) {
      expect(
        await createLitterCareTaskCore({ ...manualInput(commandId), litterId }, owner),
      ).toMatchObject({ outcome: "error", error: { code: "invalid_litter" } });
    }

    expect(
      await createLitterCareTaskCore(manualInput(`${prefix}75`), viewer),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(
      await resolveLitterCareTaskCore({
        taskId: ids.templateTask,
        clientCommandId: `${prefix}76`,
        resolutionStatus: "done",
        resolvedAt: "2026-07-19T12:30:00.000Z",
        timezoneName: "Europe/Paris",
      }, viewer),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    await expect(viewer.from("litter_care_tasks").insert({
      organization_id: organizationId,
      litter_id: ids.mainLitter,
      source: "manual",
      occurrence_no: 1,
      category: "preparation",
      target_scope: "litter",
      title: "Interdit",
      planned_for: "2026-07-20",
      status: "planned",
      creation_command_id: `${prefix}77`,
    })).resolves.toMatchObject({ error: expect.anything() });
    await expect(viewer.from("litter_care_tasks").update({ title: "Interdit" }).eq("id", ids.templateTask)).resolves.toMatchObject({ error: expect.anything() });
    await expect(viewer.from("litter_care_tasks").delete().eq("id", ids.templateTask)).resolves.toMatchObject({ error: expect.anything() });

    expect(
      await createLitterCareTaskCore({ ...manualInput(`${prefix}78`), litterId: ids.foreignLitter }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await resolveLitterCareTaskCore({
        taskId: ids.foreignTask,
        clientCommandId: `${prefix}79`,
        resolutionStatus: "done",
        resolvedAt: "2026-07-19T13:00:00.000Z",
        timezoneName: "Europe/Paris",
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const foreignLitterLock = runE2eSql(`select public.e2e_hold_foreign_litter_care_litter(${q(ids.foreignLitter)}::uuid);`);
    await delay(100);
    await expect(createLitterCareTaskCore({ ...manualInput(`${prefix}80`), litterId: ids.foreignLitter }, inactive)).resolves.toMatchObject({ outcome: "error", error: { code: "not_found" } });
    await foreignLitterLock;
    const foreignTaskLock = runE2eSql(`select public.e2e_hold_foreign_litter_care_task(${q(ids.foreignTask)}::uuid);`);
    await delay(100);
    await expect(resolveLitterCareTaskCore({
      taskId: ids.foreignTask,
      clientCommandId: `${prefix}81`,
      resolutionStatus: "done",
      resolvedAt: "2026-07-19T13:30:00.000Z",
      timezoneName: "Europe/Paris",
    }, inactive)).resolves.toMatchObject({ outcome: "error", error: { code: "not_found" } });
    await foreignTaskLock;

    expect(await createLitterCareTaskCore({ ...manualInput(`${prefix}82`), title: "" }, owner)).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    expect(await createLitterCareTaskCore({ ...manualInput(`${prefix}83`), plannedFor: "2026-02-30" }, owner)).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    expect(await resolveLitterCareTaskCore({
      taskId: ids.templateTask,
      clientCommandId: `${prefix}84`,
      resolutionStatus: "done",
      resolvedAt: "not-an-iso-date",
      timezoneName: "Invalid/Timezone",
    }, owner)).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });

    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
