import type { WhelpingSessionClosureSummary } from "./whelping-session-summary";
import {
  formatWhelpingDuration,
  formatWhelpingSexCounts,
  formatWhelpingViabilityCounts,
} from "./whelping-session-summary";

function formatTime(value: string | null, timezoneName: string) {
  if (value === null) return "Non renseignée";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezoneName,
    }).format(new Date(value));
  } catch {
    return "Non renseignée";
  }
}

function formatGrams(value: number | null) {
  return value === null
    ? "Non renseigné"
    : `${new Intl.NumberFormat("fr-FR").format(value)} g`;
}

function SummaryDefinition({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,1fr)] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}

function SummaryActions({
  completionHref,
  weighingHref,
}: {
  completionHref: string | null;
  weighingHref: string | null;
}) {
  if (!completionHref && !weighingHref) return null;
  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row">
      {completionHref ? (
        <a
          href={completionHref}
          className="inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary"
        >
          Compléter les naissances
        </a>
      ) : null}
      {weighingHref ? (
        <a
          href={weighingHref}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Ouvrir les pesées
        </a>
      ) : null}
    </div>
  );
}

function FullSummary({
  summary,
  timezoneName,
}: {
  summary: Extract<WhelpingSessionClosureSummary, { status: "available" }>;
  timezoneName: string;
}) {
  const hasBirths = summary.activeBirthCount > 0;
  return (
    <>
      <dl className="mt-3 divide-y text-sm">
        <SummaryDefinition label="Durée de la session">
          {formatWhelpingDuration(summary.sessionDurationMinutes) ?? "Non renseignée"}
        </SummaryDefinition>
        {hasBirths ? (
          <>
            <SummaryDefinition label="Première naissance">{formatTime(summary.firstBirthAt, timezoneName)}</SummaryDefinition>
            <SummaryDefinition label="Dernière naissance">{formatTime(summary.lastBirthAt, timezoneName)}</SummaryDefinition>
            <SummaryDefinition label="Durée des naissances">
              {formatWhelpingDuration(summary.birthSpanMinutes) ?? "Non renseignée"}
            </SummaryDefinition>
          </>
        ) : null}
        <SummaryDefinition label="Naissances actives">{summary.activeBirthCount}</SummaryDefinition>
        {hasBirths ? (
          <>
            <SummaryDefinition label="Sexes">{formatWhelpingSexCounts(summary.sexCounts)}</SummaryDefinition>
            <SummaryDefinition label="Viabilité">{formatWhelpingViabilityCounts(summary.viabilityCounts)}</SummaryDefinition>
            <SummaryDefinition label="Poids renseignés">
              {summary.recordedWeightCount} sur {summary.activeBirthCount}
            </SummaryDefinition>
            <SummaryDefinition label="Poids moyen">{formatGrams(summary.averageWeightGrams)}</SummaryDefinition>
            <SummaryDefinition label="Minimum / maximum">
              {summary.minimumWeightGrams === null || summary.maximumWeightGrams === null
                ? "Non renseigné"
                : `${formatGrams(summary.minimumWeightGrams)} / ${formatGrams(summary.maximumWeightGrams)}`}
            </SummaryDefinition>
          </>
        ) : null}
        <SummaryDefinition label="Interventions">{summary.interventionCount}</SummaryDefinition>
        <SummaryDefinition label="Appels vétérinaires">{summary.vetCallCount}</SummaryDefinition>
      </dl>
      {!hasBirths ? (
        <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-sm font-medium">
          Aucune naissance active dans cette session.
        </p>
      ) : null}
      {summary.missingWeightCount > 0 ? (
        <p className="mt-3 text-sm text-amber-800">
          {summary.missingWeightCount} poids de naissance {summary.missingWeightCount === 1 ? "reste" : "restent"} à compléter.
        </p>
      ) : null}
      {summary.readyForWeighingCount > 0 ? (
        <p className="mt-2 text-sm text-muted">
          {summary.readyForWeighingCount} {summary.readyForWeighingCount === 1 ? "chiot est disponible" : "chiots sont disponibles"} pour le suivi des pesées.
        </p>
      ) : null}
    </>
  );
}

export function WhelpingSessionSummaryCard({
  summary,
  timezoneName,
  displayMode,
  completionHref,
  weighingHref,
}: {
  summary: WhelpingSessionClosureSummary;
  timezoneName: string;
  displayMode: "mobile" | "journal";
  completionHref: string | null;
  weighingHref: string | null;
}) {
  if (summary.status !== "available") return null;

  if (displayMode === "mobile") {
    return (
      <section
        className="mt-5 min-w-0 rounded-xl border bg-background p-4"
        aria-labelledby="whelping-session-summary-title"
        data-testid="whelping-session-summary"
      >
        <h3 id="whelping-session-summary-title" className="font-semibold">Bilan de la mise-bas</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">Durée</dt><dd className="font-semibold">{formatWhelpingDuration(summary.sessionDurationMinutes) ?? "—"}</dd></div>
          <div><dt className="text-muted">Naissances</dt><dd className="font-semibold">{summary.activeBirthCount}</dd></div>
          <div className="col-span-2"><dt className="text-muted">Sexes</dt><dd className="font-semibold">{summary.activeBirthCount > 0 ? formatWhelpingSexCounts(summary.sexCounts) : "Aucune naissance active"}</dd></div>
          <div><dt className="text-muted">Poids renseignés</dt><dd className="font-semibold">{summary.recordedWeightCount} sur {summary.activeBirthCount}</dd></div>
          <div><dt className="text-muted">Interventions / appels</dt><dd className="font-semibold">{summary.interventionCount} / {summary.vetCallCount}</dd></div>
        </dl>
        <details className="mt-4 border-t pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Voir le bilan détaillé</summary>
          <FullSummary summary={summary} timezoneName={timezoneName} />
        </details>
      </section>
    );
  }

  return (
    <section
      className="mt-5 min-w-0 rounded-xl border bg-background p-4 sm:p-5"
      aria-labelledby="whelping-session-summary-title"
      data-testid="whelping-session-summary"
    >
      <h3 id="whelping-session-summary-title" className="font-semibold">Bilan de la mise-bas</h3>
      <FullSummary summary={summary} timezoneName={timezoneName} />
      <SummaryActions completionHref={completionHref} weighingHref={weighingHref} />
    </section>
  );
}
