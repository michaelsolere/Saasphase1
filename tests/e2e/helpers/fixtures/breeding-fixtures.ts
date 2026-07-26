import { randomUUID } from "node:crypto";
import { type FixtureTable, type SqlExecutor, createE2eFixtureRegistry } from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;
type Base = { id?: string; organizationId: string; ownerId: string; namespace?: string };
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const id = (value?: string) => value ?? randomUUID();
const insert = async (execute: SqlExecutor, table: FixtureTable, values: Record<string, string | null>, registry: Registry) => {
  const entityId = values.id!; await execute(`insert into public.${table} (${Object.keys(values).join(",")}) values (${Object.values(values).map((value) => value === null ? "null" : q(value)).join(",")})`); registry.register(table, entityId); return entityId;
};
export async function createTestOrganization(execute: SqlExecutor, registry: Registry, overrides: Partial<{id:string;name:string;slug:string}> = {}) { const entityId=id(overrides.id); const ns=registry.namespace.replace(/[^a-z0-9]/gi,"-").toLowerCase().slice(-24); return insert(execute,"organizations",{id:entityId,name:overrides.name ?? `E2E ${registry.namespace}`,slug:overrides.slug ?? `e2e-${ns}-${entityId.slice(0,8)}`},registry); }
export async function createTestAnimal(execute: SqlExecutor, registry: Registry, input: Base & Partial<{callName:string;sex:"female"|"male"}>) { const entityId=id(input.id); return insert(execute,"animals",{id:entityId,organization_id:input.organizationId,call_name:input.callName ?? `E2E animal ${registry.namespace}`,species:"dog",breed:"Golden Retriever",sex:input.sex ?? "female",status:"breeding",ownership_status:"owned",created_by:input.ownerId,updated_by:input.ownerId},registry); }
export async function createTestLitter(execute: SqlExecutor, registry: Registry, input: Base & { motherId:string } & Partial<{name:string;fatherId:string;status:string;actualBirthDate:string;expectedBirthDate:string;matingDate:string;matingDate2:string;estimatedOvulationDate:string;pregnancyConfirmedAt:string}>) { const entityId=id(input.id); return insert(execute,"litters",{id:entityId,organization_id:input.organizationId,name:input.name ?? `E2E litter ${registry.namespace}`,species:"dog",breed:"Golden Retriever",mother_id:input.motherId,father_id:input.fatherId ?? null,status:input.status ?? "birth_expected",actual_birth_date:input.actualBirthDate ?? null,expected_birth_date:input.expectedBirthDate ?? null,mating_date:input.matingDate ?? null,mating_date_2:input.matingDate2 ?? null,estimated_ovulation_date:input.estimatedOvulationDate ?? null,pregnancy_confirmed_at:input.pregnancyConfirmedAt ?? null,created_by:input.ownerId,updated_by:input.ownerId},registry); }
export async function createTestReproductiveCycle(
  execute: SqlExecutor,
  registry: Registry,
  input: Base & {
    motherId: string;
  } & Partial<{
    status: string;
    startedOn: string;
    endedOn: string | null;
    notes: string | null;
    litterId: string | null;
  }>,
) {
  const entityId = id(input.id);
  return insert(
    execute,
    "reproductive_cycles",
    {
      id: entityId,
      organization_id: input.organizationId,
      mother_id: input.motherId,
      species: "dog",
      breed: "Golden Retriever",
      status: input.status ?? "planned",
      started_on: input.startedOn ?? "2026-07-01",
      ended_on: input.endedOn ?? null,
      litter_id: input.litterId ?? null,
      notes: input.notes ?? `E2E cycle ${registry.namespace}`,
      created_by: input.ownerId,
      updated_by: input.ownerId,
    },
    registry,
  );
}
export async function createTestProgesteroneMeasurement(
  execute: SqlExecutor,
  registry: Registry,
  input: Base & {
    cycleId: string;
  } & Partial<{
    measuredAt: string;
    value: string;
    unit: string;
    note: string | null;
  }>,
) {
  const entityId = id(input.id);
  return insert(
    execute,
    "progesterone_measurements",
    {
      id: entityId,
      organization_id: input.organizationId,
      cycle_id: input.cycleId,
      measured_at: input.measuredAt ?? "2026-07-02T08:00:00.000Z",
      value: input.value ?? "2.5",
      unit: input.unit ?? "ng_ml",
      note: input.note ?? `E2E progesterone ${registry.namespace}`,
      created_by: input.ownerId,
      updated_by: input.ownerId,
    },
    registry,
  );
}
type TaskInput = Base & {litterId:string; title?:string; day:string; priority?:string; itemKind?:string; category?:string; source?:string; systemTemplateCode?:string|null; anchorType?:string|null; anchorDate?:string|null; offsetDays?:number|null; scheduledLocalTime?:string|null; suggestedFor?:string|null; scheduleSource?:string; isScheduleLocked?:boolean; revisionNo?:number};
async function task(execute:SqlExecutor, registry:Registry, input:TaskInput, extra:Record<string,string|null>) { const entityId=id(input.id); return insert(execute,"litter_care_tasks",{id:entityId,organization_id:input.organizationId,litter_id:input.litterId,source:input.source ?? "manual",system_template_code:input.systemTemplateCode ?? null,anchor_type:input.anchorType ?? null,anchor_date:input.anchorDate ?? null,offset_days:input.offsetDays != null ? String(input.offsetDays) : null,occurrence_no:"1",item_kind:input.itemKind ?? "task",category:input.category ?? "veterinary",target_scope:"litter",title:input.title ?? `E2E task ${registry.namespace}`,planned_for:input.day,priority:input.priority ?? "normal",scheduled_local_time:input.scheduledLocalTime ?? null,suggested_for:input.suggestedFor ?? null,schedule_source:input.scheduleSource ?? "suggested",is_schedule_locked:input.isScheduleLocked ? "true" : "false",revision_no:input.revisionNo != null ? String(input.revisionNo) : "0",status:"planned",creation_command_id:randomUUID(),created_by:input.ownerId,updated_by:input.ownerId,...extra},registry); }
export const createPlannedLitterCareTask = (execute:SqlExecutor, registry:Registry, input:TaskInput) => task(execute,registry,input,{});
export async function createPlannedLitterCareWindow(execute:SqlExecutor, registry:Registry, input:TaskInput & {startsOn:string; endsOn:string; retainedStartsLocalTime?:string|null; retainedEndsLocalTime?:string|null}) { if (input.endsOn < input.startsOn) throw new Error("E2E window end must not precede start"); const entityId=id(input.id); return insert(execute,"litter_care_tasks",{id:entityId,organization_id:input.organizationId,litter_id:input.litterId,source:"manual",occurrence_no:"1",item_kind:"window",category:input.category ?? "veterinary",target_scope:"litter",title:input.title ?? `E2E window ${registry.namespace}`,planned_for:null,retained_starts_on:input.startsOn,retained_ends_on:input.endsOn,retained_starts_local_time:input.retainedStartsLocalTime ?? null,retained_ends_local_time:input.retainedEndsLocalTime ?? null,priority:input.priority ?? "normal",schedule_source:input.scheduleSource ?? "suggested",is_schedule_locked:input.isScheduleLocked ? "true" : "false",revision_no:input.revisionNo != null ? String(input.revisionNo) : "0",status:"planned",creation_command_id:randomUUID(),created_by:input.ownerId,updated_by:input.ownerId},registry); }
export const createResolvedLitterCareTask = (execute:SqlExecutor, registry:Registry, input:TaskInput & {resolvedAt?:string}) => task(execute,registry,input,{status:"done",resolution_command_id:randomUUID(),resolved_at:input.resolvedAt ?? new Date().toISOString(),resolved_timezone_name:"Europe/Paris",resolved_by:input.ownerId});
