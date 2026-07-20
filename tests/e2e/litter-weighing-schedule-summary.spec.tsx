import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LitterWeighingScheduleSummary } from "../../src/features/litter-weights/litter-weighing-schedule-summary";
import type { LitterWeighingScheduleResult } from "../../src/features/litter-weights/litter-weighing-schedule-model";

const availableSchedule: LitterWeighingScheduleResult = {
  status: "available",
  schedule: [
    {
      ageDay: 10,
      scheduledOn: "2026-07-30",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "completed",
      observations: [],
    },
    {
      ageDay: 12,
      scheduledOn: "2026-08-01",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "completed",
      observations: [],
    },
    {
      ageDay: 13,
      scheduledOn: "2026-08-02",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "overdue",
      observations: [],
    },
    {
      ageDay: 14,
      scheduledOn: "2026-08-03",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "overdue",
      observations: [],
    },
    {
      ageDay: 15,
      scheduledOn: "2026-08-04",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "due_today",
      observations: [],
    },
    {
      ageDay: 16,
      scheduledOn: "2026-08-05",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "upcoming",
      observations: [],
    },
    {
      ageDay: 17,
      scheduledOn: "2026-08-06",
      phaseIndex: 0,
      cadence: { intervalDays: 1 },
      status: "upcoming",
      observations: [],
    },
  ],
  extraObservations: [
    {
      observationIndex: 2,
      observedOn: "2026-07-20",
      source: "routine",
      ageDay: 0,
      reason: "unscheduled_day",
    },
  ],
  summary: {
    totalScheduledCount: 7,
    completedCount: 2,
    dueTodayCount: 1,
    overdueCount: 2,
    upcomingCount: 2,
    extraObservationCount: 1,
    firstIncomplete: {
      ageDay: 13,
      scheduledOn: "2026-08-02",
      status: "overdue",
    },
  },
};

function render(schedule: LitterWeighingScheduleResult | null) {
  return renderToStaticMarkup(
    createElement(LitterWeighingScheduleSummary, { schedule }),
  );
}

test("affiche les compteurs, les repères et les observations hors planning", () => {
  const before = JSON.stringify(availableSchedule);
  const html = render(availableSchedule);

  expect(html).toContain("Planning des pesées");
  expect(html).toContain("Réalisées</dt><dd class=\"mt-1 text-2xl font-semibold\">2");
  expect(html).toContain("À faire aujourd’hui</dt><dd class=\"mt-1 text-2xl font-semibold\">1");
  expect(html).toContain("En retard</dt><dd class=\"mt-1 text-2xl font-semibold\">2");
  expect(html).toContain("À venir</dt><dd class=\"mt-1 text-2xl font-semibold\">2");
  expect(html).toContain("Dernière réalisée");
  expect(html).toContain("J12 · 1 août 2026");
  expect(html).toContain("Échéance du jour");
  expect(html).toContain("J15 · 4 août 2026");
  expect(html).toContain("Première à rattraper");
  expect(html).toContain("J13 · 2 août 2026");
  expect(html).toContain("Prochaine échéance");
  expect(html).toContain("J16 · 5 août 2026");
  expect(html).toContain(
    "1 observation(s) de pesée enregistrée(s) hors échéances planifiées.",
  );
  expect(html).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  expect(JSON.stringify(availableSchedule)).toBe(before);
});

test("affiche l’état sans date réelle sans naissance estimée", () => {
  const html = render({
    status: "missing_actual_birth_date",
    schedule: [],
    extraObservations: [],
  });

  expect(html).toContain("Planning des pesées");
  expect(html).toContain(
    "Renseignez la date réelle de naissance de la portée pour calculer le planning des pesées.",
  );
  expect(html).not.toContain("estimée");
});

test("masque la raison technique d’une entrée invalide", () => {
  const technicalReason =
    "invalid history 123e4567-e89b-12d3-a456-426614174000";
  const html = render({
    status: "invalid_input",
    reason: technicalReason,
    schedule: [],
    extraObservations: [],
  });

  expect(html).toContain(
    "Le planning des pesées ne peut pas être affiché pour le moment.",
  );
  expect(html).not.toContain(technicalReason);
  expect(html).not.toContain("123e4567-e89b-12d3-a456-426614174000");
});

test("affiche un état neutre lorsque le planning est nul", () => {
  const html = render(null);

  expect(html).toContain("Planning des pesées");
  expect(html).toContain(
    "Le planning des pesées ne peut pas être affiché pour le moment.",
  );
});
