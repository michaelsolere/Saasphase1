import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  createLitterCareTaskTemplateCore,
  listLitterCareTaskTemplatesForOrganizationCore,
  setLitterCareTaskTemplateActiveCore,
  updateLitterCareTaskTemplateCore,
  type CreateLitterCareTaskTemplateInput,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f180009-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E jalons 9f180009";

const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  snapshotTask: `${prefix}03`,
  orderedActiveA: `${prefix}10`,
  orderedActiveB: `${prefix}11`,
  orderedInactive: `${prefix}12`,
  foreignTemplate: `${prefix}13`,
  otherOrganization: `${prefix}20`,
  emptyOrganization: `${prefix}21`,
  emptyOrganizationMembership: `${prefix}22`,
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
  admin: ["template-admin@saasphase1.invalid", "TemplateAdmin-2026!"],
  member: ["template-member@saasphase1.invalid", "TemplateMember-2026!"],
  viewer: ["template-viewer@saasphase1.invalid", "TemplateViewer-2026!"],
  inactive: ["template-inactive@saasphase1.invalid", "TemplateInactive-2026!"],
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

function cleanup() {
  sql(`
    drop function if exists public.e2e_hold_litter_care_template(uuid);

    delete from public.litter_care_tasks
    where id::text like '9f180009-%'
       or litter_id::text like '9f180009-%'
       or creation_command_id::text like '9f180009-%'
       or resolution_command_id::text like '9f180009-%';

    do $$
    declare
      v_template_ids uuid[];
    begin
      select pg_catalog.array_agg(command.template_id)
      into v_template_ids
      from public.litter_care_task_template_commands command
      where command.client_command_id::text like '9f180009-%';

      delete from public.litter_care_task_template_commands
      where client_command_id::text like '9f180009-%'
         or id::text like '9f180009-%';

      delete from public.litter_care_task_templates
      where id::text like '9f180009-%'
         or id = any(coalesce(v_template_ids, array[]::uuid[]))
         or title like ${q(`${fixtureNamePrefix}%`)};
    end;
    $$;

    delete from public.litters
    where id::text like '9f180009-%'
       or name like ${q(`${fixtureNamePrefix}%`)};
    delete from public.animals where id::text like '9f180009-%';
    delete from public.memberships where id::text like '9f180009-%';
    delete from auth.identities where user_id::text like '9f180009-%';
    delete from auth.users where id::text like '9f180009-%';
    delete from public.organizations where id::text like '9f180009-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'commands', (
        select count(*) from public.litter_care_task_template_commands
        where client_command_id::text like '9f180009-%'
           or id::text like '9f180009-%'
      ),
      'tasks', (
        select count(*) from public.litter_care_tasks
        where id::text like '9f180009-%'
           or litter_id::text like '9f180009-%'
           or creation_command_id::text like '9f180009-%'
           or resolution_command_id::text like '9f180009-%'
      ),
      'templates', (
        select count(*) from public.litter_care_task_templates
        where id::text like '9f180009-%'
           or title like ${q(`${fixtureNamePrefix}%`)}
      ),
      'litters', (
        select count(*) from public.litters
        where id::text like '9f180009-%'
           or name like ${q(`${fixtureNamePrefix}%`)}
      ),
      'animals', (select count(*) from public.animals where id::text like '9f180009-%'),
      'memberships', (select count(*) from public.memberships where id::text like '9f180009-%'),
      'profiles', (select count(*) from public.profiles where id::text like '9f180009-%'),
      'auth_identities', (select count(*) from auth.identities where user_id::text like '9f180009-%'),
      'auth_users', (select count(*) from auth.users where id::text like '9f180009-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9f180009-%'),
      'temporary_functions', (
        select count(*)
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname = 'e2e_hold_litter_care_template'
      )
    )::text;
  `)) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function scopedCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'litter_care_tasks', (select count(*) from public.litter_care_tasks),
      'events', (select count(*) from public.events),
      'maternal_observations', (select count(*) from public.maternal_observations),
      'notes', (select count(*) from public.notes),
      'documents', (select count(*) from public.documents),
      'payments', (select count(*) from public.payments),
      'animals', (select count(*) from public.animals)
    )::text;
  `)) as Record<string, number>;
}

function createFixtures() {
  const authUsers = [
    [ids.adminUser, credentials.admin[0], credentials.admin[1], "Admin modèles E2E"],
    [ids.memberUser, credentials.member[0], credentials.member[1], "Member modèles E2E"],
    [ids.viewerUser, credentials.viewer[0], credentials.viewer[1], "Viewer modèles E2E"],
    [ids.inactiveUser, credentials.inactive[0], credentials.inactive[1], "Inactive modèles E2E"],
  ] as const;
  const identities = [
    [ids.adminIdentity, ids.adminUser, credentials.admin[0]],
    [ids.memberIdentity, ids.memberUser, credentials.member[0]],
    [ids.viewerIdentity, ids.viewerUser, credentials.viewer[0]],
    [ids.inactiveIdentity, ids.inactiveUser, credentials.inactive[0]],
  ] as const;

  sql(`
    insert into public.organizations (id, name, slug) values
      (${q(ids.otherOrganization)}::uuid, 'Organisation étrangère modèles E2E', 'e2e-modeles-jalons-etrangers'),
      (${q(ids.emptyOrganization)}::uuid, 'Organisation vide modèles E2E', 'e2e-modeles-jalons-vide');

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
       'member', 'disabled', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.emptyOrganizationMembership)}::uuid, ${q(ids.emptyOrganization)}::uuid, ${q(ownerId)}::uuid,
       'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values (
      ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} mère`)}, 'dog', 'Golden Retriever', 'female',
      'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      actual_birth_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid,
      ${q(`${fixtureNamePrefix} portée`)}, 'dog', 'Golden Retriever',
      ${q(ids.mother)}::uuid, 'born', '2026-07-18', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, is_active, sort_order,
      created_by, updated_by
    ) values
      (${q(ids.orderedActiveA)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Alpha`)}, 'Snapshot initial.', 'offspring_weight', 'all_offspring',
       'actual_birth', 3, 'dog', 'Golden Retriever', true, 5, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.orderedActiveB)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Bêta`)}, null, 'preparation', 'litter',
       'expected_birth', -2, 'dog', null, true, 5, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.orderedInactive)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} Inactif`)}, null, 'other', 'organization',
       'first_mating', -10, 'cat', null, false, 0, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignTemplate)}::uuid, ${q(ids.otherOrganization)}::uuid,
       ${q(`${fixtureNamePrefix} Étranger`)}, null, 'preparation', 'litter',
       'expected_birth', 0, 'dog', null, true, 0, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, organization_template_id,
      occurrence_no, category, target_scope, title, description,
      anchor_type, anchor_date, offset_days, planned_for, status,
      creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.snapshotTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
      'organization_template', ${q(ids.orderedActiveA)}::uuid, 1,
      'offspring_weight', 'all_offspring', ${q(`${fixtureNamePrefix} Alpha`)}, 'Snapshot initial.',
      'actual_birth', '2026-07-18', 3, '2026-07-21', 'planned',
      ${q(command(98))}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    create or replace function public.e2e_hold_litter_care_template(p_template_id uuid)
    returns void language plpgsql as $$
    begin
      perform 1 from public.litter_care_task_templates where id = p_template_id for update;
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

