import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import {
  buildDocumentGenerationSnapshot,
  type BuildDocumentGenerationSnapshotInput,
} from "../../src/features/documents/build-document-generation-snapshot";
import { buildDocumentPdfPresentation } from "../../src/features/documents/document-pdf-presentation";
import { renderDocumentPdfCore } from "../../src/features/documents/document-pdf-renderer-core";
import type {
  CommitmentCertificateTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definition-schemas";

const reservationId = "33333333-3333-4333-8333-333333333333";

const contractDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat de réservation Étoile",
  preamble: ["Préambule premier.", "Préambule deuxième."],
  clauses: {
    reservationPurpose: ["Objet - paragraphe 1.", "Objet - paragraphe 2."],
    priceAndPayments: ["Prix - paragraphe."],
    deposit: ["Arrhes - paragraphe."],
    cancellationAndRefund: ["Annulation - paragraphe."],
    postponementAndCredit: ["Report - paragraphe."],
    potentialWithholding: ["Retenue - paragraphe."],
    finalConditions: ["Conditions finales - paragraphe."],
  },
  signatureLabels: {
    breeder: "L’éleveur",
    reservingParty: "Le réservant",
  },
};

const certificateDefinition: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat d’engagement et de connaissance",
  introduction: ["Introduction première.", "Introduction deuxième."],
  sections: {
    animalNeeds: ["Besoins - paragraphe."],
    health: ["Santé - paragraphe."],
    educationAndBehavior: ["Éducation - paragraphe."],
    costsAndConstraints: ["Coûts - paragraphe."],
    holderObligations: ["Obligations - paragraphe."],
  },
  acknowledgmentText: ["Reconnaissance - paragraphe."],
  signatureLabels: {
    holder: "Le détenteur",
    issuer: "Le cédant",
  },
};

function contractInput(
  definition: ReservationContractTemplateDefinition = contractDefinition,
): BuildDocumentGenerationSnapshotInput {
  return {
    documentType: "reservation_contract",
    capturedAt: "2026-07-13T10:15:30.000Z",
    template: {
      id: "11111111-1111-4111-8111-111111111111",
      version: 4,
      format: "json",
      documentType: "reservation_contract",
      content: JSON.stringify(definition),
    },
    sources: {
      organizationId: "22222222-2222-4222-8222-222222222222",
      reservationId,
      contactId: "44444444-4444-4444-8444-444444444444",
      applicationId: null,
      litterId: null,
      litterGroupId: "55555555-5555-4555-8555-555555555555",
      animalId: null,
    },
    seller: {
      tradeName: "Élevage des Étoiles",
      legalName: "Étoiles & Chiens SARL",
      legalForm: "company",
      siret: "123 456 789 00010",
      email: "contact@example.test",
      phone: "+33 1 02 03 04 05",
      website: "https://example.test",
      address: {
        line1: "1 rue des Prés",
        postalCode: "75001",
        city: "Paris",
      },
      country: "France",
    },
    signer: {
      displayName: "Alice Martin",
      role: "Gérante",
      email: "alice@example.test",
    },
    adopter: {
      displayName: "Camille Dupont",
      email: "camille@example.test",
      phone: "+33 6 01 02 03 04",
      address: {
        line1: "2 avenue de Lyon",
        postalCode: "69001",
        city: "Lyon",
      },
      country: "France",
    },
    adoptionProject: {
      species: "dog",
      breed: "Golden Retriever",
      sexPreference: "female_only",
      litter: null,
      litterGroup: {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Portées automne 2026",
      },
      animal: null,
    },
    reservation: {
      id: reservationId,
      status: "active",
      createdAt: "2026-07-01T08:00:00.000Z",
      plannedAdoptionDate: "2026-09-01",
    },
    signature: { defaultCity: "Paris" },
    mediator: {
      name: "Médiateur de la consommation",
      contact: "10 rue de la Médiation, 75000 Paris",
      website: "https://mediateur.example.test",
    },
    financials: {
      currency: "EUR",
      priceCents: 250_000,
      paidCents: 80_000,
      refundedCents: 10_000,
      depositPaidCents: 50_000,
      fullDepositTargetCents: 75_000,
    },
  };
}

