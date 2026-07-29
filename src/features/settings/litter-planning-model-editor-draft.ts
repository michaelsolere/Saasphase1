import {
  LITTER_PLANNING_MODEL_ANCHORS,
  LITTER_PLANNING_MODEL_COMPLETION_FACT_KINDS,
  LITTER_PLANNING_MODEL_ITEM_KINDS,
  LITTER_PLANNING_MODEL_PRIORITIES,
  LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS,
  LITTER_PLANNING_MODEL_RECURRENCE_KINDS,
  parseLitterPlanningModelItems,
  type LitterPlanningModel,
  type LitterPlanningModelAnchor,
  type LitterPlanningModelCompletionFactKind,
  type LitterPlanningModelItem,
  type LitterPlanningModelItemInput,
  type LitterPlanningModelItemKind,
  type LitterPlanningModelPriority,
  type LitterPlanningModelRecurrenceEndKind,
  type LitterPlanningModelRecurrenceKind,
} from "@/features/litter-journal/litter-planning-models-core";
import type {
  LitterCareTaskAnchorType,
  LitterCareTaskCategory,
  LitterCareTaskTargetScope,
  LitterCareTaskTemplateSummary,
} from "@/features/litter-journal/litter-care-tasks-core";

export type LitterPlanningModelEditorMode = "create" | "edit" | "duplicate";

export type LitterPlanningModelEditorTemplateOption = {
  id: string;
  title: string;
  category: LitterCareTaskCategory | string;
  targetScope: LitterCareTaskTargetScope | string;
  anchorType: LitterCareTaskAnchorType | LitterPlanningModelAnchor | string;
  offsetDays: number;
  species: "dog" | "cat";
  breed: string | null;
  isActive: boolean;
};

export type LitterPlanningModelEditorItemDraft = {
  key: string;
  organizationTemplateId: string;
  itemKind: LitterPlanningModelItemKind;
  priority: LitterPlanningModelPriority;
  anchorType: LitterPlanningModelAnchor;
  pointOffsetDays: string;
  pointLocalTime: string;
  windowStartsOffsetDays: string;
  windowStartsLocalTime: string;
  windowEndsOffsetDays: string;
  windowEndsLocalTime: string;
  recurrenceKind: LitterPlanningModelRecurrenceKind;
  recurrenceIntervalDays: string;
  recurrenceStartsOffsetDays: string;
  recurrenceEndKind: LitterPlanningModelRecurrenceEndKind;
  recurrenceEndsOffsetDays: string;
  recurrenceDayCount: string;
  initialMaterializationHorizonDays: string;
  absoluteMaxOccurrences: string;
  timeSlots: string[];
  completionFactKind: LitterPlanningModelCompletionFactKind | null;
  displayOrder: number;
  isRequired: boolean;
  isSelectedByDefault: boolean;
};

export type LitterPlanningModelEditorDraft = {
  mode: LitterPlanningModelEditorMode;
  modelId: string | null;
  expectedRevision: number | null;
  title: string;
  description: string;
  species: "" | "dog" | "cat";
  breed: string;
  isActive: boolean;
  sourceModelId: string | null;
  sourceTitle: string | null;
  sourceOriginLabel: string | null;
  libraryModelCode: string | null;
  libraryModelVersion: number | null;
  items: LitterPlanningModelEditorItemDraft[];
};

export type LitterPlanningModelEditorFieldError = {
  path: string;
  message: string;
};

export type LitterPlanningModelEditorValidationResult =
  | {
      ok: true;
      payload: {
        title: string;
        description: string | null;
        species: "dog" | "cat" | null;
        breed: string | null;
        items: LitterPlanningModelItemInput[];
      };
      warnings: string[];
    }
  | {
      ok: false;
      errors: LitterPlanningModelEditorFieldError[];
      warnings: string[];
    };

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const INTEGER = /^-?(0|[1-9]\d*)$/;
const POSITIVE_INTEGER = /^(0|[1-9]\d*)$/;
const COPY_TITLE_PREFIX = "Copie de ";
const MAX_MODEL_TITLE_LENGTH = 255;
const MAX_EDITOR_ITEMS = 100;
const MAX_TIME_SLOTS = 8;

const EDITOR_MODES = ["create", "edit", "duplicate"] as const;
const EDITOR_SPECIES = ["", "dog", "cat"] as const;

