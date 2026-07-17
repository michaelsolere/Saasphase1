import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createInitialDocumentTemplateDefinition, INITIAL_FREE_COMMITMENT_CERTIFICATE_BODY, INITIAL_FREE_RESERVATION_CONTRACT_BODY } from "../../src/features/documents/create-initial-document-template-definition";
import { insertTemplateVariableAtSelection } from "../../src/features/documents/insert-template-variable";
import { toggleTemplateBoldAtSelection } from "../../src/features/documents/insert-template-bold";
import { buildDocumentPdfPresentation } from "../../src/features/documents/document-pdf-presentation";
import { renderDocumentPdfCore } from "../../src/features/documents/document-pdf-renderer-core";
import { createDocumentTemplatePreviewSnapshot } from "../../src/features/documents/document-template-preview-snapshot";
import { parseDocumentTemplateDefinition } from "../../src/features/documents/parse-document-template-definition";
import { parseDocumentGenerationSnapshot } from "../../src/features/documents/parse-document-generation-snapshot";
import {
  COMMITMENT_CERTIFICATE_VARIABLE_CATALOG,
  formatFrenchDate,
  formatFrenchMoney,
  formatFrenchMoneyInWords,
  RESERVATION_CONTRACT_VARIABLE_CATALOG,
  resolveFreeReservationContractBody,
  parseReservationContractVariables,
  resolveReservationContractText,
} from "../../src/features/documents/reservation-contract-template-variables";
import { resolveAnimalSnapshotColor } from "../../src/features/documents/resolve-animal-snapshot-color";
import type { CommitmentCertificateTemplateDefinition, FreeReservationContractTemplateDefinition } from "../../src/features/documents/document-template-definitions";

const v1Contract = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat V1",
  preamble: ["Préambule"],
  clauses: {
    reservationPurpose: ["Objet"], priceAndPayments: ["Prix"], deposit: ["Arrhes"],
    cancellationAndRefund: ["Annulation"], postponementAndCredit: ["Report"],
    potentialWithholding: ["Retenue"], finalConditions: ["Final"],
  },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
};

const v1Certificate = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat V1",
  introduction: ["Introduction"],
  sections: {
    animalNeeds: ["Besoins"], health: ["Santé"], educationAndBehavior: ["Éducation"],
    costsAndConstraints: ["Coûts"], holderObligations: ["Obligations"],
  },
  acknowledgmentText: ["Reconnaissance"],
  signatureLabels: { holder: "Détenteur", issuer: "Cédant" },
};

const v2: FreeReservationContractTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat de [[projet.race]]",
  body: "Adoptant : [[adoptant.nom_complet]]\nPrix : [[reservation.prix_formate]]\nEn lettres : [[reservation.prix_en_lettres]]",
};

const certificateV2: CommitmentCertificateTemplateDefinition = {
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat d’engagement",
  body: "Adoptant : [[adoptant.nom_complet]]\nAnimal : [[animal.nom]]",
};

function parse(definition: unknown, documentType = "reservation_contract") {
  return parseDocumentTemplateDefinition({
    templateFormat: "json",
    documentType,
    templateContent: JSON.stringify(definition),
  });
}

test("refuse le schéma V1 et valide strictement les variables V2", () => {
  expect(parse(v1Contract)).toEqual({ success: false, error: "unsupported_schema_version" });
  expect(parse(v1Certificate, "commitment_certificate")).toEqual({
    success: false,
    error: "unsupported_schema_version",
  });
  expect(parse(v2)).toEqual({ success: true, definition: v2 });
  expect(parse(certificateV2, "commitment_certificate")).toEqual({
    success: true,
    definition: certificateV2,
  });

  const unknown = parse({ ...v2, body: "[[adoptant.telephonne]]" });
  expect(unknown).toMatchObject({ success: false, error: "invalid_template_variables" });
  if (unknown.success) throw new Error("Variable inconnue acceptée");
  expect(unknown.variableIssues?.[0]).toMatchObject({ code: "unknown_variable", token: "[[adoptant.telephonne]]" });

  expect(parseReservationContractVariables("Texte [[adoptant.email]")).toMatchObject({
    success: false,
    issues: [{ code: "unclosed_variable" }],
  });
  expect(parseReservationContractVariables("[[adoptant email]]")).toMatchObject({
    success: false,
    issues: [{ code: "forbidden_characters" }],
  });
  expect(parseReservationContractVariables("[[adoptant]]")).toMatchObject({
    success: false,
    issues: [{ code: "invalid_syntax" }],
  });
  expect(parse({ ...v2, body: "x".repeat(30_001) })).toEqual({
    success: false,
    error: "invalid_template_content",
  });
});

