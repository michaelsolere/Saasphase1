import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import {
  buildDocumentGenerationSnapshot,
  type BuildDocumentGenerationSnapshotInput,
} from "../../src/features/documents/build-document-generation-snapshot";
import { buildDocumentPdfPresentation } from "../../src/features/documents/document-pdf-presentation";
import { renderDocumentPdfCore } from "../../src/features/documents/document-pdf-renderer-core";
import {
  documentPdfStyles,
  getDocumentPdfLogoSize,
} from "../../src/features/documents/document-pdf-document";
import type {
  CommitmentCertificateTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definition-schemas";

const reservationId = "33333333-3333-4333-8333-333333333333";

const contractDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat de réservation Étoile",
  body: [
    "Préambule premier.",
    "Préambule deuxième.",
    "Éleveur : [[vendeur.nom_commercial]]",
    "Adoptant : [[adoptant.nom_complet]]",
    "Projet : [[projet.portee_ou_groupe]]",
    "Prix total : [[reservation.prix_formate]]",
    "Arrhes prévues : [[reservation.arrhes_prevues_formatees]]",
    "Arrhes versées : [[reservation.arrhes_versees_formatees]]",
  ].join("\n"),
};

const certificateDefinition: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat d’engagement et de connaissance",
  body: [
    "Introduction première.",
    "Introduction deuxième.",
    "Adoptant : [[adoptant.nom_complet]]",
    "Animal : [[animal.nom]]",
    "Sexe : [[projet.sexe]]",
    "Identification : [[animal.identification]]",
    "LOF : [[animal.numero_lof]]",
  ].join("\n"),
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
  expect(bytes.byteLength).toBeGreaterThan(1_500);
}

