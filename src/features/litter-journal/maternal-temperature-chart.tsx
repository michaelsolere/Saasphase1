import { useId } from "react";

import {
  projectMaternalTemperaturePoint,
  type MaternalTemperatureChartModel,
  type MaternalTemperatureChartPoint,
} from "./maternal-temperature-chart-model";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 320;
const PLOT = { left: 70, top: 24, width: 666, height: 238 } as const;
const SHORT_TIME_EXTENT = 48 * 60 * 60 * 1_000;
const MONTH_EXTENT = 31 * 24 * 60 * 60 * 1_000;

const severityLabels = {
  routine: "Suivi courant",
  watch: "À surveiller",
  concern: "Préoccupation",
  urgent: "Urgent",
} as const;

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(value);
}

function formatDateTime(point: MaternalTemperatureChartPoint) {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: point.timezoneName,
  };
  try {
    return new Intl.DateTimeFormat("fr-FR", options).format(point.timestamp);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      ...options,
      timeZone: "UTC",
    }).format(point.timestamp);
  }
}

function formatAxisDate(point: MaternalTemperatureChartPoint, extent: number) {
  const options: Intl.DateTimeFormatOptions =
    extent < SHORT_TIME_EXTENT
      ? { day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : extent < MONTH_EXTENT
        ? { day: "2-digit", month: "short", hour: "2-digit" }
        : { dateStyle: "short", timeStyle: "short" };
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      ...options,
      timeZone: point.timezoneName,
    }).format(point.timestamp);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      ...options,
      timeZone: "UTC",
    }).format(point.timestamp);
  }
}

function pointTitle(point: MaternalTemperatureChartPoint) {
  const unit = point.originalUnit === "celsius" ? "°C" : "°F";
  const normalized =
    point.originalUnit === "fahrenheit"
      ? ` · ${formatNumber(point.celsius)} °C après harmonisation graphique`
      : "";
  const note = point.note ? ` · Note : ${point.note}` : "";
  return `${formatDateTime(point)} · ${formatNumber(point.originalValue, 3)} ${unit}${normalized} · Appréciation saisie : ${severityLabels[point.severity]}${note}`;
}

export function MaternalTemperatureChart({
  model,
}: {
  model: MaternalTemperatureChartModel;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const domain = model.domain;
  if (model.status === "empty" || !domain) return null;

  const projected = model.points.map((point) => ({
    point,
    ...projectMaternalTemperaturePoint(point, domain, PLOT),
  }));
  const extent =
    model.points.at(-1)!.timestamp - model.points[0].timestamp;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      className="block h-auto max-w-full"
      data-testid="maternal-temperature-chart"
    >
      <title id={titleId}>
        Courbe chronologique de température maternelle, {model.measurementCount}{" "}
        mesure{model.measurementCount > 1 ? "s" : ""} saisie
        {model.measurementCount > 1 ? "s" : ""}
      </title>
      <desc id={descriptionId}>
        Seules les mesures saisies sont représentées. Les segments droits relient
        les observations successives sans interprétation. Les valeurs Fahrenheit
        sont seulement harmonisées en Celsius pour le graphique.
      </desc>

      {domain.celsiusTicks.map((celsius) => {
        const y = projectMaternalTemperaturePoint(
          { timestamp: domain.minTimestamp, celsius },
          domain,
          PLOT,
        ).y;
        return (
          <g key={`temperature-${celsius}`}>
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
              {formatNumber(celsius, 1)} °C
            </text>
          </g>
        );
      })}

      {domain.timestampTicks.map((timestamp, index) => {
        const point =
          model.points.find((candidate) => candidate.timestamp === timestamp) ??
          model.points[0];
        const x = projectMaternalTemperaturePoint(
          { timestamp, celsius: domain.minCelsius },
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
              {formatAxisDate(point, extent)}
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

      {projected.length > 1 ? (
        <polyline
          points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="#0f766e"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          data-temperature-segments={projected.length - 1}
        />
      ) : null}

      {projected.map(({ point, x, y }) => (
        <circle
          key={point.publicIndex}
          cx={x}
          cy={y}
          r="6"
          fill="white"
          stroke="#0f766e"
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
          data-testid="maternal-temperature-point"
          data-temperature-point-index={point.publicIndex}
        >
          <title>{pointTitle(point)}</title>
        </circle>
      ))}
    </svg>
  );
}
