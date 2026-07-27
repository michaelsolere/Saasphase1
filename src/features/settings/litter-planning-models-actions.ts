"use server";

import { revalidatePath } from "next/cache";

import { importLitterPlanningModelLibraryModels } from "@/features/litter-journal/litter-planning-model-library";
import {
  createLitterPlanningModel,
  getLitterPlanningModel,
  replaceLitterPlanningModel,
  setLitterPlanningModelActive,
  type LitterPlanningModelItemInput,
} from "@/features/litter-journal/litter-planning-models";
import { listLitterCareTaskTemplatesForOrganization } from "@/features/litter-journal/litter-care-tasks";
import {
  createLitterPlanningModelEditorDraftFromModel,
  isLitterPlanningModelImported,
  parseLitterPlanningModelEditorDraftPayload,
  templateOptionFromSummary,
  validateLitterPlanningModelEditorDraft,
} from "@/features/settings/litter-planning-model-editor-draft";
import { formatLitterPlanningModelOrganizationOrigin } from "@/features/settings/litter-planning-model-labels";

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

export type LitterPlanningModelEditorActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
  modelId?: string;
  revision?: number;
};

export type CreateLitterPlanningModelSubmission = {
  organizationId: string;
  clientCommandId: string;
};

export type ReplaceLitterPlanningModelSubmission = {
  organizationId: string;
  modelId: string;
  expectedRevision: number;
  clientCommandId: string;
};

export type DuplicateLitterPlanningModelSubmission = {
  organizationId: string;
  sourceModelId: string;
  clientCommandId: string;
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

function editorMutationErrorMessage(
  code: string,
  operation: "créer" | "modifier" | "dupliquer",
) {
  if (code === "imported_model_immutable") {
    return "Un modèle importé ne peut pas être modifié directement. Créez une copie personnalisée.";
  }
  if (code === "stale_revision") {
    return "Ce modèle a été modifié ailleurs. Rechargez la version actuelle avant d’enregistrer à nouveau.";
  }
  if (code === "forbidden" || code === "unauthenticated" || code === "not_found") {
    return `Vous n’avez pas les droits nécessaires pour ${operation} ce modèle.`;
  }
  if (code === "conflict") {
    return "Cette demande ne peut pas être rejouée. Rechargez la page avant de recommencer.";
  }
  return `Impossible de ${operation} ce modèle pour le moment.`;
}

async function loadEditorTemplates(organizationId: string) {
  const templates = await listLitterCareTaskTemplatesForOrganization({
    organizationId,
  });
  if (templates.outcome !== "success") return null;
  return templates.templates.map(templateOptionFromSummary);
}

export async function createLitterPlanningModelAction(
  submission: CreateLitterPlanningModelSubmission,
  _previousState: LitterPlanningModelEditorActionState,
  formData: FormData,
): Promise<LitterPlanningModelEditorActionState> {
  void _previousState;
  const rawDraft = value(formData, "draft_json");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawDraft);
  } catch {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }
  const draft = parseLitterPlanningModelEditorDraftPayload(parsedJson);
  if (!draft) {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }

  const templates = await loadEditorTemplates(submission.organizationId);
  if (!templates) {
    return {
      status: "error",
      message: "Impossible de charger les jalons élémentaires pour le moment.",
    };
  }

  let validation;
  try {
    validation = validateLitterPlanningModelEditorDraft(draft, templates);
  } catch {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }
  if (!validation.ok) {
    return {
      status: "error",
      message:
        validation.errors[0]?.message ??
        "Le modèle contient des erreurs à corriger.",
    };
  }

  const result = await createLitterPlanningModel(
    submission.organizationId,
    submission.clientCommandId,
    {
      title: validation.payload.title,
      description: validation.payload.description,
      species: validation.payload.species,
      breed: validation.payload.breed,
      isActive: false,
      items: validation.payload.items,
    },
  );
  if (result.outcome === "error") {
    return {
      status: "error",
      code: result.error.code,
      message: editorMutationErrorMessage(result.error.code, "créer"),
    };
  }

  revalidatePath(settingsPath);
  revalidatePath(`${settingsPath}/${result.modelId}`);
  return {
    status: "success",
    modelId: result.modelId,
    revision: result.revision,
    message:
      "Le modèle personnalisé a été créé inactif. Activez-le lorsqu’il sera prêt pour une prochaine portée.",
  };
}

