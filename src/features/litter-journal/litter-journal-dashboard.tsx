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
import type {
  GenerateLitterCareTasksActionState,
  LitterCareTaskActionState,
} from "./litter-care-tasks-actions";
import type { LitterCareTaskSummary } from "./litter-care-tasks";
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
import type { LitterRoutineWeightsActionState } from "@/features/litter-weights/litter-weights-actions-core";
import {
  WhelpingPanel,
  type WhelpingBirthAdjustmentAction,
  type WhelpingBirthWeightAction,
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
  litterCareTasks,
  litterCareTaskRole,
  litterCareTaskGenerationEntries,
  litterCareTaskGenerationRole,
  litterCareTaskGenerationAction,
  litterCareTaskGenerationLoadError,
  createLitterCareTaskAction,
  createLitterCareTaskClientCommandId,
  litterCareTaskResolutionActions,
  litterCareTasksLoadError,
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
  litterWeightRole,
  litterWeightAction,
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
  litterCareTasks: LitterCareTaskSummary[];
  litterCareTaskRole: "owner" | "admin" | "member" | "viewer" | null;
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
  createLitterCareTaskAction: ((
    previousState: LitterCareTaskActionState,
    formData: FormData,
  ) => Promise<LitterCareTaskActionState>) | null;
  createLitterCareTaskClientCommandId: string;
  litterCareTaskResolutionActions: LitterCareTaskResolutionAction[];
  litterCareTasksLoadError: boolean;
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
  litterWeightRole: LitterWeightOrganizationRole | null;
  litterWeightAction: ((
    previousState: LitterRoutineWeightsActionState,
    formData: FormData,
  ) => Promise<LitterRoutineWeightsActionState>) | null;
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
              <Link
                href={`/whelping?litter=${publicMobileLitterIndex}`}
                className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline"
              >
                Ouvrir le mode mobile de mise-bas
              </Link>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <ContextCard litter={litter} details={details} />
        <SummaryCard litter={litter} />
      </div>
      <WhelpingPanel
        session={whelpingSession}
        events={whelpingEvents}
        births={whelpingBirths}
        role={whelpingRole}
        loadError={whelpingLoadError}
        openAction={openWhelpingAction}
        eventAction={recordWhelpingEventAction}
        birthAction={recordWhelpingBirthAction}
        birthWeightActions={recordWhelpingBirthWeightActions}
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
      />
      <LitterCareTaskGenerationPanel
        entries={litterCareTaskGenerationEntries}
        role={litterCareTaskGenerationRole}
        action={litterCareTaskGenerationAction}
        loadError={litterCareTaskGenerationLoadError}
      />
      <LitterCareTasksPanel
        tasks={litterCareTasks}
        role={litterCareTaskRole}
        createAction={createLitterCareTaskAction}
        createClientCommandId={createLitterCareTaskClientCommandId}
        resolutionActions={litterCareTaskResolutionActions}
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
