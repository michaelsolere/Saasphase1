import {
  litterWeightAnimalDetails,
  litterWeightAnimalName,
} from "./litter-weight-animal-identity";
import { buildSexOrdinals } from "./litter-weight-gain-summary";
import type {
  LitterWeightHistoryAnimal,
  LitterWeightHistoryMeasurement,
} from "./litter-weights-core";

export type LitterRoutineWeightDraft = {
  animalId: string;
  weightDraft: string;
};

export type LitterRoutineWeightEntry = {
  animalId: string;
  publicLabel: string;
  details: string;
  collarColor: string | null;
  latestWeightGrams: number | null;
  latestMeasuredAt: string | null;
  weightDraft: string;
  isValidWeightDraft: boolean;
};

export type LitterRoutineWeightEntryProgress = {
  validWeightCount: number;
  missingAnimalLabels: string[];
  invalidAnimalLabels: string[];
};

export function isValidRoutineWeightDraft(value: string) {
  if (value.trim() === "") return false;
  const grams = Number(value);
  return Number.isInteger(grams) && grams >= 1 && grams <= 100_000;
}

function isMeasurementLater(
  candidate: LitterWeightHistoryMeasurement,
  current: LitterWeightHistoryMeasurement,
) {
  const measuredAtComparison = candidate.measuredAt.localeCompare(current.measuredAt);
  if (measuredAtComparison !== 0) return measuredAtComparison > 0;
  return candidate.createdAt.localeCompare(current.createdAt) > 0;
}

export function buildLitterRoutineWeightEntries({
  animals,
  measurements,
  drafts = [],
}: {
  animals: readonly LitterWeightHistoryAnimal[];
  measurements: readonly LitterWeightHistoryMeasurement[];
  drafts?: readonly LitterRoutineWeightDraft[];
}): LitterRoutineWeightEntry[] {
  const latestByAnimalId = new Map<string, LitterWeightHistoryMeasurement>();
  for (const measurement of measurements) {
    const current = latestByAnimalId.get(measurement.animalId);
    if (!current || isMeasurementLater(measurement, current)) {
      latestByAnimalId.set(measurement.animalId, measurement);
    }
  }

  const draftByAnimalId = new Map(
    drafts.map(({ animalId, weightDraft }) => [animalId, weightDraft]),
  );

  const sexOrdinals = buildSexOrdinals(animals);

  return animals.map((animal) => {
    const latestMeasurement = latestByAnimalId.get(animal.id);
    const weightDraft = draftByAnimalId.get(animal.id) ?? "";
    return {
      animalId: animal.id,
      publicLabel: litterWeightAnimalName(animal, sexOrdinals.get(animal.id)),
      details: litterWeightAnimalDetails(animal),
      collarColor: animal.currentCollarColor || animal.initialCollarColor || null,
      latestWeightGrams:
        latestMeasurement?.grams ?? animal.birthWeightGrams ?? null,
      latestMeasuredAt: latestMeasurement?.measuredAt ?? null,
      weightDraft,
      isValidWeightDraft: isValidRoutineWeightDraft(weightDraft),
    };
  });
}

export function getLitterRoutineWeightEntryProgress(
  entries: readonly LitterRoutineWeightEntry[],
): LitterRoutineWeightEntryProgress {
  const validWeightCount = entries.filter(
    ({ isValidWeightDraft }) => isValidWeightDraft,
  ).length;
  const missingAnimalLabels = entries
    .filter(({ weightDraft }) => weightDraft.trim() === "")
    .map(({ publicLabel }) => publicLabel);
  const invalidAnimalLabels = entries
    .filter(
      ({ weightDraft, isValidWeightDraft }) =>
        weightDraft.trim() !== "" && !isValidWeightDraft,
    )
    .map(({ publicLabel }) => publicLabel);

  return {
    validWeightCount,
    missingAnimalLabels,
    invalidAnimalLabels,
  };
}

export function buildLitterWeightEntryHref(litterId: string) {
  const query = new URLSearchParams({
    litter: litterId,
    weightEntry: "1",
  });
  return `/litters/journal?${query.toString()}#litter-weights`;
}

export function removeWeightEntryFromUrl(value: string) {
  const url = new URL(value, "https://litter-weight-entry.invalid");
  url.searchParams.delete("weightEntry");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
