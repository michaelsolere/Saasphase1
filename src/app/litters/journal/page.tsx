import Link from "next/link";
import { redirect } from "next/navigation";

import {
  EmptyLitterJournal,
  LitterJournalDashboard,
} from "@/features/litter-journal/litter-journal-dashboard";
import { recordMaternalObservationAction } from "@/features/litter-journal/maternal-observations-actions";
import { listMaternalObservationsForLitter } from "@/features/litter-journal/maternal-observations";
import {
  generateLitterCareTasksAction,
  reapplyLitterCareTaskScheduleSuggestionAction,
  replaceLockedLitterCareTaskPointScheduleAction,
  replaceLockedLitterCareTaskWindowScheduleAction,
  rescheduleLitterCareTaskPointAction,
  rescheduleLitterCareTaskWindowAction,
  resolveLitterCareTaskAction,
  setLitterCareTaskScheduleLockAction,
} from "@/features/litter-journal/litter-care-tasks-actions";
import { createLitterPlanAdHocItemAction } from "@/features/litter-journal/litter-plan-ad-hoc-programmer-actions";
import { updateLitterPlanAdHocItemMetadataAction } from "@/features/litter-journal/litter-plan-ad-hoc-metadata-actions";
import { canShowLitterPlanAdHocProgrammer } from "@/features/litter-journal/litter-plan-ad-hoc-programmer";
import {
  listLitterCareTasksForLitter,
  planLitterCareTaskGeneration,
} from "@/features/litter-journal/litter-care-tasks";
import { getActiveLitterPlanForLitter, listLitterPlanSeriesSummariesForLitter } from "@/features/litter-journal/litter-plans";
import {
  materializeLitterPlanSeriesAction,
  setLitterPlanSeriesStateAction,
} from "@/features/litter-journal/litter-plan-series-actions";
import type { LitterPlanSeriesPanelActions } from "@/features/litter-journal/litter-plan-series-panel";
import {
  buildInteractiveLitterPlanTimeline,
} from "@/features/litter-journal/litter-plan-timeline-interaction";
import {
  moveOrResizeTimelineWindowAction,
  moveTimelinePointAction,
} from "@/features/litter-journal/litter-plan-timeline-interaction-actions";
import type { LitterPlanTimelineScheduleTarget, LitterPlanTimelineMetadataTarget } from "@/features/litter-journal/litter-plan-timeline-panel";
import { applyLitterPlanningModelAction } from "@/features/litter-journal/litter-planning-model-apply-actions";
import { loadLitterPlanningModelApplicationPanel } from "@/features/litter-journal/litter-planning-model-application";
import { loadLitterJournal } from "@/features/litter-journal/loader";
import {
  formatLitterJournalBusinessDate,
  getLitterJournalBusinessLocalTime,
  LITTER_JOURNAL_TIME_ZONE,
} from "@/features/litter-journal/date";
import type { LitterJournalSelection } from "@/features/litter-journal/types";
import { loadWhelpingWorkspace } from "@/features/whelping/whelping-workspace";
import { createClient } from "@/lib/supabase/server";
import { listLitterWeightAdjustmentHistory, listLitterWeightHistory } from "@/features/litter-weights/litter-weights";
import { cancelLitterRoutineWeightAction, cancelLitterWeighingSessionAction, correctLitterRoutineWeightAction, recordLitterRoutineWeightsAction } from "@/features/litter-weights/litter-weights-actions";
import { getRoutineWeightEligibility } from "@/features/litter-weights/routine-weight-eligibility";
import type {
  LitterCareTaskScheduleActionBinding,
  LitterCareTaskScheduleActionSet,
} from "@/features/litter-journal/litter-care-task-schedule-dialog";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";
import { toLitterCareTaskScheduleView } from "@/features/litter-journal/litter-care-task-schedule-view";

export const dynamic = "force-dynamic";

