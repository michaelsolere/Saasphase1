import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatLitterCareBreedLabel,
  formatLitterCareCategoryLabel,
  formatLitterCareSpeciesLabel,
  formatLitterCareTargetLabel,
  formatLitterPlanningModelLocalTime,
  formatLitterPlanningModelPointOffset,
  formatLitterPlanningModelRecurrence,
  formatLitterPlanningModelTimeSlots,
  formatLitterPlanningModelWindow,
  litterPlanningModelItemKindLabels,
  litterPlanningModelPriorityLabels,
} from "@/features/settings/litter-planning-model-labels";
import type { Database } from "@/types/database.types";

import {
  assignLitterPlanningModelPublicIndexes,
  buildInitialLitterPlanningModelSelection,
  canApplyLitterPlanningModel,
  canViewLitterPlanningModelApplication,
  collectAppliedPlanningModelSnapshots,
  countPartialApplicationItems,
  estimateLitterPlanningModelInitialOccurrences,
  formatLitterPlanningModelRevisionDivergence,
  getAppliedPlanningModelRevision,
  isLitterPlanningModelAlreadyApplied,
  isLitterPlanningModelCompatibleWithLitter,
  isLitterStatusApplicableForPlanningModel,
  LITTER_PLANNING_MODEL_APPLY_EMPTY_MESSAGE,
  LITTER_PLANNING_MODEL_APPLY_INDEPENDENCE_MESSAGE,
  LITTER_PLANNING_MODEL_APPLY_NO_PLAN_MESSAGE,
  LITTER_PLANNING_MODEL_APPLY_SETTINGS_HREF,
  buildLitterPlanningModelApplyPublicKey,
  projectLitterPlanningModelItemPreview,
  resolveLitterPlanningModelApplyOrigin,
  resolveLitterPlanningModelApplyTimezone,
  summarizeLitterPlanForApplicationPanel,
  type LitterPlanningModelApplicationBinding,
  type LitterPlanningModelApplicationCardDto,
  type LitterPlanningModelApplicationItemDto,
  type LitterPlanningModelApplicationPanelDto,
  type LitterPlanningModelApplyIntention,
  type LitterPlanningModelApplyOrigin,
  type LitterPlanningModelApplyStatus,
  type OrganizationRole,
} from "./litter-planning-model-apply";
import type {
  LitterPlanningModelAnchor,
  LitterPlanningModelItemKind,
  LitterPlanningModelPriority,
  LitterPlanningModelRecurrenceEndKind,
} from "./litter-planning-models-core";
import { addGestationAnchorCivilDays } from "./gestation-anchor";
import { resolveLitterPlanAnchorDate } from "./litter-plan-anchor";

export type {
  LitterPlanningModelApplicationBinding,
  LitterPlanningModelApplicationCardDto,
  LitterPlanningModelApplicationItemDto,
  LitterPlanningModelApplicationPanelDto,
  LitterPlanningModelApplyIntention,
} from "./litter-planning-model-apply";

type Supabase = SupabaseClient<Database>;

type LitterRow = Pick<
  Database["public"]["Tables"]["litters"]["Row"],
  | "id"
  | "organization_id"
  | "name"
  | "species"
  | "breed"
  | "status"
  | "mating_date"
  | "estimated_ovulation_date"
  | "expected_birth_date"
  | "actual_birth_date"
  | "deleted_at"
>;

type PlanRow = Pick<
  Database["public"]["Tables"]["litter_plans"]["Row"],
  "id" | "status" | "revision" | "timezone_name"
>;

type PlanItemRow = Pick<
  Database["public"]["Tables"]["litter_plan_items"]["Row"],
  | "id"
  | "source_planning_model_id"
  | "source_planning_model_revision"
  | "materialization_state"
>;

type ModelRow = Database["public"]["Tables"]["litter_planning_models"]["Row"];
type ModelItemRow =
  Database["public"]["Tables"]["litter_planning_model_items"]["Row"];

