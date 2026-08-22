import { expect, test } from "@playwright/test";

import {
  ADOPTER_JOURNEY_DETAIL_TABS,
  buildAdopterJourneyDetailPath,
  isAdopterJourneyDetailFutureTab,
  normalizeAdopterJourneyDetailTab,
  projectAdopterDocumentsSituation,
  projectAdopterFinancialSituation,
  projectAdopterJourneyAlert,
  projectAdopterJourneyDossier,
  projectAdopterJourneyGuidedLinks,
  projectAdopterJourneyHeader,
  projectAdopterJourneyProgress,
  projectAdopterJourneyStatusTone,
  projectAdopterRecentActivity,
  type AdopterJourneyActivityEntry,
  type AdopterJourneyStepLike,
} from "../../src/features/reservations/adopter-journey-detail-model";

test("conserve l'ordre des onglets du prototype Open 04", () => {
  expect(ADOPTER_JOURNEY_DETAIL_TABS).toEqual([
    "apercu",
    "etapes",
    "echanges",
    "dossier",
    "finances",
    "photos",
  ]);
});

test("normalise les onglets de la fiche parcours adoptant et revient à Aperçu pour une valeur inconnue", () => {
  expect(normalizeAdopterJourneyDetailTab(undefined)).toBe("apercu");
  expect(normalizeAdopterJourneyDetailTab(null)).toBe("apercu");
  expect(normalizeAdopterJourneyDetailTab("")).toBe("apercu");
  expect(normalizeAdopterJourneyDetailTab("inconnu")).toBe("apercu");
  expect(normalizeAdopterJourneyDetailTab("apercu")).toBe("apercu");
  expect(normalizeAdopterJourneyDetailTab("etapes")).toBe("etapes");
  expect(normalizeAdopterJourneyDetailTab("dossier")).toBe("dossier");
  expect(normalizeAdopterJourneyDetailTab("finances")).toBe("finances");
  expect(normalizeAdopterJourneyDetailTab("echanges")).toBe("echanges");
  expect(normalizeAdopterJourneyDetailTab("photos")).toBe("photos");
});

test("signale les onglets Échanges et Photos comme emplacements futurs", () => {
  expect(isAdopterJourneyDetailFutureTab("echanges")).toBe(true);
  expect(isAdopterJourneyDetailFutureTab("photos")).toBe(true);
  expect(isAdopterJourneyDetailFutureTab("apercu")).toBe(false);
  expect(isAdopterJourneyDetailFutureTab("etapes")).toBe(false);
  expect(isAdopterJourneyDetailFutureTab("dossier")).toBe(false);
  expect(isAdopterJourneyDetailFutureTab("finances")).toBe(false);
});

test("construit le chemin de la fiche avec l'onglet et conserve les paramètres utiles", () => {
  expect(buildAdopterJourneyDetailPath("R-1", "finances")).toBe(
    "/reservations/R-1?tab=finances",
  );
  expect(
    buildAdopterJourneyDetailPath("R-1", "apercu", {
      return_to: "/reservations?view=current",
    }),
  ).toBe("/reservations/R-1?tab=apercu&return_to=%2Freservations%3Fview%3Dcurrent");
  expect(
    buildAdopterJourneyDetailPath("R-1", "dossier", {
      keep: "valeur",
      ignored: null,
      absent: undefined,
    }),
  ).toBe("/reservations/R-1?tab=dossier&keep=valeur");
  expect(buildAdopterJourneyDetailPath("a/b", "etapes")).toBe(
    "/reservations/a%2Fb?tab=etapes",
  );
});

test("classe le ton du statut sans jamais transformer un signal technique en décision", () => {
  expect(projectAdopterJourneyStatusTone("adopted")).toBe("positive");
  expect(projectAdopterJourneyStatusTone("pre_reservation_paid")).toBe("positive");
  expect(projectAdopterJourneyStatusTone("animal_assigned")).toBe("positive");
  expect(projectAdopterJourneyStatusTone("pre_reservation_requested")).toBe("attention");
  expect(projectAdopterJourneyStatusTone("postponed")).toBe("attention");
  expect(projectAdopterJourneyStatusTone("withdrawn")).toBe("negative");
  expect(projectAdopterJourneyStatusTone("cancelled")).toBe("negative");
  expect(projectAdopterJourneyStatusTone("expired")).toBe("negative");
  expect(projectAdopterJourneyStatusTone("statut_inconnu")).toBe("neutral");
  expect(projectAdopterJourneyStatusTone(undefined)).toBe("neutral");
  expect(projectAdopterJourneyStatusTone(null)).toBe("neutral");
});

