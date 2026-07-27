import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

type Supabase = SupabaseClient<Database>;

const prefix = "d7270002-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E planning import immutability d7270002";

const ids = {
  organization: `${prefix}01`,
  ownerUser: `${prefix}02`,
  ownerIdentity: `${prefix}03`,
  ownerMembership: `${prefix}04`,
  template: `${prefix}05`,
  importedModel: `${prefix}06`,
  importedItem: `${prefix}07`,
  importedSlot: `${prefix}08`,
  customModel: `${prefix}09`,
  customItem: `${prefix}10`,
  replaceCommand: `${prefix}11`,
  conflictCommand: `${prefix}12`,
  setActiveCommand: `${prefix}13`,
  customReplaceCommand: `${prefix}14`,
} as const;

const credentials = {
  owner: [
    "planning-import-immutability-owner@saasphase1.invalid",
    "PlanningImportImmutabilityOwner-2026!",
  ],
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function authUserSql(
  userId: string,
  identityId: string,
  email: string,
  password: string,
) {
  return `
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      ${q(userId)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', ${q(email)},
      extensions.crypt(${q(password)}, extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', ${q(fixtureNamePrefix)}),
      now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
      jsonb_build_object(
        'sub', ${q(userId)}, 'email', ${q(email)},
        'email_verified', true, 'phone_verified', false
      ),
      'email', now(), now()
    );
  `;
}

function cleanup() {
  sql(`
    delete from public.litter_planning_model_commands
    where organization_id = ${q(ids.organization)}::uuid
       or client_command_id in (
         ${q(ids.replaceCommand)}::uuid,
         ${q(ids.conflictCommand)}::uuid,
         ${q(ids.setActiveCommand)}::uuid,
         ${q(ids.customReplaceCommand)}::uuid
       )
       or model_id in (
         ${q(ids.importedModel)}::uuid,
         ${q(ids.customModel)}::uuid
       )
       or id::text like 'd7270002-%';

    delete from public.litter_planning_model_item_time_slots
    where organization_id = ${q(ids.organization)}::uuid
       or id = ${q(ids.importedSlot)}::uuid
       or id::text like 'd7270002-%';

    delete from public.litter_planning_model_items
    where organization_id = ${q(ids.organization)}::uuid
       or id in (${q(ids.importedItem)}::uuid, ${q(ids.customItem)}::uuid)
       or model_id in (
         ${q(ids.importedModel)}::uuid,
         ${q(ids.customModel)}::uuid
       )
       or id::text like 'd7270002-%';

    delete from public.litter_planning_models
    where organization_id = ${q(ids.organization)}::uuid
       or id in (${q(ids.importedModel)}::uuid, ${q(ids.customModel)}::uuid)
       or id::text like 'd7270002-%';

    delete from public.litter_care_task_template_commands
    where template_id = ${q(ids.template)}::uuid
       or organization_id = ${q(ids.organization)}::uuid;

    delete from public.litter_care_task_templates
    where id = ${q(ids.template)}::uuid
       or organization_id = ${q(ids.organization)}::uuid
       or id::text like 'd7270002-%';

    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships
    where id = ${q(ids.ownerMembership)}::uuid
       or organization_id = ${q(ids.organization)}::uuid
       or id::text like 'd7270002-%';
    alter table public.memberships enable trigger memberships_protect_owner;

    delete from public.profiles where id = ${q(ids.ownerUser)}::uuid or id::text like 'd7270002-%';
    delete from auth.identities
    where id = ${q(ids.ownerIdentity)}::uuid
       or user_id = ${q(ids.ownerUser)}::uuid
       or user_id::text like 'd7270002-%';
    delete from auth.users
    where id = ${q(ids.ownerUser)}::uuid or id::text like 'd7270002-%';
    delete from public.organizations
    where id = ${q(ids.organization)}::uuid or id::text like 'd7270002-%';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'commands', (
          select count(*) from public.litter_planning_model_commands
          where organization_id = ${q(ids.organization)}::uuid
             or client_command_id in (
               ${q(ids.replaceCommand)}::uuid,
               ${q(ids.conflictCommand)}::uuid,
               ${q(ids.setActiveCommand)}::uuid,
               ${q(ids.customReplaceCommand)}::uuid
             )
             or model_id in (
               ${q(ids.importedModel)}::uuid,
               ${q(ids.customModel)}::uuid
             )
             or id::text like 'd7270002-%'
        ),
        'slots', (
          select count(*) from public.litter_planning_model_item_time_slots
          where organization_id = ${q(ids.organization)}::uuid
             or id = ${q(ids.importedSlot)}::uuid
             or id::text like 'd7270002-%'
        ),
        'items', (
          select count(*) from public.litter_planning_model_items
          where organization_id = ${q(ids.organization)}::uuid
             or id in (${q(ids.importedItem)}::uuid, ${q(ids.customItem)}::uuid)
             or model_id in (
               ${q(ids.importedModel)}::uuid,
               ${q(ids.customModel)}::uuid
             )
             or id::text like 'd7270002-%'
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where organization_id = ${q(ids.organization)}::uuid
             or id in (${q(ids.importedModel)}::uuid, ${q(ids.customModel)}::uuid)
             or id::text like 'd7270002-%'
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id = ${q(ids.template)}::uuid
             or organization_id = ${q(ids.organization)}::uuid
             or id::text like 'd7270002-%'
        ),
        'memberships', (
          select count(*) from public.memberships
          where id = ${q(ids.ownerMembership)}::uuid
             or organization_id = ${q(ids.organization)}::uuid
             or id::text like 'd7270002-%'
        ),
        'profiles', (
          select count(*) from public.profiles
          where id = ${q(ids.ownerUser)}::uuid or id::text like 'd7270002-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities
          where id = ${q(ids.ownerIdentity)}::uuid
             or user_id = ${q(ids.ownerUser)}::uuid
             or user_id::text like 'd7270002-%'
        ),
        'auth_users', (
          select count(*) from auth.users
          where id = ${q(ids.ownerUser)}::uuid or id::text like 'd7270002-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id = ${q(ids.organization)}::uuid or id::text like 'd7270002-%'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.organization)}::uuid,
      ${q(fixtureNamePrefix)},
      'e2e-planning-import-immutability-d7270002'
    );

    ${authUserSql(ids.ownerUser, ids.ownerIdentity, ...credentials.owner)}

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values (
      ${q(ids.ownerMembership)}::uuid, ${q(ids.organization)}::uuid,
      ${q(ids.ownerUser)}::uuid, 'owner', 'active',
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type,
      offset_days, species, breed, sort_order, revision, created_by, updated_by
    ) values (
      ${q(ids.template)}::uuid, ${q(ids.organization)}::uuid,
      ${q(`${fixtureNamePrefix} template`)}, 'other', 'litter', 'expected_birth',
      0, 'dog', null, 0, 1,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );

    insert into public.litter_planning_models (
      id, organization_id, title, description, species, breed, is_active,
      revision, library_model_code, library_model_version, created_by, updated_by
    ) values (
      ${q(ids.importedModel)}::uuid, ${q(ids.organization)}::uuid,
      ${q(`${fixtureNamePrefix} imported`)},
      'Description importée',
      'dog', null, true, 1,
      'dog-gestation-standard', 1,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    ), (
      ${q(ids.customModel)}::uuid, ${q(ids.organization)}::uuid,
      ${q(`${fixtureNamePrefix} custom`)},
      'Description personnalisée',
      'dog', null, true, 1,
      null, null,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );

    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id, item_kind,
      priority, anchor_type, recurrence_kind, recurrence_interval_days,
      recurrence_starts_offset_days, recurrence_end_kind, recurrence_day_count,
      initial_materialization_horizon_days, absolute_max_occurrences,
      display_order, is_required, is_selected_by_default, created_by, updated_by
    ) values (
      ${q(ids.importedItem)}::uuid, ${q(ids.organization)}::uuid,
      ${q(ids.importedModel)}::uuid, ${q(ids.template)}::uuid, 'recurring_task',
      'normal', 'expected_birth', 'daily_interval', 1, 0,
      'fixed_recurrence_day_count', 7, 7, 30, 0, true, true,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );

    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id, item_kind,
      priority, anchor_type, point_offset_days, display_order, is_required,
      is_selected_by_default, created_by, updated_by
    ) values (
      ${q(ids.customItem)}::uuid, ${q(ids.organization)}::uuid,
      ${q(ids.customModel)}::uuid, ${q(ids.template)}::uuid, 'task',
      'normal', 'expected_birth', 0, 0, false, true,
      ${q(ids.ownerUser)}::uuid, ${q(ids.ownerUser)}::uuid
    );

    insert into public.litter_planning_model_item_time_slots (
      id, organization_id, model_item_id, slot_no, local_time, created_by
    ) values (
      ${q(ids.importedSlot)}::uuid, ${q(ids.organization)}::uuid,
      ${q(ids.importedItem)}::uuid, 1, '08:00', ${q(ids.ownerUser)}::uuid
    );
  `);
}

async function signInOwner(): Promise<Supabase> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.owner[0],
    password: credentials.owner[1],
  });
  if (error) {
    throw new Error(`Unable to authenticate owner: ${error.message}`);
  }
  return supabase;
}