export type LitterPlanningModelApplicationPanelResult =
  | {
      outcome: "success";
      panel: LitterPlanningModelApplicationPanelDto;
      bindings: LitterPlanningModelApplicationBinding[];
    }
  | {
      outcome: "error";
      error: {
        code:
          | "invalid_input"
          | "unauthenticated"
          | "forbidden"
          | "not_found"
          | "database_error";
        message: string;
      };
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown) {
  return typeof value === "string" && UUID.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function isRole(value: unknown): value is OrganizationRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

function isItemKind(value: string): value is LitterPlanningModelItemKind {
  return (
    value === "milestone" ||
    value === "task" ||
    value === "window" ||
    value === "recurring_task"
  );
}

function isPriority(value: string): value is LitterPlanningModelPriority {
  return (
    value === "normal" ||
    value === "important" ||
    value === "organization_critical"
  );
}

function isAnchor(value: string): value is LitterPlanningModelAnchor {
  return (
    value === "first_mating" ||
    value === "estimated_ovulation" ||
    value === "expected_birth" ||
    value === "actual_birth" ||
    value === "offspring_age"
  );
}

function isRecurrenceEndKind(
  value: string | null,
): value is LitterPlanningModelRecurrenceEndKind | null {
  return (
    value === null ||
    value === "fixed_end_offset" ||
    value === "fixed_recurrence_day_count" ||
    value === "actual_birth"
  );
}

function planStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Actif";
    case "archived":
      return "Archivé";
    default:
      return status;
  }
}

function originLabel(origin: LitterPlanningModelApplyOrigin) {
  return origin === "library" ? "Bibliothèque" : "Personnalisé";
}

function scheduleLabels(item: {
  itemKind: LitterPlanningModelItemKind;
  anchorType: LitterPlanningModelAnchor;
  pointOffsetDays: number | null;
  pointLocalTime: string | null;
  windowStartsOffsetDays: number | null;
  windowEndsOffsetDays: number | null;
  recurrenceIntervalDays: number | null;
  recurrenceStartsOffsetDays: number | null;
  recurrenceEndKind: LitterPlanningModelRecurrenceEndKind | null;
  recurrenceEndsOffsetDays: number | null;
  recurrenceDayCount: number | null;
  timeSlots: string[];
}): { scheduleLabel: string; timeLabel: string | null } {
  if (item.itemKind === "window") {
    return {
      scheduleLabel: formatLitterPlanningModelWindow(
        item.anchorType,
        item.windowStartsOffsetDays ?? 0,
        item.windowEndsOffsetDays ?? 0,
      ),
      timeLabel: null,
    };
  }
  if (item.itemKind === "recurring_task") {
    return {
      scheduleLabel: formatLitterPlanningModelRecurrence({
        intervalDays: item.recurrenceIntervalDays ?? 1,
        timeSlots: item.timeSlots,
        endKind: item.recurrenceEndKind ?? "actual_birth",
        startsOffsetDays: item.recurrenceStartsOffsetDays ?? 0,
        endsOffsetDays: item.recurrenceEndsOffsetDays ?? undefined,
        recurrenceDayCount: item.recurrenceDayCount ?? undefined,
        anchorType: item.anchorType,
      }),
      timeLabel:
        item.timeSlots.length > 0
          ? formatLitterPlanningModelTimeSlots(item.timeSlots)
          : null,
    };
  }
  return {
    scheduleLabel: formatLitterPlanningModelPointOffset(
      item.anchorType,
      item.pointOffsetDays ?? 0,
    ),
    timeLabel: item.pointLocalTime
      ? formatLitterPlanningModelLocalTime(item.pointLocalTime)
      : null,
  };
}

function estimateRecurringOccurrences(input: {
  itemKind: LitterPlanningModelItemKind;
  anchorType: LitterPlanningModelAnchor;
  anchors: {
    estimatedOvulationDate: string | null;
    expectedBirthDate: string | null;
    matingDate: string | null;
    actualBirthDate: string | null;
  };
  recurrenceStartsOffsetDays: number | null;
  recurrenceIntervalDays: number | null;
  recurrenceEndKind: LitterPlanningModelRecurrenceEndKind | null;
  recurrenceEndsOffsetDays: number | null;
  recurrenceDayCount: number | null;
  initialMaterializationHorizonDays: number | null;
  absoluteMaxOccurrences: number | null;
  timeSlots: string[];
}): number | null {
  if (input.itemKind !== "recurring_task") return null;
  const anchorDate = resolveLitterPlanAnchorDate(input.anchorType, input.anchors);
  if (!anchorDate) return null;
  const startsOn = addGestationAnchorCivilDays(
    anchorDate,
    input.recurrenceStartsOffsetDays ?? 0,
  );
  if (!startsOn) return null;

  let endsOn: string | null = null;
  if (input.recurrenceEndKind === "fixed_end_offset") {
    endsOn = addGestationAnchorCivilDays(
      anchorDate,
      input.recurrenceEndsOffsetDays ?? 0,
    );
  } else if (input.recurrenceEndKind === "fixed_recurrence_day_count") {
    const dayCount = input.recurrenceDayCount ?? 0;
    const interval = input.recurrenceIntervalDays ?? 1;
    endsOn = addGestationAnchorCivilDays(
      startsOn,
      Math.max(0, (dayCount - 1) * interval),
    );
  } else if (input.recurrenceEndKind === "actual_birth") {
    endsOn = input.anchors.actualBirthDate;
  }

  return estimateLitterPlanningModelInitialOccurrences({
    startsOn,
    horizonDays: input.initialMaterializationHorizonDays ?? 1,
    intervalDays: input.recurrenceIntervalDays ?? 1,
    slotCount: Math.max(1, input.timeSlots.length),
    absoluteMaxOccurrences: input.absoluteMaxOccurrences,
    endsOn,
  });
}

