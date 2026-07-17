import { expect, test } from "@playwright/test";

import {
  buildLitterGroupDocumentBatchPlan,
  buildLitterGroupDocumentTaxonomyKey,
  classifyLitterGroupDocumentBatchReservations,
  type BuildLitterGroupDocumentBatchPlanInput,
  type LitterGroupDocumentBatchLitterInput,
  type LitterGroupDocumentBatchReservationInput,
  type TaxonomyTemplateSelection,
} from "../../src/features/documents/litter-group-reservation-document-batch-plan-core";

const id = (suffix: number) =>
  `a7100000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const ids = {
  organization: id(1),
  foreignOrganization: id(2),
  group: id(3),
  otherGroup: id(4),
  litter: id(5),
  secondLitter: id(6),
  outsideLitter: id(7),
  deletedLitter: id(8),
  foreignLitter: id(9),
  contact: id(10),
  application: id(11),
  commitmentTemplate: id(12),
  contractTemplate: id(13),
  secondCommitmentTemplate: id(14),
  secondContractTemplate: id(15),
} as const;

const group = {
  id: ids.group,
  organizationId: ids.organization,
  deletedAt: null,
};

function litter(
  overrides: Partial<LitterGroupDocumentBatchLitterInput> = {},
): LitterGroupDocumentBatchLitterInput {
  return {
    id: ids.litter,
    organizationId: ids.organization,
    litterGroupId: ids.group,
    species: "dog",
    breed: "Golden Retriever",
    deletedAt: null,
    ...overrides,
  };
}

function reservation(
  suffix: number,
  overrides: Partial<LitterGroupDocumentBatchReservationInput> = {},
): LitterGroupDocumentBatchReservationInput {
  return {
    id: id(100 + suffix),
    organizationId: ids.organization,
    litterId: ids.litter,
    litterGroupId: ids.group,
    status: "pre_reservation_paid",
    contactId: ids.contact,
    applicationId: ids.application,
    animalTaxonomy: null,
    applicationTaxonomy: { species: "dog", breed: "Golden Retriever" },
    ...overrides,
  };
}

function taxonomyKey(species = "dog", breed = "Golden Retriever") {
  return buildLitterGroupDocumentTaxonomyKey({ species, breed });
}

function templates(
  overrides: Partial<TaxonomyTemplateSelection> = {},
): TaxonomyTemplateSelection {
  return {
    taxonomyKey: taxonomyKey(),
    commitmentTemplateId: ids.commitmentTemplate,
    contractTemplateId: ids.contractTemplate,
    ...overrides,
  };
}

function planInput(
  reservations: LitterGroupDocumentBatchReservationInput[],
  overrides: Partial<BuildLitterGroupDocumentBatchPlanInput> = {},
): BuildLitterGroupDocumentBatchPlanInput {
  return {
    group,
    litters: [litter()],
    reservations,
    selectedReservationIds: reservations.map((item) => item.id),
    templateSelections: [templates()],
    ...overrides,
  };
}

function classification(
  item: LitterGroupDocumentBatchReservationInput,
  litters = [litter()],
) {
  return classifyLitterGroupDocumentBatchReservations({
    group,
    litters,
    reservations: [item],
  })[0];
}

test.describe("classification pure des réservations d'un groupe de portées", () => {
  test("classe une portée exacte cohérente comme sélectionnable", () => {
    expect(classification(reservation(1))).toMatchObject({
      state: "coherent_exact_litter",
      selectable: true,
      litterId: ids.litter,
      taxonomyKey: taxonomyKey(),
      taxonomy: { species: "dog", breed: "Golden Retriever" },
    });
  });

  test("conserve une réservation groupe-seul visible mais non sélectionnable", () => {
    expect(
      classification(reservation(2, { litterId: null })),
    ).toMatchObject({ state: "group_only", selectable: false, litterId: null });
  });

  test("classe le groupe absent ou différent de la réservation", () => {
    for (const litterGroupId of [null, ids.otherGroup]) {
      expect(classification(reservation(3, { litterGroupId })).state).toBe(
        "reservation_group_mismatch",
      );
    }
  });

  test("classe une portée extérieure au groupe", () => {
    const outside = litter({
      id: ids.outsideLitter,
      litterGroupId: ids.otherGroup,
    });
    expect(
      classification(reservation(4, { litterId: outside.id }), [outside]).state,
    ).toBe("litter_outside_group");
  });

  test("classe une portée supprimée", () => {
    const deleted = litter({ id: ids.deletedLitter, deletedAt: "2026-07-17" });
    expect(
      classification(reservation(5, { litterId: deleted.id }), [deleted]).state,
    ).toBe("litter_missing_or_deleted");
  });

  test("classe une portée introuvable", () => {
    expect(classification(reservation(6), []).state).toBe(
      "litter_missing_or_deleted",
    );
  });

  test("neutralise une organisation incohérente sur la réservation", () => {
    expect(
      classification(
        reservation(7, { organizationId: ids.foreignOrganization }),
      ),
    ).toEqual({
      reservationId: reservation(7).id,
      state: "organization_mismatch",
      selectable: false,
      litterId: null,
      taxonomyKey: null,
      taxonomy: null,
      preEligibilityReasonCodes: [],
    });
  });

  test("neutralise l'identifiant et la taxonomie d'une portée d'une autre organisation", () => {
    const foreign = litter({
      id: ids.foreignLitter,
      organizationId: ids.foreignOrganization,
      species: "cat",
      breed: "Secret Breed",
    });
    const result = classification(
      reservation(8, { litterId: foreign.id }),
      [foreign],
    );
    expect(result).toMatchObject({
      state: "organization_mismatch",
      litterId: null,
      taxonomyKey: null,
      taxonomy: null,
    });
    expect(JSON.stringify(result)).not.toContain("Secret Breed");
    expect(JSON.stringify(result)).not.toContain(ids.foreignLitter);
  });

  test("distingue le statut, le contact et la candidature pré-inéligibles", () => {
    expect(
      classification(reservation(9, { status: "active" }))
        .preEligibilityReasonCodes,
    ).toEqual(["invalid_status"]);
    expect(
      classification(reservation(10, { contactId: null }))
        .preEligibilityReasonCodes,
    ).toEqual(["missing_contact"]);
    expect(
      classification(reservation(11, { applicationId: null }))
        .preEligibilityReasonCodes,
    ).toEqual(["missing_application"]);
  });

  test("résout la taxonomie animal avant portée", () => {
    expect(
      classification(
        reservation(12, {
          animalTaxonomy: { species: "cat", breed: "Maine Coon" },
        }),
      ).taxonomy,
    ).toEqual({ species: "cat", breed: "Maine Coon" });
  });

  test("résout la taxonomie portée avant candidature", () => {
    expect(
      classification(
        reservation(13, {
          applicationTaxonomy: { species: "cat", breed: "Maine Coon" },
        }),
      ).taxonomy,
    ).toEqual({ species: "dog", breed: "Golden Retriever" });
  });

  test("utilise la candidature en fallback lorsque la portée est incomplète", () => {
    const incompleteLitter = litter({ species: null, breed: null });
    expect(
      classification(
        reservation(14, {
          applicationTaxonomy: { species: "cat", breed: "Maine Coon" },
        }),
        [incompleteLitter],
      ).taxonomy,
    ).toEqual({ species: "cat", breed: "Maine Coon" });
  });

  test("rend une taxonomie incomplète non sélectionnable", () => {
    const result = classification(
      reservation(15, {
        applicationTaxonomy: { species: null, breed: null },
      }),
      [litter({ breed: null })],
    );
    expect(result).toMatchObject({
      state: "missing_taxonomy",
      selectable: false,
      taxonomyKey: null,
    });
  });

  test("normalise casse, espaces et accents dans une clé non ambiguë", () => {
    expect(taxonomyKey("  ChIÉN ", " Épagneul BrÉton  ")).toBe(
      JSON.stringify(["chien", "epagneul breton"]),
    );
  });
});

test.describe("sélection et modèles du plan pur", () => {
  test("normalise les UUID sélectionnés en minuscules", () => {
    const item = reservation(20);
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([item], { selectedReservationIds: [item.id.toUpperCase()] }),
    );
    expect(result.reservations[0].reservationId).toBe(item.id);
    expect(result.partitions[0].reservationIds).toEqual([item.id]);
  });

  test("déduplique les UUID de casse différente en gardant la première place", () => {
    const first = reservation(21);
    const second = reservation(22);
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([first, second], {
        selectedReservationIds: [first.id.toUpperCase(), second.id, first.id],
      }),
    );
    expect(result.reservations.map((item) => item.reservationId)).toEqual([
      first.id,
      second.id,
    ]);
  });

  test("refuse globalement zéro sélection", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([], { selectedReservationIds: [] }),
    );
    expect(result).toMatchObject({
      status: "error",
      globalReasonCode: "invalid_selection_input",
      partitions: [],
      reservations: [],
    });
  });

  test("accepte 30 valeurs brutes", () => {
    const reservations = Array.from({ length: 30 }, (_, index) =>
      reservation(100 + index),
    );
    const result = buildLitterGroupDocumentBatchPlan(planInput(reservations));
    expect(result.status).toBe("success");
    expect(result.counts).toMatchObject({ rawSelected: 30, selected: 30, planned: 30 });
  });

  test("refuse 31 valeurs brutes sans troncature", () => {
    const reservations = Array.from({ length: 31 }, (_, index) =>
      reservation(140 + index),
    );
    const result = buildLitterGroupDocumentBatchPlan(planInput(reservations));
    expect(result).toMatchObject({
      status: "error",
      globalReasonCode: "invalid_selection_input",
      reservations: [],
      partitions: [],
      counts: { rawSelected: 31, selected: 0, planned: 0 },
    });
  });

  test("exclut un identifiant invalide de façon neutre", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([], { selectedReservationIds: ["not-an-id"] }),
    );
    expect(result.reservations).toEqual([
      {
        reservationId: null,
        status: "excluded",
        reasonCode: "invalid_reservation_id",
        litterId: null,
        taxonomyKey: null,
      },
    ]);
  });

  test("exclut un UUID introuvable de façon neutre", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([], { selectedReservationIds: [id(999)] }),
    );
    expect(result.reservations[0]).toEqual({
      reservationId: id(999),
      status: "excluded",
      reasonCode: "reservation_not_found",
      litterId: null,
      taxonomyKey: null,
    });
  });

  test("planifie avec une paire de modèles complète", () => {
    const result = buildLitterGroupDocumentBatchPlan(planInput([reservation(23)]));
    expect(result).toMatchObject({
      status: "success",
      counts: { planned: 1, excluded: 0 },
      partitions: [
        {
          commitmentTemplateId: ids.commitmentTemplate,
          contractTemplateId: ids.contractTemplate,
        },
      ],
    });
  });

  test("exclut localement un certificat manquant", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([reservation(24)], {
        templateSelections: [templates({ commitmentTemplateId: "" })],
      }),
    );
    expect(result.reservations[0].reasonCode).toBe("missing_commitment_template");
  });

  test("exclut localement un contrat manquant", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([reservation(25)], {
        templateSelections: [templates({ contractTemplateId: "" })],
      }),
    );
    expect(result.reservations[0].reasonCode).toBe("missing_contract_template");
  });

  test("exclut une clé de taxonomie dupliquée comme ambiguë", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([reservation(26)], {
        templateSelections: [templates(), templates()],
      }),
    );
    expect(result.reservations[0].reasonCode).toBe(
      "ambiguous_template_selection",
    );
  });

  test("exclut localement un UUID de modèle invalide", () => {
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([reservation(27)], {
        templateSelections: [templates({ contractTemplateId: "invalid" })],
      }),
    );
    expect(result.reservations[0].reasonCode).toBe(
      "invalid_contract_template_id",
    );
  });

  test("une taxonomie sans paire n'empêche pas une autre taxonomie", () => {
    const golden = reservation(28);
    const maineCoon = reservation(29, {
      animalTaxonomy: { species: "cat", breed: "Maine Coon" },
    });
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([maineCoon, golden]),
    );
    expect(result.reservations.map((item) => item.status)).toEqual([
      "excluded",
      "planned",
    ]);
    expect(result.reservations[0].reasonCode).toBe("missing_template_selection");
    expect(result.partitions[0].reservationIds).toEqual([golden.id]);
  });
});

test.describe("partitionnement stable et résultat", () => {
  test("sépare une même taxonomie sur deux portées", () => {
    const first = reservation(30);
    const second = reservation(31, { litterId: ids.secondLitter });
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([first, second], {
        litters: [litter(), litter({ id: ids.secondLitter })],
      }),
    );
    expect(result.partitions.map((partition) => partition.litterId)).toEqual([
      ids.litter,
      ids.secondLitter,
    ]);
  });

  test("sépare deux taxonomies dans une même portée", () => {
    const dog = reservation(32);
    const cat = reservation(33, {
      animalTaxonomy: { species: "cat", breed: "Maine Coon" },
    });
    const catKey = taxonomyKey("cat", "Maine Coon");
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([dog, cat], {
        templateSelections: [
          templates(),
          templates({
            taxonomyKey: catKey,
            commitmentTemplateId: ids.secondCommitmentTemplate,
            contractTemplateId: ids.secondContractTemplate,
          }),
        ],
      }),
    );
    expect(result.partitions.map((partition) => partition.taxonomyKey)).toEqual([
      taxonomyKey(),
      catKey,
    ]);
  });

  test("ordonne les partitions selon la première apparition dans la sélection", () => {
    const first = reservation(34, { litterId: ids.secondLitter });
    const second = reservation(35);
    const third = reservation(36, { litterId: ids.secondLitter });
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([second, first, third], {
        litters: [litter(), litter({ id: ids.secondLitter })],
        selectedReservationIds: [first.id, second.id, third.id],
      }),
    );
    expect(result.partitions.map((partition) => partition.litterId)).toEqual([
      ids.secondLitter,
      ids.litter,
    ]);
    expect(result.partitions[0].reservationIds).toEqual([first.id, third.id]);
  });

  test("conserve l'ordre final identique à la sélection dédupliquée", () => {
    const first = reservation(37);
    const excluded = reservation(38, { litterId: null });
    const last = reservation(39);
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([first, excluded, last], {
        selectedReservationIds: [last.id, excluded.id, first.id, last.id],
      }),
    );
    expect(result.reservations.map((item) => item.reservationId)).toEqual([
      last.id,
      excluded.id,
      first.id,
    ]);
  });

  test("retourne des compteurs exacts", () => {
    const planned = reservation(40);
    const groupOnly = reservation(41, { litterId: null });
    const mismatch = reservation(42, { litterGroupId: null });
    const preIneligible = reservation(43, { status: "active" });
    const missingTaxonomy = reservation(44, {
      animalTaxonomy: { species: "cat", breed: "" },
    });
    const missingModels = reservation(45, {
      animalTaxonomy: { species: "cat", breed: "Maine Coon" },
    });
    const result = buildLitterGroupDocumentBatchPlan(
      planInput(
        [
          planned,
          groupOnly,
          mismatch,
          preIneligible,
          missingTaxonomy,
          missingModels,
        ],
        {
          selectedReservationIds: [
            planned.id,
            groupOnly.id,
            mismatch.id,
            preIneligible.id,
            missingTaxonomy.id,
            missingModels.id,
            "invalid",
            id(998),
          ],
        },
      ),
    );
    expect(result.counts).toEqual({
      rawSelected: 8,
      selected: 8,
      planned: 1,
      excluded: 7,
      groupOnly: 1,
      incoherentAttachments: 1,
      preIneligible: 1,
      missingTaxonomy: 1,
      missingOrAmbiguousModels: 1,
    });
  });

  test("n'expose aucune donnée étrangère ni propriété documentaire technique", () => {
    const foreign = litter({
      id: ids.foreignLitter,
      organizationId: ids.foreignOrganization,
      species: "cat",
      breed: "Foreign Secret",
    });
    const foreignReservation = reservation(46, { litterId: foreign.id });
    const result = buildLitterGroupDocumentBatchPlan(
      planInput([foreignReservation], { litters: [foreign] }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ids.foreignLitter);
    expect(serialized).not.toContain("Foreign Secret");
    for (const forbidden of [
      "documentId",
      "variantId",
      "storagePath",
      "hash",
      "snapshot",
      "operationId",
      "capturedAt",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
