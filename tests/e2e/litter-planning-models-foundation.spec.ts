import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createLitterPlanningModelCore,
  getLitterPlanningModelCore,
  listLitterPlanningModelsCore,
  replaceLitterPlanningModelCore,
  setLitterPlanningModelActiveCore,
  type LitterPlanningModelItemInput,
} from "../../src/features/litter-journal/litter-planning-models-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

type Supabase = SupabaseClient<Database>;

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f240001-0000-4000-8000-0000000000";

const ids = {
  foreignOrganization: `${prefix}01`,
  foreignTemplate: `${prefix}02`,
  template: `${prefix}03`,
  schemaItem: `${prefix}04`,
  foreignItem: `${prefix}05`,
  catTemplate: `${prefix}06`,
  otherBreedTemplate: `${prefix}07`,
  genericDogTemplate: `${prefix}08`,
  missingModel: `${prefix}09`,
  adminUser: `${prefix}10`,
  adminIdentity: `${prefix}11`,
  adminMembership: `${prefix}12`,
  memberUser: `${prefix}13`,
  memberIdentity: `${prefix}14`,
  memberMembership: `${prefix}15`,
  viewerUser: `${prefix}16`,
  viewerIdentity: `${prefix}17`,
  viewerMembership: `${prefix}18`,
  inactiveUser: `${prefix}19`,
  inactiveIdentity: `${prefix}20`,
  inactiveMembership: `${prefix}21`,
  foreignUser: `${prefix}22`,
  foreignIdentity: `${prefix}23`,
  foreignMembership: `${prefix}24`,
} as const;

const credentials = {
  admin: ["planning-admin@saasphase1.invalid", "PlanningAdmin-2026!"],
  member: ["planning-member@saasphase1.invalid", "PlanningMember-2026!"],
  viewer: ["planning-viewer@saasphase1.invalid", "PlanningViewer-2026!"],
  inactive: ["planning-inactive@saasphase1.invalid", "PlanningInactive-2026!"],
  foreign: ["planning-foreign@saasphase1.invalid", "PlanningForeign-2026!"],
} as const;

const commandIds = new Set(
  Array.from({ length: 40 }, (_, index) => `${prefix}${String(index + 40).padStart(2, "0")}`),
);
const createdModelIds = new Set<string>();
const createdItemIds = new Set<string>();
const createdCommandIds = new Set<string>();
const templateIds = new Set([
  ids.template,
  ids.foreignTemplate,
  ids.catTemplate,
  ids.otherBreedTemplate,
  ids.genericDogTemplate,
]);

function command(suffix: number) {
  return `${prefix}${String(suffix).padStart(2, "0")}`;
}

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function uuidArray(values: Iterable<string>) {
  const entries = [...values].map((value) => `${q(value)}::uuid`);
  return entries.length > 0 ? `array[${entries.join(",")}]::uuid[]` : "array[]::uuid[]";
}

