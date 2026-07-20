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
  resolveLitterCareTaskAction,
} from "@/features/litter-journal/litter-care-tasks-actions";
import {
  listLitterCareTasksForLitter,
  planLitterCareTaskGeneration,
} from "@/features/litter-journal/litter-care-tasks";
import { loadLitterJournal } from "@/features/litter-journal/loader";
import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import type { LitterJournalSelection } from "@/features/litter-journal/types";
import {
  closeWhelpingSessionAction,
  openWhelpingSessionAction,
  recordWhelpingBirthAction,
  recordWhelpingBirthWeightAction,
  recordWhelpingEventAction,
} from "@/features/whelping/whelping-actions";
import type { WhelpingBirthWeightAction } from "@/features/whelping/whelping-panel";
import {
  listWhelpingBirthsForSession,
  listWhelpingEventsForSession,
  listWhelpingSessionsForLitter,
  type WhelpingSessionSummary,
} from "@/features/whelping/whelping";
import { createClient } from "@/lib/supabase/server";
import { listLitterWeightHistory } from "@/features/litter-weights/litter-weights";
import { recordLitterRoutineWeightsAction } from "@/features/litter-weights/litter-weights-actions";

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

  const litterJournalTodayDate =
    formatLitterJournalBusinessDate(new Date());

  let journal: LitterJournalSelection | null = null;
  let hasLoadingError = false;
  let maternalObservations: Awaited<ReturnType<typeof listMaternalObservationsForLitter>> | null = null;
  let litterCareTasks: Awaited<
    ReturnType<typeof listLitterCareTasksForLitter>
  > | null = null;
  let litterCareTaskGenerationPlan: Awaited<
    ReturnType<typeof planLitterCareTaskGeneration>
  > | null = null;
  let whelpingSessions: Awaited<
    ReturnType<typeof listWhelpingSessionsForLitter>
  > | null = null;
  let selectedWhelpingSession: WhelpingSessionSummary | null = null;
  let whelpingEvents: Awaited<
    ReturnType<typeof listWhelpingEventsForSession>
  > | null = null;
  let whelpingBirths: Awaited<
    ReturnType<typeof listWhelpingBirthsForSession>
  > | null = null;
  let litterWeightHistory: Awaited<
    ReturnType<typeof listLitterWeightHistory>
  > | null = null;

  try {
    journal = await loadLitterJournal(supabase, requestedLitterId);
  } catch {
    hasLoadingError = true;
  }

  if (journal?.selectedLitter?.id) {
    const litterId = journal.selectedLitter.id;
    const [maternalResult, tasksResult, generationPlanResult, sessionsResult, weightsResult] =
      await Promise.allSettled([
        listMaternalObservationsForLitter({ litterId }),
        listLitterCareTasksForLitter({ litterId }),
        planLitterCareTaskGeneration({ litterId }),
        listWhelpingSessionsForLitter({ litterId }),
        listLitterWeightHistory({
          litterId,
          schedule: {
            todayDate: litterJournalTodayDate,
          },
        }),
      ]);

    maternalObservations =
      maternalResult.status === "fulfilled" ? maternalResult.value : null;
    litterCareTasks =
      tasksResult.status === "fulfilled" ? tasksResult.value : null;
    litterCareTaskGenerationPlan =
      generationPlanResult.status === "fulfilled"
        ? generationPlanResult.value
        : null;
    whelpingSessions =
      sessionsResult.status === "fulfilled" ? sessionsResult.value : null;
    litterWeightHistory =
      weightsResult.status === "fulfilled" ? weightsResult.value : null;

    if (whelpingSessions?.outcome === "success") {
      selectedWhelpingSession =
        whelpingSessions.sessions.find((session) => session.status === "open") ??
        whelpingSessions.sessions[0] ??
        null;

      if (selectedWhelpingSession) {
        const [eventsResult, birthsResult] = await Promise.allSettled([
          listWhelpingEventsForSession({
            sessionId: selectedWhelpingSession.id,
          }),
          listWhelpingBirthsForSession({
            sessionId: selectedWhelpingSession.id,
          }),
        ]);
        whelpingEvents =
          eventsResult.status === "fulfilled" ? eventsResult.value : null;
        whelpingBirths =
          birthsResult.status === "fulfilled" ? birthsResult.value : null;
      }
    }
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
  const whelpingSessionsLoaded =
    whelpingSessions?.outcome === "success" ? whelpingSessions : null;
  const whelpingEventsLoaded =
    whelpingEvents?.outcome === "success" ? whelpingEvents : null;
  const whelpingBirthsLoaded =
    whelpingBirths?.outcome === "success" ? whelpingBirths : null;
  const whelpingLoadError =
    whelpingSessionsLoaded === null ||
    (selectedWhelpingSession !== null &&
      (whelpingEventsLoaded === null || whelpingBirthsLoaded === null));
  const whelpingServiceRoles = [
    whelpingSessionsLoaded?.role,
    selectedWhelpingSession ? whelpingEventsLoaded?.role : undefined,
    selectedWhelpingSession ? whelpingBirthsLoaded?.role : undefined,
  ].filter((role): role is "owner" | "admin" | "member" | "viewer" =>
    role !== undefined,
  );
  const whelpingRole = whelpingServiceRoles.includes("viewer")
    ? "viewer"
    : (whelpingSessionsLoaded?.role ?? null);
  const whelpingCanWrite =
    whelpingServiceRoles.length > 0 &&
    whelpingServiceRoles.every(
      (role) => role === "owner" || role === "admin" || role === "member",
    );
  const whelpingDataReliable = !whelpingLoadError;
  const openWhelpingClientCommandId = crypto.randomUUID();
  const eventWhelpingClientCommandId = crypto.randomUUID();
  const birthWhelpingClientCommandId = crypto.randomUUID();
  const closeWhelpingClientCommandId = crypto.randomUUID();
  const selectedLitterId = journal?.selectedLitter?.id ?? null;
  const selectedSessionId = selectedWhelpingSession?.id ?? null;
  const openWhelpingAction =
    selectedLitterId &&
    whelpingDataReliable &&
    whelpingCanWrite &&
    selectedWhelpingSession === null
      ? openWhelpingSessionAction.bind(null, {
          litterId: selectedLitterId,
          clientCommandId: openWhelpingClientCommandId,
        })
      : null;
  const sessionWriteEnabled =
    selectedLitterId !== null &&
    selectedSessionId !== null &&
    selectedWhelpingSession?.status === "open" &&
    whelpingDataReliable &&
    whelpingCanWrite;
  const recordWhelpingEvent = sessionWriteEnabled
    ? recordWhelpingEventAction.bind(null, {
        litterId: selectedLitterId,
        sessionId: selectedSessionId,
        clientCommandId: eventWhelpingClientCommandId,
      })
    : null;
  const recordWhelpingBirth = sessionWriteEnabled
    ? recordWhelpingBirthAction.bind(null, {
        litterId: selectedLitterId,
        sessionId: selectedSessionId,
        clientCommandId: birthWhelpingClientCommandId,
      })
    : null;
  const closeWhelpingAction = sessionWriteEnabled
    ? closeWhelpingSessionAction.bind(null, {
        litterId: selectedLitterId,
        sessionId: selectedSessionId,
        clientCommandId: closeWhelpingClientCommandId,
      })
    : null;
  const recordWhelpingBirthWeightActions: WhelpingBirthWeightAction[] =
    selectedLitterId !== null &&
    selectedSessionId !== null &&
    whelpingDataReliable &&
    whelpingCanWrite
      ? (whelpingBirthsLoaded?.births ?? [])
          .filter((birth) => birth.birthWeightMeasurement === null)
          .map((birth) => {
            const birthWeightClientCommandId = crypto.randomUUID();
            return {
              birthId: birth.id,
              action: recordWhelpingBirthWeightAction.bind(null, {
                litterId: selectedLitterId,
                sessionId: selectedSessionId,
                birthId: birth.id,
                clientCommandId: birthWeightClientCommandId,
              }),
            };
          })
      : [];
  const litterWeightHistoryLoaded =
    litterWeightHistory?.outcome === "success" ? litterWeightHistory : null;
  const eligibleLitterWeightAnimals =
    litterWeightHistoryLoaded?.animals.filter(
      (animal) =>
        animal.ownershipStatus === "produced" &&
        animal.birthDate !== null &&
        animal.status !== "stillborn",
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
            maternalObservationClientCommandId={clientCommandId}
            maternalObservationsLoadError={maternalObservationsLoaded === null}
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
            litterCareTasksLoadError={litterCareTasksLoaded === null}
            whelpingSession={selectedWhelpingSession}
            whelpingEvents={whelpingEventsLoaded?.events ?? []}
            whelpingBirths={whelpingBirthsLoaded?.births ?? []}
            whelpingRole={whelpingRole}
            whelpingLoadError={whelpingLoadError}
            openWhelpingAction={openWhelpingAction}
            recordWhelpingEventAction={recordWhelpingEvent}
            recordWhelpingBirthAction={recordWhelpingBirth}
            recordWhelpingBirthWeightActions={recordWhelpingBirthWeightActions}
            closeWhelpingSessionAction={closeWhelpingAction}
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
            litterWeightsLoadError={litterWeightHistoryLoaded === null}
          />
        ) : (
          <EmptyLitterJournal />
        )}
      </section>
    </main>
  );
}
