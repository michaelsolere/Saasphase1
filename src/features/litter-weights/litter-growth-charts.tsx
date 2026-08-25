"use client";

import { useId, useState } from "react";

import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "./litter-weights-core";
import {
  buildAgeDayTicks,
  buildLitterGrowthModel,
  buildGrowthChartDomain,
  buildRelativeGrowthChartDomain,
  formatObservedInterval,
  projectGrowthPoint,
  type LitterGrowthIndicator,
  type LitterGrowthPoint,
  type LitterGrowthSeries,
  type LitterRelativeGrowthPoint,
  type LitterRelativeGrowthSeries,
} from "./litter-growth-chart-model";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 320;
const PLOT = { left: 68, top: 22, width: 670, height: 238 } as const;
const DAY_MS = 24 * 60 * 60 * 1_000;
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1_000;
const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1_000;
const FRENCH_DECIMAL = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

type GrowthChartSeries = {
  internalId: string;
  publicLabel: string;
  seriesIndex: number;
  seriesColor: string;
  collarColorLabel?: string | null;
  points: (LitterGrowthPoint | LitterRelativeGrowthPoint)[];
};

function formatAxisDate(timestamp: number, extent: number) {
  const options: Intl.DateTimeFormatOptions =
    extent < FORTY_EIGHT_HOURS
      ? { day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : extent < THIRTY_ONE_DAYS
        ? { day: "2-digit", month: "short" }
        : { dateStyle: "short" };
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(timestamp));
}