function cleanup() {
  sql(`
    delete from public.litter_planning_model_commands
    where id = any(${uuidArray(createdCommandIds)})
       or client_command_id = any(${uuidArray(commandIds)})
       or model_id = any(${uuidArray(createdModelIds)});

    delete from public.litter_planning_model_items
    where id = any(${uuidArray(createdItemIds)})
       or id in (${q(ids.schemaItem)}::uuid, ${q(ids.foreignItem)}::uuid)
       or model_id = any(${uuidArray(createdModelIds)});

    delete from public.litter_planning_models
    where id = any(${uuidArray(createdModelIds)});

    delete from public.litter_care_task_template_commands
    where template_id = any(${uuidArray(templateIds)});

    delete from public.litter_care_task_templates
    where id = any(${uuidArray(templateIds)});

    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships
    where id in (
      ${q(ids.adminMembership)}::uuid,
      ${q(ids.memberMembership)}::uuid,
      ${q(ids.viewerMembership)}::uuid,
      ${q(ids.inactiveMembership)}::uuid,
      ${q(ids.foreignMembership)}::uuid
    );
    alter table public.memberships enable trigger memberships_protect_owner;
    delete from auth.identities
    where id in (
      ${q(ids.adminIdentity)}::uuid,
      ${q(ids.memberIdentity)}::uuid,
      ${q(ids.viewerIdentity)}::uuid,
      ${q(ids.inactiveIdentity)}::uuid,
      ${q(ids.foreignIdentity)}::uuid
    );
    delete from auth.users
    where id in (
      ${q(ids.adminUser)}::uuid,
      ${q(ids.memberUser)}::uuid,
      ${q(ids.viewerUser)}::uuid,
      ${q(ids.inactiveUser)}::uuid,
      ${q(ids.foreignUser)}::uuid
    );
    delete from public.organizations
    where id = ${q(ids.foreignOrganization)}::uuid;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'commands', (
          select count(*) from public.litter_planning_model_commands
          where id = any(${uuidArray(createdCommandIds)})
             or client_command_id = any(${uuidArray(commandIds)})
             or model_id = any(${uuidArray(createdModelIds)})
        ),
        'items', (
          select count(*) from public.litter_planning_model_items
          where id = any(${uuidArray(createdItemIds)})
             or id in (${q(ids.schemaItem)}::uuid, ${q(ids.foreignItem)}::uuid)
             or model_id = any(${uuidArray(createdModelIds)})
        ),
        'models', (
          select count(*) from public.litter_planning_models
          where id = any(${uuidArray(createdModelIds)})
        ),
        'templates', (
          select count(*) from public.litter_care_task_templates
          where id = any(${uuidArray(templateIds)})
        ),
        'memberships', (
          select count(*) from public.memberships where id in (
            ${q(ids.adminMembership)}::uuid,
            ${q(ids.memberMembership)}::uuid,
            ${q(ids.viewerMembership)}::uuid,
            ${q(ids.inactiveMembership)}::uuid,
            ${q(ids.foreignMembership)}::uuid
          )
        ),
        'auth_identities', (
          select count(*) from auth.identities where id in (
            ${q(ids.adminIdentity)}::uuid,
            ${q(ids.memberIdentity)}::uuid,
            ${q(ids.viewerIdentity)}::uuid,
            ${q(ids.inactiveIdentity)}::uuid,
            ${q(ids.foreignIdentity)}::uuid
          )
        ),
        'auth_users', (
          select count(*) from auth.users where id in (
            ${q(ids.adminUser)}::uuid,
            ${q(ids.memberUser)}::uuid,
            ${q(ids.viewerUser)}::uuid,
            ${q(ids.inactiveUser)}::uuid,
            ${q(ids.foreignUser)}::uuid
          )
        ),
        'organization', (
          select count(*) from public.organizations
          where id = ${q(ids.foreignOrganization)}::uuid
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where organization_template_id = any(${uuidArray(templateIds)})
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
      '{"display_name":"Planning E2E"}'::jsonb, now(), now()
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

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.foreignOrganization)}::uuid,
      'E2E planning foreign',
      'e2e-planning-models-foreign'
    );

    ${authUserSql(ids.adminUser, ids.adminIdentity, ...credentials.admin)}
    ${authUserSql(ids.memberUser, ids.memberIdentity, ...credentials.member)}
    ${authUserSql(ids.viewerUser, ids.viewerIdentity, ...credentials.viewer)}
    ${authUserSql(ids.inactiveUser, ids.inactiveIdentity, ...credentials.inactive)}
    ${authUserSql(ids.foreignUser, ids.foreignIdentity, ...credentials.foreign)}

    insert into public.memberships (
      id, organization_id, profile_id, role, status, created_by, updated_by
    ) values
      (
        ${q(ids.adminMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.adminUser)}::uuid, 'admin', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.memberUser)}::uuid, 'member', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.viewerUser)}::uuid, 'viewer', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.inactiveMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.inactiveUser)}::uuid, 'member', 'disabled',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        ${q(ids.foreignUser)}::uuid, 'owner', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type,
      offset_days, species, breed, sort_order, revision, created_by, updated_by
    ) values
      (
        ${q(ids.template)}::uuid, ${q(organizationId)}::uuid,
        'E2E planning element', 'other', 'litter', 'expected_birth',
        0, 'dog', ' Golden Retriever ', 0, 1,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignTemplate)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        'E2E planning foreign element', 'other', 'litter', 'expected_birth',
        0, 'dog', null, 0, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.catTemplate)}::uuid, ${q(organizationId)}::uuid,
        'E2E planning cat element', 'other', 'litter', 'expected_birth',
        0, 'cat', null, 0, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.otherBreedTemplate)}::uuid, ${q(organizationId)}::uuid,
        'E2E planning other breed element', 'other', 'litter', 'expected_birth',
        0, 'dog', 'Labrador Retriever', 0, 1,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.genericDogTemplate)}::uuid, ${q(organizationId)}::uuid,
        'E2E planning generic dog element', 'other', 'litter', 'expected_birth',
        0, 'dog', null, 0, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
  `);
}