function modelSnapshot(modelId: string) {
  return JSON.parse(
    sql(`
      select json_build_object(
        'title', model.title,
        'description', model.description,
        'species', model.species,
        'breed', model.breed,
        'is_active', model.is_active,
        'revision', model.revision,
        'library_model_code', model.library_model_code,
        'library_model_version', model.library_model_version,
        'items', coalesce((
          select json_agg(
            json_build_object(
              'id', item.id,
              'item_kind', item.item_kind,
              'display_order', item.display_order,
              'time_slots', coalesce((
                select json_agg(to_char(slot.local_time, 'HH24:MI') order by slot.slot_no)
                from public.litter_planning_model_item_time_slots slot
                where slot.model_item_id = item.id
              ), '[]'::json)
            )
            order by item.display_order
          )
          from public.litter_planning_model_items item
          where item.model_id = model.id
        ), '[]'::json)
      )::text
      from public.litter_planning_models model
      where model.id = ${q(modelId)}::uuid;
    `),
  );
}

function replaceItemsPayload(templateId: string): Json {
  return [
    {
      organizationTemplateId: templateId,
      itemKind: "task",
      priority: "important",
      anchorType: "expected_birth",
      pointOffsetDays: 3,
      displayOrder: 0,
      isRequired: false,
      isSelectedByDefault: true,
    },
  ] as unknown as Json;
}

