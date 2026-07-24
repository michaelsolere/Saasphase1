import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";
import { runE2eSqlSync } from "./helpers/supabase";

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const ids = { mother: "b2000000-0000-4000-8000-000000000001", litter: "b2000000-0000-4000-8000-000000000002", template: "b2000000-0000-4000-8000-000000000003", model: "b2000000-0000-4000-8000-000000000004", ovulation: "b2000000-0000-4000-8000-000000000005", mating: "b2000000-0000-4000-8000-000000000006", window: "b2000000-0000-4000-8000-000000000007", pending: "b2000000-0000-4000-8000-000000000008", command: "b2000000-0000-4000-8000-000000000009", secondModel: "b2000000-0000-4000-8000-000000000010", secondItem: "b2000000-0000-4000-8000-000000000011", secondCommand: "b2000000-0000-4000-8000-000000000012", replaceCommand: "b2000000-0000-4000-8000-000000000013" };
const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value}'`;

function cleanup() { sql(`delete from public.litter_plan_application_commands where litter_id=${q(ids.litter)}::uuid; delete from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid; delete from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid; delete from public.litter_plans where litter_id=${q(ids.litter)}::uuid; delete from public.litter_planning_model_commands where model_id in (${q(ids.model)}::uuid,${q(ids.secondModel)}::uuid); delete from public.litter_planning_model_items where model_id in (${q(ids.model)}::uuid,${q(ids.secondModel)}::uuid); delete from public.litter_planning_models where id in (${q(ids.model)}::uuid,${q(ids.secondModel)}::uuid); delete from public.litter_care_task_templates where id=${q(ids.template)}::uuid; delete from public.litters where id=${q(ids.litter)}::uuid; delete from public.animals where id=${q(ids.mother)}::uuid;`); }

test.afterEach(() => { cleanup(); expect(Number(sql(`select count(*) from public.litter_plan_application_commands where client_command_id=${q(ids.command)}::uuid;`))).toBe(0); });

