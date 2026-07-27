import {
  litterCareTaskAnchorLabels,
  litterCareTaskCategoryLabels,
  litterCareTaskSpeciesLabels,
  litterCareTaskTargetLabels,
} from "@/features/litter-journal/litter-care-task-labels";
import type {
  LitterCareTaskAnchorType,
  LitterCareTaskCategory,
  LitterCareTaskTargetScope,
} from "@/features/litter-journal/litter-care-tasks";
import type {
  LitterPlanningModelAnchor,
  LitterPlanningModelItemKind,
  LitterPlanningModelPriority,
  LitterPlanningModelRecurrenceEndKind,
} from "@/features/litter-journal/litter-planning-models-core";

export const LITTER_PLANNING_MODELS_INDEPENDENCE_MESSAGE =
  "Importer, activer ou désactiver un modèle ne modifie aucun planning déjà créé pour une portée.";

export const LITTER_PLANNING_MODEL_EDITOR_INDEPENDENCE_MESSAGE =
  "Modifier un modèle ne modifie aucun planning déjà créé pour une portée. Les changements seront proposés uniquement lors des prochaines applications du modèle.";

export const LITTER_PLANNING_MODELS_NEWER_VERSION_MESSAGE =
  "Importer cette version crée un nouveau modèle dans l’organisation. Les versions déjà importées et les plannings existants ne sont pas modifiés.";

export const litterPlanningModelItemKindLabels: Record<
  LitterPlanningModelItemKind,
  string
> = {
  milestone: "Jalon",
  task: "Tâche",
  window: "Période",
  recurring_task: "Suivi récurrent",
};

export const litterPlanningModelPriorityLabels: Record<
  LitterPlanningModelPriority,
  string
> = {
  normal: "Normale",
  important: "Importante",
  organization_critical: "Critique pour l’élevage",
};

export const litterPlanningModelAnchorLabels: Record<
  LitterPlanningModelAnchor,
  string
> = {
  first_mating: "Première saillie",
  estimated_ovulation: "Ovulation estimée",
  expected_birth: "Mise-bas estimée",
  actual_birth: "Mise-bas réelle",
  offspring_age: "Âge des petits",
};

export type LitterPlanningModelImportStatus =
  | "not_imported"
  | "imported"
  | "newer_version_available";

export const litterPlanningModelImportStatusLabels: Record<
  LitterPlanningModelImportStatus,
  string
> = {
  not_imported: "Non importé",
  imported: "Déjà importé",
  newer_version_available: "Version plus récente disponible",
};

const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function formatLitterPlanningModelLocalTime(value: string): string {
  const match = LOCAL_TIME.exec(value.trim());
  if (!match) return value;
  return `${match[1]} h ${match[2]}`;
}

