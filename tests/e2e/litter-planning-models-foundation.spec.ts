import { expect, test } from "@playwright/test";

import {
  createLitterPlanningModelCore,
  replaceLitterPlanningModelCore,
  setLitterPlanningModelActiveCore,
} from "../../src/features/litter-journal/litter-planning-models-core";
import { createAuthenticatedSupabaseClient, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f240001-0000-4000-8000-0000000000";
const ids = { foreignOrganization: `${prefix}01`, foreignTemplate: `${prefix}02`, template: `${prefix}03`, model: `${prefix}10`, foreignModel: `${prefix}11` } as const;
const commandIds = ["20", "21", "22", "23", "24", "25", "26", "27"].map((suffix) => `${prefix}${suffix}`);
const created = { modelIds: new Set<string>(), itemIds: new Set<string>(), commandIds: new Set<string>(commandIds) };
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);
const uuidArray = (values: Iterable<string>) => `array[${[...values].map((value) => `${q(value)}::uuid`).join(",")}]`;

function cleanup() {
  sql(`
    delete from public.litter_planning_model_commands where id = any(${uuidArray(created.commandIds)}) or model_id = any(${uuidArray(created.modelIds)});
    delete from public.litter_planning_model_items where id = any(${uuidArray(created.itemIds)}) or model_id = any(${uuidArray(created.modelIds)});
    delete from public.litter_planning_models where id = any(${uuidArray(created.modelIds)});
    delete from public.litter_care_task_template_commands where template_id in (${q(ids.template)}::uuid,${q(ids.foreignTemplate)}::uuid);
    delete from public.litter_care_task_templates where id in (${q(ids.template)}::uuid,${q(ids.foreignTemplate)}::uuid);
    delete from public.organizations where id=${q(ids.foreignOrganization)}::uuid;
  `);
}

function counts() {
  return JSON.parse(sql(`select json_build_object(
    'commands',(select count(*) from public.litter_planning_model_commands where id = any(${uuidArray(created.commandIds)}) or model_id = any(${uuidArray(created.modelIds)})),
    'items',(select count(*) from public.litter_planning_model_items where id = any(${uuidArray(created.itemIds)}) or model_id = any(${uuidArray(created.modelIds)})),
    'models',(select count(*) from public.litter_planning_models where id = any(${uuidArray(created.modelIds)})),
    'templates',(select count(*) from public.litter_care_task_templates where id in (${q(ids.template)}::uuid,${q(ids.foreignTemplate)}::uuid)),
    'organizations',(select count(*) from public.organizations where id=${q(ids.foreignOrganization)}::uuid),
    'tasks',(select count(*) from public.litter_care_tasks where organization_template_id::text like '9f240001-%')
  )::text;`)) as Record<string, number>;
}

