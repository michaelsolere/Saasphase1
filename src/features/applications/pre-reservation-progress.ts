import { formatApplicationDate } from "@/features/applications/formatters";
import { formatPrice } from "@/features/reservations/formatters";
import {
  hasVisiblePaidPreReservation,
  hasVisiblePreReservationRequest,
  isNegativeFinalReservationStatus,
} from "@/features/reservations/statuses";

type ProgressReservation = {
  id: string | null;
  status: string | null;
  created_at?: string | null;
  pre_reservation_deadline?: string | null;
};

type ProgressPayment = {
  id?: string | null;
  reservation_id: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  requested_at?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
};

export type PreReservationProgress = {
  requestDone: boolean;
  paidDone: boolean;
  listLabel: "Demande de pré-réservation" | "Pré-réservation réglée" | null;
  requestDetail: string;
  paidDetail: string;
};

function sortByCreatedAtDesc<T extends { created_at?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = a.created_at ? new Date(a.created_at).getTime() : 0;
    const right = b.created_at ? new Date(b.created_at).getTime() : 0;

    return right - left;
  });
}

function getRelevantReservation(reservations: ProgressReservation[]) {
  const visibleReservations = sortByCreatedAtDesc(reservations).filter(
    (reservation) =>
      reservation.id &&
      hasVisiblePreReservationRequest(reservation.status) &&
      !isNegativeFinalReservationStatus(reservation.status),
  );

  return (
    visibleReservations.find((reservation) =>
      hasVisiblePaidPreReservation(reservation.status),
    ) ??
    visibleReservations.find(
      (reservation) => reservation.status === "pre_reservation_requested",
    ) ??
    null
  );
}

function getPaymentForReservation(
  reservation: ProgressReservation | null,
  payments: ProgressPayment[],
) {
  if (!reservation?.id) {
    return null;
  }

  const reservationPayments = sortByCreatedAtDesc(
    payments.filter((payment) => payment.reservation_id === reservation.id),
  );

  return (
    reservationPayments.find((payment) => payment.status === "paid") ??
    reservationPayments.find((payment) => payment.status === "requested") ??
    reservationPayments[0] ??
    null
  );
}

function buildRequestDetail(
  reservation: ProgressReservation | null,
  payment: ProgressPayment | null,
) {
  if (!reservation) {
    return "Aucune demande active n'a encore été créée.";
  }

  const amount = formatPrice(payment?.amount_cents ?? null, payment?.currency ?? null);
  const parts = [`Paiement de ${amount} demandé`];

  if (payment?.requested_at ?? payment?.created_at) {
    parts.push(`demandé le ${formatApplicationDate(payment.requested_at ?? payment.created_at ?? null)}`);
  }

  if (payment?.due_date ?? reservation.pre_reservation_deadline) {
    parts.push(`échéance ${formatApplicationDate(payment?.due_date ?? reservation.pre_reservation_deadline ?? null)}`);
  }

  return `${parts.join(" — ")} — en attente de règlement.`;
}

function buildPaidDetail(payment: ProgressPayment | null) {
  if (!payment || payment.status !== "paid") {
    return "Le règlement de pré-réservation n'est pas encore enregistré.";
  }

  const amount = formatPrice(payment.amount_cents, payment.currency);
  const paidDate = payment.paid_at
    ? ` le ${formatApplicationDate(payment.paid_at)}`
    : "";

  return `Paiement de ${amount} réglé${paidDate}.`;
}

export function getPreReservationProgress({
  reservations,
  payments = [],
}: {
  reservations: ProgressReservation[];
  payments?: ProgressPayment[];
}): PreReservationProgress {
  const reservation = getRelevantReservation(reservations);
  const payment = getPaymentForReservation(reservation, payments);
  const requestDone = Boolean(reservation);
  const paidDone = Boolean(
    reservation && hasVisiblePaidPreReservation(reservation.status),
  );

  return {
    requestDone,
    paidDone,
    listLabel: paidDone
      ? "Pré-réservation réglée"
      : requestDone
        ? "Demande de pré-réservation"
        : null,
    requestDetail: requestDone
      ? buildRequestDetail(reservation, payment)
      : "Aucune demande active n'a encore été créée.",
    paidDetail: paidDone
      ? buildPaidDetail(payment)
      : "Le règlement de pré-réservation n'est pas encore enregistré.",
  };
}