export function formatLitterPlanningModelTimeSlots(slots: string[]): string {
  if (slots.length === 0) return "";
  const labels = slots.map(formatLitterPlanningModelLocalTime);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

function ordinalDay(day: number): string {
  return day === 1 ? "1er" : `${day}e`;
}

function dayWord(count: number): string {
  return Math.abs(count) === 1 ? "jour" : "jours";
}

export function formatLitterPlanningModelAnchorPhrase(
  anchorType: LitterPlanningModelAnchor,
): string {
  return `Ancrage : ${litterPlanningModelAnchorLabels[anchorType].toLowerCase()}`;
}

export function formatLitterPlanningModelPointOffset(
  anchorType: LitterPlanningModelAnchor,
  offsetDays: number,
): string {
  if (anchorType === "offspring_age") {
    if (offsetDays === 0) return "À la naissance";
    return `À ${offsetDays} ${dayWord(offsetDays)} de vie`;
  }

  const absolute = Math.abs(offsetDays);
  const anchor = litterPlanningModelAnchorLabels[anchorType].toLowerCase();
  if (offsetDays === 0) return `Le jour de la ${anchor}`;
  if (offsetDays < 0) {
    return `${absolute} ${dayWord(absolute)} avant la ${anchor}`;
  }
  return `${absolute} ${dayWord(absolute)} après la ${anchor}`;
}

export function formatLitterPlanningModelWindow(
  anchorType: LitterPlanningModelAnchor,
  startsOffsetDays: number,
  endsOffsetDays: number,
): string {
  if (anchorType === "offspring_age") {
    if (startsOffsetDays === endsOffsetDays) {
      return `Fenêtre au ${ordinalDay(startsOffsetDays)} jour de vie`;
    }
    return `Fenêtre du ${ordinalDay(startsOffsetDays)} au ${ordinalDay(endsOffsetDays)} jour de vie`;
  }

  if (
    startsOffsetDays >= 0 &&
    endsOffsetDays >= 0 &&
    (anchorType === "estimated_ovulation" ||
      anchorType === "first_mating" ||
      anchorType === "actual_birth")
  ) {
    if (startsOffsetDays === endsOffsetDays) {
      return `Fenêtre du ${ordinalDay(startsOffsetDays)} jour`;
    }
    return `Fenêtre du ${ordinalDay(startsOffsetDays)} au ${ordinalDay(endsOffsetDays)} jour`;
  }

  const start = formatLitterPlanningModelPointOffset(anchorType, startsOffsetDays);
  const end = formatLitterPlanningModelPointOffset(anchorType, endsOffsetDays);
  if (start === end) return `Fenêtre : ${start}`;
  return `Fenêtre : ${start} → ${end}`;
}

export function formatLitterPlanningModelRecurrence({
  intervalDays,
  timeSlots,
  endKind,
  startsOffsetDays,
  endsOffsetDays,
  recurrenceDayCount,
  anchorType,
}: {
  intervalDays: number;
  timeSlots: string[];
  endKind: LitterPlanningModelRecurrenceEndKind;
  startsOffsetDays: number;
  endsOffsetDays?: number;
  recurrenceDayCount?: number;
  anchorType: LitterPlanningModelAnchor;
}): string {
  const frequency =
    intervalDays === 1
      ? timeSlots.length === 2
        ? "Deux fois par jour"
        : timeSlots.length > 1
          ? `${timeSlots.length} fois par jour`
          : "Tous les jours"
      : `Tous les ${intervalDays} jours`;

  const slots =
    timeSlots.length > 0
      ? ` · ${formatLitterPlanningModelTimeSlots(timeSlots)}`
      : "";

  let ending: string;
  if (endKind === "actual_birth") {
    ending = "jusqu’à la mise-bas réelle";
  } else if (endKind === "fixed_recurrence_day_count") {
    const days = recurrenceDayCount ?? 0;
    ending = `pendant ${days} ${dayWord(days)} de suivi`;
  } else {
    ending = `jusqu’à ${formatLitterPlanningModelPointOffset(
      anchorType,
      endsOffsetDays ?? startsOffsetDays,
    ).toLowerCase()}`;
  }

  const start =
    startsOffsetDays === 0
      ? ""
      : ` à partir de ${formatLitterPlanningModelPointOffset(anchorType, startsOffsetDays).toLowerCase()}`;

  return `${frequency}${slots}${start} ${ending}`.replace(/\s+/g, " ").trim();
}

export function resolveLitterPlanningModelImportStatus(input: {
  isImported: boolean;
  version: number;
  latestImportedVersion: number | null;
}): LitterPlanningModelImportStatus {
  if (input.isImported) return "imported";
  if (
    input.latestImportedVersion !== null &&
    input.latestImportedVersion < input.version
  ) {
    return "newer_version_available";
  }
  return "not_imported";
}

export function canManageLitterPlanningModels(
  role: "owner" | "admin" | "member" | "viewer" | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export function formatLitterPlanningModelFamilyLabel(familyCode: string): string {
  switch (familyCode) {
    case "dog-gestation":
      return "Gestation";
    default:
      return familyCode
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function formatLitterPlanningModelVariantLabel(variantCode: string): string {
  switch (variantCode) {
    case "standard":
      return "Variante standard";
    case "herpesvirose":
      return "Variante avec herpèsvirose";
    default:
      return `Variante ${variantCode}`;
  }
}

export function formatLitterPlanningModelLibraryOrigin(
  code: string,
  version: number,
): string {
  return `Importé depuis la bibliothèque · ${code} · version ${version}`;
}

export function formatLitterPlanningModelOrganizationOrigin(
  libraryModelCode: string | null,
  libraryModelVersion: number | null,
): string {
  if (libraryModelCode && libraryModelVersion) {
    return formatLitterPlanningModelLibraryOrigin(
      libraryModelCode,
      libraryModelVersion,
    );
  }
  return "Créé dans l’organisation";
}

export function formatLitterCareCategoryLabel(
  category: LitterCareTaskCategory | string,
): string {
  return (
    litterCareTaskCategoryLabels[category as LitterCareTaskCategory] ?? category
  );
}

export function formatLitterCareTargetLabel(
  target: LitterCareTaskTargetScope | string,
): string {
  return litterCareTaskTargetLabels[target as LitterCareTaskTargetScope] ?? target;
}

export function formatLitterCareAnchorLabel(
  anchor: LitterCareTaskAnchorType | LitterPlanningModelAnchor | string,
): string {
  return (
    litterPlanningModelAnchorLabels[anchor as LitterPlanningModelAnchor] ??
    litterCareTaskAnchorLabels[anchor as LitterCareTaskAnchorType] ??
    anchor
  );
}

export function formatLitterCareSpeciesLabel(species: "dog" | "cat" | null): string {
  if (!species) return "Toutes les espèces";
  return litterCareTaskSpeciesLabels[species];
}

export function formatLitterCareBreedLabel(breed: string | null): string {
  return breed ?? "Toutes les races";
}