function bindLitterCareTaskScheduleActionSet(
  task: LitterCareTaskSummary,
): LitterCareTaskScheduleActionSet {
  const base = { taskId: task.id, expectedRevisionNo: task.revisionNo };
  const isWindow = task.itemKind === "window";
  const hasSuggestion = isWindow
    ? Boolean(task.suggestedStartsOn && task.suggestedEndsOn)
    : Boolean(task.suggestedFor);

  return {
    rescheduleAction: (isWindow
      ? rescheduleLitterCareTaskWindowAction
      : rescheduleLitterCareTaskPointAction
    ).bind(null, { ...base, clientCommandId: crypto.randomUUID() }),
    replaceLockedAction: (isWindow
      ? replaceLockedLitterCareTaskWindowScheduleAction
      : replaceLockedLitterCareTaskPointScheduleAction
    ).bind(null, { ...base, clientCommandId: crypto.randomUUID() }),
    lockAction: setLitterCareTaskScheduleLockAction.bind(null, {
      ...base, isLocked: true, clientCommandId: crypto.randomUUID(),
    }),
    unlockAction: setLitterCareTaskScheduleLockAction.bind(null, {
      ...base, isLocked: false, clientCommandId: crypto.randomUUID(),
    }),
    reapplySuggestionAction: hasSuggestion
      ? reapplyLitterCareTaskScheduleSuggestionAction.bind(null, {
          ...base, clientCommandId: crypto.randomUUID(),
        })
      : null,
  };
}

