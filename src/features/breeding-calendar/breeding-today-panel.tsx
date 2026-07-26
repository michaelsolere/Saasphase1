import Link from "next/link";

import {
  adopterAppointmentStatusLabels,
} from "@/features/breeding-calendar/adopter-appointment-calendar";
import type { AdopterAppointmentBreedingCalendarEvent } from "@/features/breeding-calendar/breeding-calendar-contract";
import { filterAdopterAppointmentsForToday } from "@/features/breeding-calendar/breeding-calendar-projection";
import { getLitterDisplayName } from "@/features/litters/formatters";
import { litterCareTaskCategoryLabels } from "@/features/litter-journal/litter-care-task-labels";
import {
  getLitterCareTaskResolvedBusinessDateTime,
  projectLitterCareToday,
} from "@/features/litter-journal/litter-care-today";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks-core";
import {
  LitterCareTodayQuickActions as LitterCareTodayQuickActionsComponent,
  type LitterCareTodayQuickActions,
} from "@/features/litter-journal/litter-care-today-quick-actions";
import type { LitterCareTaskScheduleActions } from "@/features/litter-journal/litter-care-task-schedule-dialog";

export const BREEDING_TODAY_EMPTY_MESSAGE =
  "Aucune action à traiter aujourd’hui pour l’élevage.";
export const BREEDING_TODAY_UNAVAILABLE_MESSAGE =
  "La vue Aujourd’hui de l’élevage n’est pas disponible pour le moment.";

const itemKindLabels: Record<LitterCareTaskSummary["itemKind"], string> = {
  milestone: "Jalon",
  task: "Tâche",
  recurring_task: "Tâche récurrente",
  window: "Fenêtre",
};

const statusLabels: Record<LitterCareTaskSummary["status"], string> = {
  planned: "À faire",
  done: "Réalisée",
  cancelled: "Annulée",
  not_applicable: "Non applicable",
};

const priorityLabels: Partial<Record<LitterCareTaskSummary["priority"], string>> = {
  organization_critical: "Priorité : critique organisationnelle",
  important: "Priorité : importante",
  normal: "Priorité : normale",
};

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTime(value: string | null) {
  return value?.slice(0, 5).replace(":", " h ") ?? null;
}

function retainedDateLabel(task: LitterCareTaskSummary) {
  if (task.itemKind === "window") {
    if (task.retainedStartsOn && task.retainedEndsOn) {
      if (task.retainedStartsOn === task.retainedEndsOn) {
        return formatCivilDate(task.retainedStartsOn);
      }
      return `Du ${formatCivilDate(task.retainedStartsOn)} au ${formatCivilDate(task.retainedEndsOn)}`;
    }
    return task.retainedStartsOn
      ? formatCivilDate(task.retainedStartsOn)
      : task.retainedEndsOn
        ? formatCivilDate(task.retainedEndsOn)
        : null;
  }

  return task.plannedFor ? formatCivilDate(task.plannedFor) : null;
}

function scheduleLabel(task: LitterCareTaskSummary) {
  if (task.itemKind === "window") {
    const start = formatTime(task.retainedStartsLocalTime);
    const end = formatTime(task.retainedEndsLocalTime);
    if (start && end) return `De ${start} à ${end}`;
    if (start) return `À partir de ${start}`;
    if (end) return `Jusqu’à ${end}`;
    return null;
  }

  const time = formatTime(task.scheduledLocalTime);
  return time ? `À ${time}` : null;
}

function adjustmentLabel(task: LitterCareTaskSummary) {
  if (task.isScheduleLocked) return "Programmation verrouillée";
  if (task.scheduleSource === "manual") return "Programmation ajustée";
  return null;
}

function litterContextLabel(litterName: string | undefined, litterId: string) {
  return `Portée ${getLitterDisplayName(litterName ?? null, litterId)}`;
}

function journalHref(litterId: string) {
  return `/litters/journal?litter=${encodeURIComponent(litterId)}`;
}

