import { expect, test } from "@playwright/test";

import {
  buildTodayActionQueue,
  type TodayQueueTaskInput,
} from "../../src/features/litter-journal/today-action-queue-model";

function task(overrides: Partial<TodayQueueTaskInput>): TodayQueueTaskInput {
  return {
    id: "task-1",
    title: "Tâche",
    detail: null,
    itemKind: "milestone",
    status: "planned",
    scheduledFor: null,
    scheduledEndsOn: null,
    suggestedFor: null,
    ...overrides,
  };
}

const TODAY = "2026-06-26";

test("classe en retard une tâche planifiée avant aujourd'hui", () => {
  const queue = buildTodayActionQueue(
    [task({ id: "late", scheduledFor: "2026-06-24" })],
    TODAY,
  );
  expect(queue[0]?.urgency).toBe("overdue");
});

test("place les retards avant les tâches du jour puis les planifiées", () => {
  const queue = buildTodayActionQueue(
    [
      task({ id: "later", scheduledFor: "2026-06-28" }),
      task({ id: "today", scheduledFor: TODAY }),
      task({ id: "late", scheduledFor: "2026-06-24" }),
    ],
    TODAY,
  );
  expect(queue.map((entry) => entry.task.id)).toEqual([
    "late",
    "today",
    "later",
  ]);
});

test("exclut les tâches résolues de la file à faire mais les expose séparément", () => {
  const queue = buildTodayActionQueue(
    [
      task({ id: "done", status: "resolved", scheduledFor: TODAY }),
      task({ id: "open", scheduledFor: TODAY }),
    ],
    TODAY,
  );
  expect(queue.map((entry) => entry.task.id)).toEqual(["open"]);
});

test("libelle l'échéance du jour et une date civile pour les autres jours", () => {
  const queue = buildTodayActionQueue(
    [
      task({ id: "today", scheduledFor: TODAY }),
      task({ id: "future", scheduledFor: "2026-06-28" }),
      task({ id: "undated" }),
    ],
    TODAY,
  );
  expect(queue.find((entry) => entry.task.id === "today")?.dueLabel).toBe(
    "Aujourd’hui",
  );
  expect(queue.find((entry) => entry.task.id === "future")?.dueLabel).toBe(
    "28 juin",
  );
  expect(queue.find((entry) => entry.task.id === "undated")?.dueLabel).toBeNull();
});

test("une tâche sans date reste planifiée avec urgence normale", () => {
  const queue = buildTodayActionQueue([task({ id: "undated" })], TODAY);
  expect(queue[0]?.urgency).toBe("upcoming");
});
