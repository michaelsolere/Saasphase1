"use client";

import { Info, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { formatObservedInterval } from "./litter-growth-chart-model";
import type { LitterGrowthVigilanceSignal } from "./litter-growth-vigilance";

const gramsFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

const civilDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatCivilDate(value: string) {
  return civilDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function joinLabels(labels: readonly string[]) {
  if (labels.length > 3) {
    return `${labels.slice(0, 3).join(", ")} et ${labels.length - 3} autres`;
  }
  const visible = labels.slice(0, 3);
  if (visible.length <= 1) return visible[0] ?? "";
  return `${visible.slice(0, -1).join(", ")} et ${visible.at(-1)}`;
}

function SignalContent({ signal }: { signal: LitterGrowthVigilanceSignal }) {
  switch (signal.code) {
    case "weight_decrease":
      return (
        <>
          <p className="font-semibold break-words">{signal.animalPublicLabel}</p>
          {signal.animalPublicDetails ? (
            <p className="mt-1 break-words text-xs text-muted">
              {signal.animalPublicDetails}
            </p>
          ) : null}
          <p className="mt-2 break-words text-sm">
            Poids inférieur de {gramsFormatter.format(Math.abs(signal.differenceGrams))} g à la mesure précédente.
          </p>
          <p className="mt-1 text-sm">
            Dernier intervalle observé : {formatObservedInterval(signal.intervalMilliseconds)}.
          </p>
        </>
      );
    case "weight_stagnation":
      return (
        <>
          <p className="font-semibold break-words">{signal.animalPublicLabel}</p>
          {signal.animalPublicDetails ? (
            <p className="mt-1 break-words text-xs text-muted">
              {signal.animalPublicDetails}
            </p>
          ) : null}
          <p className="mt-2 text-sm">Poids identique sur les trois dernières mesures.</p>
          <p className="mt-1 text-sm">
            Dernier intervalle observé : {formatObservedInterval(signal.intervalMilliseconds)}.
          </p>
        </>
      );
    case "weighing_due_today":
      return (
        <>
          <p className="font-semibold">Pesée prévue aujourd’hui non encore enregistrée.</p>
          <p className="mt-1 text-sm">
            Échéance du <time dateTime={signal.scheduledOn}>{formatCivilDate(signal.scheduledOn)}</time>, à J{signal.ageDay}.
          </p>
        </>
      );
    case "weighing_overdue":
      return (
        <>
          <p className="font-semibold">
            {signal.overdueCount} pesée{signal.overdueCount > 1 ? "s prévues restent" : " prévue reste"} en retard.
          </p>
          <p className="mt-1 text-sm">
            {signal.overdueCount > 1 ? "La plus ancienne était" : "Elle était"} attendue le{" "}
            <time dateTime={signal.scheduledOn}>{formatCivilDate(signal.scheduledOn)}</time>, à J{signal.ageDay}.
          </p>
        </>
      );
    case "latest_session_incomplete": {
      const missingCount = signal.missingAnimalLabels.length;
      return (
        <>
          <p className="font-semibold">Dernière séance collective incomplète.</p>
          <p className="mt-1 break-words text-sm">
            {missingCount} chiot{missingCount > 1 ? "s éligibles" : " éligible"} sans mesure : {joinLabels(signal.missingAnimalLabels)}.
          </p>
        </>
      );
    }
  }
}

export function LitterGrowthVigilancePanel({
  signals,
  weightEntryHref,
}: {
  signals: readonly LitterGrowthVigilanceSignal[];
  weightEntryHref: string | null;
}) {
  const router = useRouter();
  if (signals.length === 0) return null;

  return (
    <section
      aria-labelledby="litter-growth-vigilance-title"
      data-testid="litter-growth-vigilance-panel"
      className="mt-5 min-w-0 rounded-2xl border bg-background/70 p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <Search aria-hidden="true" className="size-5 shrink-0 text-accent" />
        <h3 id="litter-growth-vigilance-title" className="text-base font-semibold">
          Points de vigilance
        </h3>
      </div>
      <ul className="mt-4 space-y-3">
        {signals.map((signal) => (
          <li
            key={`${signal.code}:${signal.scope === "animal" ? signal.animalId : signal.scope === "session" ? signal.sessionId : "litter"}`}
            className={`min-w-0 rounded-xl border p-4 ${
              signal.severity === "attention"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-accent/20 bg-accent/5"
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <SignalContent signal={signal} />
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide">
                  {signal.severity === "attention" ? "À surveiller" : "Information"}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {weightEntryHref ? (
        <Button
          type="button"
          className="mt-4 min-h-11 w-full sm:w-auto"
          onClick={() => router.push(weightEntryHref)}
        >
          Ouvrir la saisie des pesées
        </Button>
      ) : null}
    </section>
  );
}
