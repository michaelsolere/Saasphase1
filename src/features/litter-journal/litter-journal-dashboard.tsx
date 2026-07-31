import Link from "next/link";

import {
  formatLitterCount,
  formatLitterDate,
  getLitterDisplayName,
  getSpeciesLabel,
} from "@/features/litters/formatters";

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
import type { LitterCareTodayQuickActions } from "./litter-care-today-quick-actions";
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
  litterWeightTodayProjections,
  litterWeightRole,
  litterWeightAction,
  initialWeightEntryOpen,
  litterWeightMeasurementAdjustmentActions,
  litterWeightSessionCancellationActions,
  litterWeightAdjustmentHistory,
  litterWeightAdjustmentHistoryLoadError,
  litterWeightsLoadError,
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
      </section>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <ContextCard litter={litter} details={details} />
        <SummaryCard litter={litter} />
      </div>
      <LitterPlanningModelApplyPanel
        panel={litterPlanningModelApplicationPanel}
        actionsByPublicKey={litterPlanningModelApplyActions}
        loadError={litterPlanningModelApplicationLoadError}
      />
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
      <LitterWeightPanel
        animals={litterWeightAnimals}
        sessions={litterWeightSessions}
        measurements={litterWeightMeasurements}
        latestSessionComparison={litterWeightLatestSessionComparison}
        weighingSchedule={litterWeightSchedule}
        weighingSchedulePolicy={litterWeightSchedulePolicy}
        role={litterWeightRole}
        action={litterWeightAction}
        initialWeightEntryOpen={initialWeightEntryOpen}
        measurementAdjustmentActions={litterWeightMeasurementAdjustmentActions}
        sessionCancellationActions={litterWeightSessionCancellationActions}
        adjustmentHistory={litterWeightAdjustmentHistory}
        adjustmentHistoryLoadError={litterWeightAdjustmentHistoryLoadError}
        loadError={litterWeightsLoadError}
      />
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
      <LitterCareTasksPanel
        tasks={litterCareTasks}
        resolutionActions={litterCareTaskResolutionActions}
        scheduleActions={litterCareTaskScheduleActions}
        loadError={litterCareTasksLoadError}
      />
      <QuickLinks litter={litter} />
    </div>
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