test("fige la version du logo dans le snapshot et les octets PDF historiques", async () => {
  const logoA = await sharp({ create: { width: 300, height: 90, channels: 4, background: "#166534" } }).png().toBuffer();
  const logoB = await sharp({ create: { width: 90, height: 300, channels: 3, background: "#1d4ed8" } }).jpeg().toBuffer();
  expect(getDocumentPdfLogoSize({ widthPx: 300, heightPx: 90 })).toEqual({ width: 120, height: 36 });
  expect(getDocumentPdfLogoSize({ widthPx: 90, heightPx: 300 })).toEqual({ width: 18, height: 60 });
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

test("builds free-body contract presentation and renders an in-memory A4 PDF", async () => {
  expect(documentPdfStyles.title.fontSize).toBe(24);
  const litterDefinition: ReservationContractTemplateDefinition = {
    ...contractDefinition,
    body: [
      "Préambule premier.",
      "Éleveur : [[vendeur.nom_commercial]]",
      "Adoptant : [[adoptant.nom_complet]]",
      "Portée : [[projet.portee_ou_groupe]]",
      "Date de naissance : [[projet.date_naissance]]",
      "Rang de choix : [[reservation.rang_choix]]",
      "Mère : [[portee.mere.nom]]",
      "Identification mère : [[portee.mere.identification]]",
      "LOF mère : [[portee.mere.numero_lof]]",
      "Père : [[portee.pere.nom]]",
      "Identification père : [[portee.pere.identification]]",
      "LOF père : [[portee.pere.numero_lof]]",
      "Disponibilité : [[portee.date_disponibilite]]",
      "Prix total : [[reservation.prix_formate]]",
      "Arrhes prévues : [[reservation.arrhes_prevues_formatees]]",
      "Arrhes versées : [[reservation.arrhes_versees_formatees]]",
    ].join("\n"),
  };
  const input = contractInput(litterDefinition);
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
  expect(presentation?.sections).toEqual([]);
  expect(presentation?.title).toBe(litterDefinition.title);
  expect(presentation?.freeBody).toContain("Préambule premier.");
  expect(presentation?.freeBody).toContain("Éleveur : Élevage des Étoiles");
  expect(presentation?.freeBody).toContain("Adoptant : Camille Dupont");
  expect(presentation?.freeBody).toContain("Portée : Portée Hélios");
  expect(presentation?.freeBody).toContain("Date de naissance : 03/01/2026");
  expect(presentation?.freeBody).toContain("Rang de choix : 3");
  expect(presentation?.freeBody).toContain("Mère : Ushka de la vallée d’Hélios");
  expect(presentation?.freeBody).toContain("Identification mère : 250269610906173");
  expect(presentation?.freeBody).toContain("LOF mère : 251769/28489");
  expect(presentation?.freeBody).toContain("Père : Rimbaud de Bihan Ki Breizh");
  expect(presentation?.freeBody).toContain("Disponibilité : 28/02/2026");
  expect(presentation?.freeBody).toContain("Prix total : 2 500 €");
  expect(presentation?.freeBody).toContain("Arrhes prévues : 750 €");
  expect(presentation?.freeBody).toContain("Arrhes versées : 500 €");
  expect(presentation?.freeBody).not.toContain("[[");
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

test("renders a certificate with animal data and free body only", async () => {
  const input = certificateInput();
  const built = successfulBuild(input);
  const presentation = buildDocumentPdfPresentation(built.snapshot, built.templateDefinition);
  expect(presentation?.sections).toEqual([]);
  expect(presentation?.freeBody).toContain("Introduction première.");
  expect(presentation?.freeBody).toContain("Animal : Nova");
  expect(presentation?.freeBody).toContain("Sexe : Femelle");
  expect(presentation?.freeBody).toContain("Identification : 250269000000001");
  expect(presentation?.freeBody).toContain("LOF : LOF 12345/678");
  expect(presentation?.freeBody).not.toContain("[[");
  expect(presentation?.freeBody).not.toMatch(/Prix|Arrhes|Solde/);

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
  const input = contractInput({
    ...contractDefinition,
    body: [
      "Éleveur : [[vendeur.nom_commercial]]",
      "Projet : [[projet.portee_ou_groupe]]",
      "Prix total : [[reservation.prix_formate]]",
    ].join("\n"),
  });
  input.financials = { ...input.financials!, priceCents: null };
  const built = successfulBuild(input);
  const presentation = buildDocumentPdfPresentation(built.snapshot, built.templateDefinition, {
    allowMissingTemplateVariables: true,
  });
  expect(presentation?.sections).toEqual([]);
  expect(presentation?.freeBody).toContain("Projet : Portées automne 2026");
  expect(presentation?.freeBody).toContain("Prix total : [Donnée manquante : prix de la réservation]");

  const rendered = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot: built.snapshot,
    templateContent: input.template.content!,
    allowMissingTemplateVariables: true,
  });
  expect(rendered.outcome).toBe("success");
});

test("renders contractual deposit cases via free-body finance variables", () => {
  const cases = [
    { paid: 0, expected: ["Arrhes versées : 0 €"], absent: "Arrhes versées : 300" },
    { paid: 30_000, expected: ["Arrhes versées : 300 €"], absent: "" },
    { paid: 75_000, expected: ["Arrhes versées : 750 €"], absent: "" },
  ];

  for (const depositCase of cases) {
    const input = contractInput({
      ...contractDefinition,
      body: "Arrhes prévues : [[reservation.arrhes_prevues_formatees]]\nArrhes versées : [[reservation.arrhes_versees_formatees]]",
    });
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
    const freeBody = buildDocumentPdfPresentation(built.snapshot, built.templateDefinition)?.freeBody ?? "";
    expect(freeBody).toContain("Arrhes prévues : 750 €");
    for (const expected of depositCase.expected) {
      expect(freeBody).toContain(expected);
    }
    if (depositCase.absent) expect(freeBody).not.toContain(depositCase.absent);
  }
});

test("renders an archived version 1 snapshot without the newly added optional fields", async () => {
  const input = contractInput({
    ...contractDefinition,
    body: "Éleveur : [[vendeur.nom_commercial]]\nProjet : [[projet.portee_ou_groupe]]\nPrix : [[reservation.prix_formate]]",
  });
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

test("renders long free-body legal text across pages without persistent files", async () => {
  const filler = "Texte contractuel fourni par le modèle, avec accents français et pagination automatique. ";
  const longDefinition: ReservationContractTemplateDefinition = {
    ...contractDefinition,
    body: Array.from({ length: 10 }, (_, index) =>
      `Paragraphe long ${index + 1}. ${filler.repeat(30)}`,
    ).join("\n\n"),
  };
  expect(longDefinition.body.length).toBeGreaterThan(20_000);
  expect(longDefinition.body.length).toBeLessThanOrEqual(30_000);
  const input = contractInput(longDefinition);
  const built = successfulBuild(input);
  const rendered = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot: built.snapshot,
    templateContent: input.template.content!,
  });
  expect(rendered.outcome).toBe("success");
  if (rendered.outcome !== "success") throw new Error("Expected long PDF");
  expect(rendered.bytes.byteLength).toBeGreaterThan(6_000);
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