function certificateInput(
  definition: CommitmentCertificateTemplateDefinition = certificateDefinition,
): BuildDocumentGenerationSnapshotInput {
  const common = contractInput();
  return {
    ...common,
    documentType: "commitment_certificate",
    template: {
      ...common.template,
      documentType: "commitment_certificate",
      content: JSON.stringify(definition),
    },
    sources: {
      ...common.sources,
      litterId: "66666666-6666-4666-8666-666666666666",
      animalId: "77777777-7777-4777-8777-777777777777",
    },
    adoptionProject: {
      ...common.adoptionProject,
      litter: {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Portée Nova",
        actualBirthDate: "2026-05-01",
      },
      animal: {
        id: "77777777-7777-4777-8777-777777777777",
        officialName: "Nova des Étoiles",
        callName: "Nova",
        sex: "female",
        birthDate: "2026-05-01",
        identification: "250269000000001",
        lofNumber: "LOF 12345/678",
      },
    },
    financials: undefined,
    mediator: undefined,
  };
}

function successfulBuild(input: BuildDocumentGenerationSnapshotInput) {
  const result = buildDocumentGenerationSnapshot(input);
  if (!result.success) throw new Error(`Snapshot build failed: ${result.error}`);
  return result;
}

function expectPdfEnvelope(bytes: Buffer) {
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.toString("ascii").trimEnd().endsWith("%%EOF")).toBe(true);
  expect(bytes.byteLength).toBeGreaterThan(4_000);
}

test("fige la version du logo dans le snapshot et les octets PDF historiques", async () => {
  const logoA = await sharp({ create: { width: 300, height: 90, channels: 4, background: "#166534" } }).png().toBuffer();
  const logoB = await sharp({ create: { width: 90, height: 300, channels: 3, background: "#1d4ed8" } }).jpeg().toBuffer();
  const metadata = (assetId: string, bytes: Buffer, mimeType: "image/png" | "image/jpeg", widthPx: number, heightPx: number) => ({
    assetId,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    fileSizeBytes: bytes.byteLength,
    mimeType,
    widthPx,
    heightPx,
  });

  const inputA = contractInput();
  inputA.branding = { logo: metadata("9f150002-0000-4000-8000-000000000011", logoA, "image/png", 300, 90) };
  const builtA = successfulBuild(inputA);
  const renderedA = await renderDocumentPdfCore({
    documentType: inputA.documentType,
    snapshot: builtA.snapshot,
    templateContent: inputA.template.content!,
    logoBytes: logoA,
  });
  expect(renderedA.outcome).toBe("success");
  if (renderedA.outcome !== "success") throw new Error("Expected PDF A");
  const storedHistoricalBytes = Buffer.from(renderedA.bytes);
  const storedHistoricalSha = createHash("sha256").update(storedHistoricalBytes).digest("hex");

  const inputB = contractInput();
  inputB.branding = { logo: metadata("9f150002-0000-4000-8000-000000000012", logoB, "image/jpeg", 90, 300) };
  const builtB = successfulBuild(inputB);
  const renderedB = await renderDocumentPdfCore({
    documentType: inputB.documentType,
    snapshot: builtB.snapshot,
    templateContent: inputB.template.content!,
    logoBytes: logoB,
  });
  expect(renderedB.outcome).toBe("success");
  if (renderedB.outcome !== "success") throw new Error("Expected PDF B");

  expect(createHash("sha256").update(storedHistoricalBytes).digest("hex")).toBe(storedHistoricalSha);
  expect(createHash("sha256").update(renderedB.bytes).digest("hex")).not.toBe(storedHistoricalSha);
  expect(builtA.snapshot.branding?.logo?.assetId).toBe("9f150002-0000-4000-8000-000000000011");
  expect(builtB.snapshot.branding?.logo?.assetId).toBe("9f150002-0000-4000-8000-000000000012");

  const withoutLogoInput = contractInput();
  withoutLogoInput.branding = { logo: null };
  const withoutLogo = successfulBuild(withoutLogoInput);
  expect(withoutLogo.snapshot.branding).toEqual({ logo: null });
  expect((await renderDocumentPdfCore({
    documentType: withoutLogoInput.documentType,
    snapshot: withoutLogo.snapshot,
    templateContent: withoutLogoInput.template.content!,
    logoBytes: null,
  })).outcome).toBe("success");

  expect(await renderDocumentPdfCore({
    documentType: inputA.documentType,
    snapshot: builtA.snapshot,
    templateContent: inputA.template.content!,
    logoBytes: logoB,
  })).toEqual({ outcome: "error", error: { code: "branding_mismatch" } });
});