test("projette l'en-tête de la fiche : famille, statut, portée et animal attribué", () => {
  const header = projectAdopterJourneyHeader({
    familyName: "Famille Martin",
    status: "animal_assigned",
    reference: "PAR-0001",
    createdAt: "2026-07-02T10:00:00.000Z",
    litterId: "L-1",
    litterLabel: "Été 2026",
    litterGroupId: "G-1",
    litterGroupLabel: "Golden 2026",
    animalId: "A-1",
    animalLabel: "Nova du Pays Pourpre",
  });

  expect(header.familyName).toBe("Famille Martin");
  expect(header.statusLabel).toBe("Chiot attribué");
  expect(header.statusTone).toBe("positive");
  expect(header.reference).toBe("PAR-0001");
  expect(header.createdAt).toBe("2026-07-02T10:00:00.000Z");
  expect(header.litter).toEqual({ id: "L-1", label: "Été 2026", href: "/litters/L-1" });
  expect(header.litterGroup).toEqual({
    id: "G-1",
    label: "Golden 2026",
    href: "/litter-groups/G-1",
  });
  expect(header.animal).toEqual({
    id: "A-1",
    label: "Nova du Pays Pourpre",
    href: "/animals/A-1",
  });
});

test("projette l'en-tête avec des valeurs par défaut lorsque les données manquent", () => {
  const header = projectAdopterJourneyHeader({
    familyName: null,
    status: null,
    reference: null,
    createdAt: null,
    litterId: null,
    litterLabel: null,
    litterGroupId: null,
    litterGroupLabel: null,
    animalId: null,
    animalLabel: null,
  });

  expect(header.familyName).toBe("Client anonyme");
  expect(header.statusLabel).toBe("Statut inconnu");
  expect(header.statusTone).toBe("neutral");
  expect(header.reference).toBeNull();
  expect(header.createdAt).toBeNull();
  expect(header.litter).toEqual({ id: null, label: "Aucune portée précise", href: null });
  expect(header.litterGroup).toEqual({
    id: null,
    label: "Aucun groupe de portées",
    href: null,
  });
  expect(header.animal).toEqual({
    id: null,
    label: "Aucun animal attribué",
    href: null,
  });
});

test("projette l'alerte principale uniquement lorsqu'une étape est à vérifier", () => {
  const done: AdopterJourneyStepLike = {
    label: "Pré-réservation réglée",
    state: "done",
    detail: "Point de départ du parcours adoptant.",
  };
  expect(projectAdopterJourneyAlert([])).toBeNull();
  expect(projectAdopterJourneyAlert([done, done])).toBeNull();

  const alert = projectAdopterJourneyAlert([
    done,
    {
      label: "Documents envoyés",
      state: "needs_check",
      detail: "Retours signés attendus.",
    },
  ]);
  expect(alert).toEqual({
    tone: "due",
    label: "Documents envoyés",
    detail: "Retours signés attendus.",
    count: 1,
  });

  const multiple = projectAdopterJourneyAlert([
    { label: "Premier", state: "needs_check", detail: "A" },
    { label: "Second", state: "needs_check", detail: "B" },
    done,
  ]);
  expect(multiple?.count).toBe(2);
  expect(multiple?.label).toBe("Premier");
});

test("calcule la progression synthétique depuis les étapes réelles", () => {
  expect(projectAdopterJourneyProgress([])).toEqual({
    doneCount: 0,
    totalCount: 0,
    currentLabel: null,
  });
  expect(
    projectAdopterJourneyProgress([
      { label: "Étape 1", state: "done", detail: "" },
      { label: "Étape 2", state: "in_progress", detail: "" },
      { label: "Étape 3", state: "upcoming", detail: "" },
    ]),
  ).toEqual({ doneCount: 1, totalCount: 3, currentLabel: "Étape 2" });
  expect(
    projectAdopterJourneyProgress([
      { label: "Étape 1", state: "done", detail: "" },
      { label: "Étape 2", state: "done", detail: "" },
    ]),
  ).toEqual({ doneCount: 2, totalCount: 2, currentLabel: "Étape 2" });
});

