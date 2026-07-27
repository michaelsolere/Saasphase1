"use server";

import { revalidatePath } from "next/cache";

import { importLitterPlanningModelLibraryModels } from "@/features/litter-journal/litter-planning-model-library";
import { setLitterPlanningModelActive } from "@/features/litter-journal/litter-planning-models";

const settingsPath = "/settings/litter-planning-models";
const postgresIntegerMax = 2_147_483_647;

export type LitterPlanningModelLibraryImportActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type LitterPlanningModelActiveActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
};

export type ImportLitterPlanningModelLibrarySubmission = {
  organizationId: string;
  clientCommandId: string;
};

export type SetLitterPlanningModelActiveSubmission = {
  modelId: string;
  expectedRevision: number;
  clientCommandId: string;
  isActive: boolean;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function libraryImportErrorMessage(code: string) {
  if (code === "not_found") {
    return "La bibliothèque a changé. Rechargez la page avant de recommencer.";
  }
  if (code === "conflict") {
    return "Cette demande ne peut pas être rejouée. Rechargez la page avant de recommencer.";
  }
  if (code === "forbidden" || code === "unauthenticated") {
    return "Vous n’avez pas les droits nécessaires pour importer ces modèles.";
  }
  return "Impossible d’importer ces modèles pour le moment.";
}

function importSuccessMessage(input: {
  importedCount: number;
  alreadyImportedCount: number;
  elementaryImportedCount: number;
  elementaryAlreadyImportedCount: number;
}) {
  const parts = [
    `${input.importedCount} modèle${input.importedCount > 1 ? "s" : ""} importé${input.importedCount > 1 ? "s" : ""}.`,
  ];
  if (input.alreadyImportedCount > 0) {
    parts.push(
      `${input.alreadyImportedCount} modèle${input.alreadyImportedCount > 1 ? "s" : ""} déjà présent${input.alreadyImportedCount > 1 ? "s" : ""}.`,
    );
  }
  if (input.elementaryImportedCount > 0) {
    parts.push(
      `${input.elementaryImportedCount} jalon${input.elementaryImportedCount > 1 ? "s" : ""} élémentaire${input.elementaryImportedCount > 1 ? "s" : ""} importé${input.elementaryImportedCount > 1 ? "s" : ""} automatiquement.`,
    );
  }
  if (input.elementaryAlreadyImportedCount > 0) {
    parts.push(
      `${input.elementaryAlreadyImportedCount} dépendance${input.elementaryAlreadyImportedCount > 1 ? "s" : ""} déjà présente${input.elementaryAlreadyImportedCount > 1 ? "s" : ""}.`,
    );
  }
  return parts.join(" ");
}

function activeErrorMessage(code: string, activating: boolean) {
  if (code === "stale_revision") {
    return "Ce modèle a été modifié ailleurs. Rechargez la page avant de recommencer.";
  }
  if (code === "forbidden" || code === "unauthenticated" || code === "not_found") {
    return activating
      ? "Vous n’avez pas les droits nécessaires pour activer ce modèle."
      : "Vous n’avez pas les droits nécessaires pour désactiver ce modèle.";
  }
  if (code === "conflict") {
    return "Cette demande ne peut pas être rejouée. Rechargez la page avant de recommencer.";
  }
  return activating
    ? "Impossible d’activer ce modèle pour le moment."
    : "Impossible de désactiver ce modèle pour le moment.";
}

export async function importLitterPlanningModelLibraryModelsAction(
  submission: ImportLitterPlanningModelLibrarySubmission,
  _previousState: LitterPlanningModelLibraryImportActionState,
  formData: FormData,
): Promise<LitterPlanningModelLibraryImportActionState> {
  if (value(formData, "confirmation") !== "confirmed") {
    return { status: "error", message: "La confirmation est requise." };
  }

  const rawSelections = formData.getAll("selection");
  if (
    rawSelections.length < 1 ||
    rawSelections.length > 30 ||
    rawSelections.some((selection) => typeof selection !== "string")
  ) {
    return {
      status: "error",
      message: "Sélectionnez entre 1 et 30 modèles à importer.",
    };
  }

  const selection: Array<{ code: string; version: number }> = [];
  const seen = new Set<string>();
  for (const rawSelection of rawSelections as string[]) {
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*):([1-9][0-9]*)$/.exec(
      rawSelection,
    );
    const version = match ? Number(match[2]) : Number.NaN;
    if (
      !match ||
      match[1].length > 100 ||
      !Number.isInteger(version) ||
      version > postgresIntegerMax ||
      seen.has(rawSelection)
    ) {
      return {
        status: "error",
        message: "La sélection de modèles n’est pas valide.",
      };
    }
    seen.add(rawSelection);
    selection.push({ code: match[1], version });
  }

  const rawIsActive = value(formData, "is_active");
  if (rawIsActive !== "true" && rawIsActive !== "false") {
    return {
      status: "error",
      message: "Le statut initial sélectionné n’est pas valide.",
    };
  }

  const result = await importLitterPlanningModelLibraryModels({
    organizationId: submission.organizationId,
    clientCommandId: submission.clientCommandId,
    selection,
    isActive: rawIsActive === "true",
  });
  if (result.outcome === "error") {
    return {
      status: "error",
      message: libraryImportErrorMessage(result.error.code),
    };
  }

  revalidatePath(settingsPath);
  return {
    status: "success",
    message: importSuccessMessage({
      importedCount: result.importedCount,
      alreadyImportedCount: result.alreadyImportedCount,
      elementaryImportedCount: result.elementaryImportedCount,
      elementaryAlreadyImportedCount: result.elementaryAlreadyImportedCount,
    }),
  };
}

export async function setLitterPlanningModelActiveAction(
  submission: SetLitterPlanningModelActiveSubmission,
  _previousState: LitterPlanningModelActiveActionState,
  _formData: FormData,
): Promise<LitterPlanningModelActiveActionState> {
  void _previousState;
  void _formData;

  const result = await setLitterPlanningModelActive(
    submission.modelId,
    submission.clientCommandId,
    submission.expectedRevision,
    submission.isActive,
  );
  if (result.outcome === "error") {
    return {
      status: "error",
      code: result.error.code,
      message: activeErrorMessage(result.error.code, submission.isActive),
    };
  }

  revalidatePath(settingsPath);
  revalidatePath(`${settingsPath}/${submission.modelId}`);
  return {
    status: "success",
    message: submission.isActive
      ? "Le modèle a été réactivé. Aucun planning de portée n’a été modifié."
      : "Le modèle a été désactivé. Aucun planning de portée n’a été modifié.",
  };
}
