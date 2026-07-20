"use client";

import { useId, useState } from "react";

import {
  buildLitterAgeComparisonChartModel,
  type LitterAgeComparisonChartInput,
  type LitterAgeComparisonChartMode,
  type LitterAgeComparisonChartPoint,
} from "./litter-age-comparison-chart-model";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 330;
const PLOT = { left: 72, top: 24, width: 660, height: 240 } as const;
const SERIES_COLORS = ["#0f766e", "#b91c1c", "#1d4ed8", "#7e22ce", "#b45309"] as const;
const LINE_PATTERNS = [undefined, "12 5", "3 5", "12 4 3 4", "2 4 10 4"] as const;
const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function seriesStyle(seriesIndex: number) {
  return {
    color: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
    dash: LINE_PATTERNS[seriesIndex % LINE_PATTERNS.length],
    marker: seriesIndex % 3,
  };
}

function formatValue(value: number, mode: LitterAgeComparisonChartMode) {
  const formatted = numberFormatter.format(value);
  return mode === "weight" ? `${formatted} g` : formatted;
}

function ChartMarker({
  point,
  publicLabel,
  seriesIndex,
  mode,
}: {
  point: LitterAgeComparisonChartPoint;
  publicLabel: string;
  seriesIndex: number;
  mode: LitterAgeComparisonChartMode;
}) {
  const style = seriesStyle(seriesIndex);
  const title = `${publicLabel} · J${point.ageDay} · ${
    mode === "weight" ? "Poids moyen" : "Indice moyen"
  } ${formatValue(point.value, mode)} · Couverture ${point.observedAnimalCount} / ${point.eligibleAnimalCount}`;
  const common = {
    fill: "white",
    stroke: style.color,
    strokeWidth: 4,
    vectorEffect: "non-scaling-stroke" as const,
    "data-comparison-marker": "true",
    "data-series-index": seriesIndex,
    "data-age-day": point.ageDay,
  };

  if (style.marker === 1) {
    return (
      <rect x={point.x - 6} y={point.y - 6} width="12" height="12" rx="1" {...common}>
        <title>{title}</title>
      </rect>
    );
  }

  if (style.marker === 2) {
    return (
      <path
        d={`M ${point.x} ${point.y - 8} L ${point.x + 8} ${point.y} L ${point.x} ${point.y + 8} L ${point.x - 8} ${point.y} Z`}
        {...common}
      >
        <title>{title}</title>
      </path>
    );
  }

  return (
    <circle cx={point.x} cy={point.y} r="6" {...common}>
      <title>{title}</title>
    </circle>
  );
}