function formatAgeTick(timestamp: number, originTimestamp: number) {
  const ageDays = Math.round((timestamp - originTimestamp) / DAY_MS);
  return ageDays === 0 ? "J0" : `J${ageDays >= 0 ? "+" : ""}${ageDays}`;
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

function formatSignedGrams(value: number) {
  return `${value > 0 ? "+" : ""}${value} g`;
}

function formatIndex(value: number) {
  return FRENCH_DECIMAL.format(value);
}

function formatSignedPercentage(value: number) {
  return `${value > 0 ? "+" : ""}${FRENCH_DECIMAL.format(value)} %`;
}

function AnimalGrowthIndicator({
  indicator,
}: {
  indicator: LitterGrowthIndicator;
}) {
  const latest = indicator.latestMeasurement;
  const gain = indicator.gainSummary;

  return (
    <li className="min-w-0 rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full border border-black/10"
          style={{
            backgroundColor: indicator.collarColor ?? "#cbd5e1",
          }}
        />
        <h4 className="break-words font-semibold">{indicator.publicLabel}</h4>
        {indicator.gainBelowPriorThreeDayAverage ? (
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
            title="Prise de poids récente inférieure à la moyenne de ce chiot sur ses trois prises précédentes"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M6 1 L11 10 H1 Z"
                fill="#b45309"
              />
            </svg>
            Croissance à surveiller
          </span>
        ) : null}
      </div>
      {indicator.publicDetails ? (
        <p className="mt-1 break-words text-xs leading-5 text-muted">
          {indicator.publicDetails}
        </p>
      ) : null}
      {!latest ? (
        <p className="mt-3 text-sm text-muted">Aucune mesure réelle</p>
      ) : (
        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="font-medium">Dernier poids réel :</span>{" "}
            {latest.grams} g
          </p>
          <p className="text-muted">
            Dernière mesure : {formatMeasurementDate(latest.measuredAt)}
          </p>
          <p className="text-muted">
            {indicator.measurementCount} mesure
            {indicator.measurementCount > 1 ? "s" : ""} réelle
            {indicator.measurementCount > 1 ? "s" : ""}
          </p>
          {indicator.differenceGrams !== null &&
          indicator.intervalMilliseconds !== null ? (
            <>
              <p className="pt-2">
                <span className="font-medium">
                  Écart avec la mesure précédente :
                </span>{" "}
                {formatSignedGrams(indicator.differenceGrams)}
              </p>
              <p className="text-muted">
                Dernier intervalle observé :{" "}
                {formatObservedInterval(indicator.intervalMilliseconds)}
              </p>
            </>
          ) : (
            <p className="pt-2 text-muted">
              Aucun intervalle n’est encore observable.
            </p>
          )}
        </div>
      )}
      {indicator.relativeProgressPercentage === null ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">
            Progression depuis la naissance indisponible
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm">
          <span className="font-medium">Progression depuis la naissance :</span>{" "}
          {formatSignedPercentage(indicator.relativeProgressPercentage)}
        </p>
      )}
      {gain ? (
        <div className="mt-3 space-y-1 border-t pt-2 text-sm">
          {gain.gainSincePreviousGrams !== null ? (
            <p>
              <span className="font-medium">Gain dernière pesée :</span>{" "}
              {formatSignedGrams(gain.gainSincePreviousGrams)}
              {gain.latestGrams > 0 &&
              gain.previousGrams !== null &&
              gain.previousGrams > 0 ? (
                <span className="text-muted">
                  {" "}
                  ({formatSignedPercentage(
                    (gain.gainSincePreviousGrams / gain.previousGrams) * 100,
                  )}
                  )
                </span>
              ) : null}
            </p>
          ) : null}
          {gain.gainOver3dGrams !== null &&
          gain.gainOver3dPerDayGrams !== null ? (
            <p>
              <span className="font-medium">Prise de poids sur 3 jours :</span>{" "}
              {formatSignedGrams(gain.gainOver3dGrams)}
              {gain.reference3dGrams && gain.reference3dGrams > 0 ? (
                <span className="text-muted">
                  {" "}
                  ({formatSignedPercentage(
                    (gain.gainOver3dGrams / gain.reference3dGrams) * 100,
                  )}
                  , {formatSignedGrams(Math.round(gain.gainOver3dPerDayGrams))}/jour)
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted">
              Prise de poids sur 3 jours : indisponible (mesure de référence de
              plus d’un jour requise).
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Marker({
  point,
  x,
  y,
  color,
  animalLabel,
  seriesIndex,
  relative,
  onHover,
}: {
  point: LitterGrowthPoint | LitterRelativeGrowthPoint;
  x: number;
  y: number;
  color: string;
  animalLabel: string;
  seriesIndex: number;
  relative: boolean;
  onHover: (info: MarkerHoverInfo | null) => void;
}) {
  const identity = animalLabel;
  const title = relative
    ? `${identity} · Indice ${formatIndex(
        (point as LitterRelativeGrowthPoint).index,
      )} · ${formatObservedInterval(
        (point as LitterRelativeGrowthPoint).elapsedMilliseconds,
      )} depuis la naissance · ${measurementTypeLabel(point.type)}`
    : `${identity} · ${point.grams} g · ${formatMeasurementDate(
        point.measuredAt,
      )} · ${measurementTypeLabel(point.type)}`;

  const hoverInfo: MarkerHoverInfo = { title, x, y, color };
  const show = () => onHover(hoverInfo);
  const hide = () => onHover(null);

  if (point.type === "birth") {
    return (
      <g>
        <circle
          cx={x}
          cy={y}
          r="9"
          fill="transparent"
          data-growth-hover-target="true"
          aria-label={title}
          onMouseEnter={show}
          onMouseLeave={hide}
          onClick={show}
        />
        <circle
          cx={x}
          cy={y}
          r="4"
          fill="white"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          data-series-index={seriesIndex}
          data-measurement-type="birth"
          pointerEvents="none"
        />
      </g>
    );
  }

  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="2.4"
        fill={color}
        stroke="none"
        vectorEffect="non-scaling-stroke"
        data-series-index={seriesIndex}
        data-measurement-type="routine"
        pointerEvents="none"
      />
      {/* Zone de survol transparente : garde l'infobulle avec un petit point. */}
      <circle
        cx={x}
        cy={y}
        r="8"
        fill="transparent"
        data-growth-hover-target="true"
        aria-label={title}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={show}
      />
    </g>
  );
}

type MarkerHoverInfo = { title: string; x: number; y: number; color: string };

function ChartTooltip({ info }: { info: MarkerHoverInfo | null }) {
  if (!info) return null;
  const flipLeft = info.x > CHART_WIDTH * 0.62;
  const flipTop = info.y < CHART_HEIGHT * 0.18;
  return (
    <g pointerEvents="none">
      <rect
        x={
          flipLeft
            ? Math.max(4, info.x - TOOLTIP_WIDTH - 10)
            : Math.min(CHART_WIDTH - TOOLTIP_WIDTH - 4, info.x + 10)
        }
        y={flipTop ? info.y + 12 : Math.max(4, info.y - 34)}
        width={TOOLTIP_WIDTH}
        height={26}
        rx="6"
        fill="#111827"
        fillOpacity="0.94"
      />
      <text
        data-growth-tooltip="true"
        x={
          flipLeft
            ? Math.max(4, info.x - TOOLTIP_WIDTH - 10) + 8
            : Math.min(CHART_WIDTH - TOOLTIP_WIDTH - 4, info.x + 10) + 8
        }
        y={flipTop ? info.y + 29 : Math.max(4, info.y - 34) + 17}
        fontSize="11.5"
        fill="#f9fafb"
      >
        {info.title.length > 58
          ? `${info.title.slice(0, 57)}…`
          : info.title}
      </text>
    </g>
  );
}

const TOOLTIP_WIDTH = 330;

function GrowthSvg({
  series,
  accessibleLabel,
  mode = "absolute",
}: {
  series: GrowthChartSeries[];
  accessibleLabel: string;
  mode?: "absolute" | "relative";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [hoverInfo, setHoverInfo] = useState<MarkerHoverInfo | null>(null);
  const points = series.flatMap((item) => item.points);
  const relative = mode === "relative";
  const domain = relative
    ? buildRelativeGrowthChartDomain(points as LitterRelativeGrowthPoint[])
    : buildGrowthChartDomain(points);
  if (!domain) return null;

  const firstTimestamp = Math.min(...points.map((point) => point.timestamp));
  const lastTimestamp = Math.max(...points.map((point) => point.timestamp));
  const extent = lastTimestamp - firstTimestamp;
  // Origine de l'âge : première mesure de naissance (absolute) ou zéro (relative).
  const ageOrigin = relative
    ? 0
    : Math.min(
        ...series.flatMap((item) =>
          item.points
            .filter((point) => point.type === "birth")
            .map((point) => point.timestamp),
        ),
      );
  const ageDayTicks =
    extent >= DAY_MS && Number.isFinite(ageOrigin)
      ? buildAgeDayTicks(domain, ageOrigin)
      : [];
  const chartCoordinates = (
    point: LitterGrowthPoint | LitterRelativeGrowthPoint,
  ) =>
    relative
      ? {
          timestamp: (point as LitterRelativeGrowthPoint).elapsedMilliseconds,
          grams: (point as LitterRelativeGrowthPoint).index,
        }
      : point;

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
        {relative
          ? "Indice base 100 selon le temps écoulé depuis la mesure réelle de naissance de chaque animal. Les anneaux représentent les mesures de naissance et les points pleins les pesées de routine."
          : "Poids réels en grammes selon l’âge en jours depuis la naissance. Les anneaux représentent les mesures de naissance et les points pleins les pesées de routine."}
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
              {relative ? formatIndex(grams) : `${Math.round(grams)} g`}
            </text>
          </g>
        );
      })}

      {(ageDayTicks.length > 0 ? ageDayTicks : domain.timestampTicks).map(
        (timestamp, index, allTicks) => {
          const x = projectGrowthPoint(
            { timestamp, grams: domain.minGrams },
            domain,
            PLOT,
          ).x;
          const useAgeLabels = ageDayTicks.length > 0;
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
                    : index === allTicks.length - 1
                      ? "end"
                      : "middle"
                }
                fontSize="12"
                fill="currentColor"
                opacity="0.72"
              >
                {relative
                  ? formatObservedInterval(timestamp)
                  : useAgeLabels
                    ? formatAgeTick(timestamp, ageOrigin)
                    : formatAxisDate(timestamp, extent)}
              </text>
            </g>
          );
        },
      )}

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
        const projected = item.points.map((point) => ({
          ...projectGrowthPoint(chartCoordinates(point), domain, PLOT),
          point,
        }));
        return (
          <g key={item.internalId}>
            {projected.length >= 2 ? (
              <polyline
                points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="none"
                stroke={item.seriesColor}
                strokeWidth="2.4"
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
                color={item.seriesColor}
                animalLabel={item.publicLabel}
                seriesIndex={item.seriesIndex}
                relative={relative}
                onHover={setHoverInfo}
              />
            ))}
          </g>
        );
      })}

      <ChartTooltip info={hoverInfo} />
    </svg>
  );
}