test("builds ordered contract presentation and renders an in-memory A4 PDF", async () => {
  const input = contractInput();
  input.sources.litterId = "66666666-6666-4666-8666-666666666666";
  input.adoptionProject.litter = {
    id: input.sources.litterId,
    name: "Portée Hélios",
    actualBirthDate: "2026-01-03",
    availableFrom: "2026-02-28",
    mother: {
      id: "88888888-8888-4888-8888-888888888888",
      officialName: "Ushka de la vallée d’Hélios",
      callName: "Ushka",
      identification: "250269610906173",
      lofNumber: "251769/28489",
    },
    father: {
      id: "99999999-9999-4999-8999-999999999999",
      officialName: "Rimbaud de Bihan Ki Breizh",
      identification: "250268743442598",
      lofNumber: "203031/20009",
    },
  };
  input.reservation.choiceRank = 3;
  const built = successfulBuild(input);
  const presentation = buildDocumentPdfPresentation(
    built.snapshot,
    built.templateDefinition,
  );
  expect(presentation).not.toBeNull();
  expect(presentation?.fileName).toBe(`contrat-reservation-${reservationId}.pdf`);
  expect(presentation?.sections.map((section) => section.id)).toEqual([
    "seller", "adopter", "project", "parentage", "availability", "preparation", "financials", "mediator",
    "preamble", "reservationPurpose", "priceAndPayments", "deposit",
    "cancellationAndRefund", "postponementAndCredit", "potentialWithholding",
    "finalConditions", "signatures",
  ]);
  expect(presentation?.sections.find((section) => section.id === "preamble")?.paragraphs).toEqual(contractDefinition.preamble);
  expect(presentation?.sections.filter((section) => [
    "reservationPurpose", "priceAndPayments", "deposit", "cancellationAndRefund",
    "postponementAndCredit", "potentialWithholding", "finalConditions",
  ].includes(section.id)).flatMap((section) => section.paragraphs)).toEqual([
    ...contractDefinition.clauses.reservationPurpose,
    ...contractDefinition.clauses.priceAndPayments,
    ...contractDefinition.clauses.deposit,
    ...contractDefinition.clauses.cancellationAndRefund,
    ...contractDefinition.clauses.postponementAndCredit,
    ...contractDefinition.clauses.potentialWithholding,
    ...contractDefinition.clauses.finalConditions,
  ]);
  expect(presentation?.sections.find((section) => section.id === "seller")?.paragraphs).toContain("Élevage des Étoiles");
  expect(presentation?.sections.find((section) => section.id === "project")?.paragraphs).toEqual(expect.arrayContaining([
    "Portée : Portée Hélios",
    "Date de naissance : 03 janvier 2026",
    "Rang de choix : 3",
  ]));
  expect(presentation?.sections.find((section) => section.id === "parentage")?.paragraphs).toEqual([
    "Mère : Ushka de la vallée d’Hélios",
    "Identification : 250269610906173",
    "LOF : 251769/28489",
    "Père : Rimbaud de Bihan Ki Breizh",
    "Identification : 250268743442598",
    "LOF : 203031/20009",
  ]);
  expect(presentation?.sections.find((section) => section.id === "availability")?.paragraphs).toEqual([
    "Les chiots de cette portée seront disponibles à partir du 28 février 2026.",
  ]);
  const financialParagraphs = presentation?.sections.find((section) => section.id === "financials")?.paragraphs ?? [];
  expect(financialParagraphs).toEqual([
    "Prix total de l’animal : 2 500,00 €",
    "Montant total des arrhes convenues : 750,00 €",
    "Arrhes déjà reçues à la date de génération : 500,00 €",
    "Complément d’arrhes restant à verser : 250,00 €",
    "Solde restant après versement complet des arrhes : 1 750,00 €",
  ]);
  expect(financialParagraphs.join(" ")).not.toMatch(/Montant remboursé|Payé net|Reste dû|Montant payé/);
  expect(JSON.stringify(built.snapshot)).not.toMatch(/coat|color|couleur/i);

  const rendered = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot: built.snapshot,
    templateContent: input.template.content!,
  });
  expect(rendered.outcome).toBe("success");
  if (rendered.outcome !== "success") throw new Error("Expected rendered contract");
  expect(rendered.mimeType).toBe("application/pdf");
  expect(rendered.fileName).toBe(`contrat-reservation-${reservationId}.pdf`);
  expectPdfEnvelope(rendered.bytes);
});