function ComparisonSvg({
  input,
  mode,
}: {
  input: LitterAgeComparisonChartInput;
  mode: LitterAgeComparisonChartMode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const model = buildLitterAgeComparisonChartModel(input, mode, PLOT);
  if (!model.domain) return null;
  const { domain } = model;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      className="block h-auto max-w-full"
      data-testid="litter-age-comparison-chart-svg"
      data-chart-mode={mode}
    >
      <title id={titleId}>
        {mode === "weight"
          ? "Comparaison du poids moyen des portées"
          : "Comparaison de l’indice moyen base 100 des portées"}
      </title>
      <desc id={descriptionId}>
        {mode === "weight"
          ? "Poids moyen en grammes selon l’âge réel en jours. Chaque marqueur correspond à une journée réellement fournie."
          : "Indice moyen base 100 selon l’âge réel en jours. La ligne horizontale à 100 représente uniquement la base mathématique de naissance. Chaque marqueur correspond à une journée réellement fournie."}
      </desc>

      {domain.valueTicks.map((value) => {
        const ratio = (value - domain.minValue) / (domain.maxValue - domain.minValue);
        const y = PLOT.top + (1 - ratio) * PLOT.height;
        return (
          <g key={`value-${value}`}>
            <line
              x1={PLOT.left}
              x2={PLOT.left + PLOT.width}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.12"
              vectorEffect="non-scaling-stroke"
            />
            <text x={PLOT.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="currentColor" opacity="0.72">
              {formatValue(value, mode)}
            </text>
          </g>
        );
      })}

      {domain.ageDayTicks.map((ageDay, index) => {
        const ratio = (ageDay - domain.minAgeDay) / (domain.maxAgeDay - domain.minAgeDay);
        const x = PLOT.left + ratio * PLOT.width;
        return (
          <g key={`age-${ageDay}`}>
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
              textAnchor={index === 0 ? "start" : index === domain.ageDayTicks.length - 1 ? "end" : "middle"}
              fontSize="12"
              fill="currentColor"
              opacity="0.72"
            >
              J{ageDay}
            </text>
          </g>
        );
      })}

      {model.referenceY !== null ? (
        <g data-testid="litter-age-comparison-reference-100">
          <line
            x1={PLOT.left}
            x2={PLOT.left + PLOT.width}
            y1={model.referenceY}
            y2={model.referenceY}
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 5"
            strokeOpacity="0.55"
            vectorEffect="non-scaling-stroke"
          />
          <text x={PLOT.left + 8} y={model.referenceY - 7} fontSize="11" fill="currentColor" opacity="0.72">
            Base 100
          </text>
        </g>
      ) : null}

      <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.top + PLOT.height} stroke="currentColor" strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />
      <line x1={PLOT.left} x2={PLOT.left + PLOT.width} y1={PLOT.top + PLOT.height} y2={PLOT.top + PLOT.height} stroke="currentColor" strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />

      {model.series.map((item) => {
        const style = seriesStyle(item.seriesIndex);
        return (
          <g key={item.seriesIndex} data-comparison-series={item.seriesIndex}>
            {item.points.length >= 2 ? (
              <polyline
                points={item.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={style.color}
                strokeWidth="3"
                strokeDasharray={style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {item.points.map((point) => (
              <ChartMarker
                key={point.ageDay}
                point={point}
                publicLabel={item.publicLabel}
                seriesIndex={item.seriesIndex}
                mode={mode}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function SeriesLegend({ input }: { input: LitterAgeComparisonChartInput }) {
  const ordered = [...input].sort((left, right) => left.seriesIndex - right.seriesIndex);
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Légende des portées comparées">
      {ordered.map((item) => {
        const style = seriesStyle(item.seriesIndex);
        return (
          <li key={item.seriesIndex} className="flex min-w-0 items-center gap-2 text-sm">
            {item.points.length > 0 ? (
              <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true" className="shrink-0">
                <line x1="1" x2="33" y1="7" y2="7" stroke={style.color} strokeWidth="3" strokeDasharray={style.dash} />
              </svg>
            ) : (
              <span aria-hidden="true" className="w-[34px] shrink-0 border-t border-dotted text-muted" />
            )}
            <span className="break-words">
              {item.publicLabel}{item.points.length === 0 ? " (non tracée)" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function LitterAgeComparisonChart({
  series,
}: {
  series: LitterAgeComparisonChartInput;
}) {
  const [mode, setMode] = useState<LitterAgeComparisonChartMode>("weight");
  const emptySeries = series.filter((item) => item.points.length === 0);
  const observedSeriesCount = series.length - emptySeries.length;

  return (
    <section className="min-w-0 rounded-2xl border bg-surface p-4 shadow-sm sm:p-5" aria-labelledby="litter-comparison-chart-title" data-testid="litter-age-comparison-chart">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="litter-comparison-chart-title" className="text-lg font-semibold">Évolution comparée</h3>
          <p className="mt-1 text-sm text-muted">Journées réellement observées selon l’âge de chaque portée.</p>
        </div>
        <div className="grid w-full grid-cols-2 rounded-xl border bg-background p-1 sm:w-fit" aria-label="Vue du graphique comparatif">
          <button type="button" aria-pressed={mode === "weight"} onClick={() => setMode("weight")} className="min-h-10 rounded-lg px-3 text-sm font-medium transition aria-pressed:bg-accent aria-pressed:text-white">
            Poids moyen
          </button>
          <button type="button" aria-pressed={mode === "relative"} onClick={() => setMode("relative")} className="min-h-10 rounded-lg px-3 text-sm font-medium transition aria-pressed:bg-accent aria-pressed:text-white">
            Indice base 100
          </button>
        </div>
      </div>

      <div className="mt-5 min-w-0">
        {observedSeriesCount > 0 ? (
          <ComparisonSvg input={series} mode={mode} />
        ) : (
          <p className="rounded-xl border bg-background px-4 py-5 text-sm text-muted" data-testid="litter-age-comparison-chart-empty">
            Aucune journée observée n’est disponible pour tracer la comparaison.
          </p>
        )}
      </div>

      <div className="mt-4">
        <SeriesLegend input={series} />
      </div>
      {emptySeries.length > 0 ? (
        <p className="mt-4 text-sm text-muted" data-testid="litter-age-comparison-unplotted-message">
          {emptySeries.length === 1 ? "1 portée sans point observé n’est pas tracée." : `${emptySeries.length} portées sans point observé ne sont pas tracées.`}
        </p>
      ) : null}
      {mode === "relative" ? (
        <p className="mt-3 text-xs leading-5 text-muted">Le repère 100 correspond uniquement à la base mathématique de naissance ; il ne constitue pas un seuil clinique.</p>
      ) : null}
    </section>
  );
}
