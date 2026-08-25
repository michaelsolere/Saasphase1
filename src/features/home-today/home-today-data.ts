import "server-only";

import {
  isAdopterAppointmentBreedingCalendarEvent,
  isReproductiveCycleBreedingCalendarEvent,
  listAdopterAppointmentCalendarEvents,
  listReproductiveCycleCalendarEvents,
} from "@/features/breeding-calendar/breeding-calendar";
import type {
  AdopterAppointmentBreedingCalendarEvent,
  ReproductiveCycleBreedingCalendarEvent,
} from "@/features/breeding-calendar/breeding-calendar-contract";
import type { CalendarReminderSummary } from "@/features/breeding-calendar/calendar-reminders-core";
import { listOrganizationCalendarReminders } from "@/features/breeding-calendar/calendar-reminders";
import { APPLICATION_TO_VALIDATE_STATUSES } from "@/features/applications/statuses";
import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import { listOrganizationLitterCareTodayTasks } from "@/features/litter-journal/litter-care-tasks";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import { listOrganizationLitterWeighingToday } from "@/features/litter-weights/litter-weighing-today-reader";
import type { LitterWeighingTodayProjection } from "@/features/litter-weights/litter-weighing-today";
import { readCompleteDepositCentsByOrganizationId, resolveDepositSettings } from "@/features/payments/deposit-thresholds";
import { reservationNeedsAttention } from "@/features/reservations/attention";
import { isActionableLinkedReservation } from "@/features/reservations/linked-reservation";
import { createClient } from "@/lib/supabase/server";
import { readPostAdoptionAutomationDashboard } from "@/features/post-adoption-questionnaire/automated-delivery-admin";
import type { HomeTodayPostAdoptionRow } from "@/features/home-today/home-today-model";

// Every reader is independent: a failure yields `failed: true` and the panel
// shows a discreet "unavailable" note for that section only.

type ReaderResult<T> = { data: T; failed: false } | { data: null; failed: true };

async function readSection<T>(reader: () => Promise<T>): Promise<ReaderResult<T>> {
  try {
    return { data: await reader(), failed: false };
  } catch (error) {
    console.error("home_today_read_failed", error);
    return { data: null, failed: true };
  }
}

