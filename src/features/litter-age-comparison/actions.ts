import "server-only";

import { listLitterAgeComparison } from "@/features/litter-weights/litter-weights";

import type {
  LitterComparisonActionState,
  LitterComparisonCatalogSnapshot,
} from "./types";

function invalidSelection(message = "Sélectionnez entre deux et cinq portées compatibles.") {
  return { status: "error" as const, message };
}

function parseSelection(formData: FormData) {
  const rawIndices = formData.getAll("litter_index");
  if (rawIndices.length < 2 || rawIndices.length > 5) return invalidSelection();

  const indices = rawIndices.map((value) => {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  });
  if (indices.some((value) => value === null)) return invalidSelection();

  const validIndices = indices as number[];
  if (new Set(validIndices).size !== validIndices.length) {
    return invalidSelection("La sélection contient une portée en double.");
  }

  return validIndices;
}

export async function compareSelectedLittersFromSnapshot(
  snapshot: LitterComparisonCatalogSnapshot,
  _previousState: LitterComparisonActionState,
  formData: FormData,
): Promise<LitterComparisonActionState> {
  const selectedIndices = parseSelection(formData);
  if (!Array.isArray(selectedIndices)) return selectedIndices;

  if (
    !snapshot ||
    !Array.isArray(snapshot.entries) ||
    snapshot.entries.some(
      (entry, position) =>
        entry.selectionIndex !== position || typeof entry.litterId !== "string",
    )
  ) {
    return invalidSelection("La sélection n’est plus disponible. Rechargez la page.");
  }

  const litterIds: string[] = [];
  for (const selectionIndex of selectedIndices) {
    const entry = snapshot.entries[selectionIndex];
    if (!entry || entry.selectionIndex !== selectionIndex) {
      return invalidSelection("La sélection n’est plus disponible. Rechargez la page.");
    }
    litterIds.push(entry.litterId);
  }

  try {
    const comparison = await listLitterAgeComparison({ litterIds });
    if (comparison.outcome === "error") {
      return { status: "error", message: comparison.error.message };
    }

    return {
      status: "success",
      result: {
        species: comparison.species,
        breed: comparison.breed,
        series: comparison.model.series,
      },
    };
  } catch (error) {
    console.error("litter_comparison_action_failed", error);
    return {
      status: "error",
      message: "La comparaison ne peut pas être chargée pour le moment.",
    };
  }
}
