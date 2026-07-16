import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isDocumentPdfMetadataCoherent,
  parseDocumentPdfPath,
  storeDocumentPdfCore,
  type DocumentPdfErrorCode,
  type StoreDocumentPdfInput,
  type StoreDocumentPdfResult,
} from "./document-pdf-storage-core";
import {
  renderDocumentPdfCore,
  type RenderDocumentPdfErrorCode,
  type RenderDocumentPdfInput,
  type RenderDocumentPdfResult,
} from "./document-pdf-renderer-core";
import { parseDocumentGenerationSnapshot } from "./parse-document-generation-snapshot";
import {
  prepareDocumentGenerationSnapshotForReservationCore,
  type PrepareDocumentGenerationSnapshotErrorCode,
  type PrepareDocumentGenerationSnapshotInput,
  type PrepareDocumentGenerationSnapshotResult,
} from "./prepare-document-generation-snapshot-core";
import type { Database } from "@/types/database.types";
import { resolveFreeReservationContractDefinition } from "./reservation-contract-template-variables";

type Supabase = SupabaseClient<Database>;
type SupportedDocumentType =
  | "reservation_contract"
  | "commitment_certificate";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type GenerateAndStoreReservationDocumentPdfInput = {
  documentId: string;
  reservationId: string;
  documentType: SupportedDocumentType;
  templateId: string;
  capturedAt: string;
};

export type GenerateAndStoreReservationDocumentPdfErrorStage =
  | "input"
  | "prepare"
  | "render"
  | "current_document"
  | "store";

export type GenerateAndStoreReservationDocumentPdfErrorCode =
  | "invalid_input"
  | "document_id_conflict"
  | PrepareDocumentGenerationSnapshotErrorCode
  | RenderDocumentPdfErrorCode
  | DocumentPdfErrorCode;

export type GenerateAndStoreReservationDocumentPdfResult =
  | {
      outcome: "created" | "existing";
      documentId: string;
      documentType: SupportedDocumentType;
      title: string;
      fileName: string;
      filePath: string;
      fileSha256: string;
      version: number;
      templateId: string;
      templateVersion: number;
      capturedAt: string;
      replacesDocumentId: string | null;
    }
  | {
      outcome: "error";
      error: {
        stage: GenerateAndStoreReservationDocumentPdfErrorStage;
        code: GenerateAndStoreReservationDocumentPdfErrorCode;
      };
    };

export type GenerateAndStoreReservationDocumentPdfDependencies = {
  prepare: (
    input: PrepareDocumentGenerationSnapshotInput,
    supabase: Supabase,
  ) => Promise<PrepareDocumentGenerationSnapshotResult>;
  render: (input: RenderDocumentPdfInput) => Promise<RenderDocumentPdfResult>;
  store: (
    input: StoreDocumentPdfInput,
    supabase: Supabase,
  ) => Promise<StoreDocumentPdfResult>;
};

const defaultDependencies: GenerateAndStoreReservationDocumentPdfDependencies = {
  prepare: prepareDocumentGenerationSnapshotForReservationCore,
  render: renderDocumentPdfCore,
  store: storeDocumentPdfCore,
};

