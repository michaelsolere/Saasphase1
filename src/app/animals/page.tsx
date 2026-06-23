import Link from "next/link";
import { redirect } from "next/navigation";

import { AnimalList } from "@/features/animals/animal-list";
import type { AnimalListItem, DBAnimal } from "@/features/animals/types";
import { logout } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LitterLookup = {
  id: string | null;
  name: string | null;
  litter_group_name: string | null;
};

type ParentLookup = Pick<DBAnimal, "id" | "display_name">;

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

export default async function AnimalsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let animals = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("animals")
    .select(
      "id, display_name, temporary_name, call_name, official_name, species, breed, sex, status, birth_date, litter_id, mother_id, father_id, identification_number, color, coat_color, created_at",
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
          .select("id, display_name")
          .in("id", parentIds)
          .is("deleted_at", null)
      : { data: [], error: null };

    hasLoadingError =
      hasLoadingError || Boolean(littersError) || Boolean(parentsError);

    const littersById = new Map(
      ((rawLitters as LitterLookup[] | null) ?? [])
        .filter((litter) => litter.id)
        .map((litter) => [litter.id, litter]),
    );
    const parentsById = new Map(
      ((rawParents as ParentLookup[] | null) ?? []).map((parent) => [
        parent.id,
        parent.display_name,
      ]),
    );

    animals = rawAnimals.map((animal) => {
      const litter = animal.litter_id
        ? littersById.get(animal.litter_id)
        : null;

      return {
        ...animal,
        litterName: litter?.name ?? null,
        litterGroupName: litter?.litter_group_name ?? null,
        motherDisplayName: animal.mother_id
          ? parentsById.get(animal.mother_id) ?? null
          : null,
        fatherDisplayName: animal.father_id
          ? parentsById.get(animal.father_id) ?? null
          : null,
      } satisfies AnimalListItem;
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour à l’accueil
        </Link>
        <div className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
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
              href="/litters"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Portées
            </Link>
            <Link
              href="/reservations"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Réservations
            </Link>
            <Link
              href="/contacts"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Contacts
            </Link>
            <Link
              href="/documents"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Documents
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-foreground hover:underline"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !animals ? (
          <ErrorMessage />
        ) : (
          <AnimalList animals={animals} />
        )}
      </section>
    </main>
  );
}
