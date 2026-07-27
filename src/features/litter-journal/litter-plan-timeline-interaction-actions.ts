"use server";

import {
  rescheduleLitterCareTaskPoint,
  rescheduleLitterCareTaskWindow,
} from "./litter-care-tasks";
import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";
import { revalidateLitterCareTaskSchedulePaths } from "./litter-care-task-schedule-revalidate";
import type {
  MoveTimelinePointIntention,
  MoveTimelineWindowIntention,
} from "./litter-plan-timeline-interaction";

const GRAPHIC_REASON = "Ajustement graphique depuis la frise";

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function isCivilDate(input: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function timelineScheduleErrorMessage(code: string) {
  switch (code) {
    case "stale_revision":
      return "Cette programmation a été modifiée ailleurs. Rechargez le Journal avant de recommencer.";
    case "not_planned":
      return "Cet élément a déjà été traité.";
    case "conflict":
      return "Cette modification est incompatible avec le verrou actuel.";
    case "forbidden":
    case "unauthenticated":
      return "Vous n’avez pas les droits suffisants pour modifier cette programmation.";
    case "not_found":
      return "Cet élément est introuvable ou inaccessible.";
    default:
      return "La programmation ne peut pas être modifiée pour le moment.";
  }
}

async function runTimelineScheduleCommand(
  command: Promise<Awaited<ReturnType<typeof rescheduleLitterCareTaskPoint>>>,
): Promise<LitterCareTaskActionState> {
  const result = await command;
  if (result.outcome === "error") {
    return {
      status: "error",
      message: timelineScheduleErrorMessage(result.error.code),
      code: result.error.code,
      requiresRefresh: true,
    };
  }
  revalidateLitterCareTaskSchedulePaths(result.litterId);
  return {
    status: "success",
    message: "Programmation modifiée",
    requiresRefresh: true,
  };
}

export async function moveTimelinePointAction(
  intention: MoveTimelinePointIntention,
  _previousState: LitterCareTaskActionState,
  formData: FormData,
): Promise<LitterCareTaskActionState> {
  const proposedDate = value(formData, "proposed_date").trim();
  if (!isCivilDate(proposedDate)) {
    return {
      status: "error",
      message: "La date proposée est invalide.",
      requiresRefresh: false,
    };
  }
  return runTimelineScheduleCommand(
    rescheduleLitterCareTaskPoint({
      taskId: intention.taskId,
      expectedRevisionNo: intention.expectedRevisionNo,
      clientCommandId: intention.clientCommandId,
      plannedFor: proposedDate,
      scheduledLocalTime: intention.scheduledLocalTime,
      timezoneName: intention.timezoneName,
      reason: GRAPHIC_REASON,
    }),
  );
}

export async function moveOrResizeTimelineWindowAction(
  intention: MoveTimelineWindowIntention,
  _previousState: LitterCareTaskActionState,
  formData: FormData,
): Promise<LitterCareTaskActionState> {
  const proposedStartDate = value(formData, "proposed_start_date").trim();
  const proposedEndDate = value(formData, "proposed_end_date").trim();
  if (!isCivilDate(proposedStartDate) || !isCivilDate(proposedEndDate)) {
    return {
      status: "error",
      message: "Les dates proposées sont invalides.",
      requiresRefresh: false,
    };
  }
  if (proposedStartDate > proposedEndDate) {
    return {
      status: "error",
      message: "La date de début doit précéder ou égaler la date de fin.",
      requiresRefresh: false,
    };
  }
  return runTimelineScheduleCommand(
    rescheduleLitterCareTaskWindow({
      taskId: intention.taskId,
      expectedRevisionNo: intention.expectedRevisionNo,
      clientCommandId: intention.clientCommandId,
      retainedStartsOn: proposedStartDate,
      retainedStartsLocalTime: intention.retainedStartsLocalTime,
      retainedEndsOn: proposedEndDate,
      retainedEndsLocalTime: intention.retainedEndsLocalTime,
      timezoneName: intention.timezoneName,
      reason: GRAPHIC_REASON,
    }),
  );
}
