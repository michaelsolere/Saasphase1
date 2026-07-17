import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generateAndStoreReservationDocumentPdfCore,
  type GenerateAndStoreReservationDocumentPdfInput,
  type GenerateAndStoreReservationDocumentPdfResult,
} from "./generated-reservation-document-orchestrator-core";
import { parseDocumentGenerationSnapshot } from "./parse-document-generation-snapshot";
import {
  prepareDocumentGenerationSnapshotForReservationCore,
  type PrepareDocumentGenerationSnapshotErrorCode,
  type PrepareDocumentGenerationSnapshotInput,
  type PrepareDocumentGenerationSnapshotResult,
} from "./prepare-document-generation-snapshot-core";
import {
  renderDocumentPdfCore,
  type RenderDocumentPdfErrorCode,
  type RenderDocumentPdfInput,
  type RenderDocumentPdfResult,
} from "./document-pdf-renderer-core";
import {
  readDocumentPdfCore,
  type ReadDocumentPdfResult,
} from "./document-pdf-storage-core";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type SupportedDocumentType = "commitment_certificate" | "reservation_contract";
type ResultKey = "commitment" | "contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WRITABLE_ROLES = ["owner", "admin", "member"] as const;
const MAX_RESERVATIONS = 30;
const MAX_OPERATION_ID_LENGTH = 200;

export type LitterReservationDocumentBatchInput = {
  litterId: string;
  reservationIds: string[];
  commitmentTemplateId: string;
  contractTemplateId: string;
  operationId: string;
  capturedAt: string;
};

export type DocumentBatchOutcomeName =
  | "created"
  | "existing"
  | "already_present"
  | "protected"
  | "ineligible"
  | "missing_data"
  | "invalid_data"
  | "invalid_source"
  | "incoherent_current_document"
  | "error";

export type DocumentBatchReasonCode =
  | "invalid_reservation_id"
  | "reservation_not_found"
  | "reservation_ineligible"
  | "contact_incoherent"
  | "application_incoherent"
  | "multiple_current_documents"
  | "current_document_incoherent"
  | "paired_prevalidation_failed"
  | "incomplete_source_data"
  | "missing_template_variables"
  | "invalid_template_variable_value"
  | "template_not_found"
  | "template_mismatch"
  | "invalid_template"
  | "invalid_template_formatting"
  | "branding_inconsistent"
  | "branding_mismatch"
  | "document_type_mismatch"
  | "template_hash_mismatch"
  | "invalid_snapshot"
  | "current_document_conflict"
  | "document_id_conflict"
  | "database_error"
  | "storage_error"
  | "render_error"
  | "generation_error";

export type LitterReservationDocumentBatchGlobalReasonCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "litter_not_found"
  | "context_error";

export type DocumentBatchOutcome = {
  outcome: DocumentBatchOutcomeName;
  reasonCode?: DocumentBatchReasonCode;
};

export type LitterReservationDocumentBatchResult = {
  status: "success" | "partial" | "error";
  reasonCode?: LitterReservationDocumentBatchGlobalReasonCode;
  reservations: Array<{
    reservationId: string;
    commitment: DocumentBatchOutcome;
    contract: DocumentBatchOutcome;
  }>;
  counts: {
    created: number;
    existing: number;
    alreadyPresent: number;
    protected: number;
    ineligible: number;
    missingData: number;
    invalidData: number;
    invalidSource: number;
    incoherent: number;
    errors: number;
  };
};

export type LitterReservationDocumentBatchDependencies = {
  prepare: (
    input: PrepareDocumentGenerationSnapshotInput,
    supabase: Supabase,
  ) => Promise<PrepareDocumentGenerationSnapshotResult>;
  render: (input: RenderDocumentPdfInput) => Promise<RenderDocumentPdfResult>;
  generate: (
    input: GenerateAndStoreReservationDocumentPdfInput,
    supabase: Supabase,
  ) => Promise<GenerateAndStoreReservationDocumentPdfResult>;
  readPdf: (
    organizationId: string,
    documentId: string,
    supabase: Supabase,
  ) => Promise<ReadDocumentPdfResult>;
};

