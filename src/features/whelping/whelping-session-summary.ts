import type {
  WhelpingBirthSex,
  WhelpingBirthViability,
  WhelpingEventType,
  WhelpingSessionStatus,
} from "./whelping-core";

export type WhelpingSessionSummaryInput = {
  session: {
    id: string;
    status: WhelpingSessionStatus;
    startedAt: string;
    endedAt: string | null;
  };
  events: ReadonlyArray<{
    sessionId: string;
    eventType: WhelpingEventType;
  }>;
  births: ReadonlyArray<{
    sessionId: string;
    cancelledAt: string | null;
    occurredAt: string;
    sex: WhelpingBirthSex;
    viability: WhelpingBirthViability;
    animal: { id: string } | null;
    birthWeightMeasurement: { grams: number } | null;
  }>;
};

export type WhelpingSessionClosureSummary =
  | { status: "unavailable" }
  | {
      status: "available";
      sessionDurationMinutes: number | null;
      birthSpanMinutes: number | null;
      activeBirthCount: number;
      firstBirthAt: string | null;
      lastBirthAt: string | null;
      sexCounts: Record<WhelpingBirthSex, number>;
      viabilityCounts: Record<WhelpingBirthViability, number>;
      recordedWeightCount: number;
      missingWeightCount: number;
      averageWeightGrams: number | null;
      minimumWeightGrams: number | null;
      maximumWeightGrams: number | null;
      interventionCount: number;
      vetCallCount: number;
      readyForWeighingCount: number;
    };

function timestampMilliseconds(value: string | null) {
  if (value === null) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function elapsedMinutes(startedAt: string | null, endedAt: string | null) {
  const start = timestampMilliseconds(startedAt);
  const end = timestampMilliseconds(endedAt);
  if (start === null || end === null || end < start) return null;
  return Math.floor((end - start) / 60_000);
}

export function buildWhelpingSessionSummary({
  session,
  events,
  births,
}: WhelpingSessionSummaryInput): WhelpingSessionClosureSummary {
  if (session.status !== "closed" || timestampMilliseconds(session.endedAt) === null) {
    return { status: "unavailable" };
  }

  const activeBirths = births.filter(
    (birth) => birth.sessionId === session.id && birth.cancelledAt === null,
  );
  const chronologicalBirths = activeBirths
    .map((birth) => ({ birth, occurredAtMs: timestampMilliseconds(birth.occurredAt) }))
    .filter(
      (entry): entry is { birth: (typeof activeBirths)[number]; occurredAtMs: number } =>
        entry.occurredAtMs !== null,
    )
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs);
  const firstBirth = chronologicalBirths[0] ?? null;
  const lastBirth = chronologicalBirths.at(-1) ?? null;
  const weights = activeBirths.flatMap((birth) =>
    birth.birthWeightMeasurement === null ? [] : [birth.birthWeightMeasurement.grams],
  );
  const recordedWeightCount = weights.length;
  const sessionEvents = events.filter((event) => event.sessionId === session.id);

  return {
    status: "available",
    sessionDurationMinutes: elapsedMinutes(session.startedAt, session.endedAt),
    birthSpanMinutes:
      firstBirth && lastBirth
        ? elapsedMinutes(firstBirth.birth.occurredAt, lastBirth.birth.occurredAt)
        : null,
    activeBirthCount: activeBirths.length,
    firstBirthAt: firstBirth?.birth.occurredAt ?? null,
    lastBirthAt: lastBirth?.birth.occurredAt ?? null,
    sexCounts: {
      female: activeBirths.filter((birth) => birth.sex === "female").length,
      male: activeBirths.filter((birth) => birth.sex === "male").length,
      unknown: activeBirths.filter((birth) => birth.sex === "unknown").length,
    },
    viabilityCounts: {
      alive: activeBirths.filter((birth) => birth.viability === "alive").length,
      stillborn: activeBirths.filter((birth) => birth.viability === "stillborn").length,
      unknown: activeBirths.filter((birth) => birth.viability === "unknown").length,
    },
    recordedWeightCount,
    missingWeightCount: activeBirths.length - recordedWeightCount,
    averageWeightGrams:
      recordedWeightCount === 0
        ? null
        : Math.round(weights.reduce((total, grams) => total + grams, 0) / recordedWeightCount),
    minimumWeightGrams: recordedWeightCount === 0 ? null : Math.min(...weights),
    maximumWeightGrams: recordedWeightCount === 0 ? null : Math.max(...weights),
    interventionCount: sessionEvents.filter((event) => event.eventType === "intervention").length,
    vetCallCount: sessionEvents.filter((event) => event.eventType === "vet_called").length,
    readyForWeighingCount: activeBirths.filter((birth) => birth.animal !== null).length,
  };
}

export function formatWhelpingDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  const wholeMinutes = Math.floor(minutes);
  if (wholeMinutes < 60) return `${wholeMinutes} min`;
  const hours = Math.floor(wholeMinutes / 60);
  if (hours < 24) {
    const remainingMinutes = wholeMinutes % 60;
    return remainingMinutes === 0
      ? `${hours} h`
      : `${hours} h ${remainingMinutes.toString().padStart(2, "0")}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days} j` : `${days} j ${remainingHours} h`;
}

export function formatWhelpingSexCounts(counts: Record<WhelpingBirthSex, number>) {
  return [
    counts.female > 0 ? `${counts.female} ${counts.female === 1 ? "femelle" : "femelles"}` : null,
    counts.male > 0 ? `${counts.male} ${counts.male === 1 ? "mâle" : "mâles"}` : null,
    counts.unknown > 0
      ? `${counts.unknown} ${counts.unknown === 1 ? "sexe à confirmer" : "sexes à confirmer"}`
      : null,
  ].filter((value): value is string => value !== null).join(" · ");
}

export function formatWhelpingViabilityCounts(
  counts: Record<WhelpingBirthViability, number>,
) {
  return [
    counts.alive > 0 ? `${counts.alive} ${counts.alive === 1 ? "vivant" : "vivants"}` : null,
    counts.stillborn > 0
      ? `${counts.stillborn} ${counts.stillborn === 1 ? "mort-né" : "mort-nés"}`
      : null,
    counts.unknown > 0
      ? `${counts.unknown} ${counts.unknown === 1 ? "état à confirmer" : "états à confirmer"}`
      : null,
  ].filter((value): value is string => value !== null).join(" · ");
}
