import Link from "next/link";
import { redirect } from "next/navigation";

import {
  EmptyLitterJournal,
  LitterJournalDashboard,
} from "@/features/litter-journal/litter-journal-dashboard";
import { recordMaternalObservationAction } from "@/features/litter-journal/maternal-observations-actions";
import { listMaternalObservationsForLitter } from "@/features/litter-journal/maternal-observations";
import {
  createLitterCareTaskAction,
  generateLitterCareTasksAction,
  reapplyLitterCareTaskScheduleSuggestionAction,
  replaceLockedLitterCareTaskPointScheduleAction,
  replaceLockedLitterCareTaskWindowScheduleAction,
  rescheduleLitterCareTaskPointAction,
  rescheduleLitterCareTaskWindowAction,
  resolveLitterCareTaskAction,
  setLitterCareTaskScheduleLockAction,
} from "@/features/litter-journal/litter-care-tasks-actions";
import {
  listLitterCareTasksForLitter,
  planLitterCareTaskGeneration,
} from "@/features/litter-journal/litter-care-tasks";
import { getActiveLitterPlanForLitter } from "@/features/litter-journal/litter-plans";
import { projectLitterPlanTimeline } from "@/features/litter-journal/litter-plan-timeline";
import { loadLitterJournal } from "@/features/litter-journal/loader";
import {
  formatLitterJournalBusinessDate,
  getLitterJournalBusinessLocalTime,
} from "@/features/litter-journal/date";
import type { LitterJournalSelection } from "@/features/litter-journal/types";
import { loadWhelpingWorkspace } from "@/features/whelping/whelping-workspace";
import { createClient } from "@/lib/supabase/server";
import { listLitterWeightAdjustmentHistory, listLitterWeightHistory } from "@/features/litter-weights/litter-weights";
import { cancelLitterRoutineWeightAction, cancelLitterWeighingSessionAction, correctLitterRoutineWeightAction, recordLitterRoutineWeightsAction } from "@/features/litter-weights/litter-weights-actions";
import { getRoutineWeightEligibility } from "@/features/litter-weights/routine-weight-eligibility";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger le journal des portées.</p>
      <p className="mt-2 text-sm">Réessayez dans quelques instants. Aucune donnée n’a été modifiée.</p>
    </div>
  );
}

