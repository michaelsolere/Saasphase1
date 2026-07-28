import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canManageLitterPlanningModels,
  formatLitterCareBreedLabel,
  formatLitterCareCategoryLabel,
  formatLitterCareSpeciesLabel,
  formatLitterCareTargetLabel,
  formatLitterPlanningModelAnchorPhrase,
  formatLitterPlanningModelFamilyLabel,
  formatLitterPlanningModelLibraryOrigin,
  formatLitterPlanningModelLocalTime,
  formatLitterPlanningModelPointOffset,
  formatLitterPlanningModelRecurrence,
  formatLitterPlanningModelTimeSlots,
  formatLitterPlanningModelVariantLabel,
  formatLitterPlanningModelWindow,
  litterPlanningModelImportStatusLabels,
  litterPlanningModelItemKindLabels,
  litterPlanningModelPriorityLabels,
  resolveLitterPlanningModelImportStatus,
  type LitterPlanningModelImportStatus,
} from "@/features/settings/litter-planning-model-labels";
import {
  canEditLitterPlanningModelDirectly,
  createEmptyLitterPlanningModelEditorDraft,
  createLitterPlanningModelEditorDraftFromModel,
  isLitterPlanningModelImported,
  templateOptionFromSummary,
  type LitterPlanningModelEditorDraft,
  type LitterPlanningModelEditorTemplateOption,
} from "@/features/settings/litter-planning-model-editor-draft";
import {
  listLitterPlanningModelLibrary,
  type LitterPlanningModelLibraryItemSummary,
  type LitterPlanningModelLibraryModelSummary,
} from "@/features/litter-journal/litter-planning-model-library";
import {
  getLitterPlanningModel,
  listLitterPlanningModels,
  type LitterPlanningModel,
  type LitterPlanningModelItem,
  type LitterPlanningModelItemKind,
  type LitterPlanningModelPriority,
  type LitterPlanningModelAnchor,
  type LitterPlanningModelRecurrenceEndKind,
} from "@/features/litter-journal/litter-planning-models";
import { listLitterCareTaskTemplatesForOrganization } from "@/features/litter-journal/litter-care-tasks";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type Role = "owner" | "admin" | "member" | "viewer";

type ElementaryTemplateMeta = {
  title: string;
  category: string;
  targetScope: string;
};

export type LitterPlanningModelItemPresentation = {
  key: string;
  title: string;
  kind: LitterPlanningModelItemKind;
  kindLabel: string;
  categoryLabel: string;
  targetLabel: string;
  anchorLabel: string;
  scheduleLabel: string;
  timeLabel: string | null;
  priorityLabel: string;
  requiredLabel: string;
  selectedByDefaultLabel: string;
};

export type LitterPlanningModelLibraryCard = {
  selectionKey: string;
  code: string;
  version: number;
  title: string;
  description: string | null;
  speciesLabel: string;
  breedLabel: string;
  familyLabel: string;
  variantLabel: string;
  itemCount: number;
  importStatus: LitterPlanningModelImportStatus;
  importStatusLabel: string;
  isSelectable: boolean;
  organizationModelId: string | null;
  organizationModelIsActive: boolean | null;
  latestImportedVersion: number | null;
  contentPreview: Array<{
    title: string;
    kindLabel: string;
    scheduleLabel: string;
  }>;
  items: LitterPlanningModelItemPresentation[];
};

export type LitterPlanningModelOrganizationCard = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  statusLabel: string;
  speciesLabel: string;
  breedLabel: string;
  revision: number;
  itemCount: number;
  originLabel: string;
  libraryOriginDetail: string | null;
  isLibraryImport: boolean;
  canEditDirectly: boolean;
};

export type LitterPlanningModelDetailPresentation = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  statusLabel: string;
  speciesLabel: string;
  breedLabel: string;
  revision: number;
  originLabel: string;
  libraryOriginDetail: string | null;
  isLibraryImport: boolean;
  canEditDirectly: boolean;
  items: LitterPlanningModelItemPresentation[];
};

