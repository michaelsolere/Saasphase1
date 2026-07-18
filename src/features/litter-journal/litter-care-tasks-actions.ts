"use server";

import { revalidatePath } from "next/cache";

import {
  createLitterCareTask,
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_RESOLUTION_STATUSES,
  LITTER_CARE_TASK_TARGET_SCOPES,
  resolveLitterCareTask,
  type LitterCareTaskCategory,
  type LitterCareTaskResolutionStatus,
  type LitterCareTaskTargetScope,
} from "./litter-care-tasks";

export type LitterCareTaskActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type CreateLitterCareTaskSubmission = {
  litterId: string;
  clientCommandId: string;
};

export type ResolveLitterCareTaskSubmission = {
  taskId: string;
  clientCommandId: string;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function optionalValue(formData: FormData, name: string) {
  const normalized = value(formData, name).trim();
  return normalized || null;
}

function isCivilDate(input: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function category(input: string): LitterCareTaskCategory | null {
  return LITTER_CARE_TASK_CATEGORIES.includes(
    input as LitterCareTaskCategory,
  )
    ? (input as LitterCareTaskCategory)
    : null;
}

function targetScope(input: string): LitterCareTaskTargetScope | null {
  return LITTER_CARE_TASK_TARGET_SCOPES.includes(
    input as LitterCareTaskTargetScope,
  )
    ? (input as LitterCareTaskTargetScope)
    : null;
}

function resolutionStatus(
  input: string,
): LitterCareTaskResolutionStatus | null {
  return LITTER_CARE_TASK_RESOLUTION_STATUSES.includes(
    input as LitterCareTaskResolutionStatus,
  )
    ? (input as LitterCareTaskResolutionStatus)
    : null;
}

function hasExplicitOffset(timestamp: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp);
}

function createErrorMessage(code: string) {
  switch (code) {
    case "invalid_litter":
      return "Cette portée ne permet plus d’ajouter une tâche.";
    case "not_found":
      return "La portée demandée est introuvable ou inaccessible.";
    case "forbidden":
    case "unauthenticated":
      return "Vous n’avez pas les droits nécessaires pour ajouter cette tâche.";
    case "conflict":
      return "Cette demande ne peut pas être rejouée. Rechargez le journal avant de recommencer.";
    default:
      return "La tâche ne peut pas être ajoutée pour le moment.";
  }
}

function resolveErrorMessage(code: string) {
  switch (code) {
    case "not_planned":
      return "Cette tâche a déjà été traitée.";
    case "not_found":
      return "Cette tâche est introuvable ou inaccessible.";
    case "forbidden":
    case "unauthenticated":
      return "Vous n’avez pas les droits nécessaires pour traiter cette tâche.";
    case "conflict":
      return "Cette demande ne peut pas être rejouée. Rechargez le journal avant de recommencer.";
    default:
      return "La tâche ne peut pas être traitée pour le moment.";
  }
}

export async function createLitterCareTaskAction(
  submission: CreateLitterCareTaskSubmission,
  _previousState: LitterCareTaskActionState,
  formData: FormData,
): Promise<LitterCareTaskActionState> {
  const title = value(formData, "title").trim();
  const description = optionalValue(formData, "description");
  const plannedFor = value(formData, "planned_for");
  const selectedCategory = category(value(formData, "category"));
  const selectedTargetScope = targetScope(value(formData, "target_scope"));

  if (!title || title.length > 255) {
    return {
      status: "error",
      message:
        "Le titre est obligatoire et ne doit pas dépasser 255 caractères.",
    };
  }
  if (description && description.length > 5_000) {
    return {
      status: "error",
      message: "La description ne doit pas dépasser 5 000 caractères.",
    };
  }
  if (!isCivilDate(plannedFor)) {
    return { status: "error", message: "La date prévue est invalide." };
  }
  if (!selectedCategory || !selectedTargetScope) {
    return {
      status: "error",
      message: "La catégorie ou la cible sélectionnée est invalide.",
    };
  }

  const result = await createLitterCareTask({
    litterId: submission.litterId,
    clientCommandId: submission.clientCommandId,
    category: selectedCategory,
    targetScope: selectedTargetScope,
    title,
    description,
    plannedFor,
  });

  if (result.outcome === "error") {
    return {
      status: "error",
      message: createErrorMessage(result.error.code),
    };
  }

  revalidatePath("/litters/journal");
  return { status: "success", message: "La tâche de suivi a été ajoutée." };
}

export async function resolveLitterCareTaskAction(
  submission: ResolveLitterCareTaskSubmission,
  _previousState: LitterCareTaskActionState,
  formData: FormData,
): Promise<LitterCareTaskActionState> {
  const selectedStatus = resolutionStatus(
    value(formData, "resolution_status"),
  );
  const resolvedAt = value(formData, "resolved_at");
  const timezoneName = value(formData, "timezone_name").trim();
  const resolutionNote = optionalValue(formData, "resolution_note");

  if (!selectedStatus) {
    return { status: "error", message: "Le résultat sélectionné est invalide." };
  }
  if (
    !resolvedAt ||
    !hasExplicitOffset(resolvedAt) ||
    Number.isNaN(Date.parse(resolvedAt))
  ) {
    return {
      status: "error",
      message: "La date et l’heure de résolution sont invalides.",
    };
  }
  if (!timezoneName || timezoneName.length > 255) {
    return { status: "error", message: "Le fuseau horaire est invalide." };
  }
  try {
    Intl.DateTimeFormat("fr-FR", { timeZone: timezoneName });
  } catch {
    return { status: "error", message: "Le fuseau horaire est invalide." };
  }
  if (resolutionNote && resolutionNote.length > 5_000) {
    return {
      status: "error",
      message: "La note ne doit pas dépasser 5 000 caractères.",
    };
  }

  const result = await resolveLitterCareTask({
    taskId: submission.taskId,
    clientCommandId: submission.clientCommandId,
    resolutionStatus: selectedStatus,
    resolvedAt,
    timezoneName,
    resolutionNote,
  });

  if (result.outcome === "error") {
    return {
      status: "error",
      message: resolveErrorMessage(result.error.code),
    };
  }

  revalidatePath("/litters/journal");
  return { status: "success", message: "La tâche de suivi a été traitée." };
}
