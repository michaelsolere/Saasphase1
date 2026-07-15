import type {
  CommitmentCertificateTemplateDefinition,
  DocumentTemplateDefinition,
  ReservationContractTemplateDefinition,
  FreeReservationContractTemplateDefinition,
} from "./document-template-definition-schemas";
import type {
  CommitmentCertificateGenerationSnapshot,
  DocumentGenerationSnapshot,
  ReservationContractGenerationSnapshot,
} from "./document-generation-snapshot-schemas";
import { resolveFreeReservationContractDefinition } from "./reservation-contract-template-variables";

export type DocumentPdfPresentationSection = {
  id: string;
  title: string;
  paragraphs: string[];
  keepTogether?: boolean;
  signatureLabels?: [string, string];
};

export type DocumentPdfPresentation = {
  documentType: DocumentGenerationSnapshot["documentType"];
  title: string;
  fileName: string;
  preparedAt: string;
  sections: DocumentPdfPresentationSection[];
  freeBody?: string;
};

const legalFormLabels: Record<string, string> = {
  individual: "Entreprise individuelle",
  earl: "EARL",
  company: "Société",
  association: "Association",
  other: "Autre",
};

const speciesLabels: Record<string, string> = {
  dog: "Chien",
  cat: "Chat",
};

const sexLabels: Record<string, string> = {
  male: "Mâle",
  female: "Femelle",
  unknown: "Non renseigné",
};

const sexPreferenceLabels: Record<string, string> = {
  male_only: "Mâle uniquement",
  female_only: "Femelle uniquement",
  male_preferred_female_possible: "Mâle préféré, femelle possible",
  female_preferred_male_possible: "Femelle préférée, mâle possible",
  no_preference: "Sans préférence",
  unknown: "Non renseignée",
};

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatCents(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value / 100)
    .replace(/[\u00a0\u202f]/g, " ");
}

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function formatAddress(
  address: {
    line1: string | null;
    line2: string | null;
    postalCode: string | null;
    city: string | null;
    region: string | null;
  } | null,
  country: string | null,
) {
  if (!address && !country) return null;
  return compact([
    address?.line1,
    address?.line2,
    compact([address?.postalCode, address?.city]).join(" ") || null,
    address?.region,
    country,
  ]).join(", ");
}

function formatContacts(values: {
  email: string | null;
  phone: string | null;
  website?: string | null;
}) {
  return compact([
    values.email ? `E-mail : ${values.email}` : null,
    values.phone ? `Téléphone : ${values.phone}` : null,
    values.website ? `Site : ${values.website}` : null,
  ]).join(" - ");
}

