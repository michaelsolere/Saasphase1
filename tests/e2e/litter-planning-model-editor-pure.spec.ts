import { expect, test } from "@playwright/test";

import {
  applyLitterPlanningModelEditorRequired,
  buildLitterPlanningModelCopyTitle,
  canEditLitterPlanningModelDirectly,
  convertLitterPlanningModelEditorItemKind,
  createEmptyLitterPlanningModelEditorDraft,
  createEmptyLitterPlanningModelEditorItem,
  createLitterPlanningModelEditorDraftFromModel,
  duplicateLitterPlanningModelEditorItem,
  isElementaryTemplateCompatibleWithModel,
  isLitterPlanningModelImported,
  itemHasComplexConfiguration,
  listPreferredAddableElementaryTemplates,
  moveLitterPlanningModelEditorItem,
  normalizeLitterPlanningModelEditorItemOrders,
  parseLitterPlanningModelEditorDraftPayload,
  validateLitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorTemplateOption,
} from "../../src/features/settings/litter-planning-model-editor-draft";
import {
  normalizeLitterPlanningModelTemplateSearch,
  projectLitterPlanningModelTemplatePicker,
} from "../../src/features/settings/litter-planning-model-template-picker";
import {
  canManageLitterPlanningModels,
  LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE,
} from "../../src/features/settings/litter-planning-model-labels";
import type { LitterPlanningModel } from "../../src/features/litter-journal/litter-planning-models-core";
import { parseLitterPlanningModelItems } from "../../src/features/litter-journal/litter-planning-models-core";

const templateA: LitterPlanningModelEditorTemplateOption = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Température",
  description: "Surveiller la santé de la mère",
  category: "maternal_health",
  targetScope: "mother",
  anchorType: "expected_birth",
  offsetDays: 0,
  species: "dog",
  breed: null,
  isActive: true,
};

const templateB: LitterPlanningModelEditorTemplateOption = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Pesée",
  description: "Contrôle collectif de la portée",
  category: "offspring_weight",
  targetScope: "all_offspring",
  anchorType: "actual_birth",
  offsetDays: 1,
  species: "dog",
  breed: "Golden Retriever",
  isActive: true,
};

const templateInactive: LitterPlanningModelEditorTemplateOption = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Ancien jalon",
  description: null,
  category: "other",
  targetScope: "litter",
  anchorType: "expected_birth",
  offsetDays: 2,
  species: "dog",
  breed: null,
  isActive: false,
};

const templateCat: LitterPlanningModelEditorTemplateOption = {
  id: "44444444-4444-4444-8444-444444444444",
  title: "Jalon chat",
  description: null,
  category: "other",
  targetScope: "litter",
  anchorType: "expected_birth",
  offsetDays: 0,
  species: "cat",
  breed: null,
  isActive: true,
};

function sampleModel(overrides?: Partial<LitterPlanningModel>): LitterPlanningModel {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Gestation standard",
    description: "Description source",
    species: "dog",
    breed: null,
    isActive: true,
    revision: 3,
    libraryModelCode: "dog-gestation-standard",
    libraryModelVersion: 1,
    items: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        organizationTemplateId: templateA.id,
        itemKind: "recurring_task",
        priority: "important",
        anchorType: "expected_birth",
        recurrenceKind: "daily_interval",
        recurrenceIntervalDays: 1,
        recurrenceStartsOffsetDays: -5,
        recurrenceEndKind: "actual_birth",
        initialMaterializationHorizonDays: 7,
        absoluteMaxOccurrences: 30,
        timeSlots: ["08:00", "20:00"],
        displayOrder: 0,
        isRequired: true,
        isSelectedByDefault: true,
      },
    ],
    ...overrides,
  };
}