test("instantiates corrected ovulation anchors, explicit mating and pending anchors", async () => {
  cleanup();
  sql(`insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by) values(${q(ids.mother)}::uuid,${q(org)}::uuid,'B2 mother','dog','Golden Retriever','female','breeding','owned',${q(owner)}::uuid,${q(owner)}::uuid);
  insert into public.litters(id,organization_id,name,species,breed,mother_id,status,mating_date,mating_date_2,expected_birth_date,created_by,updated_by) values(${q(ids.litter)}::uuid,${q(org)}::uuid,'B2 litter','dog','Golden Retriever',${q(ids.mother)}::uuid,'birth_expected','2026-06-10','2026-06-12','2026-08-10',${q(owner)}::uuid,${q(owner)}::uuid);
  insert into public.litter_care_task_templates(id,organization_id,title,category,target_scope,anchor_type,offset_days,species,revision,created_by,updated_by) values(${q(ids.template)}::uuid,${q(org)}::uuid,'B2 template','other','litter','estimated_ovulation',0,'dog',1,${q(owner)}::uuid,${q(owner)}::uuid);
  insert into public.litter_planning_models(id,organization_id,title,species,breed,revision,created_by,updated_by) values(${q(ids.model)}::uuid,${q(org)}::uuid,'B2 model','dog','Golden Retriever',1,${q(owner)}::uuid,${q(owner)}::uuid),(${q(ids.secondModel)}::uuid,${q(org)}::uuid,'B2 second model','dog','Golden Retriever',1,${q(owner)}::uuid,${q(owner)}::uuid);
  insert into public.litter_planning_model_items(id,organization_id,model_id,organization_template_id,item_kind,priority,anchor_type,point_offset_days,window_starts_offset_days,window_ends_offset_days,display_order,is_required,is_selected_by_default,created_by,updated_by) values
  (${q(ids.ovulation)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','estimated_ovulation',20,null,null,0,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
  (${q(ids.mating)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','first_mating',20,null,null,1,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
  (${q(ids.window)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'window','normal','estimated_ovulation',null,5,8,2,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
  (${q(ids.pending)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','actual_birth',1,null,null,3,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
  (${q(ids.secondItem)}::uuid,${q(org)}::uuid,${q(ids.secondModel)}::uuid,${q(ids.template)}::uuid,'task','normal','expected_birth',2,null,null,0,true,true,${q(owner)}::uuid,${q(owner)}::uuid);`);
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  expect((await client.auth.signInWithPassword({ email: "e2e-owner@saasphase1.invalid", password: "LocalE2EOwner-2026!" })).error).toBeNull();
  const result = await client.rpc("apply_litter_planning_model", { p_litter_id: ids.litter, p_planning_model_id: ids.model, p_client_command_id: ids.command, p_expected_model_revision: 1, p_expected_plan_revision: null, p_selected_model_item_ids: null, p_timezone_name: "Europe/Paris" });
  expect(result.error).toBeNull(); expect(result.data?.[0]?.outcome).toBe("success");
  const firstPlanRevision = result.data?.[0]?.revision;
  expect(firstPlanRevision).toBe(1);
  const rows = JSON.parse(sql(`select json_agg(json_build_object('anchor',anchor_type,'source',anchor_resolution_source,'sourceDate',anchor_source_date_snapshot,'adjustment',anchor_adjustment_days,'date',anchor_date_snapshot,'state',materialization_state) order by display_order)::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid;`));
  expect(rows[0]).toMatchObject({ anchor: "estimated_ovulation", source: "first_mating_minus_24h", sourceDate: "2026-06-10", adjustment: -1, date: "2026-06-09", state: "materialized" });
  expect(rows[1]).toMatchObject({ anchor: "first_mating", source: "first_mating", adjustment: 0, date: "2026-06-10" }); expect(rows[3].state).toBe("pending_anchor");
  expect(JSON.parse(sql(`select json_agg(planned_for order by planned_for)::text from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid and item_kind='task';`))).toEqual(["2026-06-29", "2026-06-30"]);
  expect(JSON.parse(sql(`select json_build_object('start',suggested_starts_on,'end',suggested_ends_on,'retainedStart',retained_starts_on,'retainedEnd',retained_ends_on)::text from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid and item_kind='window';`))).toEqual({ start: "2026-06-14", end: "2026-06-17", retainedStart: "2026-06-14", retainedEnd: "2026-06-17" });
  const snapshotBeforeReplacement = JSON.parse(sql(`select json_build_object('sourceItemId',source_model_item_id,'sourceRevision',source_planning_model_revision,'title',title,'anchorDate',anchor_date_snapshot,'displayOrder',display_order)::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and source_model_item_id=${q(ids.ovulation)}::uuid;`));
  const replacement = await client.rpc("replace_litter_planning_model", { p_model_id: ids.model, p_client_command_id: ids.replaceCommand, p_expected_revision: 1, p_title: "B2 model replaced", p_description: null, p_species: "dog", p_breed: "Golden Retriever", p_items: [{ organizationTemplateId: ids.template, itemKind: "task", priority: "normal", anchorType: "estimated_ovulation", pointOffsetDays: 99, displayOrder: 0, isRequired: true, isSelectedByDefault: true }] });
  expect(replacement.error).toBeNull(); expect(replacement.data?.[0]?.outcome).toBe("success"); expect(replacement.data?.[0]?.revision).toBe(2);
  expect(Number(sql(`select count(*) from public.litter_planning_model_items where id=${q(ids.ovulation)}::uuid;`))).toBe(0);
  expect(JSON.parse(sql(`select json_build_object('sourceItemId',source_model_item_id,'sourceRevision',source_planning_model_revision,'title',title,'anchorDate',anchor_date_snapshot,'displayOrder',display_order)::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and source_model_item_id=${q(ids.ovulation)}::uuid;`))).toEqual(snapshotBeforeReplacement);
  const secondApplication = await client.rpc("apply_litter_planning_model", { p_litter_id: ids.litter, p_planning_model_id: ids.secondModel, p_client_command_id: ids.secondCommand, p_expected_model_revision: 1, p_expected_plan_revision: firstPlanRevision!, p_selected_model_item_ids: null, p_timezone_name: "Europe/Paris" });
  expect(secondApplication.error).toBeNull(); expect(secondApplication.data?.[0]?.outcome).toBe("success"); expect(secondApplication.data?.[0]?.revision).toBe(2);
  expect(JSON.parse(sql(`select json_agg(json_build_object('displayOrder',display_order,'sourceDisplayOrder',source_model_display_order,'modelId',source_planning_model_id) order by display_order)::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid;`))).toEqual([
    { displayOrder: 0, sourceDisplayOrder: 0, modelId: ids.model }, { displayOrder: 1, sourceDisplayOrder: 1, modelId: ids.model }, { displayOrder: 2, sourceDisplayOrder: 2, modelId: ids.model }, { displayOrder: 3, sourceDisplayOrder: 3, modelId: ids.model }, { displayOrder: 4, sourceDisplayOrder: 0, modelId: ids.secondModel },
  ]);
  expect(sql(`select count(*)=count(distinct display_order) from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid;`)).toBe("t");
});