function scheduleFromLibraryItem(item: LitterPlanningModelLibraryItemSummary): {
  scheduleLabel: string;
  timeLabel: string | null;
} {
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
        endKind: (item.recurrenceEndKind ?? "actual_birth") as LitterPlanningModelRecurrenceEndKind,
        startsOffsetDays: item.recurrenceStartsOffsetDays ?? 0,
        endsOffsetDays: item.recurrenceEndsOffsetDays,
        recurrenceDayCount: item.recurrenceDayCount,
        anchorType: item.anchorType,
      }),
      timeLabel: formatLitterPlanningModelTimeSlots(item.timeSlots),
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

function scheduleFromOrganizationItem(item: LitterPlanningModelItem): {
  scheduleLabel: string;
  timeLabel: string | null;
} {
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
        timeSlots: item.timeSlots ?? [],
        endKind: (item.recurrenceEndKind ??
          "actual_birth") as LitterPlanningModelRecurrenceEndKind,
        startsOffsetDays: item.recurrenceStartsOffsetDays ?? 0,
        endsOffsetDays: item.recurrenceEndsOffsetDays,
        recurrenceDayCount: item.recurrenceDayCount,
        anchorType: item.anchorType,
      }),
      timeLabel:
        item.timeSlots && item.timeSlots.length > 0
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

function presentItem(input: {
  key: string;
  title: string;
  category: string;
  targetScope: string;
  kind: LitterPlanningModelItemKind;
  priority: LitterPlanningModelPriority;
  anchorType: LitterPlanningModelAnchor;
  scheduleLabel: string;
  timeLabel: string | null;
  isRequired: boolean;
  isSelectedByDefault: boolean;
}): LitterPlanningModelItemPresentation {
  return {
    key: input.key,
    title: input.title,
    kind: input.kind,
    kindLabel: litterPlanningModelItemKindLabels[input.kind],
    categoryLabel: formatLitterCareCategoryLabel(input.category),
    targetLabel: formatLitterCareTargetLabel(input.targetScope),
    anchorLabel: formatLitterPlanningModelAnchorPhrase(input.anchorType),
    scheduleLabel: input.scheduleLabel,
    timeLabel: input.timeLabel,
    priorityLabel: litterPlanningModelPriorityLabels[input.priority],
    requiredLabel: input.isRequired ? "Obligatoire" : "Facultatif",
    selectedByDefaultLabel: input.isSelectedByDefault
      ? "Sélectionné par défaut"
      : "Non sélectionné par défaut",
  };
}

async function loadLibraryElementaryTemplates(
  supabase: Supabase,
  models: LitterPlanningModelLibraryModelSummary[],
) {
  const keys = new Set<string>();
  for (const model of models) {
    for (const item of model.items) {
      keys.add(`${item.libraryTemplateCode}:${item.libraryTemplateVersion}`);
    }
  }
  if (keys.size === 0) return new Map<string, ElementaryTemplateMeta>();

  const codes = [
    ...new Set(
      models.flatMap((model) =>
        model.items.map((item) => item.libraryTemplateCode),
      ),
    ),
  ];
  const result = await supabase
    .from("litter_care_task_library_templates")
    .select("code, version, title, category, target_scope")
    .in("code", codes);
  if (result.error) {
    console.error(
      "litter_planning_models_ui_library_templates_batch_failed",
      result.error,
    );
    return null;
  }

  const map = new Map<string, ElementaryTemplateMeta>();
  for (const row of result.data ?? []) {
    const key = `${row.code}:${row.version}`;
    if (!keys.has(key)) continue;
    map.set(key, {
      title: row.title,
      category: row.category,
      targetScope: row.target_scope,
    });
  }
  return map;
}

async function loadOrganizationElementaryTemplates(
  supabase: Supabase,
  templateIds: string[],
) {
  if (templateIds.length === 0) return new Map<string, ElementaryTemplateMeta>();

  const uniqueIds = [...new Set(templateIds)];
  const result = await supabase
    .from("litter_care_task_templates")
    .select("id, title, category, target_scope")
    .in("id", uniqueIds);
  if (result.error) {
    console.error(
      "litter_planning_models_ui_organization_templates_batch_failed",
      result.error,
    );
    return null;
  }

  const map = new Map<string, ElementaryTemplateMeta>();
  for (const row of result.data ?? []) {
    map.set(row.id, {
      title: row.title,
      category: row.category,
      targetScope: row.target_scope,
    });
  }
  return map;
}