function TodayTask({
  task,
  litterName,
  active,
  quickActions,
  scheduleActions,
}: {
  task: LitterCareTaskSummary;
  litterName: string | undefined;
  active: boolean;
  quickActions: LitterCareTodayQuickActions | null;
  scheduleActions: LitterCareTaskScheduleActions | null;
}) {
  const priority = priorityLabels[task.priority];
  const retainedDate = active ? retainedDateLabel(task) : null;
  const schedule = active
    ? scheduleLabel(task)
    : task.resolvedAt
      ? `Traité à ${formatTime(getLitterCareTaskResolvedBusinessDateTime(task.resolvedAt).time)}`
      : null;
  const adjustment = active ? adjustmentLabel(task) : null;
  const context = litterContextLabel(litterName, task.litterId);

  return (
    <li className="min-w-0 rounded-xl border bg-background px-4 py-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {itemKindLabels[task.itemKind]} · {litterCareTaskCategoryLabels[task.category]}
          </p>
          <h4 className="mt-1 break-words font-semibold">{task.title}</h4>
          <p className="mt-1 break-words text-sm font-medium text-foreground">{context}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            {retainedDate ? <span>{retainedDate}</span> : null}
            {schedule ? <span>{schedule}</span> : null}
            {priority ? <span className="font-medium text-foreground">{priority}</span> : null}
            {adjustment ? <span className="font-medium text-foreground">{adjustment}</span> : null}
            {!active ? (
              <span className="font-medium text-foreground">Statut : {statusLabels[task.status]}</span>
            ) : null}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
          {active && quickActions ? (
            <LitterCareTodayQuickActionsComponent
              task={task}
              actions={quickActions}
              scheduleActions={scheduleActions}
            />
          ) : null}
          <Link
            href={journalHref(task.litterId)}
            className="text-sm font-semibold text-accent hover:underline"
          >
            Ouvrir le Journal
          </Link>
        </div>
      </div>
    </li>
  );
}

function TodaySection({
  title,
  tasks,
  litterNames,
  active,
  quickActionsByTaskId,
  scheduleActionsByTaskId,
}: {
  title: string;
  tasks: LitterCareTaskSummary[];
  litterNames: Record<string, string>;
  active: boolean;
  quickActionsByTaskId: Map<string, LitterCareTodayQuickActions>;
  scheduleActionsByTaskId: Map<string, LitterCareTaskScheduleActions>;
}) {
  if (tasks.length === 0) return null;

  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold">
        {title} <span className="text-muted">({tasks.length})</span>
      </h3>
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => (
          <TodayTask
            key={task.id}
            task={task}
            litterName={litterNames[task.litterId]}
            active={active}
            quickActions={active ? quickActionsByTaskId.get(task.id) ?? null : null}
            scheduleActions={active ? scheduleActionsByTaskId.get(task.id) ?? null : null}
          />
        ))}
      </ul>
    </section>
  );
}