test("renders a certificate with animal data and no financial section", async () => {
  const input = certificateInput();
  const built = successfulBuild(input);
  const presentation = buildDocumentPdfPresentation(built.snapshot, built.templateDefinition);
  expect(presentation?.sections.map((section) => section.id)).toEqual([
    "seller", "adopter", "project", "preparation", "introduction", "animalNeeds",
    "health", "educationAndBehavior", "costsAndConstraints", "holderObligations",
    "acknowledgmentText", "signatures",
  ]);
  expect(presentation?.sections.some((section) => section.id === "financials")).toBe(false);
  expect(presentation?.sections.find((section) => section.id === "project")?.paragraphs).toEqual(expect.arrayContaining([
    "Animal attribué : Nova",
    "Sexe : Femelle",
    "Identification : 250269000000001",
    "Numéro LOF : LOF 12345/678",
  ]));

  const rendered = await renderDocumentPdfCore({
    documentType: "commitment_certificate",
    snapshot: built.snapshot,
    templateContent: input.template.content!,
  });
  expect(rendered.outcome).toBe("success");
  if (rendered.outcome !== "success") throw new Error("Expected rendered certificate");
  expect(rendered.fileName).toBe(`certificat-engagement-${reservationId}.pdf`);
  expectPdfEnvelope(rendered.bytes);
});

test("accepts an absent animal, a group-only project, and omits unknown remaining balance", async () => {
  const input = contractInput();
  input.financials = { ...input.financials!, priceCents: null };
  const built = successfulBuild(input);
  const presentation = buildDocumentPdfPresentation(built.snapshot, built.templateDefinition);
  expect(presentation?.sections.find((section) => section.id === "project")?.paragraphs).toContain("Groupe de portées : Portées automne 2026");
  expect(presentation?.sections.some((section) => section.id === "parentage")).toBe(false);
  expect(presentation?.sections.some((section) => section.id === "availability")).toBe(false);
  expect(presentation?.sections.find((section) => section.id === "project")?.paragraphs.some((paragraph) => paragraph.startsWith("Animal attribué"))).toBe(false);
  expect(presentation?.sections.find((section) => section.id === "financials")?.paragraphs.some((paragraph) => paragraph.startsWith("Solde restant"))).toBe(false);

  const rendered = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot: built.snapshot,
    templateContent: input.template.content!,
  });
  expect(rendered.outcome).toBe("success");
});

test("renders contractual deposit cases without claiming unpaid amounts were received", () => {
  const cases = [
    { paid: 0, expected: ["Complément d’arrhes restant à verser : 750,00 €"], absent: "Arrhes déjà reçues" },
    { paid: 30_000, expected: ["Arrhes déjà reçues à la date de génération : 300,00 €", "Complément d’arrhes restant à verser : 450,00 €"], absent: "" },
    { paid: 75_000, expected: ["Arrhes déjà reçues à la date de génération : 750,00 €"], absent: "Complément d’arrhes" },
  ];

  for (const depositCase of cases) {
    const input = contractInput();
    input.financials = {
      ...input.financials!,
      paidCents: depositCase.paid,
      depositPaidCents: depositCase.paid,
    };
    const built = successfulBuild(input);
    if (built.snapshot.documentType !== "reservation_contract") throw new Error("Expected contract");
    expect(built.snapshot.financials).toMatchObject({
      depositTargetCents: 75_000,
      depositPaidCents: depositCase.paid,
      depositRemainingCents: Math.max(0, 75_000 - depositCase.paid),
      balanceAfterFullDepositCents: 175_000,
    });
    const paragraphs = buildDocumentPdfPresentation(built.snapshot, built.templateDefinition)
      ?.sections.find((section) => section.id === "financials")?.paragraphs ?? [];
    expect(paragraphs).toEqual(expect.arrayContaining(depositCase.expected));
    if (depositCase.absent) expect(paragraphs.join(" ")).not.toContain(depositCase.absent);
  }
});

