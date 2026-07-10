import Link from "next/link";
import { redirect } from "next/navigation";

import { JourneyTimeline, type JourneyStep } from "@/components/journey-timeline";
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
  readDepositSettingsForOrganization,
  resolveDepositSettings,
} from "@/features/payments/deposit-thresholds";
import {
  updateReservationInternalComment,
  updateReservationPrice,
  activateReservation,
  assignAnimalToReservation,
  unassignAnimalFromReservation,
  syncReservationScopeFromApplication,
  attachReservationToScope,
} from "@/features/reservations/actions";
import {
  ReservationAppointmentForm,
  type ReservationAppointmentFormValues,
} from "@/features/reservations/appointment-form";
import { ReservationAppointmentDialog } from "@/features/reservations/appointment-dialog";
import { ReservationPaymentForm } from "@/features/payments/reservation-payment-form";
import { ReservationRefundForm } from "@/features/payments/reservation-refund-form";
import {
  initializeReservationDocuments,
} from "@/features/documents/actions";
import {
  formatPrice,
  getPreReservationDepositBadgeClassName,
  getPreReservationDepositLabel,
  getPreReservationDepositStateFromStatus,
  getReservationStatusLabel,
  type PreReservationDepositState,
} from "@/features/reservations/formatters";
import {
  FINAL_RESERVATION_STATUSES,
  isFinalReservationStatus,
} from "@/features/reservations/statuses";
import { isAssignableReservationAnimal } from "@/features/reservations/assignable-animals";
import { ReservationNoteForm } from "@/features/reservations/note-form";
import { ReservationNoteDialog } from "@/features/reservations/note-dialog";
import { ReservationFinanceDialogs } from "@/features/reservations/finance-dialogs";
import { PaymentConfirmDialog } from "@/features/reservations/payment-confirm-dialog";
import { PreReservationBalanceConfirmDialog } from "@/features/reservations/pre-reservation-balance-confirm-dialog";
import {
  DocumentConfirmDialog,
  ReservationDocumentsBundleConfirmDialog,
} from "@/features/reservations/document-confirm-dialog";
import { AdoptionConfirmDialog } from "@/features/reservations/adoption-confirm-dialog";
import { ReservationNegativeActionConfirmDialog } from "@/features/reservations/negative-action-confirm-dialog";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";
import { getContactRoleLabel } from "@/features/contacts/formatters";

export const dynamic = "force-dynamic";

type ReservationSearchParams = {
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
  litter_attach_status?: string;
  balance_request_status?: string;
  document_action_status?: string;
  note_status?: string;
  scope_sync_status?: string;
  appointment_status?: string;
};

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

type AppointmentKind = "puppy_choice" | "adoption";

const CHOICE_APPOINTMENTS_CAMPAIGN_TRACE_TITLE =
  "Créneaux proposés et livret d’adoption envoyés";

type ReservationAppointmentSummary = {
  kind: AppointmentKind;
  eventId: string | null;
  label: string;
  plannedAt: string | null;
  actualAt: string | null;
  status: "missing" | "planned" | "done" | "postponed";
  description: string | null;
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
  call_name: string | null;
  official_name: string | null;
  sex: string;
  status: string;
  birth_date: string | null;
  litter_id: string | null;
  species: string | null;
  birth_order: number | null;
  collar_color_current: string | null;
  collar_color_initial: string | null;
  identification_number: string | null;
  color: string | null;
  coat_color: string | null;
};

type ReservationAttachableLitter = {
  id: string;
  name: string | null;
  litter_group_id: string | null;
  litter_group_name: string | null;
  status: string | null;
  expected_birth_date: string | null;
  actual_birth_date: string | null;
};

type ReservationAttachableLitterGroup = {
  id: string;
  name: string | null;
  status: string | null;
  expected_period_start: string | null;
  expected_period_end: string | null;
};

type ReservationInternalComment = {
  id: string;
  internal_comment: string | null;
  deleted_at: string | null;
};

type ReservationPreReservationDeadline = {
  id: string;
  pre_reservation_deadline: string | null;
  choice_meeting_at: string | null;
  deleted_at: string | null;
};

function getUsefulPostAdoptionEventDate(event: RelatedPostAdoptionEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function getAppointmentStatusLabel(status: ReservationAppointmentSummary["status"]) {
  if (status === "done") {
    return "Créneau confirmé par l’adoptant";
  }

  if (status === "postponed") {
    return "À modifier";
  }

  if (status === "planned") {
    return "Proposé";
  }

  return "Non proposé";
}

function getAppointmentStatusClassName(
  status: ReservationAppointmentSummary["status"],
) {
  if (status === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "postponed") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "planned") {
    return "border-accent/20 bg-accent/10 text-accent";
  }

  return "border-border bg-muted-soft text-muted";
}

function formatDepositSettingAmount(cents: number, currency: string | null) {
  if (currency === "EUR" && cents % 100 === 0) {
    return `${cents / 100} €`;
  }

  return formatPrice(cents, currency);
}

function deriveAppointmentSummary({
  kind,
  label,
  events,
  fallbackPlannedAt,
}: {
  kind: AppointmentKind;
  label: string;
  events: RelatedReservationEvent[] | null;
  fallbackPlannedAt?: string | null;
}): ReservationAppointmentSummary {
  const event = (events ?? []).find((item) => item.event_type === kind);

  if (event) {
    const status =
      event.status === "done"
        ? "done"
        : event.status === "postponed"
          ? "postponed"
          : "planned";

    return {
      kind,
      eventId: event.id,
      label,
      plannedAt: event.planned_at ?? event.planned_date,
      actualAt: event.actual_at,
      status,
      description: event.description,
    };
  }

  return {
    kind,
    eventId: null,
    label,
    plannedAt: fallbackPlannedAt ?? null,
    actualAt: null,
    status: fallbackPlannedAt ? "planned" : "missing",
    description: null,
  };
}

function toAppointmentFormValues(
  appointment: ReservationAppointmentSummary,
): ReservationAppointmentFormValues {
  return {
    eventId: appointment.eventId,
    kind: appointment.kind,
    plannedAt: appointment.plannedAt,
    actualAt: appointment.actualAt,
    status:
      appointment.status === "done" || appointment.status === "postponed"
        ? appointment.status
        : "planned",
    description: appointment.description,
  };
}

function hasAppointmentChronologyWarning({
  choiceAppointment,
  adoptionAppointment,
}: {
  choiceAppointment: ReservationAppointmentSummary;
  adoptionAppointment: ReservationAppointmentSummary;
}) {
  if (!choiceAppointment.plannedAt || !adoptionAppointment.plannedAt) {
    return false;
  }

  const choiceDate = new Date(choiceAppointment.plannedAt);
  const adoptionDate = new Date(adoptionAppointment.plannedAt);

  if (
    !Number.isFinite(choiceDate.getTime()) ||
    !Number.isFinite(adoptionDate.getTime())
  ) {
    return false;
  }

  return adoptionDate.getTime() < choiceDate.getTime();
}

function traceDescriptionMatchesAppointments({
  description,
  choiceAppointmentAt,
  adoptionAppointmentAt,
}: {
  description: string | null;
  choiceAppointmentAt: string | null;
  adoptionAppointmentAt: string | null;
}) {
  return (
    Boolean(description && choiceAppointmentAt && adoptionAppointmentAt) &&
    description?.includes(`Créneau de choix ISO : ${choiceAppointmentAt}`) &&
    description?.includes(`Créneau de départ ISO : ${adoptionAppointmentAt}`)
  );
}

function AppointmentSummaryCard({
  reservationId,
  appointment,
}: {
  reservationId: string;
  appointment: ReservationAppointmentSummary;
}) {
  const hasAppointmentDetails =
    Boolean(appointment.eventId) ||
    Boolean(appointment.plannedAt) ||
    Boolean(appointment.actualAt) ||
    Boolean(appointment.description);
  const triggerLabel = hasAppointmentDetails ? "Modifier" : "Renseigner";

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {appointment.label}
          </h3>
          <span
            className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getAppointmentStatusClassName(appointment.status)}`}
          >
            {getAppointmentStatusLabel(appointment.status)}
          </span>
        </div>
        <ReservationAppointmentDialog
          title={appointment.label}
          description="Renseignez manuellement le créneau proposé, sa confirmation par l’adoptant et un commentaire court."
          triggerLabel={triggerLabel}
          appointmentForm={
            <ReservationAppointmentForm
              reservationId={reservationId}
              appointment={toAppointmentFormValues(appointment)}
            />
          }
        />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailItem
          label="Créneau proposé"
          value={formatApplicationDate(appointment.plannedAt)}
        />
        <DetailItem
          label="Confirmation du créneau"
          value={formatApplicationDate(appointment.actualAt)}
        />
      </dl>

      <div className="mt-4 rounded-lg border border-dashed px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Commentaire
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">
          {appointment.description || "Aucun commentaire renseigné."}
        </p>
      </div>
    </div>
  );
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Dossier adoptant introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Dossier adoptant introuvable ou inaccessible.
      </p>
      <Link
        href="/reservations"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux parcours adoptants
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
        Impossible de charger le dossier adoptant
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/reservations"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux parcours adoptants
      </Link>
    </section>
  );
}

function TechnicalPreReservationPage({
  contactName,
  payments,
  query,
}: {
  contactName: string | null;
  payments: RelatedPayment[];
  query: ReservationSearchParams;
}) {
  const requestedPayments = payments.filter(
    (payment) =>
      payment.status === "requested" ||
      payment.status === "pending" ||
      payment.status === "partially_paid",
  );

  return (
    <>
      {query.payment_create_status === "technical_pre_reservation" ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Cette demande de pré-réservation possède déjà un paiement demandé.
          Traitez ce paiement depuis la fiche Paiement.
        </p>
      ) : null}

      <section className="rounded-2xl border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Consultation technique
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Demande de pré-réservation
        </h1>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <DetailItem
            label="Contact"
            value={contactName ?? "Contact associé"}
          />
          <DetailItem
            label="Paiement demandé"
            value={
              requestedPayments.length > 0
                ? `${requestedPayments.length} paiement${
                    requestedPayments.length > 1 ? "s" : ""
                  } en attente`
                : "Aucun paiement en attente"
            }
          />
        </dl>

        <div className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold">Paiement demandé</h2>
          {requestedPayments.length > 0 ? (
            requestedPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-col justify-between gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatPrice(payment.amount_cents, payment.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {getPaymentTypeLabel(payment.payment_type)} ·{" "}
                    {getPaymentStatusLabel(payment.status)}
                    {payment.due_date
                      ? ` · échéance ${formatApplicationDate(payment.due_date)}`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/payments/${payment.id}`}
                  className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                >
                  Consulter la fiche Paiement
                </Link>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted">
              Aucun paiement demandé n’est lié à cette demande.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

