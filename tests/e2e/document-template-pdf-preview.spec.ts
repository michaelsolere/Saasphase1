import { renderToBuffer } from "@react-pdf/renderer";
import { expect, test } from "@playwright/test";

import { DocumentPdfDocument } from "../../src/features/documents/document-pdf-document";
import { buildDocumentPdfPresentation } from "../../src/features/documents/document-pdf-presentation";
import { parseDocumentGenerationSnapshot } from "../../src/features/documents/parse-document-generation-snapshot";
import type {
  CommitmentCertificateTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "../../src/features/documents/document-template-definitions";
import { createDocumentTemplatePreviewSnapshot } from "../../src/features/documents/document-template-preview-snapshot";

const contractDefinition: ReservationContractTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat aperçu déterministe",
  preamble: ["Préambule visible dans l’aperçu."],
  clauses: {
    reservationPurpose: ["Objet local visible."],
    priceAndPayments: ["Prix local visible."],
    deposit: ["Arrhes locales visibles."],
    cancellationAndRefund: ["Annulation locale visible."],
    postponementAndCredit: ["Report local visible."],
    potentialWithholding: ["Retenue locale visible."],
    finalConditions: ["Conditions finales locales visibles."],
  },
  signatureLabels: {
    breeder: "Signature éleveur fictif",
    reservingParty: "Signature adoptant fictif",
  },
};

const certificateDefinition: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat aperçu déterministe",
  introduction: ["Introduction visible dans l’aperçu."],
  sections: {
    animalNeeds: ["Besoins visibles."],
    health: ["Santé visible."],
    educationAndBehavior: ["Éducation visible."],
    costsAndConstraints: ["Contraintes visibles."],
    holderObligations: ["Obligations visibles."],
  },
  acknowledgmentText: ["Reconnaissance visible."],
  signatureLabels: {
    holder: "Signature détenteur fictif",
    issuer: "Signature émetteur fictif",
  },
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

test("présente les sections automatiques et tout le contenu local du modèle", () => {
  const contractPresentation = buildDocumentPdfPresentation(
    createDocumentTemplatePreviewSnapshot("reservation_contract"),
    contractDefinition,
  );
  const certificatePresentation = buildDocumentPdfPresentation(
    createDocumentTemplatePreviewSnapshot("commitment_certificate"),
    certificateDefinition,
  );

  expect(contractPresentation?.sections.map(({ id }) => id)).toEqual([
    "seller", "adopter", "project", "parentage", "availability", "preparation",
    "financials", "mediator", "preamble", "reservationPurpose",
    "priceAndPayments", "deposit", "cancellationAndRefund",
    "postponementAndCredit", "potentialWithholding", "finalConditions",
    "signatures",
  ]);
  expect(contractPresentation?.sections.flatMap(({ paragraphs }) => paragraphs))
    .toEqual(expect.arrayContaining([
      ...contractDefinition.preamble,
      ...Object.values(contractDefinition.clauses).flat(),
      "Animal attribué : Nova",
      "Rang de choix : 2",
      "Les chiots de cette portée seront disponibles à partir du 27 juin 2026.",
    ]));
  expect(certificatePresentation?.sections.flatMap(({ paragraphs }) => paragraphs))
    .toEqual(expect.arrayContaining([
      ...certificateDefinition.introduction,
      ...Object.values(certificateDefinition.sections).flat(),
      ...certificateDefinition.acknowledgmentText,
      "Animal attribué : Nova",
    ]));
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

  expectPdf(await renderToBuffer(contractDocument));
  expectPdf(await renderToBuffer(certificateDocument));
});
