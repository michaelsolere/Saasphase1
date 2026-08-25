import { expect, test } from "@playwright/test";

import {
  selectPostAdoptionAlertRows,
  type HomeTodayPostAdoptionRow,
} from "@/features/home-today/home-today-model";

const NOW = "2026-08-25T12:00:00Z";

const row = (
  instanceId: string,
  overrides: Partial<HomeTodayPostAdoptionRow> = {},
): HomeTodayPostAdoptionRow => ({
  instanceId,
  milestone: "t1",
  animalName: "Nala",
  contactName: "fam. Fontaine",
  reservationId: `res-${instanceId}`,
  automationState: "active",
  reasonCode: null,
  scheduledAt: null,
  lastDispatchStatus: null,
  ...overrides,
});

test.describe("home-today post-adoption alerts", () => {
  test("a voluntary suspension requires a human decision", () => {
    const result = selectPostAdoptionAlertRows(
      [row("a", { automationState: "suspended", reasonCode: "member_suspended" })],
      NOW,
    );
    expect(result.decisionRequired).toHaveLength(1);
    expect(result.due).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
  });

  test("an uncertain dispatch outcome requires a human decision", () => {
    const result = selectPostAdoptionAlertRows(
      [row("b", { lastDispatchStatus: "uncertain" })],
      NOW,
    );
    expect(result.decisionRequired.map((entry) => entry.instanceId)).toEqual(["b"]);
  });

  test("a suspension caused by the questionnaire incident is not a decision signal", () => {
    const result = selectPostAdoptionAlertRows(
      [row("c", { automationState: "suspended", reasonCode: "questionnaire_incident" })],
      NOW,
    );
    expect(result.decisionRequired).toHaveLength(0);
    expect(result.ignored).toHaveLength(1);
  });

  test("rows whose scheduled date has arrived are due, past ones first", () => {
    const result = selectPostAdoptionAlertRows(
      [
        row("due-now", { scheduledAt: NOW }),
        row("due-past", { scheduledAt: "2026-08-20T09:00:00Z" }),
        row("future", { scheduledAt: "2026-09-01T09:00:00Z" }),
        row("no-date", { scheduledAt: null }),
      ],
      NOW,
    );
    expect(result.due.map((entry) => entry.instanceId)).toEqual([
      "due-past",
      "due-now",
    ]);
    expect(result.ignored.map((entry) => entry.instanceId)).toEqual([
      "future",
      "no-date",
    ]);
  });

  test("decision rows take precedence over due rows", () => {
    const result = selectPostAdoptionAlertRows(
      [row("d", { lastDispatchStatus: "uncertain", scheduledAt: "2026-08-01T00:00:00Z" })],
      NOW,
    );
    expect(result.decisionRequired).toHaveLength(1);
    expect(result.due).toHaveLength(0);
  });
});
