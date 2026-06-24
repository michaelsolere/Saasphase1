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
  updateReservationInternalComment,
  updateReservationPreReservationDeadline,
  updateReservationPrice,
  activateReservation,
  assignAnimalToReservation,
  unassignAnimalFromReservation,
} from "@/features/reservations/actions";
import { createReservationPayment } from "@/features/payments/actions";
import { formatPrice, getReservationStatusLabel } from "@/features/reservations/formatters";
import {
  FINAL_RESERVATION_STATUSES,
  isFinalReservationStatus,
} from "@/features/reservations/statuses";
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

function getUsefulDocumentDate(document: RelatedDocument) {
  if (document.signed_at) {
    return { label: "Signé le", value: document.signed_at };
  }

  if (document.received_at) {
    return { label: "Reçu le", value: document.received_at };
  }

  if (document.sent_at) {
    return { label: "Envoyé le", value: document.sent_at };
  }

  if (document.updated_at) {
    return { label: "Mis à jour le", value: document.updated_at };
  }

  return { label: "Créé le", value: document.created_at };
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
  value: string | null;
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
    activation_status?: string;
    adoption_status?: string;
    animal_assign_status?: string;
    animal_unassign_status?: string;
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
  }> = [];
  let availableAnimalsError: unknown = null;

  if (reservation && reservation.organization_id && !reservation.animal_id) {
    const { data: rawAnimals, error: fetchAnimalsError } = await supabase
      .from("animals")
      .select("id, display_name, temporary_name, call_name, official_name, sex, status, species, breed")
      .eq("organization_id", reservation.organization_id)
      .is("deleted_at", null)
      .in("status", ["born", "active", "available"]);

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
        .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at")
        .eq("reservation_id", reservation.id)
        .is("deleted_at", null)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const reservationPayments = rawPayments as RelatedPayment[] | null;

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

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
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

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
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
                  </dl>

                  {reservation.status === "draft" ? (
                    <form
                      action={activateReservation}
                      className="mt-8 border-t pt-6"
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
                    <form
                      action={adoptReservation}
                      className="mt-8 border-t pt-6"
                    >
                      <input
                        type="hidden"
                        name="reservation_id"
                        value={id}
                      />
                      <p className="max-w-2xl text-xs leading-5 text-muted">
                        Cette action finalise manuellement l’adoption. Elle ne
                        crée ni paiement, ni document, ni note, ni modification
                        d’animal.
                      </p>
                      <button
                        type="submit"
                        className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Finaliser l’adoption
                      </button>
                    </form>
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

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Attribution et portée</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Portée"
                      value={reservation.litter_name}
                    />
                    <DetailItem
                      label="Groupe de portée"
                      value={reservation.litter_group_name}
                    />
                    <DetailItem
                      label="Animal attribué"
                      value={reservation.animal_display_name}
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
                              Aucun animal disponible pour attribution.
                            </p>
                          ) : (
                            <form action={assignAnimalToReservation} className="space-y-4">
                              <input type="hidden" name="reservation_id" value={id} />
                              <div>
                                <label htmlFor="animal_id" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                                  Attribuer un animal
                                </label>
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

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Paiements liés
                  </h2>

                  {paymentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les paiements liés.
                    </p>
                  ) : reservationPayments && reservationPayments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {reservationPayments.map((payment) => {
                        const dateText = formatApplicationDate(
                          payment.paid_at ?? payment.created_at,
                        );

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
                                  Date : {dateText}
                                </p>
                              </div>
                              <Link
                                href={`/payments/${payment.id}`}
                                className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft self-start sm:self-center"
                              >
                                Consulter
                              </Link>
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

                  <div className="border-t border-border pt-8 mt-8">
                    <h3 className="text-lg font-semibold mb-2">
                      Enregistrer un paiement manuel
                    </h3>
                    <p className="text-xs text-muted mb-6">
                      Ce formulaire enregistre un paiement lié à cette réservation. Il ne change pas le statut de la réservation et ne génère aucun document.
                    </p>

                    <form action={createReservationPayment} className="space-y-4">
                      <input
                        type="hidden"
                        name="reservation_id"
                        value={id}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Montant (en €)
                          </label>
                          <input
                            name="amount"
                            type="text"
                            required
                            placeholder="ex: 150 ou 150.50"
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Type de paiement
                          </label>
                          <select
                            name="payment_type"
                            required
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          >
                            <option value="arrhes">Arrhes</option>
                            <option value="balance">Solde</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Statut
                          </label>
                          <select
                            name="status"
                            required
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          >
                            <option value="paid">Payé</option>
                            <option value="requested">Demandé</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Moyen de paiement
                          </label>
                          <select
                            name="payment_method"
                            required
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          >
                            <option value="bank_transfer">Virement</option>
                            <option value="cash">Espèces</option>
                            <option value="card">Carte bancaire</option>
                            <option value="cheque">Chèque</option>
                            <option value="other">Autre</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                            Date
                          </label>
                          <input
                            name="payment_date"
                            type="date"
                            required
                            defaultValue={formatDateInputValue(new Date().toISOString())}
                            className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted block mb-2">
                          Note (optionnelle)
                        </label>
                        <textarea
                          name="notes"
                          rows={3}
                          maxLength={2000}
                          placeholder="Commentaire interne sur ce paiement..."
                          className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent resize-y"
                        />
                      </div>

                      <button
                        type="submit"
                        className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Enregistrer le paiement
                      </button>
                    </form>
                  </div>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  {documentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les documents liés.
                    </p>
                  ) : reservationDocuments && reservationDocuments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {reservationDocuments.map((document) => {
                        const usefulDate = getUsefulDocumentDate(document);

                        return (
                          <div
                            key={document.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-foreground text-sm">
                                  {document.title}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  {getDocumentStatusLabel(document.status)}
                                </span>
                              </div>
                              <p className="text-xs text-muted">
                                Type : {getDocumentTypeLabel(document.document_type)}
                              </p>
                              <p className="text-xs text-muted">
                                {usefulDate.label}{" "}
                                {formatApplicationDate(usefulDate.value)}
                              </p>
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
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun document lié à cette réservation.
                    </p>
                  )}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">Client associé</h2>
                  <div className="mt-4">
                    <p className="font-medium text-sm">{reservation.contact_display_name ?? "Client anonyme"}</p>
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

                {reservation.application_id ? (
                  <div className="border-t pt-6">
                    <h2 className="text-lg font-semibold">Candidature liée</h2>
                    <div className="mt-4">
                      <Link
                        href={`/candidatures/${reservation.application_id}`}
                        className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la candidature
                      </Link>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
