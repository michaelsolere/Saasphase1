/** @jsxImportSource react */

import type {
  LitterWeighingScheduleItem,
  LitterWeighingScheduleResult,
  LitterWeighingScheduleStatus,
} from "./litter-weighing-schedule-model";

type Props = {
  schedule: LitterWeighingScheduleResult | null;
};

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const civilDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatCivilDate(value: string) {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(0, month - 1, 1));
  date.setUTCFullYear(year);
  date.setUTCDate(day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return civilDateFormatter.format(date);
}

function formatScheduleItem(item: LitterWeighingScheduleItem | undefined) {
  if (!item) return "Aucune";
  const formattedDate = formatCivilDate(item.scheduledOn);
  return formattedDate ? `J${item.ageDay} · ${formattedDate}` : `J${item.ageDay}`;
}

function findFirstByStatus(
  items: readonly LitterWeighingScheduleItem[],
  status: LitterWeighingScheduleStatus,
) {
  return items.find((item) => item.status === status);
}

function findLastCompleted(items: readonly LitterWeighingScheduleItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.status === "completed") return items[index];
  }
  return undefined;
}

function UnavailableSchedule({ message }: { message: string }) {
  return (
    <section
      data-testid="litter-weighing-schedule-summary"
      className="mt-4 rounded-xl border bg-secondary/50 p-4"
    >
      <h3 className="font-semibold">Planning des pesées</h3>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </section>
  );
}

export function LitterWeighingScheduleSummary({ schedule }: Props) {
  if (schedule === null || schedule.status === "invalid_input") {
    return (
      <UnavailableSchedule message="Le planning des pesées ne peut pas être affiché pour le moment." />
    );
  }

  if (schedule.status === "missing_actual_birth_date") {
    return (
      <UnavailableSchedule message="Renseignez la date réelle de naissance de la portée pour calculer le planning des pesées." />
    );
  }

  const indicators = [
    {
      label: "Réalisées",
      count: schedule.summary.completedCount,
      description: "Dernière réalisée",
      item: findLastCompleted(schedule.schedule),
    },
    {
      label: "À faire aujourd’hui",
      count: schedule.summary.dueTodayCount,
      description: "Échéance du jour",
      item: findFirstByStatus(schedule.schedule, "due_today"),
    },
    {
      label: "En retard",
      count: schedule.summary.overdueCount,
      description: "Première à rattraper",
      item: findFirstByStatus(schedule.schedule, "overdue"),
    },
    {
      label: "À venir",
      count: schedule.summary.upcomingCount,
      description: "Prochaine échéance",
      item: findFirstByStatus(schedule.schedule, "upcoming"),
    },
  ] as const;

  return (
    <section
      data-testid="litter-weighing-schedule-summary"
      className="mt-4 min-w-0 rounded-xl border bg-secondary/50 p-4"
    >
      <h3 className="font-semibold">Planning des pesées</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        Rythme recommandé actuellement appliqué : chaque jour de J0 à J30, puis
        tous les 3 jours de J31 à J60.
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Planning descriptif, sans création automatique ni interprétation médicale.
      </p>
      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
        {indicators.map((indicator) => (
          <div
            key={indicator.label}
            className="min-w-0 rounded-xl border bg-surface px-3 py-3"
          >
            <dt className="text-sm font-medium text-muted">{indicator.label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{indicator.count}</dd>
            <dd className="mt-2 text-xs leading-5 text-muted">
              <span className="block font-medium text-foreground">
                {indicator.description}
              </span>
              {formatScheduleItem(indicator.item)}
            </dd>
          </div>
        ))}
      </dl>
      {schedule.summary.extraObservationCount > 0 ? (
        <p className="mt-4 rounded-lg border bg-surface px-3 py-2 text-sm text-muted">
          {schedule.summary.extraObservationCount} observation(s) de pesée
          enregistrée(s) hors échéances planifiées.
        </p>
      ) : null}
    </section>
  );
}
