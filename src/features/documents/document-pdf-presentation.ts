import type {
  CommitmentCertificateTemplateDefinition,
  DocumentTemplateDefinition,
  ReservationContractTemplateDefinition,
} from "./document-template-definition-schemas";
import type {
  CommitmentCertificateGenerationSnapshot,
  DocumentGenerationSnapshot,
  ReservationContractGenerationSnapshot,
} from "./document-generation-snapshot-schemas";

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
          ? `Portée : ${project.litter.name ?? "Non nommée"}${
              project.litter.actualBirthDate
                ? ` - naissance le ${formatDate(project.litter.actualBirthDate)}`
                : ""
            }`
          : null,
        animal
          ? `Animal attribué : ${animal.callName ?? animal.officialName ?? "Nom non renseigné"}`
          : null,
        animal?.officialName && animal.officialName !== animal.callName
          ? `Nom officiel : ${animal.officialName}`
          : null,
        animal?.sex ? `Sexe : ${sexLabels[animal.sex] ?? animal.sex}` : null,
        animal?.birthDate ? `Date de naissance : ${formatDate(animal.birthDate)}` : null,
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

  return sections;
}

function buildContractPresentation(
  snapshot: ReservationContractGenerationSnapshot,
  template: ReservationContractTemplateDefinition,
): DocumentPdfPresentation {
  const financials = snapshot.financials;
  const mediator = snapshot.mediator;
  const sections = commonSections(snapshot);

  sections.push({
    id: "financials",
    title: "Situation financière",
    paragraphs: compact([
      financials.priceCents === null
        ? null
        : `Prix total : ${formatCents(financials.priceCents, financials.currency)}`,
      `Montant payé : ${formatCents(financials.paidCents, financials.currency)}`,
      `Montant remboursé : ${formatCents(financials.refundedCents, financials.currency)}`,
      `Payé net : ${formatCents(financials.netPaidCents, financials.currency)}`,
      financials.remainingCents === null
        ? null
        : `Reste dû : ${formatCents(financials.remainingCents, financials.currency)}`,
      `Arrhes payées : ${formatCents(financials.depositPaidCents, financials.currency)}`,
      `Objectif d’arrhes complètes : ${formatCents(financials.fullDepositTargetCents, financials.currency)}`,
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
): DocumentPdfPresentation | null {
  if (
    snapshot.documentType === "reservation_contract" &&
    template.documentType === "reservation_contract"
  ) {
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
