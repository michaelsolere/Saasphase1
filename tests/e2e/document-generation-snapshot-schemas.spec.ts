import { expect, test } from "@playwright/test";

import {
  buildDocumentGenerationSnapshot,
  parseDocumentGenerationSnapshot,
  type BuildDocumentGenerationSnapshotInput,
  type DocumentGenerationSnapshot,
} from "../../src/features/documents/document-generation-snapshots";

const reservationTemplateContent =
  '{"schemaVersion":1,"locale":"fr-FR","documentType":"reservation_contract","title":"Contrat de réservation","preamble":["Préambule stable."],"clauses":{"reservationPurpose":["Objet."],"priceAndPayments":["Prix."],"deposit":["Arrhes."],"cancellationAndRefund":["Annulation."],"postponementAndCredit":["Report."],"potentialWithholding":["Retenue."],"finalConditions":["Conditions finales."]},"signatureLabels":{"breeder":"Éleveur","reservingParty":"Réservant"}}';

const certificateTemplateContent =
  '{"schemaVersion":1,"locale":"fr-FR","documentType":"commitment_certificate","title":"Certificat d’engagement","introduction":["Introduction stable."],"sections":{"animalNeeds":["Besoins."],"health":["Santé."],"educationAndBehavior":["Éducation."],"costsAndConstraints":["Contraintes."],"holderObligations":["Obligations."]},"acknowledgmentText":["Reconnaissance."],"signatureLabels":{"holder":"Détenteur","issuer":"Cédant"}}';

function contractInput(): BuildDocumentGenerationSnapshotInput {
  return {
    documentType: "reservation_contract",
    capturedAt: "2026-07-13T10:15:30.000Z",
    template: {
      id: "11111111-1111-4111-8111-111111111111",
      version: 3,
      format: "json",
      documentType: "reservation_contract",
      content: reservationTemplateContent,
    },
    sources: {
      organizationId: "22222222-2222-4222-8222-222222222222",
      reservationId: "33333333-3333-4333-8333-333333333333",
      contactId: "44444444-4444-4444-8444-444444444444",
      applicationId: null,
      litterId: null,
      litterGroupId: "55555555-5555-4555-8555-555555555555",
      animalId: null,
    },
    seller: {
      tradeName: "  Élevage Exemple  ",
      legalName: undefined,
      legalForm: null,
      siret: null,
      email: "contact@example.test",
      phone: undefined,
      website: "https://example.test",
      address: {
        line1: "  1 rue des Chiens ",
        city: "Paris",
        postalCode: "75001",
      },
      country: "France",
    },
    signer: undefined,
    adopter: {
      displayName: "  Camille Dupont  ",
      firstName: "Camille",
      lastName: "Dupont",
      email: "camille@example.test",
      address: undefined,
      country: "France",
    },
    adoptionProject: {
      species: " dog ",
      breed: " Golden Retriever ",
      sexPreference: null,
      litter: null,
      litterGroup: {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Portées été 2026",
      },
      animal: undefined,
    },
    reservation: {
      id: "33333333-3333-4333-8333-333333333333",
      status: " active ",
      createdAt: "2026-07-01T08:00:00.000Z",
      plannedAdoptionDate: null,
    },
    signature: { defaultCity: " Paris " },
    mediator: {
      name: undefined,
      contact: null,
      website: undefined,
    },
    financials: {
      currency: " eur ",
      priceCents: 250_000,
      paidCents: 80_000,
      refundedCents: 10_000,
      depositPaidCents: 50_000,
      fullDepositTargetCents: 50_000,
    },
  };
}

function certificateInput(): BuildDocumentGenerationSnapshotInput {
  const input = contractInput();
  return {
    ...input,
    documentType: "commitment_certificate",
    template: {
      ...input.template,
      documentType: "commitment_certificate",
      content: certificateTemplateContent,
    },
    adoptionProject: {
      ...input.adoptionProject,
      animal: {
        id: "66666666-6666-4666-8666-666666666666",
        officialName: "Nova des Prés",
        callName: "Nova",
        sex: "female",
        birthDate: "2026-05-01",
        identification: null,
        lofNumber: null,
      },
    },
    sources: {
      ...input.sources,
      animalId: "66666666-6666-4666-8666-666666666666",
    },
  };
}

function expectSuccessfulBuild(input: BuildDocumentGenerationSnapshotInput) {
  const result = buildDocumentGenerationSnapshot(input);
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error(`Unexpected build failure: ${result.error}`);
  }
  return result;
}

