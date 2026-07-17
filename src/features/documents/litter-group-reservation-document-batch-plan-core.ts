import {
  normalizeDocumentTaxonomy,
  resolveEffectiveReservationDocumentTaxonomy,
} from "./reservation-document-template-compatibility";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SELECTED_RESERVATIONS = 30;

export type LitterGroupDocumentBatchGroupInput = {
  id: string;
  organizationId: string;
  deletedAt: string | null;
};

export type LitterGroupDocumentBatchLitterInput = {
  id: string;
  organizationId: string;
  litterGroupId: string | null;
  species: string | null;
  breed: string | null;
  deletedAt: string | null;
};

type TaxonomyInput = {
  species: string | null;
  breed: string | null;
};

export type LitterGroupDocumentBatchReservationInput = {
  id: string;
  organizationId: string;
  litterId: string | null;
  litterGroupId: string | null;
  status: string;
  contactId: string | null;
  applicationId: string | null;
  animalTaxonomy?: TaxonomyInput | null;
  applicationTaxonomy?: TaxonomyInput | null;
};

export type TaxonomyTemplateSelection = {
  taxonomyKey: string;
  commitmentTemplateId: string;
  contractTemplateId: string;
};

export type LitterGroupDocumentBatchClassificationState =
  | "coherent_exact_litter"
  | "group_only"
  | "reservation_group_mismatch"
  | "litter_outside_group"
  | "litter_missing_or_deleted"
  | "organization_mismatch"
  | "missing_taxonomy"
  | "kernel_pre_ineligible";

export type LitterGroupDocumentBatchPreEligibilityReasonCode =
  | "invalid_status"
  | "missing_contact"
  | "missing_application";

export type LitterGroupDocumentBatchClassification = {
  reservationId: string;
  state: LitterGroupDocumentBatchClassificationState;
  selectable: boolean;
  litterId: string | null;
  taxonomyKey: string | null;
  taxonomy: { species: string; breed: string } | null;
  preEligibilityReasonCodes: LitterGroupDocumentBatchPreEligibilityReasonCode[];
};

export type LitterGroupDocumentBatchPlanReasonCode =
  | "invalid_reservation_id"
  | "reservation_not_found"
  | Exclude<
      LitterGroupDocumentBatchClassificationState,
      "coherent_exact_litter"
    >
  | "missing_template_selection"
  | "ambiguous_template_selection"
  | "missing_commitment_template"
  | "missing_contract_template"
  | "invalid_commitment_template_id"
  | "invalid_contract_template_id";

export type LitterGroupDocumentBatchPlanningResult = {
  reservationId: string | null;
  status: "planned" | "excluded";
  reasonCode?: LitterGroupDocumentBatchPlanReasonCode;
  litterId: string | null;
  taxonomyKey: string | null;
};

export type LitterGroupDocumentBatchPlanPartition = {
  litterId: string;
  taxonomyKey: string;
  taxonomy: { species: string; breed: string };
  reservationIds: string[];
  commitmentTemplateId: string;
  contractTemplateId: string;
};

export type LitterGroupDocumentBatchPlanCounts = {
  rawSelected: number;
  selected: number;
  planned: number;
  excluded: number;
  groupOnly: number;
  incoherentAttachments: number;
  preIneligible: number;
  missingTaxonomy: number;
  missingOrAmbiguousModels: number;
};

export type LitterGroupDocumentBatchPlanResult = {
  status: "success" | "error";
  globalReasonCode?: "invalid_selection_input";
  classifications: LitterGroupDocumentBatchClassification[];
  reservations: LitterGroupDocumentBatchPlanningResult[];
  partitions: LitterGroupDocumentBatchPlanPartition[];
  counts: LitterGroupDocumentBatchPlanCounts;
};

type ClassificationInput = {
  group: LitterGroupDocumentBatchGroupInput;
  litters: LitterGroupDocumentBatchLitterInput[];
  reservations: LitterGroupDocumentBatchReservationInput[];
};

export type BuildLitterGroupDocumentBatchPlanInput = ClassificationInput & {
  selectedReservationIds: unknown[];
  templateSelections: TaxonomyTemplateSelection[];
};

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function buildLitterGroupDocumentTaxonomyKey(taxonomy: TaxonomyInput) {
  return JSON.stringify([
    normalizeDocumentTaxonomy(taxonomy.species ?? ""),
    normalizeDocumentTaxonomy(taxonomy.breed ?? ""),
  ]);
}

