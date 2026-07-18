"use server";

import { revalidatePath } from "next/cache";

import {
  createLitterCareTaskTemplate,
  LITTER_CARE_TASK_ANCHOR_TYPES,
  LITTER_CARE_TASK_CATEGORIES,
  LITTER_CARE_TASK_TARGET_SCOPES,
  setLitterCareTaskTemplateActive,
  updateLitterCareTaskTemplate,
  type LitterCareTaskAnchorType,
  type LitterCareTaskCategory,
  type LitterCareTaskTargetScope,
} from "@/features/litter-journal/litter-care-tasks";

const settingsPath = "/settings/litter-care-task-templates";
const postgresIntegerMin = -2_147_483_648;
const postgresIntegerMax = 2_147_483_647;

export type LitterCareTaskTemplateActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type CreateLitterCareTaskTemplateSubmission = {
  organizationId: string;
  clientCommandId: string;
};

export type UpdateLitterCareTaskTemplateSubmission = {
  templateId: string;
  expectedRevision: number;
  clientCommandId: string;
};

export type SetLitterCareTaskTemplateActiveSubmission = {
  templateId: string;
  expectedRevision: number;
  clientCommandId: string;
  isActive: boolean;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function optionalValue(formData: FormData, name: string) {
  const normalized = value(formData, name).trim();
  return normalized || null;
}

function parseInteger(formData: FormData, name: string) {
  const rawValue = value(formData, name).trim();
  if (!/^-?\d+$/.test(rawValue)) return null;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) &&
    parsed >= postgresIntegerMin &&
    parsed <= postgresIntegerMax
    ? parsed
    : null;
}

function category(input: string): LitterCareTaskCategory | null {
  return LITTER_CARE_TASK_CATEGORIES.includes(input as LitterCareTaskCategory)
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

function anchorType(input: string): LitterCareTaskAnchorType | null {
  return LITTER_CARE_TASK_ANCHOR_TYPES.includes(
    input as LitterCareTaskAnchorType,
  )
    ? (input as LitterCareTaskAnchorType)
    : null;
}

function species(input: string): "dog" | "cat" | null {
  return input === "dog" || input === "cat" ? input : null;
}

function templateValues(formData: FormData) {
  const title = value(formData, "title").trim();
  const description = optionalValue(formData, "description");
  const selectedCategory = category(value(formData, "category"));
  const selectedTargetScope = targetScope(value(formData, "target_scope"));
  const selectedAnchorType = anchorType(value(formData, "anchor_type"));
  const offsetDays = parseInteger(formData, "offset_days");
  const selectedSpecies = species(value(formData, "species"));
  const breed = optionalValue(formData, "breed");
  const sortOrder = parseInteger(formData, "sort_order");

  if (!title || title.length > 255) {
    return {
      error:
        "Le titre est obligatoire et ne doit pas dépasser 255 caractères.",
    } as const;
  }
  if (description && description.length > 5_000) {
    return {
      error: "La description ne doit pas dépasser 5 000 caractères.",
    } as const;
  }
  if (breed && breed.length > 255) {
    return { error: "La race ne doit pas dépasser 255 caractères." } as const;
  }
  if (
    !selectedCategory ||
    !selectedTargetScope ||
    !selectedAnchorType ||
    !selectedSpecies
  ) {
    return {
      error: "Une des valeurs sélectionnées n’est pas valide.",
    } as const;
  }
  if (
    offsetDays === null ||
    sortOrder === null ||
    (selectedAnchorType === "offspring_age" && offsetDays < 0)
  ) {
    return {
      error:
        "Le décalage et l’ordre d’affichage doivent être des nombres entiers valides.",
    } as const;
  }

  return {
    values: {
      title,
      description,
      category: selectedCategory,
      targetScope: selectedTargetScope,
      anchorType: selectedAnchorType,
      offsetDays,
      species: selectedSpecies,
      breed,
      sortOrder,
    },
  } as const;
}

function mutationErrorMessage(
  operation: "créer" | "modifier" | "changer le statut de",
  code: string,
) {
  if (code === "stale_revision") {
    return "Ce modèle a été modifié depuis l’ouverture du formulaire. Rechargez la page avant de recommencer.";
  }
  if (code === "forbidden" || code === "unauthenticated" || code === "not_found") {
    return `Vous n’avez pas les droits nécessaires pour ${operation} ce modèle.`;
  }
  if (code === "conflict") {
    return "Cette demande ne peut pas être rejouée. Rechargez la page avant de recommencer.";
  }
  return `Impossible de ${operation} ce modèle pour le moment.`;
}

export async function createLitterCareTaskTemplateAction(
  submission: CreateLitterCareTaskTemplateSubmission,
  _previousState: LitterCareTaskTemplateActionState,
  formData: FormData,
): Promise<LitterCareTaskTemplateActionState> {
  const parsed = templateValues(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  const result = await createLitterCareTaskTemplate({
    organizationId: submission.organizationId,
    clientCommandId: submission.clientCommandId,
    ...parsed.values,
  });
  if (result.outcome === "error") {
    return {
      status: "error",
      message: mutationErrorMessage("créer", result.error.code),
    };
  }

  revalidatePath(settingsPath);
  return { status: "success", message: "Le jalon a été créé." };
}

export async function updateLitterCareTaskTemplateAction(
  submission: UpdateLitterCareTaskTemplateSubmission,
  _previousState: LitterCareTaskTemplateActionState,
  formData: FormData,
): Promise<LitterCareTaskTemplateActionState> {
  const parsed = templateValues(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  const result = await updateLitterCareTaskTemplate({
    templateId: submission.templateId,
    expectedRevision: submission.expectedRevision,
    clientCommandId: submission.clientCommandId,
    ...parsed.values,
  });
  if (result.outcome === "error") {
    return {
      status: "error",
      message: mutationErrorMessage("modifier", result.error.code),
    };
  }

  revalidatePath(settingsPath);
  return { status: "success", message: "Le jalon a été modifié." };
}

export async function setLitterCareTaskTemplateActiveAction(
  submission: SetLitterCareTaskTemplateActiveSubmission,
  _previousState: LitterCareTaskTemplateActionState,
  _formData: FormData,
): Promise<LitterCareTaskTemplateActionState> {
  void _previousState;
  void _formData;

  const result = await setLitterCareTaskTemplateActive({
    templateId: submission.templateId,
    expectedRevision: submission.expectedRevision,
    clientCommandId: submission.clientCommandId,
    isActive: submission.isActive,
  });
  if (result.outcome === "error") {
    return {
      status: "error",
      message: mutationErrorMessage("changer le statut de", result.error.code),
    };
  }

  revalidatePath(settingsPath);
  return {
    status: "success",
    message: submission.isActive
      ? "Le jalon a été réactivé."
      : "Le jalon a été désactivé.",
  };
}