export default async function LitterJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ litter?: string }>;
}) {
  const { litter: requestedLitterId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const litterJournalNow = new Date();
  const litterJournalTodayDate = formatLitterJournalBusinessDate(litterJournalNow);
  const litterJournalTodayLocalTime = getLitterJournalBusinessLocalTime(litterJournalNow);

  let journal: LitterJournalSelection | null = null;
  let hasLoadingError = false;
  let maternalObservations: Awaited<ReturnType<typeof listMaternalObservationsForLitter>> | null = null;
  let litterCareTasks: Awaited<
    ReturnType<typeof listLitterCareTasksForLitter>
  > | null = null;
  let litterCareTaskGenerationPlan: Awaited<
    ReturnType<typeof planLitterCareTaskGeneration>
  > | null = null;
  let activeLitterPlan: Awaited<ReturnType<typeof getActiveLitterPlanForLitter>> | null = null;
  let whelpingWorkspace: Awaited<
    ReturnType<typeof loadWhelpingWorkspace>
  > | null = null;
  let litterWeightHistory: Awaited<
    ReturnType<typeof listLitterWeightHistory>
  > | null = null;
  let litterWeightAdjustmentHistory: Awaited<ReturnType<typeof listLitterWeightAdjustmentHistory>> | null = null;

  try {
    journal = await loadLitterJournal(supabase, requestedLitterId);
  } catch {
    hasLoadingError = true;
  }

  if (journal?.selectedLitter?.id) {
    const litterId = journal.selectedLitter.id;
    const [maternalResult, tasksResult, generationPlanResult, activePlanResult, whelpingResult, weightsResult, adjustmentHistoryResult] =
      await Promise.allSettled([
        listMaternalObservationsForLitter({ litterId }),
        listLitterCareTasksForLitter({ litterId }),
        planLitterCareTaskGeneration({ litterId }),
        getActiveLitterPlanForLitter(litterId, supabase),
        loadWhelpingWorkspace(litterId, supabase),
        listLitterWeightHistory({
          litterId,
          schedule: {
            todayDate: litterJournalTodayDate,
          },
        }),
        listLitterWeightAdjustmentHistory({ litterId, limit: 100 }),
      ]);

    maternalObservations =
      maternalResult.status === "fulfilled" ? maternalResult.value : null;
    litterCareTasks =
      tasksResult.status === "fulfilled" ? tasksResult.value : null;
    litterCareTaskGenerationPlan =
      generationPlanResult.status === "fulfilled"
        ? generationPlanResult.value
        : null;
    activeLitterPlan =
      activePlanResult.status === "fulfilled" ? activePlanResult.value : null;
    whelpingWorkspace =
      whelpingResult.status === "fulfilled" ? whelpingResult.value : null;
    litterWeightHistory =
      weightsResult.status === "fulfilled" ? weightsResult.value : null;
    litterWeightAdjustmentHistory = adjustmentHistoryResult.status === "fulfilled" ? adjustmentHistoryResult.value : null;
  }

  const maternalObservationsLoaded =
    maternalObservations?.outcome === "success" ? maternalObservations : null;
  const clientCommandId = crypto.randomUUID();
  const maternalObservationAction =
    journal?.selectedLitter?.id && maternalObservationsLoaded
      ? recordMaternalObservationAction.bind(null, {
          litterId: journal.selectedLitter.id,
          clientCommandId,
        })
      : null;
  const litterCareTasksLoaded =
    litterCareTasks?.outcome === "success" ? litterCareTasks : null;
  const litterPlanLoadError =
    activeLitterPlan === null ||
    litterCareTasksLoaded === null ||
    ("outcome" in activeLitterPlan && activeLitterPlan.error.code !== "not_found");
  const litterPlanTimeline =
    !litterPlanLoadError &&
    activeLitterPlan &&
    !("outcome" in activeLitterPlan) &&
    litterCareTasksLoaded
      ? projectLitterPlanTimeline(activeLitterPlan, litterCareTasksLoaded.tasks)
      : null;
  const litterCareTaskGenerationPlanLoaded =
    litterCareTaskGenerationPlan?.outcome === "success"
      ? litterCareTaskGenerationPlan
      : null;
  const litterCareTaskCanWrite =
    litterCareTasksLoaded?.role === "owner" ||
    litterCareTasksLoaded?.role === "admin" ||
    litterCareTasksLoaded?.role === "member";
  const createTaskClientCommandId = crypto.randomUUID();
  const createTaskAction =
    journal?.selectedLitter?.id && litterCareTaskCanWrite
      ? createLitterCareTaskAction.bind(null, {
          litterId: journal.selectedLitter.id,
          clientCommandId: createTaskClientCommandId,
        })
      : null;
  const generationClientCommandId = crypto.randomUUID();
  const litterCareTaskGenerationCanWrite =
    litterCareTaskGenerationPlanLoaded?.role === "owner" ||
    litterCareTaskGenerationPlanLoaded?.role === "admin" ||
    litterCareTaskGenerationPlanLoaded?.role === "member";
  const litterCareTaskGenerationAction =
    journal?.selectedLitter?.id &&
    litterCareTaskGenerationPlanLoaded &&
    litterCareTaskGenerationCanWrite
      ? generateLitterCareTasksAction.bind(null, {
          litterId: journal.selectedLitter.id,
          clientCommandId: generationClientCommandId,
          readyPlan: litterCareTaskGenerationPlanLoaded.readyPlan,
        })
      : null;
  const litterCareTaskGenerationEntries =
    litterCareTaskGenerationPlanLoaded?.entries.map((entry) => ({
      template: {
        id: entry.template.id,
        title: entry.template.title,
        category: entry.template.category,
        targetScope: entry.template.targetScope,
        anchorType: entry.template.anchorType,
        offsetDays: entry.template.offsetDays,
      },
      state: entry.state,
      plannedFor: entry.readyPlan?.plannedFor ?? null,
    })) ?? [];
  const resolutionActions = litterCareTaskCanWrite
    ? (litterCareTasksLoaded?.tasks ?? [])
        .filter((task) => task.status === "planned")
        .map((task) => {
          const resolutionClientCommandId = crypto.randomUUID();
          return {
            taskId: task.id,
            clientCommandId: resolutionClientCommandId,
            action: resolveLitterCareTaskAction.bind(null, {
              taskId: task.id,
              clientCommandId: resolutionClientCommandId,
            }),
          };
        })
    : [];
  const scheduleActions = litterCareTaskCanWrite
    ? (litterCareTasksLoaded?.tasks ?? [])
        .filter((task) => task.status === "planned")
        .map((task) => {
          const base = {
            taskId: task.id,
            expectedRevisionNo: task.revisionNo,
          };
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
        })
    : [];
  const whelpingWorkspaceLoaded = whelpingWorkspace;
  const selectedLitterId = journal?.selectedLitter?.id ?? null;
  const litterWeightHistoryLoaded =
    litterWeightHistory?.outcome === "success" ? litterWeightHistory : null;
  const eligibleLitterWeightAnimals =
    litterWeightHistoryLoaded?.animals.filter(
      (animal) => getRoutineWeightEligibility(animal).eligible,
    ) ?? [];
  const litterWeightCanWrite =
    litterWeightHistoryLoaded?.role === "owner" ||
    litterWeightHistoryLoaded?.role === "admin" ||
    litterWeightHistoryLoaded?.role === "member";
  const litterWeightClientCommandId = crypto.randomUUID();
  const litterWeightAction =
    selectedLitterId &&
    litterWeightHistoryLoaded &&
    litterWeightCanWrite &&
    eligibleLitterWeightAnimals.length >= 1 &&
    eligibleLitterWeightAnimals.length <= 30
      ? recordLitterRoutineWeightsAction.bind(null, {
          litterId: selectedLitterId,
          clientCommandId: litterWeightClientCommandId,
          animalIds: eligibleLitterWeightAnimals.map((animal) => animal.id),
        })
      : null;
  const litterWeightAdjustmentHistoryLoaded = litterWeightAdjustmentHistory?.outcome === "success" ? litterWeightAdjustmentHistory : null;
  const routineMeasurements = litterWeightHistoryLoaded?.measurements.filter((measurement) => measurement.type === "routine" && measurement.sessionId !== null) ?? [];
  const measurementAdjustmentActions = litterWeightCanWrite && selectedLitterId
    ? routineMeasurements.map((measurement) => {
        const session = litterWeightHistoryLoaded?.sessions.find((item) => item.id === measurement.sessionId);
        if (!session) return null;
        const activeCount = routineMeasurements.filter((item) => item.sessionId === session.id).length;
        const base = { litterId: selectedLitterId, sessionId: session.id, measurementId: measurement.id, animalId: measurement.animalId, expectedRevisionNo: measurement.revisionNo };
        return {
          measurementId: measurement.id,
          correctAction: correctLitterRoutineWeightAction.bind(null, { ...base, clientCommandId: crypto.randomUUID() }),
          cancelAction: activeCount >= 2 ? cancelLitterRoutineWeightAction.bind(null, { ...base, clientCommandId: crypto.randomUUID() }) : null,
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  const sessionCancellationActions = litterWeightCanWrite && selectedLitterId
    ? (litterWeightHistoryLoaded?.sessions ?? []).map((session) => ({
        sessionId: session.id,
        action: cancelLitterWeighingSessionAction.bind(null, { litterId: selectedLitterId, sessionId: session.id, expectedRevisionNo: session.revisionNo, clientCommandId: crypto.randomUUID() }),
      }))
    : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Espace privé · Suivi</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Journal des portées</h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">Suivez le contexte, les observations et les tâches de chaque portée active.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            <Link href="/litters/journal/comparison" className="text-accent hover:underline">
              Comparer des portées
            </Link>
            <Link href="/litters" className="text-accent hover:underline">
              Retour aux portées
            </Link>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !journal ? <ErrorMessage /> : journal.selectedLitter ? (
          <LitterJournalDashboard
            litters={journal.litters}
            litter={journal.selectedLitter}
            details={journal.selectedDetails}
            maternalObservations={
              maternalObservationsLoaded?.observations ?? []
            }
            maternalObservationRole={
              maternalObservationsLoaded?.role ?? null
            }
            maternalObservationAction={maternalObservationAction}
            maternalObservationsLoadError={maternalObservationsLoaded === null}
            maternalTemperatureDropPolicy={
              maternalObservationsLoaded?.temperatureDropPolicy ?? null
            }
            maternalTemperatureDropPolicyUnavailable={
              maternalObservationsLoaded?.temperatureDropPolicyUnavailable ??
              false
            }
            litterCareTasks={litterCareTasksLoaded?.tasks ?? []}
            litterCareTaskRole={litterCareTasksLoaded?.role ?? null}
            litterCareTaskGenerationEntries={
              litterCareTaskGenerationEntries
            }
            litterCareTaskGenerationRole={
              litterCareTaskGenerationPlanLoaded?.role ?? null
            }
            litterCareTaskGenerationAction={litterCareTaskGenerationAction}
            litterCareTaskGenerationLoadError={
              litterCareTaskGenerationPlanLoaded === null
            }
            createLitterCareTaskAction={createTaskAction}
            createLitterCareTaskClientCommandId={createTaskClientCommandId}
            litterCareTaskResolutionActions={resolutionActions}
            litterCareTaskScheduleActions={scheduleActions}
            litterCareTasksLoadError={litterCareTasksLoaded === null}
            litterCareTodayDate={litterJournalTodayDate}
            litterCareTodayLocalTime={litterJournalTodayLocalTime}
            litterPlanTimeline={litterPlanTimeline}
            litterPlanLoadError={litterPlanLoadError}
            whelpingSession={whelpingWorkspaceLoaded?.session ?? null}
            whelpingEvents={whelpingWorkspaceLoaded?.events ?? []}
            whelpingBirths={whelpingWorkspaceLoaded?.births ?? []}
            whelpingRole={whelpingWorkspaceLoaded?.role ?? null}
            whelpingLoadError={
              whelpingWorkspaceLoaded?.loadError ?? true
            }
            openWhelpingAction={whelpingWorkspaceLoaded?.openAction ?? null}
            recordWhelpingEventAction={whelpingWorkspaceLoaded?.eventAction ?? null}
            recordWhelpingBirthAction={whelpingWorkspaceLoaded?.birthAction ?? null}
            recordWhelpingBirthWeightActions={whelpingWorkspaceLoaded?.birthWeightActions ?? []}
            whelpingBirthAdjustmentActions={whelpingWorkspaceLoaded?.birthAdjustmentActions ?? []}
            whelpingBirthAdjustmentHistory={whelpingWorkspaceLoaded?.adjustmentHistory ?? []}
            whelpingBirthAdjustmentHistoryLoadError={
              whelpingWorkspaceLoaded?.adjustmentHistoryLoadError ?? true
            }
            closeWhelpingSessionAction={whelpingWorkspaceLoaded?.closeAction ?? null}
            reopenWhelpingSessionAction={whelpingWorkspaceLoaded?.reopenAction ?? null}
            litterWeightAnimals={litterWeightHistoryLoaded?.animals ?? []}
            litterWeightSessions={litterWeightHistoryLoaded?.sessions ?? []}
            litterWeightMeasurements={litterWeightHistoryLoaded?.measurements ?? []}
            litterWeightLatestSessionComparison={
              litterWeightHistoryLoaded?.latestSessionComparison ?? {
                status: "insufficient_sessions",
              }
            }
            litterWeightSchedule={
              litterWeightHistoryLoaded?.weighingSchedule ?? null
            }
            litterWeightSchedulePolicy={
              litterWeightHistoryLoaded?.weighingSchedulePolicy ?? null
            }
            litterWeightRole={litterWeightHistoryLoaded?.role ?? null}
            litterWeightAction={litterWeightAction}
            litterWeightMeasurementAdjustmentActions={measurementAdjustmentActions}
            litterWeightSessionCancellationActions={sessionCancellationActions}
            litterWeightAdjustmentHistory={litterWeightAdjustmentHistoryLoaded?.entries ?? []}
            litterWeightAdjustmentHistoryLoadError={litterWeightAdjustmentHistoryLoaded === null}
            litterWeightsLoadError={litterWeightHistoryLoaded === null}
          />
        ) : (
          <EmptyLitterJournal />
        )}
      </section>
    </main>
  );
}