function expectBuildError(
  input: BuildDocumentGenerationSnapshotInput,
  error:
    | "invalid_template"
    | "document_type_mismatch"
    | "unsupported_document_type"
    | "invalid_source_data",
) {
  expect(buildDocumentGenerationSnapshot(input)).toEqual({
    success: false,
    error,
  });
}

function assertNoUndefined(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoUndefined);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const propertyValue of Object.values(value)) {
      expect(propertyValue).not.toBeUndefined();
      assertNoUndefined(propertyValue);
    }
  }
}

test("builds and parses immutable document generation snapshots", () => {
  const contract = expectSuccessfulBuild(contractInput());
  expect(contract.snapshot.documentType).toBe("reservation_contract");
  if (contract.snapshot.documentType !== "reservation_contract") {
    throw new Error("Expected a reservation contract snapshot");
  }
  expect(contract.snapshot.financials).toMatchObject({
    currency: "EUR",
    paidCents: 80_000,
    refundedCents: 10_000,
    netPaidCents: 70_000,
    remainingCents: 180_000,
    depositTargetCents: 50_000,
    depositRemainingCents: 0,
    balanceAfterFullDepositCents: 200_000,
  });
  expect(contract.snapshot.adoptionProject.animal).toBeNull();
  expect(contract.snapshot.adoptionProject.litter).toBeNull();
  expect(contract.snapshot.adoptionProject.litterGroup?.name).toBe(
    "Portées été 2026",
  );
  expect(contract.snapshot.seller.tradeName).toBe("Élevage Exemple");
  expect(contract.snapshot.adopter.displayName).toBe("Camille Dupont");
  expect(contract.snapshot.signature.defaultCity).toBe("Paris");
  expect(contract.snapshot.template.templateContentSha256).toBe(
    "a1dca62c1bdf23e2062035fee2396161ba447530d97f2bd58257987249943364",
  );
  expect(contract.snapshot.template.templateContentSha256).toBe(
    expectSuccessfulBuild(contractInput()).snapshot.template
      .templateContentSha256,
  );
  assertNoUndefined(contract.snapshot);
  expect(JSON.stringify(contract.snapshot)).not.toContain("undefined");

  const certificate = expectSuccessfulBuild(certificateInput());
  expect(certificate.snapshot.documentType).toBe("commitment_certificate");
  expect("financials" in certificate.snapshot).toBe(false);

  const archivedContract = structuredClone(contract.snapshot);
  delete archivedContract.branding;
  delete archivedContract.reservation.choiceRank;
  delete archivedContract.financials.depositTargetCents;
  delete archivedContract.financials.depositRemainingCents;
  delete archivedContract.financials.balanceAfterFullDepositCents;
  expect(
    parseDocumentGenerationSnapshot({
      documentType: "reservation_contract",
      generationData: archivedContract,
    }),
  ).toMatchObject({ success: true });

  expect(contract.snapshot.branding).toEqual({ logo: null });

  const archivedCertificate = structuredClone(certificate.snapshot);
  if (archivedCertificate.adoptionProject.litter) {
    delete archivedCertificate.adoptionProject.litter.availableFrom;
    delete archivedCertificate.adoptionProject.litter.mother;
    delete archivedCertificate.adoptionProject.litter.father;
  }
  expect(
    parseDocumentGenerationSnapshot({
      documentType: "commitment_certificate",
      generationData: archivedCertificate,
    }),
  ).toMatchObject({ success: true });

  const unknownPrice = contractInput();
  if (unknownPrice.financials) {
    unknownPrice.financials.priceCents = null;
  }
  const unknownPriceResult = expectSuccessfulBuild(unknownPrice);
  expect(unknownPriceResult.snapshot.documentType).toBe("reservation_contract");
  if (unknownPriceResult.snapshot.documentType === "reservation_contract") {
    expect(unknownPriceResult.snapshot.financials.remainingCents).toBeNull();
  }

  const excessiveRefund = contractInput();
  if (excessiveRefund.financials) {
    excessiveRefund.financials.paidCents = 10_000;
    excessiveRefund.financials.refundedCents = 20_000;
  }
  const excessiveRefundResult = expectSuccessfulBuild(excessiveRefund);
  if (excessiveRefundResult.snapshot.documentType === "reservation_contract") {
    expect(excessiveRefundResult.snapshot.financials.netPaidCents).toBe(0);
    expect(excessiveRefundResult.snapshot.financials.remainingCents).toBe(
      250_000,
    );
  }

  const invalidUuid = contractInput();
  invalidUuid.sources.contactId = "not-a-uuid";
  expectBuildError(invalidUuid, "invalid_source_data");

  const invalidDate = contractInput();
  invalidDate.capturedAt = "13/07/2026";
  expectBuildError(invalidDate, "invalid_source_data");

  const invalidCurrency = contractInput();
  if (invalidCurrency.financials) {
    invalidCurrency.financials.currency = "EURO";
  }
  expectBuildError(invalidCurrency, "invalid_source_data");

  const negativeAmount = contractInput();
  if (negativeAmount.financials) {
    negativeAmount.financials.paidCents = -1;
  }
  expectBuildError(negativeAmount, "invalid_source_data");

  const decimalAmount = contractInput();
  if (decimalAmount.financials) {
    decimalAmount.financials.depositPaidCents = 12.5;
  }
  expectBuildError(decimalAmount, "invalid_source_data");

  const invalidTemplate = contractInput();
  invalidTemplate.template.content = "{invalid";
  expectBuildError(invalidTemplate, "invalid_template");

  const mismatchedTemplate = contractInput();
  mismatchedTemplate.template.documentType = "commitment_certificate";
  mismatchedTemplate.template.content = certificateTemplateContent;
  expectBuildError(mismatchedTemplate, "document_type_mismatch");

  const welcomeBooklet = contractInput();
  welcomeBooklet.documentType = "welcome_booklet";
  expectBuildError(welcomeBooklet, "unsupported_document_type");

  expect(
    parseDocumentGenerationSnapshot({
      documentType: "reservation_contract",
      generationData: { ...contract.snapshot, unknownKey: true },
    }),
  ).toEqual({ success: false, error: "invalid_snapshot" });

  expect(
    parseDocumentGenerationSnapshot({
      documentType: "reservation_contract",
      generationData: { ...contract.snapshot, snapshotVersion: 2 },
    }),
  ).toEqual({ success: false, error: "unsupported_snapshot_version" });

  expect(
    parseDocumentGenerationSnapshot({
      documentType: "commitment_certificate",
      generationData: contract.snapshot,
    }),
  ).toEqual({ success: false, error: "document_type_mismatch" });

  const serializedSnapshot = JSON.stringify(contract.snapshot);
  const roundTrip = parseDocumentGenerationSnapshot({
    documentType: "reservation_contract",
    generationData: JSON.parse(serializedSnapshot) as unknown,
  });
  expect(roundTrip).toEqual({
    success: true,
    snapshot: contract.snapshot,
  });
});

