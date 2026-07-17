import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildLitterGroupDocumentBatchPlan,
  type LitterGroupDocumentBatchClassification,
  type LitterGroupDocumentBatchPlanCounts,
  type LitterGroupDocumentBatchPlanPartition,
  type LitterGroupDocumentBatchPlanReasonCode,
} from "./litter-group-reservation-document-batch-plan-core";
import {
  generateLitterReservationDocumentsBatchCore,
  type DocumentBatchOutcome,
  type LitterReservationDocumentBatchInput,
  type LitterReservationDocumentBatchResult,
} from "./litter-reservation-document-batch-core";
import { isReservationDocumentTemplateCompatible } from "./reservation-document-template-compatibility";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type DocumentCounts = LitterReservationDocumentBatchResult["counts"];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WRITABLE_ROLES = ["owner", "admin", "member"] as const;
const MAX_RESERVATIONS = 30;
const MAX_TEMPLATE_SELECTIONS = 30;
const MAX_OPERATION_ID_LENGTH = 200;
const MAX_TAXONOMY_KEY_LENGTH = 500;

export type LitterGroupReservationDocumentBatchInput = {
  litterGroupId: string;
  reservationIds: unknown[];
  templateSelections: Array<{
    taxonomyKey: string;
    commitmentTemplateId: string;
    contractTemplateId: string;
  }>;
  operationId: string;
  capturedAt: string;
};

export type LitterGroupReservationDocumentBatchGlobalReasonCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "group_not_found"
  | "context_error";

export type LitterGroupReservationDocumentBatchLocalReasonCode =
  | LitterGroupDocumentBatchPlanReasonCode
  | "commitment_template_unavailable"
  | "contract_template_unavailable"
  | "template_selection_incoherent"
  | "partition_error";

export type LitterGroupReservationDocumentBatchReservation = {
  reservationId: string | null;
  litterId?: string;
  taxonomy?: { species: string; breed: string };
  status: "processed" | "excluded";
  reasonCode?: LitterGroupReservationDocumentBatchLocalReasonCode;
  commitment?: DocumentBatchOutcome;
  contract?: DocumentBatchOutcome;
};

export type LitterGroupReservationDocumentBatchLitter = {
  litterId: string;
  reservationCount: number;
  status: "success" | "partial" | "error";
  documentCounts: DocumentCounts;
};

export type LitterGroupReservationDocumentBatchResult = {
  status: "success" | "partial" | "error";
  reasonCode?: LitterGroupReservationDocumentBatchGlobalReasonCode;
  reservations: LitterGroupReservationDocumentBatchReservation[];
  litters: LitterGroupReservationDocumentBatchLitter[];
  planningCounts: LitterGroupDocumentBatchPlanCounts;
  documentCounts: DocumentCounts;
};

export type LitterGroupReservationDocumentBatchDependencies = {
  generateLitterBatch: (
    input: LitterReservationDocumentBatchInput,
    supabase: Supabase,
  ) => Promise<LitterReservationDocumentBatchResult>;
};

const defaultDependencies: LitterGroupReservationDocumentBatchDependencies = {
  generateLitterBatch: generateLitterReservationDocumentsBatchCore,
};

