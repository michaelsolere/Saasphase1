import { expect, test } from "@playwright/test";

import {
  buildInitialLitterPlanningModelSelection,
  canApplyLitterPlanningModel,
  canViewLitterPlanningModelApplication,
  collectAppliedPlanningModelSnapshots,
  countPartialApplicationItems,
  formatLitterPlanningModelRevisionDivergence,
  getAppliedPlanningModelRevision,
  isLitterPlanningModelAlreadyApplied,
  isLitterPlanningModelCompatibleWithLitter,
  litterPlanningModelApplyErrorMessage,
  projectLitterPlanningModelItemPreview,
  readLitterPlanningModelApplyResultCounters,
  toggleLitterPlanningModelSelection,
  validateLitterPlanningModelSelectedIndexes,
} from "../../src/features/litter-journal/litter-planning-model-apply";

const items = [
  {
    publicIndex: 1,
    isRequired: true,
    isSelectedByDefault: true,
  },
  {
    publicIndex: 2,
    isRequired: false,
    isSelectedByDefault: true,
  },
  {
    publicIndex: 3,
    isRequired: false,
    isSelectedByDefault: false,
  },
  {
    publicIndex: 4,
    isRequired: false,
    isSelectedByDefault: true,
  },
] as const;

test("compatibilité espèce et race", () => {
  expect(
    isLitterPlanningModelCompatibleWithLitter({
      modelSpecies: null,
      modelBreed: null,
      litterSpecies: "dog",
      litterBreed: "Golden Retriever",
    }),
  ).toBe(true);
  expect(
    isLitterPlanningModelCompatibleWithLitter({
      modelSpecies: "dog",
      modelBreed: "Golden Retriever",
      litterSpecies: "dog",
      litterBreed: "golden retriever",
    }),
  ).toBe(true);
  expect(
    isLitterPlanningModelCompatibleWithLitter({
      modelSpecies: "cat",
      modelBreed: null,
      litterSpecies: "dog",
      litterBreed: "Golden Retriever",
    }),
  ).toBe(false);
  expect(
    isLitterPlanningModelCompatibleWithLitter({
      modelSpecies: "dog",
      modelBreed: "Labrador",
      litterSpecies: "dog",
      litterBreed: "Golden Retriever",
    }),
  ).toBe(false);
});

test("détecte un modèle déjà appliqué et compte une application partielle", () => {
  const applied = collectAppliedPlanningModelSnapshots([
    {
      source_planning_model_id: "model-a",
      source_planning_model_revision: 2,
    },
    {
      source_planning_model_id: "model-a",
      source_planning_model_revision: 2,
    },
    {
      source_planning_model_id: "model-b",
      source_planning_model_revision: 1,
    },
  ]);

  expect(isLitterPlanningModelAlreadyApplied(applied, "model-a")).toBe(true);
  expect(isLitterPlanningModelAlreadyApplied(applied, "model-c")).toBe(false);
  expect(countPartialApplicationItems(applied, "model-a")).toBe(2);
  expect(getAppliedPlanningModelRevision(applied, "model-a")).toBe(2);
});

test("signale l’écart entre révision actuelle et révision appliquée", () => {
  expect(
    formatLitterPlanningModelRevisionDivergence({
      currentRevision: 3,
      appliedRevision: 2,
    }),
  ).toBe(
    "Ce modèle est maintenant en révision 3. Le planning de la portée conserve la révision 2 appliquée précédemment.",
  );
  expect(
    formatLitterPlanningModelRevisionDivergence({
      currentRevision: 2,
      appliedRevision: 2,
    }),
  ).toBeNull();
});

test("sélection initiale obligatoire + sélection par défaut", () => {
  expect(buildInitialLitterPlanningModelSelection(items)).toEqual([1, 2, 4]);
});

test("impossibilité de désélectionner un élément obligatoire", () => {
  expect(
    toggleLitterPlanningModelSelection({
      items,
      selectedIndexes: [1, 2],
      publicIndex: 1,
    }),
  ).toBeNull();
  expect(
    toggleLitterPlanningModelSelection({
      items,
      selectedIndexes: [1, 2],
      publicIndex: 2,
    }),
  ).toEqual([1]);
  expect(
    toggleLitterPlanningModelSelection({
      items,
      selectedIndexes: [1],
      publicIndex: 3,
    }),
  ).toEqual([1, 3]);
});