function TodayAppointment({
  appointment,
}: {
  appointment: AdopterAppointmentBreedingCalendarEvent;
}) {
  const time = formatTime(appointment.startsLocalTime);
  return (
    <li
      className="min-w-0 rounded-xl border border-sky-500/40 bg-sky-50/50 px-4 py-3"
      data-calendar-source="adopter_appointment"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Rendez-vous · {adopterAppointmentStatusLabels[appointment.appointmentStatus]}
          </p>
          <h4 className="mt-1 break-words font-semibold">{appointment.title}</h4>
          <p className="mt-1 break-words text-sm font-medium text-foreground">
            {appointment.contextLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            <span>{formatCivilDate(appointment.startsOn)}</span>
            {time ? <span>À {time}</span> : null}
            <span className="font-medium text-foreground">
              {adopterAppointmentStatusLabels[appointment.appointmentStatus]}
            </span>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
          <Link
            href={appointment.href}
            className="text-sm font-semibold text-accent hover:underline"
          >
            Ouvrir le parcours adoptant
          </Link>
        </div>
      </div>
    </li>
  );
}

function TodayAppointmentsSection({
  appointments,
}: {
  appointments: readonly AdopterAppointmentBreedingCalendarEvent[];
}) {
  if (appointments.length === 0) return null;
  return (
    <section
      aria-label="Rendez-vous adoptants aujourd’hui"
      className="min-w-0 overflow-x-hidden rounded-2xl border bg-surface p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold">Rendez-vous adoptants aujourd’hui</h2>
      <p className="mt-1 text-sm text-muted">
        Lecture seule — la modification se fait dans le parcours adoptant.
      </p>
      <ul className="mt-5 space-y-2">
        {appointments.map((appointment) => (
          <TodayAppointment key={appointment.sourceRecordId} appointment={appointment} />
        ))}
      </ul>
    </section>
  );
}

export function BreedingTodayPanel({
  tasks,
  litterNames,
  todayDate,
  todayLocalTime,
  appointments = [],
  quickActions = [],
  scheduleActions = [],
  unavailable = false,
}: {
  tasks: LitterCareTaskSummary[];
  litterNames: Record<string, string>;
  todayDate: string;
  todayLocalTime: string;
  appointments?: readonly AdopterAppointmentBreedingCalendarEvent[];
  quickActions?: LitterCareTodayQuickActions[];
  scheduleActions?: LitterCareTaskScheduleActions[];
  unavailable?: boolean;
}) {
  const projection = projectLitterCareToday(tasks, {
    date: todayDate,
    localTime: todayLocalTime,
  });
  const total =
    projection.dueToday.length +
    projection.overdue.length +
    projection.openWindows.length +
    projection.handledToday.length;
  const quickActionsByTaskId = new Map(quickActions.map((actions) => [actions.taskId, actions]));
  const scheduleActionsByTaskId = new Map(
    scheduleActions.map((actions) => [actions.taskId, actions]),
  );
  const todayAppointments = filterAdopterAppointmentsForToday(appointments, todayDate);

  return (
    <div className="space-y-6">
      <section
        className="min-w-0 overflow-x-hidden rounded-2xl border bg-surface p-5 sm:p-6"
        aria-labelledby="breeding-today-heading"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
          <div>
            <h2 id="breeding-today-heading" className="text-lg font-semibold">
              Aujourd’hui
            </h2>
            <p className="mt-1 text-sm text-muted">{formatCivilDate(todayDate)}</p>
          </div>
          {!unavailable ? (
            <p className="text-sm text-muted">
              {total} élément{total > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
        {unavailable ? (
          <p className="mt-5 text-sm text-muted">{BREEDING_TODAY_UNAVAILABLE_MESSAGE}</p>
        ) : total === 0 ? (
          <p className="mt-5 text-sm text-muted">{BREEDING_TODAY_EMPTY_MESSAGE}</p>
        ) : (
          <div className="mt-5 space-y-6">
            <TodaySection
              title="À faire aujourd’hui"
              tasks={projection.dueToday}
              litterNames={litterNames}
              active
              quickActionsByTaskId={quickActionsByTaskId}
              scheduleActionsByTaskId={scheduleActionsByTaskId}
            />
            <TodaySection
              title="En retard"
              tasks={projection.overdue}
              litterNames={litterNames}
              active
              quickActionsByTaskId={quickActionsByTaskId}
              scheduleActionsByTaskId={scheduleActionsByTaskId}
            />
            <TodaySection
              title="Fenêtres ouvertes"
              tasks={projection.openWindows}
              litterNames={litterNames}
              active
              quickActionsByTaskId={quickActionsByTaskId}
              scheduleActionsByTaskId={scheduleActionsByTaskId}
            />
            <TodaySection
              title="Traité aujourd’hui"
              tasks={projection.handledToday}
              litterNames={litterNames}
              active={false}
              quickActionsByTaskId={quickActionsByTaskId}
              scheduleActionsByTaskId={scheduleActionsByTaskId}
            />
          </div>
        )}
      </section>
      <TodayAppointmentsSection appointments={todayAppointments} />
    </div>
  );
}
