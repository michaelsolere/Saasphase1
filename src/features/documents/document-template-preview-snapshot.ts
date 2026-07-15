import type {
  CommitmentCertificateGenerationSnapshot,
  DocumentGenerationSnapshot,
  DocumentGenerationSnapshotType,
  ReservationContractGenerationSnapshot,
} from "./document-generation-snapshot-schemas";

const IDS = {
  organization: "a1000000-0000-4000-8000-000000000001",
  reservation: "a1000000-0000-4000-8000-000000000002",
  contact: "a1000000-0000-4000-8000-000000000003",
  application: "a1000000-0000-4000-8000-000000000004",
  litter: "a1000000-0000-4000-8000-000000000005",
  litterGroup: "a1000000-0000-4000-8000-000000000006",
  animal: "a1000000-0000-4000-8000-000000000007",
  mother: "a1000000-0000-4000-8000-000000000008",
  father: "a1000000-0000-4000-8000-000000000009",
  template: "a1000000-0000-4000-8000-000000000010",
} as const;

const commonSnapshot = {
  snapshotVersion: 1 as const,
  locale: "fr-FR" as const,
  capturedAt: "2026-06-15T10:30:00.000Z",
  template: {
    templateId: IDS.template,
    templateVersion: 1,
    templateContentSha256: "0".repeat(64),
  },
  sources: {
    organizationId: IDS.organization,
    reservationId: IDS.reservation,
    contactId: IDS.contact,
    applicationId: IDS.application,
    litterId: IDS.litter,
    litterGroupId: IDS.litterGroup,
    animalId: IDS.animal,
  },
  seller: {
    tradeName: "Élevage fictif des Amandiers",
    legalName: "Les Amandiers Démonstration SARL",
    legalForm: "company",
    siret: "000 000 000 00000",
    email: "elevage@exemple.test",
    phone: "+33 1 00 00 00 00",
    website: "https://elevage.exemple.test",
    address: {
      line1: "12 chemin des Démonstrations",
      line2: null,
      postalCode: "75000",
      city: "Ville Exemple",
      region: "Île-de-France",
    },
    country: "France",
  },
  signer: {
    displayName: "Alice Éleveuse (personne fictive)",
    firstName: "Alice",
    lastName: "Éleveuse",
    role: "Gérante",
    email: "alice@exemple.test",
    phone: "+33 1 00 00 00 01",
  },
  adopter: {
    displayName: "Camille Adoptant (personne fictive)",
    firstName: "Camille",
    lastName: "Adoptant",
    email: "camille@exemple.test",
    phone: "+33 6 00 00 00 02",
    address: {
      line1: "34 avenue du Modèle",
      line2: "Appartement fictif 3",
      postalCode: "69000",
      city: "Ville Exemple",
      region: "Auvergne-Rhône-Alpes",
    },
    country: "France",
  },
  adoptionProject: {
    species: "dog",
    breed: "Golden Retriever",
    sexPreference: "female_preferred_male_possible",
    litterGroup: {
      id: IDS.litterGroup,
      name: "Groupe Été fictif",
    },
    litter: {
      id: IDS.litter,
      name: "Portée Démonstration",
      actualBirthDate: "2026-05-02",
      availableFrom: "2026-06-27",
      mother: {
        id: IDS.mother,
        officialName: "Mère des Amandiers (fictive)",
        callName: "Maya",
        identification: "250000000000001",
        lofNumber: "LOF FICTIF 100/10",
      },
      father: {
        id: IDS.father,
        officialName: "Père des Amandiers (fictif)",
        callName: "Oscar",
        identification: "250000000000002",
        lofNumber: "LOF FICTIF 200/20",
      },
    },
    animal: {
      id: IDS.animal,
      officialName: "Nova des Amandiers (fictive)",
      callName: "Nova",
      sex: "female",
      birthDate: "2026-05-02",
      identification: "250000000000003",
      lofNumber: "LOF FICTIF 300/30",
      color: "Sable doré fictif",
    },
  },
  reservation: {
    id: IDS.reservation,
    status: "active",
    createdAt: "2026-06-01T09:00:00.000Z",
    plannedAdoptionDate: "2026-07-05",
    choiceRank: 2,
  },
  signature: {
    defaultCity: "Ville Exemple",
  },
};

const contractSnapshot: ReservationContractGenerationSnapshot = {
  ...commonSnapshot,
  documentType: "reservation_contract",
  mediator: {
    name: "Médiateur fictif de la consommation",
    contact: "1 place de la Médiation, 75000 Ville Exemple",
    website: "https://mediateur.exemple.test",
  },
  financials: {
    currency: "EUR",
    priceCents: 250_000,
    paidCents: 50_000,
    refundedCents: 0,
    netPaidCents: 50_000,
    remainingCents: 200_000,
    depositPaidCents: 50_000,
    fullDepositTargetCents: 75_000,
    depositTargetCents: 75_000,
    depositRemainingCents: 25_000,
    balanceAfterFullDepositCents: 175_000,
  },
};

const certificateSnapshot: CommitmentCertificateGenerationSnapshot = {
  ...commonSnapshot,
  documentType: "commitment_certificate",
};

export function createDocumentTemplatePreviewSnapshot(
  documentType: "reservation_contract",
): ReservationContractGenerationSnapshot;
export function createDocumentTemplatePreviewSnapshot(
  documentType: "commitment_certificate",
): CommitmentCertificateGenerationSnapshot;
export function createDocumentTemplatePreviewSnapshot(
  documentType: DocumentGenerationSnapshotType,
): DocumentGenerationSnapshot;
export function createDocumentTemplatePreviewSnapshot(
  documentType: DocumentGenerationSnapshotType,
): DocumentGenerationSnapshot {
  return structuredClone(
    documentType === "reservation_contract"
      ? contractSnapshot
      : certificateSnapshot,
  );
}
