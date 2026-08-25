import { expect, test } from "@playwright/test";

import {
  buildUnifiedHistory,
  type UnifiedHistoryInputEntry,
} from "../../src/features/litter-journal/unified-history-model";

const input: UnifiedHistoryInputEntry[] = [
  {
    id: "obs-1",
    kind: "maternal_observation",
    label: "Observation de la mère",
    detail: "Appétit normal",
    occurredAt: "2026-06-25T18:15:00+02:00",
  },
  {
    id: "session-1",
    kind: "weighing_session",
    label: "Pesée J+11",
    detail: "8 mesures",
    occurredAt: "2026-06-25T09:42:00+02:00",
  },
  {
    id: "task-1",
    kind: "care_task",
    label: "Première sortie de caisse",
    detail: null,
    occurredAt: "2026-06-25T10:30:00+02:00",
  },
];

test("trie les entrées par date décroissante", () => {
  const history = buildUnifiedHistory(input);
  expect(history.map((entry) => entry.id)).toEqual([
    "obs-1",
    "task-1",
    "session-1",
  ]);
});

test("conserve le libellé et le détail de chaque entrée", () => {
  const history = buildUnifiedHistory(input);
  const observation = history.find((entry) => entry.id === "obs-1");
  expect(observation?.label).toBe("Observation de la mère");
  expect(observation?.detail).toBe("Appétit normal");
});

test("limite le nombre d'entrées retournées", () => {
  const many: UnifiedHistoryInputEntry[] = Array.from(
    { length: 80 },
    (_, index) => ({
      id: `entry-${index}`,
      kind: "care_task" as const,
      label: `Tâche ${index}`,
      detail: null,
      occurredAt: `2026-06-${String((index % 27) + 1).padStart(2, "0")}T08:00:00+02:00`,
    }),
  );
  expect(buildUnifiedHistory(many)).toHaveLength(50);
  expect(buildUnifiedHistory(many, 10)).toHaveLength(10);
});

test("retourne une liste vide sans entrée", () => {
  expect(buildUnifiedHistory([])).toEqual([]);
});
