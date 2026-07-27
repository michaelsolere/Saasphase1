/**
 * Pure helpers for applying a litter planning model from the Journal UI.
 * No I/O — safe for the pure Playwright runner.
 */

import { addGestationAnchorCivilDays } from "./gestation-anchor";
import { LITTER_JOURNAL_TIME_ZONE } from "./date";
import {
  resolveLitterPlanAnchorDate,
  type LitterPlanAnchorInput,
} from "./litter-plan-anchor";
import {
  litterPlanSeriesInitialThroughDate,
} from "./litter-plans-core";
import type {
  LitterPlanningModelAnchor,
  LitterPlanningModelItemKind,
  LitterPlanningModelPriority,
  LitterPlanningModelRecurrenceEndKind,
} from "./litter-planning-models-core";
import type { Json } from "@/types/database.types";

export const LITTER_PLANNING_MODEL_APPLY_INDEPENDENCE_MESSAGE =
  "Le modèle sera copié dans le planning de cette portée. Les futures modifications du modèle ne modifieront pas ce planning.";

export const LITTER_PLANNING_MODEL_APPLY_CONFIRMATION_WARNING =
  "Ce modèle ne pourra pas être appliqué une seconde fois à ce planning. Les éléments non sélectionnés ne seront pas ajoutés ultérieurement depuis ce même modèle. Pour créer une autre variante, dupliquez ou personnalisez le modèle dans les paramètres.";

export const LITTER_PLANNING_MODEL_APPLY_EMPTY_MESSAGE =
  "Aucun modèle actif compatible n’est disponible pour cette portée.";

export const LITTER_PLANNING_MODEL_APPLY_NO_PLAN_MESSAGE =
  "Aucun planning composé n’a encore été créé. L’application du premier modèle créera automatiquement le planning de la portée.";

export const LITTER_PLANNING_MODEL_APPLY_SETTINGS_HREF =
  "/settings/litter-planning-models";

export const LITTER_PLAN_APPLICABLE_STATUSES = [
  "mating_done",
  "pregnancy_unconfirmed",
  "pregnancy_confirmed",
  "birth_expected",
  "birth_in_progress",
  "born",
  "puppies_created",
  "choice_period",
  "ready_to_leave",
] as const;

export type LitterPlanApplicableStatus =
  (typeof LITTER_PLAN_APPLICABLE_STATUSES)[number];

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";

export type LitterPlanningModelApplyOrigin = "library" | "custom";

export type LitterPlanningModelApplyStatus =
  | "available"
  | "already_applied";

export type LitterPlanningModelApplySelectionItem = {
  publicIndex: number;
  isRequired: boolean;
  isSelectedByDefault: boolean;
};

export type LitterPlanningModelApplyPreviewKind =
  | "point"
  | "window"
  | "recurring"
  | "pending_anchor";

export type LitterPlanningModelApplyPreview = {
  kind: LitterPlanningModelApplyPreviewKind;
  label: string;
  projectedStartDate: string | null;
  projectedEndDate: string | null;
};

export type LitterPlanningModelAppliedSnapshot = {
  sourcePlanningModelId: string;
  sourcePlanningModelRevision: number;
};

export type LitterPlanningModelApplyItemCounters = {
  addedCount: number;
  materializedCount: number;
  pendingAnchorCount: number;
  recurringPreparedOccurrenceCount: number | null;
};

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCivilDate(value: string | null | undefined): value is string {
  if (!value || !CIVIL_DATE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isLitterPlanningModelSpeciesCompatible(
  modelSpecies: "dog" | "cat" | null,
  litterSpecies: "dog" | "cat",
): boolean {
  return modelSpecies === null || modelSpecies === litterSpecies;
}

export function isLitterPlanningModelBreedCompatible(
  modelBreed: string | null,
  litterBreed: string,
): boolean {
  return (
    modelBreed === null ||
    modelBreed.trim().toLowerCase() === litterBreed.trim().toLowerCase()
  );
}

export function isLitterPlanningModelCompatibleWithLitter(input: {
  modelSpecies: "dog" | "cat" | null;
  modelBreed: string | null;
  litterSpecies: "dog" | "cat";
  litterBreed: string;
}): boolean {
  return (
    isLitterPlanningModelSpeciesCompatible(
      input.modelSpecies,
      input.litterSpecies,
    ) &&
    isLitterPlanningModelBreedCompatible(input.modelBreed, input.litterBreed)
  );
}

export function isLitterStatusApplicableForPlanningModel(
  status: string,
): status is LitterPlanApplicableStatus {
  return (LITTER_PLAN_APPLICABLE_STATUSES as readonly string[]).includes(status);
}

export function canApplyLitterPlanningModel(
  role: OrganizationRole | null | undefined,
): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canViewLitterPlanningModelApplication(
  role: OrganizationRole | null | undefined,
): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "member" ||
    role === "viewer"
  );
}