test("projette la situation financière sans inventer de décision métier", () => {
  const restant = projectAdopterFinancialSituation({
    priceCents: 180000,
    paidCents: 50000,
    refundedCents: 0,
    currency: "EUR",
  });
  expect(restant.tone).toBe("attention");
  expect(restant.label).toContain("Reste à régler");
  expect(restant.label).toContain("300,00");

  const solde = projectAdopterFinancialSituation({
    priceCents: 180000,
    paidCents: 180000,
    refundedCents: 0,
    currency: "EUR",
  });
  expect(solde.tone).toBe("positive");
  expect(solde.label).toBe("Dossier soldé");

  const tropPerçu = projectAdopterFinancialSituation({
    priceCents: 180000,
    paidCents: 200000,
    refundedCents: 0,
    currency: "EUR",
  });
  expect(tropPerçu.tone).toBe("negative");
  expect(tropPerçu.label).toContain("Trop-perçu");
  expect(tropPerçu.label).toContain("200");

  const indetermine = projectAdopterFinancialSituation({
    priceCents: null,
    paidCents: 0,
    refundedCents: 0,
    currency: "EUR",
  });
  expect(indetermine.tone).toBe("neutral");
  expect(indetermine.label).toBe("Solde non déterminé");
});

test("projette la situation documentaire depuis les documents réels", () => {
  expect(
    projectAdopterDocumentsSituation({
      error: true,
      total: 0,
      signed: 0,
      sent: 0,
      toGenerate: 0,
      bundlePresent: false,
      bundleSent: false,
      bundleSigned: false,
    }).label,
  ).toBe("Documents à vérifier");

  expect(
    projectAdopterDocumentsSituation({
      error: false,
      total: 0,
      signed: 0,
      sent: 0,
      toGenerate: 0,
      bundlePresent: false,
      bundleSent: false,
      bundleSigned: false,
    }).label,
  ).toBe("Aucun document lié");

  expect(
    projectAdopterDocumentsSituation({
      error: false,
      total: 2,
      signed: 0,
      sent: 0,
      toGenerate: 2,
      bundlePresent: false,
      bundleSent: false,
      bundleSigned: false,
    }).label,
  ).toBe("Documents adoptant à initialiser");

  expect(
    projectAdopterDocumentsSituation({
      error: false,
      total: 2,
      signed: 0,
      sent: 2,
      toGenerate: 0,
      bundlePresent: true,
      bundleSent: true,
      bundleSigned: false,
    }),
  ).toMatchObject({ tone: "attention", label: "Documents adoptant envoyés" });

  expect(
    projectAdopterDocumentsSituation({
      error: false,
      total: 2,
      signed: 2,
      sent: 0,
      toGenerate: 0,
      bundlePresent: true,
      bundleSent: true,
      bundleSigned: true,
    }),
  ).toMatchObject({ tone: "positive", label: "Documents adoptant reçus signés" });

  expect(
    projectAdopterDocumentsSituation({
      error: false,
      total: 6,
      signed: 1,
      sent: 2,
      toGenerate: 3,
      bundlePresent: true,
      bundleSent: false,
      bundleSigned: false,
    }).label,
  ).toBe("1 reçu(s) signé(s), 2 envoyé(s), 3 à générer");
});

test("projette l'activité récente triée de la plus récente à la plus ancienne", () => {
  const entries: AdopterJourneyActivityEntry[] = [
    { id: "1", kind: "payment", label: "Ancien", detail: null, occurredAt: "2026-07-01T10:00:00.000Z" },
    { id: "2", kind: "document", label: "Récent", detail: "Détail", occurredAt: "2026-07-20T10:00:00.000Z" },
    { id: "3", kind: "note", label: "Moyen", detail: null, occurredAt: "2026-07-10T10:00:00.000Z" },
  ];

  expect(projectAdopterRecentActivity(entries).map((entry) => entry.id)).toEqual([
    "2",
    "3",
    "1",
  ]);
  expect(projectAdopterRecentActivity(entries, 2)).toHaveLength(2);
  expect(projectAdopterRecentActivity([])).toEqual([]);
});

test("projette les liens vers les opérations guidées sans simuler d'action indisponible", () => {
  expect(
    projectAdopterJourneyGuidedLinks({
      reservationId: "R-1",
      litterId: null,
      hasDocumentsToPrepare: false,
      animalId: null,
      canOpenDepartureControl: false,
    }),
  ).toEqual([]);

  const links = projectAdopterJourneyGuidedLinks({
    reservationId: "R-1",
    litterId: "L-1",
    hasDocumentsToPrepare: true,
    animalId: "A-1",
    canOpenDepartureControl: true,
  });
  expect(links.map((link) => link.key)).toEqual([
    "preparer",
    "choice_planning",
    "departure_control",
  ]);
  expect(links[0]).toEqual({
    key: "preparer",
    label: "Préparer la réservation",
    href: "/reservations/R-1/preparer",
  });
  expect(links[1]).toEqual({
    key: "choice_planning",
    label: "Ouvrir le planning de choix",
    href: "/litters/L-1/choice-appointments",
  });
  expect(links[2]).toEqual({
    key: "departure_control",
    label: "Contrôle final du départ",
    href: "/reservations/R-1/depart",
  });
});

