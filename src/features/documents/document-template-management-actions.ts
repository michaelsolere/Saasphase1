"use server";

import { revalidatePath } from "next/cache";

import {
  createNextDocumentTemplateDraft,
  listDocumentTemplateFamilies,
  publishDocumentTemplateDraft,
  saveDocumentTemplateDraft,
  validateDocumentTemplateDraft,
  type DocumentTemplateManagementErrorCode,
} from "@/features/documents/document-template-management";
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