export async function replaceLitterPlanningModelAction(
  submission: ReplaceLitterPlanningModelSubmission,
  _previousState: LitterPlanningModelEditorActionState,
  formData: FormData,
): Promise<LitterPlanningModelEditorActionState> {
  void _previousState;
  const existing = await getLitterPlanningModel(submission.modelId);
  if (existing.outcome === "error" || !("model" in existing)) {
    return {
      status: "error",
      code: existing.outcome === "error" ? existing.error.code : "not_found",
      message: editorMutationErrorMessage(
        existing.outcome === "error" ? existing.error.code : "not_found",
        "modifier",
      ),
    };
  }
  if (isLitterPlanningModelImported(existing.model)) {
    return {
      status: "error",
      message:
        "Un modèle importé ne peut pas être modifié directement. Créez une copie personnalisée.",
    };
  }

  const rawDraft = value(formData, "draft_json");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawDraft);
  } catch {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }
  const draft = parseLitterPlanningModelEditorDraftPayload(parsedJson);
  if (!draft) {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }

  const templates = await loadEditorTemplates(submission.organizationId);
  if (!templates) {
    return {
      status: "error",
      message: "Impossible de charger les jalons élémentaires pour le moment.",
    };
  }

  let validation;
  try {
    validation = validateLitterPlanningModelEditorDraft(
      {
        ...draft,
        mode: "edit",
        libraryModelCode: existing.model.libraryModelCode,
        libraryModelVersion: existing.model.libraryModelVersion,
      },
      templates,
    );
  } catch {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }
  if (!validation.ok) {
    return {
      status: "error",
      message:
        validation.errors[0]?.message ??
        "Le modèle contient des erreurs à corriger.",
    };
  }

  const result = await replaceLitterPlanningModel(
    submission.modelId,
    submission.clientCommandId,
    submission.expectedRevision,
    {
      title: validation.payload.title,
      description: validation.payload.description,
      species: validation.payload.species,
      breed: validation.payload.breed,
      items: validation.payload.items as LitterPlanningModelItemInput[],
    },
  );
  if (result.outcome === "error") {
    return {
      status: "error",
      code: result.error.code,
      message: editorMutationErrorMessage(result.error.code, "modifier"),
      modelId: submission.modelId,
    };
  }

  revalidatePath(settingsPath);
  revalidatePath(`${settingsPath}/${submission.modelId}`);
  revalidatePath(`${settingsPath}/${submission.modelId}/edit`);
  return {
    status: "success",
    modelId: result.modelId,
    revision: result.revision,
    message:
      "Le modèle a été enregistré. Aucun planning de portée déjà créé n’a été modifié.",
  };
}

export async function duplicateLitterPlanningModelAction(
  submission: DuplicateLitterPlanningModelSubmission,
  _previousState: LitterPlanningModelEditorActionState,
  _formData: FormData,
): Promise<LitterPlanningModelEditorActionState> {
  void _previousState;
  void _formData;

  const existing = await getLitterPlanningModel(submission.sourceModelId);
  if (existing.outcome === "error" || !("model" in existing)) {
    return {
      status: "error",
      code: existing.outcome === "error" ? existing.error.code : "not_found",
      message: editorMutationErrorMessage(
        existing.outcome === "error" ? existing.error.code : "not_found",
        "dupliquer",
      ),
    };
  }

  const templates = await loadEditorTemplates(submission.organizationId);
  if (!templates) {
    return {
      status: "error",
      message: "Impossible de charger les jalons élémentaires pour le moment.",
    };
  }

  const draft = createLitterPlanningModelEditorDraftFromModel(existing.model, {
    mode: "duplicate",
    sourceOriginLabel: formatLitterPlanningModelOrganizationOrigin(
      existing.model.libraryModelCode,
      existing.model.libraryModelVersion,
    ),
  });
  let validation;
  try {
    validation = validateLitterPlanningModelEditorDraft(draft, templates);
  } catch {
    return { status: "error", message: "Le formulaire transmis est invalide." };
  }
  if (!validation.ok) {
    return {
      status: "error",
      message:
        validation.errors[0]?.message ??
        "La copie n’a pas pu être préparée à partir de ce modèle.",
    };
  }

  const result = await createLitterPlanningModel(
    submission.organizationId,
    submission.clientCommandId,
    {
      title: validation.payload.title,
      description: validation.payload.description,
      species: validation.payload.species,
      breed: validation.payload.breed,
      isActive: false,
      items: validation.payload.items,
    },
  );
  if (result.outcome === "error") {
    return {
      status: "error",
      code: result.error.code,
      message: editorMutationErrorMessage(result.error.code, "dupliquer"),
    };
  }

  revalidatePath(settingsPath);
  revalidatePath(`${settingsPath}/${result.modelId}`);
  revalidatePath(`${settingsPath}/${result.modelId}/edit`);
  return {
    status: "success",
    modelId: result.modelId,
    revision: result.revision,
    message:
      "La copie personnalisée a été créée inactive. Vous pouvez maintenant l’adapter.",
  };
}
