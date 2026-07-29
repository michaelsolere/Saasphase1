import Link from "next/link";

import {
  formatMaternalFactDateTime,
  formatMaternalTemperature,
  formatPlannedTaskDateTime,
  type LitterCareTaskCompletionOrigin,
  type MaternalObservationSatisfiedTask,
  type MaternalTemperatureObservationTaskFact,
} from "./maternal-observation-task-links-core";

const severityLabels = {
  routine: "Routine",
  watch: "À surveiller",
  concern: "Préoccupation",
  urgent: "Urgent",
} as const;

export function TaskCompletionOriginBadge({
  origin,
}: {
  origin: LitterCareTaskCompletionOrigin | null;
}) {
  if (!origin) return null;

  const label =
    origin === "maternal_temperature_observation"
      ? "Réalisée depuis le Journal"
      : origin === "manual"
        ? "Traitement manuel"
        : "Origine du traitement momentanément indisponible";

  return (
    <span className="inline-flex w-fit max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold">
      {label}
    </span>
  );
}

export function MaternalTemperatureTaskFactSummary({
  fact,
  compact = false,
  showNote = false,
  href,
  linkLabel = "Voir le suivi de la mère",
}: {
  fact: MaternalTemperatureObservationTaskFact;
  compact?: boolean;
  showNote?: boolean;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div
      className={
        compact
          ? "min-w-0 text-sm text-muted"
          : "min-w-0 rounded-xl border bg-background p-3 text-sm"
      }
    >
      {!compact ? (
        <p className="font-medium text-foreground">
          Température maternelle enregistrée
        </p>
      ) : null}
      <p className={compact ? "font-medium text-foreground" : "mt-1 font-semibold"}>
        {formatMaternalTemperature(fact)}
      </p>
      <p className={compact ? "mt-0.5" : "mt-1 text-muted"}>
        {formatMaternalFactDateTime(fact.observedAt, fact.timezoneName)}
      </p>
      {!compact ? (
        <p className="mt-1 text-muted">
          Appréciation saisie : {severityLabels[fact.severity]}
        </p>
      ) : null}
      {showNote && fact.note ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-muted">
          <span className="font-medium text-foreground">
            Note de l’observation :
          </span>{" "}
          {fact.note}
        </p>
      ) : null}
      {href ? (
        <Link
          href={href}
          className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function MaternalObservationSatisfiedTaskSummary({
  task,
}: {
  task: MaternalObservationSatisfiedTask;
}) {
  return (
    <div className="mt-3 min-w-0 rounded-xl border bg-background p-3 text-sm">
      <p className="font-semibold">Action planifiée réalisée</p>
      <p className="mt-1 break-words font-medium">{task.taskTitle}</p>
      {task.occurrenceNo !== null ? (
        <p className="mt-1 text-muted">Occurrence {task.occurrenceNo}</p>
      ) : null}
      <p className="mt-1 text-muted">
        Prévue le{" "}
        {formatPlannedTaskDateTime(
          task.plannedFor,
          task.scheduledLocalTime,
        )}
        {task.scheduleTimezoneName ? ` · ${task.scheduleTimezoneName}` : ""}
      </p>
    </div>
  );
}