const defaultDependencies: LitterReservationDocumentBatchDependencies = {
  prepare: prepareDocumentGenerationSnapshotForReservationCore,
  render: renderDocumentPdfCore,
  generate: generateAndStoreReservationDocumentPdfCore,
  readPdf: readDocumentPdfCore,
};

function emptyCounts(): LitterReservationDocumentBatchResult["counts"] {
  return {
    created: 0,
    existing: 0,
    alreadyPresent: 0,
    protected: 0,
    ineligible: 0,
    missingData: 0,
    invalidData: 0,
    invalidSource: 0,
    incoherent: 0,
    errors: 0,
  };
}

function globalFailure(
  reasonCode: LitterReservationDocumentBatchGlobalReasonCode,
): LitterReservationDocumentBatchResult {
  return { status: "error", reasonCode, reservations: [], counts: emptyCounts() };
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function validCapturedAt(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function normalizeGlobalInput(rawInput: LitterReservationDocumentBatchInput) {
  const litterId = normalizeUuid(rawInput?.litterId);
  const commitmentTemplateId = normalizeUuid(rawInput?.commitmentTemplateId);
  const contractTemplateId = normalizeUuid(rawInput?.contractTemplateId);
  const operationId =
    typeof rawInput?.operationId === "string" ? rawInput.operationId : "";
  if (
    !litterId ||
    !commitmentTemplateId ||
    !contractTemplateId ||
    !operationId.trim() ||
    operationId.length > MAX_OPERATION_ID_LENGTH ||
    !validCapturedAt(rawInput?.capturedAt) ||
    !Array.isArray(rawInput?.reservationIds) ||
    rawInput.reservationIds.length === 0 ||
    rawInput.reservationIds.length > MAX_RESERVATIONS
  ) {
    return null;
  }

  const seen = new Set<string>();
  const reservationIds: Array<{ exposed: string; normalized: string | null }> = [];
  for (const value of rawInput.reservationIds as unknown[]) {
    const exposed = typeof value === "string" && value.length <= 100 ? value.trim() : "";
    const normalized = normalizeUuid(value);
    const key = normalized ?? `invalid:${exposed}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reservationIds.push({ exposed: normalized ?? exposed, normalized });
  }

  return {
    litterId,
    commitmentTemplateId,
    contractTemplateId,
    operationId,
    capturedAt: rawInput.capturedAt,
    reservationIds,
  };
}

export function deriveLitterReservationDocumentId(input: {
  organizationId: string;
  operationId: string;
  reservationId: string;
  documentType: SupportedDocumentType;
}) {
  const characters = createHash("sha256")
    .update(
      JSON.stringify([
        "litter_reservation_document_batch",
        input.organizationId,
        input.operationId,
        input.reservationId,
        input.documentType,
      ]),
    )
    .digest("hex")
    .slice(0, 32)
    .split("");
  characters[12] = "5";
  characters[16] = (
    (Number.parseInt(characters[16], 16) & 0x3) |
    0x8
  ).toString(16);
  const value = characters.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function neutralIneligible(reasonCode: DocumentBatchReasonCode) {
  return {
    commitment: { outcome: "ineligible", reasonCode } as DocumentBatchOutcome,
    contract: { outcome: "ineligible", reasonCode } as DocumentBatchOutcome,
  };
}

function mapPreparationError(
  code: PrepareDocumentGenerationSnapshotErrorCode,
): DocumentBatchOutcome {
  if (code === "incomplete_source_data") {
    return { outcome: "missing_data", reasonCode: "incomplete_source_data" };
  }
  if (
    code === "template_not_found" ||
    code === "template_mismatch" ||
    code === "invalid_template" ||
    code === "invalid_template_formatting" ||
    code === "branding_inconsistent"
  ) {
    return { outcome: "invalid_source", reasonCode: code };
  }
  return { outcome: "error", reasonCode: "database_error" };
}

function mapRenderError(code: RenderDocumentPdfErrorCode): DocumentBatchOutcome {
  if (code === "missing_template_variables") {
    return { outcome: "missing_data", reasonCode: code };
  }
  if (code === "invalid_template_variable_value") {
    return { outcome: "invalid_data", reasonCode: code };
  }
  if (
    code === "invalid_template" ||
    code === "invalid_template_formatting" ||
    code === "document_type_mismatch" ||
    code === "template_hash_mismatch" ||
    code === "branding_mismatch" ||
    code === "invalid_snapshot"
  ) {
    return { outcome: "invalid_source", reasonCode: code };
  }
  return { outcome: "error", reasonCode: "render_error" };
}

function mapGenerationError(
  result: Extract<GenerateAndStoreReservationDocumentPdfResult, { outcome: "error" }>,
): DocumentBatchOutcome {
  if (result.error.stage === "prepare") {
    return mapPreparationError(
      result.error.code as PrepareDocumentGenerationSnapshotErrorCode,
    );
  }
  if (result.error.stage === "render") {
    return mapRenderError(result.error.code as RenderDocumentPdfErrorCode);
  }
  if (result.error.code === "current_document_conflict") {
    return { outcome: "error", reasonCode: "current_document_conflict" };
  }
  if (result.error.code === "document_id_conflict") {
    return { outcome: "incoherent_current_document", reasonCode: "document_id_conflict" };
  }
  if (result.error.code === "storage_error") {
    return { outcome: "error", reasonCode: "storage_error" };
  }
  return { outcome: "error", reasonCode: "generation_error" };
}

function sameInstant(left: string | null, right: string) {
  return Boolean(left && Date.parse(left) === Date.parse(right));
}

async function coherentCurrentDocument(
  document: DocumentRow,
  context: {
    organizationId: string;
    reservationId: string;
    contactId: string;
    applicationId: string;
    litterId: string;
    documentType: SupportedDocumentType;
  },
  supabase: Supabase,
  dependencies: LitterReservationDocumentBatchDependencies,
) {
  if (
    document.organization_id !== context.organizationId ||
    document.reservation_id !== context.reservationId ||
    document.contact_id !== context.contactId ||
    document.application_id !== context.applicationId ||
    document.litter_id !== context.litterId ||
    document.litter_group_id !== null ||
    document.document_type !== context.documentType ||
    document.deleted_at !== null ||
    document.superseded_at !== null ||
    !document.generated_from_template ||
    !document.signature_required ||
    !["generated", "sent", "signed"].includes(document.status) ||
    !document.title.trim() ||
    !document.file_sha256 ||
    document.file_name !== `${document.file_sha256}.pdf`
  ) {
    return false;
  }

  const parsed = parseDocumentGenerationSnapshot({
    documentType: document.document_type,
    generationData: document.generation_data,
  });
  if (!parsed.success) return false;
  const snapshot = parsed.snapshot;
  const templateMatches =
    snapshot.snapshotVersion === 1
      ? snapshot.template.templateId === document.template_id &&
        snapshot.template.templateVersion === document.source_template_version &&
        document.reservation_document_variant_version_id === null
      : snapshot.template.templateId === document.template_id &&
        snapshot.template.templateVersion === document.source_template_version &&
        snapshot.template.reservationDocumentVariantVersionId ===
          document.reservation_document_variant_version_id;
  if (
    !templateMatches ||
    snapshot.sources.organizationId !== context.organizationId ||
    snapshot.sources.reservationId !== context.reservationId ||
    snapshot.sources.contactId !== context.contactId ||
    snapshot.sources.applicationId !== context.applicationId ||
    snapshot.sources.litterId !== context.litterId ||
    snapshot.documentType !== context.documentType ||
    !sameInstant(document.generated_at, snapshot.capturedAt)
  ) {
    return false;
  }

  const read = await dependencies.readPdf(
    context.organizationId,
    document.id,
    supabase,
  );
  return (
    read.outcome === "success" &&
    read.bytes.byteLength === document.file_size_bytes
  );
}

async function classifyCurrent(
  rows: DocumentRow[],
  context: {
    organizationId: string;
    reservationId: string;
    contactId: string;
    applicationId: string;
    litterId: string;
    documentType: SupportedDocumentType;
    deterministicDocumentId: string;
  },
  supabase: Supabase,
  dependencies: LitterReservationDocumentBatchDependencies,
): Promise<{ state: "missing" | "same_operation"; outcome?: DocumentBatchOutcome }> {
  if (rows.length === 0) return { state: "missing" };
  if (rows.length > 1) {
    return {
      state: "missing",
      outcome: {
        outcome: "incoherent_current_document",
        reasonCode: "multiple_current_documents",
      },
    };
  }
  const current = rows[0];
  if (
    !(await coherentCurrentDocument(current, context, supabase, dependencies))
  ) {
    return {
      state: "missing",
      outcome: {
        outcome: "incoherent_current_document",
        reasonCode: "current_document_incoherent",
      },
    };
  }
  if (current.status === "sent" || current.status === "signed") {
    return { state: "missing", outcome: { outcome: "protected" } };
  }
  if (current.id === context.deterministicDocumentId) {
    return { state: "same_operation" };
  }
  return { state: "missing", outcome: { outcome: "already_present" } };
}

async function readCurrentRows(
  organizationId: string,
  reservationId: string,
  supabase: Supabase,
) {
  return supabase
    .from("documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reservation_id", reservationId)
    .in("document_type", ["commitment_certificate", "reservation_contract"])
    .is("deleted_at", null)
    .is("superseded_at", null);
}

function rowsForType(rows: DocumentRow[], documentType: SupportedDocumentType) {
  return rows.filter((row) => row.document_type === documentType);
}

async function prevalidate(
  input: PrepareDocumentGenerationSnapshotInput,
  supabase: Supabase,
  dependencies: LitterReservationDocumentBatchDependencies,
) {
  const prepared = await dependencies.prepare(input, supabase);
  if (prepared.outcome === "error") return mapPreparationError(prepared.error.code);
  const rendered = await dependencies.render({
    documentType: input.documentType,
    snapshot: prepared.snapshot,
    templateContent: prepared.templateContent,
    logoBytes: prepared.logoBytes,
  });
  return rendered.outcome === "error" ? mapRenderError(rendered.error.code) : null;
}

function updateCounts(
  counts: LitterReservationDocumentBatchResult["counts"],
  outcome: DocumentBatchOutcomeName,
) {
  const key: Record<
    DocumentBatchOutcomeName,
    keyof LitterReservationDocumentBatchResult["counts"]
  > = {
    created: "created",
    existing: "existing",
    already_present: "alreadyPresent",
    protected: "protected",
    ineligible: "ineligible",
    missing_data: "missingData",
    invalid_data: "invalidData",
    invalid_source: "invalidSource",
    incoherent_current_document: "incoherent",
    error: "errors",
  };
  counts[key[outcome]] += 1;
}

export async function generateLitterReservationDocumentsBatchCore(
  rawInput: LitterReservationDocumentBatchInput,
  supabase: Supabase,
  dependencies: LitterReservationDocumentBatchDependencies = defaultDependencies,
): Promise<LitterReservationDocumentBatchResult> {
  const input = normalizeGlobalInput(rawInput);
  if (!input) return globalFailure("invalid_input");

  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) return globalFailure("unauthenticated");
  const memberships = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", [...WRITABLE_ROLES]);
  if (memberships.error) {
    console.error("litter_document_batch_memberships_read_failed", memberships.error);
    return globalFailure("context_error");
  }
  const organizationIds = [
    ...new Set((memberships.data ?? []).map((membership) => membership.organization_id)),
  ];
  if (organizationIds.length === 0) return globalFailure("forbidden");

  const litterResult = await supabase
    .from("litters")
    .select("id, organization_id")
    .eq("id", input.litterId)
    .in("organization_id", organizationIds)
    .is("deleted_at", null)
    .maybeSingle();
  if (litterResult.error) {
    console.error("litter_document_batch_litter_read_failed", litterResult.error);
    return globalFailure("context_error");
  }
  if (!litterResult.data) return globalFailure("litter_not_found");
  const organizationId = litterResult.data.organization_id;

  const reservations: LitterReservationDocumentBatchResult["reservations"] = [];
  for (const candidate of input.reservationIds) {
    if (!candidate.normalized) {
      reservations.push({
        reservationId: candidate.exposed,
        ...neutralIneligible("invalid_reservation_id"),
      });
      continue;
    }
    const reservationId = candidate.normalized;
    const reservationResult = await supabase
      .from("reservations")
      .select("id, organization_id, contact_id, application_id, litter_id, status, deleted_at")
      .eq("id", reservationId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (reservationResult.error) {
      console.error("litter_document_batch_reservation_read_failed", reservationResult.error);
      reservations.push({
        reservationId,
        commitment: { outcome: "error", reasonCode: "database_error" },
        contract: { outcome: "error", reasonCode: "database_error" },
      });
      continue;
    }
    const reservation = reservationResult.data;
    if (!reservation) {
      reservations.push({
        reservationId,
        ...neutralIneligible("reservation_not_found"),
      });
      continue;
    }
    if (
      reservation.deleted_at !== null ||
      reservation.litter_id !== input.litterId ||
      reservation.status !== "pre_reservation_paid" ||
      !reservation.contact_id ||
      !reservation.application_id
    ) {
      reservations.push({
        reservationId,
        ...neutralIneligible("reservation_ineligible"),
      });
      continue;
    }

    const [contactResult, applicationResult] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, organization_id, deleted_at")
        .eq("id", reservation.contact_id)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("applications")
        .select("id, organization_id, contact_id, deleted_at")
        .eq("id", reservation.application_id)
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);
    if (contactResult.error || applicationResult.error) {
      console.error(
        "litter_document_batch_relations_read_failed",
        contactResult.error ?? applicationResult.error,
      );
      reservations.push({
        reservationId,
        commitment: { outcome: "error", reasonCode: "database_error" },
        contract: { outcome: "error", reasonCode: "database_error" },
      });
      continue;
    }
    if (!contactResult.data || contactResult.data.deleted_at !== null) {
      reservations.push({
        reservationId,
        ...neutralIneligible("contact_incoherent"),
      });
      continue;
    }
    if (
      !applicationResult.data ||
      applicationResult.data.deleted_at !== null ||
      applicationResult.data.contact_id !== reservation.contact_id
    ) {
      reservations.push({
        reservationId,
        ...neutralIneligible("application_incoherent"),
      });
      continue;
    }

    const documentIds = {
      commitment: deriveLitterReservationDocumentId({
        organizationId,
        operationId: input.operationId,
        reservationId,
        documentType: "commitment_certificate",
      }),
      contract: deriveLitterReservationDocumentId({
        organizationId,
        operationId: input.operationId,
        reservationId,
        documentType: "reservation_contract",
      }),
    };
    const currentResult = await readCurrentRows(
      organizationId,
      reservationId,
      supabase,
    );
    if (currentResult.error) {
      console.error("litter_document_batch_current_read_failed", currentResult.error);
      reservations.push({
        reservationId,
        commitment: { outcome: "error", reasonCode: "database_error" },
        contract: { outcome: "error", reasonCode: "database_error" },
      });
      continue;
    }
    const currentRows = currentResult.data ?? [];
    const definitions: Array<{
      key: ResultKey;
      documentType: SupportedDocumentType;
      templateId: string;
      documentId: string;
    }> = [
      {
        key: "commitment",
        documentType: "commitment_certificate",
        templateId: input.commitmentTemplateId,
        documentId: documentIds.commitment,
      },
      {
        key: "contract",
        documentType: "reservation_contract",
        templateId: input.contractTemplateId,
        documentId: documentIds.contract,
      },
    ];
    const outcomes: Partial<Record<ResultKey, DocumentBatchOutcome>> = {};
    const toGenerate: typeof definitions = [];
    for (const definition of definitions) {
      const classified = await classifyCurrent(
        rowsForType(currentRows, definition.documentType),
        {
          organizationId,
          reservationId,
          contactId: reservation.contact_id,
          applicationId: reservation.application_id,
          litterId: input.litterId,
          documentType: definition.documentType,
          deterministicDocumentId: definition.documentId,
        },
        supabase,
        dependencies,
      );
      if (classified.outcome) outcomes[definition.key] = classified.outcome;
      else if (classified.state === "same_operation") {
        const replay = await dependencies.generate(
          {
            documentId: definition.documentId,
            reservationId,
            documentType: definition.documentType,
            templateId: definition.templateId,
            capturedAt: input.capturedAt,
            currentDocumentPolicy: "create_only",
          },
          supabase,
        );
        outcomes[definition.key] =
          replay.outcome === "error"
            ? mapGenerationError(replay)
            : { outcome: "existing" };
      } else toGenerate.push(definition);
    }

    const prevalidationFailures = new Map<ResultKey, DocumentBatchOutcome>();
    for (const definition of toGenerate) {
      const failure = await prevalidate(
        {
          reservationId,
          documentType: definition.documentType,
          templateId: definition.templateId,
          capturedAt: input.capturedAt,
        },
        supabase,
        dependencies,
      );
      if (failure) prevalidationFailures.set(definition.key, failure);
    }
    if (prevalidationFailures.size > 0) {
      for (const definition of toGenerate) {
        outcomes[definition.key] =
          prevalidationFailures.get(definition.key) ?? {
            outcome: "error",
            reasonCode: "paired_prevalidation_failed",
          };
      }
    } else {
      for (const definition of toGenerate) {
        const generated = await dependencies.generate(
          {
            documentId: definition.documentId,
            reservationId,
            documentType: definition.documentType,
            templateId: definition.templateId,
            capturedAt: input.capturedAt,
            currentDocumentPolicy: "create_only",
          },
          supabase,
        );
        if (generated.outcome !== "error") {
          outcomes[definition.key] = { outcome: generated.outcome };
          continue;
        }

        const afterRace = await readCurrentRows(
          organizationId,
          reservationId,
          supabase,
        );
        if (!afterRace.error) {
          const classified = await classifyCurrent(
            rowsForType(afterRace.data ?? [], definition.documentType),
            {
              organizationId,
              reservationId,
              contactId: reservation.contact_id,
              applicationId: reservation.application_id,
              litterId: input.litterId,
              documentType: definition.documentType,
              deterministicDocumentId: definition.documentId,
            },
            supabase,
            dependencies,
          );
          if (classified.outcome) {
            outcomes[definition.key] = classified.outcome;
            continue;
          }
          if (classified.state === "same_operation") {
            const replay = await dependencies.generate(
              {
                documentId: definition.documentId,
                reservationId,
                documentType: definition.documentType,
                templateId: definition.templateId,
                capturedAt: input.capturedAt,
                currentDocumentPolicy: "create_only",
              },
              supabase,
            );
            outcomes[definition.key] =
              replay.outcome === "error"
                ? mapGenerationError(replay)
                : { outcome: "existing" };
            continue;
          }
        }
        outcomes[definition.key] = mapGenerationError(generated);
      }
    }

    reservations.push({
      reservationId,
      commitment: outcomes.commitment!,
      contract: outcomes.contract!,
    });
  }

  const counts = emptyCounts();
  for (const reservation of reservations) {
    updateCounts(counts, reservation.commitment.outcome);
    updateCounts(counts, reservation.contract.outcome);
  }
  const accepted = new Set<DocumentBatchOutcomeName>([
    "created",
    "existing",
    "already_present",
    "protected",
  ]);
  const status = reservations.every(
    (reservation) =>
      accepted.has(reservation.commitment.outcome) &&
      accepted.has(reservation.contract.outcome),
  )
    ? "success"
    : "partial";
  return { status, reservations, counts };
}
