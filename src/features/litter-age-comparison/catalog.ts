import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import type {
  LitterComparisonCatalogItem,
  LitterComparisonCatalogSnapshot,
} from "./types";

type Supabase = SupabaseClient<Database>;

type LitterCatalogRow = Pick<
  Database["public"]["Tables"]["litters"]["Row"],
  | "id"
  | "organization_id"
  | "name"
  | "species"
  | "breed"
  | "actual_birth_date"
  | "expected_birth_date"
  | "status"
  | "created_at"
>;

export type LitterComparisonCatalog = {
  publicItems: LitterComparisonCatalogItem[];
  privateSnapshot: LitterComparisonCatalogSnapshot;
};

function normalizedTaxonomy(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function compatibilityKey(row: LitterCatalogRow) {
  return [
    row.organization_id,
    normalizedTaxonomy(row.species),
    normalizedTaxonomy(row.breed),
  ].join("\u0000");
}

function publicGroupLabel(position: number) {
  return `Groupe de comparaison ${position + 1}`;
}

function publicLabel(row: LitterCatalogRow, position: number) {
  return row.name.trim() || `Portée ${position + 1}`;
}

export async function loadLitterComparisonCatalog(
  suppliedClient?: Supabase,
): Promise<LitterComparisonCatalog> {
  const supabase = suppliedClient ?? (await createClient());
  const result = await supabase
    .from("litters")
    .select(
      "id, organization_id, name, species, breed, actual_birth_date, expected_birth_date, status, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (result.error) {
    console.error("litter_comparison_catalog_read_failed", result.error);
    throw new Error("Unable to load the litter comparison catalog.");
  }

  const rows = ((result.data ?? []) as LitterCatalogRow[]).filter(
    (row) =>
      normalizedTaxonomy(row.species) !== "" &&
      normalizedTaxonomy(row.breed) !== "",
  );
  const groupLabels = new Map<string, string>();

  const publicItems = rows.map((row, selectionIndex) => {
    const groupKey = compatibilityKey(row);
    let compatibilityGroup = groupLabels.get(groupKey);
    if (!compatibilityGroup) {
      compatibilityGroup = publicGroupLabel(groupLabels.size);
      groupLabels.set(groupKey, compatibilityGroup);
    }

    return {
      selectionIndex,
      publicLabel: publicLabel(row, selectionIndex),
      species: row.species.trim(),
      breed: row.breed.trim(),
      birthDate: row.actual_birth_date ?? row.expected_birth_date,
      birthDateKind: row.actual_birth_date
        ? ("actual" as const)
        : row.expected_birth_date
          ? ("expected" as const)
          : null,
      status: row.status,
      compatibilityGroup,
    };
  });

  return {
    publicItems,
    privateSnapshot: {
      entries: rows.map((row, selectionIndex) => ({
        selectionIndex,
        litterId: row.id,
      })),
    },
  };
}