function validDraft(): LitterPlanningModelEditorDraft {
  const item = createEmptyLitterPlanningModelEditorItem(templateA, 0, "task");
  return {
    mode: "create",
    modelId: null,
    expectedRevision: null,
    title: "Modèle valide",
    description: "Description",
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
}

test("initialisation d’un modèle vide", () => {
  const draft = createEmptyLitterPlanningModelEditorDraft();
  expect(draft.mode).toBe("create");
  expect(draft.title).toBe("");
  expect(draft.items).toEqual([]);
  expect(draft.isActive).toBe(false);
  expect(draft.libraryModelCode).toBeNull();
});

test("duplication sans provenance de bibliothèque", () => {
  const draft = createLitterPlanningModelEditorDraftFromModel(sampleModel(), {
    mode: "duplicate",
    sourceOriginLabel: "Importé depuis la bibliothèque · dog-gestation-standard · version 1",
  });
  expect(draft.mode).toBe("duplicate");
  expect(draft.title).toBe("Copie de Gestation standard");
  expect(draft.libraryModelCode).toBeNull();
  expect(draft.libraryModelVersion).toBeNull();
  expect(draft.isActive).toBe(false);
  expect(draft.modelId).toBeNull();
  expect(draft.expectedRevision).toBeNull();
  expect(draft.sourceOriginLabel).toContain("bibliothèque");
});

test("conservation exacte d’un suivi récurrent dupliqué", () => {
  const draft = createLitterPlanningModelEditorDraftFromModel(sampleModel(), {
    mode: "duplicate",
  });
  const item = draft.items[0]!;
  expect(item.itemKind).toBe("recurring_task");
  expect(item.recurrenceIntervalDays).toBe("1");
  expect(item.recurrenceStartsOffsetDays).toBe("-5");
  expect(item.recurrenceEndKind).toBe("actual_birth");
  expect(item.initialMaterializationHorizonDays).toBe("7");
  expect(item.absoluteMaxOccurrences).toBe("30");
  expect(item.timeSlots).toEqual(["08:00", "20:00"]);
  expect(item.priority).toBe("important");
  expect(item.isRequired).toBe(true);
  expect(item.isSelectedByDefault).toBe(true);

  const validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;
  expect(validation.payload.items[0]).toMatchObject({
    itemKind: "recurring_task",
    recurrenceIntervalDays: 1,
    recurrenceStartsOffsetDays: -5,
    recurrenceEndKind: "actual_birth",
    timeSlots: ["08:00", "20:00"],
  });
  expect(parseLitterPlanningModelItems(validation.payload.items)).not.toBeNull();
});

test("titre des copies borné et déterministe", () => {
  expect(buildLitterPlanningModelCopyTitle("Court")).toBe("Copie de Court");
  expect(buildLitterPlanningModelCopyTitle("  Espaces  ")).toBe("Copie de Espaces");
  expect(buildLitterPlanningModelCopyTitle("Copie de Déjà préfixé")).toBe(
    "Copie de Copie de Déjà préfixé",
  );

  const source255 = "A".repeat(255);
  const copyFrom255 = buildLitterPlanningModelCopyTitle(source255);
  expect(copyFrom255.startsWith("Copie de ")).toBe(true);
  expect(copyFrom255.length).toBe(255);
  expect(copyFrom255).toBe(`Copie de ${"A".repeat(246)}`);
  expect(buildLitterPlanningModelCopyTitle(source255)).toBe(copyFrom255);
  expect(buildLitterPlanningModelCopyTitle("").length).toBeGreaterThan(0);
  expect(buildLitterPlanningModelCopyTitle("x".repeat(1000)).length).toBeLessThanOrEqual(
    255,
  );
});

test("normalisation de l’ordre", () => {
  const items = normalizeLitterPlanningModelEditorItemOrders([
    createEmptyLitterPlanningModelEditorItem(templateA, 9),
    createEmptyLitterPlanningModelEditorItem(templateB, 4),
  ]);
  expect(items.map((item) => item.displayOrder)).toEqual([0, 1]);

  const moved = moveLitterPlanningModelEditorItem(items, items[1]!.key, "up");
  expect(moved.map((item) => item.organizationTemplateId)).toEqual([
    templateB.id,
    templateA.id,
  ]);
  expect(moved.map((item) => item.displayOrder)).toEqual([0, 1]);
});

test("obligatoire implique sélection par défaut", () => {
  const item = createEmptyLitterPlanningModelEditorItem(templateA, 0);
  const optional = applyLitterPlanningModelEditorRequired(
    { ...item, isSelectedByDefault: false },
    false,
  );
  expect(optional.isRequired).toBe(false);
  expect(optional.isSelectedByDefault).toBe(false);

  const required = applyLitterPlanningModelEditorRequired(optional, true);
  expect(required.isRequired).toBe(true);
  expect(required.isSelectedByDefault).toBe(true);
});

test("validation jalon et tâche", () => {
  const draft = createEmptyLitterPlanningModelEditorDraft();
  draft.title = "Modèle test";
  draft.species = "dog";
  const milestone = createEmptyLitterPlanningModelEditorItem(templateA, 0, "milestone");
  milestone.pointOffsetDays = "3";
  milestone.pointLocalTime = "09:30";
  const task = createEmptyLitterPlanningModelEditorItem(templateA, 1, "task");
  task.pointOffsetDays = "-1";
  draft.items = [milestone, task];

  const validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;
  expect(validation.payload.items.map((item) => item.itemKind)).toEqual([
    "milestone",
    "task",
  ]);
  expect(validation.payload.items[0]).not.toHaveProperty("windowStartsOffsetDays");
  expect(validation.payload.items[0]).not.toHaveProperty("timeSlots");
});

test("validation période", () => {
  const draft = createEmptyLitterPlanningModelEditorDraft();
  draft.title = "Fenêtre";
  const window = createEmptyLitterPlanningModelEditorItem(templateA, 0, "window");
  window.windowStartsOffsetDays = "2";
  window.windowEndsOffsetDays = "1";
  draft.items = [window];
  let validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(false);

  window.windowEndsOffsetDays = "4";
  validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(true);

  window.windowEndsOffsetDays = "2";
  window.windowStartsLocalTime = "10:00";
  window.windowEndsLocalTime = "09:00";
  validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(false);

  window.windowEndsLocalTime = "11:00";
  validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;
  expect(validation.payload.items[0]).not.toHaveProperty("pointOffsetDays");
  expect(validation.payload.items[0]).not.toHaveProperty("timeSlots");
});

test("validation récurrence et rejet des créneaux invalides", () => {
  const draft = createEmptyLitterPlanningModelEditorDraft();
  draft.title = "Récurrence";
  const recurring = createEmptyLitterPlanningModelEditorItem(
    templateA,
    0,
    "recurring_task",
  );
  recurring.timeSlots = ["08:00", "08:00"];
  draft.items = [recurring];
  expect(validateLitterPlanningModelEditorDraft(draft, [templateA]).ok).toBe(
    false,
  );

  recurring.timeSlots = ["20:00", "08:00"];
  expect(validateLitterPlanningModelEditorDraft(draft, [templateA]).ok).toBe(
    false,
  );

  recurring.timeSlots = ["08:00", "20:00"];
  recurring.recurrenceDayCount = "20";
  recurring.absoluteMaxOccurrences = "30";
  expect(validateLitterPlanningModelEditorDraft(draft, [templateA]).ok).toBe(
    false,
  );

  recurring.absoluteMaxOccurrences = "40";
  const validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(true);
});

test("exclusion des champs d’un ancien type après conversion", () => {
  const recurring = createEmptyLitterPlanningModelEditorItem(
    templateA,
    0,
    "recurring_task",
  );
  recurring.timeSlots = ["08:00", "20:00"];
  recurring.recurrenceDayCount = "7";
  const converted = convertLitterPlanningModelEditorItemKind(recurring, "milestone");
  expect(converted.itemKind).toBe("milestone");

  const draft = createEmptyLitterPlanningModelEditorDraft();
  draft.title = "Conversion";
  draft.items = [converted];
  const validation = validateLitterPlanningModelEditorDraft(draft, [templateA]);
  expect(validation.ok).toBe(true);
  if (!validation.ok) return;
  expect(validation.payload.items[0]).not.toHaveProperty("timeSlots");
  expect(validation.payload.items[0]).not.toHaveProperty("recurrenceKind");
  expect(validation.payload.items[0]).toHaveProperty("pointOffsetDays");
});

test("détection des configurations complexes de récurrence", () => {
  const base = createEmptyLitterPlanningModelEditorItem(
    templateA,
    0,
    "recurring_task",
  );
  expect(itemHasComplexConfiguration(base)).toBe(false);

  expect(
    itemHasComplexConfiguration({ ...base, timeSlots: ["20:00"] }),
  ).toBe(true);
  expect(
    itemHasComplexConfiguration({
      ...base,
      recurrenceStartsOffsetDays: "-5",
    }),
  ).toBe(true);
  expect(
    itemHasComplexConfiguration({
      ...base,
      recurrenceEndsOffsetDays: "2",
    }),
  ).toBe(true);
  expect(
    itemHasComplexConfiguration({
      ...base,
      timeSlots: ["08:00", "20:00"],
    }),
  ).toBe(true);
});

test("incompatibilité espèce/race", () => {
  expect(
    isElementaryTemplateCompatibleWithModel({
      templateSpecies: "dog",
      templateBreed: null,
      modelSpecies: "cat",
      modelBreed: null,
    }),
  ).toBe(false);
  expect(
    isElementaryTemplateCompatibleWithModel({
      templateSpecies: "dog",
      templateBreed: "Labrador",
      modelSpecies: "dog",
      modelBreed: "Golden Retriever",
    }),
  ).toBe(false);
  expect(
    listPreferredAddableElementaryTemplates(
      [templateA, templateB, templateInactive, templateCat],
      "dog",
      "",
    ).map((template) => template.id),
  ).toEqual([templateA.id, templateB.id]);

  const draft = createEmptyLitterPlanningModelEditorDraft();
  draft.title = "Incompatible";
  draft.species = "cat";
  draft.items = [createEmptyLitterPlanningModelEditorItem(templateA, 0)];
  const validation = validateLitterPlanningModelEditorDraft(draft, [
    templateA,
    templateCat,
  ]);
  expect(validation.ok).toBe(false);
  expect(validation.ok ? [] : validation.errors[0]?.message).toContain(
    "incompatible",
  );
});

test("permissions et impossibilité d’éditer un modèle importé", () => {
  expect(canManageLitterPlanningModels("owner")).toBe(true);
  expect(canManageLitterPlanningModels("admin")).toBe(true);
  expect(canManageLitterPlanningModels("member")).toBe(false);
  expect(canManageLitterPlanningModels("viewer")).toBe(false);

  const imported = sampleModel();
  expect(isLitterPlanningModelImported(imported)).toBe(true);
  expect(canEditLitterPlanningModelDirectly(imported)).toBe(false);

  const custom = sampleModel({
    libraryModelCode: null,
    libraryModelVersion: null,
  });
  expect(canEditLitterPlanningModelDirectly(custom)).toBe(true);

  const editDraft = createLitterPlanningModelEditorDraftFromModel(imported, {
    mode: "edit",
  });
  const validation = validateLitterPlanningModelEditorDraft(editDraft, [
    templateA,
  ]);
  expect(validation.ok).toBe(false);
});

test("duplication d’élément et message d’indépendance éditeur", () => {
  const items = [
    createEmptyLitterPlanningModelEditorItem(templateA, 0, "task"),
  ];
  const duplicated = duplicateLitterPlanningModelEditorItem(items, items[0]!.key);
  expect(duplicated).toHaveLength(2);
  expect(duplicated[0]!.key).not.toBe(duplicated[1]!.key);
  expect(duplicated.map((item) => item.displayOrder)).toEqual([0, 1]);
  expect(LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE).toContain(
    "ne modifie aucun planning déjà créé",
  );
});

test("recherche et filtres locaux des jalons compatibles", () => {
  const socializationTemplate: LitterPlanningModelEditorTemplateOption = {
    ...templateB,
    title: "Découverte collective",
    description: "Explorer calmement de nouveaux environnements",
    category: "socialization",
  };
  const source = [templateA, socializationTemplate, templateInactive];
  const snapshot = structuredClone(source);
  const project = (query = "", category = "", targetScope = "") =>
    projectLitterPlanningModelTemplatePicker({
      templates: source,
      filters: { query, category, targetScope },
    });

  expect(normalizeLitterPlanningModelTemplateSearch("  SANTÉ   DE  ")).toBe(
    "santé de",
  );
  expect(project("température").results.map((result) => result.templateId)).toEqual([
    templateA.id,
  ]);
  expect(project("NOUVEAUX   ENVIRONNEMENTS").results.map((result) => result.templateId)).toEqual([
    socializationTemplate.id,
  ]);
  expect(project("santé DE").results.map((result) => result.templateId)).toEqual([
    templateA.id,
  ]);
  expect(project("socialisation").results.map((result) => result.templateId)).toEqual([
    socializationTemplate.id,
  ]);
  expect(project("tous les petits").results.map((result) => result.templateId)).toEqual([
    socializationTemplate.id,
  ]);
  expect(project("", "socialization").results.map((result) => result.templateId)).toEqual([
    socializationTemplate.id,
  ]);
  expect(project("", "", "all_offspring").results.map((result) => result.templateId)).toEqual([
    socializationTemplate.id,
  ]);
  expect(
    project("collective", "socialization", "all_offspring").results.map(
      (result) => result.templateId,
    ),
  ).toEqual([socializationTemplate.id]);
  expect(project("introuvable", "socialization", "all_offspring").results).toEqual([]);
  expect(source).toEqual(snapshot);

  for (const result of project().results) {
    expect(JSON.stringify(result.presentation)).not.toContain(result.templateId);
    expect(result.presentation.optionLabel).toContain(result.presentation.categoryLabel);
    expect(result.presentation.optionLabel).toContain(result.presentation.targetLabel);
  }
});

test("parseur structurel du brouillon — payloads malformés et valide", () => {
  const base = validDraft();
  expect(parseLitterPlanningModelEditorDraftPayload(base)).toEqual(base);

  expect(
    parseLitterPlanningModelEditorDraftPayload({ ...base, breed: null }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({ ...base, breed: 42 }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({ ...base, species: [] }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({ ...base, items: [null] }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({
      ...base,
      items: [{ ...base.items[0], timeSlots: "08:00" }],
    }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({
      ...base,
      items: [{ ...base.items[0], timeSlots: [800] }],
    }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({
      ...base,
      items: [{ ...base.items[0], pointLocalTime: { hour: "08:00" } }],
    }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({
      ...base,
      items: [{ ...base.items[0], displayOrder: 1.5 }],
    }),
  ).toBeNull();
  expect(
    parseLitterPlanningModelEditorDraftPayload({
      ...base,
      items: Array.from({ length: 101 }, (_, index) =>
        createEmptyLitterPlanningModelEditorItem(templateA, index, "task"),
      ),
    }),
  ).toBeNull();
});