async function authenticatedClient(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return client;
}

function point(
  overrides: Partial<LitterPlanningModelItemInput> = {},
): LitterPlanningModelItemInput {
  return {
    organizationTemplateId: ids.genericDogTemplate,
    itemKind: "milestone",
    priority: "normal",
    anchorType: "expected_birth",
    pointOffsetDays: -2,
    pointLocalTime: "08:30",
    displayOrder: 0,
    isRequired: true,
    isSelectedByDefault: true,
    ...overrides,
  };
}

function windowItem(
  overrides: Partial<LitterPlanningModelItemInput> = {},
): LitterPlanningModelItemInput {
  return {
    organizationTemplateId: ids.template,
    itemKind: "window",
    priority: "important",
    anchorType: "actual_birth",
    windowStartsOffsetDays: 0,
    windowStartsLocalTime: "08:00",
    windowEndsOffsetDays: 1,
    windowEndsLocalTime: "18:00",
    displayOrder: 1,
    isRequired: false,
    isSelectedByDefault: false,
    ...overrides,
  };
}

async function expectDirectWritesRefused(client: Supabase, modelId: string) {
  const directModel = {
    organization_id: organizationId,
    title: "Direct model forbidden",
    created_by: ownerId,
    updated_by: ownerId,
  };
  expect((await client.from("litter_planning_models").insert(directModel)).error).not.toBeNull();
  const modelUpdate = await client
    .from("litter_planning_models")
    .update({ title: "Direct update" })
    .eq("id", modelId)
    .select("id");
  expect(modelUpdate.error !== null || modelUpdate.data?.length === 0).toBe(true);
  const modelDelete = await client
    .from("litter_planning_models")
    .delete()
    .eq("id", modelId)
    .select("id");
  expect(modelDelete.error !== null || modelDelete.data?.length === 0).toBe(true);

  const directItem = {
    organization_id: organizationId,
    model_id: modelId,
    organization_template_id: ids.template,
    item_kind: "task",
    priority: "normal",
    anchor_type: "expected_birth",
    point_offset_days: 0,
    display_order: 99,
    created_by: ownerId,
    updated_by: ownerId,
  };
  expect((await client.from("litter_planning_model_items").insert(directItem)).error).not.toBeNull();
  const itemUpdate = await client
    .from("litter_planning_model_items")
    .update({ display_order: 99 })
    .eq("model_id", modelId)
    .select("id");
  expect(itemUpdate.error !== null || itemUpdate.data?.length === 0).toBe(true);
  const itemDelete = await client
    .from("litter_planning_model_items")
    .delete()
    .eq("model_id", modelId)
    .select("id");
  expect(itemDelete.error !== null || itemDelete.data?.length === 0).toBe(true);
  expect(
    sql(`
      select count(*) from public.litter_planning_models
      where id=${q(modelId)}::uuid and title='Direct update';
    `),
  ).toBe("0");
  expect(
    Number(
      sql(`
        select count(*) from public.litter_planning_model_items
        where model_id=${q(modelId)}::uuid;
      `),
    ),
  ).toBeGreaterThan(0);
}

async function invalidRpc(
  owner: Supabase,
  clientCommandId: string,
  items: Json,
  taxonomy: { species?: string | null; breed?: string | null } = {},
) {
  const result = await owner.rpc("create_litter_planning_model", {
    p_organization_id: organizationId,
    p_client_command_id: clientCommandId,
    p_title: "Invalid payload must be atomic",
    p_description: null,
    p_species: taxonomy.species === undefined ? "dog" : taxonomy.species,
    p_breed: taxonomy.breed ?? null,
    p_is_active: true,
    p_items: items,
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]).toMatchObject({ outcome: "error", reason: "invalid_input" });
}

