import Link from "next/link";

import {
  formatLitterCount,
  formatLitterDate,
  getLitterDisplayName,
  getSpeciesLabel,
} from "@/features/litters/formatters";

import type { LitterJournalTab } from "./journal-tabs-model";
import { LITTER_JOURNAL_TABS, LITTER_JOURNAL_TAB_LABELS } from "./journal-tabs-model";
import { buildTodayActionQueue, type TodayQueueTaskInput } from "./today-action-queue-model";
import { buildUnifiedHistory, type UnifiedHistoryEntry } from "./unified-history-model";
import { buildLitterUnifiedHistoryInput } from "./litter-unified-history-projection";

import { LitterJournalSelector } from "./litter-journal-selector";
import {
  LitterCareTaskGenerationPanel,
  type LitterCareTaskGenerationPanelEntry,
} from "./litter-care-task-generation-panel";
import {
  LitterCareTasksPanel,
  type LitterCareTaskResolutionAction,
} from "./litter-care-tasks-panel";
import type { LitterCareTaskScheduleActionBinding } from "./litter-care-task-schedule-dialog";
import type {
  GenerateLitterCareTasksActionState,
  LitterCareTaskActionState,
} from "./litter-care-tasks-actions";
import type { LitterCareTaskSummary } from "./litter-care-tasks";
import { LitterCareTodayPanel } from "./litter-care-today-panel";
import {
  LitterCareTodayQuickActions,
  type LitterCareTodayQuickActions as LitterCareTodayQuickActionsType,
} from "./litter-care-today-quick-actions";
import { LitterPlanTimelinePanel } from "./litter-plan-timeline-panel";
import type {
  LitterPlanTimelineMetadataTarget,
  LitterPlanTimelineResolutionTarget,
  LitterPlanTimelineScheduleTarget,
} from "./litter-plan-timeline-panel";
import type { InteractiveLitterPlanTimeline } from "./litter-plan-timeline-interaction";
import type { LitterPlanAdHocProgrammerActionState } from "./litter-plan-ad-hoc-programmer-actions";
import { LitterPlanningModelApplyPanel } from "./litter-planning-model-apply-panel";
import type { ApplyLitterPlanningModelActionState } from "./litter-planning-model-apply-actions";
import type { LitterPlanningModelApplicationPanelDto } from "./litter-planning-model-apply";
import {
  LitterPlanSeriesPanel,
  type LitterPlanSeriesPanelActions,
} from "./litter-plan-series-panel";
import type { LitterPlanSeriesSummary } from "./litter-plan-series-summary";
import { MaternalObservationsPanel } from "./maternal-observations-panel";
import type { MaternalObservationPanelItem } from "./maternal-temperature-chart-model";
import type { MaternalObservationActionState } from "./maternal-observations-actions";
import type { MaternalObservationSummary } from "./maternal-observations";
import type { MaternalTemperatureDropPolicyV1 } from "./maternal-temperature-drop-policy";
import type {
  WhelpingActionState,
  WhelpingBirthActionState,
} from "@/features/whelping/whelping-actions-core";
import type {
  WhelpingBirthSummary,
  WhelpingBirthAdjustmentHistoryEntry,
  WhelpingEventSummary,
  WhelpingSessionSummary,
} from "@/features/whelping/whelping-core";
import { LitterWeightPanel } from "@/features/litter-weights/litter-weight-panel";
import type { LitterWeightMeasurementAdjustmentAction, LitterWeightSessionCancellationAction } from "@/features/litter-weights/litter-weight-panel";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
  LitterWeightAdjustmentHistoryEntry,
  LitterWeightOrganizationRole,
  LitterWeighingSchedulePolicyMetadata,
  LitterGainAlertPolicyV1,
} from "@/features/litter-weights/litter-weights-core";
import type { LitterWeightLatestSessionComparison } from "@/features/litter-weights/litter-weighing-session-comparison";
import type { LitterWeighingScheduleResult } from "@/features/litter-weights/litter-weighing-schedule-model";
import type { LitterWeighingTodayProjection } from "@/features/litter-weights/litter-weighing-today";
import type { LitterRoutineWeightsActionState } from "@/features/litter-weights/litter-weights-actions-core";
import {
  WhelpingPanel,
  type WhelpingBirthAdjustmentAction,
  type WhelpingBirthWeightAction,
  type WhelpingQuickCompletionAction,
} from "@/features/whelping/whelping-panel";
import {
  getLitterJournalContextualAge,
  getLitterJournalStatusLabel,
} from "./stage";
import type { LitterJournalDetails, LitterJournalListItem } from "./types";

