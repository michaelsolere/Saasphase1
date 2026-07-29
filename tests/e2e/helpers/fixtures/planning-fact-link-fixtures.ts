import type { Json } from "../../../../src/types/database.types";
import type { SupabaseTestClient } from "../supabase";
import {
  createResolvedLitterCareTask,
  createTestAnimal,
  createTestLitter,
} from "./breeding-fixtures";
import {
  createE2eFixtureRegistry,
  type FixtureTable,
  type SqlExecutor,
} from "./fixture-registry";

type Registry = ReturnType<typeof createE2eFixtureRegistry>;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function registerRows(
  execute: SqlExecutor,
  registry: Registry,
  table: FixtureTable,
  where: string,
) {
  const raw = await execute(
    `select coalesce(json_agg(id::text order by id), '[]'::json)::text from public.${table} where ${where}`,
  );
  const ids = JSON.parse(String(raw).trim() || "[]") as string[];
  for (const id of ids) {
    if (!registry.has(table, id)) registry.register(table, id);
  }
  return ids;
}

export type PlanningFactLinkVisibilityFixtureIds = {
  mother: string;
  litter: string;
  template: string;
  model: string;
  plan: string;
  planItem: string;
  series: string;
  linkedTask: string;
  manualTask: string;
  linkedObservation: string;
  unlinkedObservation: string;
  link: string;
  observationCommands: string[];
  resolutionCommand: string;
};

