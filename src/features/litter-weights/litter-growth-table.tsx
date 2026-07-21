"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
} from "./litter-weights-core";
import {
  buildLitterGrowthTableModel,
  getLitterGrowthCellValue,
  type LitterGrowthTableCell,
  type LitterGrowthTableRow,
  type LitterGrowthValueMode,
} from "./litter-growth-table-model";

type TableView = "puppy" | "day";
type Period = "all" | "week1" | "week2" | "week3" | "week4" | "latest";

const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function formatValue(cell: LitterGrowthTableCell, mode: LitterGrowthValueMode) {
  const value = getLitterGrowthCellValue(cell, mode);
  if (value === null) return "—";
  if (mode === "index") return numberFormatter.format(value);
  if (mode === "gain") {
    return `${value > 0 ? "↗ +" : value < 0 ? "↘ " : ""}${numberFormatter.format(value)} g`;
  }
  return `${numberFormatter.format(value)} g`;
}

function formatFixedGrams(value: number | null, signed = false) {
  if (value === null) return "—";
  return `${signed && value > 0 ? "+" : ""}${numberFormatter.format(value)} g`;
}

function sexLabel(sex: string) {
  if (sex === "female") return "Femelle";
  if (sex === "male") return "Mâle";
  return "Non renseigné";
}

function collarSwatch(value: string | null) {
  if (!value) return "#cbd5e1";
  const normalized = value.toLocaleLowerCase("fr-FR");
  const colors: Array<[string, string]> = [
    ["rose", "#e65b89"], ["bleu marine", "#274060"], ["bleu", "#4299e1"],
    ["violet", "#805ad5"], ["vert", "#38a169"], ["orange", "#ed8936"],
    ["jaune", "#ecc94b"], ["rouge", "#e05252"], ["turquoise", "#38b2ac"],
  ];
  return colors.find(([keyword]) => normalized.includes(keyword))?.[1] ?? "#94a3b8";
}

function rowsForPeriod(rows: LitterGrowthTableRow[], period: Period) {
  if (period === "all") return rows;
  if (period === "latest") return rows.slice(-5);
  const ranges: Record<Exclude<Period, "all" | "latest">, [number, number]> = {
    week1: [0, 6], week2: [7, 13], week3: [14, 20], week4: [21, 27],
  };
  const [start, end] = ranges[period];
  return rows.filter((row) => row.ageDay !== null && row.ageDay >= start && row.ageDay <= end);
}

function averageForMode(
  row: LitterGrowthTableRow,
  animalIds: string[],
  mode: LitterGrowthValueMode,
) {
  const values = animalIds.flatMap((id) => {
    const cell = row.cellsByAnimalId.get(id);
    const value = cell ? getLitterGrowthCellValue(cell, mode) : null;
    return value === null ? [] : [value];
  });
  if (!values.length) return "—";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mode === "index") return numberFormatter.format(average);
  return `${mode === "gain" && average > 0 ? "+" : ""}${numberFormatter.format(average)} g`;
}

const stickyHeader = "sticky left-0 z-20 border-r bg-muted-soft";
const stickyCell = "sticky left-0 z-10 border-r bg-surface";