test("unifie contrat et certificat sur le schéma libre V2 avec catalogues distincts", () => {
  const contractInitial = createInitialDocumentTemplateDefinition("reservation_contract");
  const certificateInitial = createInitialDocumentTemplateDefinition("commitment_certificate");

  expect(contractInitial).toEqual({
    schemaVersion: 2,
    locale: "fr-FR",
    documentType: "reservation_contract",
    title: "Contrat de réservation",
    body: INITIAL_FREE_RESERVATION_CONTRACT_BODY,
  });
  expect(certificateInitial).toEqual({
    schemaVersion: 2,
    locale: "fr-FR",
    documentType: "commitment_certificate",
    title: "Certificat d’engagement et de connaissance",
    body: INITIAL_FREE_COMMITMENT_CERTIFICATE_BODY,
  });
  expect(Object.keys(contractInitial).sort()).toEqual(["body", "documentType", "locale", "schemaVersion", "title"]);
  expect(Object.keys(certificateInitial).sort()).toEqual(Object.keys(contractInitial).sort());

  expect(parse(contractInitial)).toEqual({ success: true, definition: contractInitial });
  expect(parse(certificateInitial, "commitment_certificate")).toEqual({
    success: true,
    definition: certificateInitial,
  });

  expect(RESERVATION_CONTRACT_VARIABLE_CATALOG.some((item) => item.key === "reservation.prix_formate")).toBe(true);
  expect(COMMITMENT_CERTIFICATE_VARIABLE_CATALOG.some((item) => item.key === "reservation.prix_formate")).toBe(false);
  expect(parse({
    ...certificateV2,
    body: "Prix interdit : [[reservation.prix_formate]]",
  }, "commitment_certificate")).toMatchObject({
    success: false,
    error: "invalid_template_variables",
  });
  expect(parse({
    ...v2,
    body: "Prix autorisé : [[reservation.prix_formate]]",
  })).toEqual({
    success: true,
    definition: {
      ...v2,
      body: "Prix autorisé : [[reservation.prix_formate]]",
    },
  });
});

test("résout une seule passe avec les formats français et les règles métier", () => {
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  snapshot.financials.priceCents = 160_000;
  snapshot.reservation.choiceRank = 3;
  expect(formatFrenchMoney(160_000)).toBe("1 600 €");
  expect(formatFrenchMoneyInWords(160_000)).toBe("mille six cents euros");
  expect(formatFrenchDate("2026-07-15")).toBe("15/07/2026");

  const resolved = resolveReservationContractText({
    text: "[[reservation.rang_choix]] | [[reservation.prix_formate]] | [[reservation.prix_en_lettres]] | [[projet.sexe]] | [[projet.date_naissance]] | [[animal.couleur]]",
    snapshot,
  });
  expect(resolved).toEqual({
    success: true,
    text: "3 | 1 600 € | mille six cents euros | Femelle | 02/05/2026 | Sable doré fictif",
    missingVariables: [],
  });
  if (!resolved.success) throw new Error("Résolution du rendu fictif impossible");
  expect(resolved.text).not.toContain("[[");

  snapshot.adopter.displayName = "[[animal.nom]]";
  if (!snapshot.adoptionProject.animal) throw new Error("Animal fictif absent");
  snapshot.adoptionProject.animal.callName = "Nom animal qui ne doit pas être injecté";
  expect(resolveReservationContractText({
    text: "[[adoptant.nom_complet]]",
    snapshot,
  })).toEqual({
    success: false,
    error: "invalid_template_variable_value",
    invalidVariables: ["adoptant.nom_complet"],
  });

  const singlePassPreview = resolveReservationContractText({
    text: "[[adoptant.nom_complet]]",
    snapshot,
    allowMissingTemplateVariables: true,
  });
  expect(singlePassPreview).toEqual({
    success: true,
    text: "[Donnée invalide : la valeur « nom complet de l’adoptant » contient une syntaxe réservée]",
    missingVariables: [],
  });
  if (!singlePassPreview.success) throw new Error("Aperçu de la valeur invalide impossible");
  expect(singlePassPreview.text).not.toContain("Nom animal qui ne doit pas être injecté");
  expect(singlePassPreview.text).not.toContain("[[");
  expect(singlePassPreview.text).not.toContain("]]");

  snapshot.adopter.displayName = "Référence animal.nom conservée telle quelle";
  expect(resolveReservationContractText({
    text: "[[adoptant.nom_complet]]",
    snapshot,
  })).toMatchObject({ success: true, text: "Référence animal.nom conservée telle quelle" });
});

