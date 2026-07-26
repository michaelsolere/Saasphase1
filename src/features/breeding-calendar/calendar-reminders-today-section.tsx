"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { acknowledgeCalendarReminderAction } from "@/features/breeding-calendar/calendar-reminder-actions";
import {
  calendarReminderProjectionStateLabel,
  calendarReminderSourceLabel,
} from "@/features/breeding-calendar/calendar-reminder-projection";
import {
  buildTodayReminderSections,
  type CalendarReminderSummary,
} from "@/features/breeding-calendar/calendar-reminders-core";

type Props = {
  reminders: CalendarReminderSummary[];
  canWrite: boolean;
  loadFailed?: boolean;
};

function formatTriggerDateTime(value: string | null, timezoneName: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezoneName,
  }).format(date);
}

function sourceLinkLabel(reminder: CalendarReminderSummary) {
  switch (reminder.sourceType) {
    case "litter_care_task":
      return "Ouvrir le Journal";
    case "reproductive_cycle":
      return "Ouvrir la reproduction";
    case "adopter_event":
      return "Ouvrir le parcours adoptant";
  }
}

function ReminderCard({
  reminder,
  canWrite,
  pending,
  onAcknowledge,
}: {
  reminder: CalendarReminderSummary;
  canWrite: boolean;
  pending: boolean;
  onAcknowledge: (reminder: CalendarReminderSummary) => void;
}) {
  const event = reminder.event;
  const title = event?.title ?? "Événement indisponible";
  const context = event?.contextLabel ?? null;
  const href = event?.href ?? null;
  const triggerLabel = formatTriggerDateTime(
    reminder.currentTriggerAt,
    reminder.timezoneName,
  );
  const canAcknowledge =
    canWrite &&
    (reminder.projectionState === "due" ||
      reminder.projectionState === "overdue" ||
      reminder.projectionState === "later_today") &&
    Boolean(reminder.currentTriggerAt);

  return (
    <li
      className="min-w-0 rounded-xl border bg-background px-4 py-3"
      data-testid="calendar-reminder-today-card"
      data-reminder-id={reminder.id}
      data-reminder-state={reminder.projectionState}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {calendarReminderSourceLabel(reminder.sourceType)}
          </p>
          <h4 className="mt-1 break-words font-semibold">{title}</h4>
          {context ? (
            <p className="mt-1 break-words text-sm font-medium text-foreground">
              {context}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            <span>{reminder.scheduleLabel}</span>
            {triggerLabel ? <span>{triggerLabel}</span> : null}
            <span className="font-medium text-foreground">
              {calendarReminderProjectionStateLabel(reminder.projectionState)}
            </span>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
          {canAcknowledge ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              data-testid="calendar-reminder-acknowledge"
              onClick={() => onAcknowledge(reminder)}
            >
              Marquer comme traité
            </Button>
          ) : null}
          {href ? (
            <Link
              href={href}
              className="text-sm font-semibold text-accent hover:underline"
            >
              {sourceLinkLabel(reminder)}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ReminderSubsection({
  title,
  reminders,
  canWrite,
  pending,
  onAcknowledge,
}: {
  title: string;
  reminders: CalendarReminderSummary[];
  canWrite: boolean;
  pending: boolean;
  onAcknowledge: (reminder: CalendarReminderSummary) => void;
}) {
  if (reminders.length === 0) return null;

  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold">
        {title} <span className="text-muted">({reminders.length})</span>
      </h3>
      <ul className="mt-3 space-y-2">
        {reminders.map((reminder) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            canWrite={canWrite}
            pending={pending}
            onAcknowledge={onAcknowledge}
          />
        ))}
      </ul>
    </section>
  );
}

export function CalendarRemindersTodaySection({
  reminders,
  canWrite,
  loadFailed = false,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAcknowledge(reminder: CalendarReminderSummary) {
    if (!reminder.currentTriggerAt) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await acknowledgeCalendarReminderAction({
          reminderId: reminder.id,
          expectedRevisionNo: reminder.revisionNo,
          expectedTriggerAt: reminder.currentTriggerAt!,
          clientCommandId: crypto.randomUUID(),
        });
        if (result.outcome !== "success") {
          setError(result.error.message);
          return;
        }
        router.refresh();
      } catch {
        setError("Les rappels sont momentanément indisponibles.");
      }
    });
  }

  if (loadFailed) {
    return (
      <section
        role="alert"
        className="min-w-0 overflow-x-hidden rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6"
        data-calendar-reminders-section
        data-testid="calendar-reminders-today-unavailable"
      >
        <h2 className="text-lg font-semibold">Rappels du calendrier</h2>
        <p className="mt-2 text-sm">
          Les rappels sont momentanément indisponibles.
        </p>
      </section>
    );
  }

  const sections = buildTodayReminderSections(reminders);
  const total =
    sections.actionable.length +
    sections.laterToday.length +
    sections.acknowledgedToday.length;

  if (total === 0) return null;

  return (
    <section
      className="min-w-0 overflow-x-hidden rounded-2xl border bg-surface p-5 sm:p-6"
      aria-labelledby="calendar-reminders-today-heading"
      data-calendar-reminders-section
      data-testid="calendar-reminders-today-section"
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
        <div>
          <h2
            id="calendar-reminders-today-heading"
            className="text-lg font-semibold"
          >
            Rappels du calendrier
          </h2>
          <p className="mt-1 text-sm text-muted">
            Rappels opérationnels partagés avec l’équipe. Aucun e-mail ou push
            n’est envoyé.
          </p>
        </div>
        <p className="text-sm text-muted">
          {total} rappel{total > 1 ? "s" : ""}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-6">
        <ReminderSubsection
          title="À traiter"
          reminders={sections.actionable}
          canWrite={canWrite}
          pending={pending}
          onAcknowledge={handleAcknowledge}
        />
        <ReminderSubsection
          title="Plus tard aujourd’hui"
          reminders={sections.laterToday}
          canWrite={canWrite}
          pending={pending}
          onAcknowledge={handleAcknowledge}
        />
        <ReminderSubsection
          title="Traités aujourd’hui"
          reminders={sections.acknowledgedToday}
          canWrite={canWrite}
          pending={pending}
          onAcknowledge={handleAcknowledge}
        />
      </div>
    </section>
  );
}
