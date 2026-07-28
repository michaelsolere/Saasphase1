import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  importLitterPlanningModelLibraryModelsCore,
  listLitterPlanningModelLibraryCore,
} from "../../src/features/litter-journal/litter-planning-model-library-core";
import { getLitterPlanningModelCore } from "../../src/features/litter-journal/litter-planning-models-core";
import type { Database, Json } from "../../src/types/database.types";
import {
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

type Supabase = SupabaseClient<Database>;

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const inaccessibleOrganizationId = "e7280002-0000-4000-8000-000000000002";
const uuidPrefix = "e7280002-0000-4000-8000-0000000000";
const fixturePrefix = "e2e-library-recurrence";
const modelCode = fixturePrefix;
const elementaryCode = "dog-temperature-monitoring-period";

const ids = {
  libraryItem: `${uuidPrefix}60`,
  ownerImport: `${uuidPrefix}70`,
  memberImport: `${uuidPrefix}71`,
  viewerImport: `${uuidPrefix}72`,
  foreignImport: `${uuidPrefix}73`,
  deletedImport: `${uuidPrefix}74`,
  unavailableImport: `${uuidPrefix}75`,
  gestationImport: `${uuidPrefix}76`,
} as const;

const credentials = {
  owner: [E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD],
  member: [E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD],
  viewer: [E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD],
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function jsonSql(statement: string) {
  const lines = sql(statement).split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      continue;
    }
  }
  throw new Error("E2E SQL did not return a JSON value");
}

