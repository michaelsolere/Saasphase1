import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelWhelpingBirthAction,
  closeWhelpingSessionAction,
  correctWhelpingBirthAction,
  openWhelpingSessionAction,
  recordWhelpingBirthAction,
  recordWhelpingBirthWeightAction,
  recordWhelpingEventAction,
  reopenWhelpingSessionAction,
} from "@/features/whelping/whelping-actions";
import type {
  WhelpingActionState,
  WhelpingBirthActionState,
} from "@/features/whelping/whelping-actions-core";
import type {
  WhelpingBirthAdjustmentAction,
  WhelpingBirthWeightAction,
} from "@/features/whelping/whelping-panel";
import {
  listWhelpingBirthAdjustmentHistory,
  listWhelpingBirthsForSession,
  listWhelpingEventsForSession,
  listWhelpingSessionsForLitter,
  type WhelpingBirthAdjustmentHistoryEntry,
  type WhelpingBirthSummary,
  type WhelpingEventSummary,
  type WhelpingSessionSummary,
} from "@/features/whelping/whelping";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type WhelpingClient = SupabaseClient<Database>;
type WhelpingRole = "owner" | "admin" | "member" | "viewer" | null;
type SimpleAction = (
  previousState: WhelpingActionState,
  formData: FormData,
) => Promise<WhelpingActionState>;
type BirthAction = (
  previousState: WhelpingBirthActionState,
  formData: FormData,
) => Promise<WhelpingBirthActionState>;
type SuccessfulBirthList = Extract<
  Awaited<ReturnType<typeof listWhelpingBirthsForSession>>,
  { outcome: "success" }
>;

export type WhelpingWorkspace = {
  session: WhelpingSessionSummary | null;
  events: WhelpingEventSummary[];
  births: WhelpingBirthSummary[];
  role: WhelpingRole;
  loadError: boolean;
  openAction: SimpleAction | null;
  eventAction: SimpleAction | null;
  birthAction: BirthAction | null;
  birthWeightActions: WhelpingBirthWeightAction[];
  birthAdjustmentActions: WhelpingBirthAdjustmentAction[];
  adjustmentHistory: WhelpingBirthAdjustmentHistoryEntry[];
  adjustmentHistoryLoadError: boolean;
  closeAction: SimpleAction | null;
  reopenAction: SimpleAction | null;
};

