"use client";

import { useId, useState } from "react";

import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "./litter-weights-core";
import {
  buildGrowthChartDomain,
  buildLitterGrowthSeries,
  projectGrowthPoint,
  type LitterGrowthPoint,
  type LitterGrowthSeries,
} from "./litter-growth-chart-model";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 320;
const PLOT = { left: 68, top: 22, width: 670, height: 238 } as const;
const SERIES_COLORS = [
  "#0f766e",
  "#b91c1c",
  "#1d4ed8",
  "#7e22ce",
  "#b45309",
  "#0369a1",
  "#4d7c0f",
  "#be185d",
] as const;
const LINE_PATTERNS = [undefined, "12 5", "3 5", "12 4 3 4"] as const;
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1_000;
const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1_000;

function seriesStyle(seriesIndex: number) {
  return {
    color: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
    dash:
      LINE_PATTERNS[
        Math.floor(seriesIndex / SERIES_COLORS.length) % LINE_PATTERNS.length
      ],
  };
}

function formatAxisDate(timestamp: number, extent: number) {
  const options: Intl.DateTimeFormatOptions =
    extent < FORTY_EIGHT_HOURS
      ? { day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : extent < THIRTY_ONE_DAYS
        ? { day: "2-digit", month: "short" }
        : { dateStyle: "short" };
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(timestamp));
}

function formatMeasurementDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function measurementTypeLabel(type: LitterGrowthPoint["type"]) {
  return type === "birth" ? "Mesure de naissance" : "Pesée de routine";
}

function Marker({
  point,
  x,
  y,
  color,
  animalLabel,
  seriesIndex,
}: {
  point: LitterGrowthPoint;
  x: number;
  y: number;
  color: string;
  animalLabel: string;
  seriesIndex: number;
}) {
  const title = `${animalLabel} · ${point.grams} g · ${formatMeasurementDate(
    point.measuredAt,
  )} · ${measurementTypeLabel(point.type)}`;

  if (point.type === "birth") {
    return (
      <circle
        cx={x}
        cy={y}
        r="6"
        fill="white"
        stroke={color}
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
        data-series-index={seriesIndex}
        data-measurement-type="birth"
      >
        <title>{title}</title>
      </circle>
    );
  }

  return (
    <rect
      x={x - 6}
      y={y - 6}
      width="12"
      height="12"
      rx="1"
      fill="white"
      stroke={color}
      strokeWidth="4"
      vectorEffect="non-scaling-stroke"
      data-series-index={seriesIndex}
      data-measurement-type="routine"
    >
      <title>{title}</title>
    </rect>
  );
}

