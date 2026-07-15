import {
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  FREE_RESERVATION_CONTRACT_SCHEMA_VERSION,
  documentTemplateDefinitionSchema,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
} from "./document-template-definition-schemas";
import {
  parseFreeReservationContractBody,
  parseReservationContractVariables,
  type TemplateFormattingIssue,
  type TemplateVariableIssue,
} from "./reservation-contract-template-variables";

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
        | "invalid_template_content"
        | "invalid_template_variables"
        | "invalid_template_formatting";
      variableIssues?: TemplateVariableIssue[];
      formattingIssues?: TemplateFormattingIssue[];
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
    parsedContent.schemaVersion !== DOCUMENT_TEMPLATE_SCHEMA_VERSION &&
    parsedContent.schemaVersion !== FREE_RESERVATION_CONTRACT_SCHEMA_VERSION
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

  if (result.data.schemaVersion === FREE_RESERVATION_CONTRACT_SCHEMA_VERSION) {
    if (result.data.title.includes("**")) {
      return {
        success: false,
        error: "invalid_template_formatting",
        formattingIssues: [{ code: "formatting_in_title", offset: result.data.title.indexOf("**") }],
      };
    }
    const titleVariables = parseReservationContractVariables(result.data.title);
    const body = parseFreeReservationContractBody(result.data.body);
    if (!body.success && body.error === "invalid_template_formatting") {
      return {
        success: false,
        error: body.error,
        formattingIssues: body.issues,
      };
    }
    const issues = [
      ...(titleVariables.success ? [] : titleVariables.issues),
      ...(body.success ? [] : body.issues),
    ];
    if (issues.length > 0) {
      return {
        success: false,
        error: "invalid_template_variables",
        variableIssues: issues.slice(0, 50),
      };
    }
  }

  return { success: true, definition: result.data };
}