function templateInput(
  clientCommandId: string,
  overrides: Partial<CreateLitterCareTaskTemplateInput> = {},
): CreateLitterCareTaskTemplateInput {
  return {
    organizationId,
    clientCommandId,
    title: `${fixtureNamePrefix} créé ${clientCommandId.slice(-2)}`,
    description: "Description du jalon.",
    category: "maternal_health",
    targetScope: "mother",
    anchorType: "expected_birth",
    offsetDays: -4,
    species: "dog",
    breed: "Golden Retriever",
    sortOrder: 20,
    ...overrides,
  };
}

test("fonde la gestion sûre et idempotente des modèles de jalons", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const scopeBefore = scopedCounts();
    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecondClient = await createAuthenticatedSupabaseClient();
    const admin = await authenticatedClient(...credentials.admin);
    const member = await authenticatedClient(...credentials.member);
    const viewer = await authenticatedClient(...credentials.viewer);
    const inactive = await authenticatedClient(...credentials.inactive);

    const empty = await listLitterCareTaskTemplatesForOrganizationCore(
      { organizationId: ids.emptyOrganization },
      owner,
    );
    expect(empty).toEqual({ outcome: "success", role: "admin", templates: [] });

    for (const [client, role] of [
      [owner, "owner"],
      [admin, "admin"],
      [member, "member"],
      [viewer, "viewer"],
    ] as const) {
      const listed = await listLitterCareTaskTemplatesForOrganizationCore(
        { organizationId },
        client,
      );
      expect(listed).toMatchObject({ outcome: "success", role });
      if (listed.outcome === "success") {
        expect(listed.templates.slice(0, 3).map((template) => template.id)).toEqual([
          ids.orderedActiveA,
          ids.orderedActiveB,
          ids.orderedInactive,
        ]);
        expect(listed.templates.every((template) => template.revision === 1)).toBe(true);
      }
    }
    expect(
      await listLitterCareTaskTemplatesForOrganizationCore(
        { organizationId: ids.otherOrganization },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await listLitterCareTaskTemplatesForOrganizationCore({ organizationId }, inactive),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const taskCountBeforeCreation = Number(sql("select count(*) from public.litter_care_tasks;"));
    const completeCreateInput = templateInput(command(50), {
      title: `  ${fixtureNamePrefix} Complet  `,
      description: "  Description complète.  ",
      category: "socialization",
      targetScope: "all_offspring",
      anchorType: "offspring_age",
      offsetDays: 12,
      species: "cat",
      breed: "  Maine Coon  ",
      sortOrder: -8,
    });
    const created = await createLitterCareTaskTemplateCore(completeCreateInput, owner);
    expect(created).toMatchObject({
      outcome: "success",
      revision: 1,
      isActive: true,
      replayed: false,
    });
    if (created.outcome !== "success") throw new Error("Template creation failed");
    expect(JSON.parse(sql(`
      select json_build_object(
        'title', title, 'description', description, 'category', category,
        'target_scope', target_scope, 'anchor_type', anchor_type,
        'offset_days', offset_days, 'species', species, 'breed', breed,
        'sort_order', sort_order, 'is_active', is_active, 'revision', revision,
        'created_by', created_by, 'updated_by', updated_by
      )::text
      from public.litter_care_task_templates where id = ${q(created.templateId)}::uuid;
    `))).toEqual({
      title: `${fixtureNamePrefix} Complet`,
      description: "Description complète.",
      category: "socialization",
      target_scope: "all_offspring",
      anchor_type: "offspring_age",
      offset_days: 12,
      species: "cat",
      breed: "Maine Coon",
      sort_order: -8,
      is_active: true,
      revision: 1,
      created_by: ownerId,
      updated_by: ownerId,
    });
    expect(Number(sql("select count(*) from public.litter_care_tasks;"))).toBe(taskCountBeforeCreation);
    expect(
      await createLitterCareTaskTemplateCore(completeCreateInput, owner),
    ).toMatchObject({ outcome: "success", templateId: created.templateId, replayed: true });

    const concurrentCreateInput = templateInput(command(51));
    const concurrentCreates = await Promise.all([
      createLitterCareTaskTemplateCore(concurrentCreateInput, owner),
      createLitterCareTaskTemplateCore(concurrentCreateInput, ownerSecondClient),
    ]);
    expect(concurrentCreates.every((result) => result.outcome === "success")).toBe(true);
    expect(new Set(concurrentCreates.map((result) =>
      result.outcome === "success" ? result.templateId : "error",
    )).size).toBe(1);
    expect(Number(sql(`select count(*) from public.litter_care_task_template_commands
      where client_command_id = ${q(command(51))}::uuid;`))).toBe(1);

    const distinctCreates = await Promise.all([
      createLitterCareTaskTemplateCore(templateInput(command(52)), owner),
      createLitterCareTaskTemplateCore(templateInput(command(53)), ownerSecondClient),
    ]);
    expect(distinctCreates.every((result) => result.outcome === "success")).toBe(true);
    expect(new Set(distinctCreates.map((result) =>
      result.outcome === "success" ? result.templateId : "error",
    )).size).toBe(2);
    expect(
      await setLitterCareTaskTemplateActiveCore({
        templateId: created.templateId,
        clientCommandId: command(50),
        expectedRevision: 1,
        isActive: false,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const updated = await updateLitterCareTaskTemplateCore({
      templateId: created.templateId,
      clientCommandId: command(54),
      expectedRevision: 1,
      title: `  ${fixtureNamePrefix} Modifié  `,
      description: "  Nouvelle description.  ",
      category: "veterinary",
      targetScope: "organization",
      anchorType: "first_mating",
      offsetDays: -9,
      species: "dog",
      breed: "  Berger Australien  ",
      sortOrder: 3,
    }, owner);
    expect(updated).toMatchObject({ outcome: "success", revision: 2, replayed: false });
    expect(JSON.parse(sql(`
      select json_build_object(
        'title', title, 'description', description, 'category', category,
        'target_scope', target_scope, 'anchor_type', anchor_type,
        'offset_days', offset_days, 'species', species, 'breed', breed,
        'sort_order', sort_order, 'revision', revision, 'is_active', is_active,
        'updated_by', updated_by
      )::text from public.litter_care_task_templates
      where id = ${q(created.templateId)}::uuid;
    `))).toEqual({
      title: `${fixtureNamePrefix} Modifié`,
      description: "Nouvelle description.",
      category: "veterinary",
      target_scope: "organization",
      anchor_type: "first_mating",
      offset_days: -9,
      species: "dog",
      breed: "Berger Australien",
      sort_order: 3,
      revision: 2,
      is_active: true,
      updated_by: ownerId,
    });
    expect(
      await updateLitterCareTaskTemplateCore({
        ...templateInput(command(55)),
        templateId: created.templateId,
        expectedRevision: 1,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "stale_revision" } });
    expect(
      await updateLitterCareTaskTemplateCore({
        templateId: created.templateId,
        clientCommandId: command(54),
        expectedRevision: 1,
        title: "Ignoré au rejeu",
        description: null,
        category: "other",
        targetScope: "litter",
        anchorType: "actual_birth",
        offsetDays: 0,
        species: "cat",
        breed: null,
        sortOrder: 0,
      }, owner),
    ).toMatchObject({ outcome: "success", revision: 2, replayed: true });

    const sameCommandUpdateInput = {
      ...templateInput(command(56)),
      templateId: created.templateId,
      expectedRevision: 2,
    };
    const sameCommandUpdates = await Promise.all([
      updateLitterCareTaskTemplateCore(sameCommandUpdateInput, owner),
      updateLitterCareTaskTemplateCore(sameCommandUpdateInput, ownerSecondClient),
    ]);
    expect(sameCommandUpdates.every((result) => result.outcome === "success")).toBe(true);
    expect(sameCommandUpdates.map((result) =>
      result.outcome === "success" ? result.revision : 0,
    )).toEqual([3, 3]);

    const distinctUpdateRevision = 3;
    const distinctUpdates = await Promise.all([
      updateLitterCareTaskTemplateCore({
        ...templateInput(command(57), { title: `${fixtureNamePrefix} concurrent A` }),
        templateId: created.templateId,
        expectedRevision: distinctUpdateRevision,
      }, owner),
      updateLitterCareTaskTemplateCore({
        ...templateInput(command(58), { title: `${fixtureNamePrefix} concurrent B` }),
        templateId: created.templateId,
        expectedRevision: distinctUpdateRevision,
      }, ownerSecondClient),
    ]);
    expect(distinctUpdates.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(distinctUpdates.filter((result) =>
      result.outcome === "error" && result.error.code === "stale_revision",
    )).toHaveLength(1);
    const createdRevision = 4;
    expect(
      await updateLitterCareTaskTemplateCore({
        ...templateInput(command(56)),
        templateId: ids.orderedActiveB,
        expectedRevision: 1,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const deactivated = await setLitterCareTaskTemplateActiveCore({
      templateId: created.templateId,
      clientCommandId: command(59),
      expectedRevision: createdRevision,
      isActive: false,
    }, owner);
    expect(deactivated).toMatchObject({ outcome: "success", revision: 5, isActive: false });
    const reactivated = await setLitterCareTaskTemplateActiveCore({
      templateId: created.templateId,
      clientCommandId: command(60),
      expectedRevision: 5,
      isActive: true,
    }, owner);
    expect(reactivated).toMatchObject({ outcome: "success", revision: 6, isActive: true });
    const unchanged = await setLitterCareTaskTemplateActiveCore({
      templateId: created.templateId,
      clientCommandId: command(61),
      expectedRevision: 6,
      isActive: true,
    }, owner);
    expect(unchanged).toMatchObject({ outcome: "success", revision: 6, isActive: true });
    expect(
      await setLitterCareTaskTemplateActiveCore({
        templateId: created.templateId,
        clientCommandId: command(61),
        expectedRevision: 6,
        isActive: false,
      }, owner),
    ).toMatchObject({ outcome: "success", revision: 6, isActive: true, replayed: true });
    const concurrentActivationInput = {
      templateId: created.templateId,
      clientCommandId: command(62),
      expectedRevision: 6,
      isActive: false,
    };
    const concurrentActivations = await Promise.all([
      setLitterCareTaskTemplateActiveCore(concurrentActivationInput, owner),
      setLitterCareTaskTemplateActiveCore(concurrentActivationInput, ownerSecondClient),
    ]);
    expect(concurrentActivations.every((result) => result.outcome === "success")).toBe(true);
    expect(concurrentActivations.map((result) =>
      result.outcome === "success" ? result.revision : 0,
    )).toEqual([7, 7]);
    const listWithInactive = await listLitterCareTaskTemplatesForOrganizationCore(
      { organizationId },
      owner,
    );
    expect(listWithInactive.outcome === "success" &&
      listWithInactive.templates.some((template) =>
        template.id === created.templateId && !template.isActive && template.revision === 7,
      )).toBe(true);

    const snapshotUpdate = await updateLitterCareTaskTemplateCore({
      ...templateInput(command(63), {
        title: `${fixtureNamePrefix} Snapshot modèle changé`,
        description: "Description modèle changée.",
        category: "veterinary",
        targetScope: "mother",
        anchorType: "first_mating",
        offsetDays: -20,
        species: "cat",
        breed: null,
        sortOrder: 99,
      }),
      templateId: ids.orderedActiveA,
      expectedRevision: 1,
    }, owner);
    expect(snapshotUpdate).toMatchObject({ outcome: "success", revision: 2 });
    expect(
      await setLitterCareTaskTemplateActiveCore({
        templateId: ids.orderedActiveA,
        clientCommandId: command(64),
        expectedRevision: 2,
        isActive: false,
      }, owner),
    ).toMatchObject({ outcome: "success", revision: 3, isActive: false });
    expect(JSON.parse(sql(`
      select json_build_object(
        'title', title, 'description', description, 'category', category,
        'target_scope', target_scope, 'anchor_type', anchor_type,
        'anchor_date', anchor_date::text, 'offset_days', offset_days,
        'planned_for', planned_for::text
      )::text from public.litter_care_tasks where id = ${q(ids.snapshotTask)}::uuid;
    `))).toEqual({
      title: `${fixtureNamePrefix} Alpha`,
      description: "Snapshot initial.",
      category: "offspring_weight",
      target_scope: "all_offspring",
      anchor_type: "actual_birth",
      anchor_date: "2026-07-18",
      offset_days: 3,
      planned_for: "2026-07-21",
    });

    for (const invalidInput of [
      templateInput(command(70), { title: " " }),
      templateInput(command(71), { title: "x".repeat(256) }),
      templateInput(command(72), { description: "x".repeat(5001) }),
      templateInput(command(73), { category: "invalid" as "other" }),
      templateInput(command(74), { targetScope: "invalid" as "litter" }),
      templateInput(command(75), { anchorType: "invalid" as "actual_birth" }),
      templateInput(command(76), { species: "rabbit" as "dog" }),
      templateInput(command(77), { breed: " " }),
      templateInput(command(78), { breed: "x".repeat(256) }),
      templateInput(command(79), { anchorType: "offspring_age", offsetDays: -1 }),
      templateInput(command(80), { offsetDays: 2_147_483_648 }),
      templateInput(command(81), { sortOrder: -2_147_483_649 }),
    ]) {
      expect(
        await createLitterCareTaskTemplateCore(invalidInput, owner),
      ).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    }
    for (const expectedRevision of [0, -1, 2_147_483_648]) {
      expect(
        await setLitterCareTaskTemplateActiveCore({
          templateId: created.templateId,
          clientCommandId: command(82),
          expectedRevision,
          isActive: true,
        }, owner),
      ).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    }
    expect(
      await setLitterCareTaskTemplateActiveCore({
        templateId: created.templateId,
        clientCommandId: command(82),
        expectedRevision: 7,
        isActive: "false" as unknown as boolean,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });

    const directRpcInput = {
      p_organization_id: organizationId,
      p_client_command_id: command(83),
      p_title: "Titre SQL",
      p_description: null,
      p_category: "other",
      p_target_scope: "litter",
      p_anchor_type: "expected_birth",
      p_offset_days: 0,
      p_species: "dog",
      p_breed: null,
      p_sort_order: 0,
    } satisfies Database["public"]["Functions"]["create_litter_care_task_template"]["Args"];
    for (const invalidRpcValues of [
      { p_title: " " },
      { p_title: "x".repeat(256) },
      { p_description: "x".repeat(5001) },
      { p_category: "invalid" },
      { p_target_scope: "invalid" },
      { p_anchor_type: "invalid" },
      { p_species: "rabbit" },
      { p_breed: " " },
      { p_breed: "x".repeat(256) },
      { p_anchor_type: "offspring_age", p_offset_days: -1 },
    ]) {
      const directInvalid = await owner.rpc("create_litter_care_task_template", {
        ...directRpcInput,
        ...invalidRpcValues,
      });
      expect(directInvalid.error).toBeNull();
      expect(directInvalid.data?.[0]).toMatchObject({
        outcome: "error",
        reason: "invalid_input",
      });
    }

    for (const unauthorized of [member, viewer]) {
      expect(
        await createLitterCareTaskTemplateCore(templateInput(command(85)), unauthorized),
      ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
      expect(
        await updateLitterCareTaskTemplateCore({
          ...templateInput(command(86)),
          templateId: ids.orderedActiveB,
          expectedRevision: 1,
        }, unauthorized),
      ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
      expect(
        await setLitterCareTaskTemplateActiveCore({
          templateId: ids.orderedActiveB,
          clientCommandId: command(87),
          expectedRevision: 1,
          isActive: false,
        }, unauthorized),
      ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    }
    expect(
      await createLitterCareTaskTemplateCore(templateInput(command(88)), inactive),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await updateLitterCareTaskTemplateCore({
        ...templateInput(command(89)),
        templateId: ids.foreignTemplate,
        expectedRevision: 1,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await createLitterCareTaskTemplateCore(
        templateInput(command(93), { organizationId: ids.otherOrganization }),
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await setLitterCareTaskTemplateActiveCore({
        templateId: ids.foreignTemplate,
        clientCommandId: command(94),
        expectedRevision: 1,
        isActive: false,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    await expect(owner.from("litter_care_task_templates").insert({
      organization_id: organizationId,
      title: "Insertion directe interdite",
      category: "other",
      target_scope: "organization",
      anchor_type: "first_mating",
      offset_days: 0,
      species: "dog",
    })).resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_templates")
      .update({ title: "Modification directe interdite" })
      .eq("id", ids.orderedActiveB)).resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_templates")
      .delete().eq("id", ids.orderedActiveB)).resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_template_commands")
      .select("id")).resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_template_commands").insert({
      organization_id: organizationId,
      client_command_id: command(90),
      template_id: ids.orderedActiveB,
      operation: "create",
      result_revision: 1,
      result_is_active: true,
      created_by: ownerId,
    })).resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_template_commands")
      .update({ result_revision: 99 }).eq("client_command_id", command(50)))
      .resolves.toMatchObject({ error: expect.anything() });
    await expect(owner.from("litter_care_task_template_commands")
      .delete().eq("client_command_id", command(50)))
      .resolves.toMatchObject({ error: expect.anything() });

    const foreignLock = runE2eSql(
      `select public.e2e_hold_litter_care_template(${q(ids.foreignTemplate)}::uuid);`,
    );
    await delay(150);
    const unauthorizedStartedAt = Date.now();
    expect(
      await updateLitterCareTaskTemplateCore({
        ...templateInput(command(91)),
        templateId: ids.foreignTemplate,
        expectedRevision: 1,
      }, owner),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(Date.now() - unauthorizedStartedAt).toBeLessThan(1_500);
    await foreignLock;

    const adminCreated = await createLitterCareTaskTemplateCore(
      templateInput(command(92), { title: `${fixtureNamePrefix} Admin` }),
      admin,
    );
    expect(adminCreated).toMatchObject({ outcome: "success" });
    expect(scopedCounts()).toEqual(scopeBefore);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
