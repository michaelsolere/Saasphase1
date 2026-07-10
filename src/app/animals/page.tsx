import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AnimalFilters,
  type AnimalFilterState,
  type AnimalLitterFilterOption,
  type AnimalOriginFilter,
  type AnimalQuickFilter,
  type AnimalSexFilter,
} from "@/features/animals/animal-filters";
import { AnimalList } from "@/features/animals/animal-list";
import type { AnimalListItem, DBAnimal } from "@/features/animals/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LitterLookup = {
  id: string | null;
  name: string | null;
  litter_group_name: string | null;
};

type ParentLookup = Pick<DBAnimal, "id" | "call_name">;

const quickFilters = new Set<AnimalQuickFilter>([
  "born",
  "available",
  "reserved",
  "kept",
  "adopted",
  "home_breeders",
  "external_breeders",
  "retired",
]);

const sexFilters = new Set<AnimalSexFilter>(["male", "female", "unknown"]);
const originFilters = new Set<AnimalOriginFilter>([
  "produced",
  "external",
  "home",
]);

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les animaux.</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

function uniqueIds(values: Array<string | null>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseAnimalFilters(params: Record<string, string | string[] | undefined>) {
  const filter = firstParam(params.filter);
  const sex = firstParam(params.sex);
  const origin = firstParam(params.origin);
  const litterId = firstParam(params.litter_id);

  return {
    filter:
      filter && quickFilters.has(filter as AnimalQuickFilter)
        ? (filter as AnimalQuickFilter)
        : null,
    sex:
      sex && sexFilters.has(sex as AnimalSexFilter)
        ? (sex as AnimalSexFilter)
        : null,
    origin:
      origin && originFilters.has(origin as AnimalOriginFilter)
        ? (origin as AnimalOriginFilter)
        : null,
    litter_id: litterId || null,
  } satisfies AnimalFilterState;
}

function isExternalAnimal(animal: Pick<AnimalListItem, "is_external" | "ownership_status">) {
  return (
    animal.is_external ||
    animal.ownership_status === "external_stud" ||
    animal.ownership_status === "external_female"
  );
}

function isHomeAnimal(animal: Pick<AnimalListItem, "is_external" | "ownership_status">) {
  return (
    !isExternalAnimal(animal) &&
    (animal.ownership_status === "owned" ||
      animal.ownership_status === "produced")
  );
}

function matchesQuickFilter(animal: AnimalListItem, filter: AnimalQuickFilter) {
  switch (filter) {
    case "born":
      return (
        animal.status === "born" &&
        animal.ownership_status === "produced" &&
        Boolean(animal.litter_id)
      );
    case "available":
      return animal.status === "available";
    case "reserved":
      return animal.status === "reserved";
    case "kept":
      return animal.status === "kept";
    case "adopted":
      return (
        animal.status === "adopted" ||
        animal.ownership_status === "adopted_out"
      );
    case "home_breeders":
      return animal.is_breeder && isHomeAnimal(animal);
    case "external_breeders":
      return animal.is_breeder && isExternalAnimal(animal);
    case "retired":
      return animal.status === "retired" || animal.is_retired;
  }
}

function matchesOriginFilter(animal: AnimalListItem, origin: AnimalOriginFilter) {
  switch (origin) {
    case "produced":
      return animal.ownership_status === "produced";
    case "external":
      return isExternalAnimal(animal);
    case "home":
      return isHomeAnimal(animal);
  }
}

function applyAnimalFilters(
  animals: AnimalListItem[],
  filters: AnimalFilterState,
) {
  return animals.filter((animal) => {
    if (filters.filter && !matchesQuickFilter(animal, filters.filter)) {
      return false;
    }

    if (filters.sex && animal.sex !== filters.sex) {
      return false;
    }

    if (filters.origin && !matchesOriginFilter(animal, filters.origin)) {
      return false;
    }

    if (filters.litter_id && animal.litter_id !== filters.litter_id) {
      return false;
    }

    return true;
  });
}

function buildLitterOptions(
  litters: Map<string, LitterLookup>,
): AnimalLitterFilterOption[] {
  return Array.from(litters.values())
    .filter((litter): litter is LitterLookup & { id: string } =>
      Boolean(litter.id),
    )
    .map((litter) => ({
      id: litter.id,
      label: litter.name || "Portée",
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export default async function AnimalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAnimalFilters(await searchParams);
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let animals: AnimalListItem[] | null = null;
  let litterOptions: AnimalLitterFilterOption[] = [];
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("animals")
    .select(
      "id, call_name, official_name, species, breed, sex, status, ownership_status, is_breeder, is_external, is_retired, birth_date, litter_id, mother_id, father_id, birth_order, collar_color_current, collar_color_initial, identification_number, color, coat_color, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rawAnimals = result.data as DBAnimal[] | null;
  hasLoadingError = hasLoadingError || Boolean(result.error);

  if (rawAnimals) {
    const litterIds = uniqueIds(rawAnimals.map((animal) => animal.litter_id));
    const parentIds = uniqueIds(
      rawAnimals.flatMap((animal) => [animal.mother_id, animal.father_id]),
    );

    const { data: rawLitters, error: littersError } = litterIds.length
      ? await supabase
          .from("litter_overview")
          .select("id, name, litter_group_name")
          .in("id", litterIds)
      : { data: [], error: null };

    const { data: rawParents, error: parentsError } = parentIds.length
        ? await supabase
          .from("animals")
          .select("id, call_name")
          .in("id", parentIds)
          .is("deleted_at", null)
      : { data: [], error: null };

    hasLoadingError =
      hasLoadingError || Boolean(littersError) || Boolean(parentsError);

    const littersById = new Map<string, LitterLookup>(
      ((rawLitters as LitterLookup[] | null) ?? []).flatMap((litter) =>
        litter.id ? [[litter.id, litter]] : [],
      ),
    );
    const parentsById = new Map(
      ((rawParents as ParentLookup[] | null) ?? []).map((parent) => [
        parent.id,
        parent.call_name,
      ]),
    );
    litterOptions = buildLitterOptions(littersById);

    const mappedAnimals = rawAnimals.map((animal) => {
      const litter = animal.litter_id
        ? littersById.get(animal.litter_id)
        : null;

      return {
        ...animal,
        litterName: litter?.name ?? null,
        litterGroupName: litter?.litter_group_name ?? null,
        motherCallName: animal.mother_id
          ? parentsById.get(animal.mother_id) ?? null
          : null,
        fatherCallName: animal.father_id
          ? parentsById.get(animal.father_id) ?? null
          : null,
      } satisfies AnimalListItem;
    });

    animals = applyAnimalFilters(mappedAnimals, filters);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Animaux
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez les animaux existants, leur portée et leurs informations principales sans modifier les données.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/animals/new"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold !text-white transition hover:!text-white hover:opacity-90"
            >
              Nouvel animal
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !animals ? (
          <ErrorMessage />
        ) : (
          <div className="space-y-6">
            <AnimalFilters filters={filters} litterOptions={litterOptions} />
            <AnimalList animals={animals} />
          </div>
        )}
      </section>
    </main>
  );
}
