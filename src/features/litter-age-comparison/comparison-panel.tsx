"use client";

import { useActionState, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatLitterDate,
  getSpeciesLabel,
} from "@/features/litters/formatters";

import {
  initialLitterComparisonActionState,
  type LitterComparisonActionState,
  type LitterComparisonCatalogItem,
} from "./types";
import { LitterAgeComparisonChart } from "./litter-age-comparison-chart";

type ComparisonAction = (
  state: LitterComparisonActionState,
  formData: FormData,
) => Promise<LitterComparisonActionState>;

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatProgress(value: number) {
  const formatted = formatNumber(Math.abs(value));
  if (value > 0) return `+${formatted} %`;
  if (value < 0) return `−${formatted} %`;
  return "0 %";
}

function birthDateLabel(item: LitterComparisonCatalogItem) {
  if (!item.birthDate || !item.birthDateKind) return "Naissance non renseignée";
  return item.birthDateKind === "actual"
    ? `Née le ${formatLitterDate(item.birthDate)}`
    : `Naissance estimée le ${formatLitterDate(item.birthDate)}`;
}

function ComparisonResult({
  result,
}: {
  result: Extract<LitterComparisonActionState, { status: "success" }>["result"];
}) {
  const [view, setView] = useState<"table" | "chart">("table");
  const ageDays = [...new Set(result.series.flatMap((series) => series.points.map((point) => point.ageDay)))]
    .sort((left, right) => left - right);
  const pointsBySeries = new Map(
    result.series.map((series) => [
      series.seriesIndex,
      new Map(series.points.map((point) => [point.ageDay, point])),
    ]),
  );

  return (
    <section
      aria-labelledby="comparison-result-title"
      className="mt-10 space-y-6 border-t pt-8"
      data-testid="litter-comparison-result"
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Synthèse descriptive
        </p>
        <h2 id="comparison-result-title" className="mt-2 text-2xl font-semibold">
          {getSpeciesLabel(result.species)} · {result.breed}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Seules les journées réellement observées sont présentées. Les valeurs
          reprennent la comparaison calculée à partir des pesées enregistrées.
        </p>
      </div>

      <nav className="flex w-fit rounded-lg border p-1" aria-label="Vue du comparateur">
        {(["table", "chart"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={view === item}
            onClick={() => setView(item)}
            className={`rounded-md px-4 py-2 text-sm font-medium ${view === item ? "bg-accent text-accent-foreground" : "text-muted"}`}>
            {item === "table" ? "Tableau" : "Graphique"}
          </button>
        ))}
      </nav>

      {view === "table" ? <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border" data-testid="comparison-day-matrix">
        <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-muted-soft text-xs text-muted">
            <tr>
              <th scope="col" rowSpan={2} className="sticky left-0 z-30 min-w-28 border-r bg-muted-soft px-4 py-3 font-medium">Jour d’âge</th>
              {result.series.map((series) => <th key={series.seriesIndex} scope="colgroup" colSpan={3} className="max-w-80 border-r px-4 py-3 text-foreground"><span className="block font-semibold">{series.publicLabel}</span><span className="mt-1 block font-normal text-muted">{series.totalAnimalCount} animaux · {series.points.length} jours observés{series.excludedAnimalCount > 0 ? ` · ${series.excludedAnimalCount} exclus` : ""}{series.birthDate ? ` · ${formatLitterDate(series.birthDate)}` : ""}</span></th>)}
            </tr>
            <tr>{result.series.flatMap((series) => [
              <th key={`${series.seriesIndex}-coverage`} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Couverture</th>,
              <th key={`${series.seriesIndex}-weight`} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Poids moyen</th>,
              <th key={`${series.seriesIndex}-index`} scope="col" className="whitespace-nowrap border-r px-4 py-3 font-medium">Indice base 100</th>,
            ])}</tr>
          </thead>
          <tbody>{ageDays.map((ageDay) => <tr key={ageDay}>
            <th scope="row" className="sticky left-0 z-20 border-r border-t bg-surface px-4 py-3 font-semibold">J{ageDay}</th>
            {result.series.flatMap((series) => {
              const point = pointsBySeries.get(series.seriesIndex)?.get(ageDay);
              if (!point) return [
                <td key={`${series.seriesIndex}-${ageDay}-coverage`} className="border-t px-4 py-3 text-muted">—</td>,
                <td key={`${series.seriesIndex}-${ageDay}-weight`} className="border-t px-4 py-3 text-muted">—</td>,
                <td key={`${series.seriesIndex}-${ageDay}-index`} className="border-r border-t px-4 py-3 text-muted">—</td>,
              ];
              return [
                <td key={`${series.seriesIndex}-${ageDay}-coverage`} className="whitespace-nowrap border-t px-4 py-3">{point.observedAnimalCount} / {series.eligibleAnimalCount}</td>,
                <td key={`${series.seriesIndex}-${ageDay}-weight`} className="whitespace-nowrap border-t px-4 py-3">{formatNumber(point.averageGrams)} g</td>,
                <td key={`${series.seriesIndex}-${ageDay}-index`} className="whitespace-nowrap border-r border-t px-4 py-3"><span className="block font-medium">{formatNumber(point.averageRelativeIndex)}</span><span className="block text-xs text-muted">{formatProgress(point.averageRelativeProgressPercentage)}</span></td>,
              ];
            })}
          </tr>)}</tbody>
        </table>
      </div> : <div data-testid="comparison-chart-view"><LitterAgeComparisonChart series={result.series} /></div>}
    </section>
  );
}