async function authenticatedClient(
  [email, password]: readonly [string, string],
): Promise<Supabase> {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

function organizationSnapshot() {
  return jsonSql(`
    select json_build_object(
      'models', (
        select coalesce(json_agg(id order by id), '[]'::json)
        from public.litter_planning_models
        where organization_id = ${q(organizationId)}::uuid
      ),
      'items', (
        select coalesce(json_agg(id order by id), '[]'::json)
        from public.litter_planning_model_items
        where organization_id = ${q(organizationId)}::uuid
      ),
      'slots', (
        select coalesce(json_agg(id order by id), '[]'::json)
        from public.litter_planning_model_item_time_slots
        where organization_id = ${q(organizationId)}::uuid
      ),
      'commands', (
        select coalesce(json_agg(id order by id), '[]'::json)
        from public.litter_planning_model_library_import_commands
        where organization_id = ${q(organizationId)}::uuid
      ),
      'templates', (
        select coalesce(json_agg(id order by id), '[]'::json)
        from public.litter_care_task_templates
        where organization_id = ${q(organizationId)}::uuid
      ),
      'plans', (
        select count(*) from public.litter_plans
        where organization_id = ${q(organizationId)}::uuid
      ),
      'series', (
        select count(*) from public.litter_plan_series
        where organization_id = ${q(organizationId)}::uuid
      ),
      'occurrences', (
        select count(*) from public.litter_care_tasks
        where organization_id = ${q(organizationId)}::uuid
      )
    )::text;
  `) as Record<string, unknown>;
}

function elementaryOriginSnapshot() {
  return jsonSql(`
    select coalesce(
      json_agg(
        json_build_object(
          'id', id,
          'code', library_template_code,
          'version', library_template_version
        )
        order by id
      ),
      '[]'::json
    )::text
    from public.litter_care_task_templates
    where organization_id = ${q(organizationId)}::uuid
      and library_template_code is not null;
  `) as Array<{ id: string; code: string; version: number }>;
}

function cleanupBusinessFixtures() {
  sql(`
    begin;

    create temporary table cleanup_models (
      id uuid primary key
    ) on commit drop;

    create temporary table cleanup_templates (
      id uuid primary key
    ) on commit drop;

    insert into cleanup_models (id)
    select distinct (entry.value ->> 'modelId')::uuid
    from public.litter_planning_model_library_import_commands command
    cross join lateral jsonb_array_elements(command.result) entry(value)
    where command.organization_id = ${q(organizationId)}::uuid
      and (
        command.client_command_id::text like 'e7280002-%'
        or command.selection @> jsonb_build_array(
          jsonb_build_object('code', ${q(modelCode)})
        )
      )
      and entry.value ->> 'state' = 'imported'
    on conflict do nothing;

    insert into cleanup_models (id)
    select model.id
    from public.litter_planning_models model
    where model.organization_id = ${q(organizationId)}::uuid
      and model.library_model_code like ${q(`${fixturePrefix}%`)}
    on conflict do nothing;

    insert into cleanup_templates (id)
    select distinct (entry.value ->> 'templateId')::uuid
    from public.litter_planning_model_library_import_commands command
    cross join lateral jsonb_array_elements(command.elementary_result) entry(value)
    where command.organization_id = ${q(organizationId)}::uuid
      and (
        command.client_command_id::text like 'e7280002-%'
        or command.selection @> jsonb_build_array(
          jsonb_build_object('code', ${q(modelCode)})
        )
      )
      and entry.value ->> 'state' = 'imported'
    on conflict do nothing;

    insert into cleanup_templates (id)
    select distinct item.organization_template_id
    from public.litter_planning_model_items item
    join cleanup_models model on model.id = item.model_id
    on conflict do nothing;

    delete from public.litter_planning_model_item_time_slots slot
    using public.litter_planning_model_items item, cleanup_models model
    where slot.model_item_id = item.id
      and item.model_id = model.id;

    delete from public.litter_planning_model_items item
    using cleanup_models model
    where item.model_id = model.id;

    delete from public.litter_planning_models model
    using cleanup_models cleanup
    where model.id = cleanup.id;

    delete from public.litter_planning_model_library_import_commands command
    where command.organization_id = ${q(organizationId)}::uuid
      and (
        command.client_command_id::text like 'e7280002-%'
        or command.selection @> jsonb_build_array(
          jsonb_build_object('code', ${q(modelCode)})
        )
      );

    delete from public.litter_care_task_templates template
    using cleanup_templates cleanup
    where template.id = cleanup.id;

    delete from public.litter_planning_model_library_item_time_slots slot
    using public.litter_planning_model_library_items item
    where slot.library_model_item_id = item.id
      and item.library_model_code like ${q(`${fixturePrefix}%`)};

    delete from public.litter_planning_model_library_items item
    where item.library_model_code like ${q(`${fixturePrefix}%`)};

    delete from public.litter_planning_model_library_models model
    where model.code like ${q(`${fixturePrefix}%`)};

    commit;
  `);
}

function fixtureCounts() {
  return jsonSql(`
    select json_build_object(
      'library_models', (
        select count(*)
        from public.litter_planning_model_library_models
        where code like ${q(`${fixturePrefix}%`)}
      ),
      'library_items', (
        select count(*)
        from public.litter_planning_model_library_items
        where library_model_code like ${q(`${fixturePrefix}%`)}
      ),
      'library_slots', (
        select count(*)
        from public.litter_planning_model_library_item_time_slots slot
        join public.litter_planning_model_library_items item
          on item.id = slot.library_model_item_id
        where item.library_model_code like ${q(`${fixturePrefix}%`)}
      ),
      'organization_models', (
        select count(*)
        from public.litter_planning_models
        where organization_id = ${q(organizationId)}::uuid
          and library_model_code like ${q(`${fixturePrefix}%`)}
      ),
      'organization_items', (
        select count(*)
        from public.litter_planning_model_items item
        join public.litter_planning_models model on model.id = item.model_id
        where model.organization_id = ${q(organizationId)}::uuid
          and model.library_model_code like ${q(`${fixturePrefix}%`)}
      ),
      'organization_slots', (
        select count(*)
        from public.litter_planning_model_item_time_slots slot
        join public.litter_planning_model_items item on item.id = slot.model_item_id
        join public.litter_planning_models model on model.id = item.model_id
        where model.organization_id = ${q(organizationId)}::uuid
          and model.library_model_code like ${q(`${fixturePrefix}%`)}
      ),
      'import_commands', (
        select count(*)
        from public.litter_planning_model_library_import_commands command
        where command.organization_id = ${q(organizationId)}::uuid
          and (
            command.client_command_id::text like 'e7280002-%'
            or command.selection @> jsonb_build_array(
              jsonb_build_object('code', ${q(modelCode)})
            )
          )
      )
    )::text;
  `) as Record<string, number>;
}

function expectBusinessCleanup() {
  expect(fixtureCounts()).toEqual({
    library_models: 0,
    library_items: 0,
    library_slots: 0,
    organization_models: 0,
    organization_items: 0,
    organization_slots: 0,
    import_commands: 0,
  });
}

function createLibraryFixture() {
  sql(`
    begin;

    insert into public.litter_planning_model_library_models (
      code,
      version,
      family_code,
      variant_code,
      title,
      description,
      species,
      sort_order,
      is_available
    ) values (
      ${q(modelCode)},
      1,
      'e2e-library',
      'recurrence',
      'e2e-library-recurrence Suivi températures',
      'Modèle temporaire réservé aux validations E2E.',
      'dog',
      999,
      true
    );

    insert into public.litter_planning_model_library_items (
      id,
      library_model_code,
      library_model_version,
      library_template_code,
      library_template_version,
      item_kind,
      priority,
      anchor_type,
      recurrence_kind,
      recurrence_interval_days,
      recurrence_starts_offset_days,
      recurrence_end_kind,
      recurrence_day_count,
      initial_materialization_horizon_days,
      absolute_max_occurrences,
      display_order,
      is_required,
      is_selected_by_default
    ) values (
      ${q(ids.libraryItem)}::uuid,
      ${q(modelCode)},
      1,
      ${q(elementaryCode)},
      1,
      'recurring_task',
      'important',
      'expected_birth',
      'daily_interval',
      1,
      -5,
      'fixed_recurrence_day_count',
      5,
      7,
      10,
      0,
      true,
      true
    );

    insert into public.litter_planning_model_library_item_time_slots (
      library_model_item_id,
      slot_no,
      local_time
    ) values
      (${q(ids.libraryItem)}::uuid, 1, '08:00'::time),
      (${q(ids.libraryItem)}::uuid, 2, '20:00'::time);

    commit;
  `);
}

async function directImport(
  client: Supabase,
  targetOrganizationId: string,
  clientCommandId: string,
  selection: Json,
) {
  const response = await client.rpc(
    "import_litter_planning_model_library_models",
    {
      p_organization_id: targetOrganizationId,
      p_client_command_id: clientCommandId,
      p_selection: selection,
      p_is_active: true,
    },
  );
  expect(response.error).toBeNull();
  return response.data?.[0];
}

function expectSqlFailure(statement: string) {
  expect(() => sql(statement)).toThrow(
    /litter planning model library item time slots are invalid/,
  );
}

function adversarialModelSql(
  code: string,
  itemsAndSlots: string,
) {
  return `
    insert into public.litter_planning_model_library_models (
      code, version, family_code, variant_code, title, species, sort_order
    ) values (
      ${q(code)}, 1, 'e2e-library', 'recurrence',
      ${q(code)}, 'dog', 999
    );
    ${itemsAndSlots}
  `;
}

async function login(
  page: Page,
  [email, password]: readonly [string, string],
) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function library(page: Page) {
  return page.locator(
    "section[aria-labelledby='recommended-planning-library-heading']",
  );
}

function myModels(page: Page) {
  return page.locator(
    "section[aria-labelledby='organization-planning-models-heading']",
  );
}

function libraryCard(page: Page) {
  return library(page).locator(`[data-library-model='${modelCode}:1']`);
}

test("durcit la fondation SQL/RPC de la récurrence de bibliothèque", async () => {
  cleanupBusinessFixtures();
  expectBusinessCleanup();
  const organizationBefore = organizationSnapshot();
  const elementaryBefore = elementaryOriginSnapshot();

  try {
    createLibraryFixture();

    const owner = await authenticatedClient(credentials.owner);
    const member = await authenticatedClient(credentials.member);
    const viewer = await authenticatedClient(credentials.viewer);

    const ownerLibrary = await listLitterPlanningModelLibraryCore(
      { organizationId },
      owner,
    );
    expect(ownerLibrary).toMatchObject({ outcome: "success", role: "owner" });
    if (ownerLibrary.outcome !== "success") {
      throw new Error("owner library read failed");
    }
    expect(
      ownerLibrary.models.find((model) => model.code === modelCode)?.items,
    ).toEqual([
      expect.objectContaining({
        itemKind: "recurring_task",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: -5,
        recurrenceEndKind: "fixed_recurrence_day_count",
        recurrenceDayCount: 5,
        initialMaterializationHorizonDays: 7,
        absoluteMaxOccurrences: 10,
        timeSlots: ["08:00:00", "20:00:00"],
      }),
    ]);

    for (const [client, role] of [
      [member, "member"],
      [viewer, "viewer"],
    ] as const) {
      expect(
        await listLitterPlanningModelLibraryCore({ organizationId }, client),
      ).toMatchObject({ outcome: "success", role });
    }

    const invalidSelections: Json[] = [
      [null],
      [modelCode],
      [42],
      [[]],
      [{ code: modelCode }],
      [{ code: modelCode, version: 1, extra: true }],
    ];
    for (const [index, selection] of invalidSelections.entries()) {
      const before = fixtureCounts();
      expect(
        await directImport(
          owner,
          organizationId,
          `${uuidPrefix}${80 + index}`,
          selection,
        ),
      ).toMatchObject({
        outcome: "error",
        reason: "invalid_selection",
      });
      expect(fixtureCounts()).toEqual(before);
    }

    const imported = await importLitterPlanningModelLibraryModelsCore(
      {
        organizationId,
        clientCommandId: ids.ownerImport,
        selection: [{ code: modelCode, version: 1 }],
        isActive: true,
      },
      owner,
    );
    expect(imported).toMatchObject({
      outcome: "success",
      importedCount: 1,
      alreadyImportedCount: 0,
      elementaryImportedCount: 1,
      replayed: false,
    });
    if (imported.outcome !== "success") {
      throw new Error("owner import failed");
    }

    const organizationModel = await getLitterPlanningModelCore(
      imported.models[0]!.modelId,
      owner,
    );
    expect(organizationModel).toMatchObject({ outcome: "success" });
    if (organizationModel.outcome !== "success") {
      throw new Error("organization model read failed");
    }
    expect(organizationModel.model.items).toEqual([
      expect.objectContaining({
        itemKind: "recurring_task",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: -5,
        recurrenceEndKind: "fixed_recurrence_day_count",
        recurrenceDayCount: 5,
        initialMaterializationHorizonDays: 7,
        absoluteMaxOccurrences: 10,
        timeSlots: ["08:00:00", "20:00:00"],
      }),
    ]);

    expect(
      await importLitterPlanningModelLibraryModelsCore(
        {
          organizationId,
          clientCommandId: ids.ownerImport,
          selection: [{ code: modelCode, version: 1 }],
          isActive: true,
        },
        owner,
      ),
    ).toMatchObject({
      outcome: "success",
      importedCount: 1,
      replayed: true,
    });
    expect(
      Number(
        sql(`
          select count(*)
          from public.litter_planning_models
          where organization_id = ${q(organizationId)}::uuid
            and library_model_code = ${q(modelCode)};
        `),
      ),
    ).toBe(1);
    expect(
      Number(
        sql(`
          select count(*)
          from public.litter_planning_model_item_time_slots slot
          join public.litter_planning_model_items item
            on item.id = slot.model_item_id
          join public.litter_planning_models model
            on model.id = item.model_id
          where model.organization_id = ${q(organizationId)}::uuid
            and model.library_model_code = ${q(modelCode)};
        `),
      ),
    ).toBe(2);

    expect(
      await directImport(
        owner,
        organizationId,
        ids.ownerImport,
        [{ code: "dog-gestation-standard", version: 1 }],
      ),
    ).toMatchObject({
      outcome: "error",
      reason: "client_command_conflict",
    });

    for (const [client, commandId] of [
      [member, ids.memberImport],
      [viewer, ids.viewerImport],
    ] as const) {
      const before = fixtureCounts();
      expect(
        await importLitterPlanningModelLibraryModelsCore(
          {
            organizationId,
            clientCommandId: commandId,
            selection: [{ code: modelCode, version: 1 }],
            isActive: true,
          },
          client,
        ),
      ).toMatchObject({
        outcome: "error",
        error: { code: "forbidden" },
      });
      expect(fixtureCounts()).toEqual(before);
    }

    const isolationBefore = fixtureCounts();
    expect(
      await directImport(
        owner,
        inaccessibleOrganizationId,
        ids.foreignImport,
        [{ code: modelCode, version: 1 }],
      ),
    ).toMatchObject({
      outcome: "error",
      reason: "organization_not_found",
    });
    expect(fixtureCounts()).toEqual(isolationBefore);

    const deletedResult = jsonSql(`
      begin;
      do $$
      begin
        perform set_config('request.jwt.claim.sub', ${q(ownerId)}, true);
        perform set_config('request.jwt.claim.role', 'authenticated', true);
      end;
      $$;
      update public.organizations
      set deleted_at = now()
      where id = ${q(organizationId)}::uuid;
      select row_to_json(import_result)::text
      from public.import_litter_planning_model_library_models(
        ${q(organizationId)}::uuid,
        ${q(ids.deletedImport)}::uuid,
        jsonb_build_array(jsonb_build_object('code', ${q(modelCode)}, 'version', 1)),
        true
      ) import_result;
      rollback;
    `);
    expect(deletedResult).toMatchObject({
      outcome: "error",
      reason: "organization_not_found",
    });

    const unavailableResult = jsonSql(`
      begin;
      do $$
      begin
        perform set_config('request.jwt.claim.sub', ${q(ownerId)}, true);
        perform set_config('request.jwt.claim.role', 'authenticated', true);
      end;
      $$;
      update public.litter_care_task_library_templates
      set is_available = false
      where code = ${q(elementaryCode)}
        and version = 1;
      select row_to_json(import_result)::text
      from public.import_litter_planning_model_library_models(
        ${q(organizationId)}::uuid,
        ${q(ids.unavailableImport)}::uuid,
        jsonb_build_array(jsonb_build_object('code', ${q(modelCode)}, 'version', 1)),
        true
      ) import_result;
      rollback;
    `);
    expect(unavailableResult).toMatchObject({
      outcome: "error",
      reason: "selection_unavailable",
    });

    expectSqlFailure(`
      begin;
      ${adversarialModelSql(
        `${fixturePrefix}-missing-slot`,
        `
          insert into public.litter_planning_model_library_items (
            id, library_model_code, library_model_version,
            library_template_code, library_template_version,
            item_kind, priority, anchor_type, recurrence_kind,
            recurrence_interval_days, recurrence_starts_offset_days,
            recurrence_end_kind, recurrence_day_count,
            initial_materialization_horizon_days, absolute_max_occurrences,
            display_order
          ) values (
            '${uuidPrefix}91', '${fixturePrefix}-missing-slot', 1,
            '${elementaryCode}', 1, 'recurring_task', 'normal',
            'expected_birth', 'daily_interval', 1, -5,
            'fixed_recurrence_day_count', 5, 7, 10, 0
          );
        `,
      )}
      commit;
    `);

    expectSqlFailure(`
      begin;
      ${adversarialModelSql(
        `${fixturePrefix}-nine-slots`,
        `
          insert into public.litter_planning_model_library_items (
            id, library_model_code, library_model_version,
            library_template_code, library_template_version,
            item_kind, priority, anchor_type, recurrence_kind,
            recurrence_interval_days, recurrence_starts_offset_days,
            recurrence_end_kind, recurrence_day_count,
            initial_materialization_horizon_days, absolute_max_occurrences,
            display_order
          ) values (
            '${uuidPrefix}92', '${fixturePrefix}-nine-slots', 1,
            '${elementaryCode}', 1, 'recurring_task', 'normal',
            'expected_birth', 'daily_interval', 1, -5,
            'fixed_recurrence_day_count', 5, 7, 10, 0
          );
          insert into public.litter_planning_model_library_item_time_slots (
            library_model_item_id, slot_no, local_time
          )
          select
            '${uuidPrefix}92'::uuid,
            number,
            make_time(number::integer, 0, 0)
          from generate_series(1, 9) number;
        `,
      )}
      commit;
    `);

    expectSqlFailure(`
      begin;
      ${adversarialModelSql(
        `${fixturePrefix}-point-slot`,
        `
          insert into public.litter_planning_model_library_items (
            id, library_model_code, library_model_version,
            library_template_code, library_template_version,
            item_kind, priority, anchor_type, point_offset_days, display_order
          ) values (
            '${uuidPrefix}93', '${fixturePrefix}-point-slot', 1,
            '${elementaryCode}', 1, 'task', 'normal',
            'expected_birth', -5, 0
          );
          insert into public.litter_planning_model_library_item_time_slots (
            library_model_item_id, slot_no, local_time
          ) values ('${uuidPrefix}93', 1, '08:00');
        `,
      )}
      commit;
    `);

    expectSqlFailure(`
      begin;
      ${adversarialModelSql(
        `${fixturePrefix}-move-slot`,
        `
          insert into public.litter_planning_model_library_items (
            id, library_model_code, library_model_version,
            library_template_code, library_template_version,
            item_kind, priority, anchor_type, recurrence_kind,
            recurrence_interval_days, recurrence_starts_offset_days,
            recurrence_end_kind, recurrence_day_count,
            initial_materialization_horizon_days, absolute_max_occurrences,
            display_order
          ) values
            (
              '${uuidPrefix}94', '${fixturePrefix}-move-slot', 1,
              '${elementaryCode}', 1, 'recurring_task', 'normal',
              'expected_birth', 'daily_interval', 1, -5,
              'fixed_recurrence_day_count', 5, 7, 10, 0
            ),
            (
              '${uuidPrefix}95', '${fixturePrefix}-move-slot', 1,
              '${elementaryCode}', 1, 'recurring_task', 'normal',
              'expected_birth', 'daily_interval', 1, -5,
              'fixed_recurrence_day_count', 5, 7, 10, 1
            );
          insert into public.litter_planning_model_library_item_time_slots (
            library_model_item_id, slot_no, local_time
          ) values
            ('${uuidPrefix}94', 1, '08:00'),
            ('${uuidPrefix}95', 1, '20:00');
          update public.litter_planning_model_library_item_time_slots
          set library_model_item_id = '${uuidPrefix}95',
              slot_no = 2
          where library_model_item_id = '${uuidPrefix}94';
        `,
      )}
      commit;
    `);

    const gestation = await directImport(
      owner,
      organizationId,
      ids.gestationImport,
      [{ code: "dog-gestation-standard", version: 1 }],
    );
    expect(gestation).toMatchObject({ outcome: "success" });
    const gestationRead = await listLitterPlanningModelLibraryCore(
      { organizationId },
      owner,
    );
    expect(gestationRead).toMatchObject({ outcome: "success" });
    if (gestationRead.outcome !== "success") {
      throw new Error("gestation library read failed");
    }
    expect(
      gestationRead.models.find(
        (model) => model.code === "dog-gestation-standard",
      )?.items.every((item) => item.timeSlots.length === 0),
    ).toBe(true);

    const operationalAfter = organizationSnapshot();
    expect(operationalAfter.plans).toEqual(organizationBefore.plans);
    expect(operationalAfter.series).toEqual(organizationBefore.series);
    expect(operationalAfter.occurrences).toEqual(
      organizationBefore.occurrences,
    );
  } finally {
    cleanupBusinessFixtures();
    expectBusinessCleanup();
    expect(elementaryOriginSnapshot()).toEqual(elementaryBefore);
    expect(organizationSnapshot()).toEqual(organizationBefore);
  }
});

test("affiche et importe le suivi récurrent dans un navigateur réel", async ({
  page,
}) => {
  cleanupBusinessFixtures();
  expectBusinessCleanup();
  const organizationBefore = organizationSnapshot();
  const elementaryBefore = elementaryOriginSnapshot();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
    );
  });

  try {
    createLibraryFixture();
    await login(page, credentials.owner);
    await page.goto("/settings/litter-planning-models");

    const card = libraryCard(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText("e2e-library-recurrence");
    await card
      .getByRole("button", { name: "Voir le détail des éléments" })
      .click();

    const details = page.getByRole("dialog");
    await expect(details).toContainText("Suivi récurrent");
    await expect(details).toContainText("Deux fois par jour");
    await expect(details).toContainText("5 jours");
    await expect(details).toContainText("08 h 00");
    await expect(details).toContainText("20 h 00");
    await details.getByRole("button", { name: "Fermer" }).click();

    await card
      .getByRole("checkbox", {
        name: /Sélectionner e2e-library-recurrence Suivi températures/,
      })
      .check();
    await page.getByRole("button", { name: "Vérifier l’import" }).click();
    const importDialog = page.getByRole("dialog");
    await importDialog
      .getByRole("button", { name: "Importer les modèles sélectionnés" })
      .click();
    await expect(importDialog).toBeHidden();

    const modelId = await expect
      .poll(() =>
        sql(`
          select coalesce((
            select id::text
            from public.litter_planning_models
            where organization_id = ${q(organizationId)}::uuid
              and library_model_code = ${q(modelCode)}
              and library_model_version = 1
          ), '');
        `),
      )
      .not.toBe("");
    void modelId;

    const importedModelId = sql(`
      select id::text
      from public.litter_planning_models
      where organization_id = ${q(organizationId)}::uuid
        and library_model_code = ${q(modelCode)}
        and library_model_version = 1;
    `);
    await myModels(page)
      .locator(`[data-organization-model='${importedModelId}']`)
      .getByRole("link", { name: "Ouvrir la fiche" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/settings/litter-planning-models/${importedModelId}$`),
    );
    await expect(page.getByText("Suivi récurrent").first()).toBeVisible();
    await expect(page.getByText(/Deux fois par jour/).first()).toBeVisible();
    await expect(page.getByText(/08 h 00/).first()).toBeVisible();
    await expect(page.getByText(/20 h 00/).first()).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  } finally {
    cleanupBusinessFixtures();
    expectBusinessCleanup();
    expect(elementaryOriginSnapshot()).toEqual(elementaryBefore);
    expect(organizationSnapshot()).toEqual(organizationBefore);
  }
});
