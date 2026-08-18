import { expect, test } from "@playwright/test";

import {
  confirmReservationPreparationActionCore,
  initialReservationPreparationActionState,
} from "../../src/features/reservations/reservation-preparation-action-core";
import {
  buildReservationPreparationKey,
  type ReservationPreparationInput,
} from "../../src/features/reservations/reservation-preparation-model";

const reservationId = "10000000-0000-4000-8000-000000000001";
const litterId = "20000000-0000-4000-8000-000000000001";

function preparation(
  overrides: Partial<ReservationPreparationInput> = {},
): ReservationPreparationInput {
  return {
    reservationId,
    reservationUpdatedAt: "2026-08-16T10:00:00.000Z",
    role: "owner",
    reservationStatus: "pre_reservation_paid",
    familyName: "Camille Martin",
    recipientEmail: "camille@example.test",
    litterId,
    litterName: "Portée Alba",
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
        version: 1,
        sendable: true,
        fileSha256: "a".repeat(64),
        fileSizeBytes: 1_024,
        filePath: "organizations/org/documents/certificate-v1.pdf",
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        type: "reservation_contract",
        status: "to_generate",
        version: 1,
        sendable: true,
        fileSha256: "b".repeat(64),
        fileSizeBytes: 2_048,
        filePath: "organizations/org/documents/contract-v1.pdf",
      },
    ],
    variables: {
      prenom: "Camille",
      portee: "Portée Alba",
      montant_complement_arrhes: "250,00 €",
    },
    template: {
      registryTitle: "Contrat + certificat",
      brevoTemplateId: 42,
      providerName: "Réservation",
      subject: "Vos documents",
      htmlContent: "<p>Bonjour</p>",
      htmlSha256: "1".repeat(64),
      modifiedAt: "2026-08-16T08:00:00.000Z",
      active: true,
    },
    brevoConfigured: true,
    previousDeliveryStatus: null,
    ...overrides,
  };
}

function form(input = preparation(), confirmed = true) {
  const formData = new FormData();
  formData.set("reservation_id", input.reservationId);
  formData.set("litter_id", input.litterId ?? "");
  formData.set("expected_preparation_key", buildReservationPreparationKey(input));
  if (confirmed) formData.set("final_confirmation", "confirmed");
  return formData;
}

test("n’exécute aucun effet sans confirmation finale explicite", async () => {
  let sends = 0;
  const result = await confirmReservationPreparationActionCore(
    initialReservationPreparationActionState,
    form(preparation(), false),
    {
      loadPreparation: async () => preparation(),
      send: async () => {
        sends += 1;
        return { status: "success", deliveryState: "sent" };
      },
      revalidate: () => undefined,
    },
  );

  expect(result).toEqual({ status: "confirmation_required" });
  expect(sends).toBe(0);
});

test("relit le dossier et refuse un aperçu devenu périmé", async () => {
  let sends = 0;
  const preview = preparation();
  const result = await confirmReservationPreparationActionCore(
    initialReservationPreparationActionState,
    form(preview),
    {
      loadPreparation: async () =>
        preparation({ paidDepositCents: 30_000 }),
      send: async () => {
        sends += 1;
        return { status: "success", deliveryState: "sent" };
      },
      revalidate: () => undefined,
    },
  );

  expect(result).toEqual({ status: "conflict" });
  expect(sends).toBe(0);
});

test("confirme avec un modèle Brevo volumineux sans sérialiser son HTML dans la clé", async () => {
  const current = preparation({
    template: {
      ...preparation().template!,
      htmlContent: `<p>${"contenu".repeat(6_000)}</p>`,
    },
  });
  let sends = 0;

  const result = await confirmReservationPreparationActionCore(
    initialReservationPreparationActionState,
    form(current),
    {
      loadPreparation: async () => current,
      send: async () => {
        sends += 1;
        return { status: "success", deliveryState: "sent" };
      },
      revalidate: () => undefined,
    },
  );
  const changed = {
    ...current,
    template: {
      ...current.template!,
      htmlContent: `${current.template!.htmlContent}<p>modifié</p>`,
      htmlSha256: "2".repeat(64),
    },
  };
  const changedDocument = {
    ...current,
    documents: current.documents.map((document, index) =>
      index === 0
        ? { ...document, fileSha256: "c".repeat(64) }
        : document),
  };

  expect(buildReservationPreparationKey(current).length).toBeLessThan(32_000);
  expect(buildReservationPreparationKey(changed)).not.toBe(
    buildReservationPreparationKey(current),
  );
  expect(buildReservationPreparationKey(changedDocument)).not.toBe(
    buildReservationPreparationKey(current),
  );
  expect(result).toMatchObject({ status: "sent" });
  expect(sends).toBe(1);
});

test("refuse côté serveur un member et un dossier bloqué", async () => {
  const member = preparation({ role: "member" });
  const memberResult = await confirmReservationPreparationActionCore(
    initialReservationPreparationActionState,
    form(member),
    {
      loadPreparation: async () => member,
      send: async () => ({ status: "success", deliveryState: "sent" }),
      revalidate: () => undefined,
    },
  );
  expect(memberResult).toEqual({ status: "forbidden" });

  const blocked = preparation({ recipientEmail: null });
  const blockedResult = await confirmReservationPreparationActionCore(
    initialReservationPreparationActionState,
    form(blocked),
    {
      loadPreparation: async () => blocked,
      send: async () => ({ status: "success", deliveryState: "sent" }),
      revalidate: () => undefined,
    },
  );
  expect(blockedResult).toEqual({
    status: "not_ready",
    errorCode: "recipient_email_missing",
  });
});

test("envoie une seule fois via le service idempotent puis revalide les vues", async () => {
  const current = preparation();
  const revalidated: string[] = [];
  const result = await confirmReservationPreparationActionCore(
    initialReservationPreparationActionState,
    form(current),
    {
      loadPreparation: async () => current,
      send: async (input) => {
        expect(input).toEqual({ reservationId, litterId });
        return {
          status: "already_sent",
          deliveryState: "sent",
          attemptId: "attempt-1",
        };
      },
      revalidate: (path) => revalidated.push(path),
    },
  );

  expect(result).toEqual({
    status: "sent",
    deliveryStatus: "already_sent",
    attemptId: "attempt-1",
  });
  expect(revalidated).toEqual([
    "/reservations",
    `/reservations/${reservationId}`,
    `/reservations/${reservationId}/preparer`,
  ]);
});