function commonSections(snapshot: DocumentGenerationSnapshot) {
  const sellerAddress = formatAddress(snapshot.seller.address, snapshot.seller.country);
  const sellerContacts = formatContacts(snapshot.seller);
  const adopterAddress = formatAddress(snapshot.adopter.address, snapshot.adopter.country);
  const adopterContacts = formatContacts(snapshot.adopter);
  const project = snapshot.adoptionProject;
  const animal = project.animal;
  const litterBirthDate = project.litter?.actualBirthDate ?? animal?.birthDate;

  const sections: DocumentPdfPresentationSection[] = [
    {
      id: "seller",
      title: "Vendeur / élevage",
      paragraphs: compact([
        snapshot.seller.tradeName,
        snapshot.seller.legalName
          ? `Raison sociale : ${snapshot.seller.legalName}`
          : null,
        snapshot.seller.legalForm
          ? `Forme juridique : ${legalFormLabels[snapshot.seller.legalForm] ?? snapshot.seller.legalForm}`
          : null,
        snapshot.seller.siret ? `SIRET : ${snapshot.seller.siret}` : null,
        sellerAddress ? `Adresse : ${sellerAddress}` : null,
        sellerContacts || null,
      ]),
    },
    {
      id: "adopter",
      title: "Adoptant",
      paragraphs: compact([
        snapshot.adopter.displayName,
        adopterAddress ? `Adresse : ${adopterAddress}` : null,
        adopterContacts || null,
      ]),
    },
    {
      id: "project",
      title: "Projet d’adoption",
      paragraphs: compact([
        `Espèce : ${speciesLabels[project.species] ?? project.species}`,
        `Race : ${project.breed}`,
        project.sexPreference
          ? `Préférence de sexe : ${sexPreferenceLabels[project.sexPreference] ?? project.sexPreference}`
          : null,
        project.litterGroup
          ? `Groupe de portées : ${project.litterGroup.name ?? "Non nommé"}`
          : null,
        project.litter
          ? `Portée : ${project.litter.name ?? "Non nommée"}`
          : null,
        litterBirthDate
          ? `Date de naissance : ${formatDate(litterBirthDate)}`
          : null,
        snapshot.reservation.choiceRank
          ? `Rang de choix : ${snapshot.reservation.choiceRank}`
          : null,
        animal
          ? `Animal attribué : ${animal.callName ?? animal.officialName ?? "Nom non renseigné"}`
          : null,
        animal?.officialName && animal.officialName !== animal.callName
          ? `Nom officiel : ${animal.officialName}`
          : null,
        animal?.sex ? `Sexe : ${sexLabels[animal.sex] ?? animal.sex}` : null,
        animal?.identification ? `Identification : ${animal.identification}` : null,
        animal?.lofNumber ? `Numéro LOF : ${animal.lofNumber}` : null,
      ]),
    },
    {
      id: "preparation",
      title: "Préparation et signature",
      paragraphs: compact([
        `Document préparé le ${formatDate(snapshot.capturedAt)}`,
        snapshot.signature.defaultCity
          ? `Ville de signature : ${snapshot.signature.defaultCity}`
          : null,
      ]),
    },
  ];

  const mother = project.litter?.mother;
  const father = project.litter?.father;
  const automaticSections: DocumentPdfPresentationSection[] = [];
  if (mother || father) {
    automaticSections.push({
      id: "parentage",
      title: "Parentage",
      paragraphs: compact([
        mother
          ? `Mère : ${mother.officialName ?? mother.callName ?? "Nom non renseigné"}`
          : null,
        mother?.identification
          ? `Identification : ${mother.identification}`
          : null,
        mother?.lofNumber ? `LOF : ${mother.lofNumber}` : null,
        father
          ? `Père : ${father.officialName ?? father.callName ?? "Nom non renseigné"}`
          : null,
        father?.identification
          ? `Identification : ${father.identification}`
          : null,
        father?.lofNumber ? `LOF : ${father.lofNumber}` : null,
      ]),
    });
  }
  if (project.litter?.availableFrom) {
    automaticSections.push({
      id: "availability",
      title: "Disponibilité",
      paragraphs: [
        `Les chiots de cette portée seront disponibles à partir du ${formatDate(project.litter.availableFrom)}.`,
      ],
    });
  }
  sections.splice(-1, 0, ...automaticSections);

  return sections;
}

function buildContractPresentation(
  snapshot: ReservationContractGenerationSnapshot,
  template: ReservationContractTemplateDefinition,
): DocumentPdfPresentation {
  const financials = snapshot.financials;
  const depositTargetCents =
    financials.depositTargetCents ?? financials.fullDepositTargetCents;
  const depositRemainingCents =
    financials.depositRemainingCents ??
    Math.max(0, depositTargetCents - financials.depositPaidCents);
  const balanceAfterFullDepositCents =
    financials.balanceAfterFullDepositCents ??
    (financials.priceCents === null
      ? null
      : Math.max(0, financials.priceCents - depositTargetCents));
  const mediator = snapshot.mediator;
  const sections = commonSections(snapshot);

  sections.push({
    id: "financials",
    title: "Situation financière",
    paragraphs: compact([
      financials.priceCents === null
        ? null
        : `Prix total de l’animal : ${formatCents(financials.priceCents, financials.currency)}`,
      `Montant total des arrhes convenues : ${formatCents(depositTargetCents, financials.currency)}`,
      financials.depositPaidCents > 0
        ? `Arrhes déjà reçues à la date de génération : ${formatCents(financials.depositPaidCents, financials.currency)}`
        : null,
      depositRemainingCents > 0
        ? `Complément d’arrhes restant à verser : ${formatCents(depositRemainingCents, financials.currency)}`
        : null,
      balanceAfterFullDepositCents === null
        ? null
        : `Solde restant après versement complet des arrhes : ${formatCents(balanceAfterFullDepositCents, financials.currency)}`,
    ]),
  });

  if (mediator.name || mediator.contact || mediator.website) {
    sections.push({
      id: "mediator",
      title: "Médiateur",
      paragraphs: compact([mediator.name, mediator.contact, mediator.website]),
    });
  }

  sections.push(
    { id: "preamble", title: "Préambule", paragraphs: template.preamble },
    { id: "reservationPurpose", title: "Objet de la réservation", paragraphs: template.clauses.reservationPurpose },
    { id: "priceAndPayments", title: "Prix et paiements", paragraphs: template.clauses.priceAndPayments },
    { id: "deposit", title: "Arrhes", paragraphs: template.clauses.deposit },
    { id: "cancellationAndRefund", title: "Annulation et remboursement", paragraphs: template.clauses.cancellationAndRefund },
    { id: "postponementAndCredit", title: "Report et avoir", paragraphs: template.clauses.postponementAndCredit },
    { id: "potentialWithholding", title: "Retenue éventuelle", paragraphs: template.clauses.potentialWithholding },
    { id: "finalConditions", title: "Conditions finales", paragraphs: template.clauses.finalConditions },
    {
      id: "signatures",
      title: "Signatures",
      paragraphs: [],
      keepTogether: true,
      signatureLabels: [
        template.signatureLabels.breeder,
        template.signatureLabels.reservingParty,
      ],
    },
  );

  return {
    documentType: snapshot.documentType,
    title: template.title,
    fileName: `contrat-reservation-${snapshot.reservation.id}.pdf`,
    preparedAt: snapshot.capturedAt,
    sections,
  };
}