test("fonde les modèles composés de planning de façon sûre et atomique", async () => {
  cleanup();
  expectCleanupAtZero();

  try {
    createFixtures();
    const owner = await createAuthenticatedSupabaseClient();
    const ownerSecondClient = await createAuthenticatedSupabaseClient();
    const admin = await authenticatedClient(...credentials.admin);
    const member = await authenticatedClient(...credentials.member);
    const viewer = await authenticatedClient(...credentials.viewer);
    const inactive = await authenticatedClient(...credentials.inactive);
    const foreign = await authenticatedClient(...credentials.foreign);

    const modelIdsBeforeInvalid = new Set(
      JSON.parse(
        sql(`
          select coalesce(json_agg(id::text order by id), '[]'::json)::text
          from public.litter_planning_models
          where organization_id=${q(organizationId)}::uuid;
        `),
      ) as string[],
    );
    const itemCountBeforeInvalid = Number(
      sql(`select count(*) from public.litter_planning_model_items where organization_id=${q(organizationId)}::uuid;`),
    );

    await invalidRpc(owner, command(40), [{}]);
    await invalidRpc(owner, command(41), [{ ...point(), extraField: true }]);
    await invalidRpc(owner, command(42), [{ ...point(), organizationTemplateId: "not-a-uuid" }]);
    await invalidRpc(owner, command(43), [{ ...point(), pointOffsetDays: 2147483648 }]);
    await invalidRpc(owner, command(44), [{ ...point(), pointLocalTime: "25:00" }]);
    await invalidRpc(owner, command(45), [
      {
        ...point(),
        windowStartsOffsetDays: 0,
        windowEndsOffsetDays: 1,
      },
    ]);
    await invalidRpc(owner, command(46), [
      { ...windowItem(), windowStartsOffsetDays: 2, windowEndsOffsetDays: 1 },
    ]);
    await invalidRpc(owner, command(47), [
      { ...point(), isSelectedByDefault: false },
    ]);
    await invalidRpc(owner, command(48), [
      point(),
      point({ displayOrder: 0 }),
    ]);
    await invalidRpc(owner, command(49), [
      point({ organizationTemplateId: ids.foreignTemplate }),
    ]);
    await invalidRpc(owner, command(60), [
      {
        ...windowItem(),
        windowStartsOffsetDays: 0,
        windowStartsLocalTime: "18:00",
        windowEndsOffsetDays: 0,
        windowEndsLocalTime: "08:00",
      },
    ]);
    await invalidRpc(
      owner,
      command(61),
      Array.from({ length: 101 }, (_, displayOrder) => ({
        ...point(),
        displayOrder,
      })),
    );
    await invalidRpc(owner, command(62), [
      { ...point(), isRequired: "true" },
    ]);
    await invalidRpc(owner, command(63), [
      { ...point(), pointOffsetDays: "1" },
    ]);
    await invalidRpc(
      owner,
      command(70),
      [point({ organizationTemplateId: ids.catTemplate })],
      { species: "dog" },
    );
    await invalidRpc(
      owner,
      command(71),
      [point({ organizationTemplateId: ids.otherBreedTemplate })],
      { species: "dog", breed: "Golden Retriever" },
    );
    await invalidRpc(
      owner,
      command(72),
      [point()],
      { species: null, breed: "Golden Retriever" },
    );
    const modelIdsAfterInvalid = JSON.parse(
      sql(`
        select coalesce(json_agg(id::text order by id), '[]'::json)::text
        from public.litter_planning_models
        where organization_id=${q(organizationId)}::uuid;
      `),
    ) as string[];
    for (const modelId of modelIdsAfterInvalid) {
      if (!modelIdsBeforeInvalid.has(modelId)) createdModelIds.add(modelId);
    }
    expect(modelIdsAfterInvalid).toEqual([...modelIdsBeforeInvalid]);
    expect(
      Number(
        sql(`select count(*) from public.litter_planning_model_items where organization_id=${q(organizationId)}::uuid;`),
      ),
    ).toBe(itemCountBeforeInvalid);

    const creation = await createLitterPlanningModelCore(
      organizationId,
      command(50),
      {
        title: "E2E composed planning",
        species: "dog",
        breed: "Golden Retriever",
        items: [point(), windowItem()],
      },
      owner,
    );
    expect(creation).toMatchObject({ outcome: "success", revision: 1, replayed: false });
    if (creation.outcome !== "success") throw new Error("model creation failed");
    createdModelIds.add(creation.modelId);

    const itemIds = JSON.parse(
      sql(`
        select coalesce(json_agg(id::text order by display_order), '[]'::json)::text
        from public.litter_planning_model_items
        where model_id=${q(creation.modelId)}::uuid;
      `),
    ) as string[];
    for (const itemId of itemIds) createdItemIds.add(itemId);
    expect(
      itemIds,
      "a same-species generic task template must remain compatible with a breed planning model",
    ).toHaveLength(2);

    const incompatibleReplacement = await replaceLitterPlanningModelCore(
      creation.modelId,
      command(73),
      1,
      {
        title: "Incompatible replacement",
        species: "dog",
        breed: "Golden Retriever",
        items: [point({ organizationTemplateId: ids.catTemplate })],
      },
      owner,
    );
    expect(incompatibleReplacement).toMatchObject({
      outcome: "error",
      error: { code: "invalid_input" },
    });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'title', title,
            'revision', revision,
            'items', (
              select json_agg(item.id::text order by item.display_order)
              from public.litter_planning_model_items item
              where item.model_id=${q(creation.modelId)}::uuid
            )
          )::text
          from public.litter_planning_models
          where id=${q(creation.modelId)}::uuid;
        `),
      ),
    ).toEqual({
      title: "E2E composed planning",
      revision: 1,
      items: itemIds,
    });

    for (const [client, role] of [
      [owner, "owner"],
      [admin, "admin"],
      [member, "member"],
      [viewer, "viewer"],
    ] as const) {
      expect(await listLitterPlanningModelsCore(organizationId, client)).toMatchObject({
        outcome: "success",
        role,
      });
      expect(await getLitterPlanningModelCore(creation.modelId, client)).toMatchObject({
        outcome: "success",
        role,
      });
    }
    expect(await listLitterPlanningModelsCore(organizationId, inactive)).toMatchObject({
      outcome: "error",
      error: { code: "not_found" },
    });
    expect(await getLitterPlanningModelCore(creation.modelId, inactive)).toMatchObject({
      outcome: "error",
      error: { code: "not_found" },
    });
    expect(await getLitterPlanningModelCore(creation.modelId, foreign)).toMatchObject({
      outcome: "error",
      error: { code: "not_found" },
    });

    const adminMutation = await setLitterPlanningModelActiveCore(
      creation.modelId,
      command(51),
      1,
      false,
      admin,
    );
    expect(adminMutation).toMatchObject({ outcome: "success", revision: 2 });
    for (const [client, suffix] of [
      [member, 52],
      [viewer, 53],
    ] as const) {
      expect(
        await setLitterPlanningModelActiveCore(
          creation.modelId,
          command(suffix),
          2,
          true,
          client,
        ),
      ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    }
    for (const [client, suffix] of [
      [inactive, 54],
      [foreign, 55],
    ] as const) {
      expect(
        await setLitterPlanningModelActiveCore(
          creation.modelId,
          command(suffix),
          2,
          true,
          client,
        ),
      ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    }
    expect(
      await setLitterPlanningModelActiveCore(
        ids.missingModel,
        command(74),
        1,
        true,
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const inaccessibleCreateInput = {
      title: "Inaccessible organization",
      species: "dog" as const,
      items: [point()],
    };
    expect(
      await createLitterPlanningModelCore(
        organizationId,
        command(75),
        inaccessibleCreateInput,
        inactive,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await createLitterPlanningModelCore(
        organizationId,
        command(76),
        inaccessibleCreateInput,
        foreign,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await createLitterPlanningModelCore(
        ids.foreignOrganization,
        command(77),
        {
          title: "Foreign organization hidden",
          species: "dog",
          items: [
            point({ organizationTemplateId: ids.foreignTemplate }),
          ],
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      sql(`
        select count(*) from public.litter_planning_model_commands
        where client_command_id in (
          ${q(command(52))}::uuid,
          ${q(command(53))}::uuid,
          ${q(command(54))}::uuid,
          ${q(command(55))}::uuid,
          ${q(command(73))}::uuid,
          ${q(command(74))}::uuid,
          ${q(command(75))}::uuid,
          ${q(command(76))}::uuid,
          ${q(command(77))}::uuid
        );
      `),
    ).toBe("0");

    const staleInput = { title: "Stale intent", items: [point()] };
    expect(
      await replaceLitterPlanningModelCore(
        creation.modelId,
        command(56),
        1,
        staleInput,
        owner,
      ),
    ).toMatchObject({
      outcome: "error",
      error: { code: "stale_revision" },
    });
    expect(
      await replaceLitterPlanningModelCore(
        creation.modelId,
        command(56),
        1,
        staleInput,
        owner,
      ),
    ).toMatchObject({
      outcome: "error",
      error: { code: "stale_revision" },
    });
    const staleReplay = await owner.rpc("replace_litter_planning_model", {
      p_model_id: creation.modelId,
      p_client_command_id: command(56),
      p_expected_revision: 1,
      p_title: staleInput.title,
      p_description: null,
      p_species: null,
      p_breed: null,
      p_items: JSON.parse(JSON.stringify(staleInput.items)) as Json,
    });
    expect(staleReplay.error).toBeNull();
    expect(staleReplay.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "stale_revision",
      replayed: true,
    });

    expect(
      await setLitterPlanningModelActiveCore(
        creation.modelId,
        command(57),
        2,
        true,
        owner,
      ),
    ).toMatchObject({ outcome: "success", revision: 3 });
    expect(
      await replaceLitterPlanningModelCore(
        creation.modelId,
        command(56),
        1,
        staleInput,
        owner,
      ),
    ).toMatchObject({
      outcome: "error",
      error: { code: "stale_revision" },
    });
    expect(
      await replaceLitterPlanningModelCore(
        creation.modelId,
        command(56),
        1,
        { title: "Different stale intent", items: [point()] },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const concurrent = await Promise.all([
      setLitterPlanningModelActiveCore(
        creation.modelId,
        command(58),
        3,
        false,
        owner,
      ),
      setLitterPlanningModelActiveCore(
        creation.modelId,
        command(59),
        3,
        false,
        ownerSecondClient,
      ),
    ]);
    expect(concurrent.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(
      concurrent.filter(
        (result) => result.outcome === "error" && result.error.code === "stale_revision",
      ),
    ).toHaveLength(1);

    await expectDirectWritesRefused(owner, creation.modelId);
    await expectDirectWritesRefused(admin, creation.modelId);

    expect(() =>
      sql(`
        insert into public.litter_planning_model_items (
          id, organization_id, model_id, organization_template_id,
          item_kind, priority, anchor_type, point_offset_days, display_order,
          is_required, is_selected_by_default, created_by, updated_by
        ) values (
          ${q(ids.schemaItem)}::uuid, ${q(organizationId)}::uuid, null,
          ${q(ids.template)}::uuid, 'task', 'normal', 'expected_birth',
          0, 98, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
        );
      `),
    ).toThrow();
    expect(() =>
      sql(`
        insert into public.litter_planning_model_items (
          id, organization_id, model_id, organization_template_id,
          item_kind, priority, anchor_type, point_offset_days, display_order,
          is_required, is_selected_by_default, created_by, updated_by
        ) values (
          ${q(ids.foreignItem)}::uuid, ${q(organizationId)}::uuid,
          ${q(creation.modelId)}::uuid, ${q(ids.foreignTemplate)}::uuid,
          'task', 'normal', 'expected_birth', 0, 97, true, true,
          ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
        );
      `),
    ).toThrow();

    const grants = JSON.parse(
      sql(`
        select coalesce(
          json_agg(json_build_object(
            'grantee', grantee,
            'privilege_type', privilege_type
          )),
          '[]'::json
        )::text
        from information_schema.role_table_grants
        where grantee in ('anon', 'authenticated')
          and table_schema='public'
          and table_name='litter_planning_model_commands';
      `),
    );
    expect(grants).toEqual([]);
    expect(
      sql(`
        select count(*) from pg_policies
        where schemaname='public'
          and tablename='litter_planning_model_commands';
      `),
    ).toBe("0");
    expect(
      sql(`
        select count(*) from public.litter_care_tasks
        where organization_template_id = any(${uuidArray(templateIds)});
      `),
    ).toBe("0");
    expect(
      sql(`
        select count(*) from public.litter_care_task_templates
        where id = any(${uuidArray(templateIds)});
      `),
    ).toBe(String(templateIds.size));

    const commandRows = JSON.parse(
      sql(`
        select coalesce(json_agg(id::text), '[]'::json)::text
        from public.litter_planning_model_commands
        where client_command_id = any(${uuidArray(commandIds)})
           or model_id = ${q(creation.modelId)}::uuid;
      `),
    ) as string[];
    for (const commandId of commandRows) createdCommandIds.add(commandId);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