test("validation des index : doublon, hors limite, non entier, obligatoire manquant, vide", () => {
  expect(
    validateLitterPlanningModelSelectedIndexes({
      items,
      selectedIndexes: [1, 1],
    }),
  ).toEqual({ ok: false, reason: "duplicate" });
  expect(
    validateLitterPlanningModelSelectedIndexes({
      items,
      selectedIndexes: [1, 9],
    }),
  ).toEqual({ ok: false, reason: "out_of_range" });
  expect(
    validateLitterPlanningModelSelectedIndexes({
      items,
      selectedIndexes: [1, 1.5],
    }),
  ).toEqual({ ok: false, reason: "non_integer" });
  expect(
    validateLitterPlanningModelSelectedIndexes({
      items,
      selectedIndexes: [2],
    }),
  ).toEqual({ ok: false, reason: "missing_required" });
  expect(
    validateLitterPlanningModelSelectedIndexes({
      items,
      selectedIndexes: [],
    }),
  ).toEqual({ ok: false, reason: "empty" });
  expect(
    validateLitterPlanningModelSelectedIndexes({
      items,
      selectedIndexes: [1, 2],
    }),
  ).toEqual({ ok: true, selectedIndexes: [1, 2] });
});

test("aperçu d’un point, d’une fenêtre et d’un suivi récurrent", () => {
  const anchors = {
    matingDate: "2026-06-10",
    estimatedOvulationDate: null,
    expectedBirthDate: null,
    actualBirthDate: null,
  };

  expect(
    projectLitterPlanningModelItemPreview({
      itemKind: "milestone",
      anchorType: "first_mating",
      anchors,
      pointOffsetDays: 2,
    }).label,
  ).toBe("Prévu le 12 juin 2026");

  expect(
    projectLitterPlanningModelItemPreview({
      itemKind: "window",
      anchorType: "first_mating",
      anchors,
      windowStartsOffsetDays: 2,
      windowEndsOffsetDays: 5,
    }).label,
  ).toBe("Fenêtre du 12 juin 2026 au 15 juin 2026");

  expect(
    projectLitterPlanningModelItemPreview({
      itemKind: "recurring_task",
      anchorType: "first_mating",
      anchors,
      recurrenceStartsOffsetDays: -5,
      timeSlots: ["08:00", "20:00"],
    }).label,
  ).toBe("Début le 5 juin 2026 · matin et soir");
});

test("aperçu en attente lorsque l’ancre manque", () => {
  expect(
    projectLitterPlanningModelItemPreview({
      itemKind: "task",
      anchorType: "actual_birth",
      anchors: {
        matingDate: "2026-06-10",
        estimatedOvulationDate: null,
        expectedBirthDate: null,
        actualBirthDate: null,
      },
      pointOffsetDays: 2,
    }),
  ).toEqual({
    kind: "pending_anchor",
    label: "Sera ajouté en attente de la naissance réelle",
    projectedStartDate: null,
    projectedEndDate: null,
  });
});

test("permissions par rôle", () => {
  expect(canViewLitterPlanningModelApplication("viewer")).toBe(true);
  expect(canApplyLitterPlanningModel("viewer")).toBe(false);
  expect(canApplyLitterPlanningModel("member")).toBe(true);
  expect(canApplyLitterPlanningModel("admin")).toBe(true);
  expect(canApplyLitterPlanningModel("owner")).toBe(true);
});

test("lecture des compteurs du résultat RPC", () => {
  const counters = readLitterPlanningModelApplyResultCounters([
    { planItemId: "a", state: "materialized" },
    { planItemId: "b", state: "pending_anchor" },
    {
      planItemId: "c",
      state: "materialized",
      seriesId: "s",
      materializedOccurrenceCount: 4,
      insertedCount: 4,
    },
  ]);

  expect(counters).toEqual({
    addedCount: 3,
    materializedCount: 2,
    pendingAnchorCount: 1,
    recurringPreparedOccurrenceCount: 4,
  });
  expect(litterPlanningModelApplyErrorMessage("stale_plan")).toContain(
    "modifié ailleurs",
  );
});
