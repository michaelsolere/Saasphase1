import { expect, test } from "@playwright/test";

import {
  importLitterPlanningModelLibraryModelsCore,
  listLitterPlanningModelLibraryCore,
} from "../../src/features/litter-journal/litter-planning-model-library-core";
import { getLitterPlanningModelCore } from "../../src/features/litter-journal/litter-planning-models-core";
import { createAuthenticatedSupabaseClient, runE2eSqlSync } from "./helpers/supabase";

// Runs through the protected preserve-demo path: every fixture uses this exact
// prefix and is hard-deleted in finally without touching growth-comparison.
const organizationId = "20000000-0000-4000-8000-000000000001";
const modelCode = "e2e-library-recurrence";
const commandId = "e7280002-0000-4000-8000-000000000001";

function sql(statement: string) { return runE2eSqlSync(statement); }

function cleanup() {
  sql(`
    begin;
    delete from public.litter_planning_model_library_import_commands where client_command_id = '${commandId}'::uuid;
    delete from public.litter_planning_model_item_time_slots where model_item_id in (
      select id from public.litter_planning_model_items where model_id in (
        select id from public.litter_planning_models where organization_id = '${organizationId}'::uuid and library_model_code = '${modelCode}'
      )
    );
    delete from public.litter_planning_model_items where model_id in (
      select id from public.litter_planning_models where organization_id = '${organizationId}'::uuid and library_model_code = '${modelCode}'
    );
    delete from public.litter_planning_models where organization_id = '${organizationId}'::uuid and library_model_code = '${modelCode}';
    delete from public.litter_planning_model_library_item_time_slots where library_model_item_id in (
      select id from public.litter_planning_model_library_items where library_model_code = '${modelCode}'
    );
    delete from public.litter_planning_model_library_items where library_model_code = '${modelCode}';
    delete from public.litter_planning_model_library_models where code = '${modelCode}';
    commit;
  `);
}

test("importe fidèlement un suivi récurrent global sans créer de planning", async () => {
  cleanup();
  try {
    const plansBefore = Number(sql(`select count(*) from public.litter_plans where organization_id='${organizationId}'::uuid`));
    sql(`
      insert into public.litter_planning_model_library_models(code,version,family_code,variant_code,title,species,sort_order,is_available)
      values ('${modelCode}',1,'e2e-library','recurrence','E2E bibliothèque récurrente','dog',999,true);
      insert into public.litter_planning_model_library_items(
        library_model_code,library_model_version,library_template_code,library_template_version,item_kind,priority,anchor_type,
        recurrence_kind,recurrence_interval_days,recurrence_starts_offset_days,recurrence_end_kind,recurrence_day_count,
        initial_materialization_horizon_days,absolute_max_occurrences,display_order,is_required,is_selected_by_default
      ) values ('${modelCode}',1,'dog-temperature-monitoring-period',1,'recurring_task','important','expected_birth','daily_interval',1,-5,'fixed_recurrence_day_count',5,7,10,0,true,true);
      insert into public.litter_planning_model_library_item_time_slots(library_model_item_id,slot_no,local_time)
      select id, 1, '08:00'::time from public.litter_planning_model_library_items where library_model_code='${modelCode}';
      insert into public.litter_planning_model_library_item_time_slots(library_model_item_id,slot_no,local_time)
      select id, 2, '20:00'::time from public.litter_planning_model_library_items where library_model_code='${modelCode}';
    `);
    const owner = await createAuthenticatedSupabaseClient();
    const listed = await listLitterPlanningModelLibraryCore({ organizationId }, owner);
    expect(listed).toMatchObject({ outcome: "success" });
    if (listed.outcome !== "success") throw new Error("library read failed");
    expect(listed.models.find((model) => model.code === modelCode)?.items).toMatchObject([{
      itemKind: "recurring_task", recurrenceKind: "daily_interval", recurrenceIntervalDays: 1,
      recurrenceStartsOffsetDays: -5, recurrenceEndKind: "fixed_recurrence_day_count",
      recurrenceDayCount: 5, initialMaterializationHorizonDays: 7, absoluteMaxOccurrences: 10,
      timeSlots: ["08:00:00", "20:00:00"],
    }]);
    const imported = await importLitterPlanningModelLibraryModelsCore({ organizationId, clientCommandId: commandId, selection: [{ code: modelCode, version: 1 }], isActive: true }, owner);
    expect(imported).toMatchObject({ outcome: "success", importedCount: 1, replayed: false });
    if (imported.outcome !== "success") throw new Error("library import failed");
    const model = await getLitterPlanningModelCore(imported.models[0]!.modelId, owner);
    expect(model).toMatchObject({ outcome: "success" });
    if (model.outcome !== "success") throw new Error("imported model read failed");
    expect(model.model.items).toMatchObject([{
      itemKind: "recurring_task", recurrenceKind: "daily_interval", recurrenceIntervalDays: 1,
      recurrenceStartsOffsetDays: -5, recurrenceEndKind: "fixed_recurrence_day_count",
      recurrenceDayCount: 5, initialMaterializationHorizonDays: 7, absoluteMaxOccurrences: 10,
      timeSlots: ["08:00:00", "20:00:00"],
    }]);
    expect(await importLitterPlanningModelLibraryModelsCore({ organizationId, clientCommandId: commandId, selection: [{ code: modelCode, version: 1 }], isActive: true }, owner)).toMatchObject({ outcome: "success", replayed: true });
    expect(Number(sql(`select count(*) from public.litter_plans where organization_id='${organizationId}'::uuid`))).toBe(plansBefore);
  } finally {
    cleanup();
    expect(Number(sql(`select count(*) from public.litter_planning_model_library_models where code='${modelCode}'`))).toBe(0);
    expect(Number(sql(`select count(*) from public.litter_planning_model_library_items where library_model_code='${modelCode}'`))).toBe(0);
    expect(Number(sql(`select count(*) from public.litter_planning_model_library_item_time_slots slot join public.litter_planning_model_library_items item on item.id=slot.library_model_item_id where item.library_model_code='${modelCode}'`))).toBe(0);
  }
});