export function LitterGrowthTable({
  animals,
  sessions,
  measurements,
}: {
  animals: LitterWeightHistoryAnimal[];
  sessions: LitterWeightHistorySession[];
  measurements: LitterWeightHistoryMeasurement[];
}) {
  const model = useMemo(
    () => buildLitterGrowthTableModel(animals, sessions, measurements),
    [animals, sessions, measurements],
  );
  const [view, setView] = useState<TableView>("puppy");
  const [mode, setMode] = useState<LitterGrowthValueMode>("weight");
  const [period, setPeriod] = useState<Period>("all");
  const manuallySelectedView = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    if (media.matches && !manuallySelectedView.current) setView("day");
  }, []);

  const visibleRoutineRows = useMemo(
    () => rowsForPeriod(model.routineRows, period),
    [model.routineRows, period],
  );
  const dayRows = [model.birthRow, ...visibleRoutineRows];
  const animalIds = model.animals.map((animal) => animal.internalId);

  function chooseView(next: TableView) {
    manuallySelectedView.current = true;
    setView(next);
  }

  return (
    <section
      className="mt-6 min-w-0 rounded-2xl border p-4 sm:p-5"
      aria-labelledby="litter-growth-table-title"
      data-testid="litter-growth-table"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 id="litter-growth-table-title" className="text-base font-semibold">
            Tableau de croissance de la portée
          </h3>
          <p className="mt-1 text-sm text-muted">
            Mesures réelles uniquement. Naissance et routine J0 restent distinctes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <fieldset className="flex rounded-lg border p-1">
            <legend className="sr-only">Organisation du tableau</legend>
            {(["puppy", "day"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={view === item}
                onClick={() => chooseView(item)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === item ? "bg-accent text-accent-foreground" : "text-muted"}`}>
                {item === "puppy" ? "Par chiot" : "Par jour"}
              </button>
            ))}
          </fieldset>
          <label className="text-xs font-medium text-muted">
            Valeur
            <select value={mode} onChange={(event) => setMode(event.target.value as LitterGrowthValueMode)}
              className="ml-2 min-h-9 rounded-lg border bg-background px-2 text-sm text-foreground">
              <option value="weight">Poids</option>
              <option value="gain">Gain depuis la mesure précédente</option>
              <option value="index">Indice naissance</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Période
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}
              className="ml-2 min-h-9 rounded-lg border bg-background px-2 text-sm text-foreground">
              <option value="all">Tout</option><option value="week1">Semaine 1</option>
              <option value="week2">Semaine 2</option><option value="week3">Semaine 3</option>
              <option value="week4">Semaine 4</option><option value="latest">Dernières mesures</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border" data-testid={`growth-table-${view}-view`}>
        {view === "puppy" ? (
          <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-muted-soft text-xs text-muted">
              <tr>
                <th scope="col" className={`${stickyHeader} min-w-40 px-3 py-3 font-medium`}>Chiot</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Sexe</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Collier</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Naissance</th>
                {visibleRoutineRows.map((row) => <th key={row.internalId} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{row.label}</th>)}
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Dernier poids connu</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Évolution depuis la naissance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {model.animals.map((animal) => (
                <tr key={animal.internalId}>
                  <th scope="row" className={`${stickyCell} min-w-40 px-3 py-3 font-semibold`}>{animal.publicLabel}</th>
                  <td className="whitespace-nowrap px-3 py-3">{sexLabel(animal.sex)}</td>
                  <td className="whitespace-nowrap px-3 py-3"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full border" style={{ backgroundColor: collarSwatch(animal.collarColor) }} />{animal.collarColor ?? "—"}</span></td>
                  <td className="whitespace-nowrap px-3 py-3" data-measurement-kind="birth">{formatValue(animal.birth, mode)}</td>
                  {visibleRoutineRows.map((row) => <td key={row.internalId} className="whitespace-nowrap px-3 py-3">{formatValue(row.cellsByAnimalId.get(animal.internalId) ?? { measurementId: null, weightGrams: null, gainGrams: null, birthIndex: null }, mode)}</td>)}
                  <td className="whitespace-nowrap px-3 py-3">{formatFixedGrams(animal.latestWeightGrams)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatFixedGrams(animal.evolutionFromBirthGrams, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-muted-soft text-xs text-muted"><tr>
              <th scope="col" className={`${stickyHeader} min-w-32 px-3 py-3 font-medium`}>Type ou jour</th>
              {model.animals.map((animal) => <th key={animal.internalId} scope="col" className="min-w-28 px-3 py-3 font-medium">{animal.publicLabel}</th>)}
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Couverture</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium">Moyenne</th>
            </tr></thead>
            <tbody className="divide-y">
              {dayRows.map((row) => <tr key={row.internalId}>
                <th scope="row" className={`${stickyCell} min-w-32 whitespace-nowrap px-3 py-3 font-semibold`}>{row.label}</th>
                {model.animals.map((animal) => <td key={animal.internalId} className="whitespace-nowrap px-3 py-3">{formatValue(row.cellsByAnimalId.get(animal.internalId) ?? { measurementId: null, weightGrams: null, gainGrams: null, birthIndex: null }, mode)}</td>)}
                <td className="whitespace-nowrap px-3 py-3">{row.observedAnimalCount} / {model.animals.length}</td>
                <td className="whitespace-nowrap px-3 py-3">{averageForMode(row, animalIds, mode)}</td>
              </tr>)}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