type ReservationStatusMessage = {
  when: boolean;
  role: "status" | "alert";
  className: string;
  message: string;
};

const successStatusMessageClassName =
  "mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950";
const errorStatusMessageClassName =
  "mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950";

function ReservationStatusMessages({
  balanceAmountLabel,
  query,
}: {
  balanceAmountLabel: string;
  query: ReservationSearchParams;
}) {
  const messages: ReservationStatusMessage[] = [
    {
      when: query.price_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Le tarif convenu a bien été mis à jour.",
    },
    {
      when: query.price_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le tarif convenu n’a pas pu être mis à jour. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.comment_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message:
        "Le commentaire interne du dossier a bien été mis à jour.",
    },
    {
      when: query.comment_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le commentaire interne n’a pas pu être mis à jour. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.deadline_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "L’échéance de pré-réservation a bien été mise à jour.",
    },
    {
      when: query.deadline_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’échéance de pré-réservation n’a pas pu être mise à jour. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.payment_create_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Le paiement a bien été enregistré.",
    },
    {
      when: query.payment_create_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le paiement n’a pas pu être enregistré. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.payment_create_status === "technical_pre_reservation",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Cette demande de pré-réservation possède déjà un paiement demandé. Traitez ce paiement depuis la fiche candidat ou la fiche Paiement.",
    },
    {
      when: query.payment_mark_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Le paiement a bien été marqué comme payé.",
    },
    {
      when: query.payment_mark_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le paiement n’a pas pu être marqué comme payé. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.payment_mark_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Ce paiement n’est plus dans un état permettant de le marquer comme payé depuis ce dossier.",
    },
    {
      when: query.balance_request_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: `Le complément 2/2 — ${balanceAmountLabel} a bien été créé.`,
    },
    {
      when: query.balance_request_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        `Le complément 2/2 — ${balanceAmountLabel} n’a pas pu être créé. Aucune donnée n’a été modifiée.`,
    },
    {
      when: query.document_action_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "L’action sur le document a été effectuée avec succès.",
    },
    {
      when: query.document_action_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’action sur le document n’a pas pu être effectuée. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.document_action_status === "incomplete",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le lot de documents contractuels est incomplet : le certificat d’engagement et le contrat de réservation doivent tous les deux être liés avant de valider l’action groupée.",
    },
    {
      when: query.note_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "La note interne a bien été ajoutée.",
    },
    {
      when: query.note_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "La note interne n’a pas pu être ajoutée. Vérifiez le contenu saisi et réessayez.",
    },
    {
      when: query.appointment_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message:
        "Le créneau de rendez-vous a bien été enregistré.",
    },
    {
      when: query.appointment_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le créneau de rendez-vous n’a pas pu être enregistré. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.payment_refund_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message:
        "Remboursement enregistré. Le solde du dossier a été mis à jour.",
    },
    {
      when: query.payment_refund_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Impossible d’enregistrer le remboursement. Vérifiez les informations saisies et réessayez. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.activation_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Le dossier adoptant a été confirmé.",
    },
    {
      when: query.activation_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Le dossier adoptant ne peut pas être confirmé dans son état actuel.",
    },
    {
      when: query.activation_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le dossier adoptant n’a pas pu être confirmé. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.role_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’opération a bien été réalisée, mais le rôle du contact n’a pas pu être mis à jour. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.adoption_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "L’adoption a été finalisée.",
    },
    {
      when: query.adoption_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Le dossier adoptant ne peut pas être finalisé dans son état actuel.",
    },
    {
      when: query.adoption_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’adoption n’a pas pu être finalisée. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.animal_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’adoption a été finalisée, mais le statut de l’animal n’a pas pu être mis à jour. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.cancellation_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Dossier adoptant annulé.",
    },
    {
      when: query.cancellation_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Le dossier adoptant ne peut pas être annulé dans son état actuel.",
    },
    {
      when: query.cancellation_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le dossier adoptant n’a pas pu être annulé. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.withdrawal_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Dossier adoptant marqué comme désisté.",
    },
    {
      when: query.withdrawal_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le dossier adoptant ne peut pas être marqué comme désisté dans son état actuel.",
    },
    {
      when: query.withdrawal_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le désistement n’a pas pu être enregistré. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.expiration_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "Dossier adoptant marqué comme expiré.",
    },
    {
      when: query.expiration_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le dossier adoptant ne peut pas être marqué comme expiré dans son état actuel.",
    },
    {
      when: query.expiration_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’expiration n’a pas pu être enregistrée. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.animal_assign_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "L’animal a été attribué à l’adoptant.",
    },
    {
      when: query.animal_assign_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "L’attribution n’a pas pu être effectuée. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.animal_assign_status === "already_assigned",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Cet adoptant possède déjà un animal attribué.",
    },
    {
      when: query.animal_assign_status === "animal_unavailable",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Cet animal n’est plus disponible pour attribution.",
    },
    {
      when: query.animal_assign_status === "animal_must_be_available",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Cet animal doit être marqué disponible avant de pouvoir être attribué.",
    },
    {
      when: query.animal_assign_status === "missing_litter",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Choisissez d’abord une portée précise pour l’adoptant avant d’attribuer un animal.",
    },
    {
      when: query.animal_unassign_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "L’attribution de l’animal a été retirée.",
    },
    {
      when: query.animal_unassign_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Le retrait de l’attribution n’a pas pu être effectué. Aucune donnée n’a été modifiée.",
    },
    {
      when: query.animal_unassign_status === "no_animal",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "Aucun animal n’est attribué à cet adoptant.",
    },
    {
      when: query.animal_unassign_status === "invalid_state",
      role: "alert",
      className: errorStatusMessageClassName,
      message: "L’attribution de cet adoptant ne peut plus être modifiée.",
    },
    {
      when: query.litter_attach_status === "success",
      role: "status",
      className: successStatusMessageClassName,
      message: "La portée de l’adoptant a été mise à jour.",
    },
    {
      when: query.litter_attach_status === "error",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "La portée de l’adoptant n’a pas pu être enregistrée. Aucune autre donnée n’a été modifiée.",
    },
    {
      when: query.litter_attach_status === "animal_attributed",
      role: "alert",
      className: errorStatusMessageClassName,
      message:
        "Impossible de modifier la portée ou le groupe après attribution d’un animal.",
    },
  ];

  return (
    <>
      {messages.map((item) =>
        item.when ? (
          <p key={item.message} role={item.role} className={item.className}>
            {item.message}
          </p>
        ) : null,
      )}
    </>
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

function CompactField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm leading-5">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function SummaryMetric({
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
    <Link href={href} className="block min-w-0 break-words font-semibold text-accent hover:underline">
      {value}
    </Link>
  ) : (
    <span className="block min-w-0 break-words font-semibold text-foreground">{value}</span>
  );

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm leading-5">
        <div className="min-w-0">
          {badgeClassName ? (
            <span className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassName}`}>
              <span className="min-w-0 break-words">{content}</span>
            </span>
          ) : (
            content
          )}
          {detail ? (
            <p className="mt-1 break-words text-xs text-muted">{detail}</p>
          ) : null}
        </div>
      </dd>
    </div>
  );
}

function SummaryIndicator({
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
    <Link href={href} className="block min-w-0 break-words font-semibold text-accent hover:underline">
      {value}
    </Link>
  ) : (
    <span className="block min-w-0 break-words font-semibold">{value}</span>
  );

  return (
    <div className="min-w-0 rounded-lg border bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        <span
          className={`inline-flex min-w-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
            badgeClassName ?? "border-border bg-surface text-foreground"
          }`}
        >
          <span className="min-w-0 break-words">{content}</span>
        </span>
      </div>
      {detail ? (
        <p className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-muted">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function getPreReservationPaymentActionSummary({
  state,
  amountLabel,
}: {
  state: PreReservationDepositState;
  amountLabel: string;
}) {
  if (state === "requested") {
    return {
      value: `Paiement de ${amountLabel} à suivre`,
      detail: "Vérifier la réception du paiement demandé.",
    };
  }

  if (state === "paid") {
    return {
      value: "Aucun paiement attendu pour le moment",
      detail: "Le versement de pré-réservation est déjà réglé.",
    };
  }

  return {
    value: "Aucun paiement attendu pour le moment",
    detail: "Aucune demande de pré-réservation n’est ouverte sur ce dossier.",
  };
}

function formatPriceInputValue(priceCents: number | null) {
  if (priceCents === null || priceCents === undefined) {
    return "";
  }

  return (priceCents / 100).toFixed(2);
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
          Dossier soldé
        </span>
        <p className="text-xs leading-5">
          Ce dossier apparaît soldé. Vous pouvez tout de même enregistrer
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
        Ce dossier présente un trop-perçu de{" "}
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

function getAdopterJourneySteps({
  preReservationDepositState,
  reservationStatus,
  documentsError,
  reservationDocuments,
  commitmentDocument,
  reservationContractDocument,
  hasCompleteDeposit,
  isPaidInFull,
  remainingBalanceCents,
  reservationEventsError,
  choiceAppointment,
  adoptionAppointment,
  hasChoiceAppointmentsCampaignTrace,
  hasObsoleteChoiceAppointmentsCampaignTrace,
  adoptionCompletedAt,
}: {
  preReservationDepositState: PreReservationDepositState;
  reservationStatus: string | null;
  documentsError: unknown;
  reservationDocuments: RelatedDocument[] | null;
  commitmentDocument: RelatedDocument | undefined;
  reservationContractDocument: RelatedDocument | undefined;
  hasCompleteDeposit: boolean;
  isPaidInFull: boolean;
  remainingBalanceCents: number | null;
  reservationEventsError: unknown;
  choiceAppointment: ReservationAppointmentSummary;
  adoptionAppointment: ReservationAppointmentSummary;
  hasChoiceAppointmentsCampaignTrace: boolean;
  hasObsoleteChoiceAppointmentsCampaignTrace: boolean;
  adoptionCompletedAt: string | null | undefined;
}): JourneyStep[] {
  const visibleDocuments = reservationDocuments ?? [];
  const hasDocuments = visibleDocuments.length > 0;
  const hasReservationDocuments = Boolean(
    commitmentDocument && reservationContractDocument,
  );
  const mainDocumentsSent = Boolean(
    commitmentDocument &&
      reservationContractDocument &&
      (commitmentDocument.status === "sent" ||
        commitmentDocument.status === "signed" ||
        Boolean(commitmentDocument.sent_at) ||
        Boolean(commitmentDocument.signed_at)) &&
      (reservationContractDocument.status === "sent" ||
        reservationContractDocument.status === "signed" ||
        Boolean(reservationContractDocument.sent_at) ||
        Boolean(reservationContractDocument.signed_at)),
  );
  const mainDocumentsSigned = Boolean(
    commitmentDocument?.status === "signed" &&
      reservationContractDocument?.status === "signed",
  );
  const appointments = [choiceAppointment, adoptionAppointment];
  const proposedAppointmentCount = appointments.filter(
    (appointment) => appointment.status !== "missing",
  ).length;
  const validatedAppointmentCount = appointments.filter(
    (appointment) => appointment.status === "done",
  ).length;
  const hasBothValidatedAppointments = validatedAppointmentCount === 2;
  const hasAnyAppointmentProposal = proposedAppointmentCount > 0;
  const hasAnyValidatedAppointment = validatedAppointmentCount > 0;
  const adoptionIsEffective =
    reservationStatus === "adopted" || Boolean(adoptionCompletedAt);
  const balanceIsSettled =
    isPaidInFull ||
    (remainingBalanceCents !== null && remainingBalanceCents <= 0);

  return [
    {
      label: "Pré-réservation réglée",
      state:
        preReservationDepositState === "paid"
          ? "done"
          : preReservationDepositState === "requested"
            ? "in_progress"
            : "unknown",
      detail:
        preReservationDepositState === "paid"
          ? "Premier versement visible comme payé."
          : preReservationDepositState === "requested"
            ? "Demande visible, règlement à confirmer."
            : "Aucun règlement fiable visible.",
    },
    {
      label: "Documents envoyés",
      state: documentsError
        ? "needs_check"
        : mainDocumentsSent
          ? "done"
          : hasReservationDocuments
            ? "in_progress"
            : hasDocuments
              ? "needs_check"
            : "unknown",
      detail: documentsError
        ? "Chargement des documents à vérifier."
        : mainDocumentsSent
          ? "Certificat d’engagement et contrat de réservation envoyés ou signés."
        : hasReservationDocuments
          ? "Les deux documents contractuels sont liés, envoi groupé non confirmé."
        : hasDocuments
          ? "Documents contractuels à initialiser."
        : "Aucun document lié au dossier.",
    },
    {
      label: "Documents reçus signés — arrhes réglées",
      state:
        documentsError
          ? "needs_check"
          : mainDocumentsSigned && hasCompleteDeposit
            ? "done"
            : hasDocuments || hasCompleteDeposit
              ? "needs_check"
              : "unknown",
      detail:
        documentsError
          ? "Documents indisponibles pour confirmer l'étape."
          : mainDocumentsSigned && hasCompleteDeposit
            ? "Documents principaux signés et arrhes complètes."
            : mainDocumentsSigned
              ? "Documents principaux signés, arrhes complètes non visibles."
              : hasCompleteDeposit
                ? "Arrhes complètes visibles, signatures des documents principaux à vérifier."
                : hasDocuments
                  ? "Documents liés, signatures et arrhes complètes à vérifier."
                  : "Documents principaux et arrhes complètes non confirmés.",
    },
    {
      label: "Créneaux RV proposés",
      state: reservationEventsError
        ? "needs_check"
        : hasChoiceAppointmentsCampaignTrace
          ? "done"
        : hasAnyAppointmentProposal
          ? "in_progress"
          : "unknown",
      detail: reservationEventsError
        ? "Événements liés indisponibles."
        : hasChoiceAppointmentsCampaignTrace
          ? "Les créneaux proposés et le livret d’adoption ont été envoyés."
        : hasObsoleteChoiceAppointmentsCampaignTrace
          ? "Les créneaux ont été modifiés depuis le dernier envoi. Un nouvel envoi doit être confirmé."
        : hasAnyAppointmentProposal
          ? "Les créneaux sont renseignés mais leur envoi n’est pas confirmé."
          : "Aucun créneau de rendez-vous renseigné.",
    },
    {
      label: "Créneaux RV confirmés",
      state: reservationEventsError
        ? "needs_check"
        : hasBothValidatedAppointments
          ? "done"
          : hasAnyAppointmentProposal || hasAnyValidatedAppointment
            ? "in_progress"
            : "unknown",
      detail: reservationEventsError
        ? "Événements liés indisponibles."
        : hasBothValidatedAppointments
          ? "Les deux rendez-vous sont confirmés par l'adoptant."
          : hasAnyAppointmentProposal || hasAnyValidatedAppointment
            ? "Confirmation partielle ou à vérifier."
            : "Aucune confirmation de créneau visible.",
    },
    {
      label: "Solde réglé — adoption effective",
      state:
        balanceIsSettled && adoptionIsEffective
          ? "done"
          : balanceIsSettled || adoptionIsEffective
            ? "needs_check"
            : "upcoming",
      detail:
        balanceIsSettled && adoptionIsEffective
          ? "Solde réglé et adoption finalisée."
          : balanceIsSettled
            ? "Solde réglé, adoption effective à confirmer."
            : adoptionIsEffective
              ? "Adoption effective, solde à vérifier."
              : "Étape finale à venir.",
    },
  ];
}

function getReservationNextAction({
  reservation,
  paymentCount,
  requestedPaymentCount,
  remainingBalanceCents,
  isPaidInFull,
  hasCompleteDeposit,
  totalDocs,
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
  const mainDocumentsSent =
    (commitmentDocument?.status === "sent" ||
      commitmentDocument?.status === "signed" ||
      Boolean(commitmentDocument?.sent_at) ||
      Boolean(commitmentDocument?.signed_at)) &&
    (reservationContractDocument?.status === "sent" ||
      reservationContractDocument?.status === "signed" ||
      Boolean(reservationContractDocument?.sent_at) ||
      Boolean(reservationContractDocument?.signed_at));
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
      detail: "Ce dossier n’est pas relié à une candidature. Vérifier le projet initial de l’adoptant.",
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
      detail: "Aucun paiement n’est lié à ce dossier pour l’instant. Les parcours directs restent possibles.",
      badgeClassName: attentionBadge,
    };
  }

  if (mainDocumentsSent && !mainDocumentsSigned) {
    return {
      label: "Documents envoyés, en attente de retours signés.",
      detail: "Le certificat d’engagement et le contrat de réservation sont envoyés.",
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
  searchParams: Promise<ReservationSearchParams>;
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

  if (
    !readError &&
    reservation?.status === "pre_reservation_requested"
  ) {
    if (reservation.application_id) {
      redirect(`/candidatures/${reservation.application_id}`);
    }

    const { data: rawTechnicalPayments } = await supabase
      .from("payments")
      .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at, notes, due_date, requested_at")
      .eq("reservation_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    return (
      <main className="mx-auto min-h-screen w-full min-w-0 max-w-3xl px-6 py-10 sm:px-10 lg:px-12">
        <TechnicalPreReservationPage
          contactName={reservation.contact_display_name ?? null}
          payments={(rawTechnicalPayments as RelatedPayment[] | null) ?? []}
          query={query}
        />
      </main>
    );
  }

  const depositSettings = reservation?.organization_id
    ? await readDepositSettingsForOrganization({
        supabase,
        organizationId: reservation.organization_id,
      })
    : resolveDepositSettings(null);

  // Fetch available animals of the organization if reservation has no animal
  let availableAnimals: Array<{
    id: string;
    call_name: string | null;
    official_name: string | null;
    sex: string;
    status: string;
    ownership_status: string;
    is_breeder: boolean;
    is_external: boolean;
    is_retired: boolean;
    species: string;
    breed: string;
    litter_id: string | null;
    birth_order: number | null;
    collar_color_current: string | null;
    collar_color_initial: string | null;
  }> = [];
  let availableAnimalsError: unknown = null;
  let attachableLitters: ReservationAttachableLitter[] = [];
  let attachableLittersError: unknown = null;
  let attachableLitterGroups: ReservationAttachableLitterGroup[] = [];
  let attachableLitterGroupsError: unknown = null;

  if (
    reservation &&
    reservation.organization_id &&
    reservation.litter_id &&
    !reservation.animal_id
  ) {
    const rawAnimalsQuery = supabase
      .from("animals")
      .select("id, call_name, official_name, sex, status, ownership_status, is_breeder, is_external, is_retired, species, breed, litter_id, birth_order, collar_color_current, collar_color_initial")
      .eq("organization_id", reservation.organization_id)
      .is("deleted_at", null)
      .eq("status", "available")
      .eq("ownership_status", "produced")
      .eq("is_breeder", false)
      .eq("is_external", false)
      .eq("is_retired", false);

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
          (animal) =>
            isAssignableReservationAnimal(animal) &&
            !assignedAnimalIds.has(animal.id)
        );
      }
    }
  }

  if (
    reservation &&
    reservation.organization_id &&
    !reservation.animal_id &&
    !isFinalReservationStatus(reservation.status)
  ) {
    const attachableLittersQuery = supabase
      .from("litter_overview")
      .select(
        "id, name, litter_group_id, litter_group_name, status, expected_birth_date, actual_birth_date",
      )
      .eq("organization_id", reservation.organization_id);

    if (reservation.litter_group_id && !reservation.litter_id) {
      attachableLittersQuery.eq("litter_group_id", reservation.litter_group_id);
    } else {
      attachableLittersQuery.not("status", "in", "(archived,cancelled)");
    }

    const { data: rawAttachableLitters, error: fetchAttachableLittersError } =
      await attachableLittersQuery.order("created_at", { ascending: false });

    if (fetchAttachableLittersError) {
      attachableLittersError = fetchAttachableLittersError;
    } else {
      attachableLitters =
        (rawAttachableLitters as ReservationAttachableLitter[] | null) ?? [];
    }

    const { data: rawAttachableLitterGroups, error: fetchGroupsError } =
      await supabase
        .from("litter_groups")
        .select(
          "id, name, status, expected_period_start, expected_period_end",
        )
        .eq("organization_id", reservation.organization_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    if (fetchGroupsError) {
      attachableLitterGroupsError = fetchGroupsError;
    } else {
      attachableLitterGroups =
        (rawAttachableLitterGroups as ReservationAttachableLitterGroup[] | null) ??
        [];
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

  // Fetch planning fields directly because reservation_overview does not expose
  // every appointment-oriented reservation field.
  const { data: rawPreReservationDeadline } =
    reservation?.id
      ? await supabase
          .from("reservations")
          .select("id, pre_reservation_deadline, choice_meeting_at, deleted_at")
          .eq("id", reservation.id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null };

  const reservationPreReservationDeadline =
    rawPreReservationDeadline as ReservationPreReservationDeadline | null;

  // Fetch related animal
  const { data: rawAnimal, error: animalError } = reservation?.animal_id
    ? await supabase
        .from("animals")
        .select("id, call_name, official_name, sex, status, birth_date, litter_id, species, birth_order, collar_color_current, collar_color_initial, identification_number, color, coat_color, deleted_at")
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

  const preReservationDepositPayments = reservationPayments?.filter(
    (p) =>
      p.amount_cents === depositSettings.preReservationDepositCents &&
      (p.payment_type === "pre_reservation_deposit_refundable" ||
        p.payment_type === "arrhes"),
  ) || [];
  const arrhesPayments = reservationPayments?.filter(
    (p) => p.payment_type === "arrhes"
  ) || [];
  const activeArrhesPayments = arrhesPayments.filter(
    (p) => p.status === "requested" || p.status === "paid",
  );
  const hasSeparatePreReservationDeposit = preReservationDepositPayments.some(
    (p) => p.payment_type === "pre_reservation_deposit_refundable",
  );
  const paidArrhesPaymentCount = activeArrhesPayments.filter(
    (p) => p.status === "paid",
  ).length;
  const paidArrhesTotalCents = activeArrhesPayments
    .filter((p) => p.status === "paid")
    .reduce((total, payment) => total + payment.amount_cents, 0);
  const hasSecondPayment = hasSeparatePreReservationDeposit
    ? activeArrhesPayments.length >= 1
    : activeArrhesPayments.some(
        (payment) =>
          payment.status === "requested" &&
          payment.amount_cents === depositSettings.arrhesSecondPaymentCents,
      ) || paidArrhesTotalCents >= depositSettings.completeDepositCents;
  const hasSecondPaid = hasSeparatePreReservationDeposit
    ? paidArrhesPaymentCount >= 1
    : paidArrhesTotalCents >= depositSettings.completeDepositCents;
  const hasFirstPaid =
    preReservationDepositPayments.some((p) => p.status === "paid") ||
    reservation?.status === "pre_reservation_paid";
  const canRequestPreReservationBalance =
    reservation?.status === "pre_reservation_paid" &&
    activeArrhesPayments.every((payment) => payment.status === "paid") &&
    paidArrhesTotalCents >= depositSettings.preReservationDepositCents &&
    paidArrhesTotalCents < depositSettings.completeDepositCents;
  const hasRequestedFirstDeposit =
    reservation?.status === "pre_reservation_requested" ||
    preReservationDepositPayments.some(
      (p) =>
        p.payment_type === "pre_reservation_deposit_refundable" &&
        (p.status === "requested" || p.status === "pending"),
    ) ||
    (!hasFirstPaid &&
      arrhesPayments.some(
        (p) => p.status === "requested" || p.status === "pending",
      ));
  const preReservationDepositState: PreReservationDepositState =
    hasFirstPaid || reservation?.status === "pre_reservation_paid"
      ? "paid"
      : hasRequestedFirstDeposit ||
          getPreReservationDepositStateFromStatus(reservation?.status ?? null) ===
            "requested"
        ? "requested"
        : "absent";

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

  // Fetch contact details scoping by organization_id
  const { data: contactDetails, error: contactDetailsError } = reservation?.contact_id && reservation?.organization_id
    ? await supabase
        .from("contacts")
        .select("id, first_name, last_name, display_name, email, phone, secondary_phone, address_line1, address_line2, postal_code, city, country")
        .eq("id", reservation.contact_id)
        .eq("organization_id", reservation.organization_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  // Fetch active contact roles scoping by organization_id
  const { data: contactRoles } = reservation?.contact_id && reservation?.organization_id
    ? await supabase
        .from("contact_roles")
        .select("role")
        .eq("contact_id", reservation.contact_id)
        .eq("organization_id", reservation.organization_id)
        .eq("is_active", true)
        .is("deleted_at", null)
    : { data: null };

  // Fetch application details scoping by organization_id
  const { data: applicationDetails, error: applicationDetailsError } = reservation?.application_id && reservation?.organization_id
    ? await supabase
        .from("applications")
        .select("id, species, breed, desired_sex_preference, project_description, status, internal_comment, desired_litter_id, desired_litter_group_id")
        .eq("id", reservation.application_id)
        .eq("organization_id", reservation.organization_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  // Rattachement portée/groupe souhaité de la candidature liée (lecture seule).
  // Sert à comparer le projet (candidature) et l'engagement (réservation) sans
  // aucune propagation automatique.
  const applicationDesiredLitterId = applicationDetails?.desired_litter_id ?? null;
  const applicationDesiredGroupId =
    applicationDetails?.desired_litter_group_id ?? null;

  const { data: desiredLitterRow } =
    applicationDesiredLitterId && reservation?.organization_id
      ? await supabase
          .from("litters")
          .select("id, name")
          .eq("id", applicationDesiredLitterId)
          .eq("organization_id", reservation.organization_id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null };

  const { data: desiredGroupRow } =
    applicationDesiredGroupId && reservation?.organization_id
      ? await supabase
          .from("litter_groups")
          .select("id, name")
          .eq("id", applicationDesiredGroupId)
          .eq("organization_id", reservation.organization_id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null };

  const applicationDesiredLitterName = desiredLitterRow?.name ?? null;
  const applicationDesiredGroupName = desiredGroupRow?.name ?? null;

  const applicationHasScope = Boolean(
    applicationDesiredLitterId || applicationDesiredGroupId,
  );

  // Écart entre le rattachement de la candidature et celui de la réservation.
  const scopeDiffersFromApplication =
    applicationHasScope &&
    ((applicationDesiredLitterId ?? null) !== (reservation?.litter_id ?? null) ||
      (applicationDesiredGroupId ?? null) !==
        (reservation?.litter_group_id ?? null));

  // L'action de reprise n'est utile que si une candidature est liée, qu'elle
  // possède un rattachement, et que celui-ci diffère de la réservation.
  const canSyncScopeFromApplication =
    Boolean(reservation?.application_id) &&
    applicationHasScope &&
    scopeDiffersFromApplication;

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
  const paidPreReservationDepositCents = preReservationDepositPayments
    .filter((payment) => payment.status === "paid")
    .reduce((total, payment) => total + payment.amount_cents, 0);
  const preReservationDepositAmountLabel = formatDepositSettingAmount(
    depositSettings.preReservationDepositCents,
    currency,
  );
  const arrhesSecondPaymentAmountLabel = formatDepositSettingAmount(
    depositSettings.arrhesSecondPaymentCents,
    currency,
  );
  const completeDepositAmountLabel = formatDepositSettingAmount(
    depositSettings.completeDepositCents,
    currency,
  );
  const reservationIsFinal = isFinalReservationStatus(reservation?.status);
  const netPaidCents = paidCents - refundedCents;
  const remainingBalanceCents =
    priceCents === null ? null : priceCents - netPaidCents;
  const hasCompleteDeposit =
    paidArrhesTotalCents >= depositSettings.completeDepositCents;
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
      balanceLabel = "Dossier soldé";
      balanceValue = (
        <span className="font-semibold text-emerald-700">
          Dossier soldé
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
  const reservationBundleDocuments = [
    commitmentDocument,
    reservationContractDocument,
  ].filter((document): document is RelatedDocument => Boolean(document));
  const hasReservationDocumentsBundle =
    Boolean(commitmentDocument) && Boolean(reservationContractDocument);
  const reservationDocumentsBundleSent = Boolean(
    commitmentDocument &&
      reservationContractDocument &&
      (commitmentDocument.status === "sent" ||
        commitmentDocument.status === "signed" ||
        Boolean(commitmentDocument.sent_at) ||
        Boolean(commitmentDocument.signed_at)) &&
      (reservationContractDocument.status === "sent" ||
        reservationContractDocument.status === "signed" ||
        Boolean(reservationContractDocument.sent_at) ||
        Boolean(reservationContractDocument.signed_at)),
  );
  const reservationDocumentsBundleSigned = Boolean(
    commitmentDocument?.status === "signed" &&
      reservationContractDocument?.status === "signed",
  );
  const missingReservationDocumentLabels = [
    commitmentDocument ? null : "certificat d’engagement",
    reservationContractDocument ? null : "contrat de réservation",
  ].filter((label): label is string => Boolean(label));
  const missingReservationDocumentsSummary =
    missingReservationDocumentLabels.length > 0
      ? `Document${missingReservationDocumentLabels.length > 1 ? "s" : ""} à rattacher : ${missingReservationDocumentLabels.join(", ")}.`
      : null;
  const reservationDocumentsBundleStatusSummary =
    commitmentDocument && reservationContractDocument
      ? [
          `Certificat : ${getDocumentStatusLabel(
            commitmentDocument.status,
            commitmentDocument.document_type,
          )}`,
          `Contrat : ${getDocumentStatusLabel(
            reservationContractDocument.status,
            reservationContractDocument.document_type,
          )}`,
        ].join(" · ")
      : "Documents contractuels à initialiser.";
  const firstDepositLabel = getPreReservationDepositLabel(
    preReservationDepositState,
  );
  const preReservationPaymentActionSummary =
    getPreReservationPaymentActionSummary({
      state: preReservationDepositState,
      amountLabel: preReservationDepositAmountLabel,
    });
  const secondDepositLabel = hasSecondPaid
    ? "Complément payé"
    : hasSecondPayment
      ? "Complément demandé"
      : "Complément non demandé";
  const depositSummaryLabel = hasCompleteDeposit
    ? "Arrhes complètes"
    : hasFirstPaid
      ? "Pré-réservation réglée"
      : hasRequestedFirstDeposit
        ? "Paiement de pré-réservation demandé"
        : "Aucun paiement de pré-réservation visible";
  const adoptionDateLabel = reservation?.adoption_completed_at
    ? `Effective : ${formatApplicationDate(reservation.adoption_completed_at)}`
    : reservation?.adoption_planned_at
      ? `Prévue : ${formatApplicationDate(reservation.adoption_planned_at)}`
      : "Non renseignée";
  const canFinalizeAdoptionManually =
    reservation?.status === "animal_assigned" && Boolean(reservation.animal_id);
  const adoptionPreparationWarnings = [
    !reservation?.animal_id ? "Aucun animal n’est attribué à cet adoptant." : null,
    reservation?.animal_id && relatedAnimal && !relatedAnimal.identification_number
      ? "Numéro d’identification de l’animal absent."
      : null,
    remainingBalanceCents !== null && remainingBalanceCents > 0
      ? `Un reste à régler est visible : ${formatPrice(remainingBalanceCents, currency)}.`
      : null,
    missingReservationDocumentLabels.length > 0
      ? `Documents à vérifier : ${missingReservationDocumentLabels.join(", ")}.`
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  const contactSummaryDetail = contactDetailsError
    ? "Coordonnées partiellement indisponibles."
    : contactDetails
      ? [
          contactDetails.email,
          contactDetails.phone,
          [contactDetails.postal_code, contactDetails.city]
            .filter(Boolean)
            .join(" "),
        ]
          .filter(Boolean)
          .join(" · ") || "Coordonnées à compléter sur la fiche contact."
      : "Coordonnées non renseignées.";
  const contactRoleSummary =
    contactRoles && contactRoles.length > 0
      ? contactRoles.map((role) => getContactRoleLabel(role.role)).join(", ")
      : null;
  const applicationSummaryValue = reservation?.application_id
    ? applicationDetails?.status === "qualified"
      ? "Candidature validée"
      : "Candidature de l’adoptant"
    : "Aucune candidature associée";
  const applicationSummaryDetail = applicationDetailsError
    ? "Candidature partiellement indisponible."
    : applicationDetails
      ? [
          getSexPreferenceLabel(applicationDetails.desired_sex_preference),
          applicationDetails.project_description ? "Projet renseigné" : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Projet à compléter sur la candidature."
      : "Aucune candidature associée à ce dossier.";
  const rankSummaryDetail = [
    reservation?.rank_initial !== null && reservation?.rank_initial !== undefined
      ? `Rang initial : ${reservation.rank_initial}`
      : null,
    reservation?.rank_active !== null && reservation?.rank_active !== undefined
      ? `Rang actif : ${reservation.rank_active}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let docsSummaryText = "";
  if (documentsError) {
    docsSummaryText = "Documents à vérifier";
  } else if (totalDocs === 0) {
    docsSummaryText = "Aucun document lié";
  } else if (!hasReservationDocumentsBundle) {
    docsSummaryText = "Documents adoptant à initialiser";
  } else if (reservationDocumentsBundleSigned) {
    docsSummaryText = "Documents adoptant reçus signés";
  } else if (reservationDocumentsBundleSent) {
    docsSummaryText = "Documents adoptant envoyés";
  } else {
    docsSummaryText = `${signedDocs} reçu(s) signé(s), ${sentDocs} envoyé(s), ${toPrepareDocs} à générer`;
  }

  let paymentsSummaryText = "";
  let paymentsSummaryColor = "text-muted bg-muted-soft border-border";

  if (isPaidInFull) {
    paymentsSummaryText = "Paiement intégral / dossier soldé";
    paymentsSummaryColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  } else if (hasCompleteDeposit) {
    paymentsSummaryText = "Arrhes complètes réglées";
    paymentsSummaryColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  } else if (hasFirstPaid) {
    paymentsSummaryText = "Pré-réservation réglée";
    paymentsSummaryColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
  } else if (hasRequestedFirstDeposit) {
    paymentsSummaryText = "Pré-réservation à régler";
    paymentsSummaryColor = "text-amber-700 bg-amber-50 border-amber-200";
  } else if (paidCents > 0) {
    paymentsSummaryText = `${formatPrice(paidCents, currency)} payé hors pré-réservation`;
    paymentsSummaryColor = "text-amber-700 bg-amber-50 border-amber-200";
  } else {
    paymentsSummaryText = "En attente de paiement";
    paymentsSummaryColor = "text-muted bg-muted-soft border-border";
  }

  let financialSummaryDetail = "";
  if (paymentsError) {
    financialSummaryDetail = "Paiements partiellement indisponibles.";
  } else if (hasCompleteDeposit) {
    financialSummaryDetail = `${formatPrice(paidArrhesTotalCents, currency)} versés.`;
  } else if (hasFirstPaid) {
    const paidPreReservationAmountCents =
      paidPreReservationDepositCents > 0
        ? paidPreReservationDepositCents
        : Math.min(paidCents, depositSettings.preReservationDepositCents);

    financialSummaryDetail = `${formatPrice(
      paidPreReservationAmountCents,
      currency,
    )} versés sur ${completeDepositAmountLabel} attendus.`;
  } else if (hasRequestedFirstDeposit) {
    financialSummaryDetail = `${preReservationDepositAmountLabel} demandés, en attente de règlement.`;
  } else if (paymentCount === 0) {
    financialSummaryDetail =
      priceCents === null
        ? "Aucun paiement enregistré, tarif convenu non renseigné."
        : `Aucun paiement enregistré. Tarif convenu : ${formatPrice(priceCents, currency)}.`;
  } else {
    financialSummaryDetail = [
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
  }

  const documentSummaryDetail = documentsError
    ? "Documents partiellement indisponibles."
    : totalDocs === 0
      ? "Aucun document lié à ce dossier."
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
          missingReservationDocumentsSummary
            ? missingReservationDocumentsSummary
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const reservationLitterLabel =
    reservation?.litter_name ?? (reservation?.litter_id ? "Portée liée" : null);
  const reservationLitterGroupLabel =
    reservation?.litter_group_name ??
    (reservation?.litter_group_id ? "Groupe lié" : null);
  const scopeSummaryValue =
    reservationLitterLabel && reservationLitterGroupLabel ? (
      <>
        {reservation?.litter_id ? (
          <Link
            href={`/litters/${reservation.litter_id}`}
            className="inline text-accent hover:underline"
          >
            {reservationLitterLabel}
          </Link>
        ) : (
          reservationLitterLabel
        )}
        <span className="mx-1 text-muted">·</span>
        {reservation?.litter_group_id ? (
          <Link
            href={`/litter-groups/${reservation.litter_group_id}`}
            className="inline text-accent hover:underline"
          >
            {reservationLitterGroupLabel}
          </Link>
        ) : (
          reservationLitterGroupLabel
        )}
      </>
    ) : reservationLitterLabel ? (
      reservation?.litter_id ? (
        <Link
          href={`/litters/${reservation.litter_id}`}
          className="inline text-accent hover:underline"
        >
          {reservationLitterLabel}
        </Link>
      ) : (
        reservationLitterLabel
      )
    ) : reservationLitterGroupLabel ? (
      reservation?.litter_group_id ? (
        <Link
          href={`/litter-groups/${reservation.litter_group_id}`}
          className="inline text-accent hover:underline"
        >
          {reservationLitterGroupLabel}
        </Link>
      ) : (
        reservationLitterGroupLabel
      )
    ) : (
      "Portée ou groupe non renseigné"
    );
  const scopeSummaryDetail = reservation?.litter_id
    ? reservation?.litter_group_id
      ? "Portée précise et groupe liés au dossier."
      : "Portée précise liée au dossier."
    : reservation?.litter_group_id || reservation?.litter_group_name
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

  const nextAction = reservation
    ? getReservationNextAction({
        reservation,
        paymentCount,
        requestedPaymentCount,
        remainingBalanceCents,
        isPaidInFull,
        hasCompleteDeposit,
        totalDocs,
        toPrepareDocs,
        commitmentDocument,
        reservationContractDocument,
      })
    : null;
  const choiceAppointment = deriveAppointmentSummary({
    kind: "puppy_choice",
    label: "Choix du chiot/chaton",
    events: reservationEvents,
    fallbackPlannedAt: reservationPreReservationDeadline?.choice_meeting_at,
  });
  const adoptionAppointment = deriveAppointmentSummary({
    kind: "adoption",
    label: "Adoption / départ",
    events: reservationEvents,
    fallbackPlannedAt: reservation?.adoption_planned_at,
  });
  const choiceAppointmentsCampaignTrace = reservationEvents?.find(
    (event) =>
      event.title === CHOICE_APPOINTMENTS_CAMPAIGN_TRACE_TITLE &&
      event.status === "done",
  );
  const hasChoiceAppointmentsCampaignTrace = Boolean(
    choiceAppointmentsCampaignTrace &&
      traceDescriptionMatchesAppointments({
        description: choiceAppointmentsCampaignTrace.description,
        choiceAppointmentAt: choiceAppointment.plannedAt,
        adoptionAppointmentAt: adoptionAppointment.plannedAt,
      }),
  );
  const hasObsoleteChoiceAppointmentsCampaignTrace = Boolean(
    choiceAppointmentsCampaignTrace && !hasChoiceAppointmentsCampaignTrace,
  );
  const showAppointmentChronologyWarning = hasAppointmentChronologyWarning({
    choiceAppointment,
    adoptionAppointment,
  });
  const adopterJourneySteps = reservation
    ? getAdopterJourneySteps({
        preReservationDepositState,
        reservationStatus: reservation.status,
        documentsError,
        reservationDocuments,
        commitmentDocument,
        reservationContractDocument,
        hasCompleteDeposit,
        isPaidInFull,
        remainingBalanceCents,
        reservationEventsError,
        choiceAppointment,
        adoptionAppointment,
        hasChoiceAppointmentsCampaignTrace,
        hasObsoleteChoiceAppointmentsCampaignTrace,
        adoptionCompletedAt: reservation.adoption_completed_at,
      })
    : [];

  const sectionNavItems = [
    { href: "#payments", label: "Paiements" },
    { href: "#documents", label: "Documents" },
    { href: "#scope-and-animal", label: "Animal attribué" },
    { href: "#appointments", label: "Créneaux RV" },
    { href: "#adoption-preparation", label: "Préparation départ" },
    { href: "#notes", label: "Notes internes" },
    { href: "#reservation-details", label: "Dossier" },
  ];

  return (
    <main className="mx-auto min-h-screen w-full min-w-0 max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div>
        {readError ? (
          <ErrorMessage />
        ) : !reservation ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <ReservationStatusMessages
              balanceAmountLabel={arrhesSecondPaymentAmountLabel}
              query={query}
            />

            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  {reservation.status === "pre_reservation_requested"
                    ? "Demande de pré-réservation · Consultation technique"
                    : "Parcours adoptant · Consultation · complétion limitée"}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {reservation.status === "pre_reservation_requested"
                    ? "Demande de pré-réservation de "
                    : "Parcours adoptant de "}
                  {reservation.contact_display_name ?? "Client anonyme"}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créée le {formatApplicationDate(reservation.created_at)}
                </p>
              </div>
            </header>

            <JourneyTimeline
              description={
                reservation.status === "pre_reservation_requested"
                  ? "Demande technique en attente de règlement. Le parcours adoptant commencera après paiement de la pré-réservation."
                  : "Synthèse indicative des grandes étapes. Les détails restent dans les sections métier du dossier."
              }
              steps={adopterJourneySteps}
              title={
                reservation.status === "pre_reservation_requested"
                  ? "Progression de la demande"
                  : "Progression du parcours adoptant"
              }
              titleId="adopter-journey-progress-title"
            />

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

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <dl className="min-w-0 rounded-xl border bg-background px-4 py-2">
                  <SummaryMetric
                    label="Adoptant"
                    value={reservation.contact_display_name ?? "Client associé"}
                    detail={
                      contactRoleSummary
                        ? `${contactSummaryDetail} · ${contactRoleSummary}`
                        : contactSummaryDetail
                    }
                    href={
                      reservation.contact_id
                        ? `/contacts/${reservation.contact_id}`
                        : undefined
                    }
                  />
                  <SummaryMetric
                    label="Statut"
                    value={getReservationStatusLabel(reservation.status)}
                    badgeClassName={
                      reservation.status === "adopted" || reservation.status === "pre_reservation_paid"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : reservation.status === "pre_reservation_requested" || reservation.status === "active"
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : reservation.status === "cancelled" || reservation.status === "withdrawn" || reservation.status === "expired"
                            ? "text-rose-700 bg-rose-50 border-rose-200"
                            : "text-muted bg-muted-soft border-border"
                    }
                  />
                  <SummaryMetric
                    label="Animal"
                    value={animalSummaryLabel}
                    detail={animalSummaryDetail}
                    href={
                      reservation.animal_id
                        ? `/animals/${reservation.animal_id}`
                        : undefined
                    }
                  />
                  <SummaryMetric
                    label="Candidature"
                    value={applicationSummaryValue}
                    detail={applicationSummaryDetail}
                    href={
                      reservation.application_id
                        ? `/candidatures/${reservation.application_id}`
                        : undefined
                    }
                  />
                </dl>

                <div className="min-w-0 rounded-xl border bg-background px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Prochaine action
                  </p>
                  {nextAction ? (
                    <>
                      <p className="mt-1.5 text-sm font-semibold leading-6 text-foreground">
                        {nextAction.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {nextAction.detail}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted">
                      Aucune action automatique identifiée.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryIndicator
                  label="État financier"
                  value={paymentsSummaryText}
                  detail={financialSummaryDetail}
                  badgeClassName={paymentsSummaryColor}
                />
                <SummaryIndicator
                  label="Prochaine action paiement"
                  value={preReservationPaymentActionSummary.value}
                  detail={preReservationPaymentActionSummary.detail}
                  badgeClassName={getPreReservationDepositBadgeClassName(
                    preReservationDepositState,
                  )}
                />
                <SummaryIndicator
                  label="Documents"
                  value={docsSummaryText}
                  detail={documentSummaryDetail}
                />
                <SummaryIndicator
                  label="Portée"
                  value={scopeSummaryValue}
                  detail={
                    rankSummaryDetail
                      ? `${scopeSummaryDetail} · ${rankSummaryDetail}`
                      : scopeSummaryDetail
                  }
                />
              </div>

              <nav
                aria-label="Sections du dossier adoptant"
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

            <div className="py-8">
              <div className="flex min-w-0 flex-col gap-6">
                <section id="appointments" className="order-[35] rounded-2xl border bg-surface p-6 shadow-sm sm:p-8">
                  <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
                        Créneaux de rendez-vous
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        Suivi manuel des deux rendez-vous distincts proposés à
                        l’adoptant.
                      </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
                      Saisie manuelle
                    </span>
                  </div>

                  {reservationEventsError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les événements de rendez-vous.
                    </p>
                  ) : (
                    <>
                      {showAppointmentChronologyWarning ? (
                        <p
                          role="alert"
                          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
                        >
                          Attention : le créneau d’adoption / départ est
                          programmé avant le créneau de choix du chiot/chaton.
                        </p>
                      ) : null}

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <AppointmentSummaryCard
                          reservationId={id}
                          appointment={choiceAppointment}
                        />
                        <AppointmentSummaryCard
                          reservationId={id}
                          appointment={adoptionAppointment}
                        />
                      </div>
                    </>
                  )}
                </section>

                {/* 2. Section Dossier Adoptant */}
                <section id="adoption-preparation" className="order-[40] rounded-2xl border bg-surface p-6 sm:p-8 shadow-sm">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start border-b pb-4 mb-6">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">
                        Préparation adoption / départ
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        Lecture séparée des points à vérifier avant la décision finale de l&apos;éleveur.
                      </p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
                      Décision manuelle
                    </span>
                  </div>

                  <dl className="grid gap-4 sm:grid-cols-2">
                    <DetailItem
                      label="Animal attribué"
                      value={reservation.animal_id ? "Oui" : "Non"}
                    />
                    <DetailItem
                      label="Animal"
                      value={animalSummaryLabel}
                    />
                    <DetailItem
                      label={balanceLabel}
                      value={balanceValue}
                    />
                    <DetailItem
                      label="Date d’adoption / départ"
                      value={adoptionDateLabel}
                    />
                  </dl>

                  {reservation.animal_id ? (
                    <div className="mt-6 rounded-xl border bg-background p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Identité de l’animal
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {relatedAnimal?.identification_number
                              ? "Numéro d’identification renseigné."
                              : "Numéro d’identification absent avant départ."}
                          </p>
                        </div>
                        <Link
                          href={`/animals/${reservation.animal_id}#identite-definitive`}
                          className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                        >
                          Renseigner sur la fiche Animal
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 rounded-xl border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Versements du dossier
                    </h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <DetailItem
                        label={`Versement de pré-réservation — ${preReservationDepositAmountLabel}`}
                        value={firstDepositLabel}
                      />
                      <DetailItem
                        label={`Complément 2/2 — ${arrhesSecondPaymentAmountLabel}`}
                        value={secondDepositLabel}
                      />
                      <DetailItem
                        label="État global"
                        value={depositSummaryLabel}
                      />
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border bg-background p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Documents à vérifier
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          {docsSummaryText}
                        </p>
                      </div>
                      <a
                        href="#documents"
                        className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Voir les documents liés
                      </a>
                    </div>
                  </div>

                  {adoptionPreparationWarnings.length > 0 ? (
                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <h3 className="text-sm font-semibold text-amber-950">
                        Points à vérifier manuellement
                      </h3>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-950">
                        {adoptionPreparationWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
                      Aucun point d’attention automatique n’est visible. La finalisation reste une décision manuelle.
                    </p>
                  )}

                  {canFinalizeAdoptionManually ? (
                    <div className="mt-6 border-t pt-6">
                      <p className="max-w-2xl text-xs leading-5 text-muted">
                        Cette action ne valide pas automatiquement le solde, les documents ou la date de départ.
                      </p>
                      <AdoptionConfirmDialog
                        reservationId={id}
                        buttonClassName="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      />
                    </div>
                  ) : null}
                </section>

                <section id="reservation-details" className="order-[71] rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations du dossier adoptant
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
                      label="Suivi financier"
                      value={
                        <div className="space-y-1.5">
                          <p>
                            {paymentCount} paiement{paymentCount > 1 ? "s" : ""} lié{paymentCount > 1 ? "s" : ""} · {balanceLabel}
                          </p>
                          <a
                            href="#payments"
                            className="inline-flex text-sm font-semibold text-accent hover:underline"
                          >
                            Voir les paiements liés
                          </a>
                        </div>
                      }
                    />
                  </dl>

                  {reservation.status === "pre_reservation_requested" ? (
                    <div className="mt-8 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Paiement de pré-réservation demandé
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-amber-950">
                        La campagne de pré-réservation a été lancée. Le dossier est en attente du paiement de pré-réservation de {preReservationDepositAmountLabel}.
                      </p>
                    </div>
                  ) : null}

                  {reservation.status === "pre_reservation_paid" ? (
                    <div className="mt-8 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-4">
                      {hasCompleteDeposit ? (
                        <>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                            Dossier en pré-réservation réglée — arrhes complètes
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-emerald-950">
                            Arrhes complètes : {formatPrice(paidArrhesTotalCents, currency)} / {completeDepositAmountLabel} payés. Le dossier est financièrement validé, mais l’attribution de l’animal, les documents et l’adoption restent à traiter séparément.
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                            Dossier en pré-réservation réglée
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-emerald-950">
                            Le paiement de pré-réservation de {preReservationDepositAmountLabel} a été validé. Le dossier est en attente de disponibilité réelle, de compatibilité avec le sexe souhaité / le rang, et d’une proposition acceptée. Aucun complément 2/2 — {arrhesSecondPaymentAmountLabel} n’est demandé automatiquement à ce stade.
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
                        Ce dossier adoptant est finalisé avec le statut :{" "}
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
                            Cette action confirme manuellement le dossier adoptant. Elle
                            ne crée ni paiement, ni document, ni attribution
                            d’animal.
                          </p>
                          <button
                            type="submit"
                            className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                          >
                            Confirmer le dossier
                          </button>
                        </form>
                      ) : null}

                      {reservation.status === "active" ? (
                        <div className="mt-5 space-y-6">
                          <div>
                            <h4 className="text-sm font-semibold">
                              Sorties finales
                            </h4>
                            <div className="mt-4 space-y-5">
                              <div>
                                <p className="max-w-2xl text-xs leading-5 text-muted">
                                  Annule manuellement le dossier adoptant sans créer
                                  de remboursement ni modifier les paiements,
                                  documents ou l’animal attribué.
                                </p>
                                <ReservationNegativeActionConfirmDialog
                                  actionType="cancel"
                                  reservationId={id}
                                  triggerClassName="mt-4 inline-flex w-fit rounded-xl border border-red-200 bg-red-50/50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100/60"
                                />
                              </div>

                              <div>
                                <p className="max-w-2xl text-xs leading-5 text-muted">
                                  Enregistre le désistement sans créer de
                                  remboursement ni modifier les paiements,
                                  documents ou l’animal attribué.
                                </p>
                                <ReservationNegativeActionConfirmDialog
                                  actionType="withdraw"
                                  reservationId={id}
                                  triggerClassName="mt-4 inline-flex w-fit rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100/60"
                                />
                              </div>

                              <div>
                                <p className="max-w-2xl text-xs leading-5 text-muted">
                                  Marque le dossier adoptant comme expiré sans
                                  automatisation liée à l’échéance de
                                  pré-réservation.
                                </p>
                                <ReservationNegativeActionConfirmDialog
                                  actionType="expire"
                                  reservationId={id}
                                  triggerClassName="mt-4 inline-flex w-fit rounded-xl border border-slate-300 bg-slate-50/70 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {reservation.status === "pre_reservation_paid" ? (
                        <div className="mt-4">
                          {canRequestPreReservationBalance ? (
                            <div className="mt-4">
                              <p className="max-w-2xl text-xs leading-5 text-muted">
                                Cette action crée le complément 2/2 — {arrhesSecondPaymentAmountLabel} pour atteindre {completeDepositAmountLabel} d’arrhes complètes.
                              </p>
                              <PreReservationBalanceConfirmDialog
                                reservationId={id}
                                amountLabel={arrhesSecondPaymentAmountLabel}
                                buttonClassName="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                              />
                            </div>
                          ) : hasSecondPayment ? (
                            <div className="mt-4 space-y-4">
                              <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                                <p className="text-sm text-slate-700">
                                  {hasSecondPaid ? (
                                    `Complément 2/2 — ${arrhesSecondPaymentAmountLabel} payé.`
                                  ) : (
                                    `Complément 2/2 — ${arrhesSecondPaymentAmountLabel} demandé.`
                                  )}
                                </p>
                              </div>
                            </div>
                          ) : null}

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
                                Le versement de pré-réservation est validé. Vous pouvez maintenant initialiser la checklist des documents contractuels attendus (Certificat d’engagement et de connaissance, Contrat de réservation).
                              </p>
                              <button
                                type="submit"
                                className="mt-3 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                              >
                                Initialiser les documents contractuels
                              </button>
                            </form>
                          ) : hasFirstPaid ? (
                            <div className="border-t mt-6 pt-6">
                              <p className="text-xs text-muted">
                                Documents contractuels initialisés. Retrouvez le suivi d&apos;avancement des signatures dans la section &quot;Documents liés&quot; ci-dessous.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!reservationIsFinal ? (
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
                  ) : null}
                </section>

                <section id="scope-and-animal" className="order-[30] rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">Animal attribué et portée</h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        Vue compacte de la portée de l&apos;adoptant, de l&apos;animal attribué
                        et des informations utiles avant le départ.
                      </p>
                    </div>
                    {relatedAnimal?.id ? (
                      <Link
                        href={`/animals/${relatedAnimal.id}`}
                        className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter la fiche Animal
                      </Link>
                    ) : null}
                  </div>

                  <dl className="mt-5 rounded-xl border bg-background px-4 py-2">
                    <div className="grid gap-3 border-b border-border/70 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
                      <CompactField
                        label="Portée de l’adoptant"
                        value={
                          reservation.litter_id ? (
                            <Link
                              href={`/litters/${reservation.litter_id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {reservation.litter_name ?? "Portée liée"}
                            </Link>
                          ) : (
                            reservation.litter_name ?? "Aucune portée précise"
                          )
                        }
                      />
                      <CompactField
                        label="Groupe de portées"
                        value={
                          reservation.litter_group_id ? (
                            <Link
                              href={`/litter-groups/${reservation.litter_group_id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {reservation.litter_group_name ?? "Groupe lié"}
                            </Link>
                          ) : (
                            reservation.litter_group_name ??
                            "Aucun groupe de portées"
                          )
                        }
                      />
                      <CompactField
                        label="Animal attribué"
                        value={
                          relatedAnimal?.id ? (
                            <Link
                              href={`/animals/${relatedAnimal.id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {getAnimalDisplayName(relatedAnimal)}
                            </Link>
                          ) : reservation.animal_id ? (
                            reservation.animal_display_name
                          ) : (
                            "Animal non attribué pour l’instant"
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-3 border-b border-border/70 py-3 sm:grid-cols-3">
                      <CompactField
                        label="Sexe"
                        value={relatedAnimal ? getAnimalSexLabel(relatedAnimal.sex) : null}
                      />
                      <CompactField
                        label="Naissance"
                        value={relatedAnimal ? formatAnimalDate(relatedAnimal.birth_date) : null}
                      />
                      <CompactField
                        label="Identification"
                        value={
                          relatedAnimal?.identification_number ? (
                            relatedAnimal.identification_number
                          ) : reservation.animal_id ? (
                            <span className="text-amber-700">
                              Numéro absent avant départ
                            </span>
                          ) : null
                        }
                      />
                    </div>
                    <div className="grid gap-3 border-b border-border/70 py-3 sm:grid-cols-3">
                      <CompactField
                        label="Statut animal"
                        value={relatedAnimal ? getAnimalStatusLabel(relatedAnimal.status) : null}
                      />
                      <CompactField
                        label="Couleur"
                        value={relatedAnimal?.color}
                      />
                      <CompactField
                        label="Robe"
                        value={relatedAnimal?.coat_color}
                      />
                    </div>
                    <div className="grid gap-3 py-3 sm:grid-cols-2">
                      <CompactField
                        label="Date d'adoption prévue"
                        value={formatApplicationDate(reservation.adoption_planned_at)}
                      />
                      <CompactField
                        label="Date d'adoption effective"
                        value={formatApplicationDate(reservation.adoption_completed_at)}
                      />
                    </div>
                  </dl>

                  {!isFinalReservationStatus(reservation.status) ? (
                    relatedAnimal ? (
                      <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                        Un animal est déjà attribué à cet adoptant. Pour
                        modifier la portée ou le groupe, gérez d’abord
                        l’attribution afin de conserver la cohérence entre
                        l’animal et sa portée de naissance.
                      </p>
                    ) : (
                      <div className="mt-6 rounded-xl border bg-background px-4 py-4">
                        <h3 className="text-sm font-semibold text-foreground">
                          Modifier la portée de l’adoptant
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Cette action modifie uniquement la portée ou le groupe
                          choisi pour cet adoptant. Elle ne change pas le statut, la
                          candidature, les paiements, les documents, les notes
                          ou les rôles du contact.
                        </p>

                        <div className="mt-5 grid gap-5 lg:grid-cols-2">
                          <div className="rounded-xl border bg-surface px-4 py-4">
                            <h4 className="text-sm font-semibold text-foreground">
                              Choisir un groupe de portées
                            </h4>
                            {attachableLitterGroupsError ? (
                              <p
                                role="alert"
                                className="mt-3 text-sm text-amber-800"
                              >
                                Impossible de charger les groupes disponibles.
                              </p>
                            ) : attachableLitterGroups.length === 0 ? (
                              <p className="mt-3 text-sm text-muted">
                                Aucun groupe de portées disponible.
                              </p>
                            ) : (
                              <form
                                action={attachReservationToScope}
                                className="mt-4 space-y-3"
                              >
                                <input
                                  type="hidden"
                                  name="reservation_id"
                                  value={id}
                                />
                                <input
                                  type="hidden"
                                  name="return_to_reservation_id"
                                  value={id}
                                />
                                <label
                                  htmlFor="reservation-litter-group-id"
                                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                                >
                                  Groupe
                                </label>
                                <select
                                  id="reservation-litter-group-id"
                                  name="litter_group_id"
                                  required
                                  defaultValue={reservation.litter_group_id ?? ""}
                                  className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                                >
                                  <option value="" disabled>
                                    -- Choisir un groupe --
                                  </option>
                                  {attachableLitterGroups.map((group) => {
                                    const start = group.expected_period_start
                                      ? formatApplicationDate(
                                          group.expected_period_start,
                                        )
                                      : null;
                                    const end = group.expected_period_end
                                      ? formatApplicationDate(
                                          group.expected_period_end,
                                        )
                                      : null;
                                    const period =
                                      start || end
                                        ? `${start ?? "?"} - ${end ?? "?"}`
                                        : "période non renseignée";
                                    return (
                                      <option key={group.id} value={group.id}>
                                        {group.name ?? "Groupe sans nom"} (
                                        {period})
                                      </option>
                                    );
                                  })}
                                </select>
                                <p className="text-xs leading-5 text-muted">
                                  Choisir un groupe seul retire la portée précise
                                  du dossier adoptant.
                                </p>
                                <button
                                  type="submit"
                                  className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                                >
                                  Enregistrer le groupe
                                </button>
                              </form>
                            )}
                          </div>

                          <div className="rounded-xl border bg-surface px-4 py-4">
                            <h4 className="text-sm font-semibold text-foreground">
                              Choisir une portée précise
                            </h4>
                            {attachableLittersError ? (
                              <p
                                role="alert"
                                className="mt-3 text-sm text-amber-800"
                              >
                                Impossible de charger les portées disponibles.
                              </p>
                            ) : attachableLitters.length === 0 ? (
                              <p className="mt-3 text-sm text-muted">
                                Aucune portée précise disponible pour ce
                                dossier.
                              </p>
                            ) : (
                              <form
                                action={attachReservationToScope}
                                className="mt-4 space-y-3"
                              >
                                <input
                                  type="hidden"
                                  name="reservation_id"
                                  value={id}
                                />
                                <input
                                  type="hidden"
                                  name="return_to_reservation_id"
                                  value={id}
                                />
                                <label
                                  htmlFor="reservation-litter-id"
                                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                                >
                                  Portée précise
                                </label>
                                <select
                                  id="reservation-litter-id"
                                  name="litter_id"
                                  required
                                  defaultValue={reservation.litter_id ?? ""}
                                  className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                                >
                                  <option value="" disabled>
                                    -- Choisir une portée --
                                  </option>
                                  {attachableLitters.map((litter) => {
                                    const usefulDate =
                                      litter.actual_birth_date ??
                                      litter.expected_birth_date;
                                    const dateLabel = usefulDate
                                      ? formatApplicationDate(usefulDate)
                                      : "date non renseignée";
                                    const groupLabel =
                                      litter.litter_group_name ?? "sans groupe";
                                    return (
                                      <option key={litter.id} value={litter.id}>
                                        {litter.name ?? "Portée sans nom"} (
                                        {groupLabel} - {dateLabel})
                                      </option>
                                    );
                                  })}
                                </select>
                                <p className="text-xs leading-5 text-muted">
                                  {reservation.litter_group_id &&
                                  !reservation.litter_id
                                    ? "Seules les portées de ce groupe sont proposées."
                                    : "Le groupe réel de la portée choisie sera repris automatiquement."}
                                </p>
                                <button
                                  type="submit"
                                  className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                                >
                                  Enregistrer la portée
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  ) : null}

                  {animalError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger l’animal attribué.
                    </p>
	                  ) : !relatedAnimal ? (
	                    <div className="mt-6 border-t pt-5">
	                      <p className="text-sm text-muted">
	                        Aucun animal attribué à cet adoptant.
	                      </p>

	                      {!isFinalReservationStatus(reservation.status) ? (
	                        <div className="mt-4">
	                          {!reservation.litter_id ? (
	                            <p
	                              role="alert"
	                              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
	                            >
	                              Choisissez d’abord une portée précise pour cet
	                              adoptant avant d’attribuer un animal.
	                            </p>
	                          ) : availableAnimalsError ? (
	                            <p role="alert" className="text-sm text-amber-800">
	                              Impossible de charger les animaux disponibles.
	                            </p>
                          ) : availableAnimals.length === 0 ? (
                            <p className="text-sm text-muted">
                              {reservation.litter_id
                                ? "Aucun animal disponible dans cette portée."
                                : "Aucun animal attribuable trouvé pour cet adoptant."}
                            </p>
                          ) : (
                            <form action={assignAnimalToReservation} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                              <input type="hidden" name="reservation_id" value={id} />
                              <div className="max-w-xs flex-1">
                                <label htmlFor="animal_id" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                                  Attribuer un animal
                                </label>
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
                                <p className="mt-2 text-xs leading-5 text-muted">
                                  {reservation.litter_id
                                    ? "Seuls les animaux disponibles de la portée liée sont proposés."
                                    : "Seuls les chiots ou chatons nés à l’élevage et disponibles sont proposés."}
                                </p>
                              </div>
                              <button
                                type="submit"
                                className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                              >
                                Attribuer l’animal
                              </button>
                            </form>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : !isFinalReservationStatus(reservation.status) ? (
                    <form action={unassignAnimalFromReservation} className="mt-6 border-t pt-5">
                      <input type="hidden" name="reservation_id" value={id} />
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="max-w-2xl text-xs leading-5 text-muted">
                          Cela retire uniquement le lien entre l’adoptant et
                          l’animal. L’animal n’est pas supprimé.
                        </p>
                        <button
                          type="submit"
                          className="inline-flex w-fit rounded-xl border border-red-200 bg-red-50/50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100/60 hover:border-red-300"
                        >
                          Retirer l’attribution
                        </button>
                      </div>
                    </form>
                  ) : null}

                  <div className="mt-6 border-t pt-5">
                    <h3 className="text-sm font-semibold text-foreground">
                      Candidature de l’adoptant
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      La candidature décrit le projet initial de l’adoptant.
                      Modifier la candidature ne change jamais automatiquement
                      les informations de l’adoptant dans ce dossier.
                    </p>

                    {query.scope_sync_status === "success" ? (
                      <p
                        role="status"
                        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                      >
                        Les informations de portée du dossier ont été mises à
                        jour depuis la candidature.
                      </p>
                    ) : null}

                    {query.scope_sync_status === "no_scope" ? (
                      <p
                        role="alert"
                        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                      >
                        La candidature n’indique aucune portée ni groupe à
                        reprendre pour ce dossier. Aucune modification n’a été
                        appliquée.
                      </p>
                    ) : null}

                    {query.scope_sync_status === "no_application" ? (
                      <p
                        role="alert"
                        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                      >
                        Aucune candidature n’est liée à ce dossier. Aucune
                        modification n’a été appliquée.
                      </p>
                    ) : null}

                    {query.scope_sync_status === "error" ? (
                      <p
                        role="alert"
                        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                      >
                        Impossible de reprendre les informations de portée pour le moment.
                        Aucune modification n’a été appliquée.
                      </p>
                    ) : null}

                    {applicationDetailsError ? (
                      <p role="alert" className="mt-4 text-sm text-amber-800">
                        Impossible de charger les informations de portée de la candidature.
                      </p>
                    ) : !reservation.application_id ? (
                      <p className="mt-4 text-sm text-muted">
                        Aucune candidature associée à ce dossier.
                      </p>
                    ) : (
                      <>
                        <dl className="mt-5 grid gap-6 sm:grid-cols-2">
                          <DetailItem
                            label="Portée souhaitée (candidature)"
                            value={
                              applicationDesiredLitterId ? (
                                <Link
                                  href={`/litters/${applicationDesiredLitterId}`}
                                  className="font-medium text-accent hover:underline"
                                >
                                  {applicationDesiredLitterName ??
                                    "Portée souhaitée"}
                                </Link>
                              ) : (
                                "Aucune portée souhaitée"
                              )
                            }
                          />
                          <DetailItem
                            label="Groupe souhaité (candidature)"
                            value={
                              applicationDesiredGroupId
                                ? (applicationDesiredGroupName ??
                                  "Groupe souhaité")
                                : "Aucun groupe souhaité"
                            }
                          />
                        </dl>

                        {scopeDiffersFromApplication ? (
                          <p
                            role="alert"
                            className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                          >
                            Les informations de portée de la candidature
                            diffèrent de celles de ce dossier.
                          </p>
                        ) : applicationHasScope ? (
                          <p className="mt-5 text-sm text-muted">
                            Les informations de portée du dossier correspondent
                            déjà à celles de la candidature.
                          </p>
                        ) : (
                          <p className="mt-5 text-sm text-muted">
                            La candidature n’indique aucune portée ni
                            groupe. Information non bloquante.
                          </p>
                        )}

                        {canSyncScopeFromApplication ? (
                          <details className="mt-5 rounded-xl border bg-background px-4 py-3">
                            <summary className="cursor-pointer text-sm font-semibold text-accent">
                              Reprendre les informations de portée de la candidature
                            </summary>
                            <div className="mt-3 space-y-3">
                              <p className="text-xs leading-5 text-muted">
                                Cette action remplace la portée et le groupe de la
                                fiche adoptant par ceux de la candidature. Le
                                statut du dossier et la candidature ne sont pas
                                modifiés.
                              </p>
                              <form action={syncReservationScopeFromApplication}>
                                <input
                                  type="hidden"
                                  name="reservation_id"
                                  value={id}
                                />
                                <button
                                  type="submit"
                                  className="inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                                >
                                  Confirmer la reprise
                                </button>
                              </form>
                            </div>
                          </details>
                        ) : null}
                      </>
                    )}
                  </div>
                </section>

                {reservation.status === "adopted" ? (
                  <section className="order-[41] rounded-2xl border bg-surface p-6 sm:p-8">
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
                      Les documents déjà liés à ce dossier restent
                      visibles dans la section Documents liés.
                    </p>
                  </section>
                ) : null}

                <section id="notes" className="order-[50] rounded-2xl border bg-surface p-6 sm:p-8">
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

                  <div className="mt-6 rounded-xl border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Commentaire principal
                    </h3>
                    {internalCommentError ? (
                      <p className="mt-3 text-sm text-muted">
                        Le commentaire principal n’est pas disponible pour le
                        moment.
                      </p>
                    ) : !reservationIsFinal ? (
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
                          className="w-full rounded-xl border bg-surface px-4 py-3 text-sm leading-6 outline-none transition focus:border-accent"
                        />
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Commentaire synthétique interne lié à cette
                          fiche adoptant. Les notes ci-dessous conservent
                          l’historique daté.
                        </p>
                        <button
                          type="submit"
                          className="mt-4 inline-flex w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                          Enregistrer le commentaire
                        </button>
                      </form>
                    ) : reservationInternalComment?.internal_comment ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                        {reservationInternalComment.internal_comment}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-muted">
                        Aucun commentaire principal renseigné.
                      </p>
                    )}
                  </div>

                  {reservationNotesError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les notes internes liées à ce dossier.
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
                      Aucune note interne pour ce dossier.
                    </p>
                  )}

                  <div className="mt-6 border-t pt-6">
                    <ReservationNoteDialog
                      noteForm={<ReservationNoteForm reservationId={id} />}
                      triggerLabel={
                        reservationIsFinal
                          ? "+ Ajouter une note de suivi interne"
                          : undefined
                      }
                    />
                  </div>
                </section>

                <section id="payments" className="order-[10] rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Paiements liés
                  </h2>

                  <div className="mb-6 grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2 lg:grid-cols-5">
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
                      label={`Paiement de pré-réservation — ${preReservationDepositAmountLabel}`}
                      value={
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPreReservationDepositBadgeClassName(
                            preReservationDepositState,
                          )}`}
                        >
                          {getPreReservationDepositLabel(
                            preReservationDepositState,
                          )}
                        </span>
                      }
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
                                  <Link
                                    href={`/payments/${payment.id}`}
                                    className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                                  >
                                    Fiche
                                  </Link>
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
                              {!reservationIsFinal && payment.status === "requested" ? (
                                <div className="flex flex-col gap-2 sm:items-end">
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
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun paiement lié à ce dossier.
                    </p>
                  )}

                  {!reservationIsFinal ? (
                    <ReservationFinanceDialogs
                      buttonClassName="w-full justify-center whitespace-normal text-center sm:w-auto"
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
                  ) : null}
                </section>

                <section id="documents" className="order-[20] rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  <div className="mb-6 rounded-xl border bg-background p-4">
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Documents contractuels
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Certificat d’engagement et contrat de réservation sont
                          traités ensemble dans ce dossier.
                        </p>
                      </div>
                      {!reservationIsFinal && hasReservationDocumentsBundle ? (
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[230px]">
                          {!reservationDocumentsBundleSent ? (
                            <ReservationDocumentsBundleConfirmDialog
                              actionType="sent"
                              reservationId={id}
                              statusSummary={
                                reservationDocumentsBundleStatusSummary
                              }
                            />
                          ) : null}

                          {!reservationDocumentsBundleSigned ? (
                            <ReservationDocumentsBundleConfirmDialog
                              actionType="signed"
                              reservationId={id}
                              statusSummary={
                                reservationDocumentsBundleStatusSummary
                              }
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {documentsError ? (
                      <p role="alert" className="mt-4 text-sm text-amber-800">
                        Impossible de charger les documents contractuels.
                      </p>
                    ) : !hasReservationDocumentsBundle ? (
                      <div className="mt-4 rounded-lg border border-border bg-muted-soft px-3 py-2 text-sm text-muted">
                        <p className="font-medium text-foreground">
                          {reservationDocumentsBundleStatusSummary}
                        </p>
                        <p className="mt-1">
                          Le certificat d’engagement et le contrat de réservation
                          devront être présents pour utiliser les actions
                          groupées.
                        </p>
                        {missingReservationDocumentsSummary ? (
                          <p className="mt-1">
                            {missingReservationDocumentsSummary}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {reservationBundleDocuments.map((document) => (
                          <DetailItem
                            key={document.id}
                            label={getDocumentTypeLabel(document.document_type)}
                            value={getDocumentStatusLabel(
                              document.status,
                              document.document_type,
                            )}
                          />
                        ))}
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <DetailItem
                        label="Documents envoyés"
                        value={reservationDocumentsBundleSent ? "Oui" : "Non"}
                      />
                      <DetailItem
                        label="Reçus signés"
                        value={reservationDocumentsBundleSigned ? "Oui" : "Non"}
                      />
                    </div>
                  </div>

                  <div className="mb-6 rounded-xl border bg-background p-4">
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
                        const hasIndividualDocumentAction =
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
                                <Link
                                  href={`/documents/${document.id}`}
                                  className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                                >
                                  Fiche
                                </Link>
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
                                  Reçu signé le : {formatApplicationDate(document.signed_at)}
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

                            {!reservationIsFinal && hasIndividualDocumentAction ? (
                              <div className="flex flex-col gap-2 sm:items-end">
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
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun document lié à ce dossier pour l’instant.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