function DefinitionList({
  children,
}: {
  children: React.ReactNode;
}) {
  return <dl className="divide-y divide-border text-sm">{children}</dl>;
}

function Definition({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(11rem,0.8fr)_minmax(0,1.2fr)] sm:gap-4">
      <dt className="font-medium text-muted">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

function ValueOrMissing({ value }: { value: string | null | undefined }) {
  return value ? value : <span className="text-muted">Non renseigné</span>;
}

function ContextCard({
  litter,
  details,
}: {
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
}) {
  const context = [
    ["Première saillie", details?.mating_date],
    ["Deuxième saillie", details?.mating_date_2],
    ["Ovulation estimée", details?.estimated_ovulation_date],
    ["Confirmation de gestation", details?.pregnancy_confirmed_at],
    ["Méthode de confirmation", details?.pregnancy_confirmation_method],
    ["Mise-bas estimée", litter.expected_birth_date],
    ["Naissance réelle", litter.actual_birth_date],
  ] as const;

  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Contexte reproductif</h2>
      <DefinitionList>
        {context.map(([label, value]) => (
          <Definition key={label} label={label}>
            {label.endsWith("saillie") || label === "Ovulation estimée" || label === "Confirmation de gestation" || label === "Mise-bas estimée" || label === "Naissance réelle"
              ? value
                ? formatLitterDate(value)
                : <span className="text-muted">Non renseigné</span>
              : <ValueOrMissing value={value} />}
          </Definition>
        ))}
      </DefinitionList>
    </section>
  );
}

function SummaryCard({ litter }: { litter: LitterJournalListItem }) {
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Synthèse de la portée</h2>
      <DefinitionList>
        <Definition label="Nombre attendu">
          {formatLitterCount(litter.expected_puppy_count)}
        </Definition>
        <Definition label="Nombre né">
          {formatLitterCount(litter.born_total_count)}
        </Definition>
        <Definition label="Nombre vivant">
          {formatLitterCount(litter.alive_count)}
        </Definition>
        <Definition label="Animaux liés">
          {formatLitterCount(litter.animal_count)}
        </Definition>
        <Definition label="Réservations">
          {formatLitterCount(litter.reservation_count)}
        </Definition>
      </DefinitionList>
    </section>
  );
}

