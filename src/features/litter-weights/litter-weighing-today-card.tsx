import Link from "next/link";

import { buildLitterWeightEntryHref } from "./litter-routine-weight-entry";
import type { LitterWeighingTodayProjection } from "./litter-weighing-today";

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function title(projection: LitterWeighingTodayProjection) {
  if (projection.state === "due_today") {
    return `Pesée J${projection.ageDay} à faire aujourd’hui`;
  }
  if (projection.state === "overdue") {
    return `${projection.overdueCount} pesée${projection.overdueCount > 1 ? "s" : ""} en retard`;
  }
  return projection.scheduledOn
    ? "Pesée réalisée aujourd’hui"
    : "Pesée supplémentaire réalisée aujourd’hui";
}

function detail(projection: LitterWeighingTodayProjection) {
  if (
    projection.state === "overdue" &&
    projection.ageDay !== null &&
    projection.scheduledOn
  ) {
    return `Première échéance : J${projection.ageDay} · ${formatCivilDate(projection.scheduledOn)}`;
  }
  if (projection.state === "handled_today") {
    return `${projection.sessionCount} séance${projection.sessionCount > 1 ? "s" : ""} · ${projection.measurementCount} poids enregistré${projection.measurementCount > 1 ? "s" : ""}`;
  }
  return null;
}

export function LitterWeighingTodayCard({
  projection,
  context,
  canWrite,
}: {
  projection: LitterWeighingTodayProjection;
  context: "journal" | "organization";
  canWrite: boolean;
}) {
  const canOpenEntry =
    canWrite &&
    (projection.state === "due_today" || projection.state === "overdue");
  const href = canOpenEntry
    ? buildLitterWeightEntryHref(projection.litterId)
    : context === "journal"
      ? "#litter-weights"
      : `/litters/journal?litter=${encodeURIComponent(projection.litterId)}#litter-weights`;
  const description = detail(projection);

  return (
    <li
      className="min-w-0 rounded-xl border bg-background px-4 py-3"
      data-testid="litter-weighing-today-card"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {context === "journal" ? "Pesée de la portée" : "Pesées · Portée"}
          </p>
          <h4 className="mt-1 break-words font-semibold">{title(projection)}</h4>
          {context === "organization" ? (
            <p className="mt-1 break-words text-sm font-medium text-foreground">
              Portée {projection.litterLabel}
            </p>
          ) : null}
          {description ? (
            <p className="mt-2 break-words text-sm text-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto">
          <Link
            href={href}
            className="text-sm font-semibold text-accent hover:underline"
          >
            {canOpenEntry ? "Saisir la pesée" : "Ouvrir les pesées"}
          </Link>
        </div>
      </div>
    </li>
  );
}