test("renders an archived version 1 snapshot without the newly added optional fields", async () => {
  const input = contractInput();
  input.sources.litterId = "66666666-6666-4666-8666-666666666666";
  input.adoptionProject.litter = {
    id: input.sources.litterId,
    name: "Portée archive",
    actualBirthDate: "2026-01-03",
  };
  const built = successfulBuild(input);
  if (built.snapshot.documentType !== "reservation_contract") throw new Error("Expected contract");
  const archivedSnapshot = structuredClone(built.snapshot);
  delete archivedSnapshot.reservation.choiceRank;
  delete archivedSnapshot.adoptionProject.litter?.availableFrom;
  delete archivedSnapshot.adoptionProject.litter?.mother;
  delete archivedSnapshot.adoptionProject.litter?.father;
  delete archivedSnapshot.financials.depositTargetCents;
  delete archivedSnapshot.financials.depositRemainingCents;
  delete archivedSnapshot.financials.balanceAfterFullDepositCents;

  const rendered = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot: archivedSnapshot,
    templateContent: input.template.content!,
  });
  expect(rendered.outcome).toBe("success");
});

test("renders long legal sections across pages without persistent files", async () => {
  const longParagraphs = Array.from({ length: 3 }, (_, index) =>
    `Paragraphe long ${index + 1}. ${"Texte contractuel fourni par le modèle, avec accents français et pagination automatique. ".repeat(8)}`,
  );
  const longDefinition: ReservationContractTemplateDefinition = {
    ...contractDefinition,
    preamble: longParagraphs,
    clauses: {
      reservationPurpose: longParagraphs,
      priceAndPayments: longParagraphs,
      deposit: longParagraphs,
      cancellationAndRefund: longParagraphs,
      postponementAndCredit: longParagraphs,
      potentialWithholding: longParagraphs,
      finalConditions: longParagraphs,
    },
  };
  const input = contractInput(longDefinition);
  const built = successfulBuild(input);
  const rendered = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot: built.snapshot,
    templateContent: input.template.content!,
  });
  expect(rendered.outcome).toBe("success");
  if (rendered.outcome !== "success") throw new Error("Expected long PDF");
  expect(rendered.bytes.byteLength).toBeGreaterThan(8_000);
  expect(
    rendered.bytes.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0,
  ).toBeGreaterThan(2);
  expectPdfEnvelope(rendered.bytes);
});

test("returns neutral validation errors for snapshot, template, type and hash failures", async () => {
  const contract = contractInput();
  const built = successfulBuild(contract);
  expect(await renderDocumentPdfCore({ documentType: "reservation_contract", snapshot: {}, templateContent: contract.template.content! })).toEqual({ outcome: "error", error: { code: "invalid_snapshot" } });
  expect(await renderDocumentPdfCore({ documentType: "reservation_contract", snapshot: built.snapshot, templateContent: "{invalid" })).toEqual({ outcome: "error", error: { code: "invalid_template" } });
  expect(await renderDocumentPdfCore({ documentType: "commitment_certificate", snapshot: built.snapshot, templateContent: contract.template.content! })).toEqual({ outcome: "error", error: { code: "document_type_mismatch" } });
  expect(await renderDocumentPdfCore({ documentType: "reservation_contract", snapshot: built.snapshot, templateContent: `${contract.template.content!} ` })).toEqual({ outcome: "error", error: { code: "template_hash_mismatch" } });
});