async function loadOrganizationItemCounts(
  supabase: Supabase,
  organizationId: string,
  modelIds: string[],
) {
  const counts = new Map<string, number>();
  for (const modelId of modelIds) counts.set(modelId, 0);
  if (modelIds.length === 0) return counts;

  const result = await supabase
    .from("litter_planning_model_items")
    .select("model_id")
    .eq("organization_id", organizationId)
    .in("model_id", modelIds);
  if (result.error) {
    console.error(
      "litter_planning_models_ui_item_counts_batch_failed",
      result.error,
    );
    return null;
  }

  for (const row of result.data ?? []) {
    counts.set(row.model_id, (counts.get(row.model_id) ?? 0) + 1);
  }
  return counts;
}

function presentLibraryModel(
  model: LitterPlanningModelLibraryModelSummary,
  templates: Map<string, ElementaryTemplateMeta>,
  canManage: boolean,
): LitterPlanningModelLibraryCard {
  const importStatus = resolveLitterPlanningModelImportStatus({
    isImported: model.isImported,
    version: model.version,
    latestImportedVersion: model.latestImportedVersion?.version ?? null,
  });
  const items = model.items.map((item, index) => {
    const meta = templates.get(
      `${item.libraryTemplateCode}:${item.libraryTemplateVersion}`,
    );
    const { scheduleLabel, timeLabel } = scheduleFromLibraryItem(item);
    return presentItem({
      key: `${model.code}:${model.version}:${item.displayOrder}:${index}`,
      title: meta?.title ?? item.libraryTemplateCode,
      category: meta?.category ?? "other",
      targetScope: meta?.targetScope ?? "litter",
      kind: item.itemKind,
      priority: item.priority,
      anchorType: item.anchorType,
      scheduleLabel,
      timeLabel,
      isRequired: item.isRequired,
      isSelectedByDefault: item.isSelectedByDefault,
    });
  });

  return {
    selectionKey: `${model.code}:${model.version}`,
    code: model.code,
    version: model.version,
    title: model.title,
    description: model.description,
    speciesLabel: formatLitterCareSpeciesLabel(model.species),
    breedLabel: formatLitterCareBreedLabel(model.breed),
    familyLabel: formatLitterPlanningModelFamilyLabel(model.familyCode),
    variantLabel: formatLitterPlanningModelVariantLabel(model.variantCode),
    itemCount: model.itemCount,
    importStatus,
    importStatusLabel: litterPlanningModelImportStatusLabels[importStatus],
    isSelectable: canManage && importStatus !== "imported",
    organizationModelId: model.organizationModelId,
    organizationModelIsActive: model.organizationModelIsActive,
    latestImportedVersion: model.latestImportedVersion?.version ?? null,
    contentPreview: items.slice(0, 6).map((item) => ({
      title: item.title,
      kindLabel: item.kindLabel,
      scheduleLabel: item.scheduleLabel,
    })),
    items,
  };
}

export async function loadLitterPlanningModelsSettingsPage(
  organizationId: string,
  supabase?: Supabase,
): Promise<
  | {
      outcome: "success";
      role: Role;
      canManage: boolean;
      library:
        | { outcome: "success"; models: LitterPlanningModelLibraryCard[] }
        | { outcome: "error" };
      organization:
        | {
            outcome: "success";
            models: LitterPlanningModelOrganizationCard[];
          }
        | { outcome: "error" };
    }
  | { outcome: "error" }