function buildFreeContractPresentation(
  snapshot: ReservationContractGenerationSnapshot,
  template: FreeReservationContractTemplateDefinition,
  allowMissingTemplateVariables: boolean,
): DocumentPdfPresentation | null {
  const resolved = resolveFreeReservationContractDefinition({
    definition: template,
    snapshot,
    allowMissingTemplateVariables,
  });
  if (!resolved.success) return null;
  return {
    documentType: snapshot.documentType,
    title: resolved.title,
    fileName: `contrat-reservation-${snapshot.reservation.id}.pdf`,
    preparedAt: snapshot.capturedAt,
    sections: [],
    freeBody: resolved.body,
  };
}

function buildCertificatePresentation(
  snapshot: CommitmentCertificateGenerationSnapshot,
  template: CommitmentCertificateTemplateDefinition,
): DocumentPdfPresentation {
  return {
    documentType: snapshot.documentType,
    title: template.title,
    fileName: `certificat-engagement-${snapshot.reservation.id}.pdf`,
    preparedAt: snapshot.capturedAt,
    sections: [
      ...commonSections(snapshot),
      { id: "introduction", title: "Introduction", paragraphs: template.introduction },
      { id: "animalNeeds", title: "Besoins de l’animal", paragraphs: template.sections.animalNeeds },
      { id: "health", title: "Santé", paragraphs: template.sections.health },
      { id: "educationAndBehavior", title: "Éducation et comportement", paragraphs: template.sections.educationAndBehavior },
      { id: "costsAndConstraints", title: "Coûts et contraintes", paragraphs: template.sections.costsAndConstraints },
      { id: "holderObligations", title: "Obligations du détenteur", paragraphs: template.sections.holderObligations },
      { id: "acknowledgmentText", title: "Reconnaissance", paragraphs: template.acknowledgmentText },
      {
        id: "signatures",
        title: "Signatures",
        paragraphs: [],
        keepTogether: true,
        signatureLabels: [
          template.signatureLabels.holder,
          template.signatureLabels.issuer,
        ],
      },
    ],
  };
}

export function buildDocumentPdfPresentation(
  snapshot: DocumentGenerationSnapshot,
  template: DocumentTemplateDefinition,
  options: { allowMissingTemplateVariables?: boolean } = {},
): DocumentPdfPresentation | null {
  if (
    snapshot.documentType === "reservation_contract" &&
    template.documentType === "reservation_contract"
  ) {
    if (template.schemaVersion === 2) {
      return buildFreeContractPresentation(
        snapshot,
        template,
        options.allowMissingTemplateVariables ?? false,
      );
    }
    return buildContractPresentation(snapshot, template);
  }
  if (
    snapshot.documentType === "commitment_certificate" &&
    template.documentType === "commitment_certificate"
  ) {
    return buildCertificatePresentation(snapshot, template);
  }
  return null;
}