test("résout le groupe de portées et donne la priorité à la portée nommée", () => {
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  expect(RESERVATION_CONTRACT_VARIABLE_CATALOG).toEqual(expect.arrayContaining([
    expect.objectContaining({
      key: "groupe_portees.nom",
      label: "Nom du groupe de portées",
      category: "Groupe de portées",
    }),
    expect.objectContaining({ key: "projet.portee_ou_groupe" }),
  ]));

  expect(resolveReservationContractText({
    text: "[[groupe_portees.nom]] | [[projet.portee_ou_groupe]]",
    snapshot,
  })).toMatchObject({
    success: true,
    text: "Groupe Été fictif | Portée Démonstration",
  });

  snapshot.adoptionProject.litter = null;
  expect(resolveReservationContractText({
    text: "[[projet.portee_ou_groupe]]",
    snapshot,
  })).toMatchObject({ success: true, text: "Groupe Été fictif" });

  snapshot.adoptionProject.litterGroup = null;
  expect(resolveReservationContractText({
    text: "[[groupe_portees.nom]] | [[projet.portee_ou_groupe]]",
    snapshot,
    allowMissingTemplateVariables: true,
  })).toMatchObject({
    success: true,
    text: "[Donnée manquante : nom du groupe de portées] | [Donnée manquante : nom de la portée ou du groupe de portées]",
    missingVariables: ["groupe_portees.nom", "projet.portee_ou_groupe"],
  });
  expect(resolveReservationContractText({
    text: "[[groupe_portees.nom]]",
    snapshot,
  })).toEqual({
    success: false,
    error: "missing_template_variables",
    missingVariables: ["groupe_portees.nom"],
  });
});

test("parse, présente et rend uniquement le gras provenant du modèle source", async () => {
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  snapshot.adopter.displayName = "Camille **texte métier littéral**";
  const resolved = resolveFreeReservationContractBody({
    body: "Normal * littéral\n**Le vendeur :** et **[[vendeur.identite_complete]]**\n\nPrix : **montant [[reservation.prix_formate]] TTC**",
    snapshot,
  });
  expect(resolved).toMatchObject({
    success: true,
    paragraphs: [
      { runs: [{ text: "Normal * littéral", bold: false }] },
      { runs: [
        { text: "Le vendeur :", bold: true },
        { text: " et ", bold: false },
        { text: "Alice Éleveuse (personne fictive) Les Amandiers Démonstration SARL", bold: true },
      ] },
      { runs: [] },
      { runs: [
        { text: "Prix : ", bold: false },
        { text: "montant ", bold: true },
        { text: "2 500 €", bold: true },
        { text: " TTC", bold: true },
      ] },
    ],
  });
  if (!resolved.success) throw new Error("Corps libre non résolu");
  expect(resolved.text).not.toContain("**Le vendeur");

  const businessValue = resolveFreeReservationContractBody({
    body: "Adoptant : [[adoptant.nom_complet]]",
    snapshot,
  });
  expect(businessValue).toMatchObject({
    success: true,
    paragraphs: [{ runs: [
      { text: "Adoptant : ", bold: false },
      { text: "Camille **texte métier littéral**", bold: false },
    ] }],
  });

  const definition: FreeReservationContractTemplateDefinition = {
    ...v2,
    title: "Contrat",
    body: "Normal\n\n**Adoptant : [[adoptant.nom_complet]]** et prix **[[reservation.prix_formate]]**",
  };
  snapshot.template.templateContentSha256 = createHash("sha256").update(JSON.stringify(definition)).digest("hex");
  const presentation = buildDocumentPdfPresentation(snapshot, definition);
  expect(presentation?.freeTextParagraphs).toMatchObject([
    { runs: [{ text: "Normal", bold: false }] },
    { runs: [] },
    { runs: [
      { text: "Adoptant : ", bold: true },
      { text: "Camille **texte métier littéral**", bold: true },
      { text: " et prix ", bold: false },
      { text: "2 500 €", bold: true },
    ] },
  ]);
  expect(presentation?.freeBody).not.toContain("**Adoptant");
  expect((await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot,
    templateContent: JSON.stringify(definition),
  })).outcome).toBe("success");

  snapshot.adopter.displayName = "Camille Démonstration";
  for (const body of [
    "**[[adoptant.nom_complet]]**",
    "L’acquéreur : **[[adoptant.nom_complet]]**",
    "Le prix est fixé à **[[reservation.prix_formate]]**.",
    "**Texte et [[animal.nom]] dans la même zone**",
  ]) {
    const candidate = { ...definition, body };
    snapshot.template.templateContentSha256 = createHash("sha256")
      .update(JSON.stringify(candidate))
      .digest("hex");
    const candidatePresentation = buildDocumentPdfPresentation(snapshot, candidate, {
      allowMissingTemplateVariables: true,
    });
    expect(candidatePresentation).not.toBeNull();
    expect(candidatePresentation?.freeBody).not.toContain("**");
    expect((await renderDocumentPdfCore({
      documentType: "reservation_contract",
      snapshot,
      templateContent: JSON.stringify(candidate),
      allowMissingTemplateVariables: true,
    })).outcome).toBe("success");
  }
});

