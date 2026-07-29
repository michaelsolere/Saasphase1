import { expect, test } from "@playwright/test";

import {
  parseLitterPlanningModelItems,
  type LitterPlanningModelItemInput,
} from "../../src/features/litter-journal/litter-planning-models-core";
import {
  selectMaternalTemperaturePlanningCandidate,
} from "../../src/features/litter-journal/maternal-observations-core";
import {
  convertLitterPlanningModelEditorItemKind,
  createEmptyLitterPlanningModelEditorItem,
  duplicateLitterPlanningModelEditorItem,
  validateLitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorTemplateOption,
} from "../../src/features/settings/litter-planning-model-editor-draft";

const template: LitterPlanningModelEditorTemplateOption = {
  id: "9f290001-0000-4000-8000-000000000001",
  title: "Surveillance de la température",
  category: "maternal_health",
  targetScope: "mother",
  anchorType: "expected_birth",
  offsetDays: -5,
  species: "dog",
  breed: "Golden Retriever",
  isActive: true,
};

function recurringItem(
  overrides: Partial<LitterPlanningModelItemInput> = {},
): LitterPlanningModelItemInput {
  return {
    organizationTemplateId: template.id,
    itemKind: "recurring_task",
    priority: "important",
    anchorType: "expected_birth",
    recurrenceKind: "daily_interval",
    recurrenceIntervalDays: 1,
    recurrenceStartsOffsetDays: -5,
    recurrenceEndKind: "fixed_recurrence_day_count",
    recurrenceDayCount: 5,
    initialMaterializationHorizonDays: 5,
    absoluteMaxOccurrences: 10,
    timeSlots: ["08:00", "18:00"],
    completionFactKind: "maternal_temperature_observation",
    displayOrder: 0,
    isRequired: true,
    isSelectedByDefault: true,
    ...overrides,
  };
}

test("valide, normalise et copie fidèlement la configuration explicite", () => {
  const input = recurringItem();
  const parsed = parseLitterPlanningModelItems([input]);
  expect(parsed).toEqual([input]);

  const draftItem = {
    ...createEmptyLitterPlanningModelEditorItem(template, 0, "recurring_task"),
    completionFactKind: "maternal_temperature_observation" as const,
  };
  const duplicated = duplicateLitterPlanningModelEditorItem([draftItem], draftItem.key);
  expect(duplicated).toHaveLength(2);
  expect(duplicated[1]?.completionFactKind).toBe(
    "maternal_temperature_observation",
  );
  expect(duplicated[1]?.timeSlots).not.toBe(draftItem.timeSlots);
});

test("rejette les combinaisons incompatibles et retire la règle lors d’une conversion", () => {
  expect(
    parseLitterPlanningModelItems([
      recurringItem({
        itemKind: "task",
        pointOffsetDays: 0,
        recurrenceKind: undefined,
        recurrenceIntervalDays: undefined,
        recurrenceStartsOffsetDays: undefined,
        recurrenceEndKind: undefined,
        recurrenceDayCount: undefined,
        initialMaterializationHorizonDays: undefined,
        absoluteMaxOccurrences: undefined,
        timeSlots: undefined,
      }),
    ]),
  ).toBeNull();

  const incompatibleTemplate = {
    ...template,
    id: "9f290001-0000-4000-8000-000000000002",
    category: "other",
  };
  const item = {
    ...createEmptyLitterPlanningModelEditorItem(
      incompatibleTemplate,
      0,
      "recurring_task",
    ),
    completionFactKind: "maternal_temperature_observation" as const,
  };
  const draft: LitterPlanningModelEditorDraft = {
    mode: "create",
    modelId: null,
    expectedRevision: null,
    title: "Test température",
    description: "",
    species: "dog",
    breed: "Golden Retriever",
    isActive: false,
    sourceModelId: null,
    sourceTitle: null,
    sourceOriginLabel: null,
    libraryModelCode: null,
    libraryModelVersion: null,
    items: [item],
  };
  const validation = validateLitterPlanningModelEditorDraft(draft, [
    incompatibleTemplate,
  ]);
  expect(validation.ok).toBe(false);
  if (!validation.ok) {
    expect(validation.errors.map((error) => error.path)).toContain(
      `items.${item.key}.completionFactKind`,
    );
  }

  expect(
    convertLitterPlanningModelEditorItemKind(item, "window").completionFactKind,
  ).toBeNull();
});

test("choisit le créneau le plus proche sans muter les entrées", () => {
  const candidates = [
    { key: "matin", scheduledLocalTime: "08:00" },
    { key: "soir", scheduledLocalTime: "18:00" },
  ] as const;
  const before = structuredClone(candidates);

  expect(
    selectMaternalTemperaturePlanningCandidate("08:10", candidates),
  ).toEqual({ status: "selected", candidate: candidates[0] });
  expect(
    selectMaternalTemperaturePlanningCandidate("17:50", candidates),
  ).toEqual({ status: "selected", candidate: candidates[1] });
  expect(candidates).toEqual(before);
});

test("détecte une égalité stricte comme ambiguë", () => {
  expect(
    selectMaternalTemperaturePlanningCandidate("13:00", [
      { key: "matin", scheduledLocalTime: "08:00" },
      { key: "soir", scheduledLocalTime: "18:00" },
    ]),
  ).toEqual({ status: "ambiguous", candidate: null });
});
