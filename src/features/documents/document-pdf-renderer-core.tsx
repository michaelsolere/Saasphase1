import { createHash } from "node:crypto";

import { renderToBuffer } from "@react-pdf/renderer";

import { DocumentPdfDocument } from "./document-pdf-document";
import { buildDocumentPdfPresentation } from "./document-pdf-presentation";
import { parseDocumentGenerationSnapshot } from "./parse-document-generation-snapshot";
import { parseDocumentTemplateDefinition } from "./parse-document-template-definition";
import { resolveFreeReservationContractDefinition } from "./reservation-contract-template-variables";
import { validateOrganizationLogoBytes } from "@/features/settings/organization-logo-image";

export type RenderDocumentPdfInput = {
  documentType: string;
  snapshot: unknown;
  templateContent: string;
  logoBytes?: Buffer | null;
  allowMissingTemplateVariables?: boolean;
};

export type RenderDocumentPdfErrorCode =
  | "invalid_snapshot"
  | "invalid_template"
  | "document_type_mismatch"
  | "template_hash_mismatch"
  | "branding_mismatch"
  | "missing_template_variables"
  | "render_error";

export type RenderDocumentPdfResult =
  | {
      outcome: "success";
      bytes: Buffer;
      mimeType: "application/pdf";
      fileName: string;
      documentType: "reservation_contract" | "commitment_certificate";
    }
  | {
      outcome: "error";
      error: { code: RenderDocumentPdfErrorCode };
    };

function fail(code: RenderDocumentPdfErrorCode): RenderDocumentPdfResult {
  return { outcome: "error", error: { code } };
}

export async function renderDocumentPdfCore(
  input: RenderDocumentPdfInput,
): Promise<RenderDocumentPdfResult> {
  const parsedSnapshot = parseDocumentGenerationSnapshot({
    documentType: input.documentType,
    generationData: input.snapshot,
  });
  if (!parsedSnapshot.success) {
    return fail(
      parsedSnapshot.error === "document_type_mismatch"
        ? "document_type_mismatch"
        : "invalid_snapshot",
    );
  }

  const parsedTemplate = parseDocumentTemplateDefinition({
    templateFormat: "json",
    documentType: input.documentType,
    templateContent: input.templateContent,
  });
  if (!parsedTemplate.success) {
    return fail(
      parsedTemplate.error === "document_type_mismatch"
        ? "document_type_mismatch"
        : "invalid_template",
    );
  }
  if (
    parsedSnapshot.snapshot.documentType !== parsedTemplate.definition.documentType
  ) {
    return fail("document_type_mismatch");
  }

  const contentHash = createHash("sha256")
    .update(input.templateContent)
    .digest("hex");
  if (contentHash !== parsedSnapshot.snapshot.template.templateContentSha256) {
    return fail("template_hash_mismatch");
  }

  if (
    parsedTemplate.definition.schemaVersion === 2 &&
    parsedSnapshot.snapshot.documentType === "reservation_contract"
  ) {
    const resolved = resolveFreeReservationContractDefinition({
      definition: parsedTemplate.definition,
      snapshot: parsedSnapshot.snapshot,
      allowMissingTemplateVariables: input.allowMissingTemplateVariables ?? false,
    });
    if (!resolved.success) {
      return fail(
        resolved.error === "missing_template_variables"
          ? "missing_template_variables"
          : "invalid_template",
      );
    }
  }

  const presentation = buildDocumentPdfPresentation(
    parsedSnapshot.snapshot,
    parsedTemplate.definition,
    { allowMissingTemplateVariables: input.allowMissingTemplateVariables },
  );
  if (!presentation) return fail("document_type_mismatch");

  const snapshotLogo = parsedSnapshot.snapshot.branding?.logo;
  let renderedLogo: { dataUri: string; widthPx: number; heightPx: number } | null = null;
  if (snapshotLogo) {
    if (!input.logoBytes) return fail("branding_mismatch");
    const validatedLogo = await validateOrganizationLogoBytes({
      bytes: input.logoBytes,
      declaredMimeType: snapshotLogo.mimeType,
    });
    if (
      !validatedLogo.ok ||
      validatedLogo.logo.fileSha256 !== snapshotLogo.fileSha256 ||
      validatedLogo.logo.fileSizeBytes !== snapshotLogo.fileSizeBytes ||
      validatedLogo.logo.widthPx !== snapshotLogo.widthPx ||
      validatedLogo.logo.heightPx !== snapshotLogo.heightPx
    ) {
      return fail("branding_mismatch");
    }
    renderedLogo = {
      dataUri: `data:${snapshotLogo.mimeType};base64,${input.logoBytes.toString("base64")}`,
      widthPx: snapshotLogo.widthPx,
      heightPx: snapshotLogo.heightPx,
    };
  } else if (input.logoBytes) {
    return fail("branding_mismatch");
  }

  try {
    const bytes = await renderToBuffer(DocumentPdfDocument({ presentation, logo: renderedLogo }));
    return {
      outcome: "success",
      bytes: Buffer.from(bytes),
      mimeType: "application/pdf",
      fileName: presentation.fileName,
      documentType: presentation.documentType,
    };
  } catch {
    return fail("render_error");
  }
}