let draftKeyCounter = 0;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringValue(value: unknown): value is string {
  return typeof value === "string";
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isBooleanValue(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isClosedString<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function parseEditorItemDraft(
  value: unknown,
): LitterPlanningModelEditorItemDraft | null {
  if (!isPlainObject(value)) return null;
  if (
    !isStringValue(value.key) ||
    !isStringValue(value.organizationTemplateId) ||
    !isClosedString(value.itemKind, LITTER_PLANNING_MODEL_ITEM_KINDS) ||
    !isClosedString(value.priority, LITTER_PLANNING_MODEL_PRIORITIES) ||
    !isClosedString(value.anchorType, LITTER_PLANNING_MODEL_ANCHORS) ||
    !isStringValue(value.pointOffsetDays) ||
    !isStringValue(value.pointLocalTime) ||
    !isStringValue(value.windowStartsOffsetDays) ||
    !isStringValue(value.windowStartsLocalTime) ||
    !isStringValue(value.windowEndsOffsetDays) ||
    !isStringValue(value.windowEndsLocalTime) ||
    !isClosedString(value.recurrenceKind, LITTER_PLANNING_MODEL_RECURRENCE_KINDS) ||
    !isStringValue(value.recurrenceIntervalDays) ||
    !isStringValue(value.recurrenceStartsOffsetDays) ||
    !isClosedString(
      value.recurrenceEndKind,
      LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS,
    ) ||
    !isStringValue(value.recurrenceEndsOffsetDays) ||
    !isStringValue(value.recurrenceDayCount) ||
    !isStringValue(value.initialMaterializationHorizonDays) ||
    !isStringValue(value.absoluteMaxOccurrences) ||
    !Array.isArray(value.timeSlots) ||
    value.timeSlots.length > MAX_TIME_SLOTS ||
    !value.timeSlots.every(isStringValue) ||
    !isNonNegativeInteger(value.displayOrder) ||
    !isBooleanValue(value.isRequired) ||
    !isBooleanValue(value.isSelectedByDefault) ||
    !(
      value.completionFactKind === undefined ||
      value.completionFactKind === null ||
      isClosedString(
        value.completionFactKind,
        LITTER_PLANNING_MODEL_COMPLETION_FACT_KINDS,
      )
    )
  ) {
    return null;
  }

  return {
    key: value.key,
    organizationTemplateId: value.organizationTemplateId,
    itemKind: value.itemKind,
    priority: value.priority,
    anchorType: value.anchorType,
    pointOffsetDays: value.pointOffsetDays,
    pointLocalTime: value.pointLocalTime,
    windowStartsOffsetDays: value.windowStartsOffsetDays,
    windowStartsLocalTime: value.windowStartsLocalTime,
    windowEndsOffsetDays: value.windowEndsOffsetDays,
    windowEndsLocalTime: value.windowEndsLocalTime,
    recurrenceKind: value.recurrenceKind,
    recurrenceIntervalDays: value.recurrenceIntervalDays,
    recurrenceStartsOffsetDays: value.recurrenceStartsOffsetDays,
    recurrenceEndKind: value.recurrenceEndKind,
    recurrenceEndsOffsetDays: value.recurrenceEndsOffsetDays,
    recurrenceDayCount: value.recurrenceDayCount,
    initialMaterializationHorizonDays: value.initialMaterializationHorizonDays,
    absoluteMaxOccurrences: value.absoluteMaxOccurrences,
    timeSlots: [...value.timeSlots],
    completionFactKind: value.completionFactKind ?? null,
    displayOrder: value.displayOrder,
    isRequired: value.isRequired,
    isSelectedByDefault: value.isSelectedByDefault,
  };
}

export function parseLitterPlanningModelEditorDraftPayload(
  raw: unknown,
): LitterPlanningModelEditorDraft | null {
  try {
    if (!isPlainObject(raw)) return null;
    if (
      !isClosedString(raw.mode, EDITOR_MODES) ||
      !(raw.modelId === null || isStringValue(raw.modelId)) ||
      !(raw.expectedRevision === null || isPositiveInteger(raw.expectedRevision)) ||
      !isStringValue(raw.title) ||
      !isStringValue(raw.description) ||
      !isClosedString(raw.species, EDITOR_SPECIES) ||
      !isStringValue(raw.breed) ||
      !isBooleanValue(raw.isActive) ||
      !isStringOrNull(raw.sourceModelId) ||
      !isStringOrNull(raw.sourceTitle) ||
      !isStringOrNull(raw.sourceOriginLabel) ||
      !isStringOrNull(raw.libraryModelCode) ||
      !(
        raw.libraryModelVersion === null ||
        isPositiveInteger(raw.libraryModelVersion)
      ) ||
      !Array.isArray(raw.items) ||
      raw.items.length > MAX_EDITOR_ITEMS
    ) {
      return null;
    }

    const items: LitterPlanningModelEditorItemDraft[] = [];
    for (const entry of raw.items) {
      const item = parseEditorItemDraft(entry);
      if (!item) return null;
      items.push(item);
    }

    return {
      mode: raw.mode,
      modelId: raw.modelId,
      expectedRevision: raw.expectedRevision,
      title: raw.title,
      description: raw.description,
      species: raw.species,
      breed: raw.breed,
      isActive: raw.isActive,
      sourceModelId: raw.sourceModelId,
      sourceTitle: raw.sourceTitle,
      sourceOriginLabel: raw.sourceOriginLabel,
      libraryModelCode: raw.libraryModelCode,
      libraryModelVersion: raw.libraryModelVersion,
      items,
    };
  } catch {
    return null;
  }
}

export function buildLitterPlanningModelCopyTitle(sourceTitle: string): string {
  const trimmed = sourceTitle.trim();
  const maxSourceLength = MAX_MODEL_TITLE_LENGTH - COPY_TITLE_PREFIX.length;
  const source =
    trimmed.length > maxSourceLength
      ? trimmed.slice(0, maxSourceLength)
      : trimmed;
  const title = `${COPY_TITLE_PREFIX}${source}`;
  return title.length > 0 ? title.slice(0, MAX_MODEL_TITLE_LENGTH) : COPY_TITLE_PREFIX.trimEnd();
}

function nextDraftKey(prefix = "item") {
  draftKeyCounter += 1;
  return `${prefix}-${draftKeyCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyOptionalTime(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function defaultPointFields(template?: LitterPlanningModelEditorTemplateOption) {
  return {
    pointOffsetDays: String(template?.offsetDays ?? 0),
    pointLocalTime: "",
  };
}

function defaultWindowFields(template?: LitterPlanningModelEditorTemplateOption) {
  const start = template?.offsetDays ?? 0;
  return {
    windowStartsOffsetDays: String(start),
    windowStartsLocalTime: "",
    windowEndsOffsetDays: String(start),
    windowEndsLocalTime: "",
  };
}

function defaultRecurringFields() {
  return {
    recurrenceKind: "daily_interval" as const,
    recurrenceIntervalDays: "1",
    recurrenceStartsOffsetDays: "0",
    recurrenceEndKind: "fixed_recurrence_day_count" as const,
    recurrenceEndsOffsetDays: "",
    recurrenceDayCount: "7",
    initialMaterializationHorizonDays: "7",
    absoluteMaxOccurrences: "30",
    timeSlots: ["08:00"],
    completionFactKind: null as LitterPlanningModelCompletionFactKind | null,
  };
}

export function createEmptyLitterPlanningModelEditorItem(
  template: LitterPlanningModelEditorTemplateOption,
  displayOrder: number,
  itemKind: LitterPlanningModelItemKind = "milestone",
): LitterPlanningModelEditorItemDraft {
  const point = defaultPointFields(template);
  const window = defaultWindowFields(template);
  const recurring = defaultRecurringFields();
  return {
    key: nextDraftKey(),
    organizationTemplateId: template.id,
    itemKind,
    priority: "normal",
    anchorType: (LITTER_PLANNING_MODEL_ANCHORS.includes(
      template.anchorType as LitterPlanningModelAnchor,
    )
      ? template.anchorType
      : "expected_birth") as LitterPlanningModelAnchor,
    ...point,
    ...window,
    ...recurring,
    displayOrder,
    isRequired: false,
    isSelectedByDefault: true,
  };
}

function itemToDraft(
  item: LitterPlanningModelItem | LitterPlanningModelItemInput,
  key?: string,
): LitterPlanningModelEditorItemDraft {
  const point = defaultPointFields();
  const window = defaultWindowFields();
  const recurring = defaultRecurringFields();
  return {
    key: key ?? nextDraftKey(),
    organizationTemplateId: item.organizationTemplateId,
    itemKind: item.itemKind,
    priority: item.priority,
    anchorType: item.anchorType,
    pointOffsetDays:
      item.pointOffsetDays === undefined
        ? point.pointOffsetDays
        : String(item.pointOffsetDays),
    pointLocalTime: emptyOptionalTime(item.pointLocalTime),
    windowStartsOffsetDays:
      item.windowStartsOffsetDays === undefined
        ? window.windowStartsOffsetDays
        : String(item.windowStartsOffsetDays),
    windowStartsLocalTime: emptyOptionalTime(item.windowStartsLocalTime),
    windowEndsOffsetDays:
      item.windowEndsOffsetDays === undefined
        ? window.windowEndsOffsetDays
        : String(item.windowEndsOffsetDays),
    windowEndsLocalTime: emptyOptionalTime(item.windowEndsLocalTime),
    recurrenceKind: item.recurrenceKind ?? recurring.recurrenceKind,
    recurrenceIntervalDays:
      item.recurrenceIntervalDays === undefined
        ? recurring.recurrenceIntervalDays
        : String(item.recurrenceIntervalDays),
    recurrenceStartsOffsetDays:
      item.recurrenceStartsOffsetDays === undefined
        ? recurring.recurrenceStartsOffsetDays
        : String(item.recurrenceStartsOffsetDays),
    recurrenceEndKind: item.recurrenceEndKind ?? recurring.recurrenceEndKind,
    recurrenceEndsOffsetDays:
      item.recurrenceEndsOffsetDays === undefined
        ? ""
        : String(item.recurrenceEndsOffsetDays),
    recurrenceDayCount:
      item.recurrenceDayCount === undefined
        ? recurring.recurrenceDayCount
        : String(item.recurrenceDayCount),
    initialMaterializationHorizonDays:
      item.initialMaterializationHorizonDays === undefined
        ? recurring.initialMaterializationHorizonDays
        : String(item.initialMaterializationHorizonDays),
    absoluteMaxOccurrences:
      item.absoluteMaxOccurrences === undefined
        ? recurring.absoluteMaxOccurrences
        : String(item.absoluteMaxOccurrences),
    timeSlots:
      item.timeSlots && item.timeSlots.length > 0
        ? [...item.timeSlots]
        : [...recurring.timeSlots],
    completionFactKind: item.completionFactKind ?? null,
    displayOrder: item.displayOrder,
    isRequired: item.isRequired,
    isSelectedByDefault: item.isSelectedByDefault,
  };
}

export function createEmptyLitterPlanningModelEditorDraft(): LitterPlanningModelEditorDraft {
  return {
    mode: "create",
    modelId: null,
    expectedRevision: null,
    title: "",
    description: "",
    species: "",
    breed: "",
    isActive: false,
    sourceModelId: null,
    sourceTitle: null,
    sourceOriginLabel: null,
    libraryModelCode: null,
    libraryModelVersion: null,
    items: [],
  };
}

export function createLitterPlanningModelEditorDraftFromModel(
  model: LitterPlanningModel,
  options?: {
    mode?: "edit" | "duplicate";
    sourceOriginLabel?: string | null;
  },
): LitterPlanningModelEditorDraft {
  const mode = options?.mode ?? "edit";
  const isDuplicate = mode === "duplicate";
  return {
    mode,
    modelId: isDuplicate ? null : model.id,
    expectedRevision: isDuplicate ? null : model.revision,
    title: isDuplicate
      ? buildLitterPlanningModelCopyTitle(model.title)
      : model.title,
    description: model.description ?? "",
    species: model.species ?? "",
    breed: model.breed ?? "",
    isActive: isDuplicate ? false : model.isActive,
    sourceModelId: isDuplicate ? model.id : null,
    sourceTitle: isDuplicate ? model.title : null,
    sourceOriginLabel: isDuplicate
      ? (options?.sourceOriginLabel ?? null)
      : null,
    libraryModelCode: isDuplicate ? null : model.libraryModelCode,
    libraryModelVersion: isDuplicate ? null : model.libraryModelVersion,
    items: normalizeLitterPlanningModelEditorItemOrders(
      model.items.map((item) => itemToDraft(item)),
    ),
  };
}

export function isLitterPlanningModelImported(model: {
  libraryModelCode: string | null;
  libraryModelVersion: number | null;
}) {
  return Boolean(model.libraryModelCode && model.libraryModelVersion);
}

export function canEditLitterPlanningModelDirectly(model: {
  libraryModelCode: string | null;
  libraryModelVersion: number | null;
}) {
  return !isLitterPlanningModelImported(model);
}

export function normalizeLitterPlanningModelEditorItemOrders(
  items: LitterPlanningModelEditorItemDraft[],
): LitterPlanningModelEditorItemDraft[] {
  return items.map((item, index) => ({ ...item, displayOrder: index }));
}

export function moveLitterPlanningModelEditorItem(
  items: LitterPlanningModelEditorItemDraft[],
  key: string,
  direction: "up" | "down",
): LitterPlanningModelEditorItemDraft[] {
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return items;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const current = next[index]!;
  next[index] = next[target]!;
  next[target] = current;
  return normalizeLitterPlanningModelEditorItemOrders(next);
}

export function duplicateLitterPlanningModelEditorItem(
  items: LitterPlanningModelEditorItemDraft[],
  key: string,
): LitterPlanningModelEditorItemDraft[] {
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return items;
  const source = items[index]!;
  const copy: LitterPlanningModelEditorItemDraft = {
    ...source,
    key: nextDraftKey("copy"),
    timeSlots: [...source.timeSlots],
  };
  const next = [...items];
  next.splice(index + 1, 0, copy);
  return normalizeLitterPlanningModelEditorItemOrders(next);
}

export function removeLitterPlanningModelEditorItem(
  items: LitterPlanningModelEditorItemDraft[],
  key: string,
): LitterPlanningModelEditorItemDraft[] {
  return normalizeLitterPlanningModelEditorItemOrders(
    items.filter((item) => item.key !== key),
  );
}

export function applyLitterPlanningModelEditorRequired(
  item: LitterPlanningModelEditorItemDraft,
  isRequired: boolean,
): LitterPlanningModelEditorItemDraft {
  if (isRequired) {
    return { ...item, isRequired: true, isSelectedByDefault: true };
  }
  return { ...item, isRequired: false };
}

export function itemHasComplexConfiguration(
  item: LitterPlanningModelEditorItemDraft,
): boolean {
  if (item.itemKind === "window") {
    return (
      item.windowStartsOffsetDays !== item.windowEndsOffsetDays ||
      Boolean(item.windowStartsLocalTime.trim()) ||
      Boolean(item.windowEndsLocalTime.trim())
    );
  }
  if (item.itemKind === "recurring_task") {
    return (
      item.timeSlots.length !== 1 ||
      item.timeSlots[0] !== "08:00" ||
      item.recurrenceStartsOffsetDays !== "0" ||
      item.recurrenceIntervalDays !== "1" ||
      item.recurrenceEndKind !== "fixed_recurrence_day_count" ||
      item.recurrenceDayCount !== "7" ||
      item.initialMaterializationHorizonDays !== "7" ||
      item.absoluteMaxOccurrences !== "30" ||
      Boolean(item.recurrenceEndsOffsetDays.trim())
    );
  }
  return (
    Boolean(item.pointLocalTime.trim()) ||
    item.pointOffsetDays !== "0" ||
    item.priority !== "normal"
  );
}

export function convertLitterPlanningModelEditorItemKind(
  item: LitterPlanningModelEditorItemDraft,
  nextKind: LitterPlanningModelItemKind,
): LitterPlanningModelEditorItemDraft {
  if (item.itemKind === nextKind) return item;

  const base: LitterPlanningModelEditorItemDraft = {
    ...item,
    itemKind: nextKind,
    ...defaultPointFields(),
    ...defaultWindowFields(),
    ...defaultRecurringFields(),
    pointOffsetDays: item.pointOffsetDays || "0",
    windowStartsOffsetDays:
      item.windowStartsOffsetDays || item.pointOffsetDays || "0",
    windowEndsOffsetDays:
      item.windowEndsOffsetDays ||
      item.windowStartsOffsetDays ||
      item.pointOffsetDays ||
      "0",
    recurrenceStartsOffsetDays:
      item.recurrenceStartsOffsetDays || item.pointOffsetDays || "0",
  };

  if (nextKind === "milestone" || nextKind === "task") {
    return {
      ...base,
      itemKind: nextKind,
      pointOffsetDays:
        item.itemKind === "window"
          ? item.windowStartsOffsetDays || "0"
          : item.itemKind === "recurring_task"
            ? item.recurrenceStartsOffsetDays || "0"
            : item.pointOffsetDays || "0",
      pointLocalTime:
        item.itemKind === "milestone" || item.itemKind === "task"
          ? item.pointLocalTime
          : "",
      completionFactKind: null,
    };
  }

  if (nextKind === "window") {
    const start =
      item.itemKind === "recurring_task"
        ? item.recurrenceStartsOffsetDays || "0"
        : item.pointOffsetDays || "0";
    return {
      ...base,
      itemKind: "window",
      windowStartsOffsetDays: start,
      windowEndsOffsetDays: start,
      windowStartsLocalTime: "",
      windowEndsLocalTime: "",
      completionFactKind: null,
    };
  }

  return {
    ...base,
    itemKind: "recurring_task",
    ...defaultRecurringFields(),
    recurrenceStartsOffsetDays:
      item.itemKind === "window"
        ? item.windowStartsOffsetDays || "0"
        : item.pointOffsetDays || "0",
    completionFactKind: null,
  };
}

export function isElementaryTemplateCompatibleWithModel(input: {
  templateSpecies: "dog" | "cat";
  templateBreed: string | null;
  modelSpecies: "" | "dog" | "cat" | null;
  modelBreed: string | null | undefined;
}): boolean {
  const modelSpecies = input.modelSpecies || null;
  const modelBreed = input.modelBreed?.trim() || null;
  if (modelSpecies && input.templateSpecies !== modelSpecies) return false;
  if (
    modelBreed &&
    input.templateBreed &&
    input.templateBreed.trim().toLowerCase() !== modelBreed.toLowerCase()
  ) {
    return false;
  }
  return true;
}

export function listCompatibleElementaryTemplates(
  templates: LitterPlanningModelEditorTemplateOption[],
  modelSpecies: "" | "dog" | "cat",
  modelBreed: string,
): LitterPlanningModelEditorTemplateOption[] {
  return templates.filter((template) =>
    isElementaryTemplateCompatibleWithModel({
      templateSpecies: template.species,
      templateBreed: template.breed,
      modelSpecies,
      modelBreed,
    }),
  );
}

export function listPreferredAddableElementaryTemplates(
  templates: LitterPlanningModelEditorTemplateOption[],
  modelSpecies: "" | "dog" | "cat",
  modelBreed: string,
): LitterPlanningModelEditorTemplateOption[] {
  return listCompatibleElementaryTemplates(
    templates,
    modelSpecies,
    modelBreed,
  ).filter((template) => template.isActive);
}

function parseOptionalInteger(
  value: string,
  path: string,
  errors: LitterPlanningModelEditorFieldError[],
  options?: { required?: boolean; min?: number; max?: number },
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    if (options?.required) {
      errors.push({ path, message: "Cette valeur est obligatoire." });
    }
    return undefined;
  }
  if (!INTEGER.test(trimmed)) {
    errors.push({ path, message: "Saisissez un nombre entier." });
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    errors.push({ path, message: "Ce nombre n’est pas valide." });
    return undefined;
  }
  if (options?.min !== undefined && parsed < options.min) {
    errors.push({ path, message: `La valeur minimale est ${options.min}.` });
    return undefined;
  }
  if (options?.max !== undefined && parsed > options.max) {
    errors.push({ path, message: `La valeur maximale est ${options.max}.` });
    return undefined;
  }
  return parsed;
}

function parseOptionalLocalTime(
  value: string,
  path: string,
  errors: LitterPlanningModelEditorFieldError[],
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!LOCAL_TIME.test(trimmed)) {
    errors.push({
      path,
      message: "Indiquez une heure au format HH:MM.",
    });
    return undefined;
  }
  return trimmed;
}

function draftItemToPayloadCandidate(
  item: LitterPlanningModelEditorItemDraft,
  errors: LitterPlanningModelEditorFieldError[],
): Record<string, unknown> | null {
  const prefix = `items.${item.key}`;
  if (
    !LITTER_PLANNING_MODEL_ITEM_KINDS.includes(item.itemKind) ||
    !LITTER_PLANNING_MODEL_PRIORITIES.includes(item.priority) ||
    !LITTER_PLANNING_MODEL_ANCHORS.includes(item.anchorType)
  ) {
    errors.push({
      path: `${prefix}.itemKind`,
      message: "La configuration de cet élément est invalide.",
    });
    return null;
  }

  if (item.isRequired && !item.isSelectedByDefault) {
    errors.push({
      path: `${prefix}.isSelectedByDefault`,
      message: "Un élément obligatoire doit être sélectionné par défaut.",
    });
  }

  if (item.itemKind === "window") {
    const windowStartsOffsetDays = parseOptionalInteger(
      item.windowStartsOffsetDays,
      `${prefix}.windowStartsOffsetDays`,
      errors,
      { required: true },
    );
    const windowEndsOffsetDays = parseOptionalInteger(
      item.windowEndsOffsetDays,
      `${prefix}.windowEndsOffsetDays`,
      errors,
      { required: true },
    );
    const windowStartsLocalTime = parseOptionalLocalTime(
      item.windowStartsLocalTime,
      `${prefix}.windowStartsLocalTime`,
      errors,
    );
    const windowEndsLocalTime = parseOptionalLocalTime(
      item.windowEndsLocalTime,
      `${prefix}.windowEndsLocalTime`,
      errors,
    );
    if (
      windowStartsOffsetDays !== undefined &&
      windowEndsOffsetDays !== undefined &&
      windowStartsOffsetDays > windowEndsOffsetDays
    ) {
      errors.push({
        path: `${prefix}.windowEndsOffsetDays`,
        message: "La fin doit être postérieure ou égale au début.",
      });
    }
    if (
      windowStartsOffsetDays !== undefined &&
      windowEndsOffsetDays !== undefined &&
      windowStartsOffsetDays === windowEndsOffsetDays &&
      windowStartsLocalTime &&
      windowEndsLocalTime &&
      windowStartsLocalTime > windowEndsLocalTime
    ) {
      errors.push({
        path: `${prefix}.windowEndsLocalTime`,
        message: "À date identique, l’heure de fin doit être postérieure ou égale à l’heure de début.",
      });
    }
    return {
      organizationTemplateId: item.organizationTemplateId,
      itemKind: "window",
      priority: item.priority,
      anchorType: item.anchorType,
      ...(windowStartsOffsetDays === undefined
        ? {}
        : { windowStartsOffsetDays }),
      ...(windowStartsLocalTime === undefined
        ? {}
        : { windowStartsLocalTime }),
      ...(windowEndsOffsetDays === undefined ? {} : { windowEndsOffsetDays }),
      ...(windowEndsLocalTime === undefined ? {} : { windowEndsLocalTime }),
      displayOrder: item.displayOrder,
      isRequired: item.isRequired,
      isSelectedByDefault: item.isSelectedByDefault,
    };
  }

  if (item.itemKind === "recurring_task") {
    if (
      !LITTER_PLANNING_MODEL_RECURRENCE_KINDS.includes(item.recurrenceKind) ||
      !LITTER_PLANNING_MODEL_RECURRENCE_END_KINDS.includes(item.recurrenceEndKind)
    ) {
      errors.push({
        path: `${prefix}.recurrenceKind`,
        message: "La configuration de récurrence est invalide.",
      });
    }
    const recurrenceIntervalDays = parseOptionalInteger(
      item.recurrenceIntervalDays,
      `${prefix}.recurrenceIntervalDays`,
      errors,
      { required: true, min: 1, max: 365 },
    );
    const recurrenceStartsOffsetDays = parseOptionalInteger(
      item.recurrenceStartsOffsetDays,
      `${prefix}.recurrenceStartsOffsetDays`,
      errors,
      { required: true },
    );
    const initialMaterializationHorizonDays = parseOptionalInteger(
      item.initialMaterializationHorizonDays,
      `${prefix}.initialMaterializationHorizonDays`,
      errors,
      { required: true, min: 1, max: 365 },
    );
    const absoluteMaxOccurrences = parseOptionalInteger(
      item.absoluteMaxOccurrences,
      `${prefix}.absoluteMaxOccurrences`,
      errors,
      { required: true, min: 1, max: 500 },
    );

    const timeSlots: string[] = [];
    let previous: string | null = null;
    if (item.timeSlots.length < 1 || item.timeSlots.length > 8) {
      errors.push({
        path: `${prefix}.timeSlots`,
        message: "Indiquez entre 1 et 8 créneaux horaires.",
      });
    }
    for (let index = 0; index < item.timeSlots.length; index += 1) {
      const slot = parseOptionalLocalTime(
        item.timeSlots[index] ?? "",
        `${prefix}.timeSlots.${index}`,
        errors,
      );
      if (!slot) {
        if (!(item.timeSlots[index] ?? "").trim()) {
          errors.push({
            path: `${prefix}.timeSlots.${index}`,
            message: "Chaque créneau doit être renseigné.",
          });
        }
        continue;
      }
      if (previous !== null && slot <= previous) {
        errors.push({
          path: `${prefix}.timeSlots.${index}`,
          message: "Les créneaux doivent être uniques et strictement croissants.",
        });
      }
      timeSlots.push(slot);
      previous = slot;
    }

    const payload: Record<string, unknown> = {
      organizationTemplateId: item.organizationTemplateId,
      itemKind: "recurring_task",
      priority: item.priority,
      anchorType: item.anchorType,
      recurrenceKind: item.recurrenceKind,
      ...(recurrenceIntervalDays === undefined
        ? {}
        : { recurrenceIntervalDays }),
      ...(recurrenceStartsOffsetDays === undefined
        ? {}
        : { recurrenceStartsOffsetDays }),
      recurrenceEndKind: item.recurrenceEndKind,
      ...(initialMaterializationHorizonDays === undefined
        ? {}
        : { initialMaterializationHorizonDays }),
      ...(absoluteMaxOccurrences === undefined
        ? {}
        : { absoluteMaxOccurrences }),
      timeSlots,
      ...(item.completionFactKind === null
        ? {}
        : { completionFactKind: item.completionFactKind }),
      displayOrder: item.displayOrder,
      isRequired: item.isRequired,
      isSelectedByDefault: item.isSelectedByDefault,
    };

    if (item.recurrenceEndKind === "fixed_end_offset") {
      const recurrenceEndsOffsetDays = parseOptionalInteger(
        item.recurrenceEndsOffsetDays,
        `${prefix}.recurrenceEndsOffsetDays`,
        errors,
        { required: true },
      );
      if (
        recurrenceEndsOffsetDays !== undefined &&
        recurrenceStartsOffsetDays !== undefined &&
        recurrenceEndsOffsetDays < recurrenceStartsOffsetDays
      ) {
        errors.push({
          path: `${prefix}.recurrenceEndsOffsetDays`,
          message:
            "Le décalage final doit être supérieur ou égal au décalage de début.",
        });
      }
      if (recurrenceEndsOffsetDays !== undefined) {
        payload.recurrenceEndsOffsetDays = recurrenceEndsOffsetDays;
      }
    } else if (item.recurrenceEndKind === "fixed_recurrence_day_count") {
      const recurrenceDayCount = parseOptionalInteger(
        item.recurrenceDayCount,
        `${prefix}.recurrenceDayCount`,
        errors,
        { required: true, min: 1, max: 500 },
      );
      if (
        recurrenceDayCount !== undefined &&
        absoluteMaxOccurrences !== undefined &&
        recurrenceDayCount * timeSlots.length > absoluteMaxOccurrences
      ) {
        errors.push({
          path: `${prefix}.absoluteMaxOccurrences`,
          message:
            "Le plafond d’occurrences doit couvrir le nombre de jours × le nombre de créneaux.",
        });
      }
      if (recurrenceDayCount !== undefined) {
        payload.recurrenceDayCount = recurrenceDayCount;
      }
    }

    return payload;
  }

  const pointOffsetDays = parseOptionalInteger(
    item.pointOffsetDays,
    `${prefix}.pointOffsetDays`,
    errors,
    { required: true },
  );
  const pointLocalTime = parseOptionalLocalTime(
    item.pointLocalTime,
    `${prefix}.pointLocalTime`,
    errors,
  );
  return {
    organizationTemplateId: item.organizationTemplateId,
    itemKind: item.itemKind,
    priority: item.priority,
    anchorType: item.anchorType,
    ...(pointOffsetDays === undefined ? {} : { pointOffsetDays }),
    ...(pointLocalTime === undefined ? {} : { pointLocalTime }),
    displayOrder: item.displayOrder,
    isRequired: item.isRequired,
    isSelectedByDefault: item.isSelectedByDefault,
  };
}

export function validateLitterPlanningModelEditorDraft(
  draft: LitterPlanningModelEditorDraft,
  templates: LitterPlanningModelEditorTemplateOption[],
): LitterPlanningModelEditorValidationResult {
  const errors: LitterPlanningModelEditorFieldError[] = [];
  const warnings: string[] = [];
  const templatesById = new Map(templates.map((template) => [template.id, template]));

  const title = draft.title.trim();
  if (!title) {
    errors.push({ path: "title", message: "Le titre est obligatoire." });
  } else if (title.length > 255) {
    errors.push({
      path: "title",
      message: "Le titre ne peut pas dépasser 255 caractères.",
    });
  }

  const description = draft.description.trim();
  if (description.length > 5_000) {
    errors.push({
      path: "description",
      message: "La description ne peut pas dépasser 5 000 caractères.",
    });
  }

  const species =
    draft.species === "dog" || draft.species === "cat" ? draft.species : null;
  if (draft.species !== "" && draft.species !== "dog" && draft.species !== "cat") {
    errors.push({ path: "species", message: "L’espèce sélectionnée est invalide." });
  }

  const breed = draft.breed.trim();
  if (breed && !species) {
    errors.push({
      path: "breed",
      message: "Une race ne peut pas être renseignée sans espèce.",
    });
  }
  if (breed.length > 255) {
    errors.push({
      path: "breed",
      message: "La race ne peut pas dépasser 255 caractères.",
    });
  }

  if (draft.mode === "edit" && isLitterPlanningModelImported(draft)) {
    errors.push({
      path: "libraryModelCode",
      message:
        "Un modèle importé ne peut pas être modifié directement. Créez une copie personnalisée.",
    });
  }

  if (draft.items.length === 0) {
    warnings.push(
      "Ce modèle ne contient aucun élément. Vous pourrez l’enrichir plus tard avant de l’activer.",
    );
  }

  if (draft.items.length > 100) {
    errors.push({
      path: "items",
      message: "Un modèle ne peut pas contenir plus de 100 éléments.",
    });
  }

  const ordered = normalizeLitterPlanningModelEditorItemOrders(draft.items);
  const candidates: Record<string, unknown>[] = [];

  for (const item of ordered) {
    const template = templatesById.get(item.organizationTemplateId);
    if (!template) {
      errors.push({
        path: `items.${item.key}.organizationTemplateId`,
        message: "Le jalon élémentaire de cet élément est introuvable.",
      });
    } else if (
      !isElementaryTemplateCompatibleWithModel({
        templateSpecies: template.species,
        templateBreed: template.breed,
        modelSpecies: draft.species,
        modelBreed: breed,
      })
    ) {
      errors.push({
        path: `items.${item.key}.organizationTemplateId`,
        message: `« ${template.title} » est incompatible avec l’espèce ou la race du modèle.`,
      });
    }

    if (
      item.completionFactKind === "maternal_temperature_observation" &&
      (
        item.itemKind !== "recurring_task" ||
        template?.category !== "maternal_health" ||
        template.targetScope !== "mother"
      )
    ) {
      errors.push({
        path: `items.${item.key}.completionFactKind`,
        message:
          "La validation par température exige un suivi récurrent de santé maternelle ciblant la mère.",
      });
    }

    const candidate = draftItemToPayloadCandidate(item, errors);
    if (candidate) candidates.push(candidate);
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const parsed = parseLitterPlanningModelItems(candidates);
  if (!parsed) {
    return {
      ok: false,
      errors: [
        {
          path: "items",
          message:
            "La configuration des éléments n’est pas conforme aux règles métier.",
        },
      ],
      warnings,
    };
  }

  return {
    ok: true,
    payload: {
      title,
      description: description || null,
      species,
      breed: breed || null,
      items: parsed,
    },
    warnings,
  };
}

export function templateOptionFromSummary(
  template: LitterCareTaskTemplateSummary,
): LitterPlanningModelEditorTemplateOption {
  return {
    id: template.id,
    title: template.title,
    category: template.category,
    targetScope: template.targetScope,
    anchorType: template.anchorType,
    offsetDays: template.offsetDays,
    species: template.species,
    breed: template.breed,
    isActive: template.isActive,
  };
}

export function assertPositiveIntegerString(value: string) {
  return POSITIVE_INTEGER.test(value.trim());
}