test("refuse les délimitations de gras invalides dans le corps et le titre", async () => {
  expect(parse({ ...v2, body: "Texte **non refermé" })).toMatchObject({
    success: false,
    error: "invalid_template_formatting",
    formattingIssues: [{ code: "unclosed_bold" }],
  });
  expect(parse({ ...v2, body: "Avant **** après" })).toMatchObject({
    success: false,
    error: "invalid_template_formatting",
    formattingIssues: [{ code: "empty_bold" }],
  });
  expect(parse({ ...v2, body: "fermeture**" })).toMatchObject({
    success: false,
    error: "invalid_template_formatting",
    formattingIssues: [{ code: "unexpected_bold_closer" }],
  });
  expect(parse({ ...v2, body: "**extérieur **intérieur** extérieur**" })).toMatchObject({
    success: false,
    error: "invalid_template_formatting",
    formattingIssues: expect.arrayContaining([expect.objectContaining({ code: "nested_bold" })]),
  });
  expect(parse({ ...v2, title: "**Contrat**" })).toMatchObject({
    success: false,
    error: "invalid_template_formatting",
    formattingIssues: [{ code: "formatting_in_title" }],
  });

  const definition = { ...v2, title: "Contrat", body: "Texte **non refermé" };
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  snapshot.template.templateContentSha256 = createHash("sha256").update(JSON.stringify(definition)).digest("hex");
  expect(buildDocumentPdfPresentation(snapshot, definition, {
    allowMissingTemplateVariables: true,
  })).toBeNull();
  expect(await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot,
    templateContent: JSON.stringify(definition),
  })).toEqual({ outcome: "error", error: { code: "invalid_template_formatting" } });
});

test("affiche un marqueur sans token brut en aperçu et bloque le PDF définitif", async () => {
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  snapshot.adopter.displayName = "Camille [[animal.nom]]";
  const definition: FreeReservationContractTemplateDefinition = {
    ...v2,
    title: "Contrat",
    body: "Adoptant : [[adoptant.nom_complet]]",
  };
  snapshot.template.templateContentSha256 = createHash("sha256").update(JSON.stringify(definition)).digest("hex");

  const preview = buildDocumentPdfPresentation(snapshot, definition, {
    allowMissingTemplateVariables: true,
  });
  expect(preview?.freeBody).toBe(
    "Adoptant : [Donnée invalide : la valeur « nom complet de l’adoptant » contient une syntaxe réservée]",
  );
  expect(preview?.freeBody).not.toContain("[[");
  expect(preview?.freeBody).not.toContain("]]");
  expect(preview?.freeBody).not.toContain("Nova");

  expect(await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot,
    templateContent: JSON.stringify(definition),
  })).toEqual({ outcome: "error", error: { code: "invalid_template_variable_value" } });

  expect((await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot,
    templateContent: JSON.stringify(definition),
    allowMissingTemplateVariables: true,
  })).outcome).toBe("success");
});

