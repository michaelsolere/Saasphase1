import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  importLitterCareTaskLibraryTemplatesCore,
  listLitterCareTaskLibraryCore,
  setLitterCareTaskTemplateActiveCore,
  updateLitterCareTaskTemplateCore,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f190001-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E bibliothèque jalons 9f190001";
const versionedPackCode = "e2e-litter-care-versioned-pack";
const versionedTemplateCode = "e2e-litter-care-versioned";
const unavailableTemplateCode = "e2e-litter-care-unavailable-template";
const unavailablePackCode = "e2e-litter-care-unavailable-pack";
const unavailablePackTemplateCode = "e2e-litter-care-unavailable-pack-template";

const ids = {
  otherOrganization: `${prefix}20`,
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
  admin: ["library-admin@saasphase1.invalid", "LibraryAdmin-2026!"],
  member: ["library-member@saasphase1.invalid", "LibraryMember-2026!"],
  viewer: ["library-viewer@saasphase1.invalid", "LibraryViewer-2026!"],
  inactive: ["library-inactive@saasphase1.invalid", "LibraryInactive-2026!"],
} as const;

const productPacks = [
  {
    code: "dog-gestation-preparation",
    title: "Gestation et préparation",
    species: "dog",
    sort_order: 10,
    is_available: true,
  },
  {
    code: "dog-birth-first-days",
    title: "Naissance et premiers jours",
    species: "dog",
    sort_order: 20,
    is_available: true,
  },
  {
    code: "dog-growth-departure",
    title: "Croissance et préparation des départs",
    species: "dog",
    sort_order: 30,
    is_available: true,
  },
] as const;

const productTemplates = [
  ["dog-confirm-pregnancy", "Confirmer la gestation", "veterinary", "litter", "estimated_ovulation", 28, 10, "dog-gestation-preparation"],
  ["dog-plan-litter-count-xray", "Planifier la radiographie de comptage", "veterinary", "litter", "estimated_ovulation", 55, 20, "dog-gestation-preparation"],
  ["dog-prepare-whelping-area", "Préparer l’espace de mise-bas", "preparation", "organization", "expected_birth", -14, 30, "dog-gestation-preparation"],
  ["dog-check-whelping-equipment", "Vérifier le matériel de mise-bas", "preparation", "organization", "expected_birth", -7, 40, "dog-gestation-preparation"],
  ["dog-start-temperature-monitoring", "Démarrer les relevés de température", "maternal_health", "mother", "expected_birth", -7, 50, "dog-gestation-preparation"],
  ["dog-check-emergency-protocol", "Vérifier le protocole et les contacts d’urgence", "preparation", "organization", "expected_birth", -7, 60, "dog-gestation-preparation"],
  ["dog-prepare-whelping-journal", "Préparer le Journal de mise-bas", "preparation", "litter", "expected_birth", -2, 70, "dog-gestation-preparation"],
  ["dog-complete-birth-summary", "Compléter la synthèse de mise-bas", "reproduction", "litter", "actual_birth", 0, 80, "dog-birth-first-days"],
  ["dog-record-birth-weights", "Enregistrer les poids de naissance", "offspring_weight", "all_offspring", "actual_birth", 0, 90, "dog-birth-first-days"],
  ["dog-check-provisional-identification", "Vérifier l’identification provisoire de chaque chiot", "identification", "all_offspring", "actual_birth", 1, 100, "dog-birth-first-days"],
  ["dog-check-mother-postpartum", "Contrôler l’état post-partum de la mère", "maternal_health", "mother", "actual_birth", 1, 110, "dog-birth-first-days"],
  ["dog-check-litter-general-condition", "Contrôler l’état général de la portée", "offspring_health", "all_offspring", "actual_birth", 1, 120, "dog-birth-first-days"],
  ["dog-open-socialization-checklist", "Ouvrir la checklist de socialisation", "socialization", "all_offspring", "offspring_age", 21, 130, "dog-growth-departure"],
  ["dog-prepare-identification-visit", "Préparer la visite vétérinaire d’identification", "identification", "all_offspring", "offspring_age", 49, 140, "dog-growth-departure"],
  ["dog-prepare-puppy-departures", "Préparer les départs des chiots", "preparation", "litter", "offspring_age", 49, 150, "dog-growth-departure"],
] as const;