export async function loadLitterPlanningModelApplicationPanel(
  litterId: string,
  supabase: Supabase,
): Promise<LitterPlanningModelApplicationPanelResult> {
  const normalizedLitterId = normalizeUuid(litterId);
  if (!normalizedLitterId) {
    return {
      outcome: "error",
      error: { code: "invalid_input", message: "La portée est invalide." },
    };
  }

  const auth = await supabase.auth.getUser();
  const userId = auth.data.user?.id ?? null;
  if (!userId) {
    return {
      outcome: "error",
      error: {
        code: "unauthenticated",
        message: "Vous devez être connecté pour continuer.",
      },
    };
  }

  const litterResult = await supabase
    .from("litters")
    .select(
      "id, organization_id, name, species, breed, status, mating_date, estimated_ovulation_date, expected_birth_date, actual_birth_date, deleted_at",
    )
    .eq("id", normalizedLitterId)
    .maybeSingle();
  if (litterResult.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les modèles de planning n’ont pas pu être chargés.",
      },
    };
  }
  const litter = litterResult.data as LitterRow | null;
  if (!litter || litter.deleted_at) {
    return {
      outcome: "error",
      error: {
        code: "not_found",
        message: "La portée demandée est introuvable.",
      },
    };
  }

  const membershipResult = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", litter.organization_id)
    .eq("profile_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membershipResult.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les modèles de planning n’ont pas pu être chargés.",
      },
    };
  }
  if (!membershipResult.data || !isRole(membershipResult.data.role)) {
    return {
      outcome: "error",
      error: {
        code: "not_found",
        message: "La portée demandée est introuvable.",
      },
    };
  }
  const role = membershipResult.data.role;
  if (!canViewLitterPlanningModelApplication(role)) {
    return {
      outcome: "error",
      error: {
        code: "forbidden",
        message: "Vous n’avez pas accès à ces modèles.",
      },
    };
  }

  const planResult = await supabase
    .from("litter_plans")
    .select("id, status, revision, timezone_name")
    .eq("litter_id", normalizedLitterId)
    .eq("status", "active")
    .maybeSingle();
  if (planResult.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les modèles de planning n’ont pas pu être chargés.",
      },
    };
  }
  const plan = (planResult.data as PlanRow | null) ?? null;

  let planItems: PlanItemRow[] = [];
  if (plan) {
    const itemsResult = await supabase
      .from("litter_plan_items")
      .select(
        "id, source_planning_model_id, source_planning_model_revision, materialization_state",
      )
      .eq("litter_plan_id", plan.id);
    if (itemsResult.error) {
      return {
        outcome: "error",
        error: {
          code: "database_error",
          message: "Les modèles de planning n’ont pas pu être chargés.",
        },
      };
    }
    planItems = (itemsResult.data ?? []) as PlanItemRow[];
  }

  const appliedByModelId = collectAppliedPlanningModelSnapshots(planItems);
  const appliedModelIds = [...appliedByModelId.keys()];

  const modelsResult = await supabase
    .from("litter_planning_models")
    .select("*")
    .eq("organization_id", litter.organization_id)
    .order("title", { ascending: true });
  if (modelsResult.error) {
    return {
      outcome: "error",
      error: {
        code: "database_error",
        message: "Les modèles de planning n’ont pas pu être chargés.",
      },
    };
  }

  const allModels = (modelsResult.data ?? []) as ModelRow[];
  const litterSpecies =
    litter.species === "cat" ? ("cat" as const) : ("dog" as const);
  const candidateModels = allModels.filter((model) => {
    const applied = isLitterPlanningModelAlreadyApplied(
      appliedByModelId,
      model.id,
    );
    if (applied) return true;
    if (!model.is_active) return false;
    return isLitterPlanningModelCompatibleWithLitter({
      modelSpecies:
        model.species === "dog" || model.species === "cat"
          ? model.species
          : null,
      modelBreed: model.breed,
      litterSpecies,
      litterBreed: litter.breed,
    });
  });

  const candidateModelIds = candidateModels.map((model) => model.id);
  let modelItems: ModelItemRow[] = [];
  if (candidateModelIds.length > 0) {
    const modelItemsResult = await supabase
      .from("litter_planning_model_items")
      .select("*")
      .eq("organization_id", litter.organization_id)
      .in("model_id", candidateModelIds)
      .order("display_order", { ascending: true });
    if (modelItemsResult.error) {
      return {
        outcome: "error",
        error: {
          code: "database_error",
          message: "Les modèles de planning n’ont pas pu être chargés.",
        },
      };
    }
    modelItems = (modelItemsResult.data ?? []) as ModelItemRow[];
  }

  const modelItemIds = modelItems.map((item) => item.id);
  const slotsByItemId = new Map<string, string[]>();
  if (modelItemIds.length > 0) {
    const slotsResult = await supabase
      .from("litter_planning_model_item_time_slots")
      .select("model_item_id, slot_no, local_time")
      .eq("organization_id", litter.organization_id)
      .in("model_item_id", modelItemIds)
      .order("slot_no", { ascending: true });
    if (slotsResult.error) {
      return {
        outcome: "error",
        error: {
          code: "database_error",
          message: "Les modèles de planning n’ont pas pu être chargés.",
        },
      };
    }
    for (const slot of slotsResult.data ?? []) {
      const list = slotsByItemId.get(slot.model_item_id) ?? [];
      list.push(
        typeof slot.local_time === "string"
          ? slot.local_time.slice(0, 5)
          : String(slot.local_time),
      );
      slotsByItemId.set(slot.model_item_id, list);
    }
  }

  const templateIds = [
    ...new Set(modelItems.map((item) => item.organization_template_id)),
  ];
  const templatesById = new Map<
    string,
    { title: string; category: string; targetScope: string }
  >();
  if (templateIds.length > 0) {
    const templatesResult = await supabase
      .from("litter_care_task_templates")
      .select("id, title, category, target_scope")
      .eq("organization_id", litter.organization_id)
      .in("id", templateIds);
    if (templatesResult.error) {
      return {
        outcome: "error",
        error: {
          code: "database_error",
          message: "Les modèles de planning n’ont pas pu être chargés.",
        },
      };
    }
    for (const template of templatesResult.data ?? []) {
      templatesById.set(template.id, {
        title: template.title,
        category: template.category,
        targetScope: template.target_scope,
      });
    }
  }

  const timezoneName = resolveLitterPlanningModelApplyTimezone({
    activePlanTimezoneName: plan?.timezone_name ?? null,
  });
  const litterAllowsApplication = isLitterStatusApplicableForPlanningModel(
    litter.status,
  );
  const roleCanApply = canApplyLitterPlanningModel(role);
  const anchors = {
    estimatedOvulationDate: litter.estimated_ovulation_date,
    expectedBirthDate: litter.expected_birth_date,
    matingDate: litter.mating_date,
    actualBirthDate: litter.actual_birth_date,
  };

  const itemsByModelId = new Map<string, ModelItemRow[]>();
  for (const item of modelItems) {
    const list = itemsByModelId.get(item.model_id) ?? [];
    list.push(item);
    itemsByModelId.set(item.model_id, list);
  }

  const draftCards: Array<{
    model: ModelRow;
    card: LitterPlanningModelApplicationCardDto;
    indexedItems: Array<ModelItemRow & { publicIndex: number }>;
  }> = [];

  for (const model of candidateModels) {
    const rawItems = itemsByModelId.get(model.id) ?? [];
    const indexed = assignLitterPlanningModelPublicIndexes(
      rawItems.map((item) => ({ ...item, displayOrder: item.display_order })),
    );
    const alreadyApplied = isLitterPlanningModelAlreadyApplied(
      appliedByModelId,
      model.id,
    );
    const appliedRevision = getAppliedPlanningModelRevision(
      appliedByModelId,
      model.id,
    );
    const instantiatedItemCount = countPartialApplicationItems(
      appliedByModelId,
      model.id,
    );
    const origin = resolveLitterPlanningModelApplyOrigin(
      model.library_model_code,
    );
    const status: LitterPlanningModelApplyStatus = alreadyApplied
      ? "already_applied"
      : "available";
    const selectionItems = indexed.map((item) => ({
      publicIndex: item.publicIndex,
      isRequired: item.is_required,
      isSelectedByDefault: item.is_selected_by_default,
    }));

    const itemDtos: LitterPlanningModelApplicationItemDto[] = [];
    for (const item of indexed) {
      if (
        !isItemKind(item.item_kind) ||
        !isPriority(item.priority) ||
        !isAnchor(item.anchor_type) ||
        !isRecurrenceEndKind(item.recurrence_end_kind)
      ) {
        return {
          outcome: "error",
          error: {
            code: "database_error",
            message: "Les modèles de planning n’ont pas pu être chargés.",
          },
        };
      }
      const template = templatesById.get(item.organization_template_id);
      if (!template) {
        return {
          outcome: "error",
          error: {
            code: "database_error",
            message: "Les modèles de planning n’ont pas pu être chargés.",
          },
        };
      }
      const timeSlots = slotsByItemId.get(item.id) ?? [];
      const labels = scheduleLabels({
        itemKind: item.item_kind,
        anchorType: item.anchor_type,
        pointOffsetDays: item.point_offset_days,
        pointLocalTime: item.point_local_time
          ? String(item.point_local_time).slice(0, 5)
          : null,
        windowStartsOffsetDays: item.window_starts_offset_days,
        windowEndsOffsetDays: item.window_ends_offset_days,
        recurrenceIntervalDays: item.recurrence_interval_days,
        recurrenceStartsOffsetDays: item.recurrence_starts_offset_days,
        recurrenceEndKind: item.recurrence_end_kind,
        recurrenceEndsOffsetDays: item.recurrence_ends_offset_days,
        recurrenceDayCount: item.recurrence_day_count,
        timeSlots,
      });
      const preview = projectLitterPlanningModelItemPreview({
        itemKind: item.item_kind,
        anchorType: item.anchor_type,
        anchors,
        pointOffsetDays: item.point_offset_days,
        windowStartsOffsetDays: item.window_starts_offset_days,
        windowEndsOffsetDays: item.window_ends_offset_days,
        recurrenceStartsOffsetDays: item.recurrence_starts_offset_days,
        timeSlots,
      });
      itemDtos.push({
        publicIndex: item.publicIndex,
        title: template.title,
        kind: item.item_kind,
        kindLabel: litterPlanningModelItemKindLabels[item.item_kind],
        categoryLabel: formatLitterCareCategoryLabel(template.category),
        targetLabel: formatLitterCareTargetLabel(template.targetScope),
        priorityLabel: litterPlanningModelPriorityLabels[item.priority],
        isRequired: item.is_required,
        isSelectedByDefault: item.is_selected_by_default,
        requiredLabel: item.is_required ? "Obligatoire" : "Facultatif",
        selectedByDefaultLabel: item.is_selected_by_default
          ? "Sélectionné par défaut"
          : "Non sélectionné par défaut",
        scheduleLabel: labels.scheduleLabel,
        timeLabel: labels.timeLabel,
        preview,
        estimatedInitialOccurrenceCount: estimateRecurringOccurrences({
          itemKind: item.item_kind,
          anchorType: item.anchor_type,
          anchors,
          recurrenceStartsOffsetDays: item.recurrence_starts_offset_days,
          recurrenceIntervalDays: item.recurrence_interval_days,
          recurrenceEndKind: item.recurrence_end_kind,
          recurrenceEndsOffsetDays: item.recurrence_ends_offset_days,
          recurrenceDayCount: item.recurrence_day_count,
          initialMaterializationHorizonDays:
            item.initial_materialization_horizon_days,
          absoluteMaxOccurrences: item.absolute_max_occurrences,
          timeSlots,
        }),
      });
    }

    draftCards.push({
      model,
      indexedItems: indexed,
      card: {
        publicKey: "",
        title: model.title,
        description: model.description,
        isActive: model.is_active,
        speciesLabel: formatLitterCareSpeciesLabel(
          model.species === "dog" || model.species === "cat"
            ? model.species
            : null,
        ),
        breedLabel: formatLitterCareBreedLabel(model.breed),
        origin,
        originLabel: originLabel(origin),
        currentRevision: model.revision,
        totalItemCount: itemDtos.length,
        status,
        statusLabel:
          status === "already_applied" ? "Déjà appliqué" : "Disponible",
        appliedRevision,
        instantiatedItemCount,
        revisionDivergenceMessage:
          appliedRevision === null
            ? null
            : formatLitterPlanningModelRevisionDivergence({
                currentRevision: model.revision,
                appliedRevision,
              }),
        initialSelectedIndexes:
          buildInitialLitterPlanningModelSelection(selectionItems),
        requiredIndexes: selectionItems
          .filter((item) => item.isRequired)
          .map((item) => item.publicIndex),
        items: itemDtos,
        canApply:
          roleCanApply &&
          litterAllowsApplication &&
          status === "available" &&
          model.is_active,
      },
    });
  }

  draftCards.sort((left, right) => {
    if (left.card.status !== right.card.status) {
      return left.card.status === "available" ? -1 : 1;
    }
    return left.card.title.localeCompare(right.card.title, "fr");
  });

  const cards: LitterPlanningModelApplicationCardDto[] = [];
  const bindings: LitterPlanningModelApplicationBinding[] = [];
  const panelInstanceKey = crypto.randomUUID();
  draftCards.forEach((draft, index) => {
    const publicKey = buildLitterPlanningModelApplyPublicKey(
      panelInstanceKey,
      index + 1,
    );
    const card = { ...draft.card, publicKey };
    cards.push(card);
    if (card.canApply) {
      bindings.push({
        publicKey,
        intention: buildLitterPlanningModelApplyIntention({
          litterId: normalizedLitterId,
          planningModelId: draft.model.id,
          expectedModelRevision: draft.model.revision,
          expectedPlanRevision: plan?.revision ?? null,
          timezoneName,
          items: draft.indexedItems.map((item) => ({
            publicIndex: item.publicIndex,
            modelItemId: item.id,
            isRequired: item.is_required,
          })),
        }),
      });
    }
  });

  const planSummary = plan
    ? {
        ...summarizeLitterPlanForApplicationPanel({
          status: plan.status,
          revision: plan.revision,
          timezoneName: plan.timezone_name,
          items: planItems,
        }),
        statusLabel: planStatusLabel(plan.status),
      }
    : null;

  void appliedModelIds;

  return {
    outcome: "success",
    panel: {
      litterId: normalizedLitterId,
      role,
      canApply: roleCanApply && litterAllowsApplication,
      litterAllowsApplication,
      independenceMessage: LITTER_PLANNING_MODEL_APPLY_INDEPENDENCE_MESSAGE,
      emptyMessage: LITTER_PLANNING_MODEL_APPLY_EMPTY_MESSAGE,
      settingsHref: LITTER_PLANNING_MODEL_APPLY_SETTINGS_HREF,
      noPlanMessage: LITTER_PLANNING_MODEL_APPLY_NO_PLAN_MESSAGE,
      timezoneName,
      planSummary,
      models: cards,
    },
    bindings,
  };
}

export function buildLitterPlanningModelApplyIntention(input: {
  litterId: string;
  planningModelId: string;
  expectedModelRevision: number;
  expectedPlanRevision: number | null;
  timezoneName: string;
  items: ReadonlyArray<{ publicIndex: number; modelItemId: string; isRequired: boolean }>;
}): LitterPlanningModelApplyIntention {
  const publicIndexToModelItemId: Record<number, string> = {};
  const requiredIndexes: number[] = [];
  for (const item of input.items) {
    publicIndexToModelItemId[item.publicIndex] = item.modelItemId;
    if (item.isRequired) requiredIndexes.push(item.publicIndex);
  }
  return {
    litterId: input.litterId,
    planningModelId: input.planningModelId,
    expectedModelRevision: input.expectedModelRevision,
    expectedPlanRevision: input.expectedPlanRevision,
    clientCommandId: crypto.randomUUID(),
    timezoneName: input.timezoneName,
    publicIndexToModelItemId,
    requiredIndexes: requiredIndexes.sort((a, b) => a - b),
  };
}