export async function createPlanningFactLinkVisibilityFixtures(
  execute: SqlExecutor,
  registry: Registry,
  owner: SupabaseTestClient,
  input: {
    organizationId: string;
    ownerId: string;
    today: string;
    observedAt: string;
    prefix: string;
  },
): Promise<PlanningFactLinkVisibilityFixtureIds> {
  const ids = {
    mother: `${input.prefix}000000000001`,
    litter: `${input.prefix}000000000010`,
    template: `${input.prefix}000000000020`,
    modelCommand: `${input.prefix}000000000030`,
    applyCommand: `${input.prefix}000000000031`,
    linkedObservationCommand: `${input.prefix}000000000040`,
    unlinkedObservationCommand: `${input.prefix}000000000041`,
    manualTask: `${input.prefix}000000000050`,
  };

  const mother = await createTestAnimal(execute, registry, {
    id: ids.mother,
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    callName: "Mère visibilité lien E2E",
  });
  const litter = await createTestLitter(execute, registry, {
    id: ids.litter,
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    motherId: mother,
    name: "Portée visibilité lien E2E",
    expectedBirthDate: input.today,
  });

  await execute(`
    insert into public.litter_care_task_templates (
      id, organization_id, title, description, category, target_scope,
      anchor_type, offset_days, species, breed, is_active, sort_order,
      created_by, updated_by
    ) values (
      ${q(ids.template)}::uuid, ${q(input.organizationId)}::uuid,
      'Relever la température de la mère', 'Occurrence liée au Journal',
      'maternal_health', 'mother', 'expected_birth', 0, 'dog',
      'Golden Retriever', true, 0, ${q(input.ownerId)}::uuid,
      ${q(input.ownerId)}::uuid
    )
  `);
  registry.register("litter_care_task_templates", ids.template);

  const modelResult = await owner.rpc("create_litter_planning_model", {
    p_organization_id: input.organizationId,
    p_client_command_id: ids.modelCommand,
    p_title: "Modèle visibilité lien E2E",
    p_description: null,
    p_species: "dog",
    p_breed: "Golden Retriever",
    p_is_active: true,
    p_items: [
      {
        organizationTemplateId: ids.template,
        itemKind: "recurring_task",
        priority: "important",
        anchorType: "expected_birth",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: 0,
        recurrenceEndKind: "actual_birth",
        initialMaterializationHorizonDays: 1,
        absoluteMaxOccurrences: 30,
        timeSlots: ["08:00"],
        completionFactKind: "maternal_temperature_observation",
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
      },
    ] as unknown as Json,
  });
  if (modelResult.error || modelResult.data?.[0]?.outcome !== "success") {
    throw new Error(
      `Unable to create planning fixture model: ${modelResult.error?.message ?? modelResult.data?.[0]?.reason}`,
    );
  }
  const model = modelResult.data[0].model_id!;
  registry.register("litter_planning_models", model);
  await registerRows(
    execute,
    registry,
    "litter_planning_model_commands",
    `client_command_id = ${q(ids.modelCommand)}::uuid`,
  );
  const modelItems = await registerRows(
    execute,
    registry,
    "litter_planning_model_items",
    `model_id = ${q(model)}::uuid`,
  );
  await registerRows(
    execute,
    registry,
    "litter_planning_model_item_time_slots",
    `model_item_id in (${modelItems.map((id) => `${q(id)}::uuid`).join(", ")})`,
  );

  const application = await owner.rpc("apply_litter_planning_model", {
    p_litter_id: litter,
    p_planning_model_id: model,
    p_client_command_id: ids.applyCommand,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  if (application.error || application.data?.[0]?.outcome !== "success") {
    throw new Error(
      `Unable to apply planning fixture model: ${application.error?.message ?? application.data?.[0]?.reason}`,
    );
  }
  const plan = application.data[0].litter_plan_id!;
  registry.register("litter_plans", plan);
  await registerRows(
    execute,
    registry,
    "litter_plan_application_commands",
    `client_command_id = ${q(ids.applyCommand)}::uuid`,
  );
  const planItems = await registerRows(
    execute,
    registry,
    "litter_plan_items",
    `litter_plan_id = ${q(plan)}::uuid`,
  );
  const seriesIds = await registerRows(
    execute,
    registry,
    "litter_plan_series",
    `litter_plan_id = ${q(plan)}::uuid`,
  );
  await registerRows(
    execute,
    registry,
    "litter_plan_series_time_slots",
    `series_id in (${seriesIds.map((id) => `${q(id)}::uuid`).join(", ")})`,
  );
  const taskIds = await registerRows(
    execute,
    registry,
    "litter_care_tasks",
    `litter_id = ${q(litter)}::uuid`,
  );
  const linkedTask = taskIds[0]!;

  const linkedObservationResult = await owner.rpc(
    "record_maternal_observation",
    {
      p_litter_id: litter,
      p_client_command_id: ids.linkedObservationCommand,
      p_observed_at: input.observedAt,
      p_timezone_name: "Europe/Paris",
      p_observation_type: "temperature",
      p_numeric_value: 37.2,
      p_unit: "celsius",
      p_severity: "routine",
      p_note: "Mesure factuelle liée E2E",
    },
  );
  if (
    linkedObservationResult.error ||
    linkedObservationResult.data?.[0]?.outcome !== "success"
  ) {
    throw new Error(
      `Unable to record linked observation: ${linkedObservationResult.error?.message ?? linkedObservationResult.data?.[0]?.reason}`,
    );
  }
  const linkedObservation =
    linkedObservationResult.data[0].observation_id!;
  registry.register("maternal_observations", linkedObservation);
  const linkedCommands = await registerRows(
    execute,
    registry,
    "maternal_observation_commands",
    `client_command_id = ${q(ids.linkedObservationCommand)}::uuid`,
  );
  const links = await registerRows(
    execute,
    registry,
    "maternal_observation_task_links",
    `maternal_observation_id = ${q(linkedObservation)}::uuid`,
  );
  if (linkedObservationResult.data[0].match_status !== "linked") {
    const candidateState = await execute(`
      select json_agg(json_build_object(
        'taskId', task.id::text,
        'status', task.status,
        'plannedFor', task.planned_for,
        'scheduledLocalTime', task.scheduled_local_time,
        'timezoneName', task.schedule_timezone_name,
        'seriesState', series.state,
        'completionFactKind', item.completion_fact_kind
      ))::text
      from public.litter_care_tasks task
      left join public.litter_plan_series series
        on series.id = task.litter_plan_series_id
      left join public.litter_plan_items item
        on item.id = task.litter_plan_item_id
      where task.litter_id = ${q(litter)}::uuid
    `);
    throw new Error(
      `Linked observation produced ${linkedObservationResult.data[0].match_status}: ${String(candidateState).trim()}`,
    );
  }

  const automaticNote =
    "Action satisfaite automatiquement par une température maternelle enregistrée dans le Journal.";
  const manualTask = await createResolvedLitterCareTask(execute, registry, {
    id: ids.manualTask,
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    litterId: litter,
    day: input.today,
    title: "Tâche traitée manuellement",
    resolvedAt: input.observedAt,
    resolutionNote: automaticNote,
  });

  const unlinkedObservationResult = await owner.rpc(
    "record_maternal_observation",
    {
      p_litter_id: litter,
      p_client_command_id: ids.unlinkedObservationCommand,
      p_observed_at: input.observedAt,
      p_timezone_name: "Europe/Paris",
      p_observation_type: "temperature",
      p_numeric_value: 98.6,
      p_unit: "fahrenheit",
      p_severity: "watch",
      p_note: "Mesure Fahrenheit non liée E2E",
    },
  );
  if (
    unlinkedObservationResult.error ||
    unlinkedObservationResult.data?.[0]?.outcome !== "success"
  ) {
    throw new Error(
      `Unable to record unlinked observation: ${unlinkedObservationResult.error?.message ?? unlinkedObservationResult.data?.[0]?.reason}`,
    );
  }
  const unlinkedObservation =
    unlinkedObservationResult.data[0].observation_id!;
  registry.register("maternal_observations", unlinkedObservation);
  const unlinkedCommands = await registerRows(
    execute,
    registry,
    "maternal_observation_commands",
    `client_command_id = ${q(ids.unlinkedObservationCommand)}::uuid`,
  );
  await registerRows(
    execute,
    registry,
    "maternal_observation_task_links",
    `maternal_observation_id = ${q(unlinkedObservation)}::uuid`,
  );
  if (unlinkedObservationResult.data[0].match_status !== "no_candidate") {
    throw new Error(
      `Unlinked observation produced ${unlinkedObservationResult.data[0].match_status}`,
    );
  }

  const resolutionCommand = String(
    await execute(
      `select resolution_command_id::text from public.maternal_observation_task_links where id = ${q(links[0]!)}::uuid`,
    ),
  ).trim();

  return {
    mother,
    litter,
    template: ids.template,
    model,
    plan,
    planItem: planItems[0]!,
    series: seriesIds[0]!,
    linkedTask,
    manualTask,
    linkedObservation,
    unlinkedObservation,
    link: links[0]!,
    observationCommands: [...linkedCommands, ...unlinkedCommands],
    resolutionCommand,
  };
}