function emptyDocumentCounts(): DocumentCounts {
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

function emptyPlanningCounts(rawSelected = 0): LitterGroupDocumentBatchPlanCounts {
  return {
    rawSelected,
    selected: 0,
    planned: 0,
    excluded: 0,
    groupOnly: 0,
    incoherentAttachments: 0,
    preIneligible: 0,
    missingTaxonomy: 0,
    missingOrAmbiguousModels: 0,
  };
}

function globalFailure(
  reasonCode: LitterGroupReservationDocumentBatchGlobalReasonCode,
  rawSelected = 0,
): LitterGroupReservationDocumentBatchResult {
  return {
    status: "error",
    reasonCode,
    reservations: [],
    litters: [],
    planningCounts: emptyPlanningCounts(rawSelected),
    documentCounts: emptyDocumentCounts(),
  };
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

function normalizeGlobalInput(rawInput: LitterGroupReservationDocumentBatchInput) {
  const litterGroupId = normalizeUuid(rawInput?.litterGroupId);
  const rawReservationCount = Array.isArray(rawInput?.reservationIds)
    ? rawInput.reservationIds.length
    : 0;
  if (
    !litterGroupId ||
    !Array.isArray(rawInput?.reservationIds) ||
    rawReservationCount === 0 ||
    rawReservationCount > MAX_RESERVATIONS ||
    !Array.isArray(rawInput?.templateSelections) ||
    rawInput.templateSelections.length > MAX_TEMPLATE_SELECTIONS ||
    typeof rawInput?.operationId !== "string" ||
    !rawInput.operationId.trim() ||
    rawInput.operationId.length > MAX_OPERATION_ID_LENGTH ||
    !validCapturedAt(rawInput?.capturedAt)
  ) {
    return null;
  }

  for (const selection of rawInput.templateSelections) {
    if (
      !selection ||
      typeof selection !== "object" ||
      typeof selection.taxonomyKey !== "string" ||
      !selection.taxonomyKey.trim() ||
      selection.taxonomyKey.length > MAX_TAXONOMY_KEY_LENGTH ||
      typeof selection.commitmentTemplateId !== "string" ||
      selection.commitmentTemplateId.length > 100 ||
      typeof selection.contractTemplateId !== "string" ||
      selection.contractTemplateId.length > 100
    ) {
      return null;
    }
  }

  return {
    litterGroupId,
    reservationIds: rawInput.reservationIds,
    templateSelections: rawInput.templateSelections,
    operationId: rawInput.operationId,
    capturedAt: rawInput.capturedAt,
    rawReservationCount,
  };
}

function addDocumentCounts(target: DocumentCounts, source: DocumentCounts) {
  for (const key of Object.keys(target) as Array<keyof DocumentCounts>) {
    target[key] += source[key];
  }
}

function genericPartitionOutcome(): DocumentBatchOutcome {
  return { outcome: "error", reasonCode: "generation_error" };
}

function exposedClassificationDetails(
  classification: LitterGroupDocumentBatchClassification | undefined,
) {
  if (
    !classification ||
    !["coherent_exact_litter", "kernel_pre_ineligible", "missing_taxonomy"].includes(
      classification.state,
    )
  ) {
    return {};
  }
  return {
    ...(classification.litterId ? { litterId: classification.litterId } : {}),
    ...(classification.taxonomy ? { taxonomy: classification.taxonomy } : {}),
  };
}

function templateUnavailableReason(
  partition: LitterGroupDocumentBatchPlanPartition,
  templatesById: Map<
    string,
    Database["public"]["Tables"]["document_templates"]["Row"]
  >,
): LitterGroupReservationDocumentBatchLocalReasonCode | null {
  if (partition.commitmentTemplateId === partition.contractTemplateId) {
    return "template_selection_incoherent";
  }
  const commitment = templatesById.get(partition.commitmentTemplateId);
  if (
    !commitment ||
    commitment.lifecycle_status !== "published" ||
    !isReservationDocumentTemplateCompatible({
      template: commitment,
      documentType: "commitment_certificate",
      taxonomy: partition.taxonomy,
    })
  ) {
    return "commitment_template_unavailable";
  }
  const contract = templatesById.get(partition.contractTemplateId);
  if (
    !contract ||
    contract.lifecycle_status !== "published" ||
    !isReservationDocumentTemplateCompatible({
      template: contract,
      documentType: "reservation_contract",
      taxonomy: partition.taxonomy,
    })
  ) {
    return "contract_template_unavailable";
  }
  return null;
}

export async function generateLitterGroupReservationDocumentsBatchCore(
  rawInput: LitterGroupReservationDocumentBatchInput,
  supabase: Supabase,
  dependencies: LitterGroupReservationDocumentBatchDependencies = defaultDependencies,
): Promise<LitterGroupReservationDocumentBatchResult> {
  const input = normalizeGlobalInput(rawInput);
  const rawSelected = Array.isArray(rawInput?.reservationIds)
    ? rawInput.reservationIds.length
    : 0;
  if (!input) return globalFailure("invalid_input", rawSelected);

  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return globalFailure("unauthenticated", input.rawReservationCount);
  }

  const memberships = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null);
  if (memberships.error) {
    console.error("litter_group_document_batch_memberships_read_failed");
    return globalFailure("context_error", input.rawReservationCount);
  }
  const membershipOrganizationIds = [
    ...new Set((memberships.data ?? []).map((membership) => membership.organization_id)),
  ];
  if (membershipOrganizationIds.length === 0) {
    return globalFailure("forbidden", input.rawReservationCount);
  }

  const groupResult = await supabase
    .from("litter_groups")
    .select("id, organization_id, deleted_at")
    .eq("id", input.litterGroupId)
    .in("organization_id", membershipOrganizationIds)
    .is("deleted_at", null)
    .maybeSingle();
  if (groupResult.error) {
    console.error("litter_group_document_batch_group_read_failed");
    return globalFailure("context_error", input.rawReservationCount);
  }
  if (!groupResult.data) {
    return globalFailure("group_not_found", input.rawReservationCount);
  }
  const group = groupResult.data;
  const organizationId = group.organization_id;
  const groupMembership = (memberships.data ?? []).find(
    (membership) => membership.organization_id === organizationId,
  );
  if (
    !groupMembership ||
    !WRITABLE_ROLES.includes(
      groupMembership.role as (typeof WRITABLE_ROLES)[number],
    )
  ) {
    return globalFailure("forbidden", input.rawReservationCount);
  }

  const selectedReservationIds = [
    ...new Set(
      input.reservationIds
        .map(normalizeUuid)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const reservationResult = selectedReservationIds.length
    ? await supabase
        .from("reservations")
        .select(
          "id, organization_id, litter_id, litter_group_id, status, contact_id, application_id, animal_id",
        )
        .eq("organization_id", organizationId)
        .in("id", selectedReservationIds)
        .is("deleted_at", null)
    : { data: [], error: null };
  if (reservationResult.error) {
    console.error("litter_group_document_batch_reservations_read_failed");
    return globalFailure("context_error", input.rawReservationCount);
  }
  const reservations = reservationResult.data ?? [];

  const litterIds = [
    ...new Set(
      reservations
        .map((reservation) => reservation.litter_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const applicationIds = [
    ...new Set(
      reservations
        .map((reservation) => reservation.application_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const animalIds = [
    ...new Set(
      reservations
        .map((reservation) => reservation.animal_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [litterResult, applicationResult, animalResult] = await Promise.all([
    litterIds.length
      ? supabase
          .from("litters")
          .select(
            "id, organization_id, litter_group_id, species, breed, deleted_at",
          )
          .eq("organization_id", organizationId)
          .in("id", litterIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabase
          .from("applications")
          .select("id, organization_id, contact_id, species, breed, deleted_at")
          .eq("organization_id", organizationId)
          .in("id", applicationIds)
      : Promise.resolve({ data: [], error: null }),
    animalIds.length
      ? supabase
          .from("animals")
          .select("id, organization_id, litter_id, species, breed, deleted_at")
          .eq("organization_id", organizationId)
          .in("id", animalIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (litterResult.error || applicationResult.error || animalResult.error) {
    console.error("litter_group_document_batch_relations_read_failed");
    return globalFailure("context_error", input.rawReservationCount);
  }

  const applicationsById = new Map(
    (applicationResult.data ?? []).map((application) => [application.id, application]),
  );
  const animalsById = new Map(
    (animalResult.data ?? []).map((animal) => [animal.id, animal]),
  );
  const planningReservations = reservations.map((reservation) => {
    const application = reservation.application_id
      ? applicationsById.get(reservation.application_id)
      : undefined;
    const animal = reservation.animal_id
      ? animalsById.get(reservation.animal_id)
      : undefined;
    const coherentApplication =
      application &&
      application.deleted_at === null &&
      application.organization_id === organizationId &&
      application.contact_id === reservation.contact_id
        ? application
        : null;
    const coherentAnimal =
      animal &&
      animal.deleted_at === null &&
      animal.organization_id === organizationId &&
      animal.litter_id === reservation.litter_id
        ? animal
        : null;
    return {
      id: reservation.id,
      organizationId: reservation.organization_id,
      litterId: reservation.litter_id,
      litterGroupId: reservation.litter_group_id,
      status: reservation.status,
      contactId: reservation.contact_id,
      applicationId: reservation.application_id,
      animalTaxonomy: coherentAnimal
        ? { species: coherentAnimal.species, breed: coherentAnimal.breed }
        : null,
      applicationTaxonomy: coherentApplication
        ? { species: coherentApplication.species, breed: coherentApplication.breed }
        : null,
    };
  });

  const plan = buildLitterGroupDocumentBatchPlan({
    group: {
      id: group.id,
      organizationId,
      deletedAt: group.deleted_at,
    },
    litters: (litterResult.data ?? []).map((litter) => ({
      id: litter.id,
      organizationId: litter.organization_id,
      litterGroupId: litter.litter_group_id,
      species: litter.species,
      breed: litter.breed,
      deletedAt: litter.deleted_at,
    })),
    reservations: planningReservations,
    selectedReservationIds: input.reservationIds,
    templateSelections: input.templateSelections,
  });
  if (plan.status === "error") {
    return globalFailure("invalid_input", input.rawReservationCount);
  }

  const templateIds = [
    ...new Set(
      plan.partitions.flatMap((partition) => [
        partition.commitmentTemplateId,
        partition.contractTemplateId,
      ]),
    ),
  ];
  const templateResult = templateIds.length
    ? await supabase
        .from("document_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .in("id", templateIds)
    : { data: [], error: null };
  if (templateResult.error) {
    console.error("litter_group_document_batch_templates_read_failed");
    return globalFailure("context_error", input.rawReservationCount);
  }
  const templatesById = new Map(
    (templateResult.data ?? []).map((template) => [template.id, template]),
  );
  const invalidPartitionReasons = new Map<
    string,
    LitterGroupReservationDocumentBatchLocalReasonCode
  >();
  const validPartitions: LitterGroupDocumentBatchPlanPartition[] = [];
  for (const partition of plan.partitions) {
    const reason = templateUnavailableReason(partition, templatesById);
    if (reason) {
      for (const reservationId of partition.reservationIds) {
        invalidPartitionReasons.set(reservationId, reason);
      }
    } else {
      validPartitions.push(partition);
    }
  }

  const classificationsById = new Map(
    plan.classifications.map((classification) => [
      normalizeUuid(classification.reservationId) ?? classification.reservationId,
      classification,
    ]),
  );
  const resultsByReservationId = new Map<
    string,
    Pick<
      LitterGroupReservationDocumentBatchReservation,
      "status" | "reasonCode" | "commitment" | "contract"
    >
  >();
  const documentCounts = emptyDocumentCounts();
  const litterAggregates = new Map<
    string,
    {
      litterId: string;
      reservationCount: number;
      documentCounts: DocumentCounts;
      statuses: Array<"success" | "partial" | "error">;
    }
  >();
  let globallyFailedSubcalls = 0;

  for (const partition of validPartitions) {
    const aggregate = litterAggregates.get(partition.litterId) ?? {
      litterId: partition.litterId,
      reservationCount: 0,
      documentCounts: emptyDocumentCounts(),
      statuses: [],
    };
    aggregate.reservationCount += partition.reservationIds.length;
    litterAggregates.set(partition.litterId, aggregate);

    let subResult: LitterReservationDocumentBatchResult;
    try {
      subResult = await dependencies.generateLitterBatch(
        {
          litterId: partition.litterId,
          reservationIds: partition.reservationIds,
          commitmentTemplateId: partition.commitmentTemplateId,
          contractTemplateId: partition.contractTemplateId,
          operationId: input.operationId,
          capturedAt: input.capturedAt,
        },
        supabase,
      );
    } catch {
      subResult = {
        status: "error",
        reasonCode: "context_error",
        reservations: [],
        counts: emptyDocumentCounts(),
      };
    }
    addDocumentCounts(documentCounts, subResult.counts);
    addDocumentCounts(aggregate.documentCounts, subResult.counts);
    aggregate.statuses.push(subResult.status);

    const subResultsById = new Map(
      subResult.reservations.map((reservation) => [reservation.reservationId, reservation]),
    );
    if (subResult.status === "error" && subResult.reservations.length === 0) {
      globallyFailedSubcalls += 1;
    }
    for (const reservationId of partition.reservationIds) {
      const reservation = subResultsById.get(reservationId);
      if (!reservation) {
        resultsByReservationId.set(reservationId, {
          status: "processed",
          reasonCode: "partition_error",
          commitment: genericPartitionOutcome(),
          contract: genericPartitionOutcome(),
        });
      } else {
        resultsByReservationId.set(reservationId, {
          status: "processed",
          commitment: reservation.commitment,
          contract: reservation.contract,
        });
      }
    }
  }

  const reservationsResult = plan.reservations.map((reservation) => {
    const classification = reservation.reservationId
      ? classificationsById.get(reservation.reservationId)
      : undefined;
    const details = exposedClassificationDetails(classification);
    if (reservation.status === "excluded") {
      return {
        reservationId: reservation.reservationId,
        ...details,
        status: "excluded" as const,
        reasonCode: reservation.reasonCode,
      };
    }
    const templateReason = reservation.reservationId
      ? invalidPartitionReasons.get(reservation.reservationId)
      : undefined;
    if (templateReason) {
      return {
        reservationId: reservation.reservationId,
        ...details,
        status: "excluded" as const,
        reasonCode: templateReason,
      };
    }
    const processed = reservation.reservationId
      ? resultsByReservationId.get(reservation.reservationId)
      : undefined;
    return {
      reservationId: reservation.reservationId,
      ...details,
      ...(processed ?? {
        status: "processed" as const,
        reasonCode: "partition_error" as const,
        commitment: genericPartitionOutcome(),
        contract: genericPartitionOutcome(),
      }),
    };
  });

  const litters = [...litterAggregates.values()].map((aggregate) => {
    const status = aggregate.statuses.every((value) => value === "success")
      ? "success"
      : aggregate.statuses.every((value) => value === "error")
        ? "error"
        : "partial";
    return {
      litterId: aggregate.litterId,
      reservationCount: aggregate.reservationCount,
      status,
      documentCounts: aggregate.documentCounts,
    } satisfies LitterGroupReservationDocumentBatchLitter;
  });

  const hasExclusion = reservationsResult.some(
    (reservation) => reservation.status === "excluded",
  );
  const hasLocalIssue = reservationsResult.some(
    (reservation) =>
      reservation.status === "processed" &&
      (reservation.reasonCode === "partition_error" ||
        !["created", "existing", "already_present", "protected"].includes(
          reservation.commitment?.outcome ?? "error",
        ) ||
        !["created", "existing", "already_present", "protected"].includes(
          reservation.contract?.outcome ?? "error",
        )),
  );
  const allSubcallsFailedGlobally =
    validPartitions.length > 0 &&
    globallyFailedSubcalls === validPartitions.length;
  const status =
    validPartitions.length === 0 || allSubcallsFailedGlobally
      ? "error"
      : hasExclusion || hasLocalIssue
        ? "partial"
        : "success";

  return {
    status,
    reservations: reservationsResult,
    litters,
    planningCounts: plan.counts,
    documentCounts,
  };
}
