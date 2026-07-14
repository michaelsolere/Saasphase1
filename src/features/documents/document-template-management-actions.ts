"use server";

import { revalidatePath } from "next/cache";

import {
  createDocumentTemplateFamilyWithDraft,
  createNextDocumentTemplateDraft,
  discardDocumentTemplateDraft,
  listDocumentTemplateFamilies,
  publishDocumentTemplateDraft,
  saveDocumentTemplateDraft,
  validateDocumentTemplateDraft,
  type DocumentTemplateManagementErrorCode,
} from "@/features/documents/document-template-management";
import { createInitialDocumentTemplateDefinition } from "@/features/documents/create-initial-document-template-definition";
import { hasStructuredDocumentTemplateEditor } from "@/features/documents/document-template-editor-config";
import { resolveCurrentDocumentTemplateOrganization } from "@/features/documents/document-template-management-context";

export type DocumentTemplateActionResult =
  | {
      outcome: "success";
      message: string;
      updatedAt?: string;
    }
  | {
      outcome: "error";
      code: DocumentTemplateManagementErrorCode;
      message: string;
    };

export type CreateDocumentTemplateFamilyActionResult =
  | { outcome: "success"; familyId: string }
  | { outcome: "error"; code: DocumentTemplateManagementErrorCode; message: string };

export type DiscardDocumentTemplateDraftActionResult =
  | { outcome: "success"; result: "draft_discarded" | "family_deleted" }
  | { outcome: "error"; code: DocumentTemplateManagementErrorCode; message: string };

function missingOrganization(): DocumentTemplateActionResult {
  return {
    outcome: "error",
    code: "forbidden",
    message: "Aucune organisation active ne permet cette opération.",
  };
}

function revalidateTemplateRoutes(familyId: string) {
  revalidatePath("/documents/modeles");
  revalidatePath(`/documents/modeles/${familyId}`);
}

function neutralCreationError(
  code: DocumentTemplateManagementErrorCode,
): CreateDocumentTemplateFamilyActionResult {
  return {
    outcome: "error",
    code,
    message: "La création du modèle est impossible. Vérifiez les informations saisies puis réessayez.",
  };
}

export async function createDocumentTemplateFamilyAction(input: {
  name: string;
  description?: string;
  documentType: string;
  species: string;
  breed: string;
}): Promise<CreateDocumentTemplateFamilyActionResult> {
  const organization = await resolveCurrentDocumentTemplateOrganization();
  if (!organization) return neutralCreationError("forbidden");

  if (!hasStructuredDocumentTemplateEditor(input.documentType)) {
    return neutralCreationError("invalid_input");
  }

  const result = await createDocumentTemplateFamilyWithDraft({
    organizationId: organization.organizationId,
    name: input.name,
    description: input.description?.trim() || null,
    documentType: input.documentType,
    species: input.species,
    breed: input.breed,
    templateFormat: "json",
    templateContent: JSON.stringify(
      createInitialDocumentTemplateDefinition(input.documentType),
    ),
  });

  if (result.outcome === "error") return neutralCreationError(result.error.code);

  revalidatePath("/documents/modeles");
  return { outcome: "success", familyId: result.familyId };
}

async function resolveCurrentDraft(templateId: string) {
  const organization = await resolveCurrentDocumentTemplateOrganization();
  if (!organization) return { outcome: "error" as const, result: missingOrganization() };

  const listed = await listDocumentTemplateFamilies({
    organizationId: organization.organizationId,
  });
  if (listed.outcome === "error") {
    return {
      outcome: "error" as const,
      result: { outcome: "error" as const, ...listed.error },
    };
  }

  const family = listed.families.find((item) => item.draft?.id === templateId);
  if (!family) {
    return {
      outcome: "error" as const,
      result: {
        outcome: "error" as const,
        code: "not_found" as const,
        message: "Le brouillon est introuvable.",
      },
    };
  }

  return {
    outcome: "success" as const,
    organizationId: organization.organizationId,
    familyId: family.id,
  };
}

export async function createNextDocumentTemplateDraftAction(input: {
  familyId: string;
}): Promise<DocumentTemplateActionResult> {
  const organization = await resolveCurrentDocumentTemplateOrganization();
  if (!organization) return missingOrganization();

  const result = await createNextDocumentTemplateDraft({
    organizationId: organization.organizationId,
    familyId: input.familyId,
  });

  if (result.outcome === "error") {
    return { outcome: "error", ...result.error };
  }

  revalidateTemplateRoutes(input.familyId);
  return {
    outcome: "success",
    message: `Le brouillon version ${result.version} a été créé.`,
    updatedAt: result.updatedAt,
  };
}

export async function saveDocumentTemplateDraftAction(input: {
  templateId: string;
  templateContent: string;
  expectedUpdatedAt: string;
}): Promise<DocumentTemplateActionResult> {
  const context = await resolveCurrentDraft(input.templateId);
  if (context.outcome === "error") return context.result;

  const result = await saveDocumentTemplateDraft({
    organizationId: context.organizationId,
    templateId: input.templateId,
    templateContent: input.templateContent,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });

  if (result.outcome === "error") {
    return { outcome: "error", ...result.error };
  }

  revalidateTemplateRoutes(context.familyId);
  return {
    outcome: "success",
    message: "Le brouillon a été enregistré.",
    updatedAt: result.updatedAt,
  };
}

export async function validateDocumentTemplateDraftAction(input: {
  templateId: string;
}): Promise<DocumentTemplateActionResult> {
  const context = await resolveCurrentDraft(input.templateId);
  if (context.outcome === "error") return context.result;

  const result = await validateDocumentTemplateDraft({
    organizationId: context.organizationId,
    templateId: input.templateId,
  });

  if (result.outcome === "error") {
    return { outcome: "error", ...result.error };
  }

  revalidateTemplateRoutes(context.familyId);
  return {
    outcome: "success",
    message: "Le brouillon respecte le schéma documentaire.",
    updatedAt: result.updatedAt,
  };
}

export async function publishDocumentTemplateDraftAction(input: {
  templateId: string;
}): Promise<DocumentTemplateActionResult> {
  const context = await resolveCurrentDraft(input.templateId);
  if (context.outcome === "error") return context.result;

  const result = await publishDocumentTemplateDraft({
    organizationId: context.organizationId,
    templateId: input.templateId,
  });

  if (result.outcome === "error") {
    return { outcome: "error", ...result.error };
  }

  revalidateTemplateRoutes(context.familyId);
  return {
    outcome: "success",
    message: "Le brouillon a été publié.",
  };
}

export async function discardDocumentTemplateDraftAction(input: {
  familyId: string;
  templateId: string;
  expectedUpdatedAt: string;
}): Promise<DiscardDocumentTemplateDraftActionResult> {
  const organization = await resolveCurrentDocumentTemplateOrganization();
  if (!organization) {
    return { outcome: "error", code: "forbidden", message: "Cette opération est impossible." };
  }

  const result = await discardDocumentTemplateDraft({
    organizationId: organization.organizationId,
    familyId: input.familyId,
    templateId: input.templateId,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
  if (result.outcome === "error") {
    const conflict = result.error.code === "stale_draft";
    return {
      outcome: "error",
      code: result.error.code,
      message: conflict
        ? "Le brouillon a été modifié entre-temps. Rechargez la page avant de réessayer."
        : "Cette opération est impossible. Aucune donnée n’a été modifiée.",
    };
  }

  revalidateTemplateRoutes(input.familyId);
  return { outcome: "success", result: result.result };
}