> {
  const [libraryResult, organizationResultRaw] = await Promise.all([
    listLitterPlanningModelLibrary({ organizationId }, supabase),
    listLitterPlanningModels(organizationId, supabase),
  ]);

  const organizationResult =
    organizationResultRaw.outcome === "success" &&
    "models" in organizationResultRaw
      ? organizationResultRaw
      : ({ outcome: "error" } as const);

  if (
    libraryResult.outcome === "error" &&
    organizationResult.outcome === "error"
  ) {
    return { outcome: "error" };
  }

  const role =
    (libraryResult.outcome === "success"
      ? libraryResult.role
      : organizationResult.outcome === "success"
        ? organizationResult.role
        : null) ?? null;
  if (!role) return { outcome: "error" };

  const canManage = canManageLitterPlanningModels(role);
  const client = supabase ?? (await createClient());

  let library:
    | { outcome: "success"; models: LitterPlanningModelLibraryCard[] }
    | { outcome: "error" } = { outcome: "error" };
  if (libraryResult.outcome === "success") {
    const templates = await loadLibraryElementaryTemplates(
      client,
      libraryResult.models,
    );
    if (!templates) {
      library = { outcome: "error" };
    } else {
      library = {
        outcome: "success",
        models: libraryResult.models.map((model) =>
          presentLibraryModel(model, templates, canManage),
        ),
      };
    }
  }

  let organization:
    | { outcome: "success"; models: LitterPlanningModelOrganizationCard[] }
    | { outcome: "error" } = { outcome: "error" };
  if (organizationResult.outcome === "success") {
    const counts = await loadOrganizationItemCounts(
      client,
      organizationId,
      organizationResult.models.map((model) => model.id),
    );
    if (!counts) {
      organization = { outcome: "error" };
    } else {
      organization = {
        outcome: "success",
        models: organizationResult.models.map((model) => {
          const isLibraryImport = isLitterPlanningModelImported(model);
          return {
            id: model.id,
            title: model.title,
            description: model.description,
            isActive: model.isActive,
            statusLabel: model.isActive ? "Actif" : "Inactif",
            speciesLabel: formatLitterCareSpeciesLabel(model.species),
            breedLabel: formatLitterCareBreedLabel(model.breed),
            revision: model.revision,
            itemCount: counts.get(model.id) ?? 0,
            originLabel: isLibraryImport
              ? "Importé depuis la bibliothèque"
              : "Créé dans l’organisation",
            libraryOriginDetail:
              model.libraryModelCode && model.libraryModelVersion
                ? formatLitterPlanningModelLibraryOrigin(
                    model.libraryModelCode,
                    model.libraryModelVersion,
                  )
                : null,
            isLibraryImport,
            canEditDirectly: canEditLitterPlanningModelDirectly(model),
          };
        }),
      };
    }
  }

  return {
    outcome: "success",
    role,
    canManage,
    library,
    organization,
  };
}

export async function loadLitterPlanningModelDetail(
  modelId: string,
  supabase?: Supabase,
): Promise<
  | {
      outcome: "success";
      role: Role;
      canManage: boolean;
      model: LitterPlanningModelDetailPresentation;
    }
  | {
      outcome: "error";
      code: "not_found" | "database_error" | "unauthenticated";
    }
> {
  const result = await getLitterPlanningModel(modelId, supabase);
  if (result.outcome === "error") {
    if (
      result.error.code === "not_found" ||
      result.error.code === "forbidden" ||
      result.error.code === "invalid_input"
    ) {
      return { outcome: "error", code: "not_found" };
    }
    if (result.error.code === "unauthenticated") {
      return { outcome: "error", code: "unauthenticated" };
    }
    return { outcome: "error", code: "database_error" };
  }
  if (!("model" in result) || !("role" in result)) {
    return { outcome: "error", code: "database_error" };
  }

  const model = result.model as LitterPlanningModel;
  const client = supabase ?? (await createClient());

  const templates = await loadOrganizationElementaryTemplates(
    client,
    model.items.map((item) => item.organizationTemplateId),
  );
  if (!templates) return { outcome: "error", code: "database_error" };

  const items = model.items.map((item, index) => {
    const meta = templates.get(item.organizationTemplateId);
    const { scheduleLabel, timeLabel } = scheduleFromOrganizationItem(item);
    return presentItem({
      key: item.id || `${model.id}:${item.displayOrder}:${index}`,
      title: meta?.title ?? "Élément de planning",
      category: meta?.category ?? "other",
      targetScope: meta?.targetScope ?? "litter",
      kind: item.itemKind,
      priority: item.priority,
      anchorType: item.anchorType,
      scheduleLabel,
      timeLabel,
      isRequired: item.isRequired,
      isSelectedByDefault: item.isSelectedByDefault,
    });
  });

  const isLibraryImport = isLitterPlanningModelImported(model);

  return {
    outcome: "success",
    role: result.role,
    canManage: canManageLitterPlanningModels(result.role),
    model: {
      id: model.id,
      title: model.title,
      description: model.description,
      isActive: model.isActive,
      statusLabel: model.isActive ? "Actif" : "Inactif",
      speciesLabel: formatLitterCareSpeciesLabel(model.species),
      breedLabel: formatLitterCareBreedLabel(model.breed),
      revision: model.revision,
      originLabel: isLibraryImport
        ? "Importé depuis la bibliothèque"
        : "Créé dans l’organisation",
      libraryOriginDetail:
        model.libraryModelCode && model.libraryModelVersion
          ? formatLitterPlanningModelLibraryOrigin(
              model.libraryModelCode,
              model.libraryModelVersion,
            )
          : null,
      isLibraryImport,
      canEditDirectly: canEditLitterPlanningModelDirectly(model),
      items,
    },
  };
}

