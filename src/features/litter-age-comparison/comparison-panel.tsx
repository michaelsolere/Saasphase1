"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatLitterDate,
  getLitterStatusLabel,
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

      <LitterAgeComparisonChart series={result.series} />

      <div className="grid gap-5 xl:grid-cols-2">
        {result.series.map((series) => (
          <article
            key={series.seriesIndex}
            className="min-w-0 rounded-2xl border bg-surface p-5 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Portée comparée
                </p>
                <h3 className="mt-1 text-xl font-semibold">{series.publicLabel}</h3>
              </div>
              {series.status === "no_eligible_animals" ? (
                <span className="w-fit rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted">
                  Aucun animal éligible
                </span>
              ) : null}
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl bg-muted-soft p-3">
                <dt className="text-xs text-muted">Animaux totaux</dt>
                <dd className="mt-1 text-lg font-semibold">{series.totalAnimalCount}</dd>
              </div>
              <div className="rounded-xl bg-muted-soft p-3">
                <dt className="text-xs text-muted">Éligibles</dt>
                <dd className="mt-1 text-lg font-semibold">{series.eligibleAnimalCount}</dd>
              </div>
              <div className="rounded-xl bg-muted-soft p-3">
                <dt className="text-xs text-muted">Exclus</dt>
                <dd className="mt-1 text-lg font-semibold">{series.excludedAnimalCount}</dd>
              </div>
              <div className="rounded-xl bg-muted-soft p-3">
                <dt className="text-xs text-muted">Journées observées</dt>
                <dd className="mt-1 text-lg font-semibold">{series.points.length}</dd>
              </div>
            </dl>

            {series.points.length > 0 ? (
              <div className="mt-5 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted-soft text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Jour d’âge</th>
                      <th scope="col" className="px-4 py-3 font-medium">Couverture</th>
                      <th scope="col" className="px-4 py-3 font-medium">Poids moyen</th>
                      <th scope="col" className="px-4 py-3 font-medium">Indice base 100</th>
                      <th scope="col" className="px-4 py-3 font-medium">Progression relative</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {series.points.map((point) => (
                      <tr key={point.ageDay}>
                        <th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold">
                          J{point.ageDay}
                        </th>
                        <td className="whitespace-nowrap px-4 py-3">
                          {point.observedAnimalCount} / {series.eligibleAnimalCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatNumber(point.averageGrams)} g
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatNumber(point.averageRelativeIndex)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {formatProgress(point.averageRelativeProgressPercentage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-5 rounded-xl border bg-background px-4 py-5 text-sm text-muted">
                Aucune journée observée n’est disponible pour cette portée.
              </p>
            )}
          </article>
        ))}
      </div>
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
  const [state, formAction, isPending] = useActionState(
    action,
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
      <form action={formAction} className="space-y-6">
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

        <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                className={`flex min-h-36 cursor-pointer gap-4 rounded-2xl border p-4 transition-colors ${
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
                  className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
                  aria-label={`Sélectionner ${item.publicLabel}`}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{item.publicLabel}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {getSpeciesLabel(item.species)} · {item.breed}
                  </span>
                  <span className="mt-2 block text-xs text-muted">
                    {birthDateLabel(item)}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {getLitterStatusLabel(item.status)}
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
      </form>

      {state.status === "error" ? (
        <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {state.message}
        </div>
      ) : null}
      {state.status === "success" ? <ComparisonResult result={state.result} /> : null}
    </div>
  );
}
