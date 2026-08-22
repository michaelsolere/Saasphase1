import { getSexPreferenceLabel } from "@/features/applications/formatters";
import {
  formatPrice,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";

// ---------------------------------------------------------------------------
// Navigation de la fiche Parcours adoptant (/reservations/[id])
// ---------------------------------------------------------------------------

export const ADOPTER_JOURNEY_DETAIL_TABS = [
  "apercu",
  "etapes",
  "echanges",
  "dossier",
  "finances",
  "photos",
] as const;

export type AdopterJourneyDetailTab = (typeof ADOPTER_JOURNEY_DETAIL_TABS)[number];

export const ADOPTER_JOURNEY_DETAIL_TAB_LABELS: Record<AdopterJourneyDetailTab, string> = {
  apercu: "Aperçu",
  etapes: "Étapes",
  dossier: "Dossier",
  finances: "Finances & documents",
  echanges: "Échanges & suivi",
  photos: "Photos",
};

export const ADOPTER_JOURNEY_DETAIL_DEFAULT_TAB: AdopterJourneyDetailTab = "apercu";

/**
 * Onglets explicitement hors périmètre : ils signalent une capacité future sans
 * jamais la simuler comme opérationnelle.
 */
export const ADOPTER_JOURNEY_DETAIL_FUTURE_TABS: ReadonlySet<AdopterJourneyDetailTab> =
  new Set(["echanges", "photos"]);

export function normalizeAdopterJourneyDetailTab(
  value: string | null | undefined,
): AdopterJourneyDetailTab {
  return ADOPTER_JOURNEY_DETAIL_TABS.includes(value as AdopterJourneyDetailTab)
    ? (value as AdopterJourneyDetailTab)
    : ADOPTER_JOURNEY_DETAIL_DEFAULT_TAB;
}

export function isAdopterJourneyDetailFutureTab(
  tab: AdopterJourneyDetailTab,
): boolean {
  return ADOPTER_JOURNEY_DETAIL_FUTURE_TABS.has(tab);
}

export function buildAdopterJourneyDetailPath(
  reservationId: string,
  tab: AdopterJourneyDetailTab,
  extra?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) {
        params.set(key, value);
      }
    }
  }
  return `/reservations/${encodeURIComponent(reservationId)}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// En-tête de la fiche
// ---------------------------------------------------------------------------

export type AdopterJourneyStatusTone = "positive" | "attention" | "negative" | "neutral";

const STATUS_TONES: Record<string, AdopterJourneyStatusTone> = {
  draft: "attention",
  pending_positioning: "attention",
  pre_reservation_requested: "attention",
  pre_reservation_paid: "positive",
  active: "positive",
  confirmed_after_birth: "positive",
  waiting_for_available_sex: "attention",
  postponed: "attention",
  animal_assigned: "positive",
  adoption_ready: "positive",
  adopted: "positive",
  withdrawn: "negative",
  expired: "negative",
  cancelled: "negative",
  archived: "negative",
};

export function projectAdopterJourneyStatusTone(
  status: string | null | undefined,
): AdopterJourneyStatusTone {
  return status ? (STATUS_TONES[status] ?? "neutral") : "neutral";
}

export type AdopterJourneyHeaderProjection = {
  familyName: string;
  statusLabel: string;
  statusTone: AdopterJourneyStatusTone;
  reference: string | null;
  createdAt: string | null;
  litter: { id: string | null; label: string; href: string | null };
  litterGroup: { id: string | null; label: string; href: string | null };
  animal: { id: string | null; label: string; href: string | null };
};

export type AdopterJourneyHeaderInput = {
  familyName: string | null;
  status: string | null;
  reference: string | null;
  createdAt: string | null;
  litterId: string | null;
  litterLabel: string | null;
  litterGroupId: string | null;
  litterGroupLabel: string | null;
  animalId: string | null;
  animalLabel: string | null;
};

export function projectAdopterJourneyHeader(
  input: AdopterJourneyHeaderInput,
): AdopterJourneyHeaderProjection {
  return {
    familyName: input.familyName ?? "Client anonyme",
    statusLabel: getReservationStatusLabel(input.status),
    statusTone: projectAdopterJourneyStatusTone(input.status),
    reference: input.reference,
    createdAt: input.createdAt,
    litter: {
      id: input.litterId,
      label: input.litterLabel ?? "Aucune portée précise",
      href: input.litterId ? `/litters/${input.litterId}` : null,
    },
    litterGroup: {
      id: input.litterGroupId,
      label: input.litterGroupLabel ?? "Aucun groupe de portées",
      href: input.litterGroupId ? `/litter-groups/${input.litterGroupId}` : null,
    },
    animal: {
      id: input.animalId,
      label: input.animalLabel ?? "Aucun animal attribué",
      href: input.animalId ? `/animals/${input.animalId}` : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Onglet Aperçu — projections synthétiques
// ---------------------------------------------------------------------------

export type AdopterJourneyStepStateLike =
  | "done"
  | "in_progress"
  | "upcoming"
  | "needs_check"
  | "unknown";

export type AdopterJourneyStepLike = {
  label: string;
  state: AdopterJourneyStepStateLike;
  detail: string;
};

export type AdopterJourneyAlert = {
  tone: "due";
  label: string;
  detail: string;
  count: number;
} | null;

export function projectAdopterJourneyAlert(
  steps: AdopterJourneyStepLike[],
): AdopterJourneyAlert {
  const needsCheck = steps.filter((step) => step.state === "needs_check");
  if (needsCheck.length === 0) {
    return null;
  }
  const first = needsCheck[0]!;
  return {
    tone: "due",
    label: first.label,
    detail: first.detail,
    count: needsCheck.length,
  };
}

export type AdopterJourneyProgress = {
  doneCount: number;
  totalCount: number;
  currentLabel: string | null;
};

export function projectAdopterJourneyProgress(
  steps: AdopterJourneyStepLike[],
): AdopterJourneyProgress {
  const doneCount = steps.filter((step) => step.state === "done").length;
  const current = steps.find((step) => step.state !== "done");
  return {
    doneCount,
    totalCount: steps.length,
    currentLabel: current?.label ?? (steps.length > 0 ? steps[steps.length - 1]!.label : null),
  };
}

export type AdopterFinancialSituation = {
  label: string;
  detail: string;
  tone: "positive" | "attention" | "negative" | "neutral";
};

export function projectAdopterFinancialSituation({
  priceCents,
  paidCents,
  refundedCents,
  currency,
}: {
  priceCents: number | null;
  paidCents: number;
  refundedCents: number;
  currency: string | null;
}): AdopterFinancialSituation {
  if (priceCents === null) {
    return {
      label: "Solde non déterminé",
      detail: "Le solde ne peut pas être calculé tant qu’aucun tarif convenu n’est renseigné.",
      tone: "neutral",
    };
  }

  const remainingCents = priceCents - paidCents + refundedCents;

  if (remainingCents > 0) {
    return {
      label: `Reste à régler : ${formatPrice(remainingCents, currency)}`,
      detail: "Un montant reste à régler ou à vérifier avant la suite du dossier.",
      tone: "attention",
    };
  }

  if (remainingCents === 0) {
    return {
      label: "Dossier soldé",
      detail: "Le dossier est soldé au regard du tarif convenu.",
      tone: "positive",
    };
  }

  return {
    label: `Trop-perçu : ${formatPrice(Math.abs(remainingCents), currency)}`,
    detail: "Le dossier présente un trop-perçu à vérifier avant toute nouvelle décision.",
    tone: "negative",
  };
}

export type AdopterDocumentsSituation = {
  label: string;
  detail: string;
  tone: "positive" | "attention" | "negative" | "neutral";
};

export function projectAdopterDocumentsSituation({
  error,
  total,
  signed,
  sent,
  toGenerate,
  bundlePresent,
  bundleSent,
  bundleSigned,
}: {
  error: boolean;
  total: number;
  signed: number;
  sent: number;
  toGenerate: number;
  bundlePresent: boolean;
  bundleSent: boolean;
  bundleSigned: boolean;
}): AdopterDocumentsSituation {
  if (error) {
    return {
      label: "Documents à vérifier",
      detail: "Le chargement des documents est à contrôler.",
      tone: "attention",
    };
  }

  if (total === 0) {
    return {
      label: "Aucun document lié",
      detail: "Aucun document lié à ce dossier pour l’instant.",
      tone: "neutral",
    };
  }

  if (!bundlePresent) {
    return {
      label: "Documents adoptant à initialiser",
      detail: "Le certificat d’engagement et le contrat de réservation restent à rattacher.",
      tone: "attention",
    };
  }

  if (bundleSigned) {
    return {
      label: "Documents adoptant reçus signés",
      detail: "Le certificat d’engagement et le contrat de réservation sont signés.",
      tone: "positive",
    };
  }

  if (bundleSent) {
    return {
      label: "Documents adoptant envoyés",
      detail: "Les documents contractuels sont envoyés, retours signés attendus.",
      tone: "attention",
    };
  }

  return {
    label: `${signed} reçu(s) signé(s), ${sent} envoyé(s), ${toGenerate} à générer`,
    detail: "Situation documentaire intermédiaire du dossier.",
    tone: "neutral",
  };
}

export type AdopterJourneyActivityKind =
  | "payment"
  | "document"
  | "email"
  | "manual_contact"
  | "note"
  | "appointment"
  | "decision";

export type AdopterJourneyActivityEntry = {
  id: string;
  kind: AdopterJourneyActivityKind;
  label: string;
  detail: string | null;
  occurredAt: string;
};

export function projectAdopterRecentActivity(
  entries: AdopterJourneyActivityEntry[],
  limit = 5,
): AdopterJourneyActivityEntry[] {
  return [...entries]
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Liens vers les opérations guidées existantes
// ---------------------------------------------------------------------------

export type AdopterJourneyGuidedLink = {
  key: "preparer" | "choice_planning" | "departure_control";
  label: string;
  href: string;
};

function addReturnTo(path: string, returnTo: string): string {
  return `${path}?return_to=${encodeURIComponent(returnTo)}`;
}

export function projectAdopterJourneyGuidedLinks({
  reservationId,
  litterId,
  hasDocumentsToPrepare,
  animalId,
  canOpenDepartureControl,
  returnTo,
}: {
  reservationId: string;
  litterId: string | null;
  hasDocumentsToPrepare: boolean;
  animalId: string | null;
  canOpenDepartureControl: boolean;
  returnTo: string;
}): AdopterJourneyGuidedLink[] {
  const links: AdopterJourneyGuidedLink[] = [];

  if (hasDocumentsToPrepare) {
    links.push({
      key: "preparer",
      label: "Préparer la réservation",
      href: addReturnTo(
        `/reservations/${encodeURIComponent(reservationId)}/preparer`,
        returnTo,
      ),
    });
  }

  if (litterId) {
    links.push({
      key: "choice_planning",
      label: "Ouvrir le planning de choix",
      href: addReturnTo(
        `/litters/${encodeURIComponent(litterId)}/choice-appointments`,
        returnTo,
      ),
    });
  }

  if (animalId && canOpenDepartureControl) {
    links.push({
      key: "departure_control",
      label: "Contrôle final du départ",
      href: addReturnTo(
        `/reservations/${encodeURIComponent(reservationId)}/depart`,
        returnTo,
      ),
    });
  }

  return links;
}

// ---------------------------------------------------------------------------
// Onglet Dossier — projection structurée
// ---------------------------------------------------------------------------

export type AdopterDossierItem = {
  label: string;
  value: string;
  href: string | null;
};

export type AdopterDossierProjection = {
  adoptants: AdopterDossierItem[];
  candidature: AdopterDossierItem[];
  scope: AdopterDossierItem[];
  rang: AdopterDossierItem[];
  preferences: AdopterDossierItem[];
  departure: AdopterDossierItem[];
  animal: AdopterDossierItem[];
};

export type AdopterDossierInput = {
  familyName: string | null;
  contactId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  applicationId: string | null;
  applicationStatusLabel: string | null;
  applicationSexPreference: string | null;
  applicationProject: string | null;
  litterId: string | null;
  litterLabel: string | null;
  litterGroupId: string | null;
  litterGroupLabel: string | null;
  rankInitial: number | null;
  rankActive: number | null;
  sexPreference: string | null;
  preferenceFlexible?: boolean;
  adoptionDateLabel: string | null;
  animalId: string | null;
  animalLabel: string | null;
  animalSexLabel: string | null;
  animalBirthDateLabel: string | null;
  animalIdentification: string | null;
  animalStatusLabel: string | null;
};

function dossierItem(label: string, value: string | null, href: string | null = null): AdopterDossierItem {
  return { label, value: value ?? "Non renseigné", href };
}

export function projectAdopterJourneyDossier(
  input: AdopterDossierInput,
): AdopterDossierProjection {
  const rankParts = [
    input.rankInitial !== null ? `Initial #${input.rankInitial}` : null,
    input.rankActive !== null ? `actif #${input.rankActive}` : null,
  ].filter((part): part is string => Boolean(part));

  const preferenceLabel = getSexPreferenceLabel(input.sexPreference);
  const preferenceValue = input.preferenceFlexible
    ? `${preferenceLabel} (souple)`
    : preferenceLabel;

  return {
    adoptants: [
      {
        label: "Nom",
        value: input.familyName ?? "Client anonyme",
        href: input.contactId ? `/contacts/${input.contactId}` : null,
      },
      dossierItem("E-mail", input.email),
      dossierItem("Téléphone", input.phone),
      dossierItem("Adresse", input.address),
    ],
    candidature: [
      {
        label: "Statut",
        value: input.applicationStatusLabel ?? "Non renseigné",
        href: input.applicationId ? `/candidatures/${input.applicationId}` : null,
      },
      {
        label: "Préférence",
        value: getSexPreferenceLabel(input.applicationSexPreference),
        href: null,
      },
      dossierItem("Projet", input.applicationProject),
    ],
    scope: [
      {
        label: "Portée",
        value: input.litterLabel ?? "Aucune portée précise",
        href: input.litterId ? `/litters/${input.litterId}` : null,
      },
      {
        label: "Groupe",
        value: input.litterGroupLabel ?? "Aucun groupe de portées",
        href: input.litterGroupId ? `/litter-groups/${input.litterGroupId}` : null,
      },
    ],
    rang: [
      {
        label: "Rang",
        value: rankParts.length > 0 ? rankParts.join(" · ") : "Non renseigné",
        href: null,
      },
    ],
    preferences: [
      {
        label: "Préférence de sexe",
        value: preferenceValue,
        href: null,
      },
    ],
    departure: [dossierItem("Départ prévu", input.adoptionDateLabel)],
    animal: [
      {
        label: "Animal",
        value: input.animalLabel ?? "Aucun animal attribué",
        href: input.animalId ? `/animals/${input.animalId}` : null,
      },
      dossierItem("Sexe", input.animalSexLabel),
      dossierItem("Naissance", input.animalBirthDateLabel),
      dossierItem("Identification", input.animalIdentification),
      dossierItem("Statut", input.animalStatusLabel),
    ],
  };
}
