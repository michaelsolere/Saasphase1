import { expect, test } from "@playwright/test";

import {
  canManageLitterPlanningModels,
  formatLitterPlanningModelAnchorPhrase,
  formatLitterPlanningModelPointOffset,
  formatLitterPlanningModelRecurrence,
  formatLitterPlanningModelWindow,
  LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE,
  litterPlanningModelImportStatusLabels,
  litterPlanningModelItemKindLabels,
  resolveLitterPlanningModelImportStatus,
} from "../../src/features/settings/litter-planning-model-labels";

test("libellés des types d’éléments", () => {
  expect(litterPlanningModelItemKindLabels.milestone).toBe("Jalon");
  expect(litterPlanningModelItemKindLabels.task).toBe("Tâche");
  expect(litterPlanningModelItemKindLabels.window).toBe("Période");
  expect(litterPlanningModelItemKindLabels.recurring_task).toBe(
    "Suivi récurrent",
  );
});

test("libellés des ancrages", () => {
  expect(formatLitterPlanningModelAnchorPhrase("estimated_ovulation")).toBe(
    "Ancrage : ovulation estimée",
  );
  expect(formatLitterPlanningModelAnchorPhrase("expected_birth")).toBe(
    "Ancrage : mise-bas estimée",
  );
  expect(formatLitterPlanningModelAnchorPhrase("actual_birth")).toBe(
    "Ancrage : mise-bas réelle",
  );
});

test("formulation des décalages positifs et négatifs", () => {
  expect(formatLitterPlanningModelPointOffset("expected_birth", -5)).toBe(
    "5 jours avant la mise-bas estimée",
  );
  expect(formatLitterPlanningModelPointOffset("expected_birth", 3)).toBe(
    "3 jours après la mise-bas estimée",
  );
  expect(formatLitterPlanningModelPointOffset("expected_birth", 0)).toBe(
    "Le jour de la mise-bas estimée",
  );
  expect(formatLitterPlanningModelPointOffset("offspring_age", 14)).toBe(
    "À 14 jours de vie",
  );
});

test("formulation des fenêtres", () => {
  expect(
    formatLitterPlanningModelWindow("estimated_ovulation", 54, 57),
  ).toBe("Fenêtre du 54e au 57e jour");
  expect(formatLitterPlanningModelWindow("expected_birth", -5, 0)).toContain(
    "avant la mise-bas estimée",
  );
});

test("formulation des suivis récurrents", () => {
  expect(
    formatLitterPlanningModelRecurrence({
      intervalDays: 1,
      timeSlots: ["08:00", "20:00"],
      endKind: "actual_birth",
      startsOffsetDays: -5,
      anchorType: "expected_birth",
    }),
  ).toBe(
    "Deux fois par jour · 08 h 00 et 20 h 00 à partir de 5 jours avant la mise-bas estimée jusqu’à la mise-bas réelle",
  );
  expect(
    formatLitterPlanningModelRecurrence({
      intervalDays: 1,
      timeSlots: ["08:00", "20:00"],
      endKind: "fixed_recurrence_day_count",
      startsOffsetDays: -5,
      recurrenceDayCount: 5,
      anchorType: "expected_birth",
    }),
  ).toBe(
    "Deux fois par jour · 08 h 00 et 20 h 00 à partir de 5 jours avant la mise-bas estimée pendant 5 jours de suivi",
  );
});

test("distinction importé / non importé / nouvelle version", () => {
  expect(
    resolveLitterPlanningModelImportStatus({
      isImported: false,
      version: 1,
      latestImportedVersion: null,
    }),
  ).toBe("not_imported");
  expect(
    resolveLitterPlanningModelImportStatus({
      isImported: true,
      version: 1,
      latestImportedVersion: 1,
    }),
  ).toBe("imported");
  expect(
    resolveLitterPlanningModelImportStatus({
      isImported: false,
      version: 2,
      latestImportedVersion: 1,
    }),
  ).toBe("newer_version_available");
  expect(litterPlanningModelImportStatusLabels.not_imported).toBe(
    "Non importé",
  );
  expect(litterPlanningModelImportStatusLabels.imported).toBe("Déjà importé");
  expect(
    litterPlanningModelImportStatusLabels.newer_version_available,
  ).toBe("Version plus récente disponible");
});

test("permissions d’action selon le rôle", () => {
  expect(canManageLitterPlanningModels("owner")).toBe(true);
  expect(canManageLitterPlanningModels("admin")).toBe(true);
  expect(canManageLitterPlanningModels("member")).toBe(false);
  expect(canManageLitterPlanningModels("viewer")).toBe(false);
});

test("message garantissant l’indépendance modèle / portée", () => {
  expect(LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE).toBe(
    "Importer, activer ou désactiver un modèle ne modifie aucun planning déjà créé pour une portée.",
  );
});