function bindLitterCareTaskScheduleBinding(
  task: LitterCareTaskSummary,
): LitterCareTaskScheduleActionBinding | null {
  const view = toLitterCareTaskScheduleView(task);
  if (!view) return null;
  return {
    taskId: task.id,
    domIdPrefix: `care-schedule-${crypto.randomUUID()}`,
    view,
    actions: bindLitterCareTaskScheduleActionSet(task),
  };
}

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
  let litterPlanningModelApplication: Awaited<
    ReturnType<typeof loadLitterPlanningModelApplicationPanel>
  > | null = null;
  let litterPlanSeries: Awaited<
    ReturnType<typeof listLitterPlanSeriesSummariesForLitter>
  > | null = null;
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
    const [maternalResult, tasksResult, generationPlanResult, activePlanResult, planningModelApplicationResult, seriesResult, whelpingResult, weightsResult, adjustmentHistoryResult] =
      await Promise.allSettled([
        listMaternalObservationsForLitter({ litterId }),
        listLitterCareTasksForLitter({ litterId }),
        planLitterCareTaskGeneration({ litterId }),
        getActiveLitterPlanForLitter(litterId, supabase),
        loadLitterPlanningModelApplicationPanel(litterId, supabase),
        listLitterPlanSeriesSummariesForLitter(litterId, supabase),
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
    litterPlanningModelApplication =
      planningModelApplicationResult.status === "fulfilled"
        ? planningModelApplicationResult.value
        : null;
    litterPlanSeries =
      seriesResult.status === "fulfilled" ? seriesResult.value : null;
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
  const timelineInstanceKey = crypto.randomUUID();
  const interactiveLitterPlanBuild =
    !litterPlanLoadError &&
    activeLitterPlan &&
    !("outcome" in activeLitterPlan) &&
    litterCareTasksLoaded
      ? buildInteractiveLitterPlanTimeline({
          plan: activeLitterPlan,
          tasks: litterCareTasksLoaded.tasks,
          role: litterCareTasksLoaded.role,
          instanceKey: timelineInstanceKey,
        })
      : null;
  const interactiveLitterPlanTimeline = interactiveLitterPlanBuild
    ? {
        title: interactiveLitterPlanBuild.title,
        items: interactiveLitterPlanBuild.items,
        pendingAnchorItems: interactiveLitterPlanBuild.pendingAnchorItems,
      }
    : null;
  const litterPlanTimelineMovePointActions = Object.fromEntries(
    (interactiveLitterPlanBuild?.bindings ?? [])
      .filter((binding) => binding.canMoveGraphically && binding.kind !== "window")
      .map((binding) => [
        binding.publicKey,
        moveTimelinePointAction.bind(null, {
          taskId: binding.task.id,
          expectedRevisionNo: binding.task.revisionNo,
          clientCommandId: crypto.randomUUID(),
          scheduledLocalTime: binding.task.scheduledLocalTime,
          timezoneName: binding.task.scheduleTimezoneName,
        }),
      ]),
  );
  const litterPlanTimelineMoveWindowActions = Object.fromEntries(
    (interactiveLitterPlanBuild?.bindings ?? [])
      .filter((binding) => binding.canMoveGraphically && binding.kind === "window")
      .map((binding) => [
        binding.publicKey,
        moveOrResizeTimelineWindowAction.bind(null, {
          taskId: binding.task.id,
          expectedRevisionNo: binding.task.revisionNo,
          clientCommandId: crypto.randomUUID(),
          retainedStartsLocalTime: binding.task.retainedStartsLocalTime,
          retainedEndsLocalTime: binding.task.retainedEndsLocalTime,
          timezoneName: binding.task.scheduleTimezoneName,
        }),
      ]),
  );
  const litterPlanTimelineScheduleTargets: Record<
    string,
    LitterPlanTimelineScheduleTarget
  > = Object.fromEntries(
    (interactiveLitterPlanBuild?.bindings ?? [])
      .filter((binding) => binding.canOpenPrecisePanel)
      .flatMap((binding) => {
        const view = toLitterCareTaskScheduleView(binding.task);
        if (!view) return [];
        return [
          [
            binding.publicKey,
            {
              view,
              actions: bindLitterCareTaskScheduleActionSet(binding.task),
            },
          ],
        ];
      }),
  );
  const litterPlanTimelineMetadataTargets: Record<string, LitterPlanTimelineMetadataTarget> = Object.fromEntries(
    (interactiveLitterPlanBuild?.bindings ?? []).flatMap((binding) => {
      const litterId = journal?.selectedLitter?.id;
      const item = activePlanDetail?.items.find((entry) => entry.id === binding.task.litterPlanItemId);
      if (!litterId || !item || !activePlanDetail || binding.task.status !== "planned" || item.origin_kind !== "ad_hoc" || item.item_kind === "recurring_task" || !["milestone", "task", "window"].includes(item.item_kind) || item.materialization_state !== "materialized" || item.source_planning_model_id !== null || item.organization_template_id !== null || binding.task.source !== "manual" || binding.task.litterPlanSeriesId !== null) return [];
      return [[binding.publicKey, { view: { title: item.title, description: item.description, category: item.category, targetScope: item.target_scope, priority: item.priority, kind: item.item_kind as "milestone" | "task" | "window" }, action: updateLitterPlanAdHocItemMetadataAction.bind(null, { litterId, litterPlanItemId: item.id, clientCommandId: crypto.randomUUID(), expectedPlanRevision: activePlanDetail.header.revision, expectedItemRevision: item.revision_no, expectedTaskRevision: binding.task.revisionNo }) }]];
    }),
  );
  const litterPlanningModelApplicationLoaded =
    litterPlanningModelApplication?.outcome === "success"
      ? litterPlanningModelApplication
      : null;
  const litterPlanningModelApplyActions = Object.fromEntries(
    (litterPlanningModelApplicationLoaded?.bindings ?? []).map((binding) => [
      binding.publicKey,
      applyLitterPlanningModelAction.bind(null, binding.intention),
    ]),
  );
  const litterPlanSeriesLoaded =
    litterPlanSeries?.outcome === "success" ? litterPlanSeries : null;
  const litterPlanSeriesCanWrite =
    litterPlanSeriesLoaded?.role === "owner" ||
    litterPlanSeriesLoaded?.role === "admin" ||
    litterPlanSeriesLoaded?.role === "member";
  const litterPlanSeriesActions: LitterPlanSeriesPanelActions[] =
    litterPlanSeriesCanWrite
      ? (litterPlanSeriesLoaded?.series ?? []).map((series) => {
          const base = {
            seriesId: series.id,
            expectedRevisionNo: series.revisionNo,
          };
          return {
            seriesId: series.id,
            suspendAction: setLitterPlanSeriesStateAction.bind(null, {
              ...base,
              clientCommandId: crypto.randomUUID(),
              newState: "suspended",
            }),
            resumeAction: setLitterPlanSeriesStateAction.bind(null, {
              ...base,
              clientCommandId: crypto.randomUUID(),
              newState: "active",
            }),
            materializeAction: materializeLitterPlanSeriesAction.bind(null, {
              ...base,
              clientCommandId: crypto.randomUUID(),
            }),
            completeAction: setLitterPlanSeriesStateAction.bind(null, {
              ...base,
              clientCommandId: crypto.randomUUID(),
              newState: "completed",
            }),
            cancelAction: setLitterPlanSeriesStateAction.bind(null, {
              ...base,
              clientCommandId: crypto.randomUUID(),
              newState: "cancelled",
            }),
            notApplicableAction: setLitterPlanSeriesStateAction.bind(null, {
              ...base,
              clientCommandId: crypto.randomUUID(),
              newState: "not_applicable",
            }),
          };
        })
      : [];
  const litterCareTaskGenerationPlanLoaded =
    litterCareTaskGenerationPlan?.outcome === "success"
      ? litterCareTaskGenerationPlan
      : null;
  const litterCareTaskCanWrite =
    litterCareTasksLoaded?.role === "owner" ||
    litterCareTasksLoaded?.role === "admin" ||
    litterCareTasksLoaded?.role === "member";
  const programmerInstanceKey = crypto.randomUUID();
  const activePlanDetail =
    activeLitterPlan && !("outcome" in activeLitterPlan)
      ? activeLitterPlan
      : null;
  const activePlanMissing =
    activeLitterPlan !== null &&
    "outcome" in activeLitterPlan &&
    activeLitterPlan.error.code === "not_found";
  const programmerCanShow = canShowLitterPlanAdHocProgrammer({
    role: litterCareTasksLoaded?.role ?? null,
    planUnavailable: litterPlanLoadError,
  });
  const programmerAction =
    journal?.selectedLitter?.id &&
    programmerCanShow &&
    (activePlanDetail || activePlanMissing)
      ? createLitterPlanAdHocItemAction.bind(null, {
          litterId: journal.selectedLitter.id,
          expectedPlanRevision: activePlanDetail
            ? activePlanDetail.header.revision
            : null,
          timezoneName: activePlanDetail
            ? activePlanDetail.header.timezone_name
            : LITTER_JOURNAL_TIME_ZONE,
          clientCommandId: crypto.randomUUID(),
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
  const todayQuickActions = litterCareTaskCanWrite
    ? (litterCareTasksLoaded?.tasks ?? [])
        .filter((task) => task.status === "planned")
        .map((task) => ({
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
  const scheduleActions = litterCareTaskCanWrite
    ? (litterCareTasksLoaded?.tasks ?? [])
        .filter((task) => task.status === "planned")
        .map(bindLitterCareTaskScheduleBinding)
        .filter((binding): binding is LitterCareTaskScheduleActionBinding => binding !== null)
    : [];
  const todayScheduleActions = litterCareTaskCanWrite
    ? (litterCareTasksLoaded?.tasks ?? [])
        .filter((task) => task.status === "planned")
        .map(bindLitterCareTaskScheduleBinding)
        .filter((binding): binding is LitterCareTaskScheduleActionBinding => binding !== null)
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
            litterCareTaskResolutionActions={resolutionActions}
            litterCareTodayQuickActions={todayQuickActions}
            litterCareTodayScheduleActions={todayScheduleActions}
            litterCareTaskScheduleActions={scheduleActions}
            litterCareTasksLoadError={litterCareTasksLoaded === null}
            litterCareTodayDate={litterJournalTodayDate}
            litterCareTodayLocalTime={litterJournalTodayLocalTime}
            litterPlanningModelApplicationPanel={
              litterPlanningModelApplicationLoaded?.panel ?? null
            }
            litterPlanningModelApplyActions={litterPlanningModelApplyActions}
            litterPlanningModelApplicationLoadError={
              litterPlanningModelApplicationLoaded === null
            }
            litterPlanTimeline={interactiveLitterPlanTimeline}
            litterPlanTimelineMovePointActions={litterPlanTimelineMovePointActions}
            litterPlanTimelineMoveWindowActions={litterPlanTimelineMoveWindowActions}
            litterPlanTimelineScheduleTargets={litterPlanTimelineScheduleTargets}
            litterPlanTimelineMetadataTargets={litterPlanTimelineMetadataTargets}
            litterPlanAdHocProgrammerAction={programmerAction}
            litterPlanAdHocProgrammerInstanceKey={programmerInstanceKey}
            litterPlanAdHocProgrammerBusinessDate={litterJournalTodayDate}
            litterPlanLoadError={litterPlanLoadError}
            litterPlanSeries={litterPlanSeriesLoaded?.series ?? []}
            litterPlanSeriesRole={litterPlanSeriesLoaded?.role ?? null}
            litterPlanSeriesActions={litterPlanSeriesActions}
            litterPlanSeriesLoadError={litterPlanSeriesLoaded === null}
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
