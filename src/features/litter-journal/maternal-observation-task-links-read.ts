import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import {
  projectMaternalObservationSatisfiedTask,
  projectMaternalTemperatureObservationTaskFact,
  type MaternalObservationSatisfiedTask,
  type MaternalObservationTaskLinkReadAvailability,
  type MaternalTemperatureObservationTaskFact,
} from "./maternal-observation-task-links-core";

type Supabase = SupabaseClient<Database>;

export type MaternalObservationTaskLinkReadResult = {
  availability: MaternalObservationTaskLinkReadAvailability;
  factByTaskId: ReadonlyMap<string, MaternalTemperatureObservationTaskFact>;
  satisfiedTaskByObservationId: ReadonlyMap<
    string,
    MaternalObservationSatisfiedTask
  >;
};

type ReadInput = {
  organizationId: string;
  litterId?: string;
  taskIds?: readonly string[];
  observationIds?: readonly string[];
};

function unavailable(): MaternalObservationTaskLinkReadResult {
  return {
    availability: "unavailable",
    factByTaskId: new Map(),
    satisfiedTaskByObservationId: new Map(),
  };
}

/**
 * Centralized, read-only loader for the durable fact/task relation.
 * It performs one relation read and at most one batch read per requested side.
 */
async function loadMaternalObservationTaskLinksUnsafe(
  supabase: Supabase,
  input: Readonly<ReadInput>,
): Promise<MaternalObservationTaskLinkReadResult> {
  const taskIds = [...new Set(input.taskIds ?? [])];
  const observationIds = [...new Set(input.observationIds ?? [])];
  if (taskIds.length === 0 && observationIds.length === 0) {
    return {
      availability: "available",
      factByTaskId: new Map(),
      satisfiedTaskByObservationId: new Map(),
    };
  }

  let linksQuery = supabase
    .from("maternal_observation_task_links")
    .select("maternal_observation_id, litter_care_task_id")
    .eq("organization_id", input.organizationId);
  if (input.litterId) {
    linksQuery = linksQuery.eq("litter_id", input.litterId);
  }
  if (taskIds.length > 0 && observationIds.length === 0) {
    linksQuery = linksQuery.in("litter_care_task_id", taskIds);
  } else if (observationIds.length > 0 && taskIds.length === 0) {
    linksQuery = linksQuery.in("maternal_observation_id", observationIds);
  } else {
    linksQuery = linksQuery.or(
      `litter_care_task_id.in.(${taskIds.join(",")}),maternal_observation_id.in.(${observationIds.join(",")})`,
    );
  }

  const links = await linksQuery;
  if (links.error) {
    console.error("maternal_observation_task_links_read_failed", links.error);
    return unavailable();
  }

  const selectedLinks = links.data ?? [];
  const linkedObservationIds = [
    ...new Set(
      selectedLinks
        .filter((link) => taskIds.includes(link.litter_care_task_id))
        .map((link) => link.maternal_observation_id),
    ),
  ];
  const linkedTaskIds = [
    ...new Set(
      selectedLinks
        .filter((link) =>
          observationIds.includes(link.maternal_observation_id),
        )
        .map((link) => link.litter_care_task_id),
    ),
  ];

  const [observations, tasks] = await Promise.all([
    linkedObservationIds.length > 0
      ? supabase
          .from("maternal_observations")
          .select(
            "id, observation_type, observed_at, timezone_name, numeric_value, unit, severity, note",
          )
          .eq("organization_id", input.organizationId)
          .in("id", linkedObservationIds)
      : Promise.resolve({ data: [], error: null }),
    linkedTaskIds.length > 0
      ? supabase
          .from("litter_care_tasks")
          .select(
            "id, title, item_kind, occurrence_no, planned_for, scheduled_local_time, schedule_timezone_name",
          )
          .eq("organization_id", input.organizationId)
          .in("id", linkedTaskIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (observations.error || tasks.error) {
    console.error("maternal_observation_task_link_targets_read_failed", {
      observations: observations.error,
      tasks: tasks.error,
    });
    return unavailable();
  }

  const observationsById = new Map(
    (observations.data ?? []).map((observation) => [
      observation.id,
      observation,
    ]),
  );
  const tasksById = new Map(
    (tasks.data ?? []).map((task) => [task.id, task]),
  );
  const factByTaskId = new Map<
    string,
    MaternalTemperatureObservationTaskFact
  >();
  const satisfiedTaskByObservationId = new Map<
    string,
    MaternalObservationSatisfiedTask
  >();

  for (const link of selectedLinks) {
    if (taskIds.includes(link.litter_care_task_id)) {
      const observation = observationsById.get(
        link.maternal_observation_id,
      );
      const fact = observation
        ? projectMaternalTemperatureObservationTaskFact(observation)
        : null;
      if (!fact) {
        console.error("maternal_observation_task_link_fact_invalid");
        return unavailable();
      }
      factByTaskId.set(link.litter_care_task_id, fact);
    }

    if (observationIds.includes(link.maternal_observation_id)) {
      const task = tasksById.get(link.litter_care_task_id);
      if (!task) {
        console.error("maternal_observation_task_link_task_missing");
        return unavailable();
      }
      satisfiedTaskByObservationId.set(
        link.maternal_observation_id,
        projectMaternalObservationSatisfiedTask(task),
      );
    }
  }

  return {
    availability: "available",
    factByTaskId,
    satisfiedTaskByObservationId,
  };
}

export async function loadMaternalObservationTaskLinks(
  supabase: Supabase,
  input: Readonly<ReadInput>,
): Promise<MaternalObservationTaskLinkReadResult> {
  try {
    return await loadMaternalObservationTaskLinksUnsafe(supabase, input);
  } catch (error) {
    console.error("maternal_observation_task_links_read_threw", error);
    return unavailable();
  }
}
