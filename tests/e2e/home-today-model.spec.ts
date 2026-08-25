import { expect, test } from "@playwright/test";

import {
  buildHomeTodayTabs,
  formatHomeTodayCivilDate,
  homeTodayDueLabel,
  selectPostAdoptionAlertRows,
  type HomeTodayItem,
} from "@/features/home-today/home-today-model";

const item = (overrides: Partial<HomeTodayItem>): HomeTodayItem => ({
  id: "item-1",
  title: "Famille Martin",
  href: "/candidatures/item-1",
  meta: null,
  tagLabel: null,
  tagTone: "amber",
  dueDate: null,
  ...overrides,
});

const baseInput = {
  key: "applications",
  title: "Candidatures & soumissions à examiner",
  zoneLabel: "Entrée en relation",
  tab: "adopter" as const,
  items: [] as HomeTodayItem[],
  seeAllHref: "/candidatures",
};

test.describe("home-today-model", () => {
  test("excludes empty sections and slices items to three with counts", () => {
    const tabs = buildHomeTodayTabs({
      sections: [
        { ...baseInput, items: [] },
        {
          ...baseInput,
          key: "payments",
          title: "Paiements attendus & résolutions financières",
          zoneLabel: "Dossiers en cours",
          seeAllHref: "/payments?filter=expected",
          items: [
            item({ id: "p-1", title: "Paiement 1" }),
            item({ id: "p-2", title: "Paiement 2" }),
            item({ id: "p-3", title: "Paiement 3" }),
            item({ id: "p-4", title: "Paiement 4" }),
            item({ id: "p-5", title: "Paiement 5" }),
          ],
        },
        {
          ...baseInput,
          tab: "breeding",
          key: "litter-today",
          title: "Portées — tâches & pesées",
          zoneLabel: "Tâches du jour",
          seeAllHref: "/calendar/today",
          items: [item({ id: "t-1" })],
        },
      ],
    });

    // The empty section disappears entirely.
    const keys = tabs.sections.map((section) => section.key);
    expect(keys).toEqual(["payments", "litter-today"]);

    const payments = tabs.sections[0];
    expect(payments.items).toHaveLength(3);
    expect(payments.totalCount).toBe(5);
    expect(payments.hiddenCount).toBe(2);
    expect(payments.seeAllHref).toBe("/payments?filter=expected");

    const breeding = tabs.sections[1];
    expect(breeding.tab).toBe("breeding");
    expect(breeding.totalCount).toBe(1);

    // Tab counters aggregate the totals of their own sections only.
    expect(tabs.adopterCount).toBe(5);
    expect(tabs.breedingCount).toBe(1);
    expect(tabs.isEmpty).toBe(false);
  });

  test("orders sections by their declared order and groups tabs", () => {
    const tabs = buildHomeTodayTabs({
      sections: [
        { ...baseInput, key: "post_adoption", zoneLabel: "Après le départ", items: [item({ id: "pa-1" })] },
        { ...baseInput, key: "documents", zoneLabel: "Dossiers en cours", items: [item({ id: "doc-1" })] },
        { ...baseInput, tab: "breeding", key: "reminders", zoneLabel: "Aujourd'hui", items: [item({ id: "r-1" })] },
      ],
    });

    expect(tabs.sections.map((section) => section.key)).toEqual([
      "documents",
      "post_adoption",
      "reminders",
    ]);
  });

  test("reports the global empty state when no section has items", () => {
    const tabs = buildHomeTodayTabs({
      sections: [{ ...baseInput, items: [] }],
    });
    expect(tabs.isEmpty).toBe(true);
    expect(tabs.sections).toHaveLength(0);
    expect(tabs.adopterCount).toBe(0);
    expect(tabs.breedingCount).toBe(0);
  });

  test("labels due dates as today, overdue or civil date", () => {
    expect(homeTodayDueLabel("2026-08-25", "2026-08-25")).toBe("Aujourd’hui");
    expect(homeTodayDueLabel("2026-08-21", "2026-08-25")).toBe("En retard");
    expect(homeTodayDueLabel("2026-08-27", "2026-08-25")).toBe("27 août 2026");
    expect(homeTodayDueLabel(null, "2026-08-25")).toBeNull();
  });

  test("formats civil dates without time drift", () => {
    expect(formatHomeTodayCivilDate("2026-01-05")).toBe("5 janvier 2026");
  });

  test("selects post-adoption decision rows vs due rows vs ignored rows", () => {
    const row = (overrides: Record<string, unknown>) => ({
      organizationId: "org",
      instanceId: "inst",
      reservationId: "res",
      animalId: "animal",
      animalName: "Nala",
      contactName: "fam. Fontaine",
      milestone: "t1" as const,
      instanceStatus: "scheduled",
      automationState: "active",
      reasonCode: null,
      scheduledAt: "2026-09-01T10:00:00Z",
      lastDispatchStatus: null,
      lastErrorCode: null,
      ...overrides,
    });
    const now = "2026-08-25T12:00:00Z";
    const rows = [
      row({ instanceId: "decision-suspended", automationState: "suspended", reasonCode: "member_suspended" }),
      row({ instanceId: "decision-incident", automationState: "suspended", reasonCode: "questionnaire_incident" }),
      row({ instanceId: "decision-uncertain", lastDispatchStatus: "uncertain" }),
      row({ instanceId: "due-past", scheduledAt: "2026-08-24T10:00:00Z" }),
      row({ instanceId: "due-now", scheduledAt: "2026-08-25T12:00:00Z" }),
      row({ instanceId: "future", scheduledAt: "2026-09-10T10:00:00Z" }),
      row({ instanceId: "no-date", scheduledAt: null }),
    ];

    const result = selectPostAdoptionAlertRows(rows, now);

    expect(result.decisionRequired.map((row) => row.instanceId)).toEqual([
      "decision-suspended",
      "decision-uncertain",
    ]);
    expect(result.due.map((row) => row.instanceId)).toEqual(["due-now", "due-past"]);
    expect(result.ignored.map((row) => row.instanceId)).toEqual([
      "decision-incident",
      "future",
      "no-date",
    ]);
  });
});
