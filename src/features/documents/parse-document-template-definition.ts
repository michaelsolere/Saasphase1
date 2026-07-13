import {
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  documentTemplateDefinitionSchema,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
} from "./document-template-definition-schemas";

type ParseDocumentTemplateDefinitionInput = {
  templateFormat: string;
  documentType: string;
  templateContent: string | null;
};

export type ParseDocumentTemplateDefinitionResult =
  | {
      success: true;
      definition: DocumentTemplateDefinition;
    }
  | {
      success: false;
      error:
        | "invalid_format"
        | "invalid_json"
        | "unsupported_schema_version"
        | "document_type_mismatch"
        | "invalid_template_content";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDocumentTemplateType(value: unknown): value is DocumentTemplateType {
  return value === "reservation_contract" || value === "commitment_certificate";
}

export function parseDocumentTemplateDefinition({
  templateFormat,
  documentType,
  templateContent,
}: ParseDocumentTemplateDefinitionInput): ParseDocumentTemplateDefinitionResult {
  if (templateFormat !== "json") {
    return { success: false, error: "invalid_format" };
  }

  if (templateContent === null) {
    return { success: false, error: "invalid_template_content" };
  }

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(templateContent);
  } catch {
    return { success: false, error: "invalid_json" };
  }

  if (!isRecord(parsedContent)) {
    return { success: false, error: "invalid_template_content" };
  }

  if (
    "schemaVersion" in parsedContent &&
    parsedContent.schemaVersion !== DOCUMENT_TEMPLATE_SCHEMA_VERSION
  ) {
    return { success: false, error: "unsupported_schema_version" };
  }

  if (
    isDocumentTemplateType(parsedContent.documentType) &&
    parsedContent.documentType !== documentType
  ) {
    return { success: false, error: "document_type_mismatch" };
  }

  const result = documentTemplateDefinitionSchema.safeParse(parsedContent);
  if (!result.success) {
    return { success: false, error: "invalid_template_content" };
  }

  if (result.data.documentType !== documentType) {
    return { success: false, error: "document_type_mismatch" };
  }

  return { success: true, definition: result.data };
}