test("compose l’identité complète du vendeur sans duplication", () => {
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  if (!snapshot.signer) throw new Error("Signataire fictif absent");
  snapshot.signer.displayName = "  Michael   Solere ";
  snapshot.seller.legalName = " EARL La Poulanière ";
  snapshot.seller.tradeName = "La Poulanière";

  const resolveIdentity = () => resolveReservationContractText({
    text: "[[vendeur.identite_complete]]",
    snapshot,
  });

  expect(resolveIdentity()).toEqual({
    success: true,
    text: "Michael Solere EARL La Poulanière",
    missingVariables: [],
  });

  snapshot.signer.displayName = "EARL La Poulanière";
  expect(resolveIdentity()).toMatchObject({ success: true, text: "EARL La Poulanière" });

  snapshot.signer = null;
  expect(resolveIdentity()).toMatchObject({ success: true, text: "EARL La Poulanière" });

  snapshot.signer = { ...snapshot.signer!, displayName: "Michael Solere" };
  snapshot.seller.legalName = null;
  expect(resolveIdentity()).toMatchObject({ success: true, text: "Michael Solere La Poulanière" });
});

test("rend les absences visibles en aperçu et les bloque par défaut", async () => {
  const snapshot = createDocumentTemplatePreviewSnapshot("reservation_contract");
  snapshot.adopter.phone = null;
  const definition: FreeReservationContractTemplateDefinition = {
    ...v2,
    title: "Contrat",
    body: "Téléphone : [[adoptant.telephone]]",
  };
  snapshot.template.templateContentSha256 = createHash("sha256").update(JSON.stringify(definition)).digest("hex");

  const preview = buildDocumentPdfPresentation(snapshot, definition, { allowMissingTemplateVariables: true });
  expect(preview?.freeBody).toBe("Téléphone : [Donnée manquante : téléphone de l’adoptant]");
  expect(preview?.freeBody).not.toContain("[[");

  expect(await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot,
    templateContent: JSON.stringify(definition),
  })).toEqual({ outcome: "error", error: { code: "missing_template_variables" } });

  const previewPdf = await renderDocumentPdfCore({
    documentType: "reservation_contract",
    snapshot,
    templateContent: JSON.stringify(definition),
    allowMissingTemplateVariables: true,
  });
  expect(previewPdf.outcome).toBe("success");
});

test("insère au curseur, remplace une sélection et initialise les nouveaux contrats en V2", () => {
  expect(insertTemplateVariableAtSelection({ value: "Bonjour monde", variable: "adoptant.prenom", selectionStart: 8, selectionEnd: 8 })).toEqual({
    value: "Bonjour [[adoptant.prenom]]monde",
    cursor: 27,
  });
  expect(insertTemplateVariableAtSelection({ value: "Bonjour monde", variable: "animal.nom", selectionStart: 8, selectionEnd: 13 })).toEqual({
    value: "Bonjour [[animal.nom]]",
    cursor: 22,
  });
  expect(toggleTemplateBoldAtSelection({
    value: "Le vendeur",
    selectionStart: 0,
    selectionEnd: 10,
  })).toEqual({
    value: "**Le vendeur**",
    selectionStart: 2,
    selectionEnd: 12,
    changed: true,
  });
  expect(toggleTemplateBoldAtSelection({
    value: "Le vendeur",
    selectionStart: 3,
    selectionEnd: 3,
  })).toEqual({
    value: "Le ****vendeur",
    selectionStart: 5,
    selectionEnd: 5,
    changed: true,
  });
  expect(toggleTemplateBoldAtSelection({
    value: "x".repeat(30_000),
    selectionStart: 0,
    selectionEnd: 1,
  })).toMatchObject({ value: "x".repeat(30_000), changed: false });
  expect(INITIAL_FREE_RESERVATION_CONTRACT_BODY).toContain(
    "Né le : [[projet.date_naissance]]\nSexe : [[projet.sexe]]\nRang du choix : [[reservation.rang_choix]]\nCouleur : [[animal.couleur]]",
  );
  expect(INITIAL_FREE_COMMITMENT_CERTIFICATE_BODY).toContain("[[adoptant.nom_complet]]");
});