export function LitterComparisonPanel({
  catalog,
  action,
}: {
  catalog: LitterComparisonCatalogItem[];
  action: ComparisonAction;
}) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [selectionOpen, setSelectionOpen] = useState(true);
  const submitComparison = useCallback(
    async (previousState: LitterComparisonActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") setSelectionOpen(false);
      return nextState;
    },
    [action],
  );
  const [state, formAction, isPending] = useActionState(
    submitComparison,
    initialLitterComparisonActionState,
  );
  const selectedGroup = useMemo(() => {
    const firstIndex = selectedIndices[0];
    return catalog.find((item) => item.selectionIndex === firstIndex)
      ?.compatibilityGroup;
  }, [catalog, selectedIndices]);

  function toggleSelection(selectionIndex: number, checked: boolean) {
    setSelectedIndices((current) => {
      if (!checked) return current.filter((index) => index !== selectionIndex);
      if (current.includes(selectionIndex) || current.length >= 5) return current;
      return [...current, selectionIndex];
    });
  }

  if (catalog.length === 0) {
    return (
      <div className="rounded-2xl border bg-surface px-6 py-10 text-center">
        <h2 className="text-lg font-semibold">Aucune portée disponible</h2>
        <p className="mt-2 text-sm text-muted">
          Les portées accessibles apparaîtront ici lorsqu’elles seront disponibles.
        </p>
      </div>
    );
  }

  return (
    <div>
      {!selectionOpen && state.status === "success" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted-soft px-4 py-3" data-testid="collapsed-comparison-selector">
          <p className="text-sm font-semibold">
            {selectedIndices.length} portées comparées
          </p>
          <Button type="button" variant="outline" onClick={() => setSelectionOpen(true)}>
            Modifier la sélection
          </Button>
        </div>
      ) : null}
      {selectionOpen ? <form action={formAction} className="space-y-4" data-testid="comparison-selector">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Choisir les portées</h2>
            <p className="mt-1 text-sm text-muted">
              Sélectionnez de 2 à 5 portées d’une même organisation, espèce et race.
            </p>
          </div>
          <p className="text-sm font-semibold" aria-live="polite">
            {selectedIndices.length} portée{selectedIndices.length > 1 ? "s" : ""} sélectionnée{selectedIndices.length > 1 ? "s" : ""} sur 5
          </p>
        </div>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Portées à comparer</legend>
          {catalog.map((item) => {
            const checked = selectedIndices.includes(item.selectionIndex);
            const incompatible =
              selectedGroup !== undefined &&
              item.compatibilityGroup !== selectedGroup;
            const maximumReached = selectedIndices.length >= 5 && !checked;
            const disabled = isPending || (!checked && (incompatible || maximumReached));

            return (
              <label
                key={item.selectionIndex}
                className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  checked
                    ? "border-accent bg-accent/5"
                    : disabled
                      ? "cursor-not-allowed bg-muted-soft opacity-55"
                      : "bg-surface hover:border-accent/50"
                }`}
              >
                <input
                  type="checkbox"
                  name="litter_index"
                  value={item.selectionIndex}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) =>
                    toggleSelection(item.selectionIndex, event.target.checked)
                  }
                  className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                  aria-label={`Sélectionner ${item.publicLabel}`}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{item.publicLabel}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {item.breed} · {birthDateLabel(item)}
                  </span>
                  {incompatible ? (
                    <span className="mt-2 block text-xs font-medium text-muted">
                      Incompatible avec la première portée sélectionnée
                    </span>
                  ) : maximumReached ? (
                    <span className="mt-2 block text-xs font-medium text-muted">
                      Limite de cinq portées atteinte
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            size="lg"
            disabled={selectedIndices.length < 2 || selectedIndices.length > 5 || isPending}
          >
            {isPending ? "Comparaison en cours…" : "Comparer les portées"}
          </Button>
          {selectedIndices.length === 1 ? (
            <p className="text-sm text-muted">Sélectionnez encore une portée compatible.</p>
          ) : null}
        </div>
      </form> : null}

      {state.status === "error" ? (
        <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {state.message}
        </div>
      ) : null}
      {state.status === "success" ? <ComparisonResult result={state.result} /> : null}
    </div>
  );
}