function MarkerKey() {
  return (
    <p className="text-xs leading-5 text-muted">
      <span className="font-medium text-foreground">Types de points :</span>{" "}
      naissance (anneau) · routine (point plein)
    </p>
  );
}

function SeriesLegend({
  series,
  ariaLabel,
  hiddenIds,
  onToggle,
}: {
  series: GrowthChartSeries[];
  ariaLabel: string;
  /** Identifiants internes des séries actuellement masquées. */
  hiddenIds?: ReadonlySet<string>;
  /** Présence de ce callback = légende cliquable (masquer/afficher une courbe). */
  onToggle?: (internalId: string) => void;
}) {
  const interactive = Boolean(onToggle);
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-3" aria-label={ariaLabel}>
      {series.map((item) => {
        const hidden = hiddenIds?.has(item.internalId) ?? false;
        const content = (
          <>
            <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">
              <line
                x1="1"
                x2="29"
                y1="6"
                y2="6"
                stroke={item.seriesColor}
                strokeWidth="2.4"
              />
              <circle cx="15" cy="6" r="3" fill={item.seriesColor} />
            </svg>
            <span className="break-words">{item.publicLabel}</span>
          </>
        );
        if (!interactive) {
          return (
            <li
              key={item.internalId}
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              {content}
            </li>
          );
        }
        return (
          <li key={item.internalId} className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => onToggle?.(item.internalId)}
              aria-pressed={!hidden}
              title={
                hidden
                  ? `Afficher la courbe de ${item.publicLabel}`
                  : `Masquer la courbe de ${item.publicLabel}`
              }
              className={`flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 text-sm transition hover:bg-accent/5 ${
                hidden ? "opacity-40" : ""
              }`}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EntireLitterView({
  series,
  animalsWithoutMeasurements,
}: {
  series: LitterGrowthSeries[];
  animalsWithoutMeasurements: number;
}) {
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  function toggleSeries(internalId: string) {
    setHiddenSeriesIds((current) => {
      const next = new Set(current);
      if (next.has(internalId)) {
        next.delete(internalId);
      } else {
        next.add(internalId);
      }
      return next;
    });
  }
  const visibleSeries =
    hiddenSeriesIds.size === 0
      ? series
      : series.filter((item) => !hiddenSeriesIds.has(item.internalId));

  return (
    <div className="space-y-4" data-testid="entire-litter-growth-view">
      <GrowthSvg
        series={visibleSeries}
        accessibleLabel={`Courbes de croissance de la portée, ${series.length} séries animales`}
      />
      <MarkerKey />
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <SeriesLegend
          series={series}
          ariaLabel="Chiots affichés — cliquer pour masquer ou afficher une courbe"
          hiddenIds={hiddenSeriesIds}
          onToggle={toggleSeries}
        />
        {series.length > 1 ? (
          <button
            type="button"
            onClick={() =>
              setHiddenSeriesIds((current) =>
                current.size === 0
                  ? new Set(series.map((item) => item.internalId))
                  : new Set(),
              )
            }
            className="shrink-0 text-xs font-semibold text-accent hover:underline"
          >
            {hiddenSeriesIds.size === 0
              ? "Tout désélectionner"
              : `Tout sélectionner (${series.length - hiddenSeriesIds.size}/${series.length})`}
          </button>
        ) : null}
      </div>
      {animalsWithoutMeasurements > 0 ? (
        <p className="text-sm text-muted">
          {animalsWithoutMeasurements}{" "}
          {animalsWithoutMeasurements > 1 ? "animaux" : "animal"} sans mesure
          réelle non tracé{animalsWithoutMeasurements > 1 ? "s" : ""}.
        </p>
      ) : null}
    </div>
  );
}

function RelativeGrowthView({
  series,
  ineligibleAnimalCount,
}: {
  series: LitterRelativeGrowthSeries[];
  ineligibleAnimalCount: number;
}) {
  return (
    <div className="space-y-4" data-testid="relative-growth-view">
      <p className="text-sm leading-6 text-muted">
        Indice 100 = poids de naissance réel. Les courbes comparent la progression
        proportionnelle des animaux, indépendamment de leur poids de départ.
      </p>
      {series.length > 0 ? (
        <>
          <GrowthSvg
            series={series}
            accessibleLabel={`Courbes de progression relative de la portée, ${series.length} séries animales éligibles`}
            mode="relative"
          />
          <MarkerKey />
          <SeriesLegend
            series={series}
            ariaLabel="Légende de la progression relative"
          />
        </>
      ) : (
        <p className="rounded-xl border bg-secondary px-3 py-3 text-sm text-muted">
          Aucun animal ne dispose d’une mesure réelle de naissance exploitable pour
          tracer une progression relative.
        </p>
      )}
      {ineligibleAnimalCount > 0 ? (
        <p className="text-sm text-muted">
          {ineligibleAnimalCount}{" "}
          {ineligibleAnimalCount > 1 ? "animaux" : "animal"} sans mesure réelle
          de naissance exploitable non tracé
          {ineligibleAnimalCount > 1 ? "s" : ""}.
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
  belowTrendDeviationPercent = 0,
}: {
  animals: LitterWeightHistoryAnimal[];
  measurements: LitterWeightHistoryMeasurement[];
  belowTrendDeviationPercent?: number;
}) {
  const [view, setView] = useState<"litter" | "animal" | "relative">("litter");
  const { indicators, series, relativeSeries } = buildLitterGrowthModel(
    animals,
    measurements,
    belowTrendDeviationPercent,
  );
  const animalsWithoutMeasurements = animals.length - series.length;
  const ineligibleRelativeAnimalCount = animals.length - relativeSeries.length;

  return (
    <section
      className="mt-7 min-w-0 border-t pt-6"
      aria-labelledby="growth-indicators-title"
    >
      <h3 id="growth-indicators-title" className="text-base font-semibold">
        Repères par animal
      </h3>
      <p className="mt-2 text-xs text-muted">
        Dates affichées dans le fuseau de cet appareil.
      </p>
      <ul
        className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Repères de poids par animal"
      >
        {indicators.map((indicator) => (
          <AnimalGrowthIndicator
            key={indicator.internalId}
            indicator={indicator}
          />
        ))}
      </ul>

      <div className="mt-7 border-t pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 id="growth-curves-title" className="text-base font-semibold">
            Courbes de croissance
          </h3>
          <div
            className="grid w-full grid-cols-1 rounded-xl border bg-background p-1 sm:w-fit sm:grid-cols-3"
            aria-label="Vue des courbes"
          >
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
            <button
              type="button"
              aria-pressed={view === "relative"}
              onClick={() => setView("relative")}
              className="min-h-10 rounded-lg px-3 text-sm font-medium transition aria-pressed:bg-accent aria-pressed:text-white"
            >
              Progression relative
            </button>
          </div>
        </div>

        <div className="mt-5 min-w-0">
          {view === "relative" ? (
            <RelativeGrowthView
              series={relativeSeries}
              ineligibleAnimalCount={ineligibleRelativeAnimalCount}
            />
          ) : series.length === 0 ? (
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
      </div>
    </section>
  );
}
