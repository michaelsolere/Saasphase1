import Link from "next/link";
import { redirect } from "next/navigation";

import {
  isAdopterAppointmentBreedingCalendarEvent,
  listAdopterAppointmentCalendarEvents,
} from "@/features/breeding-calendar/breeding-calendar";
import { BreedingTodayPanel } from "@/features/breeding-calendar/breeding-today-panel";
import {
  formatLitterJournalBusinessDate,
  getLitterJournalBusinessLocalTime,
} from "@/features/litter-journal/date";
import type { LitterCareTaskScheduleActions } from "@/features/litter-journal/litter-care-task-schedule-dialog";
import {
  reapplyLitterCareTaskScheduleSuggestionAction,
  replaceLockedLitterCareTaskPointScheduleAction,
  replaceLockedLitterCareTaskWindowScheduleAction,
  rescheduleLitterCareTaskPointAction,
  rescheduleLitterCareTaskWindowAction,
  resolveLitterCareTaskAction,
  setLitterCareTaskScheduleLockAction,
} from "@/features/litter-journal/litter-care-tasks-actions";
import {
  listOrganizationLitterCareTodayTasks,
  type LitterCareTaskSummary,
} from "@/features/litter-journal/litter-care-tasks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function bindLitterCareTaskScheduleActions(
  task: LitterCareTaskSummary,
): LitterCareTaskScheduleActions {
  const base = { taskId: task.id, expectedRevisionNo: task.revisionNo };
  const isWindow = task.itemKind === "window";
  const hasSuggestion = isWindow
    ? Boolean(task.suggestedStartsOn && task.suggestedEndsOn)
    : Boolean(task.suggestedFor);

  return {
    taskId: task.id,
    rescheduleAction: (isWindow
      ? rescheduleLitterCareTaskWindowAction
      : rescheduleLitterCareTaskPointAction
    ).bind(null, { ...base, clientCommandId: crypto.randomUUID() }),
    replaceLockedAction: (isWindow
      ? replaceLockedLitterCareTaskWindowScheduleAction
      : replaceLockedLitterCareTaskPointScheduleAction
    ).bind(null, { ...base, clientCommandId: crypto.randomUUID() }),
    lockAction: setLitterCareTaskScheduleLockAction.bind(null, {
      ...base,
      isLocked: true,
      clientCommandId: crypto.randomUUID(),
    }),
    unlockAction: setLitterCareTaskScheduleLockAction.bind(null, {
      ...base,
      isLocked: false,
      clientCommandId: crypto.randomUUID(),
    }),
    reapplySuggestionAction: hasSuggestion
      ? reapplyLitterCareTaskScheduleSuggestionAction.bind(null, {
          ...base,
          clientCommandId: crypto.randomUUID(),
        })
      : null,
  };
}

function BreedingTodayNav({ active }: { active: "calendar" | "today" }) {
  return (
    <nav aria-label="Choix de la vue" className="mt-5 flex flex-wrap gap-3">
      <Link
        href="/calendar/today"
        aria-current={active === "today" ? "page" : undefined}
        className={`rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted ${active === "today" ? "bg-muted" : ""}`}
      >
        Aujourd’hui
      </Link>
      <Link
        href="/calendar"
        aria-current={active === "calendar" ? "page" : undefined}
        className={`rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted ${active === "calendar" ? "bg-muted" : ""}`}
      >
        Calendrier
      </Link>
    </nav>
  );
}

export default async function BreedingTodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const todayDate = formatLitterJournalBusinessDate(now);
  const todayLocalTime = getLitterJournalBusinessLocalTime(now);

  let source: Awaited<ReturnType<typeof listOrganizationLitterCareTodayTasks>> | null =
    null;
  let appointments: Awaited<ReturnType<typeof listAdopterAppointmentCalendarEvents>> =
    [];
  let hasLoadingError = false;

  try {
    source = await listOrganizationLitterCareTodayTasks({ referenceDate: todayDate });
    if (source.outcome !== "success") hasLoadingError = true;
    else {
      appointments = await listAdopterAppointmentCalendarEvents(source.organizationId);
    }
  } catch {
    hasLoadingError = true;
  }

  if (hasLoadingError || !source || source.outcome !== "success") {
    return (
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <header className="rounded-2xl border bg-surface p-5 sm:p-6">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-accent">
            Aujourd’hui — élevage
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-muted">
            Vue quotidienne des actions planifiées des portées et des
            rendez-vous adoptants du jour.
          </p>
          <BreedingTodayNav active="today" />
        </header>
        <section
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
        >
          <h2 className="text-xl font-semibold">
            Vue Aujourd’hui momentanément indisponible
          </h2>
          <p className="mt-2 text-sm">Aucune donnée n’a été modifiée.</p>
        </section>
      </main>
    );
  }

  const canWrite =
    source.role === "owner" || source.role === "admin" || source.role === "member";
  const plannedTasks = source.tasks.filter((task) => task.status === "planned");
  const quickActions = canWrite
    ? plannedTasks.map((task) => ({
        taskId: task.id,
        doneAction: resolveLitterCareTaskAction.bind(null, {
          taskId: task.id,
          clientCommandId: crypto.randomUUID(),
        }),
        notApplicableAction: resolveLitterCareTaskAction.bind(null, {
          taskId: task.id,
          clientCommandId: crypto.randomUUID(),
        }),
      }))
    : [];
  const scheduleActions = canWrite
    ? plannedTasks.map(bindLitterCareTaskScheduleActions)
    : [];

  return (
    <main className="mx-auto max-w-7xl space-y-6 overflow-x-hidden px-4 py-6 sm:px-6">
      <header className="rounded-2xl border bg-surface p-5 sm:p-6">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-accent">
          Aujourd’hui — élevage
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Vue quotidienne des actions planifiées des portées et des rendez-vous
          adoptants du jour. Traitez les tâches de portée ici ou ouvrez le
          Journal concerné ; les rendez-vous se gèrent dans le parcours adoptant.
        </p>
        <BreedingTodayNav active="today" />
      </header>
      <BreedingTodayPanel
        tasks={source.tasks}
        litterNames={source.litterNames}
        todayDate={todayDate}
        todayLocalTime={todayLocalTime}
        appointments={appointments.filter(isAdopterAppointmentBreedingCalendarEvent)}
        quickActions={quickActions}
        scheduleActions={scheduleActions}
      />
    </main>
  );
}