export function resolveLitterPlanningModelApplyOrigin(
  libraryModelCode: string | null | undefined,
): LitterPlanningModelApplyOrigin {
  return libraryModelCode ? "library" : "custom";
}

export function collectAppliedPlanningModelSnapshots(
  items: ReadonlyArray<{
    source_planning_model_id: string | null;
    source_planning_model_revision: number | null;
  }>,
): Map<string, { revision: number; itemCount: number }> {
  const map = new Map<string, { revision: number; itemCount: number }>();
  for (const item of items) {
    // Ad-hoc snapshots have no model source and must not count as an applied model.
    if (
      item.source_planning_model_id === null ||
      item.source_planning_model_revision === null
    ) {
      continue;
    }
    const existing = map.get(item.source_planning_model_id);
    if (!existing) {
      map.set(item.source_planning_model_id, {
        revision: item.source_planning_model_revision,
        itemCount: 1,
      });
      continue;
    }
    existing.itemCount += 1;
    // Snapshots from one application share the same revision; keep the first seen.
  }
  return map;
}

export function isLitterPlanningModelAlreadyApplied(
  appliedByModelId: ReadonlyMap<string, { revision: number; itemCount: number }>,
  planningModelId: string,
): boolean {
  return (appliedByModelId.get(planningModelId)?.itemCount ?? 0) > 0;
}

export function countPartialApplicationItems(
  appliedByModelId: ReadonlyMap<string, { revision: number; itemCount: number }>,
  planningModelId: string,
): number {
  return appliedByModelId.get(planningModelId)?.itemCount ?? 0;
}

export function getAppliedPlanningModelRevision(
  appliedByModelId: ReadonlyMap<string, { revision: number; itemCount: number }>,
  planningModelId: string,
): number | null {
  return appliedByModelId.get(planningModelId)?.revision ?? null;
}

export function formatLitterPlanningModelRevisionDivergence(input: {
  currentRevision: number;
  appliedRevision: number;
}): string | null {
  if (input.currentRevision === input.appliedRevision) return null;
  return `Ce modèle est maintenant en révision ${input.currentRevision}. Le planning de la portée conserve la révision ${input.appliedRevision} appliquée précédemment.`;
}

export function buildInitialLitterPlanningModelSelection(
  items: ReadonlyArray<LitterPlanningModelApplySelectionItem>,
): number[] {
  return items
    .filter((item) => item.isRequired || item.isSelectedByDefault)
    .map((item) => item.publicIndex)
    .sort((a, b) => a - b);
}

export function toggleLitterPlanningModelSelection(input: {
  items: ReadonlyArray<LitterPlanningModelApplySelectionItem>;
  selectedIndexes: readonly number[];
  publicIndex: number;
}): number[] | null {
  const item = input.items.find((entry) => entry.publicIndex === input.publicIndex);
  if (!item) return null;
  const selected = new Set(input.selectedIndexes);
  if (selected.has(item.publicIndex)) {
    if (item.isRequired) return null;
    selected.delete(item.publicIndex);
  } else {
    selected.add(item.publicIndex);
  }
  return [...selected].sort((a, b) => a - b);
}

export type LitterPlanningModelSelectionValidation =
  | { ok: true; selectedIndexes: number[] }
  | {
      ok: false;
      reason:
        | "duplicate"
        | "out_of_range"
        | "non_integer"
        | "missing_required"
        | "empty";
    };