export async function loadWhelpingWorkspace(
  litterId: string,
  suppliedClient?: WhelpingClient,
): Promise<WhelpingWorkspace> {
  const supabase = suppliedClient ?? (await createClient());
  const [sessionsResult, adjustmentHistoryResult] = await Promise.allSettled([
    listWhelpingSessionsForLitter({ litterId }, supabase),
    listWhelpingBirthAdjustmentHistory({ litterId, limit: 100 }, supabase),
  ]);
  const sessions =
    sessionsResult.status === "fulfilled" &&
    sessionsResult.value.outcome === "success"
      ? sessionsResult.value
      : null;
  const adjustmentHistory =
    adjustmentHistoryResult.status === "fulfilled" &&
    adjustmentHistoryResult.value.outcome === "success"
      ? adjustmentHistoryResult.value
      : null;
  const selectedSession =
    sessions?.sessions.find((session) => session.status === "open") ??
    sessions?.sessions[0] ??
    null;

  let eventsResult: Awaited<ReturnType<typeof listWhelpingEventsForSession>> | null = null;
  let selectedBirthsResult: SuccessfulBirthList | null = null;
  let allBirths: WhelpingBirthSummary[] = [];
  let allBirthsReliable = selectedSession === null && sessions !== null;

  if (selectedSession && sessions) {
    const [loadedEvents, loadedBirths] = await Promise.all([
      Promise.resolve(
        listWhelpingEventsForSession({ sessionId: selectedSession.id }, supabase),
      ).then(
        (value) => ({ status: "fulfilled" as const, value }),
        () => ({ status: "rejected" as const }),
      ),
      Promise.allSettled(
        sessions.sessions.map(async (session) => ({
          sessionId: session.id,
          result: await listWhelpingBirthsForSession(
            { sessionId: session.id },
            supabase,
          ),
        })),
      ),
    ]);

    eventsResult =
      loadedEvents.status === "fulfilled" &&
      loadedEvents.value.outcome === "success"
        ? loadedEvents.value
        : null;
    const successfulBirths: Array<{
      sessionId: string;
      result: SuccessfulBirthList;
    }> = [];
    for (const loadedBirth of loadedBirths) {
      if (
        loadedBirth.status === "fulfilled" &&
        loadedBirth.value.result.outcome === "success"
      ) {
        successfulBirths.push({
          sessionId: loadedBirth.value.sessionId,
          result: loadedBirth.value.result,
        });
      }
    }
    allBirthsReliable = successfulBirths.length === sessions.sessions.length;
    allBirths = successfulBirths.flatMap(({ result }) => result.births);
    selectedBirthsResult =
      successfulBirths.find(({ sessionId }) => sessionId === selectedSession.id)
        ?.result ?? null;
  }

  const loadError =
    sessions === null ||
    (selectedSession !== null &&
      (eventsResult === null ||
        selectedBirthsResult === null ||
        !allBirthsReliable));
  const serviceRoles = [
    sessions?.role,
    selectedSession ? eventsResult?.role : undefined,
    selectedSession ? selectedBirthsResult?.role : undefined,
  ].filter((role): role is Exclude<WhelpingRole, null> => role !== undefined);
  const role: WhelpingRole = serviceRoles.includes("viewer")
    ? "viewer"
    : (sessions?.role ?? null);
  const canWrite =
    serviceRoles.length > 0 &&
    serviceRoles.every(
      (serviceRole) =>
        serviceRole === "owner" ||
        serviceRole === "admin" ||
        serviceRole === "member",
    );
  const dataReliable = !loadError;
  const selectedSessionId = selectedSession?.id ?? null;
  const sessionWriteEnabled =
    selectedSessionId !== null &&
    selectedSession?.status === "open" &&
    dataReliable &&
    canWrite;

  const openAction =
    dataReliable && canWrite && selectedSession === null
      ? openWhelpingSessionAction.bind(null, {
          litterId,
          clientCommandId: crypto.randomUUID(),
        })
      : null;
  const eventAction = sessionWriteEnabled
    ? recordWhelpingEventAction.bind(null, {
        litterId,
        sessionId: selectedSessionId,
        clientCommandId: crypto.randomUUID(),
      })
    : null;
  const birthAction = sessionWriteEnabled
    ? recordWhelpingBirthAction.bind(null, {
        litterId,
        sessionId: selectedSessionId,
        clientCommandId: crypto.randomUUID(),
      })
    : null;
  const closeAction = sessionWriteEnabled
    ? closeWhelpingSessionAction.bind(null, {
        litterId,
        sessionId: selectedSessionId,
        clientCommandId: crypto.randomUUID(),
      })
    : null;
  const reopenAction =
    selectedSessionId !== null &&
    selectedSession?.status === "closed" &&
    dataReliable &&
    canWrite
      ? reopenWhelpingSessionAction.bind(null, {
          litterId,
          sessionId: selectedSessionId,
          clientCommandId: crypto.randomUUID(),
        })
      : null;
  const birthWeightActions: WhelpingBirthWeightAction[] =
    selectedSessionId !== null && dataReliable && canWrite
      ? (selectedBirthsResult?.births ?? [])
          .filter(
            (birth) =>
              birth.cancelledAt === null &&
              birth.birthWeightMeasurement === null,
          )
          .map((birth) => ({
            birthId: birth.id,
            action: recordWhelpingBirthWeightAction.bind(null, {
              litterId,
              sessionId: selectedSessionId,
              birthId: birth.id,
              clientCommandId: crypto.randomUUID(),
            }),
          }))
      : [];
  const lastActiveBirth =
    allBirths
      .filter((birth) => birth.cancelledAt === null)
      .sort(
        (left, right) =>
          right.birthOrder - left.birthOrder ||
          right.occurredAt.localeCompare(left.occurredAt),
      )[0] ?? null;
  const birthAdjustmentActions: WhelpingBirthAdjustmentAction[] =
    selectedSessionId !== null && dataReliable && canWrite
      ? (selectedBirthsResult?.births ?? [])
          .filter((birth) => birth.cancelledAt === null)
          .map((birth) => {
            const intention = {
              litterId,
              sessionId: selectedSessionId,
              birthId: birth.id,
              animalId: birth.animal.id,
              expectedRevisionNo: birth.revisionNo,
            };
            return {
              birthId: birth.id,
              correctAction: correctWhelpingBirthAction.bind(null, {
                ...intention,
                clientCommandId: crypto.randomUUID(),
              }),
              cancelAction:
                lastActiveBirth?.id === birth.id
                  ? cancelWhelpingBirthAction.bind(null, {
                      ...intention,
                      clientCommandId: crypto.randomUUID(),
                    })
                  : null,
            };
          })
      : [];

  return {
    session: selectedSession,
    events: eventsResult?.events ?? [],
    births: selectedBirthsResult?.births ?? [],
    role,
    loadError,
    openAction,
    eventAction,
    birthAction,
    birthWeightActions,
    birthAdjustmentActions,
    adjustmentHistory: adjustmentHistory?.entries ?? [],
    adjustmentHistoryLoadError: adjustmentHistory === null,
    closeAction,
    reopenAction,
  };
}
