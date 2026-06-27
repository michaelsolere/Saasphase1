import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatAnimalCoat,
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalStatusLabel,
} from "@/features/animals/formatters";
import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
import {
  adoptReservation,
  cancelReservation,
  updateReservationInternalComment,
  updateReservationPreReservationDeadline,
  updateReservationPrice,
  activateReservation,
  assignAnimalToReservation,
  expireReservation,
  unassignAnimalFromReservation,
  withdrawReservation,
  requestPreReservationBalance,
} from "@/features/reservations/actions";
import { ReservationPaymentForm } from "@/features/payments/reservation-payment-form";
import { ReservationRefundForm } from "@/features/payments/reservation-refund-form";
import {
  initializeReservationDocuments,
} from "@/features/documents/actions";
import { formatPrice, getReservationStatusLabel } from "@/features/reservations/formatters";
import {
  FINAL_RESERVATION_STATUSES,
  isFinalReservationStatus,
} from "@/features/reservations/statuses";
import { ReservationNoteForm } from "@/features/reservations/note-form";
import { ReservationNoteDialog } from "@/features/reservations/note-dialog";
import { ReservationFinanceDialogs } from "@/features/reservations/finance-dialogs";
import { PaymentConfirmDialog } from "@/features/reservations/payment-confirm-dialog";
import { DocumentConfirmDialog } from "@/features/reservations/document-confirm-dialog";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RelatedPayment = {
  id: string;
  amount_cents: number;
  currency: string;
  payment_type: string;
  status: string;
  payment_method: string;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
  due_date: string | null;
  requested_at: string | null;
};

type RelatedDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  signed_at: string | null;
  received_at: string | null;
  file_name: string | null;
  signature_required: boolean;
};

type RelatedPostAdoptionEvent = {
  id: string;
  title: string;
  description: string | null;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
  status: string;
  priority: string;
};

type RelatedReservationEvent = RelatedPostAdoptionEvent & {
  event_type: string;
};

type RelatedReservationNote = {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  visibility: string;
  created_at: string;
  created_by: string | null;
  profiles: { display_name: string | null } | null;
};

type RelatedAnimal = {
  id: string;
  display_name: string;
  temporary_name: string | null;
  call_name: string | null;
  official_name: string | null;
  sex: string;
  status: string;
  birth_date: string | null;
  litter_id: string | null;
  identification_number: string | null;
  color: string | null;
  coat_color: string | null;
};

type ReservationInternalComment = {
  id: string;
  internal_comment: string | null;
  deleted_at: string | null;
};

type ReservationPreReservationDeadline = {
  id: string;
  pre_reservation_deadline: string | null;
  deleted_at: string | null;
};

