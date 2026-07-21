import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
  LitterWeightHistorySession,
} from "./litter-weights-core";
import { litterWeightAnimalName } from "./litter-weight-animal-identity";

export type LitterGrowthValueMode = "weight" | "gain" | "index";

export type LitterGrowthTableCell = {
  measurementId: string | null;
  weightGrams: number | null;
  gainGrams: number | null;
  birthIndex: number | null;
};

export type LitterGrowthTableAnimal = {
  internalId: string;
  publicLabel: string;
  sex: string;
  collarColor: string | null;
  birth: LitterGrowthTableCell;
  latestWeightGrams: number | null;
  evolutionFromBirthGrams: number | null;
};

export type LitterGrowthTableRow = {
  internalId: string;
  kind: "birth" | "routine";
  label: string;
  ageDay: number | null;
  measuredAt: string;
  cellsByAnimalId: Map<string, LitterGrowthTableCell>;
  observedAnimalCount: number;
  averageGrams: number | null;
};

export type LitterGrowthTableModel = {
  animals: LitterGrowthTableAnimal[];
  birthRow: LitterGrowthTableRow;
  routineRows: LitterGrowthTableRow[];
};

const EMPTY_CELL: LitterGrowthTableCell = {
  measurementId: null,
  weightGrams: null,
  gainGrams: null,
  birthIndex: null,
};

function calendarDayNumber(sqlDate: string) {
  const [year, month, day] = sqlDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function dateInTimezone(instant: string, timezoneName: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezoneName,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return instant.slice(0, 10);
  }
}

function compareMeasurements(
  left: LitterWeightHistoryMeasurement,
  right: LitterWeightHistoryMeasurement,
) {
  const time = Date.parse(left.measuredAt) - Date.parse(right.measuredAt);
  if (time !== 0) return time;
  if (left.type !== right.type) return left.type === "birth" ? -1 : 1;
  return left.id.localeCompare(right.id);
}

function cellFor(
  measurement: LitterWeightHistoryMeasurement | null,
  previous: LitterWeightHistoryMeasurement | null,
  birth: LitterWeightHistoryMeasurement | null,
): LitterGrowthTableCell {
  if (!measurement) return EMPTY_CELL;
  return {
    measurementId: measurement.id,
    weightGrams: measurement.grams,
    gainGrams: previous ? measurement.grams - previous.grams : null,
    birthIndex:
      birth && birth.grams > 0
        ? measurement.type === "birth"
          ? 100
          : (measurement.grams / birth.grams) * 100
        : null,
  };
}

export function buildLitterGrowthTableModel(
  animals: readonly LitterWeightHistoryAnimal[],
  sessions: readonly LitterWeightHistorySession[],
  measurements: readonly LitterWeightHistoryMeasurement[],
): LitterGrowthTableModel {
  const orderedSessions = [...sessions].sort((left, right) => {
    const time = Date.parse(left.measuredAt) - Date.parse(right.measuredAt);
    return time !== 0 ? time : left.id.localeCompare(right.id);
  });
  const sourceByAnimal = new Map<string, LitterWeightHistoryMeasurement[]>();
  for (const measurement of measurements) {
    if (measurement.type !== "birth" && measurement.type !== "routine") continue;
    const list = sourceByAnimal.get(measurement.animalId) ?? [];
    list.push(measurement);
    sourceByAnimal.set(measurement.animalId, list);
  }
  for (const list of sourceByAnimal.values()) list.sort(compareMeasurements);

  const birthByAnimal = new Map<string, LitterWeightHistoryMeasurement | null>();
  const previousByMeasurement = new Map<string, LitterWeightHistoryMeasurement | null>();
  for (const animal of animals) {
    const source = sourceByAnimal.get(animal.id) ?? [];
    const births = source.filter((item) => item.type === "birth" && item.grams > 0);
    birthByAnimal.set(animal.id, births.length === 1 ? births[0] : null);
    source.forEach((item, index) => previousByMeasurement.set(item.id, source[index - 1] ?? null));
  }

  const tableAnimals = animals.map((animal): LitterGrowthTableAnimal => {
    const source = sourceByAnimal.get(animal.id) ?? [];
    const birth = birthByAnimal.get(animal.id) ?? null;
    const latest = source.at(-1) ?? null;
    return {
      internalId: animal.id,
      publicLabel: litterWeightAnimalName(animal),
      sex: animal.sex,
      collarColor: animal.currentCollarColor || animal.initialCollarColor,
      birth: cellFor(birth, null, birth),
      latestWeightGrams: latest?.grams ?? null,
      evolutionFromBirthGrams:
        latest && birth ? latest.grams - birth.grams : null,
    };
  });

  const birthCells = new Map(
    tableAnimals.map((animal) => [animal.internalId, animal.birth]),
  );
  const birthWeights = tableAnimals.flatMap((animal) =>
    animal.birth.weightGrams === null ? [] : [animal.birth.weightGrams],
  );
  const birthInstants = [...birthByAnimal.values()].flatMap((item) => item ? [item.measuredAt] : []);
  const litterBirthDate = animals.find((animal) => animal.birthDate)?.birthDate ??
    birthInstants.sort()[0]?.slice(0, 10) ?? null;
  const birthRow: LitterGrowthTableRow = {
    internalId: "birth",
    kind: "birth",
    label: "Naissance",
    ageDay: null,
    measuredAt: birthInstants.sort()[0] ?? "",
    cellsByAnimalId: birthCells,
    observedAnimalCount: birthWeights.length,
    averageGrams: birthWeights.length
      ? birthWeights.reduce((sum, value) => sum + value, 0) / birthWeights.length
      : null,
  };

  const routineRows = orderedSessions.map((session): LitterGrowthTableRow => {
    const cells = new Map<string, LitterGrowthTableCell>();
    const weights: number[] = [];
    for (const animal of animals) {
      const candidates = (sourceByAnimal.get(animal.id) ?? []).filter(
        (item) => item.type === "routine" && item.sessionId === session.id,
      );
      const measurement = candidates.at(-1) ?? null;
      const cell = cellFor(
        measurement,
        measurement ? previousByMeasurement.get(measurement.id) ?? null : null,
        birthByAnimal.get(animal.id) ?? null,
      );
      cells.set(animal.id, cell);
      if (cell.weightGrams !== null) weights.push(cell.weightGrams);
    }
    const sessionDate = dateInTimezone(session.measuredAt, session.timezoneName);
    const ageDay = litterBirthDate
      ? calendarDayNumber(sessionDate) - calendarDayNumber(litterBirthDate)
      : null;
    return {
      internalId: session.id,
      kind: "routine",
      label: ageDay === null ? "Routine" : `J${ageDay}${ageDay === 0 ? " routine" : ""}`,
      ageDay,
      measuredAt: session.measuredAt,
      cellsByAnimalId: cells,
      observedAnimalCount: weights.length,
      averageGrams: weights.length
        ? weights.reduce((sum, value) => sum + value, 0) / weights.length
        : null,
    };
  });

  return { animals: tableAnimals, birthRow, routineRows };
}

export function getLitterGrowthCellValue(
  cell: LitterGrowthTableCell,
  mode: LitterGrowthValueMode,
) {
  if (mode === "gain") return cell.gainGrams;
  if (mode === "index") return cell.birthIndex;
  return cell.weightGrams;
}
