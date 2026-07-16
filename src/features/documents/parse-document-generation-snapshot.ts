import {
  DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION,
  DOCUMENT_GENERATION_SNAPSHOT_VERSION,
  documentGenerationSnapshotV1Schema,
  documentGenerationSnapshotV2Schema,
  type DocumentGenerationSnapshot,
  type DocumentGenerationSnapshotType,
} from "./document-generation-snapshot-schemas";

export type ParseDocumentGenerationSnapshotInput = {
  documentType: string;
  generationData: unknown;
};

export type ParseDocumentGenerationSnapshotResult =
  | {
      success: true;
      snapshot: DocumentGenerationSnapshot;
    }
  | {
      success: false;
      error:
        | "unsupported_snapshot_version"
        | "document_type_mismatch"
        | "invalid_snapshot";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupportedDocumentType(
  value: unknown,
): value is DocumentGenerationSnapshotType {
  return value === "reservation_contract" || value === "commitment_certificate";
}

export function parseDocumentGenerationSnapshot({
  documentType,
  generationData,
}: ParseDocumentGenerationSnapshotInput): ParseDocumentGenerationSnapshotResult {
  if (!isRecord(generationData)) {
    return { success: false, error: "invalid_snapshot" };
  }

  if (
    generationData.snapshotVersion !== DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION &&
    generationData.snapshotVersion !== DOCUMENT_GENERATION_SNAPSHOT_VERSION
  ) {
    return { success: false, error: "unsupported_snapshot_version" };
  }

  if (
    isSupportedDocumentType(generationData.documentType) &&
    generationData.documentType !== documentType
  ) {
    return { success: false, error: "document_type_mismatch" };
  }

  const parsedSnapshot = (
    generationData.snapshotVersion === DOCUMENT_GENERATION_SNAPSHOT_V1_VERSION
      ? documentGenerationSnapshotV1Schema
      : documentGenerationSnapshotV2Schema
  ).safeParse(generationData);
  if (!parsedSnapshot.success) {
    return { success: false, error: "invalid_snapshot" };
  }

  if (parsedSnapshot.data.documentType !== documentType) {
    return { success: false, error: "document_type_mismatch" };
  }

  return { success: true, snapshot: parsedSnapshot.data };
}