function fail(
  stage: GenerateAndStoreReservationDocumentPdfErrorStage,
  code: GenerateAndStoreReservationDocumentPdfErrorCode,
): GenerateAndStoreReservationDocumentPdfResult {
  return { outcome: "error", error: { stage, code } };
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function isSupportedDocumentType(
  value: unknown,
): value is SupportedDocumentType {
  return (
    value === "reservation_contract" || value === "commitment_certificate"
  );
}

function validCapturedAt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function sameInstant(left: string | null, right: string) {
  return Boolean(left && Date.parse(left) === Date.parse(right));
}

function deterministicFileName(
  documentType: SupportedDocumentType,
  reservationId: string,
) {
  return documentType === "reservation_contract"
    ? `contrat-reservation-${reservationId}.pdf`
    : `certificat-engagement-${reservationId}.pdf`;
}

type ReplayDocument = Database["public"]["Tables"]["documents"]["Row"];

function replayResult(
  document: ReplayDocument,
  input: GenerateAndStoreReservationDocumentPdfInput,
): GenerateAndStoreReservationDocumentPdfResult | null {
  if (
    document.reservation_id !== input.reservationId ||
    document.document_type !== input.documentType ||
    !document.generated_from_template ||
    document.deleted_at !== null ||
    !["generated", "sent", "signed"].includes(document.status) ||
    !document.signature_required ||
    !document.title.trim() ||
    document.file_name !== `${document.file_sha256}.pdf` ||
    !isDocumentPdfMetadataCoherent(document)
  ) {
    return null;
  }

  const parsedSnapshot = parseDocumentGenerationSnapshot({
    documentType: document.document_type,
    generationData: document.generation_data,
  });
  if (!parsedSnapshot.success) return null;

  const snapshot = parsedSnapshot.snapshot;
  const parsedPath = parseDocumentPdfPath(document.file_path!);
  const templateMatches =
    snapshot.snapshotVersion === 1
      ? snapshot.template.templateId === input.templateId &&
        snapshot.template.templateId === document.template_id &&
        snapshot.template.templateVersion === document.source_template_version &&
        document.reservation_document_variant_version_id === null
      : snapshot.template.selectedTemplateId === input.templateId &&
        snapshot.template.templateId === document.template_id &&
        snapshot.template.templateVersion === document.source_template_version &&
        snapshot.template.reservationDocumentVariantVersionId ===
          document.reservation_document_variant_version_id;
  if (
    !parsedPath ||
    snapshot.sources.organizationId !== document.organization_id ||
    snapshot.sources.reservationId !== document.reservation_id ||
    snapshot.sources.contactId !== document.contact_id ||
    snapshot.sources.applicationId !== document.application_id ||
    snapshot.sources.litterId !== document.litter_id ||
    snapshot.sources.animalId !== document.animal_id ||
    document.litter_group_id !== null ||
    snapshot.documentType !== document.document_type ||
    !templateMatches ||
    !sameInstant(document.generated_at, snapshot.capturedAt) ||
    snapshot.capturedAt !== input.capturedAt
  ) {
    return null;
  }

  return {
    outcome: "existing",
    documentId: document.id,
    documentType: input.documentType,
    title: document.title,
    fileName: deterministicFileName(input.documentType, input.reservationId),
    filePath: document.file_path!,
    fileSha256: document.file_sha256!,
    version: parsedPath.version,
    templateId: document.template_id!,
    templateVersion: document.source_template_version!,
    capturedAt: snapshot.capturedAt,
    replacesDocumentId: document.replaces_document_id,
  };
}

export async function generateAndStoreReservationDocumentPdfCore(
  rawInput: GenerateAndStoreReservationDocumentPdfInput,
  supabase: Supabase,
  dependencies: GenerateAndStoreReservationDocumentPdfDependencies =
    defaultDependencies,
): Promise<GenerateAndStoreReservationDocumentPdfResult> {
  const documentId = normalizeUuid(rawInput.documentId);
  const reservationId = normalizeUuid(rawInput.reservationId);
  const templateId = normalizeUuid(rawInput.templateId);
  if (
    !documentId ||
    !reservationId ||
    !templateId ||
    !isSupportedDocumentType(rawInput.documentType) ||
    !validCapturedAt(rawInput.capturedAt)
  ) {
    return fail("input", "invalid_input");
  }
  const input = {
    ...rawInput,
    documentId,
    reservationId,
    templateId,
  };

  const requestedDocument = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (requestedDocument.error) {
    console.error("generated_document_replay_read_failed", requestedDocument.error);
    return fail("current_document", "database_error");
  }
  if (requestedDocument.data) {
    return (
      replayResult(requestedDocument.data, input) ??
      fail("input", "document_id_conflict")
    );
  }

  const prepared = await dependencies.prepare(
    {
      reservationId,
      documentType: input.documentType,
      templateId,
      capturedAt: input.capturedAt,
    },
    supabase,
  );
  if (prepared.outcome === "error") {
    return fail("prepare", prepared.error.code);
  }

  const rendered = await dependencies.render({
    documentType: input.documentType,
    snapshot: prepared.snapshot,
    templateContent: prepared.templateContent,
    logoBytes: prepared.logoBytes,
  });
  if (rendered.outcome === "error") {
    return fail("render", rendered.error.code);
  }

  let documentTitle = prepared.templateDefinition.title;
  if (
    prepared.templateDefinition.schemaVersion === 2 &&
    prepared.snapshot.documentType === "reservation_contract"
  ) {
    const resolvedDefinition = resolveFreeReservationContractDefinition({
      definition: prepared.templateDefinition,
      snapshot: prepared.snapshot,
    });
    if (!resolvedDefinition.success) {
      return fail(
        "render",
        resolvedDefinition.error === "missing_template_variables"
          ? "missing_template_variables"
          : resolvedDefinition.error === "invalid_template_variable_value"
            ? "invalid_template_variable_value"
          : resolvedDefinition.error === "invalid_template_formatting"
            ? "invalid_template_formatting"
          : "invalid_template",
      );
    }
    documentTitle = resolvedDefinition.title;
  }

  const currentDocument = await supabase
    .from("documents")
    .select("id, replaces_document_id")
    .eq("organization_id", prepared.snapshot.sources.organizationId)
    .eq("reservation_id", reservationId)
    .eq("document_type", input.documentType)
    .is("deleted_at", null)
    .is("superseded_at", null)
    .maybeSingle();
  if (currentDocument.error) {
    console.error("generated_document_current_read_failed", currentDocument.error);
    return fail("current_document", "database_error");
  }

  const replacesDocumentId = currentDocument.data
    ? currentDocument.data.id === documentId
      ? currentDocument.data.replaces_document_id
      : currentDocument.data.id
    : null;
  const stored = await dependencies.store(
    {
      organizationId: prepared.snapshot.sources.organizationId,
      documentId,
      replacesDocumentId,
      bytes: rendered.bytes,
      documentType: input.documentType,
      title: documentTitle,
      templateId: prepared.templateId,
      generatedFromTemplate: true,
      generatedAt: prepared.snapshot.capturedAt,
      sourceTemplateVersion: prepared.templateVersion,
      reservationDocumentVariantVersionId:
        prepared.reservationDocumentVariantVersionId,
      generationData: prepared.snapshot,
      signatureRequired: true,
      contactId: prepared.snapshot.sources.contactId,
      applicationId: prepared.snapshot.sources.applicationId,
      reservationId: prepared.snapshot.sources.reservationId,
      litterId: prepared.snapshot.sources.litterId,
      animalId: prepared.snapshot.sources.animalId,
    },
    supabase,
  );
  if (stored.outcome === "error") {
    const concurrentDocument = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();
    if (!concurrentDocument.error && concurrentDocument.data) {
      const replay = replayResult(concurrentDocument.data, input);
      if (replay) return replay;
    }
    console.error("generated_document_store_failed", {
      code: stored.error.code,
      path: stored.error.path,
      replayReadCode: concurrentDocument.error?.code,
    });
    return fail("store", stored.error.code);
  }

  return {
    outcome: stored.outcome,
    documentId: stored.documentId,
    documentType: input.documentType,
    title: documentTitle,
    fileName: rendered.fileName,
    filePath: stored.filePath,
    fileSha256: stored.fileSha256,
    version: stored.version,
    templateId: prepared.templateId,
    templateVersion: prepared.templateVersion,
    capturedAt: prepared.snapshot.capturedAt,
    replacesDocumentId,
  };
}