export type LitterPlanningModelEditorPageData = {
  organizationId: string;
  role: Role;
  canManage: boolean;
  draft: LitterPlanningModelEditorDraft;
  templates: LitterPlanningModelEditorTemplateOption[];
};

export async function loadLitterPlanningModelEditorPage(input: {
  organizationId: string;
  mode: "create" | "edit";
  modelId?: string;
  supabase?: Supabase;
}): Promise<
  | { outcome: "success"; data: LitterPlanningModelEditorPageData }
  | {
      outcome: "error";
      code:
        | "not_found"
        | "database_error"
        | "unauthenticated"
        | "forbidden"
        | "imported_model";
    }
> {
  const client = input.supabase ?? (await createClient());
  const templatesResult = await listLitterCareTaskTemplatesForOrganization(
    { organizationId: input.organizationId },
    client,
  );
  if (templatesResult.outcome === "error") {
    if (templatesResult.error.code === "unauthenticated") {
      return { outcome: "error", code: "unauthenticated" };
    }
    if (
      templatesResult.error.code === "forbidden" ||
      templatesResult.error.code === "not_found"
    ) {
      return { outcome: "error", code: "not_found" };
    }
    return { outcome: "error", code: "database_error" };
  }

  const templates = templatesResult.templates.map(templateOptionFromSummary);
  const canManage = canManageLitterPlanningModels(templatesResult.role);
  if (!canManage) {
    return { outcome: "error", code: "forbidden" };
  }

  if (input.mode === "create") {
    return {
      outcome: "success",
      data: {
        organizationId: input.organizationId,
        role: templatesResult.role,
        canManage,
        draft: createEmptyLitterPlanningModelEditorDraft(),
        templates,
      },
    };
  }

  if (!input.modelId) {
    return { outcome: "error", code: "not_found" };
  }

  const modelResult = await getLitterPlanningModel(input.modelId, client);
  if (modelResult.outcome === "error" || !("model" in modelResult)) {
    if (
      modelResult.outcome === "error" &&
      modelResult.error.code === "unauthenticated"
    ) {
      return { outcome: "error", code: "unauthenticated" };
    }
    if (
      modelResult.outcome === "error" &&
      (modelResult.error.code === "not_found" ||
        modelResult.error.code === "forbidden" ||
        modelResult.error.code === "invalid_input")
    ) {
      return { outcome: "error", code: "not_found" };
    }
    return { outcome: "error", code: "database_error" };
  }

  if (isLitterPlanningModelImported(modelResult.model)) {
    return { outcome: "error", code: "imported_model" };
  }

  return {
    outcome: "success",
    data: {
      organizationId: input.organizationId,
      role: modelResult.role,
      canManage,
      draft: createLitterPlanningModelEditorDraftFromModel(modelResult.model, {
        mode: "edit",
      }),
      templates,
    },
  };
}