function importedReplaceArgs(overrides?: Record<string, unknown>) {
  return {
    p_model_id: ids.importedModel,
    p_client_command_id: ids.replaceCommand,
    p_expected_revision: 1,
    p_title: "Tentative de contournement",
    p_description: "Ne doit pas persister",
    p_species: "dog",
    p_breed: null,
    p_items: replaceItemsPayload(ids.template),
    ...overrides,
  };
}

test("RPC — immutabilité des modèles importés", async () => {
  cleanup();
  expectCleanupAtZero();
  createFixtures();

  try {
    const owner = await signInOwner();
    const before = modelSnapshot(ids.importedModel);
    expect(before.library_model_code).toBe("dog-gestation-standard");
    expect(before.library_model_version).toBe(1);
    expect(before.items).toHaveLength(1);
    expect(before.items[0].time_slots).toEqual(["08:00"]);
    expect(before.revision).toBe(1);
    expect(before.is_active).toBe(true);

    const replaceArgs = importedReplaceArgs();

    const refused = await owner.rpc("replace_litter_planning_model", replaceArgs);
    expect(refused.error).toBeNull();
    expect(refused.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "imported_model_immutable",
      replayed: false,
      revision: 1,
      is_active: true,
      model_id: ids.importedModel,
    });

    expect(modelSnapshot(ids.importedModel)).toEqual(before);

    const replay = await owner.rpc("replace_litter_planning_model", replaceArgs);
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "imported_model_immutable",
      replayed: true,
      revision: 1,
      is_active: true,
      model_id: ids.importedModel,
    });
    expect(modelSnapshot(ids.importedModel)).toEqual(before);

    const conflict = await owner.rpc(
      "replace_litter_planning_model",
      importedReplaceArgs({ p_title: "Autre payload conflictuel" }),
    );
    expect(conflict.error).toBeNull();
    expect(conflict.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "client_command_conflict",
      replayed: false,
    });
    expect(modelSnapshot(ids.importedModel)).toEqual(before);

    const commandCount = Number(
      sql(`
        select count(*) from public.litter_planning_model_commands
        where client_command_id = ${q(ids.replaceCommand)}::uuid
          and outcome = 'error'
          and reason = 'imported_model_immutable';
      `),
    );
    expect(commandCount).toBe(1);

    const deactivated = await owner.rpc("set_litter_planning_model_active", {
      p_model_id: ids.importedModel,
      p_client_command_id: ids.setActiveCommand,
      p_expected_revision: 1,
      p_is_active: false,
    });
    expect(deactivated.error).toBeNull();
    expect(deactivated.data?.[0]).toMatchObject({
      outcome: "success",
      replayed: false,
      is_active: false,
      revision: 2,
    });
    const afterActive = modelSnapshot(ids.importedModel);
    expect(afterActive.is_active).toBe(false);
    expect(afterActive.revision).toBe(2);
    expect(afterActive.title).toBe(before.title);
    expect(afterActive.description).toBe(before.description);
    expect(afterActive.species).toBe(before.species);
    expect(afterActive.breed).toBe(before.breed);
    expect(afterActive.items).toEqual(before.items);

    const customBefore = modelSnapshot(ids.customModel);
    const customReplace = await owner.rpc("replace_litter_planning_model", {
      p_model_id: ids.customModel,
      p_client_command_id: ids.customReplaceCommand,
      p_expected_revision: 1,
      p_title: `${fixtureNamePrefix} custom replaced`,
      p_description: "Remplacé",
      p_species: "dog",
      p_breed: null,
      p_items: replaceItemsPayload(ids.template),
    });
    expect(customReplace.error).toBeNull();
    expect(customReplace.data?.[0]).toMatchObject({
      outcome: "success",
      replayed: false,
      revision: 2,
    });
    const customAfter = modelSnapshot(ids.customModel);
    expect(customAfter.title).toBe(`${fixtureNamePrefix} custom replaced`);
    expect(customAfter.revision).toBe(2);
    expect(customAfter.library_model_code).toBeNull();
    expect(customAfter.items).toHaveLength(1);
    expect(customAfter.items[0].item_kind).toBe("task");
    expect(customBefore.revision).toBe(1);
  } finally {
    cleanup();
    expectCleanupAtZero();
    // Keep the seed owner session usable for other managed specs.
    await createAuthenticatedSupabaseClient().catch(() => undefined);
  }
});