const importedProductCodes = [
  "dog-confirm-pregnancy",
  "dog-prepare-whelping-area",
  "dog-complete-birth-summary",
  "dog-record-birth-weights",
  "dog-check-provisional-identification",
];

function command(suffix: number) {
  return `${prefix}${String(suffix).padStart(2, "0")}`;
}

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    do $$
    declare
      v_template_ids uuid[];
    begin
      select pg_catalog.array_agg(distinct (item.value ->> 'templateId')::uuid)
      into v_template_ids
      from public.litter_care_task_library_import_commands command
      cross join lateral jsonb_array_elements(command.result) item(value)
      where command.client_command_id::text like '9f190001-%'
         or command.id::text like '9f190001-%';

      delete from public.litter_care_tasks
      where organization_template_id = any(coalesce(v_template_ids, array[]::uuid[]));

      delete from public.litter_care_task_template_commands
      where client_command_id::text like '9f190001-%'
         or id::text like '9f190001-%'
         or template_id = any(coalesce(v_template_ids, array[]::uuid[]));

      delete from public.litter_care_task_library_import_commands
      where client_command_id::text like '9f190001-%'
         or id::text like '9f190001-%';

      delete from public.litter_care_task_templates
      where id = any(coalesce(v_template_ids, array[]::uuid[]))
         or (
           organization_id = ${q(organizationId)}::uuid
           and created_by in (
             ${q(ownerId)}::uuid,
             ${q(ids.adminUser)}::uuid
           )
           and library_template_code = any(array[
             ${[...importedProductCodes, versionedTemplateCode]
               .map((code) => `${q(code)}::text`)
               .join(",")}
           ])
         );
    end;
    $$;

    delete from public.litter_care_task_library_templates
    where code in (
      ${q(versionedTemplateCode)},
      ${q(unavailableTemplateCode)},
      ${q(unavailablePackTemplateCode)}
    );
    delete from public.litter_care_task_library_packs
    where code in (${q(versionedPackCode)}, ${q(unavailablePackCode)});

    delete from public.memberships where id::text like '9f190001-%';
    delete from auth.identities where user_id::text like '9f190001-%';
    delete from auth.users where id::text like '9f190001-%';
    delete from public.organizations where id::text like '9f190001-%';
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'import_commands', (
        select count(*) from public.litter_care_task_library_import_commands
        where client_command_id::text like '9f190001-%'
           or id::text like '9f190001-%'
      ),
      'template_commands', (
        select count(*) from public.litter_care_task_template_commands
        where client_command_id::text like '9f190001-%'
           or id::text like '9f190001-%'
      ),
      'organization_templates', (
        select count(*) from public.litter_care_task_templates
        where library_template_code in (
          ${[...importedProductCodes, versionedTemplateCode]
            .map(q)
            .join(",")}
        )
        and created_by in (${q(ownerId)}::uuid, ${q(ids.adminUser)}::uuid)
      ),
      'tasks', (
        select count(*) from public.litter_care_tasks
        where id::text like '9f190001-%'
           or creation_command_id::text like '9f190001-%'
           or resolution_command_id::text like '9f190001-%'
      ),
      'temporary_library_templates', (
        select count(*) from public.litter_care_task_library_templates
        where code in (
          ${q(versionedTemplateCode)},
          ${q(unavailableTemplateCode)},
          ${q(unavailablePackTemplateCode)}
        )
      ),
      'temporary_library_packs', (
        select count(*) from public.litter_care_task_library_packs
        where code in (${q(versionedPackCode)}, ${q(unavailablePackCode)})
      ),
      'memberships', (select count(*) from public.memberships where id::text like '9f190001-%'),
      'profiles', (select count(*) from public.profiles where id::text like '9f190001-%'),
      'auth_identities', (select count(*) from auth.identities where user_id::text like '9f190001-%'),
      'auth_users', (select count(*) from auth.users where id::text like '9f190001-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9f190001-%')
    )::text;
  `)) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingFixtureCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
  expect(Number(sql(`
    select count(*) from public.litter_care_task_library_packs
    where code like 'dog-%';
  `))).toBe(3);
  expect(Number(sql(`
    select count(*) from public.litter_care_task_library_templates
    where code like 'dog-%';
  `))).toBe(15);
}

function operationalCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'tasks', (select count(*) from public.litter_care_tasks),
      'events', (select count(*) from public.events),
      'notifications_relation', (
        select count(*) from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public' and relation.relname = 'notifications'
      )
    )::text;
  `)) as Record<string, number>;
}

