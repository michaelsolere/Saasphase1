import {
  DOCUMENT_TEMPLATE_LOCALE,
  DOCUMENT_TEMPLATE_SCHEMA_VERSION,
  type DocumentTemplateDefinition,
  type DocumentTemplateType,
} from "./document-template-definitions";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseStoredObject(templateContent: string | null) {
  if (!templateContent) return {};
  try {
    return asObject(JSON.parse(templateContent));
  } catch {
    return {};
  }
}

/** Décode un brouillon éditeur au format libre V2 uniquement. */
export function decodeDocumentTemplateDraft({
  documentType,
  templateContent,
}: {
  documentType: DocumentTemplateType;
  templateContent: string | null;
}): DocumentTemplateDefinition {
  const stored = parseStoredObject(templateContent);

  return {
    schemaVersion: DOCUMENT_TEMPLATE_SCHEMA_VERSION,
    locale: DOCUMENT_TEMPLATE_LOCALE,
    documentType,
    title: asString(stored.title),
    body: asString(stored.body),
  };
}
