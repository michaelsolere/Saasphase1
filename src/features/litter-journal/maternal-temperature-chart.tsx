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

function dropMarkerTitle(model: MaternalTemperatureChartModel) {
  const marker = model.dropMarker;
  if (marker.status === "reached") {
    return [
      "Repère personnel de baisse atteint",
      `Référence récente : ${formatNumber(marker.referenceCelsius!)} °C`,
      `Baisse observée : ${formatNumber(marker.observedDropCelsius!)} °C`,
      `Seuil configuré : ${formatNumber(marker.thresholdCelsius!)} °C`,
    ].join("\n");
  }
  if (marker.status === "not_reached") {
    return "Repère personnel de baisse non atteint.";
  }
  if (marker.status === "insufficient_history") {
    return "Repère personnel en attente d’un historique complet.";
  }
  if (marker.status === "policy_unavailable") {
    return "Paramètre du repère momentanément indisponible.";
  }
  return "Repère personnel de baisse désactivé.";
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
  const markerReached = model.dropMarker.status === "reached";
  const lastProjected = projected.at(-1)!;
  const previousProjected = projected.at(-2) ?? null;
  const chartTitle = `Courbe chronologique de température maternelle, ${model.measurementCount} mesure${model.measurementCount > 1 ? "s" : ""} saisie${model.measurementCount > 1 ? "s" : ""}`;
  const chartDescription = `Seules les mesures saisies sont représentées. Les segments droits relient les observations successives sans interprétation. Les valeurs Fahrenheit sont seulement harmonisées en Celsius pour le graphique. ${dropMarkerTitle(model)}`;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      width="100%"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
      className="block h-auto max-w-full"
      data-testid="maternal-temperature-chart"
    >
      <title id={titleId}>{chartTitle}</title>
      <desc id={descriptionId}>{chartDescription}</desc>

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

      {markerReached && previousProjected ? (
        <line
          x1={previousProjected.x}
          y1={previousProjected.y}
          x2={lastProjected.x}
          y2={lastProjected.y}
          fill="none"
          stroke="#9f1239"
          strokeWidth="6"
          strokeDasharray="8 5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          data-testid="maternal-temperature-drop-segment"
          data-temperature-segment="latest"
          aria-label="Dernier segment : repère personnel de baisse atteint"
        />
      ) : null}

      {projected.map(({ point, x, y }, index) => {
        const isReachedLatest = markerReached && index === projected.length - 1;
        const accessiblePointTitle = `${pointTitle(point)}${
          index === projected.length - 1 ? `\n${dropMarkerTitle(model)}` : ""
        }`;
        return (
          <g key={point.publicIndex}>
            {isReachedLatest ? (
              <circle
                cx={x}
                cy={y}
                r="11"
                fill="none"
                stroke="#9f1239"
                strokeWidth="3"
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
                data-testid="maternal-temperature-drop-point-outline"
                aria-hidden="true"
              />
            ) : null}
            <circle
              cx={x}
              cy={y}
              r="6"
              fill="white"
              stroke={isReachedLatest ? "#9f1239" : "#0f766e"}
              strokeWidth={isReachedLatest ? "5" : "4"}
              vectorEffect="non-scaling-stroke"
              data-testid="maternal-temperature-point"
              data-temperature-point-index={point.publicIndex}
              data-temperature-drop-marker={isReachedLatest ? "reached" : undefined}
            >
              <title>{accessiblePointTitle}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