function createFixtures() {
  const authUsers = [
    [ids.adminUser, credentials.admin[0], credentials.admin[1], "Admin bibliothèque E2E"],
    [ids.memberUser, credentials.member[0], credentials.member[1], "Member bibliothèque E2E"],
    [ids.viewerUser, credentials.viewer[0], credentials.viewer[1], "Viewer bibliothèque E2E"],
    [ids.inactiveUser, credentials.inactive[0], credentials.inactive[1], "Inactive bibliothèque E2E"],
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
      ${q(`${fixtureNamePrefix} autre organisation`)},
      'e2e-library-other-9f190001'
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

    insert into public.litter_care_task_library_packs (
      code, title, description, species, sort_order, is_available
    ) values
      (${q(versionedPackCode)}, 'Pack versionné E2E', null, 'dog', 900, true),
      (${q(unavailablePackCode)}, 'Pack indisponible E2E', null, 'dog', 910, false);

    insert into public.litter_care_task_library_templates (
      code, version, pack_code, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, sort_order, is_available
    ) values
      (
        ${q(versionedTemplateCode)}, 1, ${q(versionedPackCode)},
        'Version 1 E2E', 'Description version 1 E2E.', 'preparation', 'litter',
        'actual_birth', 2, 'dog', null, 900, true
      ),
      (
        ${q(unavailableTemplateCode)}, 1, ${q(versionedPackCode)},
        'Version indisponible E2E', null, 'other', 'organization',
        'actual_birth', 0, 'dog', null, 901, false
      ),
      (
        ${q(unavailablePackTemplateCode)}, 1, ${q(unavailablePackCode)},
        'Pack indisponible E2E', null, 'other', 'organization',
        'actual_birth', 0, 'dog', null, 910, true
      );
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

async function directImport(
  client: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>,
  commandId: string,
  selection: Json,
  isActive = true,
) {
  const response = await client.rpc("import_litter_care_task_library_templates", {
    p_organization_id: organizationId,
    p_client_command_id: commandId,
    p_selection: selection,
    p_is_active: isActive,
  });
  expect(response.error).toBeNull();
  return response.data?.[0];
}

test("fonde une bibliothèque globale versionnée et un import atomique", async () => {
  cleanup();
  expectCleanupAtZero();

  const initialOrganizationTemplateCount = Number(
    sql("select count(*) from public.litter_care_task_templates;"),
  );
  const initialTaskCount = Number(sql("select count(*) from public.litter_care_tasks;"));
  expect(initialOrganizationTemplateCount).toBe(0);
  expect(initialTaskCount).toBe(0);

  const packs = JSON.parse(sql(`
    select coalesce(json_agg(json_build_object(
      'code', code,
      'title', title,
      'species', species,
      'sort_order', sort_order,
      'is_available', is_available
    ) order by sort_order), '[]'::json)::text
    from public.litter_care_task_library_packs;
  `));
  expect(packs).toEqual(productPacks);

  const templates = JSON.parse(sql(`
    select coalesce(json_agg(json_build_array(
      code, title, category, target_scope, anchor_type, offset_days,
      sort_order, pack_code, version, species, breed, is_available
    ) order by sort_order), '[]'::json)::text
    from public.litter_care_task_library_templates;
  `));
  expect(templates).toEqual(
    productTemplates.map((template) => [...template, 1, "dog", null, true]),
  );
  expect(Number(sql("select count(*) from public.litter_care_task_templates;"))).toBe(0);
  expect(Number(sql("select count(*) from public.litter_care_tasks;"))).toBe(0);

  const createdTemplateIds: string[] = [];

  try {
    createFixtures();
    const operationalBefore = operationalCounts();
    expect(operationalBefore.notifications_relation).toBe(0);

    const owner = await createAuthenticatedSupabaseClient();
    const secondOwner = await createAuthenticatedSupabaseClient();
    const anonymous = createAnonymousSupabaseClient();
    const admin = await authenticatedClient(...credentials.admin);
    const member = await authenticatedClient(...credentials.member);
    const viewer = await authenticatedClient(...credentials.viewer);
    const inactive = await authenticatedClient(...credentials.inactive);

    for (const [client, role] of [
      [owner, "owner"],
      [admin, "admin"],
      [member, "member"],
      [viewer, "viewer"],
    ] as const) {
      const listed = await listLitterCareTaskLibraryCore(
        { organizationId },
        client,
      );
      expect(listed).toMatchObject({ outcome: "success", role });
      if (listed.outcome === "success") {
        expect(listed.packs.slice(0, 3).map((pack) => pack.code)).toEqual(
          productPacks.map((pack) => pack.code),
        );
        expect(listed.templates.slice(0, 15).map((template) => template.code)).toEqual(
          productTemplates.map((template) => template[0]),
        );
        expect(listed.templates.slice(0, 15).every((template) => !template.isImported)).toBe(true);
      }
    }

    expect(
      await listLitterCareTaskLibraryCore({ organizationId }, anonymous),
    ).toMatchObject({ outcome: "error", error: { code: "unauthenticated" } });
    expect(
      await listLitterCareTaskLibraryCore({ organizationId }, inactive),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await listLitterCareTaskLibraryCore(
        { organizationId: ids.otherOrganization },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    await expect(
      anonymous.from("litter_care_task_library_packs").select("code"),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      member.from("litter_care_task_library_templates").select("code, version"),
    ).resolves.toMatchObject({ error: null });

    const ownerSelection = [
      { code: "dog-confirm-pregnancy", version: 1 },
      { code: "dog-prepare-whelping-area", version: 1 },
    ];
    const ownerImported = await importLitterCareTaskLibraryTemplatesCore(
      {
        organizationId,
        clientCommandId: command(1),
        selection: ownerSelection,
        isActive: true,
      },
      owner,
    );
    expect(ownerImported).toMatchObject({
      outcome: "success",
      importedCount: 2,
      alreadyImportedCount: 0,
      replayed: false,
      templates: [
        { ...ownerSelection[0], state: "imported" },
        { ...ownerSelection[1], state: "imported" },
      ],
    });
    if (ownerImported.outcome !== "success") throw new Error("Owner import failed");
    createdTemplateIds.push(...ownerImported.templates.map((template) => template.templateId));

    for (const item of ownerImported.templates) {
      const copied = JSON.parse(sql(`
        select row_to_json(copied)::text from (
          select
            organization_template.title,
            organization_template.description,
            organization_template.category,
            organization_template.target_scope,
            organization_template.anchor_type,
            organization_template.offset_days,
            organization_template.species,
            organization_template.breed,
            organization_template.sort_order,
            organization_template.revision,
            organization_template.is_active,
            organization_template.library_template_code,
            organization_template.library_template_version,
            organization_template.created_by,
            organization_template.updated_by
          from public.litter_care_task_templates organization_template
          where organization_template.id = ${q(item.templateId)}::uuid
        ) copied;
      `));
      const source = JSON.parse(sql(`
        select row_to_json(source)::text from (
          select title, description, category, target_scope, anchor_type,
            offset_days, species, breed, sort_order
          from public.litter_care_task_library_templates
          where code = ${q(item.code)} and version = ${item.version}
        ) source;
      `));
      expect(copied).toEqual({
        ...source,
        revision: 1,
        is_active: true,
        library_template_code: item.code,
        library_template_version: item.version,
        created_by: ownerId,
        updated_by: ownerId,
      });
    }

    const adminImported = await importLitterCareTaskLibraryTemplatesCore(
      {
        organizationId,
        clientCommandId: command(2),
        selection: [{ code: "dog-complete-birth-summary", version: 1 }],
        isActive: false,
      },
      admin,
    );
    expect(adminImported).toMatchObject({
      outcome: "success",
      importedCount: 1,
      alreadyImportedCount: 0,
      templates: [{ state: "imported" }],
    });
    if (adminImported.outcome !== "success") throw new Error("Admin import failed");
    createdTemplateIds.push(adminImported.templates[0].templateId);
    expect(JSON.parse(sql(`
      select json_build_object(
        'is_active', is_active,
        'created_by', created_by,
        'revision', revision
      )::text
      from public.litter_care_task_templates
      where id = ${q(adminImported.templates[0].templateId)}::uuid;
    `))).toEqual({ is_active: false, created_by: ids.adminUser, revision: 1 });

    for (const unauthorized of [member, viewer]) {
      expect(
        await importLitterCareTaskLibraryTemplatesCore(
          {
            organizationId,
            clientCommandId: command(3),
            selection: [{ code: "dog-check-mother-postpartum", version: 1 }],
            isActive: true,
          },
          unauthorized,
        ),
      ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    }
    expect(
      await importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId,
          clientCommandId: command(4),
          selection: [{ code: "dog-check-mother-postpartum", version: 1 }],
          isActive: true,
        },
        inactive,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId: ids.otherOrganization,
          clientCommandId: command(5),
          selection: [{ code: "dog-check-mother-postpartum", version: 1 }],
          isActive: true,
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId,
          clientCommandId: command(6),
          selection: [{ code: "dog-check-mother-postpartum", version: 1 }],
          isActive: true,
        },
        anonymous,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "unauthenticated" } });

    const modifiedTemplateId = ownerImported.templates[0].templateId;
    const modified = await updateLitterCareTaskTemplateCore(
      {
        templateId: modifiedTemplateId,
        clientCommandId: command(10),
        expectedRevision: 1,
        title: `${fixtureNamePrefix} copie modifiée`,
        description: "Copie adaptée par l’organisation.",
        category: "other",
        targetScope: "organization",
        anchorType: "expected_birth",
        offsetDays: -3,
        species: "dog",
        breed: "Golden Retriever",
        sortOrder: 999,
      },
      owner,
    );
    expect(modified).toMatchObject({ outcome: "success", revision: 2 });
    expect(
      await setLitterCareTaskTemplateActiveCore(
        {
          templateId: modifiedTemplateId,
          clientCommandId: command(9),
          expectedRevision: 2,
          isActive: false,
        },
        owner,
      ),
    ).toMatchObject({
      outcome: "success",
      revision: 3,
      isActive: false,
    });
    expect(JSON.parse(sql(`
      select json_build_object(
        'title', title,
        'library_template_code', library_template_code,
        'library_template_version', library_template_version,
        'is_active', is_active,
        'revision', revision
      )::text
      from public.litter_care_task_templates
      where id = ${q(modifiedTemplateId)}::uuid;
    `))).toEqual({
      title: `${fixtureNamePrefix} copie modifiée`,
      library_template_code: "dog-confirm-pregnancy",
      library_template_version: 1,
      is_active: false,
      revision: 3,
    });
    expect(JSON.parse(sql(`
      select json_build_object('title', title, 'version', version)::text
      from public.litter_care_task_library_templates
      where code = 'dog-confirm-pregnancy' and version = 1;
    `))).toEqual({ title: "Confirmer la gestation", version: 1 });
    expect(() => sql(`
      update public.litter_care_task_templates
      set library_template_code = 'dog-prepare-whelping-area',
          library_template_version = 1
      where id = ${q(modifiedTemplateId)}::uuid;
    `)).toThrow(/library origin is immutable/);

    const replayed = await importLitterCareTaskLibraryTemplatesCore(
      {
        organizationId,
        clientCommandId: command(1),
        selection: ownerSelection,
        isActive: true,
      },
      owner,
    );
    expect(replayed).toEqual({ ...ownerImported, replayed: true });
    expect(
      await importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId,
          clientCommandId: command(1),
          selection: ownerSelection.slice().reverse(),
          isActive: true,
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(
      await importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId,
          clientCommandId: command(1),
          selection: ownerSelection,
          isActive: false,
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const alreadyImported = await importLitterCareTaskLibraryTemplatesCore(
      {
          organizationId,
          clientCommandId: command(11),
          selection: [{ code: "dog-confirm-pregnancy", version: 1 }],
          isActive: true,
      },
      owner,
    );
    expect(alreadyImported).toMatchObject({
      outcome: "success",
      importedCount: 0,
      alreadyImportedCount: 1,
      templates: [{ templateId: modifiedTemplateId, state: "already_imported" }],
    });
    expect(JSON.parse(sql(`
      select json_build_object('title', title, 'is_active', is_active, 'revision', revision)::text
      from public.litter_care_task_templates where id = ${q(modifiedTemplateId)}::uuid;
    `))).toEqual({
      title: `${fixtureNamePrefix} copie modifiée`,
      is_active: false,
      revision: 3,
    });

    const concurrentSelection = [{ code: "dog-record-birth-weights", version: 1 }];
    const concurrent = await Promise.all([
      importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId,
          clientCommandId: command(12),
          selection: concurrentSelection,
          isActive: true,
        },
        owner,
      ),
      importLitterCareTaskLibraryTemplatesCore(
        {
          organizationId,
          clientCommandId: command(13),
          selection: concurrentSelection,
          isActive: false,
        },
        secondOwner,
      ),
    ]);
    expect(concurrent.every((result) => result.outcome === "success")).toBe(true);
    expect(concurrent.map((result) =>
      result.outcome === "success" ? result.importedCount : -1,
    ).sort()).toEqual([0, 1]);
    const concurrentTemplateIds = concurrent.flatMap((result) =>
      result.outcome === "success"
        ? result.templates.map((template) => template.templateId)
        : [],
    );
    expect(new Set(concurrentTemplateIds).size).toBe(1);
    createdTemplateIds.push(concurrentTemplateIds[0]);
    expect(Number(sql(`
      select count(*) from public.litter_care_task_templates
      where organization_id = ${q(organizationId)}::uuid
        and library_template_code = 'dog-record-birth-weights'
        and library_template_version = 1;
    `))).toBe(1);

    for (const [commandId, selection, reason] of [
      [command(20), [], "invalid_selection"],
      [command(21), [{ code: "dog-check-mother-postpartum", version: 1 }, { code: "dog-check-mother-postpartum", version: 1 }], "invalid_selection"],
      [command(22), [{ code: "dog-check-mother-postpartum", version: 1, extra: true }], "invalid_selection"],
      [command(23), [{ code: "Invalid Code", version: 1 }], "invalid_selection"],
      [command(24), [{ code: "dog-check-mother-postpartum", version: 0 }], "invalid_selection"],
      [command(25), [{ code: "dog-does-not-exist", version: 1 }], "selection_unavailable"],
      [command(26), [{ code: unavailableTemplateCode, version: 1 }], "selection_unavailable"],
      [command(27), [{ code: unavailablePackTemplateCode, version: 1 }], "selection_unavailable"],
    ] as const) {
      expect(await directImport(owner, commandId, selection as unknown as Json)).toMatchObject({
        outcome: "error",
        reason,
      });
    }

    const atomicValidCode = "dog-check-provisional-identification";
    expect(
      await directImport(owner, command(28), [
        { code: atomicValidCode, version: 1 },
        { code: "dog-does-not-exist", version: 1 },
      ]),
    ).toMatchObject({ outcome: "error", reason: "selection_unavailable" });
    expect(Number(sql(`
      select count(*) from public.litter_care_task_templates
      where organization_id = ${q(organizationId)}::uuid
        and library_template_code = ${q(atomicValidCode)};
    `))).toBe(0);
    expect(Number(sql(`
      select count(*) from public.litter_care_task_library_import_commands
      where client_command_id between ${q(command(20))}::uuid and ${q(command(28))}::uuid;
    `))).toBe(0);

    await expect(
      owner.from("litter_care_task_library_import_commands").select("id"),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      owner.from("litter_care_task_library_import_commands").insert({
        organization_id: organizationId,
        client_command_id: command(29),
        selection: [],
        initial_is_active: true,
        imported_count: 0,
        already_imported_count: 0,
        result: [],
        created_by: ownerId,
      }),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      owner.from("litter_care_task_library_import_commands")
        .update({ imported_count: 99 })
        .eq("client_command_id", command(1)),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      owner.from("litter_care_task_library_import_commands")
        .delete()
        .eq("client_command_id", command(1)),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      owner.from("litter_care_task_library_templates")
        .update({ title: "Modification interdite" })
        .eq("code", "dog-confirm-pregnancy"),
    ).resolves.toMatchObject({ error: expect.anything() });
    await expect(
      owner.from("litter_care_task_library_templates")
        .delete()
        .eq("code", "dog-confirm-pregnancy"),
    ).resolves.toMatchObject({ error: expect.anything() });

    const versionOneImport = await importLitterCareTaskLibraryTemplatesCore(
      {
        organizationId,
        clientCommandId: command(30),
        selection: [{ code: versionedTemplateCode, version: 1 }],
        isActive: true,
      },
      owner,
    );
    expect(versionOneImport).toMatchObject({ outcome: "success", importedCount: 1 });
    if (versionOneImport.outcome !== "success") throw new Error("Version 1 import failed");
    const versionOneCopyId = versionOneImport.templates[0].templateId;
    createdTemplateIds.push(versionOneCopyId);
    expect(() => sql(`
      insert into public.litter_care_task_library_templates (
        code, version, pack_code, title, category, target_scope,
        anchor_type, offset_days, species, sort_order, is_available
      ) values (
        ${q(versionedTemplateCode)}, 2, ${q(versionedPackCode)},
        'Version 2 E2E', 'other', 'organization', 'offspring_age', 10,
        'dog', 902, true
      );
    `)).toThrow(/litter_care_task_library_templates_available_code_key/);
    sql(`
      update public.litter_care_task_library_templates
      set is_available = false
      where code = ${q(versionedTemplateCode)} and version = 1;
      insert into public.litter_care_task_library_templates (
        code, version, pack_code, title, description, category, target_scope,
        anchor_type, offset_days, species, breed, sort_order, is_available
      ) values (
        ${q(versionedTemplateCode)}, 2, ${q(versionedPackCode)},
        'Version 2 E2E', 'Description version 2 E2E.', 'socialization', 'all_offspring',
        'offspring_age', 10, 'dog', 'Golden Retriever', 902, true
      );
    `);

    const beforeVersionTwoImport = await listLitterCareTaskLibraryCore(
      { organizationId },
      owner,
    );
    expect(beforeVersionTwoImport).toMatchObject({ outcome: "success" });
    if (beforeVersionTwoImport.outcome !== "success") throw new Error("Library read failed");
    expect(
      beforeVersionTwoImport.templates.find(
        (template) => template.code === versionedTemplateCode,
      ),
    ).toMatchObject({
      version: 2,
      isImported: false,
      organizationTemplateId: null,
      latestImportedVersion: {
        version: 1,
        organizationTemplateId: versionOneCopyId,
        isActive: true,
      },
    });

    const versionTwoImport = await importLitterCareTaskLibraryTemplatesCore(
      {
        organizationId,
        clientCommandId: command(31),
        selection: [{ code: versionedTemplateCode, version: 2 }],
        isActive: false,
      },
      owner,
    );
    expect(versionTwoImport).toMatchObject({
      outcome: "success",
      importedCount: 1,
      alreadyImportedCount: 0,
      templates: [{ version: 2, state: "imported" }],
    });
    if (versionTwoImport.outcome !== "success") throw new Error("Version 2 import failed");
    const versionTwoCopyId = versionTwoImport.templates[0].templateId;
    createdTemplateIds.push(versionTwoCopyId);
    expect(versionTwoCopyId).not.toBe(versionOneCopyId);
    expect(JSON.parse(sql(`
      select json_agg(json_build_object(
        'id', id,
        'title', title,
        'version', library_template_version,
        'is_active', is_active,
        'revision', revision
      ) order by library_template_version)::text
      from public.litter_care_task_templates
      where id in (${q(versionOneCopyId)}::uuid, ${q(versionTwoCopyId)}::uuid);
    `))).toEqual([
      {
        id: versionOneCopyId,
        title: "Version 1 E2E",
        version: 1,
        is_active: true,
        revision: 1,
      },
      {
        id: versionTwoCopyId,
        title: "Version 2 E2E",
        version: 2,
        is_active: false,
        revision: 1,
      },
    ]);

    const afterVersionTwoImport = await listLitterCareTaskLibraryCore(
      { organizationId },
      owner,
    );
    expect(afterVersionTwoImport).toMatchObject({ outcome: "success" });
    if (afterVersionTwoImport.outcome === "success") {
      expect(
        afterVersionTwoImport.templates.find(
          (template) => template.code === versionedTemplateCode,
        ),
      ).toMatchObject({
        version: 2,
        isImported: true,
        organizationTemplateId: versionTwoCopyId,
        organizationTemplateIsActive: false,
        latestImportedVersion: {
          version: 2,
          organizationTemplateId: versionTwoCopyId,
          isActive: false,
        },
      });
    }

    expect(operationalCounts()).toEqual(operationalBefore);
    expect(Number(sql("select count(*) from public.litter_care_tasks;"))).toBe(initialTaskCount);
    expect(Number(sql("select count(*) from public.events;"))).toBe(operationalBefore.events);
    expect(Number(sql(`
      select count(*) from public.litter_care_task_library_import_commands
      where client_command_id::text like '9f190001-%';
    `))).toBe(7);
    console.log(
      `E2E library temporary organization template ids: ${createdTemplateIds.join(",")}`,
    );
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