function baseClassification(
  reservationId: string,
  state: LitterGroupDocumentBatchClassificationState,
): LitterGroupDocumentBatchClassification {
  return {
    reservationId,
    state,
    selectable: false,
    litterId: null,
    taxonomyKey: null,
    taxonomy: null,
    preEligibilityReasonCodes: [],
  };
}

export function classifyLitterGroupDocumentBatchReservations({
  group,
  litters,
  reservations,
}: ClassificationInput): LitterGroupDocumentBatchClassification[] {
  const littersById = new Map(litters.map((litter) => [litter.id, litter]));

  return reservations.map((reservation) => {
    const reservationId = normalizeUuid(reservation.id) ?? reservation.id;

    if (reservation.organizationId !== group.organizationId) {
      return baseClassification(reservationId, "organization_mismatch");
    }

    if (reservation.litterId === null) {
      return baseClassification(
        reservationId,
        reservation.litterGroupId === group.id
          ? "group_only"
          : "reservation_group_mismatch",
      );
    }

    const litter = littersById.get(reservation.litterId);
    if (!litter || litter.deletedAt !== null) {
      return baseClassification(reservationId, "litter_missing_or_deleted");
    }

    if (litter.organizationId !== group.organizationId) {
      return baseClassification(reservationId, "organization_mismatch");
    }

    if (litter.litterGroupId !== group.id) {
      return baseClassification(reservationId, "litter_outside_group");
    }

    if (reservation.litterGroupId !== group.id) {
      return baseClassification(reservationId, "reservation_group_mismatch");
    }

    const effectiveTaxonomy = resolveEffectiveReservationDocumentTaxonomy({
      animal: reservation.animalTaxonomy,
      litter,
      application: reservation.applicationTaxonomy,
    });
    if (!effectiveTaxonomy) {
      return {
        ...baseClassification(reservationId, "missing_taxonomy"),
        litterId: litter.id,
      };
    }

    const taxonomy = {
      species: effectiveTaxonomy.species,
      breed: effectiveTaxonomy.breed,
    };
    const coherentDetails = {
      litterId: litter.id,
      taxonomy,
      taxonomyKey: buildLitterGroupDocumentTaxonomyKey(taxonomy),
    };
    const preEligibilityReasonCodes: LitterGroupDocumentBatchPreEligibilityReasonCode[] = [];
    if (reservation.status !== "pre_reservation_paid") {
      preEligibilityReasonCodes.push("invalid_status");
    }
    if (!reservation.contactId) {
      preEligibilityReasonCodes.push("missing_contact");
    }
    if (!reservation.applicationId) {
      preEligibilityReasonCodes.push("missing_application");
    }

    if (preEligibilityReasonCodes.length > 0) {
      return {
        ...baseClassification(reservationId, "kernel_pre_ineligible"),
        ...coherentDetails,
        preEligibilityReasonCodes,
      };
    }

    return {
      ...baseClassification(reservationId, "coherent_exact_litter"),
      ...coherentDetails,
      selectable: true,
    };
  });
}

