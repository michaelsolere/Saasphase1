import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { JourneyTimeline, type JourneyStep } from "@/components/journey-timeline";
import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { getPreReservationProgress } from "@/features/applications/pre-reservation-progress";
import {
  ApplicationLitterScopeForm,
  type ApplicationLitter,
  type ApplicationLitterGroup,
} from "@/features/applications/litter-scope-form";
import { NoteForm } from "@/features/applications/note-form";
import { QualificationActions } from "@/features/applications/qualification-actions";
import type { ApplicationDetail } from "@/features/applications/types";
import {
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
import {
  markPreReservationPaymentAsPaidFromApplication,
} from "@/features/payments/actions";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import { formatPrice, getReservationStatusLabel } from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
type RelatedEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  priority: string;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
};

type ApplicationNote = {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
  note_type: string;
  profiles: { display_name: string | null } | null;
};

type ActivePreReservationPayment = {
  id: string;
  reservation_id: string | null;
  amount_cents: number;
  currency: string;
  payment_type: string;
  status: string;
  due_date: string | null;
  requested_at: string | null;
};

type ApplicationReservationProgressRow = ReservationOverview & {
  pre_reservation_deadline?: string | null;
};

type ApplicationPaymentProgressRow = ActivePreReservationPayment & {
  created_at: string | null;
  paid_at: string | null;
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

function getUsefulEventDate(event: RelatedEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function getEventTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getDecisionBody(value: string) {
  const reasonMatch = value.match(/Raison\s*:\s*([\s\S]+)/);
  return (reasonMatch?.[1] ?? value).trim();
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Candidature introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cette candidature n’existe pas ou vous n’êtes pas autorisé à la
        consulter.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux candidats
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
        Impossible de charger la candidature
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux candidats
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

function getApplicationStatusClassName(status: string | null) {
  if (status === "new" || status === "to_review" || status === "to_call") {
    return "w-fit rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white";
  }

  if (status === "qualified" || status === "waiting_litter") {
    return "w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-950";
  }

  if (status === "rejected" || status === "withdrawn" || status === "archived") {
    return "w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950";
  }

  return "w-fit rounded-full border bg-surface px-3 py-1.5 text-sm font-semibold text-muted";
}

function getApplicationStatusHint(status: string | null) {
  if (status === "qualified" || status === "waiting_litter") {
    return "Candidature validée : elle peut rester active ou être marquée non aboutie si le dossier s’arrête.";
  }

  if (status === "rejected" || status === "withdrawn" || status === "archived") {
    return "Candidature non aboutie : elle peut être réactivée vers À valider si le dossier reprend.";
  }

  if (status === "new" || status === "to_review" || status === "to_call") {
    return "Candidature à valider : choisissez la prochaine étape après relecture.";
  }

  return "Statut actuel de la candidature.";
}

function getCandidateJourneySteps({
  application,
  reservations,
  payments,
}: {
  application: ApplicationDetail;
  reservations: ApplicationReservationProgressRow[];
  payments: ApplicationPaymentProgressRow[];
}): JourneyStep[] {
  const hasLinkedContact = Boolean(application.contact_id);
  const isQualified =
    application.status === "qualified" || application.status === "waiting_litter";
  const preReservationProgress = getPreReservationProgress({
    reservations,
    payments,
  });

  return [
    {
      label: "Contact créé",
      state: hasLinkedContact ? "done" : "unknown",
      detail: hasLinkedContact
        ? "La candidature est reliée à une fiche contact."
        : "Aucun contact lié n'est visible sur cette candidature.",
    },
    {
      label: "Candidature validée",
      state: isQualified ? "done" : "unknown",
      detail: isQualified
        ? "Le statut de candidature permet la suite du parcours."
        : "Validation en attente côté éleveur.",
    },
    {
      label: "Email confirmation de saillie",
      state: "upcoming",
      stateLabel: "À suivre",
      detail: "Jalon affiché sans automatisation ni trace d'envoi.",
    },
    {
      label: "Confirmation de gestation et demande de pré-réservation",
      state: preReservationProgress.requestDone ? "done" : "upcoming",
      detail: preReservationProgress.requestDetail,
    },
    {
      label: "Pré-réservation réglée",
      state: preReservationProgress.paidDone ? "done" : "upcoming",
      detail: preReservationProgress.paidDone
        ? "Pré-réservation réglée — passage au parcours adoptant."
        : preReservationProgress.paidDetail,
    },
  ];
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    action?: string;
    note_status?: string;
    reservation_status?: string;
    role_status?: string;
    litter_status?: string;
    payment_mark_status?: string;
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

  const { data, error } = await supabase
    .from("application_overview")
    .select(
      "id, organization_id, contact_id, contact_display_name, contact_email, contact_phone, desired_sex_preference, project_description, status, public_form_name, public_form_slug, has_started_adopter_journey, species, breed, submitted_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const application = data as ApplicationDetail | null;

  const applicationId = application?.id;
  const { data: notes, error: notesError } = applicationId
    ? await supabase
        .from("notes")
        .select("id, body, created_at, created_by, note_type, profiles!created_by ( display_name )")
        .eq("application_id", applicationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const applicationNotes = notes as ApplicationNote[] | null;
  const latestDecisionNote =
    applicationNotes?.find((note) => note.note_type === "decision") ?? null;

  // Fetch reservations
  const { data: rawReservations, error: reservationsError } = applicationId
    ? await supabase
        .from("reservation_overview")
        .select("id, status, litter_name, litter_group_name, price_cents, paid_cents, currency, animal_display_name, reserved_sex_preference, created_at")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const applicationReservations =
    rawReservations as ApplicationReservationProgressRow[] | null;
  const reservationIdsForDeadlines =
    applicationReservations
      ?.map((reservation) => reservation.id)
      .filter((reservationId): reservationId is string => Boolean(reservationId)) ??
    [];

  const { data: reservationDeadlines } = reservationIdsForDeadlines.length > 0
    ? await supabase
        .from("reservations")
        .select("id, pre_reservation_deadline")
        .in("id", reservationIdsForDeadlines)
        .is("deleted_at", null)
    : { data: null };
  const preReservationDeadlineByReservationId = new Map(
    (reservationDeadlines ?? []).map((reservation) => [
      reservation.id,
      reservation.pre_reservation_deadline,
    ]),
  );

  const reservationsWithDeadlines =
    applicationReservations?.map((reservation) => ({
      ...reservation,
      pre_reservation_deadline: reservation.id
        ? preReservationDeadlineByReservationId.get(reservation.id) ?? null
        : null,
    })) ?? [];
  const activePreReservation = applicationReservations?.find(
    (reservation) => reservation.status === "pre_reservation_requested",
  ) ?? null;

  const reservationIds =
    reservationIdsForDeadlines;

  const { data: rawPreReservationPayments } = reservationIds.length > 0
    ? await supabase
        .from("payments")
        .select("id, reservation_id, amount_cents, currency, payment_type, status, due_date, requested_at, created_at, paid_at")
        .in("reservation_id", reservationIds)
        .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const preReservationPayments =
    (rawPreReservationPayments ?? []) as ApplicationPaymentProgressRow[];

  const { data: rawActivePreReservationPayments } = activePreReservation?.id
    ? await supabase
        .from("payments")
        .select("id, reservation_id, amount_cents, currency, payment_type, status, due_date, requested_at")
        .eq("reservation_id", activePreReservation.id)
        .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
        .in("status", ["requested", "pending", "partially_paid"])
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
    : { data: null };

  const activePreReservationPayment =
    (rawActivePreReservationPayments?.[0] ?? null) as
      | ActivePreReservationPayment
      | null;

  // Fetch documents
  const { data: rawDocuments, error: documentsError } = applicationId
    ? await supabase
        .from("documents")
        .select("id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, file_name, signature_required")
        .eq("application_id", applicationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const applicationDocuments = rawDocuments as RelatedDocument[] | null;

  // Fetch events
  const { data: rawEvents, error: eventsError } = applicationId
    ? await supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("application_id", applicationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const applicationEvents = rawEvents as RelatedEvent[] | null;

  // Champs desired_litter_id et desired_litter_group_id (non présents dans application_overview)
  const { data: rawAppFields } = applicationId
    ? await supabase
        .from("applications")
        .select("desired_litter_id, desired_litter_group_id")
        .eq("id", applicationId)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  const currentLitterId = rawAppFields?.desired_litter_id ?? null;
  const currentGroupId = rawAppFields?.desired_litter_group_id ?? null;

  // Portées disponibles (même organisation, non supprimées) — vue enrichie
  const { data: availableLitters } =
    application?.organization_id
      ? await supabase
          .from("litter_overview")
          .select(
            "id, name, litter_group_id, litter_group_name, status, mother_display_name, father_display_name, expected_birth_date, actual_birth_date, created_at",
          )
          .eq("organization_id", application.organization_id)
          .order("created_at", { ascending: false })
      : { data: null };

  // Groupes de portées disponibles (même organisation, non supprimés)
  const { data: availableGroups } =
    application?.organization_id
      ? await supabase
          .from("litter_groups")
          .select(
            "id, name, status, expected_period_start, expected_period_end, created_at",
          )
          .eq("organization_id", application.organization_id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null };

  const desiredScopeLitters = (availableLitters ??
    []) as ApplicationLitter[];
  const desiredScopeGroups = (availableGroups ??
    []) as ApplicationLitterGroup[];
  const candidateJourneySteps = application
    ? getCandidateJourneySteps({
        application,
        reservations: reservationsWithDeadlines,
        payments: preReservationPayments,
      })
    : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/candidatures"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux candidats
        </Link>
      </div>

      <div className="mt-8">
        {error ? (
          <ErrorMessage />
        ) : !application ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            {query.action === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le statut de la candidature a bien été mis à jour.
              </p>
            ) : null}

            {query.action === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La candidature n’a pas pu être mise à jour. Réessayez.
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
                La note n’a pas pu être ajoutée. Réessayez.
              </p>
            ) : null}

            {query.role_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                L’opération a bien été réalisée, mais le rôle métier associé
                n’a pas pu être ajouté au contact. Vous pourrez le compléter
                plus tard.
              </p>
            ) : null}

            {query.reservation_status === "created" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La demande de pré-réservation a bien été créée. Elle apparaît
                maintenant dans la section Réservations liées.
              </p>
            ) : null}

            {query.reservation_status === "already_exists" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
              >
                Une réservation existe déjà pour cette candidature. Consultez
                la section Réservations liées pour l’ouvrir.
              </p>
            ) : null}

            {query.reservation_status === "not_qualified" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Seule une candidature validée peut créer une demande de
                pré-réservation. Vérifiez d’abord le statut de validation.
              </p>
            ) : null}

            {query.reservation_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La demande de pré-réservation n’a pas pu être créée. Aucune
                donnée n’a été modifiée, vous pouvez réessayer.
              </p>
            ) : null}

            {query.litter_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La portée souhaitée a bien été mise à jour.
              </p>
            ) : null}

            {query.litter_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La portée souhaitée n&apos;a pas pu être mise à jour. Réessayez.
              </p>
            ) : null}

            {query.payment_mark_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La pré-réservation n’a pas pu être marquée comme payée. Aucune
                nouvelle demande de paiement n’a été créée.
              </p>
            ) : null}

            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Candidature · Cycle de vie
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {application.contact_display_name ??
                    "Candidature sans nom disponible"}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Soumise le{" "}
                  {formatApplicationDate(
                    application.submitted_at ?? application.created_at,
                  )}
                </p>
              </div>
              <span
                className={getApplicationStatusClassName(application.status)}
              >
                {getApplicationStatusLabel(application.status)}
              </span>
            </header>

            <JourneyTimeline
              description="Synthèse indicative des grandes étapes avant entrée dans le parcours adoptant."
              footer="La suite du dossier se poursuit dans le Parcours adoptant après pré-réservation réglée."
              steps={candidateJourneySteps}
              title="Parcours candidat"
              titleId="candidate-journey-progress-title"
            />

            {activePreReservationPayment ? (
              <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 sm:p-8">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide">
                      Pré-réservation en attente de règlement
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">
                      {formatPrice(
                        activePreReservationPayment.amount_cents,
                        activePreReservationPayment.currency,
                      )}{" "}
                      à régler
                    </h2>
                    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                      <DetailItem
                        label="Montant demandé"
                        value={formatPrice(
                          activePreReservationPayment.amount_cents,
                          activePreReservationPayment.currency,
                        )}
                      />
                      <DetailItem
                        label="Échéance"
                        value={formatApplicationDate(
                          activePreReservationPayment.due_date,
                        )}
                      />
                      <DetailItem
                        label="Type de paiement"
                        value={getPaymentTypeLabel(
                          activePreReservationPayment.payment_type,
                        )}
                      />
                    </dl>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90"
                      >
                        Marquer la pré-réservation de{" "}
                        {formatPrice(
                          activePreReservationPayment.amount_cents,
                          activePreReservationPayment.currency,
                        )}{" "}
                        comme payée
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Confirmer le règlement de pré-réservation
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action utilise la demande de paiement existante,
                          marque la pré-réservation comme réglée et ouvre le
                          parcours adoptant. Aucun nouveau paiement ne sera créé.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <form action={markPreReservationPaymentAsPaidFromApplication}>
                          <input
                            type="hidden"
                            name="application_id"
                            value={application.id ?? ""}
                          />
                          <input
                            type="hidden"
                            name="payment_id"
                            value={activePreReservationPayment.id}
                          />
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            Confirmer le règlement
                          </button>
                        </form>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </section>
            ) : null}

            {application.id ? (
              <section className="border-b py-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="font-semibold">Statut de la candidature</h2>
                    <p className="mt-1 text-sm text-muted">
                      État actuel :{" "}
                      <span className="font-semibold text-foreground">
                        {getApplicationStatusLabel(application.status)}
                      </span>
                      . {getApplicationStatusHint(application.status)}
                    </p>
                  </div>
                  <QualificationActions
                    applicationId={application.id}
                    status={application.status}
                  />
                </div>
                {latestDecisionNote ? (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-semibold">Dernière raison / décision</p>
                    <p className="mt-2 whitespace-pre-wrap leading-6">
                      {getDecisionBody(latestDecisionNote.body)}
                    </p>
                    <p className="mt-2 text-xs">
                      Ajoutée le{" "}
                      {formatApplicationDate(latestDecisionNote.created_at)}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* ---- Portée ou période souhaitée ---- */}
            {application.id && application.organization_id ? (
              <section id="portee-souhaitee" className="border-b py-6">
                <h2 className="font-semibold">Portée ou période souhaitée</h2>
                <p className="mt-1 text-sm text-muted">
                  Rattachez cette candidature à une portée précise ou à un
                  groupe de portées (période) pour la retrouver lors d&apos;une
                  campagne de pré-réservation. Le rattachement reste optionnel.
                </p>

                <ApplicationLitterScopeForm
                  applicationId={application.id}
                  litters={desiredScopeLitters}
                  litterGroups={desiredScopeGroups}
                  currentLitterId={currentLitterId}
                  currentGroupId={currentGroupId}
                />
              </section>
            ) : null}

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Projet d’adoption</h2>
                  <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                    {application.project_description ||
                      "Aucune description du projet n’a été renseignée."}
                  </p>

                  <dl className="mt-8 grid gap-6 border-t pt-7 sm:grid-cols-2">
                    <DetailItem
                      label="Préférence de sexe"
                      value={getSexPreferenceLabel(
                        application.desired_sex_preference,
                      )}
                    />
                    <DetailItem
                      label="Espèce et race"
                      value={
                        [application.species, application.breed]
                          .filter(Boolean)
                          .join(" · ") || null
                      }
                    />
                    <DetailItem
                      label="Formulaire source"
                      value={
                        application.public_form_name ??
                        application.public_form_slug
                      }
                    />
                    <DetailItem
                      label="Statut"
                      value={getApplicationStatusLabel(application.status)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Réservations liées
                      </h2>
                      <p className="mt-2 text-sm text-muted">
                        Les dossiers adoptants apparaissent ici après le
                        lancement de la campagne de pré-réservation.
                      </p>
                    </div>
                  </div>

                  {reservationsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les réservations liées.
                    </p>
                  ) : applicationReservations && applicationReservations.length > 0 ? (
                    <div className="divide-y divide-border">
                      {applicationReservations.map((res) => {
                        const targetLitter =
                          res.litter_name ??
                          res.litter_group_name ??
                          "Portée non précisée";
                        const dateText = formatApplicationDate(res.created_at);

                        return (
                          <div
                            key={res.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-foreground text-sm">
                                    {targetLitter}
                                  </span>
                                  <span
                                    className={
                                      res.status === "active" ||
                                      res.status === "confirmed_after_birth" ||
                                      res.status === "animal_assigned"
                                        ? "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                                        : "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
                                    }
                                  >
                                    {getReservationStatusLabel(res.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted">
                                  Préférence : {getSexPreferenceLabel(res.reserved_sex_preference)}
                                </p>
                                <p className="text-xs text-muted">
                                  Tarif : {formatPrice(res.price_cents, res.currency)}
                                  {res.paid_cents !== null && res.paid_cents !== undefined && res.paid_cents > 0 ? (
                                    <span className="text-emerald-700 ml-2 font-medium">
                                      (Payé : {formatPrice(res.paid_cents, res.currency)})
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-muted">
                                  Animal : {res.animal_display_name ?? "Non attribué"}
                                </p>
                                <p className="text-xs text-muted">
                                  Créée le {dateText}
                                </p>
                              </div>
                              {res.id ? (
                                <Link
                                  href={`/reservations/${res.id}`}
                                  className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft self-start sm:self-center"
                                >
                                  Consulter
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucune réservation liée à cette candidature.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  {documentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les documents liés.
                    </p>
                  ) : applicationDocuments && applicationDocuments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {applicationDocuments.map((document) => {
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
                      Aucun document lié à cette candidature.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Événements liés
                  </h2>

                  {eventsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les événements liés.
                    </p>
                  ) : applicationEvents && applicationEvents.length > 0 ? (
                    <div className="divide-y divide-border">
                      {applicationEvents.map((event) => (
                        <div
                          key={event.id}
                          className="py-5 first:pt-0 last:pb-0"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-semibold text-foreground text-sm">
                                {event.title ||
                                  getEventTypeLabel(event.event_type)}
                              </span>
                              <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                {event.status}
                              </span>
                              <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                Priorité : {event.priority}
                              </span>
                            </div>
                            <p className="text-xs text-muted">
                              Type : {getEventTypeLabel(event.event_type)}
                            </p>
                            <p className="text-xs text-muted">
                              Date utile :{" "}
                              {formatApplicationDate(getUsefulEventDate(event))}
                            </p>
                            <p className="text-xs text-muted">
                              Créé le {formatApplicationDate(event.created_at)}
                            </p>
                            {event.description ? (
                              <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                                {event.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun événement lié à cette candidature.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Notes internes</h2>

                  <div className="mt-6 space-y-6">
                    {notesError ? (
                      <p role="alert" className="text-sm text-amber-800">
                        Impossible de charger les notes internes.
                      </p>
                    ) : applicationNotes && applicationNotes.length > 0 ? (
                      <div className="divide-y divide-border">
                        {applicationNotes.map((note) => {
                          const authorName =
                            note.profiles?.display_name || "Auteur inconnu";
                          return (
                            <div
                              key={note.id}
                              className="py-4 first:pt-0 last:pb-0"
                            >
                              {note.note_type === "decision" ? (
                                <span className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-950">
                                  Décision
                                </span>
                              ) : null}
                              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                {note.body}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                                <span>Par {authorName}</span>
                                <span>•</span>
                                <span>
                                  {formatApplicationDate(note.created_at)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">
                        Aucune note interne pour le moment.
                      </p>
                    )}
                  </div>

                  {application.id && application.organization_id ? (
                    <NoteForm
                      applicationId={application.id}
                      organizationId={application.organization_id}
                    />
                  ) : null}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6">
                <h2 className="text-lg font-semibold">Contact lié</h2>
                <dl className="mt-6 space-y-6">
                  <DetailItem
                    label="Nom"
                    value={application.contact_display_name}
                  />
                  <DetailItem
                    label="Email"
                    value={application.contact_email}
                  />
                  <DetailItem
                    label="Téléphone"
                    value={application.contact_phone}
                  />
                </dl>
                {application.contact_id ? (
                  <div className="mt-7 border-t pt-5">
                    <Link
                      href={`/contacts/${application.contact_id}`}
                      className="inline-flex w-full justify-center rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Voir le contact
                    </Link>
                  </div>
                ) : (
                  <p className="mt-7 border-t pt-5 text-xs leading-5 text-muted">
                    La gestion complète du contact sera ajoutée dans un module
                    dédié.
                  </p>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
