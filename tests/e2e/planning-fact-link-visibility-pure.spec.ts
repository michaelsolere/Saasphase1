import { expect, test } from "@playwright/test";

import {
  formatMaternalTemperature,
  projectMaternalObservationSatisfiedTask,
  projectMaternalTemperatureObservationTaskFact,
  projectTaskCompletion,
} from "../../src/features/litter-journal/maternal-observation-task-links-core";

const observationSource = {
  id: "d7290002-0000-4000-8000-000000000050",
  client_command_id: "d7290002-0000-4000-8000-000000000051",
  resolution_command_id: "d7290002-0000-4000-8000-000000000052",
  observation_type: "temperature",
  observed_at: "2026-07-29T06:10:00.000Z",
  timezone_name: "Europe/Paris",
  numeric_value: 37.2,
  unit: "celsius",
  severity: "routine",
  note: "Observation réellement saisie",
} as const;

const taskSource = {
  id: "d7290002-0000-4000-8000-000000000060",
  resolution_command_id: "d7290002-0000-4000-8000-000000000061",
  title: "Relever la température de la mère",
  item_kind: "recurring_task",
  occurrence_no: 3,
  planned_for: "2026-07-29",
  scheduled_local_time: "08:00:00",
  schedule_timezone_name: "Europe/Paris",
} as const;

test("projette une tâche liée comme réalisée depuis le Journal sans identifiant interne", () => {
  const before = structuredClone(observationSource);
  const fact =
    projectMaternalTemperatureObservationTaskFact(observationSource);
  expect(fact).toEqual({
    source: "maternal_temperature_observation",
    observedAt: "2026-07-29T06:10:00.000Z",
    timezoneName: "Europe/Paris",
    numericValue: 37.2,
    unit: "celsius",
    severity: "routine",
    note: "Observation réellement saisie",
  });
  expect(projectTaskCompletion("done", "available", fact)).toEqual({
    completionOrigin: "maternal_temperature_observation",
    completionFact: fact,
  });
  expect(JSON.stringify(fact)).not.toMatch(
    /d7290002|observationId|command|resolution/i,
  );
  expect(observationSource).toEqual(before);
});

test("distingue manuel, inconnu et états non réalisés sans déduction textuelle", () => {
  const automaticResolutionNote =
    "Action satisfaite automatiquement par une température maternelle enregistrée dans le Journal.";

  expect(automaticResolutionNote).toContain("automatiquement");
  expect(projectTaskCompletion("done", "available", null)).toEqual({
    completionOrigin: "manual",
    completionFact: null,
  });
  expect(projectTaskCompletion("done", "unavailable", null)).toEqual({
    completionOrigin: "unknown",
    completionFact: null,
  });
  expect(projectTaskCompletion("cancelled", "available", null)).toEqual({
    completionOrigin: null,
    completionFact: null,
  });
  expect(projectTaskCompletion("not_applicable", "available", null)).toEqual({
    completionOrigin: null,
    completionFact: null,
  });
});

test("formate Celsius et Fahrenheit dans leur unité d’origine", () => {
  expect(
    formatMaternalTemperature({ numericValue: 37.2, unit: "celsius" }),
  ).toBe("37,2 °C");
  expect(
    formatMaternalTemperature({ numericValue: 98.6, unit: "fahrenheit" }),
  ).toBe("98,6 °F");
});

test("projette réciproquement l’observation vers la tâche sans identifiant et sans mutation", () => {
  const before = structuredClone(taskSource);
  const projection = projectMaternalObservationSatisfiedTask(taskSource);
  expect(projection).toEqual({
    taskTitle: "Relever la température de la mère",
    occurrenceNo: 3,
    plannedFor: "2026-07-29",
    scheduledLocalTime: "08:00:00",
    scheduleTimezoneName: "Europe/Paris",
  });
  expect(JSON.stringify(projection)).not.toMatch(
    /d7290002|taskId|command|resolution/i,
  );
  expect(taskSource).toEqual(before);
});

test("n’affiche un numéro d’occurrence que pour une récurrence", () => {
  expect(
    projectMaternalObservationSatisfiedTask({
      ...taskSource,
      item_kind: "task",
    }).occurrenceNo,
  ).toBeNull();
});