function emptyCounts(rawSelected: number): LitterGroupDocumentBatchPlanCounts {
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

function classifyExclusion(counts: LitterGroupDocumentBatchPlanCounts, reasonCode: LitterGroupDocumentBatchPlanReasonCode) {
  if (reasonCode === "group_only") counts.groupOnly += 1;
  if (
    reasonCode === "reservation_group_mismatch" ||
    reasonCode === "litter_outside_group" ||
    reasonCode === "litter_missing_or_deleted" ||
    reasonCode === "organization_mismatch"
  ) {
    counts.incoherentAttachments += 1;
  }
  if (reasonCode === "kernel_pre_ineligible") counts.preIneligible += 1;
  if (reasonCode === "missing_taxonomy") counts.missingTaxonomy += 1;
  if (
    reasonCode === "missing_template_selection" ||
    reasonCode === "ambiguous_template_selection" ||
    reasonCode === "missing_commitment_template" ||
    reasonCode === "missing_contract_template" ||
    reasonCode === "invalid_commitment_template_id" ||
    reasonCode === "invalid_contract_template_id"
  ) {
    counts.missingOrAmbiguousModels += 1;
  }
}

function modelSelectionReason(
  selections: TaxonomyTemplateSelection[],
): LitterGroupDocumentBatchPlanReasonCode | null {
  if (selections.length === 0) return "missing_template_selection";
  if (selections.length > 1) return "ambiguous_template_selection";
  const selection = selections[0];
  if (!selection.commitmentTemplateId?.trim()) return "missing_commitment_template";
  if (!selection.contractTemplateId?.trim()) return "missing_contract_template";
  if (!normalizeUuid(selection.commitmentTemplateId)) {
    return "invalid_commitment_template_id";
  }
  if (!normalizeUuid(selection.contractTemplateId)) {
    return "invalid_contract_template_id";
  }
  return null;
}

export function buildLitterGroupDocumentBatchPlan(
  input: BuildLitterGroupDocumentBatchPlanInput,
): LitterGroupDocumentBatchPlanResult {
  const classifications = classifyLitterGroupDocumentBatchReservations(input);
  const rawSelected = Array.isArray(input.selectedReservationIds)
    ? input.selectedReservationIds.length
    : 0;
  const counts = emptyCounts(rawSelected);

  if (
    !Array.isArray(input.selectedReservationIds) ||
    rawSelected === 0 ||
    rawSelected > MAX_SELECTED_RESERVATIONS
  ) {
    return {
      status: "error",
      globalReasonCode: "invalid_selection_input",
      classifications,
      reservations: [],
      partitions: [],
      counts,
    };
  }

  const selectionsByTaxonomy = new Map<string, TaxonomyTemplateSelection[]>();
  for (const selection of input.templateSelections) {
    const current = selectionsByTaxonomy.get(selection.taxonomyKey) ?? [];
    current.push(selection);
    selectionsByTaxonomy.set(selection.taxonomyKey, current);
  }

  const classificationsById = new Map(
    classifications.map((classification) => [
      normalizeUuid(classification.reservationId) ?? classification.reservationId,
      classification,
    ]),
  );
  const seenReservationIds = new Set<string>();
  const reservations: LitterGroupDocumentBatchPlanningResult[] = [];
  const partitions: LitterGroupDocumentBatchPlanPartition[] = [];
  const partitionsByKey = new Map<string, LitterGroupDocumentBatchPlanPartition>();

  const exclude = (
    reservationId: string | null,
    reasonCode: LitterGroupDocumentBatchPlanReasonCode,
    details?: Pick<LitterGroupDocumentBatchPlanningResult, "litterId" | "taxonomyKey">,
  ) => {
    counts.excluded += 1;
    classifyExclusion(counts, reasonCode);
    reservations.push({
      reservationId,
      status: "excluded",
      reasonCode,
      litterId: details?.litterId ?? null,
      taxonomyKey: details?.taxonomyKey ?? null,
    });
  };

  for (const rawReservationId of input.selectedReservationIds) {
    const reservationId = normalizeUuid(rawReservationId);
    if (!reservationId) {
      exclude(null, "invalid_reservation_id");
      continue;
    }
    if (seenReservationIds.has(reservationId)) continue;
    seenReservationIds.add(reservationId);

    const classification = classificationsById.get(reservationId);
    if (!classification) {
      exclude(reservationId, "reservation_not_found");
      continue;
    }
    if (classification.state !== "coherent_exact_litter") {
      exclude(reservationId, classification.state);
      continue;
    }

    const details = {
      litterId: classification.litterId,
      taxonomyKey: classification.taxonomyKey,
    };
    const matchingSelections =
      selectionsByTaxonomy.get(classification.taxonomyKey as string) ?? [];
    const selectionReason = modelSelectionReason(matchingSelections);
    if (selectionReason) {
      exclude(reservationId, selectionReason, details);
      continue;
    }

    const selection = matchingSelections[0];
    const litterId = classification.litterId as string;
    const taxonomyKey = classification.taxonomyKey as string;
    const partitionKey = JSON.stringify([litterId, taxonomyKey]);
    let partition = partitionsByKey.get(partitionKey);
    if (!partition) {
      partition = {
        litterId,
        taxonomyKey,
        taxonomy: classification.taxonomy as { species: string; breed: string },
        reservationIds: [],
        commitmentTemplateId: normalizeUuid(selection.commitmentTemplateId) as string,
        contractTemplateId: normalizeUuid(selection.contractTemplateId) as string,
      };
      partitionsByKey.set(partitionKey, partition);
      partitions.push(partition);
    }
    partition.reservationIds.push(reservationId);
    counts.planned += 1;
    reservations.push({
      reservationId,
      status: "planned",
      litterId,
      taxonomyKey,
    });
  }

  counts.selected = reservations.length;
  return {
    status: "success",
    classifications,
    reservations,
    partitions,
    counts,
  };
}