function getUsefulPostAdoptionEventDate(event: RelatedPostAdoptionEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function getUsefulReservationEventDate(event: RelatedReservationEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function formatEventType(value: string) {
  return value.replaceAll("_", " ");
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Réservation introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Réservation introuvable ou inaccessible.
      </p>
      <Link
        href="/reservations"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux réservations
      </Link>
    </section>
  );
}

function ErrorMessage() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h1 className="text-xl font-semibold">
        Impossible de charger la réservation
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/reservations"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux réservations
      </Link>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  detail,
  href,
  badgeClassName,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  badgeClassName?: string;
}) {
  const content = href ? (
    <Link href={href} className="font-semibold text-accent hover:underline">
      {value}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{value}</span>
  );

  return (
    <div className="rounded-xl border bg-background px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6">
        {badgeClassName ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassName}`}>
            {content}
          </span>
        ) : (
          content
        )}
      </div>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
      ) : null}
    </div>
  );
}

function formatPriceInputValue(priceCents: number | null) {
  if (priceCents === null || priceCents === undefined) {
    return "";
  }

  return (priceCents / 100).toFixed(2);
}

function formatDateInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function FinancialBalanceNotice({
  priceCents,
  paidCents,
  refundedCents,
  currency,
}: {
  priceCents: number | null;
  paidCents: number;
  refundedCents: number;
  currency: string;
}) {
  if (priceCents === null) {
    return (
      <div className="rounded-xl border border-muted bg-surface px-4 py-3.5 text-sm text-muted">
        <span className="font-semibold block mb-1 text-foreground text-sm">
          Solde non déterminé
        </span>
        <p className="text-xs leading-5">
          Le solde ne peut pas être calculé tant qu’aucun tarif convenu n’est renseigné.
        </p>
      </div>
    );
  }

  const remainingBalanceCents = priceCents - paidCents + refundedCents;

  if (remainingBalanceCents > 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3.5 text-sm text-amber-900">
        <span className="font-semibold block mb-1 text-amber-950 text-sm">
          Reste à régler : {formatPrice(remainingBalanceCents, currency)}
        </span>
        <p className="text-xs leading-5">
          Solde restant actuel : {formatPrice(remainingBalanceCents, currency)}.
          Vous pouvez l’utiliser comme montant de solde si le paiement correspond
          au règlement final.
        </p>
      </div>
    );
  }

  if (remainingBalanceCents === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5 text-sm text-emerald-900">
        <span className="font-semibold block mb-1 text-emerald-950 text-sm">
          Réservation soldée
        </span>
        <p className="text-xs leading-5">
          Cette réservation apparaît soldée. Vous pouvez tout de même enregistrer
          un paiement si nécessaire, par exemple pour corriger une situation
          particulière.
        </p>
      </div>
    );
  }

  const overpaidAmount = Math.abs(remainingBalanceCents);

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3.5 text-sm text-rose-900">
      <span className="font-semibold block mb-1 text-rose-950 text-sm">
        Trop-perçu : {formatPrice(overpaidAmount, currency)}
      </span>
      <p className="text-xs leading-5">
        Cette réservation présente un trop-perçu de{" "}
        {formatPrice(overpaidAmount, currency)}. Vérifiez la situation avant
        d’ajouter un nouveau paiement.
      </p>
    </div>
  );
}

type ReservationNextAction = {
  label: string;
  detail: string;
  badgeClassName: string;
};

function getReservationNextAction({
  reservation,
  paymentCount,
  requestedPaymentCount,
  remainingBalanceCents,
  isPaidInFull,
  hasCompleteDeposit,
  totalDocs,
  sentDocs,
  toPrepareDocs,
  commitmentDocument,
  reservationContractDocument,
}: {
  reservation: ReservationOverview;
  paymentCount: number;
  requestedPaymentCount: number;
  remainingBalanceCents: number | null;
  isPaidInFull: boolean;
  hasCompleteDeposit: boolean;
  totalDocs: number;
  sentDocs: number;
  toPrepareDocs: number;
  commitmentDocument: RelatedDocument | undefined;
  reservationContractDocument: RelatedDocument | undefined;
}): ReservationNextAction {
  const attentionBadge = "text-amber-700 bg-amber-50 border-amber-200";
  const followUpBadge = "text-accent bg-accent/10 border-accent/20";
  const advancedBadge = "text-emerald-700 bg-emerald-50 border-emerald-200";
  const neutralBadge = "text-muted bg-muted-soft border-border";
  const mainDocumentsSigned =
    commitmentDocument?.status === "signed" &&
    reservationContractDocument?.status === "signed";
  const hasMissingMainDocuments =
    !commitmentDocument || !reservationContractDocument;
  const hasPositiveRemainingBalance =
    remainingBalanceCents !== null && remainingBalanceCents > 0;

  if (reservation.status === "adopted") {
    return {
      label: "Adoption finalisée.",
      detail: "Le dossier est en suivi post-adoption. Les notes et événements restent consultables.",
      badgeClassName: advancedBadge,
    };
  }

  if (isFinalReservationStatus(reservation.status)) {
    return {
      label: "Dossier finalisé ou clos.",
      detail: "Aucune action automatique n’est attendue pour ce statut.",
      badgeClassName: neutralBadge,
    };
  }

  if (!reservation.application_id) {
    return {
      label: "Compléter le contexte de candidature.",
      detail: "La réservation n’est pas reliée à une candidature. Vérifier le rattachement du projet adoptant.",
      badgeClassName: attentionBadge,
    };
  }

  if (requestedPaymentCount > 0) {
    return {
      label: "Paiement demandé en attente.",
      detail: "Un paiement existe déjà en statut demandé. Vérifier sa réception avant toute suite manuelle.",
      badgeClassName: attentionBadge,
    };
  }

  if (paymentCount === 0) {
    return {
      label: "Aucun paiement enregistré.",
      detail: "Aucun paiement n’est lié à cette réservation pour l’instant. Les parcours directs restent possibles.",
      badgeClassName: attentionBadge,
    };
  }

  if (sentDocs > 0) {
    return {
      label: "Document envoyé, en attente de retour signé.",
      detail: "Au moins un document est envoyé mais pas encore reçu signé.",
      badgeClassName: attentionBadge,
    };
  }

  if (
    reservation.animal_id &&
    (hasMissingMainDocuments || toPrepareDocs > 0 || hasPositiveRemainingBalance)
  ) {
    return {
      label: "Animal attribué, finaliser paiements et documents.",
      detail: "Un animal est lié au dossier. Vérifier les documents principaux et le solde restant.",
      badgeClassName: attentionBadge,
    };
  }

  if (hasMissingMainDocuments || totalDocs === 0 || toPrepareDocs > 0) {
    return {
      label: "Documents adoptant à préparer ou vérifier.",
      detail: "Vérifier le certificat d’engagement, le contrat de réservation et les documents liés au dossier.",
      badgeClassName: followUpBadge,
    };
  }

  if (!reservation.animal_id) {
    return {
      label: "Animal non attribué.",
      detail: "Attribuer un animal lorsque le choix est confirmé. Ce n’est pas bloquant pour tous les parcours.",
      badgeClassName: followUpBadge,
    };
  }

  if (hasPositiveRemainingBalance) {
    return {
      label: "Solde restant à suivre.",
      detail: "Un montant reste à régler ou à vérifier avant la suite du dossier.",
      badgeClassName: attentionBadge,
    };
  }

  if (isPaidInFull && mainDocumentsSigned && reservation.animal_id) {
    return {
      label: "Dossier avancé : préparer la cession/adoption.",
      detail: "Paiements soldés, documents principaux reçus signés et animal attribué.",
      badgeClassName: advancedBadge,
    };
  }

  if (hasCompleteDeposit && reservation.animal_id) {
    return {
      label: "Animal attribué, dossier à suivre.",
      detail: "Les arrhes sont complètes ou suffisantes selon le parcours. Vérifier les derniers éléments avant cession.",
      badgeClassName: followUpBadge,
    };
  }

  return {
    label: "Dossier à suivre.",
    detail: "Indication informative uniquement : aucune règle bloquante ni automatisation n’est déclenchée.",
    badgeClassName: neutralBadge,
  };
}

export default async function ReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    comment_status?: string;
    deadline_status?: string;
    price_status?: string;
    payment_create_status?: string;
    payment_mark_status?: string;
    payment_refund_status?: string;
    activation_status?: string;
    role_status?: string;
    adoption_status?: string;
    animal_status?: string;
    cancellation_status?: string;
    withdrawal_status?: string;
    expiration_status?: string;
    animal_assign_status?: string;
    animal_unassign_status?: string;
    balance_request_status?: string;
    document_action_status?: string;
    note_status?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch reservation detail from view
  const { data: rawReservation, error: readError } = await supabase
    .from("reservation_overview")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const reservation = rawReservation as ReservationOverview | null;

  // Fetch available animals of the organization if reservation has no animal
  let availableAnimals: Array<{
    id: string;
    display_name: string;
    temporary_name: string | null;
    call_name: string | null;
    official_name: string | null;
    sex: string;
    status: string;
    species: string;
    breed: string;
    litter_id: string | null;
  }> = [];
  let availableAnimalsError: unknown = null;

  if (reservation && reservation.organization_id && !reservation.animal_id) {
    const rawAnimalsQuery = supabase
      .from("animals")
      .select("id, display_name, temporary_name, call_name, official_name, sex, status, species, breed, litter_id")
      .eq("organization_id", reservation.organization_id)
      .is("deleted_at", null)
      .in("status", ["born", "active", "available"]);

    if (reservation.litter_id) {
      rawAnimalsQuery.eq("litter_id", reservation.litter_id);
    }

    const { data: rawAnimals, error: fetchAnimalsError } = await rawAnimalsQuery;

    if (fetchAnimalsError) {
      availableAnimalsError = fetchAnimalsError;
    } else if (rawAnimals) {
      const { data: activeResWithAnimals, error: activeResError } = await supabase
        .from("reservations")
        .select("animal_id")
        .eq("organization_id", reservation.organization_id)
        .is("deleted_at", null)
        .not("animal_id", "is", null)
        .not("status", "in", `(${FINAL_RESERVATION_STATUSES.join(",")})`);

      if (activeResError) {
        availableAnimalsError = activeResError;
      } else {
        const assignedAnimalIds = new Set(
          (activeResWithAnimals || [])
            .map((r) => r.animal_id)
            .filter(Boolean)
        );
        availableAnimals = (rawAnimals as typeof availableAnimals).filter(
          (animal) => !assignedAnimalIds.has(animal.id)
        );
      }
    }
  }

  // Fetch the editable internal comment directly because reservation_overview
  // intentionally does not expose it.
  const { data: rawInternalComment, error: internalCommentError } = reservation?.id
    ? await supabase
        .from("reservations")
        .select("id, internal_comment, deleted_at")
        .eq("id", reservation.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  const reservationInternalComment =
    rawInternalComment as ReservationInternalComment | null;

  // Fetch planning fields directly because reservation_overview only exposes
  // the read-only ranks, not the pre-reservation deadline.
  const { data: rawPreReservationDeadline, error: preReservationDeadlineError } =
    reservation?.id
      ? await supabase
          .from("reservations")
          .select("id, pre_reservation_deadline, deleted_at")
          .eq("id", reservation.id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null, error: null };

  const reservationPreReservationDeadline =
    rawPreReservationDeadline as ReservationPreReservationDeadline | null;

  // Fetch related animal
  const { data: rawAnimal, error: animalError } = reservation?.animal_id
    ? await supabase
        .from("animals")
        .select("id, display_name, temporary_name, call_name, official_name, sex, status, birth_date, litter_id, identification_number, color, coat_color, deleted_at")
        .eq("id", reservation.animal_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  const relatedAnimal = rawAnimal as RelatedAnimal | null;

  // Fetch payments
  const { data: rawPayments, error: paymentsError } = reservation?.id
    ? await supabase
        .from("payments")
        .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at, notes, due_date, requested_at")
        .eq("reservation_id", reservation.id)
        .is("deleted_at", null)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const reservationPayments = rawPayments as RelatedPayment[] | null;

  const arrhesPayments = reservationPayments?.filter(
    (p) => p.payment_type === "arrhes" && p.amount_cents === 25000
  ) || [];
  const hasSecondPayment = arrhesPayments.length >= 2;
  const hasSecondPaid = arrhesPayments.filter((p) => p.status === "paid").length >= 2;
  const hasFirstPaid = arrhesPayments.filter((p) => p.status === "paid").length >= 1;

  // Fetch documents
  const { data: rawDocuments, error: documentsError } = reservation?.id
    ? await supabase
        .from("documents")
        .select("id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, file_name, signature_required")
        .eq("reservation_id", reservation.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const reservationDocuments = rawDocuments as RelatedDocument[] | null;

  const hasCommitmentDoc = reservationDocuments?.some((d) => d.document_type === "commitment_certificate") ?? false;
  const hasContractDoc = reservationDocuments?.some((d) => d.document_type === "reservation_contract") ?? false;
  const needsDocInitialization = !hasCommitmentDoc || !hasContractDoc;

  // Fetch read-only post-adoption follow-up events.
  const { data: rawPostAdoptionEvents, error: postAdoptionEventsError } =
    reservation?.id && reservation.status === "adopted"
      ? await supabase
          .from("events")
          .select("id, title, description, planned_at, planned_date, actual_at, created_at, status, priority")
          .eq("reservation_id", reservation.id)
          .eq("event_type", "post_adoption_follow_up")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null, error: null };

  const postAdoptionEvents =
    rawPostAdoptionEvents as RelatedPostAdoptionEvent[] | null;

  // Fetch read-only reservation events outside the post-adoption follow-up.
  const { data: rawReservationEvents, error: reservationEventsError } =
    reservation?.id
      ? await supabase
          .from("events")
          .select("id, title, description, event_type, planned_at, planned_date, actual_at, created_at, status, priority")
          .eq("reservation_id", reservation.id)
          .neq("event_type", "post_adoption_follow_up")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null, error: null };

  const reservationEvents =
    rawReservationEvents as RelatedReservationEvent[] | null;

  // Fetch read-only notes linked to the reservation.
  const { data: rawReservationNotes, error: reservationNotesError } =
    reservation?.id
      ? await supabase
          .from("notes")
          .select("id, title, body, note_type, visibility, created_at, created_by, profiles!created_by ( display_name )")
          .eq("reservation_id", reservation.id)
          .eq("note_type", "internal")
          .eq("visibility", "internal")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null, error: null };

  const reservationNotes =
    rawReservationNotes as RelatedReservationNote[] | null;

  const animalSummaryLabel =
    reservation?.animal_display_name ??
    (relatedAnimal ? getAnimalDisplayName(relatedAnimal) : null) ??
    "Aucun animal attribué";
  const paymentSummaryLabel = reservationPayments && reservation
    ? `${reservationPayments.length} paiement${
        reservationPayments.length > 1 ? "s" : ""
      } lié${reservationPayments.length > 1 ? "s" : ""} · ${
        reservation.paid_cents !== null && reservation.paid_cents !== undefined
          ? formatPrice(reservation.paid_cents, reservation.currency)
          : "montant réglé non renseigné"
      } réglé${
        reservation.refunded_cents !== null &&
        reservation.refunded_cents !== undefined &&
        reservation.refunded_cents > 0
          ? ` · ${formatPrice(reservation.refunded_cents, reservation.currency)} remboursé`
          : ""
      }`
    : "Paiements indisponibles";

  // Remaining balance calculation
  const priceCents = reservation?.price_cents ?? null;
  const paidCents = reservation?.paid_cents ?? 0;
  const refundedCents = reservation?.refunded_cents ?? 0;
  const currency = reservation?.currency ?? "EUR";
  const netPaidCents = paidCents - refundedCents;
  const remainingBalanceCents =
    priceCents === null ? null : priceCents - netPaidCents;
  const hasCompleteDeposit = hasSecondPaid || paidCents >= 50000;
  const isPaidInFull =
    priceCents !== null && netPaidCents >= priceCents;

  let balanceLabel = "Solde restant";
  let balanceValue: React.ReactNode = "";
  if (priceCents === null) {
    balanceLabel = "Solde restant";
    balanceValue = <span className="text-muted-foreground">Solde non déterminé</span>;
  } else {
    const balanceRemainingCents = priceCents - netPaidCents;

    if (balanceRemainingCents > 0) {
      balanceLabel = "Reste à régler";
      balanceValue = (
        <span className="font-semibold text-amber-700">
          {formatPrice(balanceRemainingCents, currency)}
        </span>
      );
    } else if (balanceRemainingCents === 0) {
      balanceLabel = "Réservation soldée";
      balanceValue = (
        <span className="font-semibold text-emerald-700">
          Réservation soldée
        </span>
      );
    } else {
      balanceLabel = "Trop-perçu";
      balanceValue = (
        <span className="font-semibold text-rose-700">
          {formatPrice(Math.abs(balanceRemainingCents), currency)}
        </span>
      );
    }
  }
  const documentCount = reservationDocuments?.length ?? 0;
  const paymentCount = reservationPayments?.length ?? 0;
  const paidPaymentCount =
    reservationPayments?.filter((p) => p.status === "paid").length ?? 0;
  const requestedPaymentCount =
    reservationPayments?.filter((p) => p.status === "requested").length ?? 0;
  const followUpEventCount = postAdoptionEvents?.length ?? 0;
  const followUpNoteCount = reservationNotes?.length ?? 0;
  const followUpSummaryLabel =
    postAdoptionEventsError || reservationNotesError
      ? "Suivi partiellement indisponible"
      : followUpEventCount === 0 && followUpNoteCount === 0
        ? "Aucun élément enregistré"
        : `${followUpEventCount} événement${
            followUpEventCount > 1 ? "s" : ""
          }, ${followUpNoteCount} note${followUpNoteCount > 1 ? "s" : ""}`;

  const totalDocs = reservationDocuments?.length ?? 0;
  const sentDocs = reservationDocuments?.filter((d) => d.status === "sent").length ?? 0;
  const signedDocs = reservationDocuments?.filter((d) => d.status === "signed").length ?? 0;
  const toPrepareDocs = reservationDocuments?.filter((d) => d.status === "to_generate").length ?? 0;
  const commitmentDocument = reservationDocuments?.find(
    (d) => d.document_type === "commitment_certificate",
  );
  const reservationContractDocument = reservationDocuments?.find(
    (d) => d.document_type === "reservation_contract",
  );
  const saleCertificateDocument = reservationDocuments?.find(
    (d) => d.document_type === "sale_certificate",
  );
  const missingReservationDocumentLabels = [
    commitmentDocument ? null : "certificat d’engagement",
    reservationContractDocument ? null : "contrat de réservation",
  ].filter(Boolean);

  let docsSummaryText = "";
  if (totalDocs === 0) {
    docsSummaryText = "Aucun document lié";
  } else if (signedDocs === totalDocs) {
    docsSummaryText = "Tous les documents reçus signés";
  } else {
    docsSummaryText = `${signedDocs} signé(s), ${sentDocs} envoyé(s), ${toPrepareDocs} à générer`;
  }

  let paymentsSummaryText = "";
  let paymentsSummaryColor = "text-muted bg-muted-soft border-border";

  if (isPaidInFull) {
    paymentsSummaryText = "Paiement intégral / dossier soldé";
    paymentsSummaryColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  } else if (hasCompleteDeposit) {
    paymentsSummaryText = "Arrhes complètes (500 € payés)";
    paymentsSummaryColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  } else if (hasFirstPaid || paidCents > 0) {
    paymentsSummaryText = `Arrhes partielles (${formatPrice(paidCents, currency)} payés)`;
    paymentsSummaryColor = "text-amber-700 bg-amber-50 border-amber-200";
  } else {
    paymentsSummaryText = "En attente de paiement / d'arrhes";
    paymentsSummaryColor = "text-muted bg-muted-soft border-border";
  }

  const financialSummaryDetail = paymentsError
    ? "Paiements partiellement indisponibles."
    : paymentCount === 0
      ? priceCents === null
        ? "Aucun paiement enregistré, tarif convenu non renseigné."
        : `Aucun paiement enregistré. Tarif convenu : ${formatPrice(priceCents, currency)}.`
      : [
          `${paymentCount} paiement${paymentCount > 1 ? "s" : ""} lié${paymentCount > 1 ? "s" : ""}`,
          `${formatPrice(paidCents, currency)} payé${paidCents > 0 ? "s" : ""}`,
          refundedCents > 0
            ? `${formatPrice(refundedCents, currency)} remboursé`
            : null,
          remainingBalanceCents === null
            ? "solde non déterminé"
            : remainingBalanceCents > 0
              ? `${formatPrice(remainingBalanceCents, currency)} restant`
              : remainingBalanceCents === 0
                ? "solde à zéro"
                : `${formatPrice(Math.abs(remainingBalanceCents), currency)} de trop-perçu`,
        ]
          .filter(Boolean)
          .join(" · ");

  const documentSummaryDetail = documentsError
    ? "Documents partiellement indisponibles."
    : totalDocs === 0
      ? "Aucun document lié à cette réservation."
      : [
          commitmentDocument
            ? `Certificat : ${getDocumentStatusLabel(commitmentDocument.status, commitmentDocument.document_type)}`
            : null,
          reservationContractDocument
            ? `Contrat : ${getDocumentStatusLabel(reservationContractDocument.status, reservationContractDocument.document_type)}`
            : null,
          saleCertificateDocument
            ? `Attestation : ${getDocumentStatusLabel(saleCertificateDocument.status, saleCertificateDocument.document_type)}`
            : null,
          missingReservationDocumentLabels.length > 0
            ? `À vérifier : ${missingReservationDocumentLabels.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const scopeSummaryValue = reservation?.litter_name ??
    reservation?.litter_group_name ??
    "Portée ou groupe non renseigné";
  const scopeSummaryDetail = reservation?.litter_id
    ? "Portée précise liée au dossier."
    : reservation?.litter_group_name
      ? "Groupe de portée lié, portée précise à confirmer plus tard."
      : "Aucune portée précise ni groupe renseigné.";
  const animalSummaryDetail = relatedAnimal
    ? [
        getAnimalSexLabel(relatedAnimal.sex),
        formatAnimalDate(relatedAnimal.birth_date),
        formatAnimalCoat(relatedAnimal),
      ]
        .filter((value) => value && value !== "Non renseigné")
        .join(" · ") || "Animal attribué, détails complémentaires à vérifier."
    : "Animal non attribué pour l’instant. Ce n’est pas bloquant pour tous les parcours.";
  const applicationSummaryDetail = reservation?.application_id
    ? "Projet d’adoption lié au dossier."
    : "Aucune candidature liée à cette réservation.";

  const nextAction = reservation
    ? getReservationNextAction({
        reservation,
        paymentCount,
        requestedPaymentCount,
        remainingBalanceCents,
        isPaidInFull,
        hasCompleteDeposit,
        totalDocs,
        sentDocs,
        toPrepareDocs,
        commitmentDocument,
        reservationContractDocument,
      })
    : null;

  const sectionNavItems = [
    { href: "#reservation-details", label: "Réservation" },
    { href: "#scope-and-animal", label: "Portée / animal" },
    { href: "#payments", label: "Paiements" },
    { href: "#documents", label: "Documents" },
    { href: "#notes", label: "Notes" },
    { href: "#history", label: "Historique" },
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/reservations"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux réservations
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/candidatures"
          className="text-sm font-medium text-accent hover:underline"
        >
          Candidatures
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/contacts"
          className="text-sm font-medium text-accent hover:underline"
        >
          Contacts
        </Link>
      </div>

      <div className="mt-8">
        {readError ? (
          <ErrorMessage />
        ) : !reservation ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            {query.price_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le tarif convenu a bien été mis à jour.
              </p>
            ) : null}

            {query.price_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le tarif convenu n’a pas pu être mis à jour. Aucune autre
                donnée n’a été modifiée.
              </p>
            ) : null}

            {query.comment_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le commentaire interne de réservation a bien été mis à jour.
              </p>
            ) : null}

            {query.comment_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le commentaire interne n’a pas pu être mis à jour. Aucune autre
                donnée n’a été modifiée.
              </p>
            ) : null}

            {query.deadline_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                L’échéance de pré-réservation a bien été mise à jour.
              </p>
            ) : null}

            {query.deadline_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’échéance de pré-réservation n’a pas pu être mise à jour.
                Aucune autre donnée n’a été modifiée.
              </p>
            ) : null}

            {query.payment_create_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le paiement a bien été enregistré.
              </p>
            ) : null}

            {query.payment_create_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le paiement n’a pas pu être enregistré. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.payment_mark_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le paiement a bien été marqué comme payé.
              </p>
            ) : null}

            {query.payment_mark_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le paiement n’a pas pu être marqué comme payé. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.payment_mark_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Ce paiement n’est plus dans un état permettant de le marquer comme payé depuis la réservation.
              </p>
            ) : null}

            {query.balance_request_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La demande de complément des arrhes a bien été créée.
              </p>
            ) : null}

            {query.balance_request_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La demande de complément des arrhes n’a pas pu être créée. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.document_action_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                L’action sur le document a été effectuée avec succès.
              </p>
            ) : null}

            {query.document_action_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’action sur le document n’a pas pu être effectuée. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.note_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La note interne a bien été ajoutée.
              </p>
            ) : null}

            {query.note_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La note interne n’a pas pu être ajoutée. Vérifiez le contenu saisi et réessayez.
              </p>
            ) : null}

            {query.payment_refund_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Remboursement enregistré. Le solde de la réservation a été mis à jour.
              </p>
            ) : null}

            {query.payment_refund_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Impossible d’enregistrer le remboursement. Vérifiez les informations saisies et réessayez. Aucune autre donnée n’a été modifiée.
              </p>
            ) : null}

            {query.activation_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La réservation a été confirmée.
              </p>
            ) : null}

            {query.activation_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation ne peut pas être confirmée dans son état actuel.
              </p>
            ) : null}

            {query.activation_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation n’a pas pu être confirmée. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.role_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’opération a bien été réalisée, mais le rôle du contact n’a
                pas pu être mis à jour. Aucune autre donnée n’a été modifiée.
              </p>
            ) : null}

            {query.adoption_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                L’adoption a été finalisée.
              </p>
            ) : null}

            {query.adoption_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation ne peut pas être finalisée dans son état actuel.
              </p>
            ) : null}

            {query.adoption_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’adoption n’a pas pu être finalisée. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.animal_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’adoption a été finalisée, mais le statut de l’animal n’a pas
                pu être mis à jour. Aucune autre donnée n’a été modifiée.
              </p>
            ) : null}

            {query.cancellation_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Réservation annulée.
              </p>
            ) : null}

            {query.cancellation_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation ne peut pas être annulée dans son état actuel.
              </p>
            ) : null}

            {query.cancellation_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation n’a pas pu être annulée. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.withdrawal_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Réservation marquée comme désistée.
              </p>
            ) : null}

            {query.withdrawal_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation ne peut pas être marquée comme désistée dans son état actuel.
              </p>
            ) : null}

            {query.withdrawal_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le désistement n’a pas pu être enregistré. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.expiration_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Réservation marquée comme expirée.
              </p>
            ) : null}

            {query.expiration_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation ne peut pas être marquée comme expirée dans son état actuel.
              </p>
            ) : null}

            {query.expiration_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’expiration n’a pas pu être enregistrée. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.animal_assign_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                L’animal a été attribué à la réservation.
              </p>
            ) : null}

            {query.animal_assign_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’attribution n’a pas pu être effectuée. Aucune autre donnée n’a été modifiée.
              </p>
            ) : null}

            {query.animal_assign_status === "already_assigned" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Cette réservation possède déjà un animal attribué.
              </p>
            ) : null}

            {query.animal_assign_status === "animal_unavailable" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Cet animal n’est plus disponible pour attribution.
              </p>
            ) : null}

            {query.animal_unassign_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                L’attribution de l’animal a été retirée.
              </p>
            ) : null}

            {query.animal_unassign_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Le retrait de l’attribution n’a pas pu être effectué. Aucune donnée n’a été modifiée.
              </p>
            ) : null}

            {query.animal_unassign_status === "no_animal" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Cette réservation ne possède aucun animal attribué.
              </p>
            ) : null}

            {query.animal_unassign_status === "invalid_state" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’attribution de cette réservation ne peut plus être modifiée.
              </p>
            ) : null}

            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Réservation · Consultation · complétion limitée
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Réservation de {reservation.contact_display_name ?? "Client anonyme"}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créée le {formatApplicationDate(reservation.created_at)}
                </p>
              </div>
            </header>

            {/* Résumé du dossier */}
            <section id="dossier-summary" className="mt-8 rounded-2xl border bg-surface p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Résumé du dossier adoptant
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                    Lecture rapide du dossier : personnes liées, portée ou
                    animal, état financier, documents et prochaine étape
                    indicative.
                  </p>
                </div>
                <span className="inline-flex w-fit rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
                  Lecture seule
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryItem
                  label="Adoptant"
                  value={reservation.contact_display_name ?? "Client associé"}
                  detail="Mémoire relationnelle du dossier."
                  href={
                    reservation.contact_id
                      ? `/contacts/${reservation.contact_id}`
                      : undefined
                  }
                />
                <SummaryItem
                  label="Candidature"
                  value={reservation.application_id ? "Candidature liée" : "Non renseignée"}
                  detail={applicationSummaryDetail}
                  href={
                    reservation.application_id
                      ? `/candidatures/${reservation.application_id}`
                      : undefined
                  }
                />
                <SummaryItem
                  label="Statut"
                  value={getReservationStatusLabel(reservation.status)}
                  detail={`Créée le ${formatApplicationDate(reservation.created_at)}`}
                  badgeClassName="text-muted bg-muted-soft border-border"
                />
                <SummaryItem
                  label="Portée / groupe"
                  value={scopeSummaryValue}
                  detail={scopeSummaryDetail}
                  href={
                    reservation.litter_id
                      ? `/litters/${reservation.litter_id}`
                      : undefined
                  }
                />
                <SummaryItem
                  label="Animal"
                  value={animalSummaryLabel}
                  detail={animalSummaryDetail}
                  href={
                    reservation.animal_id
                      ? `/animals/${reservation.animal_id}`
                      : undefined
                  }
                />
                <SummaryItem
                  label="Paiements"
                  value={paymentsSummaryText}
                  detail={financialSummaryDetail}
                  badgeClassName={paymentsSummaryColor}
                />
                <SummaryItem
                  label="Documents"
                  value={docsSummaryText}
                  detail={documentSummaryDetail}
                />
                <SummaryItem
                  label="Suivi"
                  value={followUpSummaryLabel}
                  detail="Notes et événements restent consultables plus bas dans la fiche."
                />
                {nextAction ? (
                  <SummaryItem
                    label="Prochaine action"
                    value={nextAction.label}
                    detail={nextAction.detail}
                    badgeClassName={nextAction.badgeClassName}
                  />
                ) : null}
              </div>

              <nav
                aria-label="Sections de la réservation"
                className="mt-6 flex flex-wrap gap-2 border-t pt-4"
              >
                {sectionNavItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </section>

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section id="reservation-details" className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations de la réservation
                  </h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Statut"
                      value={getReservationStatusLabel(reservation.status)}
                    />
                    <DetailItem
                      label="Préférence de sexe"
                      value={getSexPreferenceLabel(reservation.reserved_sex_preference)}
                    />
                    <DetailItem
                      label="Tarif convenu"
                      value={formatPrice(reservation.price_cents, reservation.currency)}
                    />
                    <DetailItem
                      label="Montant réglé"
                      value={
                        reservation.paid_cents !== null && reservation.paid_cents !== undefined
                          ? formatPrice(reservation.paid_cents, reservation.currency)
                          : "Aucun paiement"
                      }
                    />
                    {reservation.refunded_cents !== null && reservation.refunded_cents !== undefined && reservation.refunded_cents > 0 ? (
                      <DetailItem
                        label="Montant remboursé"
                        value={formatPrice(reservation.refunded_cents, reservation.currency)}
                      />
                    ) : null}
                    <DetailItem
                      label={balanceLabel}
                      value={balanceValue}
                    />
                  </dl>

                  {reservation.status === "pre_reservation_requested" ? (
                    <div className="mt-8 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Pré-réservation demandée
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-amber-950">
                        La campagne de pré-réservation a été lancée. Le dossier est en attente du premier paiement de 250 €.
                      </p>
                    </div>
                  ) : null}

                  {reservation.status === "pre_reservation_paid" ? (
                    <div className="mt-8 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-4">
                      {hasSecondPaid ? (
                        <>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                            Dossier en pré-réservation payée — Arrhes complètes
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-emerald-950">
                            Arrhes complètes : 500 € / 500 € payés. Le dossier est financièrement validé, mais l’attribution de l’animal, les documents et l’adoption restent à traiter séparément.
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                            Dossier en pré-réservation payée
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-emerald-950">
                            Le premier paiement de 250 € a été validé. Le dossier est en attente de disponibilité réelle, de compatibilité avec le sexe souhaité / le rang, et d’une proposition acceptée. Aucun complément d’arrhes n’est demandé automatiquement à ce stade.
                          </p>
                        </>
                      )}
                    </div>
                  ) : null}

                  {isFinalReservationStatus(reservation.status) ? (
                    <div className="mt-8 rounded-xl border bg-background px-4 py-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Statut final
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        Cette réservation est finalisée avec le statut :{" "}
                        <span className="font-semibold text-foreground">
                          {getReservationStatusLabel(reservation.status)}
                        </span>
                        . Les actions de statut ne sont plus disponibles.
                      </p>
                    </div>
                  ) : null}

                  {reservation.status === "adopted" ? (
                    <div className="mt-8 rounded-xl border bg-background px-4 py-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Synthèse d’adoption
                      </h3>
                      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                        <DetailItem
                          label="Statut"
                          value="Adoption finalisée"
                        />
                        <DetailItem
                          label="Contact"
                          value={reservation.contact_display_name}
                        />
                        <DetailItem
                          label="Animal"
                          value={animalSummaryLabel}
                        />
                        <DetailItem
                          label="Prix convenu"
                          value={formatPrice(
                            reservation.price_cents,
                            reservation.currency,
                          )}
                        />
                        <DetailItem
                          label="Paiements"
                          value={paymentSummaryLabel}
                        />
                        <DetailItem
                          label="Documents"
                          value={`${documentCount} document${
                            documentCount > 1 ? "s" : ""
                          } lié${documentCount > 1 ? "s" : ""}`}
                        />
                        <DetailItem
                          label="Adoption finalisée le"
                          value={formatApplicationDate(
                            reservation.adoption_completed_at,
                          )}
                        />
                        <DetailItem
                          label="Suivi post-adoption"
                          value={followUpSummaryLabel}
                        />
                      </dl>
                    </div>
                  ) : null}

                  {reservation.status === "draft" ||
                  reservation.status === "active" ||
                  reservation.status === "pre_reservation_paid" ? (
                    <div className="mt-8 border-t pt-6">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Actions de statut
                      </h3>

                      {reservation.status === "draft" ? (
                        <form
                          action={activateReservation}
                          className="mt-4"
                        >
                          <input
                            type="hidden"
                            name="reservation_id"
                            value={id}
                          />
                          <p className="max-w-2xl text-xs leading-5 text-muted">
                            Cette action confirme manuellement la réservation. Elle
                            ne crée ni paiement, ni document, ni attribution
                            d’animal.
                          </p>
                          <button
                            type="submit"
                            className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Confirmer la réservation
                          </button>
                        </form>
                      ) : null}

                      {reservation.status === "active" ? (
                        <div className="mt-5 space-y-6">
                          <div>
                            <h4 className="text-sm font-semibold">
                              Finaliser positivement
                            </h4>
                            <form
                              action={adoptReservation}
                              className="mt-3"
                            >
                              <input
                                type="hidden"
                                name="reservation_id"
                                value={id}
                              />
                              <p className="max-w-2xl text-xs leading-5 text-muted">
                                Cette action finalise l’adoption : la réservation
                                passera en adoptée, la date d’adoption sera renseignée,
                                le contact sera marqué comme adoptant et, si un animal
                                est lié, son statut sera mis à jour comme adopté.
                              </p>
                              <button
                                type="submit"
                                className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                              >
                                Finaliser l’adoption
                              </button>
                            </form>
                          </div>

                          <div className="border-t pt-5">
                            <h4 className="text-sm font-semibold">
                              Sorties finales
                            </h4>
                            <div className="mt-4 space-y-5">
                              <form action={cancelReservation}>
                                <input
                                  type="hidden"
                                  name="reservation_id"
                                  value={id}
                                />
                                <p className="max-w-2xl text-xs leading-5 text-muted">
                                  Cette action annule manuellement la réservation. Elle ne
                                  crée aucun remboursement, ne modifie aucun paiement, ne
                                  crée ni document ni note, ne modifie pas l’animal, ne
                                  retire pas automatiquement l’attribution, et ne modifie
                                  ni tarif, ni commentaire, ni échéance.
                                </p>
                                <button
                                  type="submit"
                                  className="mt-4 inline-flex w-fit rounded-xl border border-red-200 bg-red-50/50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100/60"
                                >
                                  Annuler la réservation
                                </button>
                              </form>

                              <form action={withdrawReservation}>
                                <input
                                  type="hidden"
                                  name="reservation_id"
                                  value={id}
                                />
                                <p className="max-w-2xl text-xs leading-5 text-muted">
                                  Cette action enregistre manuellement un désistement ou
                                  retrait du candidat ou adoptant. Elle ne crée aucun
                                  remboursement, ne modifie aucun paiement, ne crée ni
                                  document ni note, ne modifie pas l’animal, ne retire
                                  pas automatiquement l’attribution, et ne modifie ni
                                  tarif, ni commentaire, ni échéance.
                                </p>
                                <button
                                  type="submit"
                                  className="mt-4 inline-flex w-fit rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100/60"
                                >
                                  Marquer comme désistée
                                </button>
                              </form>

                              <form action={expireReservation}>
                                <input
                                  type="hidden"
                                  name="reservation_id"
                                  value={id}
                                />
                                <p className="max-w-2xl text-xs leading-5 text-muted">
                                  Cette action marque manuellement la réservation comme
                                  expirée. Elle ne crée aucun remboursement, ne modifie
                                  aucun paiement, ne crée ni document ni note, ne modifie
                                  pas l’animal, ne retire pas automatiquement
                                  l’attribution, ne modifie ni tarif, ni commentaire, ni
                                  échéance, et ne lance aucune automatisation liée à
                                  l’échéance de pré-réservation.
                                </p>
                                <button
                                  type="submit"
                                  className="mt-4 inline-flex w-fit rounded-xl border border-slate-300 bg-slate-50/70 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                                >
                                  Marquer comme expirée
                                </button>
                              </form>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {reservation.status === "pre_reservation_paid" ? (
                        <div className="mt-4">
                          {!hasSecondPayment ? (
                            <form
                              action={requestPreReservationBalance}
                              className="mt-4"
                            >
                              <input
                                type="hidden"
                                name="reservation_id"
                                value={id}
                              />
                              <p className="max-w-2xl text-xs leading-5 text-muted">
                                Cette action va émettre la deuxième demande de paiement de 250 € pour finaliser le complément des arrhes (total attendu : 500 €).
                              </p>
                              <button
                                type="submit"
                                className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                              >
                                Demander le complément des arrhes
                              </button>
                            </form>
                          ) : (
                            <div className="mt-4 space-y-4">
                              <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                                <p className="text-sm text-slate-700">
                                  {hasSecondPaid ? (
                                    "Le complément des arrhes a été payé (2/2 payés)."
                                  ) : (
                                    "Complément demandé (1/2 payé) : la deuxième demande de paiement de 250 € a été émise."
                                  )}
                                </p>
                              </div>
                            </div>
                          )}

                          {hasFirstPaid && needsDocInitialization ? (
                            <form
                              action={initializeReservationDocuments}
                              className="border-t mt-6 pt-6"
                            >
                              <input
                                type="hidden"
                                name="reservation_id"
                                value={id}
                              />
                              <p className="max-w-2xl text-xs leading-5 text-muted">
                                Le premier versement des arrhes est validé. Vous pouvez maintenant initialiser la checklist des documents de réservation attendus (Certificat d’engagement et de connaissance, Contrat de réservation).
                              </p>
                              <button
                                type="submit"
                                className="mt-3 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                              >
                                Initialiser les documents de réservation
                              </button>
                            </form>
                          ) : hasFirstPaid ? (
                            <div className="border-t mt-6 pt-6">
                              <p className="text-xs text-muted">
                                Documents de réservation initialisés. Retrouvez le suivi d&apos;avancement des signatures dans la section &quot;Documents liés&quot; ci-dessous.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <form
                    action={updateReservationPrice}
                    className="mt-8 border-t pt-6"
                  >
                    <input
                      type="hidden"
                      name="reservation_id"
                      value={id}
                    />
                    <label
                      htmlFor="price"
                      className="text-xs font-semibold uppercase tracking-wide text-muted"
                    >
                      Tarif convenu
                    </label>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="max-w-xs flex-1">
                        <input
                          id="price"
                          name="price"
                          type="text"
                          inputMode="decimal"
                          defaultValue={formatPriceInputValue(
                            reservation.price_cents,
                          )}
                          placeholder="Ex. 1600,00"
                          className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                        />
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Saisir un montant en euros. Laisser vide pour retirer
                          le tarif.
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Enregistrer le tarif
                      </button>
                    </div>
                  </form>

                  <div className="mt-8 border-t pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Commentaire interne de réservation
                    </h3>
                    {internalCommentError ? (
                      <p className="mt-3 text-sm text-muted">
                        Le commentaire interne n’est pas disponible pour le
                        moment.
                      </p>
                    ) : (
                      <form
                        action={updateReservationInternalComment}
                        className="mt-3"
                      >
                        <input
                          type="hidden"
                          name="reservation_id"
                          value={id}
                        />
                        <textarea
                          name="internal_comment"
                          rows={4}
                          maxLength={2000}
                          defaultValue={
                            reservationInternalComment?.internal_comment ?? ""
                          }
                          className="w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 outline-none transition focus:border-accent"
                        />
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Commentaire synthétique interne lié à cette
                          réservation. Pour un historique daté, utiliser plus
                          tard les notes internes.
                        </p>
                        <button
                          type="submit"
                          className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                          Enregistrer le commentaire
                        </button>
                      </form>
                    )}
                  </div>
                </section>

                <section id="scope-and-animal" className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Attribution et portée</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Portée"
                      value={
                        reservation.litter_id ? (
                          <Link
                            href={`/litters/${reservation.litter_id}`}
                            className="font-medium text-accent hover:underline"
                          >
                            {reservation.litter_name}
                          </Link>
                        ) : (
                          reservation.litter_name
                        )
                      }
                    />
                    <DetailItem
                      label="Groupe de portée"
                      value={reservation.litter_group_name}
                    />
                    <DetailItem
                      label="Animal attribué"
                      value={
                        reservation.animal_id ? (
                          <Link
                            href={`/animals/${reservation.animal_id}`}
                            className="font-medium text-accent hover:underline"
                          >
                            {reservation.animal_display_name}
                          </Link>
                        ) : (
                          "Animal non attribué pour l’instant"
                        )
                      }
                    />
                    <DetailItem
                      label="Date d'adoption prévue"
                      value={formatApplicationDate(reservation.adoption_planned_at)}
                    />
                    <DetailItem
                      label="Date d'adoption effective"
                      value={formatApplicationDate(reservation.adoption_completed_at)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">Animal lié</h2>
                      {relatedAnimal ? (
                        <p className="mt-2 text-sm text-muted">
                          {getAnimalDisplayName(relatedAnimal)}
                        </p>
                      ) : null}
                    </div>
                    {relatedAnimal?.id ? (
                      <Link
                        href={`/animals/${relatedAnimal.id}`}
                        className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter
                      </Link>
                    ) : null}
                  </div>

                  {animalError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger l’animal lié.
                    </p>
                  ) : !relatedAnimal ? (
                    <div className="space-y-6">
                      <p className="mt-5 text-sm text-muted">
                        Aucun animal lié à cette réservation.
                      </p>

                      {!isFinalReservationStatus(reservation.status) && (
                        <div className="border-t pt-6">
                          {availableAnimalsError ? (
                            <p role="alert" className="text-sm text-amber-800">
                              Impossible de charger les animaux disponibles.
                            </p>
                          ) : availableAnimals.length === 0 ? (
                            <p className="text-sm text-muted">
                              {reservation.litter_id
                                ? "Aucun animal disponible dans cette portée."
                                : "Aucun animal attribuable trouvé pour cette réservation."}
                            </p>
                          ) : (
                            <form action={assignAnimalToReservation} className="space-y-4">
                              <input type="hidden" name="reservation_id" value={id} />
                              <div>
                                <label htmlFor="animal_id" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                                  Attribuer un animal
                                </label>
                                <p className="mb-3 text-xs leading-5 text-muted">
                                  {reservation.litter_id
                                    ? "Seuls les animaux disponibles de la portée liée sont proposés."
                                    : "Seuls les animaux disponibles de l’organisation sont proposés."}
                                </p>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                  <div className="max-w-xs flex-1">
                                    <select
                                      id="animal_id"
                                      name="animal_id"
                                      required
                                      className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                                    >
                                      <option value="">-- Choisir un animal --</option>
                                      {availableAnimals.map((animal) => {
                                        const name = getAnimalDisplayName(animal);
                                        const sex = getAnimalSexLabel(animal.sex);
                                        const breed = animal.breed || "Race inconnue";
                                        return (
                                          <option key={animal.id} value={animal.id}>
                                            {name} ({sex} - {breed})
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                  <button
                                    type="submit"
                                    className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                                  >
                                    Attribuer l’animal
                                  </button>
                                </div>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                        <DetailItem
                          label="Nom"
                          value={getAnimalDisplayName(relatedAnimal)}
                        />
                        <DetailItem
                          label="Sexe"
                          value={getAnimalSexLabel(relatedAnimal.sex)}
                        />
                        <DetailItem
                          label="Statut"
                          value={getAnimalStatusLabel(relatedAnimal.status)}
                        />
                        <DetailItem
                          label="Date de naissance"
                          value={formatAnimalDate(relatedAnimal.birth_date)}
                        />
                        <DetailItem
                          label="Portée liée"
                          value={reservation.litter_name}
                        />
                        <DetailItem
                          label="Identification"
                          value={relatedAnimal.identification_number}
                        />
                        <DetailItem
                          label="Couleur ou robe"
                          value={formatAnimalCoat(relatedAnimal)}
                        />
                      </dl>

                      {!isFinalReservationStatus(reservation.status) && (
                        <div className="border-t pt-6">
                          <form action={unassignAnimalFromReservation} className="space-y-4">
                            <input type="hidden" name="reservation_id" value={id} />
                            <div className="flex flex-col gap-3">
                              <p className="text-xs text-muted">
                                Cela retire uniquement le lien entre la réservation et l’animal. L’animal n’est pas supprimé.
                              </p>
                              <button
                                type="submit"
                                className="inline-flex w-fit rounded-xl border border-red-200 bg-red-50/50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100/60 hover:border-red-300"
                              >
                                Retirer l’attribution
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Priorité et suivi</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Rang initial"
                      value={reservation.rank_initial !== null ? String(reservation.rank_initial) : null}
                    />
                    <DetailItem
                      label="Rang actif"
                      value={reservation.rank_active !== null ? String(reservation.rank_active) : null}
                    />
                    <DetailItem
                      label="Dernière mise à jour"
                      value={formatApplicationDate(reservation.updated_at)}
                    />
                  </dl>

                  <div className="mt-8 border-t pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Échéance de pré-réservation
                    </h3>
                    {preReservationDeadlineError ? (
                      <p className="mt-3 text-sm text-muted">
                        L’échéance de pré-réservation n’est pas disponible pour
                        le moment.
                      </p>
                    ) : (
                      <form
                        action={updateReservationPreReservationDeadline}
                        className="mt-3"
                      >
                        <input
                          type="hidden"
                          name="reservation_id"
                          value={id}
                        />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="max-w-xs flex-1">
                            <input
                              name="pre_reservation_deadline"
                              type="date"
                              defaultValue={formatDateInputValue(
                                reservationPreReservationDeadline
                                  ?.pre_reservation_deadline ?? null,
                              )}
                              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                            />
                            <p className="mt-2 text-xs leading-5 text-muted">
                              Date limite de suivi de la pré-réservation. Cette
                              date ne confirme pas la réservation et ne change
                              pas son statut.
                            </p>
                          </div>
                          <button
                            type="submit"
                            className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Enregistrer l’échéance
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </section>

                {reservation.status === "adopted" ? (
                  <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                    <h2 className="text-xl font-semibold">
                      Suivi post-adoption
                    </h2>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
                      Cet espace centralisera plus tard les nouvelles de
                      l’adoptant, les rappels, les documents ou photos, les
                      événements et les notes de suivi après le départ.
                    </p>

                    <div className="mt-8 border-t pt-6">
                      <h3 className="text-base font-semibold">
                        Événements de suivi
                      </h3>

                      {postAdoptionEventsError ? (
                        <p role="alert" className="mt-5 text-sm text-amber-800">
                          Impossible de charger le suivi post-adoption.
                        </p>
                      ) : postAdoptionEvents && postAdoptionEvents.length > 0 ? (
                        <div className="mt-5 divide-y divide-border">
                          {postAdoptionEvents.map((event) => {
                            const dateText = formatApplicationDate(
                              getUsefulPostAdoptionEventDate(event),
                            );

                            return (
                              <div
                                key={event.id}
                                className="py-5 first:pt-0 last:pb-0"
                              >
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className="font-semibold text-foreground text-sm">
                                      {event.title}
                                    </span>
                                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                      {event.status}
                                    </span>
                                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                      Priorité : {event.priority}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted">
                                    Date : {dateText}
                                  </p>
                                  {event.description ? (
                                    <p className="text-sm leading-6 text-muted">
                                      {event.description}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-5 rounded-xl border border-dashed bg-background px-4 py-4 text-sm text-muted">
                          Aucun suivi post-adoption enregistré pour le moment.
                        </p>
                      )}
                    </div>

                    <p className="mt-6 rounded-xl border border-dashed bg-background px-4 py-3 text-xs leading-5 text-muted">
                      Les documents déjà liés à cette réservation restent
                      visibles dans la section Documents liés.
                    </p>
                  </section>
                ) : null}

                <section id="notes" className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Notes internes
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                        Mémoire interne du dossier adoptant. Ces notes ne sont
                        pas envoyées à l’adoptant.
                      </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
                      Interne
                    </span>
                  </div>

                  {reservationNotesError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les notes internes liées à la réservation.
                    </p>
                  ) : reservationNotes && reservationNotes.length > 0 ? (
                    <div className="mt-5 divide-y divide-border">
                      {reservationNotes.map((note) => {
                        const authorName =
                          note.profiles?.display_name || "Auteur inconnu";

                        return (
                          <div
                            key={note.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="space-y-2">
                              {note.title ? (
                                <p className="font-semibold text-foreground text-sm">
                                  {note.title}
                                </p>
                              ) : null}
                              <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                                {note.body}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                <span>
                                  {formatApplicationDate(note.created_at)}
                                </span>
                                <span aria-hidden="true">•</span>
                                <span>Note interne</span>
                                <span aria-hidden="true">•</span>
                                <span>Par {authorName}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-5 rounded-xl border border-dashed bg-background px-4 py-4 text-sm text-muted">
                      Aucune note interne pour cette réservation.
                    </p>
                  )}

                  <div className="mt-6 border-t pt-6">
                    <ReservationNoteDialog
                      noteForm={<ReservationNoteForm reservationId={id} />}
                    />
                  </div>
                </section>

                <section id="history" className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Événements liés
                  </h2>

                  {reservationEventsError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les événements liés.
                    </p>
                  ) : reservationEvents && reservationEvents.length > 0 ? (
                    <div className="mt-5 divide-y divide-border">
                      {reservationEvents.map((event) => {
                        const dateText = formatApplicationDate(
                          getUsefulReservationEventDate(event),
                        );

                        return (
                          <div
                            key={event.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-foreground text-sm">
                                  {event.title || formatEventType(event.event_type)}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  {event.status}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  Priorité : {event.priority}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                <span>Type : {formatEventType(event.event_type)}</span>
                                <span aria-hidden="true">•</span>
                                <span>Date : {dateText}</span>
                                <span aria-hidden="true">•</span>
                                <span>
                                  Créé le {formatApplicationDate(event.created_at)}
                                </span>
                              </div>
                              {event.description ? (
                                <p className="text-sm leading-6 text-muted">
                                  {event.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-5 rounded-xl border border-dashed bg-background px-4 py-4 text-sm text-muted">
                      Aucun événement général lié à cette réservation.
                    </p>
                  )}
                </section>

                <section id="payments" className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Paiements liés
                  </h2>

                  <div className="mb-6 grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailItem
                      label="Tarif convenu"
                      value={formatPrice(reservation.price_cents, reservation.currency)}
                    />
                    <DetailItem
                      label="Montant payé"
                      value={formatPrice(paidCents, currency)}
                    />
                    <DetailItem
                      label={balanceLabel}
                      value={balanceValue}
                    />
                    <DetailItem
                      label="Paiements"
                      value={`${paymentCount} lié${paymentCount > 1 ? "s" : ""} · ${paidPaymentCount} payé${paidPaymentCount > 1 ? "s" : ""}${
                        requestedPaymentCount > 0
                          ? ` · ${requestedPaymentCount} demandé${requestedPaymentCount > 1 ? "s" : ""}`
                          : ""
                      }`}
                    />
                  </div>

                  {paymentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les paiements liés.
                    </p>
                  ) : reservationPayments && reservationPayments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {reservationPayments.map((payment) => {
                        let dateDisplay = "";
                        if (payment.status === "paid" && payment.paid_at) {
                          dateDisplay = `Payé le ${formatApplicationDate(payment.paid_at)}`;
                        } else if ((payment.status === "requested" || payment.status === "pending") && payment.due_date) {
                          dateDisplay = `Échéance : ${formatApplicationDate(payment.due_date)}`;
                        } else if (payment.requested_at) {
                          dateDisplay = `Demandé le ${formatApplicationDate(payment.requested_at)}`;
                        } else {
                          dateDisplay = `Créé le ${formatApplicationDate(payment.created_at)}`;
                        }

                        return (
                          <div
                            key={payment.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-foreground text-sm">
                                    {formatPrice(payment.amount_cents, payment.currency)}
                                  </span>
                                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                    {getPaymentStatusLabel(payment.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted">
                                  Type : {getPaymentTypeLabel(payment.payment_type)}
                                </p>
                                <p className="text-xs text-muted">
                                  Méthode : {getPaymentMethodLabel(payment.payment_method)}
                                </p>
                                <p className="text-xs text-muted">
                                  {dateDisplay}
                                </p>
                                {payment.notes ? (
                                  <p className="text-xs text-muted/80 italic mt-1">
                                    Note : {payment.notes}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-col gap-2 sm:items-end">
                                <Link
                                  href={`/payments/${payment.id}`}
                                  className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft text-center"
                                >
                                  Consulter
                                </Link>
                                {payment.status === "requested" ? (
                                  <PaymentConfirmDialog
                                    paymentId={payment.id}
                                    reservationId={id}
                                    amountLabel={formatPrice(
                                      payment.amount_cents,
                                      payment.currency,
                                    )}
                                    typeLabel={getPaymentTypeLabel(
                                      payment.payment_type,
                                    )}
                                    dueDateLabel={dateDisplay}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun paiement lié à cette réservation.
                    </p>
                  )}

                  <ReservationFinanceDialogs
                    paymentForm={
                      <div className="space-y-6">
                        <FinancialBalanceNotice
                          priceCents={reservation.price_cents}
                          paidCents={reservation.paid_cents ?? 0}
                          refundedCents={reservation.refunded_cents ?? 0}
                          currency={currency}
                        />
                        <ReservationPaymentForm
                          reservationId={id}
                          remainingBalanceCents={
                            reservation.price_cents !== null
                              ? reservation.price_cents -
                                (reservation.paid_cents ?? 0) +
                                (reservation.refunded_cents ?? 0)
                              : 0
                          }
                        />
                      </div>
                    }
                    refundForm={
                      <ReservationRefundForm
                        reservationId={id}
                        remainingBalanceCents={
                          reservation.price_cents !== null
                            ? reservation.price_cents -
                              (reservation.paid_cents ?? 0) +
                              (reservation.refunded_cents ?? 0)
                            : 0
                        }
                      />
                    }
                  />
                </section>

                <section id="documents" className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  <div className="mb-6 grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-3">
                    <DetailItem
                      label="Certificat d'engagement"
                      value={
                        commitmentDocument
                          ? getDocumentStatusLabel(
                              commitmentDocument.status,
                              commitmentDocument.document_type,
                            )
                          : "Non lié"
                      }
                    />
                    <DetailItem
                      label="Contrat de réservation"
                      value={
                        reservationContractDocument
                          ? getDocumentStatusLabel(
                              reservationContractDocument.status,
                              reservationContractDocument.document_type,
                            )
                          : "Non lié"
                      }
                    />
                    <DetailItem
                      label="Attestation de vente"
                      value={
                        saleCertificateDocument
                          ? getDocumentStatusLabel(
                              saleCertificateDocument.status,
                              saleCertificateDocument.document_type,
                            )
                          : "Non liée"
                      }
                    />
                  </div>

                  {documentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les documents liés.
                    </p>
                  ) : reservationDocuments && reservationDocuments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {reservationDocuments.map((document) => {
                        const isChecklistDoc =
                          document.document_type === "commitment_certificate" ||
                          document.document_type === "reservation_contract" ||
                          document.document_type === "sale_certificate";

                        return (
                          <div
                            key={document.id}
                            className="py-5 first:pt-0 last:pb-0 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-foreground text-sm">
                                  {document.title}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  {getDocumentStatusLabel(document.status, document.document_type)}
                                </span>
                              </div>
                              <p className="text-xs text-muted">
                                Type : {getDocumentTypeLabel(document.document_type)}
                              </p>
                              {document.sent_at ? (
                                <p className="text-xs text-muted">
                                  Envoyé le : {formatApplicationDate(document.sent_at)}
                                </p>
                              ) : null}
                              {document.signed_at ? (
                                <p className="text-xs text-muted">
                                  Signé le : {formatApplicationDate(document.signed_at)}
                                </p>
                              ) : null}
                              {document.received_at ? (
                                <p className="text-xs text-muted">
                                  Reçu le : {formatApplicationDate(document.received_at)}
                                </p>
                              ) : null}
                              {!document.sent_at && !document.signed_at && !document.received_at ? (
                                <p className="text-xs text-muted">
                                  Créé le : {formatApplicationDate(document.created_at)}
                                </p>
                              ) : null}
                              <p className="text-xs text-muted">
                                Fichier : {document.file_name || "Non renseigné"}
                              </p>
                              <p className="text-xs text-muted">
                                Signature requise :{" "}
                                {getSignatureRequiredLabel(
                                  document.signature_required,
                                )}
                              </p>
                            </div>

                            <div className="flex flex-col gap-2 sm:items-end">
                              <Link
                                href={`/documents/${document.id}`}
                                className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-medium text-accent transition hover:border-accent/40 hover:bg-accent-soft text-center justify-center min-w-[150px]"
                              >
                                Consulter
                              </Link>

                              {isChecklistDoc ? (
                                <>
                                  {document.status === "to_generate" ? (
                                    <DocumentConfirmDialog
                                      actionType="sent"
                                      documentId={document.id}
                                      reservationId={id}
                                      documentLabel={getDocumentTypeLabel(
                                        document.document_type,
                                      )}
                                      statusLabel={getDocumentStatusLabel(
                                        document.status,
                                        document.document_type,
                                      )}
                                    />
                                  ) : null}

                                  {document.status === "sent" ? (
                                    <DocumentConfirmDialog
                                      actionType="signed"
                                      documentId={document.id}
                                      reservationId={id}
                                      documentLabel={getDocumentTypeLabel(
                                        document.document_type,
                                      )}
                                      statusLabel={getDocumentStatusLabel(
                                        document.status,
                                        document.document_type,
                                      )}
                                    />
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun document lié à cette réservation pour l’instant.
                    </p>
                  )}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">Liens utiles</h2>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Accès rapides aux objets métier liés au dossier.
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold">Client associé</h2>
                  <div className="mt-4">
                    {reservation.contact_id ? (
                      <Link
                        href={`/contacts/${reservation.contact_id}`}
                        className="font-medium text-sm text-accent hover:underline"
                      >
                        {reservation.contact_display_name ?? "Client anonyme"}
                      </Link>
                    ) : (
                      <p className="font-medium text-sm">{reservation.contact_display_name ?? "Client anonyme"}</p>
                    )}
                    {reservation.contact_id ? (
                      <Link
                        href={`/contacts/${reservation.contact_id}`}
                        className="mt-3 inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la fiche contact
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h2 className="text-lg font-semibold">Candidature liée</h2>
                  <div className="mt-4">
                    {reservation.application_id ? (
                      <Link
                        href={`/candidatures/${reservation.application_id}`}
                        className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la candidature
                      </Link>
                    ) : (
                      <p className="rounded-xl border border-dashed bg-background px-4 py-3 text-sm text-muted">
                        Aucune candidature liée à cette réservation.
                      </p>
                    )}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h2 className="text-lg font-semibold">Sections</h2>
                  <div className="mt-4 grid gap-2">
                    {sectionNavItems.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