test("snapshot schema rejects invalid stored scalar values", () => {
  const snapshot = expectSuccessfulBuild(contractInput()).snapshot;
  const invalidCases: DocumentGenerationSnapshot[] = [
    {
      ...snapshot,
      capturedAt: "invalid-date",
    },
    {
      ...snapshot,
      sources: { ...snapshot.sources, organizationId: "invalid-uuid" },
    },
  ];

  for (const generationData of invalidCases) {
    expect(
      parseDocumentGenerationSnapshot({
        documentType: "reservation_contract",
        generationData,
      }),
    ).toEqual({ success: false, error: "invalid_snapshot" });
  }
});

test("rejects internally inconsistent snapshot references", () => {
  const firstId = "77777777-7777-4777-8777-777777777777";
  const secondId = "88888888-8888-4888-8888-888888888888";
  const inconsistentInputs: Array<
    (input: BuildDocumentGenerationSnapshotInput) => void
  > = [
    (input) => {
      input.sources.reservationId = firstId;
    },
    (input) => {
      input.sources.litterId = firstId;
      input.adoptionProject.litter = { id: secondId };
    },
    (input) => {
      input.sources.litterId = firstId;
      input.adoptionProject.litter = null;
    },
    (input) => {
      input.sources.litterId = null;
      input.adoptionProject.litter = { id: firstId };
    },
    (input) => {
      input.sources.litterGroupId = firstId;
      input.adoptionProject.litterGroup = { id: secondId };
    },
    (input) => {
      input.sources.animalId = firstId;
      input.adoptionProject.animal = null;
    },
    (input) => {
      input.sources.animalId = firstId;
      input.adoptionProject.animal = { id: secondId };
    },
  ];

  for (const makeInconsistent of inconsistentInputs) {
    const input = contractInput();
    makeInconsistent(input);
    expectBuildError(input, "invalid_source_data");
  }

  const validSnapshot = expectSuccessfulBuild(contractInput()).snapshot;
  expect(
    parseDocumentGenerationSnapshot({
      documentType: "reservation_contract",
      generationData: {
        ...validSnapshot,
        sources: {
          ...validSnapshot.sources,
          reservationId: firstId,
        },
      },
    }),
  ).toEqual({ success: false, error: "invalid_snapshot" });
});