export function validateLitterPlanningModelSelectedIndexes(input: {
  items: ReadonlyArray<LitterPlanningModelApplySelectionItem>;
  selectedIndexes: readonly unknown[];
}): LitterPlanningModelSelectionValidation {
  const allowed = new Set(input.items.map((item) => item.publicIndex));
  const required = input.items
    .filter((item) => item.isRequired)
    .map((item) => item.publicIndex);
  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const value of input.selectedIndexes) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { ok: false, reason: "non_integer" };
    }
    if (!allowed.has(value)) {
      return { ok: false, reason: "out_of_range" };
    }
    if (seen.has(value)) {
      return { ok: false, reason: "duplicate" };
    }
    seen.add(value);
    normalized.push(value);
  }

  if (normalized.length === 0) {
    return { ok: false, reason: "empty" };
  }

  for (const index of required) {
    if (!seen.has(index)) {
      return { ok: false, reason: "missing_required" };
    }
  }

  return {
    ok: true,
    selectedIndexes: normalized.sort((a, b) => a - b),
  };
}

export function formatLitterPlanningModelApplyCivilDate(value: string): string {
  if (!isCivilDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function pendingAnchorPreviewLabel(anchorType: LitterPlanningModelAnchor): string {
  if (anchorType === "actual_birth" || anchorType === "offspring_age") {
    return "Sera ajouté en attente de la naissance réelle";
  }
  if (anchorType === "first_mating") {
    return "Sera ajouté en attente de la première saillie";
  }
  if (anchorType === "estimated_ovulation") {
    return "Sera ajouté en attente de l’ovulation estimée";
  }
  return "Sera ajouté en attente de la mise-bas estimée";
}

function formatRecurringSlotPhrase(timeSlots: readonly string[]): string {
  const normalized = timeSlots
    .map((slot) => slot.trim().slice(0, 5))
    .filter(Boolean);
  if (normalized.length === 0) return "";
  if (
    normalized.length === 2 &&
    normalized[0] === "08:00" &&
    normalized[1] === "20:00"
  ) {
    return "matin et soir";
  }
  if (normalized.length === 1) return normalized[0]!;
  if (normalized.length === 2) return `${normalized[0]} et ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(", ")} et ${normalized.at(-1)}`;
}

export function projectLitterPlanningModelItemPreview(input: {
  itemKind: LitterPlanningModelItemKind;
  anchorType: LitterPlanningModelAnchor;
  anchors: LitterPlanAnchorInput;
  pointOffsetDays?: number | null;
  windowStartsOffsetDays?: number | null;
  windowEndsOffsetDays?: number | null;
  recurrenceStartsOffsetDays?: number | null;
  timeSlots?: readonly string[] | null;
}): LitterPlanningModelApplyPreview {
  const anchorDate = resolveLitterPlanAnchorDate(input.anchorType, input.anchors);
  if (!anchorDate) {
    return {
      kind: "pending_anchor",
      label: pendingAnchorPreviewLabel(input.anchorType),
      projectedStartDate: null,
      projectedEndDate: null,
    };
  }

  if (input.itemKind === "window") {
    const starts = addGestationAnchorCivilDays(
      anchorDate,
      input.windowStartsOffsetDays ?? 0,
    );
    const ends = addGestationAnchorCivilDays(
      anchorDate,
      input.windowEndsOffsetDays ?? 0,
    );
    if (!starts || !ends) {
      return {
        kind: "pending_anchor",
        label: pendingAnchorPreviewLabel(input.anchorType),
        projectedStartDate: null,
        projectedEndDate: null,
      };
    }
    return {
      kind: "window",
      label: `Fenêtre du ${formatLitterPlanningModelApplyCivilDate(starts)} au ${formatLitterPlanningModelApplyCivilDate(ends)}`,
      projectedStartDate: starts,
      projectedEndDate: ends,
    };
  }

  if (input.itemKind === "recurring_task") {
    const starts = addGestationAnchorCivilDays(
      anchorDate,
      input.recurrenceStartsOffsetDays ?? 0,
    );
    if (!starts) {
      return {
        kind: "pending_anchor",
        label: pendingAnchorPreviewLabel(input.anchorType),
        projectedStartDate: null,
        projectedEndDate: null,
      };
    }
    const slots = formatRecurringSlotPhrase(input.timeSlots ?? []);
    return {
      kind: "recurring",
      label: slots
        ? `Début le ${formatLitterPlanningModelApplyCivilDate(starts)} · ${slots}`
        : `Début le ${formatLitterPlanningModelApplyCivilDate(starts)}`,
      projectedStartDate: starts,
      projectedEndDate: null,
    };
  }

  const planned = addGestationAnchorCivilDays(
    anchorDate,
    input.pointOffsetDays ?? 0,
  );
  if (!planned) {
    return {
      kind: "pending_anchor",
      label: pendingAnchorPreviewLabel(input.anchorType),
      projectedStartDate: null,
      projectedEndDate: null,
    };
  }
  return {
    kind: "point",
    label: `Prévu le ${formatLitterPlanningModelApplyCivilDate(planned)}`,
    projectedStartDate: planned,
    projectedEndDate: null,
  };
}

export function estimateLitterPlanningModelInitialOccurrences(input: {
  startsOn: string;
  horizonDays: number;
  intervalDays: number;
  slotCount: number;
  absoluteMaxOccurrences?: number | null;
  endsOn?: string | null;
}): number | null {
  if (
    !isCivilDate(input.startsOn) ||
    !Number.isInteger(input.horizonDays) ||
    input.horizonDays < 1 ||
    !Number.isInteger(input.intervalDays) ||
    input.intervalDays < 1 ||
    !Number.isInteger(input.slotCount) ||
    input.slotCount < 1
  ) {
    return null;
  }

  const through = litterPlanSeriesInitialThroughDate(
    input.startsOn,
    input.horizonDays,
  );
  if (!through) return null;

  let effectiveThrough = through;
  if (input.endsOn && isCivilDate(input.endsOn) && input.endsOn < through) {
    effectiveThrough = input.endsOn;
  }

  let recurrenceDays = 0;
  let cursor = input.startsOn;
  while (cursor <= effectiveThrough) {
    recurrenceDays += 1;
    const next = addGestationAnchorCivilDays(cursor, input.intervalDays);
    if (!next) break;
    cursor = next;
  }

  let total = recurrenceDays * input.slotCount;
  if (
    typeof input.absoluteMaxOccurrences === "number" &&
    Number.isInteger(input.absoluteMaxOccurrences) &&
    input.absoluteMaxOccurrences > 0
  ) {
    total = Math.min(total, input.absoluteMaxOccurrences);
  }
  return total;
}

export function resolveLitterPlanningModelApplyTimezone(input: {
  activePlanTimezoneName: string | null | undefined;
}): string {
  const existing = input.activePlanTimezoneName?.trim();
  if (existing) return existing;
  return LITTER_JOURNAL_TIME_ZONE;
}

export function summarizeLitterPlanForApplicationPanel(input: {
  status: string;
  revision: number;
  timezoneName: string;
  items: ReadonlyArray<{
    source_planning_model_id: string | null;
    materialization_state: string;
  }>;
}): {
  status: string;
  revision: number;
  timezoneName: string;
  appliedModelCount: number;
  totalItemCount: number;
  pendingAnchorItemCount: number;
} {
  const applied = collectAppliedPlanningModelSnapshots(
    input.items.map((item) => ({
      source_planning_model_id: item.source_planning_model_id,
      source_planning_model_revision:
        item.source_planning_model_id === null ? null : 1,
    })),
  );
  return {
    status: input.status,
    revision: input.revision,
    timezoneName: input.timezoneName,
    appliedModelCount: applied.size,
    totalItemCount: input.items.length,
    pendingAnchorItemCount: input.items.filter(
      (item) => item.materialization_state === "pending_anchor",
    ).length,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readLitterPlanningModelApplyResultCounters(
  result: Json | null | undefined,
): LitterPlanningModelApplyItemCounters {
  const rows = Array.isArray(result) ? result : [];
  let addedCount = 0;
  let materializedCount = 0;
  let pendingAnchorCount = 0;
  let recurringPreparedOccurrenceCount = 0;
  let hasRecurringCount = false;

  for (const entry of rows) {
    const row = asRecord(entry);
    if (!row) continue;
    addedCount += 1;
    if (row.state === "pending_anchor") {
      pendingAnchorCount += 1;
      continue;
    }
    if (row.state === "materialized") {
      materializedCount += 1;
    }
    if (
      typeof row.materializedOccurrenceCount === "number" &&
      Number.isInteger(row.materializedOccurrenceCount)
    ) {
      hasRecurringCount = true;
      recurringPreparedOccurrenceCount += row.materializedOccurrenceCount;
    } else if (
      typeof row.insertedCount === "number" &&
      Number.isInteger(row.insertedCount)
    ) {
      hasRecurringCount = true;
      recurringPreparedOccurrenceCount += row.insertedCount;
    }
  }

  return {
    addedCount,
    materializedCount,
    pendingAnchorCount,
    recurringPreparedOccurrenceCount: hasRecurringCount
      ? recurringPreparedOccurrenceCount
      : null,
  };
}

export function formatLitterPlanningModelApplySuccessMessage(
  counters: LitterPlanningModelApplyItemCounters,
): string {
  const lines = [
    `${counters.addedCount} élément${counters.addedCount > 1 ? "s" : ""} ajouté${counters.addedCount > 1 ? "s" : ""}`,
    `${counters.materializedCount} élément${counters.materializedCount > 1 ? "s" : ""} programmé${counters.materializedCount > 1 ? "s" : ""}`,
    `${counters.pendingAnchorCount} élément${counters.pendingAnchorCount > 1 ? "s" : ""} en attente d’une date d’ancrage`,
  ];
  if (
    counters.recurringPreparedOccurrenceCount !== null &&
    counters.recurringPreparedOccurrenceCount > 0
  ) {
    lines.push(
      `${counters.recurringPreparedOccurrenceCount} occurrence${counters.recurringPreparedOccurrenceCount > 1 ? "s" : ""} de suivi récurrent préparée${counters.recurringPreparedOccurrenceCount > 1 ? "s" : ""}`,
    );
  }
  return lines.join("\n");
}

export function litterPlanningModelApplyErrorMessage(
  code: string,
): string {
  switch (code) {
    case "stale_model":
      return "Ce modèle a changé depuis l’ouverture de la page. Rechargez le Journal avant de recommencer.";
    case "stale_plan":
      return "Le planning de cette portée a été modifié ailleurs. Rechargez le Journal avant de recommencer.";
    case "already_applied":
      return "Ce modèle est déjà présent dans le planning de cette portée.";
    case "invalid_litter":
      return "Le statut actuel de cette portée ne permet pas d’appliquer ce modèle.";
    case "conflict":
      return "Cette demande ne peut pas être rejouée avec une sélection différente. Rechargez le Journal.";
    case "forbidden":
    case "unauthenticated":
      return "Vous n’avez pas les droits suffisants pour appliquer ce modèle.";
    case "not_found":
      return "Ce modèle ou cette portée est introuvable.";
    default:
      return "Le modèle n’a pas pu être appliqué au planning de la portée.";
  }
}

export function litterPlanningModelApplyErrorRequiresReload(
  code: string,
): boolean {
  return (
    code === "stale_model" ||
    code === "stale_plan" ||
    code === "already_applied"
  );
}

export type LitterPlanningModelApplyScheduleLabels = {
  scheduleLabel: string;
  timeLabel: string | null;
};

export type LitterPlanningModelApplyItemDraft = {
  publicIndex: number;
  modelItemId: string;
  title: string;
  itemKind: LitterPlanningModelItemKind;
  category: string;
  targetScope: string;
  priority: LitterPlanningModelPriority;
  isRequired: boolean;
  isSelectedByDefault: boolean;
  anchorType: LitterPlanningModelAnchor;
  pointOffsetDays: number | null;
  pointLocalTime: string | null;
  windowStartsOffsetDays: number | null;
  windowStartsLocalTime: string | null;
  windowEndsOffsetDays: number | null;
  windowEndsLocalTime: string | null;
  recurrenceIntervalDays: number | null;
  recurrenceStartsOffsetDays: number | null;
  recurrenceEndKind: LitterPlanningModelRecurrenceEndKind | null;
  recurrenceEndsOffsetDays: number | null;
  recurrenceDayCount: number | null;
  initialMaterializationHorizonDays: number | null;
  absoluteMaxOccurrences: number | null;
  timeSlots: string[];
};

export type LitterPlanningModelApplicationItemDto = {
  publicIndex: number;
  title: string;
  kind: LitterPlanningModelItemKind;
  kindLabel: string;
  categoryLabel: string;
  targetLabel: string;
  priorityLabel: string;
  isRequired: boolean;
  isSelectedByDefault: boolean;
  requiredLabel: string;
  selectedByDefaultLabel: string;
  scheduleLabel: string;
  timeLabel: string | null;
  preview: LitterPlanningModelApplyPreview;
  estimatedInitialOccurrenceCount: number | null;
};

export type LitterPlanningModelApplicationCardDto = {
  publicKey: string;
  title: string;
  description: string | null;
  isActive: boolean;
  speciesLabel: string;
  breedLabel: string;
  origin: LitterPlanningModelApplyOrigin;
  originLabel: string;
  currentRevision: number;
  totalItemCount: number;
  status: LitterPlanningModelApplyStatus;
  statusLabel: string;
  appliedRevision: number | null;
  instantiatedItemCount: number;
  revisionDivergenceMessage: string | null;
  initialSelectedIndexes: number[];
  requiredIndexes: number[];
  items: LitterPlanningModelApplicationItemDto[];
  canApply: boolean;
};

export type LitterPlanningModelApplicationPlanSummaryDto = {
  status: string;
  statusLabel: string;
  revision: number;
  timezoneName: string;
  appliedModelCount: number;
  totalItemCount: number;
  pendingAnchorItemCount: number;
};

export type LitterPlanningModelApplicationPanelDto = {
  litterId: string;
  role: OrganizationRole;
  canApply: boolean;
  litterAllowsApplication: boolean;
  independenceMessage: string;
  emptyMessage: string;
  settingsHref: string;
  noPlanMessage: string;
  timezoneName: string;
  planSummary: LitterPlanningModelApplicationPlanSummaryDto | null;
  models: LitterPlanningModelApplicationCardDto[];
};

export type LitterPlanningModelApplyIntention = {
  litterId: string;
  planningModelId: string;
  expectedModelRevision: number;
  expectedPlanRevision: number | null;
  clientCommandId: string;
  timezoneName: string;
  publicIndexToModelItemId: Record<number, string>;
  requiredIndexes: number[];
};

export type LitterPlanningModelApplicationBinding = {
  publicKey: string;
  intention: LitterPlanningModelApplyIntention;
};

export function assignLitterPlanningModelPublicIndexes<T extends { displayOrder: number; id: string }>(
  items: readonly T[],
): Array<T & { publicIndex: number }> {
  const ordered = [...items].sort((left, right) => {
    if (left.displayOrder !== right.displayOrder) {
      return left.displayOrder - right.displayOrder;
    }
    return left.id.localeCompare(right.id);
  });
  return ordered.map((item, index) => ({
    ...item,
    publicIndex: index + 1,
  }));
}

/** Opaque card key for one panel load. Never embeds model UUIDs or titles. */
export function buildLitterPlanningModelApplyPublicKey(
  panelInstanceKey: string,
  publicCardIndex: number,
): string {
  if (
    typeof panelInstanceKey !== "string" ||
    panelInstanceKey.trim().length === 0 ||
    !Number.isInteger(publicCardIndex) ||
    publicCardIndex < 1
  ) {
    throw new Error("Invalid litter planning model apply public key input.");
  }
  return `planning-model-${panelInstanceKey}-${publicCardIndex}`;
}
