import { renderToBuffer } from "@react-pdf/renderer";
import { expect, test } from "@playwright/test";

import {
  DocumentPdfDocument,
  documentPdfStyles,
} from "../../src/features/documents/document-pdf-document";
import { buildDocumentPdfPresentation } from "../../src/features/documents/document-pdf-presentation";
import { parseDocumentGenerationSnapshot } from "../../src/features/documents/parse-document-generation-snapshot";
import type {
  CommitmentCertificateTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definitions";
import { createDocumentTemplatePreviewSnapshot } from "../../src/features/documents/document-template-preview-snapshot";

const contractDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat aperçu déterministe",
  body: "Préambule visible dans l’aperçu.\nObjet local visible.\nAdoptant : [[adoptant.nom_complet]]\nPrix : [[reservation.prix_formate]]",
};

const certificateDefinition: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat aperçu déterministe",
  body: "Introduction visible dans l’aperçu.\nBesoins visibles.\nAdoptant : [[adoptant.nom_complet]]\nAnimal : [[animal.nom]]",
};

function expectPdf(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(buffer.toString("ascii").trimEnd().endsWith("%%EOF")).toBe(true);
}

test("construit des snapshots fictifs déterministes et valides pour les deux types", () => {
  for (const documentType of [
    "reservation_contract",
    "commitment_certificate",
  ] as const) {
    const first = createDocumentTemplatePreviewSnapshot(documentType);
    const second = createDocumentTemplatePreviewSnapshot(documentType);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(JSON.stringify(first)).toContain("ficti");
    expect(first.adoptionProject).toMatchObject({
      sexPreference: "female_preferred_male_possible",
      animal: { callName: "Nova", sex: "female" },
      litter: { name: "Portée Démonstration", availableFrom: "2026-06-27" },
      litterGroup: { name: "Groupe Été fictif" },
    });
    expect(first.reservation.choiceRank).toBe(2);

    const parsed = parseDocumentGenerationSnapshot({
      documentType,
      generationData: first,
    });
    expect(parsed.success).toBe(true);
  }

  const contract = createDocumentTemplatePreviewSnapshot("reservation_contract");
  expect(contract.financials).toMatchObject({
    priceCents: 250_000,
    depositTargetCents: 75_000,
    balanceAfterFullDepositCents: 175_000,
  });
  expect(contract.mediator.name).toContain("fictif");
});

test("présente le titre et le corps libre résolu sans sections automatiques", () => {
  const contractPresentation = buildDocumentPdfPresentation(
    createDocumentTemplatePreviewSnapshot("reservation_contract"),
    contractDefinition,
  );
  const certificatePresentation = buildDocumentPdfPresentation(
    createDocumentTemplatePreviewSnapshot("commitment_certificate"),
    certificateDefinition,
  );

  expect(contractPresentation?.sections).toEqual([]);
  expect(contractPresentation?.title).toBe(contractDefinition.title);
  expect(contractPresentation?.freeBody).toContain("Préambule visible dans l’aperçu.");
  expect(contractPresentation?.freeBody).toContain("Objet local visible.");
  expect(contractPresentation?.freeBody).toContain("Adoptant :");
  expect(contractPresentation?.freeBody).toContain("Prix :");
  expect(contractPresentation?.freeBody).not.toContain("[[");

  expect(certificatePresentation?.sections).toEqual([]);
  expect(certificatePresentation?.title).toBe(certificateDefinition.title);
  expect(certificatePresentation?.freeBody).toContain("Introduction visible dans l’aperçu.");
  expect(certificatePresentation?.freeBody).toContain("Besoins visibles.");
  expect(certificatePresentation?.freeBody).toContain("Nova");
  expect(certificatePresentation?.freeBody).not.toContain("[[");
});

test("rend contrat et certificat avec le composant React PDF partagé", async () => {
  const contractPresentation = buildDocumentPdfPresentation(
    createDocumentTemplatePreviewSnapshot("reservation_contract"),
    contractDefinition,
  );
  const certificatePresentation = buildDocumentPdfPresentation(
    createDocumentTemplatePreviewSnapshot("commitment_certificate"),
    certificateDefinition,
  );
  if (!contractPresentation || !certificatePresentation) {
    throw new Error("Expected both preview presentations");
  }

  const contractDocument = DocumentPdfDocument({
    presentation: contractPresentation,
  });
  const certificateDocument = DocumentPdfDocument({
    presentation: certificatePresentation,
  });
  expect(contractDocument.type).toBe(certificateDocument.type);
  expect(documentPdfStyles.title).toMatchObject({
    fontFamily: "Helvetica-Bold",
    fontSize: 24,
    textAlign: "center",
  });

  expectPdf(await renderToBuffer(contractDocument));
  expectPdf(await renderToBuffer(certificateDocument));
});