function QuickLinks({ litter }: { litter: LitterJournalListItem }) {
  const links = [
    litter.id
      ? { href: `/litters/${litter.id}`, label: "Ouvrir la fiche de la portée" }
      : null,
    litter.mother_id
      ? { href: `/animals/${litter.mother_id}/reproduction`, label: "Reproduction de la mère" }
      : null,
    litter.mother_id
      ? { href: `/animals/${litter.mother_id}`, label: "Fiche de la mère" }
      : null,
    litter.father_id
      ? { href: `/animals/${litter.father_id}`, label: "Fiche du père" }
      : null,
  ].filter((link): link is { href: string; label: string } => link !== null);

  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Accès rapides</h2>
      <div className="mt-4 flex flex-col items-start gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-semibold text-accent hover:underline"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function LitterJournalDashboard({
  litters,
  litter,
  details,
  maternalObservations,
  maternalObservationRole,
  maternalObservationAction,
  maternalObservationsLoadError,
  maternalTemperatureDropPolicy,
  maternalTemperatureDropPolicyUnavailable,
  maternalObservationTaskLinksUnavailable,
  litterCareTasks,
  litterCareTaskGenerationEntries,
  litterCareTaskGenerationRole,
  litterCareTaskGenerationAction,
  litterCareTaskGenerationLoadError,
  litterCareTaskResolutionActions,
  litterCareTodayQuickActions,
  litterCareTodayScheduleActions,
  litterCareTaskScheduleActions,
  litterCareTasksLoadError,
  litterCareTodayDate,
  litterCareTodayLocalTime,
  litterPlanningModelApplicationPanel,
  litterPlanningModelApplyActions,
  litterPlanningModelApplicationLoadError,
  litterPlanTimeline,
  litterPlanTimelineMovePointActions,
  litterPlanTimelineMoveWindowActions,
  litterPlanTimelineScheduleTargets,
  litterPlanTimelineResolutionTargets,
  litterPlanTimelineMetadataTargets,
  litterPlanAdHocProgrammerAction,
  litterPlanAdHocProgrammerInstanceKey,
  litterPlanAdHocProgrammerBusinessDate,
  litterPlanLoadError,
  litterPlanSeries,
  litterPlanSeriesRole,
  litterPlanSeriesActions,
  litterPlanSeriesLoadError,
  whelpingSession,
  whelpingEvents,
  whelpingBirths,
  whelpingRole,
  whelpingLoadError,
  openWhelpingAction,
  recordWhelpingEventAction,
  recordWhelpingBirthAction,
  recordWhelpingBirthWeightActions,
  whelpingBirthAdjustmentActions,
  whelpingQuickCompletionActions,
  whelpingBirthAdjustmentHistory,
  whelpingBirthAdjustmentHistoryLoadError,
  closeWhelpingSessionAction,
  reopenWhelpingSessionAction,
  litterWeightAnimals,
  litterWeightSessions,
  litterWeightMeasurements,
  litterWeightLatestSessionComparison,
  litterWeightSchedule,
  litterWeightSchedulePolicy,
  litterWeightGainAlertPolicy,
  litterWeightGainAlertPolicyUnavailable,
  litterWeightTodayProjections,
  litterWeightRole,
  litterWeightAction,
  initialWeightEntryOpen,
  litterWeightMeasurementAdjustmentActions,
  litterWeightSessionCancellationActions,
  litterWeightAdjustmentHistory,
  litterWeightAdjustmentHistoryLoadError,
  litterWeightsLoadError,
  activeTab,
  tabPath,
}: {
  litters: LitterJournalListItem[];
  litter: LitterJournalListItem;
  details: LitterJournalDetails | null;
  maternalObservations: MaternalObservationSummary[];
  maternalObservationRole: "owner" | "admin" | "member" | "viewer" | null;
  maternalObservationAction: ((
    previousState: MaternalObservationActionState,
    formData: FormData,
  ) => Promise<MaternalObservationActionState>) | null;
  maternalObservationsLoadError: boolean;
  maternalTemperatureDropPolicy: MaternalTemperatureDropPolicyV1 | null;
  maternalTemperatureDropPolicyUnavailable: boolean;
  maternalObservationTaskLinksUnavailable: boolean;
  litterCareTasks: LitterCareTaskSummary[];
  litterCareTaskGenerationEntries: LitterCareTaskGenerationPanelEntry[];
  litterCareTaskGenerationRole:
    | "owner"
    | "admin"
    | "member"
    | "viewer"
    | null;
  litterCareTaskGenerationAction: ((
    previousState: GenerateLitterCareTasksActionState,
    formData: FormData,
  ) => Promise<GenerateLitterCareTasksActionState>) | null;
  litterCareTaskGenerationLoadError: boolean;
  litterCareTaskResolutionActions: LitterCareTaskResolutionAction[];
  litterCareTodayQuickActions: LitterCareTodayQuickActions[];
  litterCareTodayScheduleActions: LitterCareTaskScheduleActionBinding[];
  litterCareTaskScheduleActions: LitterCareTaskScheduleActionBinding[];
  litterCareTasksLoadError: boolean;
  litterCareTodayDate: string;
  litterCareTodayLocalTime: string;
  litterPlanningModelApplicationPanel: LitterPlanningModelApplicationPanelDto | null;
  litterPlanningModelApplyActions: Record<
    string,
    (
      previousState: ApplyLitterPlanningModelActionState,
      formData: FormData,
    ) => Promise<ApplyLitterPlanningModelActionState>
  >;
  litterPlanningModelApplicationLoadError: boolean;
  litterPlanTimeline: InteractiveLitterPlanTimeline | null;
  litterPlanTimelineMovePointActions: Record<
    string,
    (
      previousState: LitterCareTaskActionState,
      formData: FormData,
    ) => Promise<LitterCareTaskActionState>
  >;
  litterPlanTimelineMoveWindowActions: Record<
    string,
    (
      previousState: LitterCareTaskActionState,
      formData: FormData,
    ) => Promise<LitterCareTaskActionState>
  >;
  litterPlanTimelineScheduleTargets: Record<string, LitterPlanTimelineScheduleTarget>;
  litterPlanTimelineResolutionTargets: Record<string, LitterPlanTimelineResolutionTarget>;
  litterPlanTimelineMetadataTargets: Record<string, LitterPlanTimelineMetadataTarget>;
  litterPlanAdHocProgrammerAction: ((
    previousState: LitterPlanAdHocProgrammerActionState,
    formData: FormData,
  ) => Promise<LitterPlanAdHocProgrammerActionState>) | null;
  litterPlanAdHocProgrammerInstanceKey: string;
  litterPlanAdHocProgrammerBusinessDate: string;
  litterPlanLoadError: boolean;
  litterPlanSeries: LitterPlanSeriesSummary[];
  litterPlanSeriesRole: "owner" | "admin" | "member" | "viewer" | null;
  litterPlanSeriesActions: LitterPlanSeriesPanelActions[];
  litterPlanSeriesLoadError: boolean;
  whelpingSession: WhelpingSessionSummary | null;
  whelpingEvents: WhelpingEventSummary[];
  whelpingBirths: WhelpingBirthSummary[];
  whelpingRole: "owner" | "admin" | "member" | "viewer" | null;
  whelpingLoadError: boolean;
  openWhelpingAction: ((
    previousState: WhelpingActionState,
    formData: FormData,
  ) => Promise<WhelpingActionState>) | null;
  recordWhelpingEventAction: ((
    previousState: WhelpingActionState,
    formData: FormData,
  ) => Promise<WhelpingActionState>) | null;
  recordWhelpingBirthAction: ((
    previousState: WhelpingBirthActionState,
    formData: FormData,
  ) => Promise<WhelpingBirthActionState>) | null;
  recordWhelpingBirthWeightActions: WhelpingBirthWeightAction[];
  whelpingBirthAdjustmentActions: WhelpingBirthAdjustmentAction[];
  whelpingQuickCompletionActions: WhelpingQuickCompletionAction[];
  whelpingBirthAdjustmentHistory: WhelpingBirthAdjustmentHistoryEntry[];
  whelpingBirthAdjustmentHistoryLoadError: boolean;
  closeWhelpingSessionAction: ((
    previousState: WhelpingActionState,
    formData: FormData,
  ) => Promise<WhelpingActionState>) | null;
  reopenWhelpingSessionAction: ((
    previousState: WhelpingActionState,
    formData: FormData,
  ) => Promise<WhelpingActionState>) | null;
  litterWeightAnimals: LitterWeightHistoryAnimal[];
  litterWeightSessions: LitterWeightHistorySession[];
  litterWeightMeasurements: LitterWeightHistoryMeasurement[];
  litterWeightLatestSessionComparison: LitterWeightLatestSessionComparison;
  litterWeightSchedule: LitterWeighingScheduleResult | null;
  litterWeightSchedulePolicy: LitterWeighingSchedulePolicyMetadata | null;
  litterWeightGainAlertPolicy: LitterGainAlertPolicyV1;
  litterWeightGainAlertPolicyUnavailable: boolean;
  litterWeightTodayProjections: readonly LitterWeighingTodayProjection[];
  litterWeightRole: LitterWeightOrganizationRole | null;
  litterWeightAction: ((
    previousState: LitterRoutineWeightsActionState,
    formData: FormData,
  ) => Promise<LitterRoutineWeightsActionState>) | null;
  initialWeightEntryOpen: boolean;
  litterWeightMeasurementAdjustmentActions: LitterWeightMeasurementAdjustmentAction[];
  litterWeightSessionCancellationActions: LitterWeightSessionCancellationAction[];
  litterWeightAdjustmentHistory: LitterWeightAdjustmentHistoryEntry[];
  litterWeightAdjustmentHistoryLoadError: boolean;
  litterWeightsLoadError: boolean;
  activeTab: LitterJournalTab;
  tabPath: (nextTab: LitterJournalTab) => string;
}) {
  const contextualAge = getLitterJournalContextualAge(litter, details);
  const birthDate = litter.actual_birth_date ?? litter.expected_birth_date;
  const publicMobileLitterIndex = litters.findIndex(
    (item) => item.id === litter.id,
  );
  const publicMaternalObservations: MaternalObservationPanelItem[] =
    maternalObservations.map((observation, index) => ({
      publicSourceIndex: index + 1,
      observationType: observation.observationType,
      observedAt: observation.observedAt,
      timezoneName: observation.timezoneName,
      numericValue: observation.numericValue,
      unit: observation.unit,
      severity: observation.severity,
      note: observation.note,
      satisfiedTask: observation.satisfiedTask,
    }));
  const maternalObservationFormInstanceKey =
    `${publicMobileLitterIndex}:${publicMaternalObservations.length}`;

  const todayQueue = buildTodayActionQueue(
    litterCareTasks.map((task): TodayQueueTaskInput => ({
      id: task.id,
      title: task.title,
      detail: task.description ?? null,
      itemKind: task.itemKind === "recurring_task" ? "task" : task.itemKind,
      status: task.status === "done" ? "resolved" : task.status,
      scheduledFor: task.plannedFor ?? task.suggestedFor ?? task.retainedStartsOn ?? null,
      scheduledEndsOn: task.suggestedEndsOn ?? task.retainedEndsOn ?? null,
      suggestedFor: task.suggestedFor ?? null,
    })),
    litterCareTodayDate,
  );
  const litterCareTaskById = new Map(litterCareTasks.map((task) => [task.id, task]));
  const resolutionActionByTaskId = new Map(
    litterCareTodayQuickActions.map((action) => [action.taskId, action]),
  );
  const resolutionScheduleActionsByTaskId = new Map(
    litterCareTodayScheduleActions.map((binding) => [binding.taskId, binding]),
  );

  const tabAnchors: Record<LitterJournalTab, string> = {
    today: "litter-care-today",
    planning: "litter-planning",
    birth: "whelping",
    weights: "litter-weights",
    mother: "maternal-observations",
    history: "litter-journal-history",
  };

  function renderTabPanel() {
    switch (activeTab) {
      case "today":
        return (
          <>
            <TodayActionQueueCard
              queue={todayQueue}
              litterCareTaskById={litterCareTaskById}
              resolutionActionByTaskId={resolutionActionByTaskId}
              resolutionScheduleActionsByTaskId={resolutionScheduleActionsByTaskId}
              tabPath={tabPath}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <SummaryCard litter={litter} />
              <QuickLinks litter={litter} />
            </div>
            <LitterCareTodayPanel
              tasks={litterCareTasks}
              quickActions={litterCareTodayQuickActions}
              scheduleActions={litterCareTodayScheduleActions}
              todayDate={litterCareTodayDate}
              todayLocalTime={litterCareTodayLocalTime}
              weighingProjections={litterWeightTodayProjections}
              canWriteWeighings={litterWeightAction !== null}
              weighingUnavailable={litterWeightsLoadError}
              unavailable={litterCareTasksLoadError}
            />
          </>
        );
      case "planning":
        return (
          <>
            <LitterPlanTimelinePanel
              timeline={litterPlanTimeline}
              unavailable={litterPlanLoadError}
              movePointActions={litterPlanTimelineMovePointActions}
              moveWindowActions={litterPlanTimelineMoveWindowActions}
              scheduleTargets={litterPlanTimelineScheduleTargets}
              resolutionTargets={litterPlanTimelineResolutionTargets}
              metadataTargets={litterPlanTimelineMetadataTargets}
              programmerAction={litterPlanAdHocProgrammerAction}
              programmerInstanceKey={litterPlanAdHocProgrammerInstanceKey}
              programmerBusinessDate={litterPlanAdHocProgrammerBusinessDate}
            />
            <LitterCareTasksPanel
              tasks={litterCareTasks}
              resolutionActions={litterCareTaskResolutionActions}
              scheduleActions={litterCareTaskScheduleActions}
              loadError={litterCareTasksLoadError}
            />
            <LitterPlanningModelApplyPanel
              panel={litterPlanningModelApplicationPanel}
              actionsByPublicKey={litterPlanningModelApplyActions}
              loadError={litterPlanningModelApplicationLoadError}
            />
            <LitterCareTaskGenerationPanel
              entries={litterCareTaskGenerationEntries}
              role={litterCareTaskGenerationRole}
              action={litterCareTaskGenerationAction}
              loadError={litterCareTaskGenerationLoadError}
            />
            <LitterPlanSeriesPanel
              series={litterPlanSeries}
              role={litterPlanSeriesRole}
              actions={litterPlanSeriesActions}
              loadError={litterPlanSeriesLoadError}
            />
          </>
        );
      case "birth":
        return (
          <WhelpingPanel
            displayMode="journal"
            session={whelpingSession}
            events={whelpingEvents}
            births={whelpingBirths}
            role={whelpingRole}
            loadError={whelpingLoadError}
            openAction={openWhelpingAction}
            eventAction={recordWhelpingEventAction}
            expressMaleBirthAction={null}
            expressFemaleBirthAction={null}
            birthAction={recordWhelpingBirthAction}
            birthWeightActions={recordWhelpingBirthWeightActions}
            quickCompletionActions={whelpingQuickCompletionActions}
            birthAdjustmentActions={whelpingBirthAdjustmentActions}
            adjustmentHistory={whelpingBirthAdjustmentHistory}
            adjustmentHistoryLoadError={whelpingBirthAdjustmentHistoryLoadError}
            closeAction={closeWhelpingSessionAction}
            reopenAction={reopenWhelpingSessionAction}
          />
        );
      case "weights":
        return (
          <LitterWeightPanel
            litterId={litter.id}
            animals={litterWeightAnimals}
            sessions={litterWeightSessions}
            measurements={litterWeightMeasurements}
            latestSessionComparison={litterWeightLatestSessionComparison}
            weighingSchedule={litterWeightSchedule}
            weighingSchedulePolicy={litterWeightSchedulePolicy}
            gainAlertPolicy={litterWeightGainAlertPolicy}
            gainAlertPolicyUnavailable={litterWeightGainAlertPolicyUnavailable}
            role={litterWeightRole}
            action={litterWeightAction}
            initialWeightEntryOpen={initialWeightEntryOpen}
            measurementAdjustmentActions={litterWeightMeasurementAdjustmentActions}
            sessionCancellationActions={litterWeightSessionCancellationActions}
            adjustmentHistory={litterWeightAdjustmentHistory}
            adjustmentHistoryLoadError={litterWeightAdjustmentHistoryLoadError}
            loadError={litterWeightsLoadError}
          />
        );
      case "mother":
        return (
          <>
            <MaternalObservationsPanel
              observations={publicMaternalObservations}
              role={maternalObservationRole}
              action={maternalObservationAction}
              formInstanceKey={maternalObservationFormInstanceKey}
              loadError={maternalObservationsLoadError}
              temperatureDropPolicy={maternalTemperatureDropPolicy}
              temperatureDropPolicyUnavailable={maternalTemperatureDropPolicyUnavailable}
              taskLinksUnavailable={maternalObservationTaskLinksUnavailable}
            />
            <ContextCard litter={litter} details={details} />
          </>
        );
      case "history": {
        const unifiedHistory = buildUnifiedHistory(
          buildLitterUnifiedHistoryInput({
            weightSessions: litterWeightSessions,
            maternalObservations: maternalObservations,
            careTasks: litterCareTasks,
            whelpingEvents: whelpingEvents,
            whelpingBirths: whelpingBirths,
          }),
        );
        return (
          <UnifiedHistoryCard
            entries={unifiedHistory}
            loadError={litterWeightsLoadError && litterCareTasksLoadError}
          />
        );
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-surface p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Portée sélectionnée
            </p>
            <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {getLitterDisplayName(litter.name, litter.id)}
            </h2>
            {publicMobileLitterIndex >= 0 ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                <Link
                  href={`/whelping/selection?litter=${publicMobileLitterIndex}`}
                  className="inline-flex text-sm font-semibold text-accent hover:underline"
                >
                  Ouvrir le mode mobile de mise-bas
                </Link>
                {litter.id ? (
                  <Link
                    href={`/litters/journal/calendar?litter=${encodeURIComponent(litter.id)}`}
                    className="inline-flex text-sm font-semibold text-accent hover:underline"
                  >
                    Ouvrir le calendrier
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          {litter.id ? (
            <LitterJournalSelector litters={litters} selectedLitterId={litter.id} />
          ) : null}
        </div>

        <dl className="mt-6 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-medium text-muted">Mère</dt>
            <dd className="mt-1"><ValueOrMissing value={litter.mother_display_name} /></dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Père</dt>
            <dd className="mt-1"><ValueOrMissing value={litter.father_display_name} /></dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Espèce et race</dt>
            <dd className="mt-1">{getSpeciesLabel(litter.species)} · <ValueOrMissing value={litter.breed} /></dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Statut</dt>
            <dd className="mt-1">{getLitterJournalStatusLabel(litter.status)}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Naissance</dt>
            <dd className="mt-1">
              {birthDate ? `${litter.actual_birth_date ? "Réelle" : "Estimée"} · ${formatLitterDate(birthDate)}` : <span className="text-muted">Non renseignée</span>}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Repère chronologique</dt>
            <dd className="mt-1">
              {contextualAge ?? <span className="text-muted">Non renseigné</span>}
              {contextualAge ? <span className="block text-xs text-muted">Repère indicatif, non diagnostique.</span> : null}
            </dd>
          </div>
        </dl>

        <nav
          aria-label="Sections du journal"
          className="-mx-5 mt-5 flex gap-1 overflow-x-auto border-b px-5 sm:-mx-6 sm:px-6"
        >
          {LITTER_JOURNAL_TABS.map((tab) => {
            const selected = activeTab === tab;
            return (
              <Link
                key={tab}
                href={tabPath(tab)}
                aria-current={selected ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
                  selected
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {LITTER_JOURNAL_TAB_LABELS[tab]}
              </Link>
            );
          })}
        </nav>
      </section>

      <div aria-label={`Contenu de l’onglet ${LITTER_JOURNAL_TAB_LABELS[activeTab]}`}>
        {renderTabPanel()}
      </div>
      <span hidden aria-hidden="true" data-tab-anchor={tabAnchors[activeTab]} />
    </div>
  );
}

function TodayActionQueueCard({
  queue,
  litterCareTaskById,
  resolutionActionByTaskId,
  resolutionScheduleActionsByTaskId,
  tabPath,
}: {
  queue: ReturnType<typeof buildTodayActionQueue>;
  litterCareTaskById: Map<string, LitterCareTaskSummary>;
  resolutionActionByTaskId: Map<string, LitterCareTodayQuickActionsType>;
  resolutionScheduleActionsByTaskId: Map<string, LitterCareTaskScheduleActionBinding>;
  tabPath: (nextTab: LitterJournalTab) => string;
}) {
  if (queue.length === 0) {
    return (
      <section className="rounded-2xl border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">File d’actions du jour</h2>
        <p className="mt-2 text-sm text-muted">
          Aucune tâche ouverte pour cette portée. Les jalons planifiés apparaîtront ici.
        </p>
      </section>
    );
  }
  const urgencyStyles: Record<string, string> = {
    overdue: "bg-amber-500",
    today: "bg-accent",
    upcoming: "bg-border",
  };
  const urgencyLabels: Record<string, string> = {
    overdue: "En retard",
    today: "Aujourd’hui",
    upcoming: "Planifié",
  };
  return (
    <section id="litter-care-today" className="rounded-2xl border bg-surface p-5 sm:p-6" data-testid="litter-journal-today-queue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">File d’actions du jour</h2>
        <Link href={tabPath("planning")} className="text-sm font-semibold text-accent hover:underline">
          Voir le planning →
        </Link>
      </div>
      <ul className="mt-4 divide-y">
        {queue.map(({ task, urgency, dueLabel }) => {
          const action = resolutionActionByTaskId.get(task.id);
          const scheduleAction = resolutionScheduleActionsByTaskId.get(task.id) ?? null;
          return (
            <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full ${urgencyStyles[urgency] ?? urgencyStyles.upcoming}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{task.title}</p>
                  <p className="truncate text-xs text-muted">
                    {[dueLabel ?? urgencyLabels[urgency], task.detail].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              {action ? (
                <div className="shrink-0">
                  <LitterCareTodayQuickActions
                    task={litterCareTaskById.get(task.id)!}
                    actions={action}
                    scheduleActions={scheduleAction}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function EmptyLitterJournal() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
      <h2 className="text-lg font-semibold">Aucune portée active</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Le journal affichera ici les portées dont le suivi est en cours.
      </p>
    </section>
  );
}

const UNIFIED_HISTORY_KIND_STYLES: Record<UnifiedHistoryEntry["kind"], string> = {
  weighing_session: "bg-accent",
  maternal_observation: "bg-sky-600",
  care_task: "bg-emerald-600",
  whelping_event: "bg-rose-500",
};

function formatHistoryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function UnifiedHistoryCard({
  entries,
  loadError,
}: {
  entries: UnifiedHistoryEntry[];
  loadError: boolean;
}) {
  if (loadError) {
    return (
      <section
        id="litter-journal-history"
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6"
      >
        <h2 className="text-lg font-semibold">Historique momentanément indisponible</h2>
        <p className="mt-2 text-sm">
          Certaines sources de l’historique n’ont pas pu être chargées. Aucune donnée n’a été modifiée.
        </p>
      </section>
    );
  }
  if (entries.length === 0) {
    return (
      <section id="litter-journal-history" className="rounded-2xl border border-dashed bg-surface p-8 text-center">
        <h2 className="text-lg font-semibold">Aucun événement enregistré</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Les pesées, observations, jalons réalisés et naissances apparaîtront ici dans un fil unique.
        </p>
      </section>
    );
  }
  return (
    <section id="litter-journal-history" className="rounded-2xl border bg-surface p-5 sm:p-6" data-testid="litter-unified-history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Historique de la portée</h2>
        <p className="text-xs text-muted">
          {entries.length} événement{entries.length > 1 ? "s" : ""} · du plus récent au plus ancien
        </p>
      </div>
      <ol className="mt-4 divide-y">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2 shrink-0 rounded-full ${UNIFIED_HISTORY_KIND_STYLES[entry.kind]}`}
              />
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{entry.label}</p>
                {entry.detail ? (
                  <p className="mt-0.5 break-words text-xs leading-5 text-muted">{entry.detail}</p>
                ) : null}
              </div>
            </div>
            <time dateTime={entry.occurredAt} className="shrink-0 text-xs text-muted">
              {formatHistoryTimestamp(entry.occurredAt)}
            </time>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Couleur des points : vert = pesée · bleu = observation de la mère · émeraude = jalon de soins · rose = mise-bas.
      </p>
    </section>
  );
}
