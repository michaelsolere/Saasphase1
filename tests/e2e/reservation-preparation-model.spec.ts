import { expect, test } from "@playwright/test";

import {
  buildReservationPreparationReturnPath,
  buildReservationPreparation,
  formatReservationPreparationStateLabel,
  renderBrevoPreviewHtml,
  type ReservationPreparationInput,
} from "../../src/features/reservations/reservation-preparation-model";

function input(
  overrides: Partial<ReservationPreparationInput> = {},
): ReservationPreparationInput {
  return {
    reservationId: "10000000-0000-4000-8000-000000000001",
    reservationUpdatedAt: "2026-08-16T10:00:00.000Z",
    role: "owner",
    reservationStatus: "pre_reservation_paid",
    familyName: "Camille Martin",
    recipientEmail: "camille@example.test",
    litterId: "20000000-0000-4000-8000-000000000001",
    litterName: "Portée Alba 2026",
    positioningStatus: "confirmed",
    paidDepositCents: 25_000,
    preReservationDepositCents: 25_000,
    completeDepositCents: 50_000,
    complementDueDate: "2026-08-31",
    activeComplementRequest: null,
    documents: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        type: "commitment_certificate",
        status: "to_generate",
        version: 2,
        sendable: true,
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        type: "reservation_contract",
        status: "to_generate",
        version: 3,
        sendable: true,
      },
    ],
    variables: {
      prenom: "Camille",
      portee: "Portée Alba 2026",
      montant_complement_arrhes: "250,00 €",
      groupe_portees: "",
    },
    template: {
      registryTitle: "Contrat + certificat et complément d’arrhes",
      brevoTemplateId: 765432,
      providerName: "Réservation après naissance",
      subject: "Vos documents pour {{ params.portee }}",
      htmlContent: "<h1>Bonjour {{ params.prenom }}</h1><p>{{params.portee}}</p>",
      modifiedAt: "2026-08-15T08:00:00.000Z",
      active: true,
    },
    brevoConfigured: true,
    previousDeliveryStatus: null,
    ...overrides,
  };
}

test("sépare les états financier, documentaire et contractuel et prépare un envoi validable", () => {
  const preparation = buildReservationPreparation(input());

  expect(preparation.financial).toEqual({
    state: "complement_required",
    paidCents: 25_000,
    targetCents: 50_000,
    complementCents: 25_000,
    dueDate: "2026-08-31",
    requestState: "will_create",
  });
  expect(preparation.documentary.state).toBe("ready_to_send");
  expect(preparation.contractual.state).toBe("ready_to_send");
  expect(preparation.blockers).toEqual([]);
  expect(preparation.canConfirm).toBe(true);
  expect(preparation.summary.attachments).toEqual([
    "Certificat d’engagement · version 2",
    "Contrat de réservation · version 3",
  ]);
});

test("un paiement déjà complet n’empêche pas l’envoi des documents", () => {
  const preparation = buildReservationPreparation(
    input({ paidDepositCents: 50_000 }),
  );

  expect(preparation.financial.state).toBe("complete");
  expect(preparation.financial.complementCents).toBe(0);
  expect(preparation.financial.requestState).toBe("not_required");
  expect(preparation.canConfirm).toBe(true);
});

test("signale sans bloquer une ancienne demande de complément lorsque les arrhes sont complètes", () => {
  const preparation = buildReservationPreparation(
    input({
      paidDepositCents: 50_000,
      activeComplementRequest: {
        id: "40000000-0000-4000-8000-000000000001",
        amountCents: 25_000,
        dueDate: "2026-08-31",
      },
    }),
  );

  expect(preparation.blockers.map((issue) => issue.code)).not.toContain(
    "active_complement_incompatible",
  );
  expect(preparation.warnings.map((issue) => issue.code)).toContain(
    "stale_complement_request",
  );
  expect(preparation.canConfirm).toBe(true);
});

test("bloque seulement les prérequis indispensables et garde le positionnement absent en avertissement", () => {
  const missingEmail = buildReservationPreparation(
    input({ recipientEmail: null, positioningStatus: null }),
  );
  expect(missingEmail.blockers.map((issue) => issue.code)).toContain(
    "recipient_email_missing",
  );
  expect(missingEmail.warnings.map((issue) => issue.code)).toContain(
    "positioning_unconfirmed",
  );
  expect(missingEmail.canConfirm).toBe(false);

  const postponed = buildReservationPreparation(
    input({ positioningStatus: "postponed" }),
  );
  expect(postponed.blockers.map((issue) => issue.code)).toContain(
    "positioning_incompatible",
  );
});

test("exclut les pièces absentes ou incohérentes et avertit sur les variables secondaires vides", () => {
  const preparation = buildReservationPreparation(
    input({ documents: input().documents.slice(0, 1) }),
  );

  expect(preparation.documentary.state).toBe("incomplete");
  expect(preparation.blockers.map((issue) => issue.code)).toContain(
    "reservation_contract_missing",
  );
  expect(preparation.warnings.map((issue) => issue.code)).toContain(
    "optional_variables_missing",
  );
});

test("rend un aperçu HTML Brevo en lecture seule avec les variables du SaaS", () => {
  expect(
    renderBrevoPreviewHtml(
      "<h1>Bonjour {{ params.prenom }}</h1><p>{{params.portee}}</p><p>{{ params.inconnue }}</p>",
      { prenom: "Camille & Alex", portee: "Portée Alba" },
    ),
  ).toBe(
    "<h1>Bonjour Camille &amp; Alex</h1><p>Portée Alba</p><p>{{ params.inconnue }}</p>",
  );
});

test("restaure seulement un contexte sûr du poste Parcours adoptants", () => {
  expect(
    buildReservationPreparationReturnPath(
      "/reservations?view=follow_up&selected=10000000-0000-4000-8000-000000000001",
    ),
  ).toBe(
    "/reservations?view=follow_up&selected=10000000-0000-4000-8000-000000000001",
  );
  expect(buildReservationPreparationReturnPath("https://evil.test/phishing")).toBe(
    "/reservations?view=current",
  );
  expect(buildReservationPreparationReturnPath("/reservations/../../../settings")).toBe(
    "/reservations?view=current",
  );
});

test("présente les états séparés avec des libellés métier français", () => {
  expect(formatReservationPreparationStateLabel("complete")).toBe("Complet");
  expect(formatReservationPreparationStateLabel("complement_required")).toBe(
    "Complément requis",
  );
  expect(formatReservationPreparationStateLabel("ready_to_send")).toBe(
    "Prêt à envoyer",
  );
  expect(formatReservationPreparationStateLabel("not_ready")).toBe("Non prêt");
});