test("projette l'onglet Dossier : adoptants, candidature, portée, rang, préférences et animal", () => {
  const dossier = projectAdopterJourneyDossier({
    familyName: "Famille Martin",
    contactId: "C-1",
    email: "martin@example.test",
    phone: "0600000000",
    address: "12 rue des Tilleuls · 35000 Rennes",
    applicationId: "A-1",
    applicationStatusLabel: "Candidature validée",
    applicationSexPreference: "female_only",
    applicationProject: "Chien de famille",
    litterId: "L-1",
    litterLabel: "Été 2026",
    litterGroupId: "G-1",
    litterGroupLabel: "Golden 2026",
    rankInitial: 3,
    rankActive: 2,
    sexPreference: "female_preferred_male_possible",
    preferenceFlexible: true,
    adoptionDateLabel: "Prévue : 29 août 2026",
    animalId: "A-2",
    animalLabel: "Nova du Pays Pourpre",
    animalSexLabel: "Femelle",
    animalBirthDateLabel: "14 juin 2026",
    animalIdentification: "250269000000000",
    animalStatusLabel: "Attribuée",
  });

  expect(dossier.adoptants).toEqual([
    { label: "Nom", value: "Famille Martin", href: "/contacts/C-1" },
    { label: "E-mail", value: "martin@example.test", href: null },
    { label: "Téléphone", value: "0600000000", href: null },
    { label: "Adresse", value: "12 rue des Tilleuls · 35000 Rennes", href: null },
  ]);
  expect(dossier.candidature).toEqual([
    { label: "Statut", value: "Candidature validée", href: "/candidatures/A-1" },
    { label: "Préférence", value: "Femelle uniquement", href: null },
    { label: "Projet", value: "Chien de famille", href: null },
  ]);
  expect(dossier.scope).toEqual([
    { label: "Portée", value: "Été 2026", href: "/litters/L-1" },
    { label: "Groupe", value: "Golden 2026", href: "/litter-groups/G-1" },
  ]);
  expect(dossier.rang).toEqual([
    { label: "Rang", value: "Initial #3 · actif #2", href: null },
  ]);
  expect(dossier.preferences).toEqual([
    { label: "Préférence de sexe", value: "Femelle préférée, mâle possible (souple)", href: null },
  ]);
  expect(dossier.departure).toEqual([
    { label: "Départ prévu", value: "Prévue : 29 août 2026", href: null },
  ]);
  expect(dossier.animal).toEqual([
    { label: "Animal", value: "Nova du Pays Pourpre", href: "/animals/A-2" },
    { label: "Sexe", value: "Femelle", href: null },
    { label: "Naissance", value: "14 juin 2026", href: null },
    { label: "Identification", value: "250269000000000", href: null },
    { label: "Statut", value: "Attribuée", href: null },
  ]);
});

test("projette l'onglet Dossier avec des valeurs par défaut lorsque les données manquent", () => {
  const dossier = projectAdopterJourneyDossier({
    familyName: null,
    contactId: null,
    email: null,
    phone: null,
    address: null,
    applicationId: null,
    applicationStatusLabel: null,
    applicationSexPreference: null,
    applicationProject: null,
    litterId: null,
    litterLabel: null,
    litterGroupId: null,
    litterGroupLabel: null,
    rankInitial: null,
    rankActive: null,
    sexPreference: null,
    preferenceFlexible: false,
    adoptionDateLabel: null,
    animalId: null,
    animalLabel: null,
    animalSexLabel: null,
    animalBirthDateLabel: null,
    animalIdentification: null,
    animalStatusLabel: null,
  });

  expect(dossier.adoptants[0]).toEqual({
    label: "Nom",
    value: "Client anonyme",
    href: null,
  });
  expect(dossier.rang[0].value).toBe("Non renseigné");
  expect(dossier.preferences[0].value).toBe("Non précisé");
  expect(dossier.departure[0].value).toBe("Non renseigné");
  expect(dossier.animal[0]).toEqual({
    label: "Animal",
    value: "Aucun animal attribué",
    href: null,
  });
});