test("bascule le gras sans imbriquer les marqueurs et conserve les positions logiques", () => {
  expect(toggleTemplateBoldAtSelection({
    value: "**Le vendeur**",
    selectionStart: 2,
    selectionEnd: 12,
  })).toEqual({ value: "Le vendeur", selectionStart: 0, selectionEnd: 10, changed: true });

  expect(toggleTemplateBoldAtSelection({
    value: "**Le vendeur**",
    selectionStart: 0,
    selectionEnd: 14,
  })).toEqual({ value: "Le vendeur", selectionStart: 0, selectionEnd: 10, changed: true });

  expect(toggleTemplateBoldAtSelection({
    value: "[[vendeur.identite_complete]]",
    selectionStart: 0,
    selectionEnd: 29,
  })).toEqual({
    value: "**[[vendeur.identite_complete]]**",
    selectionStart: 2,
    selectionEnd: 31,
    changed: true,
  });

  expect(toggleTemplateBoldAtSelection({
    value: "**[[vendeur.identite_complete]]**",
    selectionStart: 2,
    selectionEnd: 31,
  })).toEqual({
    value: "[[vendeur.identite_complete]]",
    selectionStart: 0,
    selectionEnd: 29,
    changed: true,
  });

  expect(toggleTemplateBoldAtSelection({
    value: "[[animal.nom]]",
    selectionStart: 6,
    selectionEnd: 6,
  })).toEqual({
    value: "**[[animal.nom]]**",
    selectionStart: 8,
    selectionEnd: 8,
    changed: true,
  });

  expect(toggleTemplateBoldAtSelection({
    value: "**[[animal.nom]]**",
    selectionStart: 8,
    selectionEnd: 8,
  })).toEqual({
    value: "[[animal.nom]]",
    selectionStart: 6,
    selectionEnd: 6,
    changed: true,
  });

  expect(toggleTemplateBoldAtSelection({
    value: "**Le vendeur**",
    selectionStart: 7,
    selectionEnd: 7,
  })).toEqual({ value: "Le vendeur", selectionStart: 5, selectionEnd: 5, changed: true });

  expect(toggleTemplateBoldAtSelection({
    value: " Le vendeur ",
    selectionStart: 0,
    selectionEnd: 12,
  })).toEqual({
    value: " **Le vendeur** ",
    selectionStart: 3,
    selectionEnd: 13,
    changed: true,
  });

  expect(toggleTemplateBoldAtSelection({
    value: " [[animal.nom]] ",
    selectionStart: 0,
    selectionEnd: 16,
  })).toEqual({
    value: " **[[animal.nom]]** ",
    selectionStart: 3,
    selectionEnd: 17,
    changed: true,
  });

  expect(toggleTemplateBoldAtSelection({
    value: "   ",
    selectionStart: 0,
    selectionEnd: 3,
  })).toEqual({
    value: "   ",
    selectionStart: 0,
    selectionEnd: 3,
    changed: false,
    reason: "empty_selection",
  });

  expect(toggleTemplateBoldAtSelection({
    value: "**Le vendeur** et le prix",
    selectionStart: 4,
    selectionEnd: 20,
  })).toEqual({
    value: "**Le vendeur** et le prix",
    selectionStart: 4,
    selectionEnd: 20,
    changed: false,
    reason: "overlap",
  });

  const mixed = toggleTemplateBoldAtSelection({
    value: "Avant **animal** après",
    selectionStart: 0,
    selectionEnd: 24,
  });
  expect(mixed).toMatchObject({ value: "Avant **animal** après", changed: false, reason: "overlap" });
  expect(mixed.value).not.toContain("****animal****");

  expect(toggleTemplateBoldAtSelection({
    value: "****",
    selectionStart: 2,
    selectionEnd: 2,
  })).toEqual({
    value: "****",
    selectionStart: 2,
    selectionEnd: 2,
    changed: false,
    reason: "overlap",
  });

  expect(toggleTemplateBoldAtSelection({
    value: "x".repeat(29_999),
    selectionStart: 0,
    selectionEnd: 1,
  })).toMatchObject({ value: "x".repeat(29_999), changed: false, reason: "max_length" });
});

test("fige la couleur selon coat_color puis color et accepte un ancien snapshot sans couleur", () => {
  expect(resolveAnimalSnapshotColor("Crème", "Doré")).toBe("Crème");
  expect(resolveAnimalSnapshotColor("Crème prioritaire", "Doré secondaire")).toBe("Crème prioritaire");
  expect(resolveAnimalSnapshotColor("", "Doré")).toBe("Doré");

  const historical = createDocumentTemplatePreviewSnapshot("reservation_contract");
  delete historical.adoptionProject.animal?.color;
  expect(parseDocumentGenerationSnapshot({
    documentType: "reservation_contract",
    generationData: historical,
  }).success).toBe(true);
});