function fixture() {
  sql(`
    insert into public.organizations(id,name,slug) values(${q(ids.foreignOrganization)}::uuid,'E2E planning foreign','e2e-planning-models-foreign');
    insert into public.litter_care_task_templates(id,organization_id,title,category,target_scope,anchor_type,offset_days,species,sort_order,revision,created_by,updated_by)
    values
      (${q(ids.template)}::uuid,${q(organizationId)}::uuid,'E2E planning element','other','litter','expected_birth',0,'dog',0,1,${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.foreignTemplate)}::uuid,${q(ids.foreignOrganization)}::uuid,'E2E planning foreign element','other','litter','expected_birth',0,'dog',0,1,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

const point = { organizationTemplateId: ids.template, itemKind: "milestone" as const, priority: "normal" as const, anchorType: "expected_birth" as const, pointOffsetDays: -2, pointLocalTime: "08:30", displayOrder: 0, isRequired: true, isSelectedByDefault: true };
const window = { organizationTemplateId: ids.template, itemKind: "window" as const, priority: "important" as const, anchorType: "actual_birth" as const, windowStartsOffsetDays: 0, windowStartsLocalTime: "08:00", windowEndsOffsetDays: 1, windowEndsLocalTime: "18:00", displayOrder: 1, isRequired: false, isSelectedByDefault: false };

test("planning models enforce composition, idempotency, revision, RLS and cleanup", async () => {
  cleanup(); fixture();
  try {
    const owner = await createAuthenticatedSupabaseClient();
    const creation = await createLitterPlanningModelCore(organizationId, `${prefix}20`, { title: "E2E composed planning", species: "dog", breed: "Golden Retriever", items: [point, window] }, owner);
    expect(creation).toMatchObject({ outcome: "success", revision: 1, replayed: false });
    if (creation.outcome !== "success") throw new Error("model creation failed");
    created.modelIds.add(creation.modelId);
    for (const row of JSON.parse(sql(`select json_agg(id::text)::text from public.litter_planning_model_items where model_id=${q(creation.modelId)}::uuid;`)) as string[]) created.itemIds.add(row);
    for (const row of JSON.parse(sql(`select json_agg(id::text)::text from public.litter_planning_model_commands where model_id=${q(creation.modelId)}::uuid;`)) as string[]) created.commandIds.add(row);
    expect(sql(`select count(*) from public.litter_planning_model_items where model_id=${q(creation.modelId)}::uuid;`)).toBe("2");
    expect(sql(`select count(*) from public.litter_care_tasks where organization_template_id=${q(ids.template)}::uuid;`)).toBe("0");

    const replay = await createLitterPlanningModelCore(organizationId, `${prefix}20`, { title: "E2E composed planning", species: "dog", breed: "Golden Retriever", items: [point, window] }, owner);
    expect(replay).toMatchObject({ outcome: "success", modelId: creation.modelId, replayed: true });
    const conflict = await createLitterPlanningModelCore(organizationId, `${prefix}20`, { title: "different payload", items: [point] }, owner);
    expect(conflict).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    const invalidWindow = await createLitterPlanningModelCore(organizationId, `${prefix}21`, { title: "invalid", items: [{ ...window, displayOrder: 2, windowStartsOffsetDays: 2, windowEndsOffsetDays: 1 }] }, owner);
    expect(invalidWindow).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    const invalidRequired = await createLitterPlanningModelCore(organizationId, `${prefix}22`, { title: "invalid", items: [{ ...point, displayOrder: 2, isSelectedByDefault: false }] }, owner);
    expect(invalidRequired).toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    const crossOrganization = await createLitterPlanningModelCore(organizationId, `${prefix}23`, { title: "foreign", items: [{ ...point, organizationTemplateId: ids.foreignTemplate }] }, owner);
    expect(crossOrganization).toMatchObject({ outcome: "error" });
    expect(sql(`select count(*) from public.litter_planning_models where title='foreign';`)).toBe("0");

    const replaced = await replaceLitterPlanningModelCore(creation.modelId, `${prefix}24`, 1, { title: "E2E changed", items: [point] }, owner);
    expect(replaced).toMatchObject({ outcome: "success", revision: 2 });
    expect(sql(`select count(*) from public.litter_planning_model_items where model_id=${q(creation.modelId)}::uuid;`)).toBe("1");
    const stale = await replaceLitterPlanningModelCore(creation.modelId, `${prefix}25`, 1, { title: "stale", items: [point] }, owner);
    expect(stale).toMatchObject({ outcome: "error", error: { code: "stale_revision" } });
    const concurrent = await Promise.all([setLitterPlanningModelActiveCore(creation.modelId, `${prefix}26`, 2, false, owner), setLitterPlanningModelActiveCore(creation.modelId, `${prefix}27`, 2, false, owner)]);
    expect(concurrent.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(concurrent.filter((result) => result.outcome === "error")).toHaveLength(1);

    const grants = JSON.parse(sql(`select json_agg(json_build_object('table_name',table_name,'privilege_type',privilege_type))::text from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name='litter_planning_model_commands';`));
    expect(grants ?? []).toEqual([]);
    expect(sql(`select count(*) from pg_policies where schemaname='public' and tablename='litter_planning_model_commands';`)).toBe("0");
    expect(sql(`select count(*) from pg_policies where schemaname='public' and tablename='litter_planning_models' and policyname='litter_planning_models_select_member';`)).toBe("1");
  } finally {
    cleanup();
    for (const [table, count] of Object.entries(counts())) expect(count, `${table} fixtures must be hard-deleted`).toBe(0);
  }
});
