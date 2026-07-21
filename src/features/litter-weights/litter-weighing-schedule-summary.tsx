/** @jsxImportSource react */

import type {
  LitterWeighingSchedulePolicy,
  LitterWeighingScheduleItem,
  LitterWeighingScheduleResult,
  LitterWeighingScheduleStatus,
} from "./litter-weighing-schedule-model";
import type { LitterWeighingSchedulePolicyMetadata } from "./litter-weights-core";

type Props = {
  schedule: LitterWeighingScheduleResult | null;
  policy: LitterWeighingSchedulePolicyMetadata | null;
};

const POLICY_SOURCE_LABELS: Record<
  LitterWeighingSchedulePolicyMetadata["source"],
  string
> = {
  litter_snapshot: "Cadence figée pour cette portée",
  organization: "Cadence personnalisée de l’organisation",
  recommended: "Cadence recommandée du logiciel",
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

export function formatLitterWeighingSchedulePhaseFr(
  phase: LitterWeighingSchedulePolicy["phases"][number],
) {
  if (phase.startAgeDay === phase.endAgeDay) {
    return `J${phase.startAgeDay} uniquement`;
  }

  const ageRange = `J${phase.startAgeDay} à J${phase.endAgeDay}`;
  const interval =
    phase.intervalDays === 1
      ? "tous les jours"
      : `tous les ${phase.intervalDays} jours`;
  return `${ageRange} : ${interval}`;
}

function PolicyDescription({
  policy,
}: {
  policy: LitterWeighingSchedulePolicyMetadata;
}) {
  return (
    <div className="mt-3 text-sm leading-6 text-muted">
      <p className="font-medium text-foreground">
        {POLICY_SOURCE_LABELS[policy.source]}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {policy.phases.map((phase, index) => (
          <li key={`${phase.startAgeDay}-${phase.endAgeDay}-${index}`}>
            {formatLitterWeighingSchedulePhaseFr(phase)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnavailableSchedule({
  message,
  policy,
}: {
  message: string;
  policy: LitterWeighingSchedulePolicyMetadata | null;
}) {
  return (
    <section
      data-testid="litter-weighing-schedule-summary"
      className="mt-4 rounded-xl border p-4"
    >
      <h3 className="font-semibold">Planning des pesées</h3>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {policy ? (
        <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Politique et cadence
          </summary>
          <PolicyDescription policy={policy} />
        </details>
      ) : null}
    </section>
  );
}

export function LitterWeighingScheduleSummary({ schedule, policy }: Props) {
  if (schedule === null || schedule.status === "invalid_input") {
    return (
      <UnavailableSchedule
        message="Le planning des pesées ne peut pas être affiché pour le moment."
        policy={policy}
      />
    );
  }

  if (schedule.status === "missing_actual_birth_date") {
    return (
      <UnavailableSchedule
        message="Renseignez la date réelle de naissance de la portée pour calculer le planning des pesées."
        policy={policy}
      />
    );
  }

  const next = findFirstByStatus(schedule.schedule, "upcoming");

  return (
    <section
      data-testid="litter-weighing-schedule-summary"
      className="mt-4 min-w-0 rounded-xl border p-4"
    >
      <h3 className="font-semibold">Planning des pesées</h3>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex gap-1"><dt className="font-medium">Aujourd’hui :</dt><dd>{schedule.summary.dueTodayCount}</dd></div>
        <div className="flex gap-1"><dt className="font-medium">En retard :</dt><dd>{schedule.summary.overdueCount}</dd></div>
        <div className="flex gap-1"><dt className="font-medium">Prochaine :</dt><dd>{formatScheduleItem(next)}</dd></div>
        <div className="flex gap-1"><dt className="font-medium">Réalisées :</dt><dd>{schedule.summary.completedCount}</dd></div>
      </dl>
      <details className="mt-4 border-t pt-3" data-testid="litter-weighing-schedule-details">
        <summary className="cursor-pointer text-sm font-medium">
          Politique, cadence et observations secondaires
        </summary>
        {policy ? <PolicyDescription policy={policy} /> : null}
        <div className="mt-3 space-y-1 text-sm text-muted">
          <p>Dernière réalisée : {formatScheduleItem(findLastCompleted(schedule.schedule))}</p>
          <p>Première échéance du jour : {formatScheduleItem(findFirstByStatus(schedule.schedule, "due_today"))}</p>
          <p>Première échéance en retard : {formatScheduleItem(findFirstByStatus(schedule.schedule, "overdue"))}</p>
          <p>Observations hors planning : {schedule.summary.extraObservationCount}</p>
        </div>
      </details>
    </section>
  );
}
