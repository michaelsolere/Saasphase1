import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  formatLitterWeighingSchedulePhaseFr,
  LitterWeighingScheduleSummary,
} from "../../src/features/litter-weights/litter-weighing-schedule-summary";
import type { LitterWeighingSchedulePolicyMetadata } from "../../src/features/litter-weights/litter-weights-core";
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

const recommendedPolicy: LitterWeighingSchedulePolicyMetadata = {
  source: "recommended",
  phases: [
    { startAgeDay: 0, endAgeDay: 30, intervalDays: 1 },
    { startAgeDay: 31, endAgeDay: 60, intervalDays: 3 },
  ],
};

function render(
  schedule: LitterWeighingScheduleResult | null,
  policy: LitterWeighingSchedulePolicyMetadata | null = recommendedPolicy,
) {
  return renderToStaticMarkup(
    createElement(LitterWeighingScheduleSummary, { schedule, policy }),
  );
}

test("affiche un planning compact et replie la politique et les observations", () => {
  const before = JSON.stringify(availableSchedule);
  const html = render(availableSchedule);

  expect(html).toContain("Planning des pesées");
  expect(html).toContain("Cadence recommandée du logiciel");
  expect(html).toContain("J0 à J30 : tous les jours");
  expect(html).toContain("J31 à J60 : tous les 3 jours");
  expect(html).toContain("Aujourd’hui :</dt><dd>1");
  expect(html).toContain("En retard :</dt><dd>2");
  expect(html).toContain("Réalisées :</dt><dd>2");
  expect(html).toContain("Prochaine :</dt><dd>J16 · 5 août 2026");
  expect(html).toContain("<details");
  expect(html).not.toContain("<details open");
  expect(html).toContain("Politique, cadence et observations secondaires");
  expect(html).toContain("Dernière réalisée :");
  expect(html).toContain("J12 · 1 août 2026");
  expect(html).toContain("Première échéance du jour :");
  expect(html).toContain("J15 · 4 août 2026");
  expect(html).toContain("Première échéance en retard :");
  expect(html).toContain("J13 · 2 août 2026");
  expect(html).toContain("Observations hors planning : 1");
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
  expect(html).toContain("Cadence recommandée du logiciel");
  expect(html).toContain("J0 à J30 : tous les jours");
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
  const html = render(null, null);

  expect(html).toContain("Planning des pesées");
  expect(html).toContain(
    "Le planning des pesées ne peut pas être affiché pour le moment.",
  );
});

test("formate en français les intervalles et les phases d’un seul jour", () => {
  expect(
    formatLitterWeighingSchedulePhaseFr({
      startAgeDay: 0,
      endAgeDay: 30,
      intervalDays: 1,
    }),
  ).toBe("J0 à J30 : tous les jours");
  expect(
    formatLitterWeighingSchedulePhaseFr({
      startAgeDay: 22,
      endAgeDay: 42,
      intervalDays: 2,
    }),
  ).toBe("J22 à J42 : tous les 2 jours");
  expect(
    formatLitterWeighingSchedulePhaseFr({
      startAgeDay: 31,
      endAgeDay: 60,
      intervalDays: 3,
    }),
  ).toBe("J31 à J60 : tous les 3 jours");
  expect(
    formatLitterWeighingSchedulePhaseFr({
      startAgeDay: 45,
      endAgeDay: 45,
      intervalDays: 1,
    }),
  ).toBe("J45 uniquement");
  expect(
    formatLitterWeighingSchedulePhaseFr({
      startAgeDay: 45,
      endAgeDay: 45,
      intervalDays: 2,
    }),
  ).toBe("J45 uniquement");
});

test("affiche les phases personnalisées et leur source sans texte recommandé codé en dur", () => {
  const html = render(availableSchedule, {
    source: "organization",
    phases: [{ startAgeDay: 22, endAgeDay: 42, intervalDays: 2 }],
  });

  expect(html).toContain("Cadence personnalisée de l’organisation");
  expect(html).toContain("J22 à J42 : tous les 2 jours");
  expect(html).not.toContain("J0 à J30");
  expect(html).not.toContain("Rythme recommandé actuellement appliqué");
});

test("affiche le libellé d’un snapshot figé", () => {
  const html = render(availableSchedule, {
    source: "litter_snapshot",
    phases: [{ startAgeDay: 0, endAgeDay: 6, intervalDays: 1 }],
  });

  expect(html).toContain("Cadence figée pour cette portée");
});

test("la page Journal demande uniquement la date du planning", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "src/app/litters/journal/page.tsx"),
    "utf8",
  );

  expect(pageSource).not.toContain("DEFAULT_LITTER_WEIGHING_SCHEDULE_POLICY");
  expect(pageSource).toMatch(
    /schedule:\s*\{\s*todayDate:\s*litterJournalTodayDate,?\s*\}/,
  );
  expect(pageSource).not.toMatch(/schedule:\s*\{[^}]*policy:/s);
});
