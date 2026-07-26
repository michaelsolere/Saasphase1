"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BreedingCalendarEvent } from "@/features/breeding-calendar/breeding-calendar-contract";
import {
  createCalendarReminderAction,
  deleteCalendarReminderAction,
  updateCalendarReminderAction,
} from "@/features/breeding-calendar/calendar-reminder-actions";
import {
  DEFAULT_CALENDAR_REMINDER_TIMEZONE,
  canCreateCalendarReminderForEvent,
  calendarReminderSourceTypeFromEvent,
  formatCalendarReminderScheduleLabel,
} from "@/features/breeding-calendar/calendar-reminder-projection";
import type { CalendarReminderSummary } from "@/features/breeding-calendar/calendar-reminders-core";

type Props = {
  event: BreedingCalendarEvent;
  reminders: CalendarReminderSummary[];
  canWrite: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerLabel: string;
};

function normalizeLocalTimeInput(value: string) {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);
  return trimmed;
}

function formatEventDate(event: BreedingCalendarEvent) {
  const [year, month, day] = event.startsOn.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime())) return event.startsOn;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function newClientCommandId() {
  return crypto.randomUUID();
}

export function CalendarReminderDialog({
  event,
  reminders,
  canWrite,
  open: controlledOpen,
  onOpenChange,
  triggerLabel,
}: Props) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const canMutate = canWrite && canCreateCalendarReminderForEvent(event);
  const [daysBefore, setDaysBefore] = useState(1);
  const [localTime, setLocalTime] = useState("08:00");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDaysBefore, setEditDaysBefore] = useState(1);
  const [editLocalTime, setEditLocalTime] = useState("08:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetCreateForm() {
    setDaysBefore(1);
    setLocalTime("08:00");
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next) {
      setError(null);
      setEditingId(null);
      resetCreateForm();
    }
    setOpen(next);
  }

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("Les rappels sont momentanément indisponibles.");
      }
    });
  }

  function handleCreate() {
    if (!canMutate) return;
    const sourceType = calendarReminderSourceTypeFromEvent(event);
    run(async () => {
      const result = await createCalendarReminderAction({
        sourceType,
        sourceRecordId: event.sourceRecordId,
        daysBefore,
        localTime: normalizeLocalTimeInput(localTime),
        clientCommandId: newClientCommandId(),
      });
      if (result.outcome !== "success") {
        setError(result.error.message);
        return;
      }
      resetCreateForm();
      router.refresh();
    });
  }

  function startEdit(reminder: CalendarReminderSummary) {
    setEditingId(reminder.id);
    setEditDaysBefore(reminder.daysBefore);
    setEditLocalTime(normalizeLocalTimeInput(reminder.localTime));
    setError(null);
  }

  function handleUpdate(reminder: CalendarReminderSummary) {
    if (!canMutate) return;
    run(async () => {
      const result = await updateCalendarReminderAction({
        reminderId: reminder.id,
        expectedRevisionNo: reminder.revisionNo,
        daysBefore: editDaysBefore,
        localTime: normalizeLocalTimeInput(editLocalTime),
        clientCommandId: newClientCommandId(),
      });
      if (result.outcome !== "success") {
        setError(result.error.message);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(reminder: CalendarReminderSummary) {
    if (!canMutate) return;
    const confirmed = window.confirm(
      "Supprimer ce rappel ? Aucune donnée source ne sera modifiée.",
    );
    if (!confirmed) return;
    run(async () => {
      const result = await deleteCalendarReminderAction({
        reminderId: reminder.id,
        expectedRevisionNo: reminder.revisionNo,
        clientCommandId: newClientCommandId(),
      });
      if (result.outcome !== "success") {
        setError(result.error.message);
        return;
      }
      if (editingId === reminder.id) setEditingId(null);
      router.refresh();
    });
  }

  const schedulePreview = formatCalendarReminderScheduleLabel(
    daysBefore,
    localTime,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-0 px-1.5 py-0.5 text-[11px] leading-tight"
          data-testid="calendar-reminder-trigger"
          onClick={(event) => event.stopPropagation()}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg"
        data-testid="calendar-reminder-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Rappels</DialogTitle>
          <DialogDescription>
            {event.contextLabel ? `${event.contextLabel} — ` : ""}
            {event.title}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted">
          Date de l’événement : {formatEventDate(event)}
          {event.startsLocalTime
            ? ` · ${event.startsLocalTime.slice(0, 5)}`
            : ""}
        </p>

        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted">
          Ces rappels sont partagés avec l’équipe de l’élevage. Ils apparaissent
          dans la vue Aujourd’hui. Aucun e-mail ou notification push n’est
          envoyé pour le moment.
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            data-testid="calendar-reminder-error"
          >
            {error}
          </p>
        ) : null}

        <section aria-label="Rappels existants" className="space-y-3">
          <h3 className="text-sm font-semibold">
            Rappels existants{" "}
            <span className="text-muted">({reminders.length})</span>
          </h3>
          {reminders.length === 0 ? (
            <p className="text-sm text-muted">Aucun rappel pour cet événement.</p>
          ) : (
            <ul className="space-y-2" data-testid="calendar-reminder-list">
              {reminders.map((reminder) => {
                const isEditing = editingId === reminder.id;
                return (
                  <li
                    key={reminder.id}
                    className="rounded-lg border bg-surface px-3 py-2 text-sm"
                    data-testid="calendar-reminder-item"
                    data-reminder-id={reminder.id}
                  >
                    {isEditing && canMutate ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1.5 text-sm font-medium">
                            Jours avant
                            <input
                              type="number"
                              min={0}
                              max={365}
                              value={editDaysBefore}
                              disabled={pending}
                              className="rounded-lg border bg-background px-3 py-2"
                              data-testid="calendar-reminder-edit-days"
                              onChange={(event) =>
                                setEditDaysBefore(Number(event.target.value))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm font-medium">
                            Heure
                            <input
                              type="time"
                              value={editLocalTime}
                              disabled={pending}
                              className="rounded-lg border bg-background px-3 py-2"
                              data-testid="calendar-reminder-edit-time"
                              onChange={(event) =>
                                setEditLocalTime(event.target.value)
                              }
                            />
                          </label>
                        </div>
                        <p className="text-xs text-muted">
                          {formatCalendarReminderScheduleLabel(
                            editDaysBefore,
                            editLocalTime,
                          )}{" "}
                          · Fuseau {DEFAULT_CALENDAR_REMINDER_TIMEZONE}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            data-testid="calendar-reminder-save"
                            onClick={() => handleUpdate(reminder)}
                          >
                            Enregistrer
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setEditingId(null)}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{reminder.scheduleLabel}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            Fuseau {reminder.timezoneName}
                          </p>
                        </div>
                        {canMutate ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              data-testid="calendar-reminder-edit"
                              onClick={() => startEdit(reminder)}
                            >
                              Modifier
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              data-testid="calendar-reminder-delete"
                              onClick={() => handleDelete(reminder)}
                            >
                              Supprimer
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {canMutate ? (
          <section
            aria-label="Ajouter un rappel"
            className="space-y-3 border-t pt-4"
            data-testid="calendar-reminder-create"
          >
            <h3 className="text-sm font-semibold">Ajouter un rappel</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nombre de jours avant
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={daysBefore}
                  disabled={pending}
                  className="rounded-lg border bg-background px-3 py-2"
                  data-testid="calendar-reminder-days"
                  onChange={(event) =>
                    setDaysBefore(Number(event.target.value))
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Heure du rappel
                <input
                  type="time"
                  value={localTime}
                  disabled={pending}
                  className="rounded-lg border bg-background px-3 py-2"
                  data-testid="calendar-reminder-time"
                  onChange={(event) => setLocalTime(event.target.value)}
                />
              </label>
            </div>
            <p className="text-sm text-muted">
              {schedulePreview} · Fuseau {DEFAULT_CALENDAR_REMINDER_TIMEZONE}{" "}
              (non modifiable)
            </p>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                type="button"
                disabled={pending}
                data-testid="calendar-reminder-create-submit"
                onClick={handleCreate}
              >
                {pending ? "Enregistrement…" : "Créer le rappel"}
              </Button>
            </DialogFooter>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