function GrowthSvg({
  series,
  accessibleLabel,
}: {
  series: LitterGrowthSeries[];
  accessibleLabel: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const points = series.flatMap((item) => item.points);
  const domain = buildGrowthChartDomain(points);
  if (!domain) return null;

  const firstTimestamp = Math.min(...points.map((point) => point.timestamp));
  const lastTimestamp = Math.max(...points.map((point) => point.timestamp));
  const extent = lastTimestamp - firstTimestamp;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      className="block h-auto max-w-full"
    >
      <title id={titleId}>{accessibleLabel}</title>
      <desc id={descriptionId}>
        Poids réels en grammes selon la date et l’heure de mesure. Les cercles
        représentent les mesures de naissance et les carrés les pesées de routine.
      </desc>

      {domain.gramTicks.map((grams) => {
        const y = projectGrowthPoint(
          { timestamp: domain.minTimestamp, grams },
          domain,
          PLOT,
        ).y;
        return (
          <g key={`grams-${grams}`}>
            <line
              x1={PLOT.left}
              x2={PLOT.left + PLOT.width}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.12"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PLOT.left - 10}
              y={y + 4}
              textAnchor="end"
              fontSize="12"
              fill="currentColor"
              opacity="0.72"
            >
              {Math.round(grams)} g
            </text>
          </g>
        );
      })}

      {domain.timestampTicks.map((timestamp, index) => {
        const x = projectGrowthPoint(
          { timestamp, grams: domain.minGrams },
          domain,
          PLOT,
        ).x;
        return (
          <g key={`time-${timestamp}`}>
            <line
              x1={x}
              x2={x}
              y1={PLOT.top}
              y2={PLOT.top + PLOT.height}
              stroke="currentColor"
              strokeOpacity="0.08"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x}
              y={PLOT.top + PLOT.height + 25}
              textAnchor={
                index === 0
                  ? "start"
                  : index === domain.timestampTicks.length - 1
                    ? "end"
                    : "middle"
              }
              fontSize="12"
              fill="currentColor"
              opacity="0.72"
            >
              {formatAxisDate(timestamp, extent)}
            </text>
          </g>
        );
      })}

      <line
        x1={PLOT.left}
        x2={PLOT.left}
        y1={PLOT.top}
        y2={PLOT.top + PLOT.height}
        stroke="currentColor"
        strokeOpacity="0.45"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={PLOT.left}
        x2={PLOT.left + PLOT.width}
        y1={PLOT.top + PLOT.height}
        y2={PLOT.top + PLOT.height}
        stroke="currentColor"
        strokeOpacity="0.45"
        vectorEffect="non-scaling-stroke"
      />

      {series.map((item) => {
        const style = seriesStyle(item.seriesIndex);
        const projected = item.points.map((point) => ({
          ...projectGrowthPoint(point, domain, PLOT),
          point,
        }));
        return (
          <g key={item.internalId}>
            {projected.length >= 2 ? (
              <polyline
                points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="none"
                stroke={style.color}
                strokeWidth="3"
                strokeDasharray={style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                data-growth-series={item.seriesIndex}
              />
            ) : null}
            {projected.map(({ point, x, y }) => (
              <Marker
                key={point.internalId}
                point={point}
                x={x}
                y={y}
                color={style.color}
                animalLabel={item.publicLabel}
                seriesIndex={item.seriesIndex}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function MarkerKey() {
  return (
    <p className="text-xs leading-5 text-muted">
      <span className="font-medium text-foreground">Types de points :</span>{" "}
      naissance (cercle) · routine (carré)
    </p>
  );
}

function EntireLitterView({
  series,
  animalsWithoutMeasurements,
}: {
  series: LitterGrowthSeries[];
  animalsWithoutMeasurements: number;
}) {
  return (
    <div className="space-y-4" data-testid="entire-litter-growth-view">
      <GrowthSvg
        series={series}
        accessibleLabel={`Courbes de croissance de la portée, ${series.length} séries animales`}
      />
      <MarkerKey />
      <ul className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Légende des animaux">
        {series.map((item) => {
          const style = seriesStyle(item.seriesIndex);
          return (
            <li key={item.internalId} className="flex min-w-0 items-center gap-2 text-sm">
              <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">
                <line
                  x1="1"
                  x2="29"
                  y1="6"
                  y2="6"
                  stroke={style.color}
                  strokeWidth="3"
                  strokeDasharray={style.dash}
                />
              </svg>
              <span className="break-words">{item.publicLabel}</span>
            </li>
          );
        })}
      </ul>
      {animalsWithoutMeasurements > 0 ? (
        <p className="text-sm text-muted">
          {animalsWithoutMeasurements} animal
          {animalsWithoutMeasurements > 1 ? "aux" : ""} sans mesure réelle non
          tracé{animalsWithoutMeasurements > 1 ? "s" : ""}.
        </p>
      ) : null}
    </div>
  );
}

function IndividualAnimalView({ series }: { series: LitterGrowthSeries[] }) {
  const [selectedSeriesIndex, setSelectedSeriesIndex] = useState(
    series[0]?.seriesIndex ?? 0,
  );
  const selected =
    series.find((item) => item.seriesIndex === selectedSeriesIndex) ?? series[0];
  if (!selected) return null;

  const latest = selected.latestMeasurement;
  return (
    <div className="space-y-4" data-testid="individual-animal-growth-view">
      <div className="max-w-sm">
        <label htmlFor="litter-growth-animal" className="text-sm font-semibold">
          Animal
        </label>
        <select
          id="litter-growth-animal"
          value={selected.seriesIndex}
          onChange={(event) => setSelectedSeriesIndex(Number(event.target.value))}
          className="mt-2 min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base outline-none transition focus:border-accent focus:ring-1 focus:ring-accent sm:text-sm"
        >
          {series.map((item) => (
            <option key={item.internalId} value={item.seriesIndex}>
              {item.publicLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="rounded-xl border bg-background p-4">
        <h4 className="font-semibold">{selected.publicLabel}</h4>
        {selected.publicDetails ? (
          <p className="mt-1 text-xs leading-5 text-muted">{selected.publicDetails}</p>
        ) : null}
        <p className="mt-3 text-sm">
          {selected.points.length} mesure{selected.points.length > 1 ? "s" : ""} réelle
          {selected.points.length > 1 ? "s" : ""}
        </p>
        <p className="mt-1 text-sm text-muted">
          Dernière mesure : {latest.grams} g · {formatMeasurementDate(latest.measuredAt)}
        </p>
      </div>
      <GrowthSvg
        series={[selected]}
        accessibleLabel={`Courbe de croissance de ${selected.publicLabel}, ${selected.points.length} mesures réelles`}
      />
      <MarkerKey />
      {selected.points.length === 1 ? (
        <p className="rounded-xl border bg-secondary px-3 py-2 text-sm">
          Une seconde mesure permettra de tracer l’évolution.
        </p>
      ) : null}
    </div>
  );
}

export function LitterGrowthCharts({
  animals,
  measurements,
}: {
  animals: LitterWeightHistoryAnimal[];
  measurements: LitterWeightHistoryMeasurement[];
}) {
  const [view, setView] = useState<"litter" | "animal">("litter");
  const series = buildLitterGrowthSeries(animals, measurements);
  const animalsWithoutMeasurements = animals.length - series.length;

  return (
    <section className="mt-7 min-w-0 border-t pt-6" aria-labelledby="growth-curves-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 id="growth-curves-title" className="text-base font-semibold">
          Courbes de croissance
        </h3>
        <div className="inline-flex w-fit rounded-xl border bg-background p-1" aria-label="Vue des courbes">
          <button
            type="button"
            aria-pressed={view === "litter"}
            onClick={() => setView("litter")}
            className="min-h-10 rounded-lg px-3 text-sm font-medium transition aria-pressed:bg-accent aria-pressed:text-white"
          >
            Portée entière
          </button>
          <button
            type="button"
            aria-pressed={view === "animal"}
            onClick={() => setView("animal")}
            className="min-h-10 rounded-lg px-3 text-sm font-medium transition aria-pressed:bg-accent aria-pressed:text-white"
          >
            Un animal
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        Dates affichées dans le fuseau de cet appareil.
      </p>

      <div className="mt-5 min-w-0">
        {series.length === 0 ? (
          <p className="rounded-xl border bg-secondary px-3 py-3 text-sm text-muted">
            Aucune mesure réelle disponible pour tracer une courbe.
          </p>
        ) : view === "litter" ? (
          <EntireLitterView
            series={series}
            animalsWithoutMeasurements={animalsWithoutMeasurements}
          />
        ) : (
          <IndividualAnimalView series={series} />
        )}
      </div>
    </section>
  );
}