export type HomeTodayApplicationRow = {
  id: string;
  contact_display_name: string | null;
  breed: string | null;
  desired_sex_preference: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

export type HomeTodayPaymentRow = {
  id: string;
  amount_cents: number;
  currency: string | null;
  payment_type: string;
  status: string;
  due_date: string | null;
  contact_id: string | null;
  reservation_id: string | null;
};

export type HomeTodayDocumentRow = {
  id: string;
  title: string | null;
  document_type: string;
  status: string;
  created_at: string | null;
  contact_id: string | null;
  reservation_id: string | null;
};

export type HomeTodayReservationRow = {
  id: string;
  organization_id: string | null;
  contact_display_name: string | null;
  status: string | null;
  financial_resolution: string | null;
  litter_name: string | null;
  litter_group_name: string | null;
  animal_id: string | null;
};

export type HomeTodayAdopterData = {
  applications: HomeTodayApplicationRow[];
  suspectFormSubmissionsCount: number;
  payments: HomeTodayPaymentRow[];
  documents: HomeTodayDocumentRow[];
  reservationsAttention: {
    reservation: HomeTodayReservationRow;
    detailLabel: string;
    tone: "amber" | "green" | "sky";
  }[];
};

export async function readHomeTodayAdopter(): Promise<ReaderResult<HomeTodayAdopterData>> {
  return readSection(async () => {
    const supabase = await createClient();

    const [applicationsResult, suspectResult, paymentsResult, documentsResult, reservationsResult] =
      await Promise.all([
        supabase
          .from("application_overview")
          .select("id, contact_display_name, status, desired_sex_preference, breed, has_started_adopter_journey, submitted_at, created_at")
          .in("status", APPLICATION_TO_VALIDATE_STATUSES)
          .eq("has_started_adopter_journey", false)
          .order("created_at", { ascending: false }),
        supabase
          .from("form_submissions")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .or("status.eq.duplicate_suspected,duplicate_resolution.eq.pending_human_review"),
        supabase
          .from("payments")
          .select("id, amount_cents, currency, payment_type, status, due_date, created_at, contact_id, reservation_id")
          .in("status", ["requested", "pending", "partially_paid"])
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("documents")
          .select("id, title, document_type, status, signature_required, created_at, contact_id, reservation_id")
          .in("status", ["to_generate", "sent"])
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("reservation_overview")
          .select("id, organization_id, contact_id, contact_display_name, status, financial_resolution, reserved_sex_preference, litter_name, litter_group_name, price_cents, paid_cents, currency, animal_id, animal_display_name, created_at")
          .neq("status", "pre_reservation_requested")
          .order("created_at", { ascending: false }),
      ]);

    if (
      applicationsResult.error ||
      paymentsResult.error ||
      documentsResult.error ||
      reservationsResult.error
    ) {
      throw new Error("home_today_adopter_query_failed");
    }

    const applications = (applicationsResult.data ?? []) as HomeTodayApplicationRow[];
    const rawPayments = (paymentsResult.data ?? []) as HomeTodayPaymentRow[];
    const rawDocuments = (documentsResult.data ?? []) as HomeTodayDocumentRow[];
    const rawReservations = (reservationsResult.data ?? []) as (HomeTodayReservationRow & {
      reserved_sex_preference?: unknown;
      price_cents?: unknown;
      paid_cents?: unknown;
      animal_display_name?: string | null;
    })[];

    // Deposit thresholds per organization + paid arrhes per reservation.
    const organizationIds = Array.from(
      new Set(
        rawReservations
          .map((reservation) => reservation.organization_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const completeDepositCentsByOrganizationId = await readCompleteDepositCentsByOrganizationId({
      supabase,
      organizationIds,
    });
    const reservationIds = rawReservations
      .map((reservation) => reservation.id)
      .filter((id): id is string => Boolean(id));
    const { data: rawPaidArrhesPayments } = reservationIds.length > 0
      ? await supabase
          .from("payments")
          .select("reservation_id, amount_cents")
          .in("reservation_id", reservationIds)
          .in("payment_type", ["arrhes", "pre_reservation_deposit_refundable"])
          .eq("status", "paid")
          .is("deleted_at", null)
      : { data: [] };
    const paidArrhesCentsByReservationId = new Map<string, number>();
    for (const payment of rawPaidArrhesPayments ?? []) {
      if (!payment.reservation_id) continue;
      paidArrhesCentsByReservationId.set(
        payment.reservation_id,
        (paidArrhesCentsByReservationId.get(payment.reservation_id) ?? 0) +
          payment.amount_cents,
      );
    }

    const reservationStatusById = new Map<string, string | null>();
    for (const reservation of rawReservations) {
      reservationStatusById.set(reservation.id, reservation.status);
    }

    const defaultDepositCents = resolveDepositSettings(null).completeDepositCents;
    const payments = rawPayments.filter((payment) =>
      isActionableLinkedReservation(payment.reservation_id, reservationStatusById),
    );
    const documents = rawDocuments.filter((document) =>
      isActionableLinkedReservation(document.reservation_id, reservationStatusById),
    );

    const reservationsAttention: HomeTodayAdopterData["reservationsAttention"] = [];
    for (const reservation of rawReservations) {
      const paidArrhesCents = paidArrhesCentsByReservationId.get(reservation.id) ?? 0;
      const completeDepositCents = reservation.organization_id
        ? completeDepositCentsByOrganizationId.get(reservation.organization_id) ?? defaultDepositCents
        : defaultDepositCents;
      if (!reservationNeedsAttention(reservation, paidArrhesCents, completeDepositCents)) continue;

      const isArrhesCompleteNoAnimal =
        paidArrhesCents >= completeDepositCents &&
        !reservation.animal_id &&
        reservation.status !== "animal_assigned" &&
        !isFinalStatus(reservation.status);
      let detailLabel: string;
      let tone: "amber" | "green" | "sky";
      if (reservation.financial_resolution === "pending") {
        detailLabel = "Résolution financière à traiter";
        tone = "amber";
      } else if (reservation.status === "pre_reservation_paid") {
        detailLabel = isArrhesCompleteNoAnimal
          ? "Pré-réservation réglée — arrhes complètes"
          : "Pré-réservation réglée";
        tone = "sky";
      } else {
        detailLabel = isArrhesCompleteNoAnimal
          ? "Arrhes complètes — animal non attribué"
          : "À faire avancer";
        tone = isArrhesCompleteNoAnimal ? "green" : "amber";
      }
      reservationsAttention.push({ reservation, detailLabel, tone });
    }

    return {
      applications,
      suspectFormSubmissionsCount: suspectResult.count ?? 0,
      payments,
      documents,
      reservationsAttention,
    };
  });
}

function isFinalStatus(status: string | null) {
  return status === "adopted" || status === "cancelled" || status === "archived";
}

export type HomeTodayBreedingData = {
  todayDate: string;
  tasks: LitterCareTaskSummary[];
  litterNames: Record<string, string>;
  canWrite: boolean;
  weighingProjections: LitterWeighingTodayProjection[];
  appointments: AdopterAppointmentBreedingCalendarEvent[];
  reproductiveCycles: ReproductiveCycleBreedingCalendarEvent[];
  reminders: CalendarReminderSummary[];
};

export async function readHomeTodayBreeding(): Promise<
  ReaderResult<HomeTodayBreedingData>
> {
  return readSection(async () => {
    const supabase = await createClient();
    const now = new Date();
    const todayDate = formatLitterJournalBusinessDate(now);

    const source = await listOrganizationLitterCareTodayTasks({ referenceDate: todayDate });
    if (source.outcome !== "success") {
      throw new Error("home_today_breeding_tasks_failed");
    }

    const canWrite =
      source.role === "owner" || source.role === "admin" || source.role === "member";

    const [weighingResult, appointments, reproductiveCycles, reminderResult] = await Promise.all([
      listOrganizationLitterWeighingToday({ referenceDate: todayDate }, supabase),
      listAdopterAppointmentCalendarEvents(source.organizationId),
      listReproductiveCycleCalendarEvents(source.organizationId),
      listOrganizationCalendarReminders(),
    ]);

    if (weighingResult.outcome !== "success") {
      throw new Error("home_today_litter_weighing_read_failed");
    }

    return {
      todayDate,
      tasks: source.tasks,
      litterNames: source.litterNames,
      canWrite,
      weighingProjections: weighingResult.projections,
      appointments: appointments.filter(isAdopterAppointmentBreedingCalendarEvent),
      reproductiveCycles: reproductiveCycles.filter(isReproductiveCycleBreedingCalendarEvent),
      reminders: reminderResult.reminders,
    };
  });
}

export type HomeTodayPostAdoptionData = {
  rows: HomeTodayPostAdoptionRow[];
};

export async function readHomeTodayPostAdoption(): Promise<
  ReaderResult<HomeTodayPostAdoptionData>
> {
  return readSection(async () => {
    const dashboard = await readPostAdoptionAutomationDashboard(null);
    return { rows: dashboard?.rows ?? [] };
  });
}

export async function loadHomeTodaySections() {
  const [adopter, breeding, postAdoption] = await Promise.all([
    readHomeTodayAdopter(),
    readHomeTodayBreeding(),
    readHomeTodayPostAdoption(),
  ]);
  return { adopter, breeding, postAdoption };
}
