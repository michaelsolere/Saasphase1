import Link from "next/link";
import { redirect } from "next/navigation";

import { updateAnimalIdentity } from "@/features/animals/actions";
import {
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalSpeciesLabel,
  getAnimalStatusLabel,
  getOwnershipStatusLabel,
} from "@/features/animals/formatters";
import type { DBAnimal } from "@/features/animals/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  name_required: "Le nom principal est obligatoire.",
  invalid_date: "La date de naissance est invalide.",
  error: "Impossible d’enregistrer les informations pour le moment.",
};

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted";

function ReadOnlyItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-1.5 text-sm leading-6">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

function TextField({
  id,
  label,
  name,
  defaultValue,
  required = false,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | null;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} {required ? <span className="text-accent">*</span> : null}
      </label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className={inputClass}
      />
    </div>
  );
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Animal introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cet animal n’existe pas ou vous n’êtes pas autorisé à le modifier.
      </p>
      <Link
        href="/animals"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux animaux
      </Link>
    </section>
  );
}

export default async function AnimalEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawAnimal, error: readError } = await supabase
    .from("animals")
    .select(
      "id, display_name, species, breed, sex, status, ownership_status, birth_date, litter_id, mother_id, father_id, identification_number, color, coat_color, is_breeder, is_external, is_retired",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const animal = rawAnimal as DBAnimal | null;
  const parentIds = animal
    ? (Array.from(
        new Set([animal.mother_id, animal.father_id].filter(Boolean)),
      ) as string[])
    : [];
  const { data: rawParents } = parentIds.length
    ? await supabase
        .from("animals")
        .select("id, display_name")
        .in("id", parentIds)
        .is("deleted_at", null)
    : { data: [] };
  const parentsById = new Map(
    (rawParents ?? []).map((parent) => [parent.id, parent.display_name]),
  );
  const motherDisplayName = animal?.mother_id
    ? parentsById.get(animal.mother_id) ?? null
    : null;
  const fatherDisplayName = animal?.father_id
    ? parentsById.get(animal.father_id) ?? null
    : null;
  const errorMessage = query.status ? errorMessages[query.status] : undefined;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">
          |
        </span>
        <Link
          href={animal ? `/animals/${animal.id}` : "/animals"}
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour à la fiche animal
        </Link>
      </div>

      <div className="mt-8">
        {readError ? (
          <section
            role="alert"
            className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
          >
            <h1 className="text-xl font-semibold">
              Impossible de charger l’animal
            </h1>
            <p className="mt-2 text-sm">
              Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
            </p>
          </section>
        ) : !animal ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="border-b pb-7">
              <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                Animal · Édition légère
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Modifier {getAnimalDisplayName(animal)}
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-muted">
                Édition légère limitée aux informations d’identité non
                structurelles.
              </p>
            </header>

            {errorMessage ? (
              <section
                role="alert"
                className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
              >
                {errorMessage}
              </section>
            ) : null}

            <section className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-semibold">
                Informations structurelles en lecture seule
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Ces valeurs ne sont pas modifiables dans l’édition légère.
              </p>
              <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                <ReadOnlyItem
                  label="Espèce"
                  value={getAnimalSpeciesLabel(animal.species)}
                />
                <ReadOnlyItem label="Race" value={animal.breed} />
                <ReadOnlyItem
                  label="Sexe"
                  value={getAnimalSexLabel(animal.sex)}
                />
                <ReadOnlyItem
                  label="Statut"
                  value={getAnimalStatusLabel(animal.status)}
                />
                <ReadOnlyItem
                  label="Origine"
                  value={getOwnershipStatusLabel(animal.ownership_status)}
                />
                <ReadOnlyItem
                  label="Portée liée"
                  value={animal.litter_id ? "Oui" : "Non"}
                />
                <ReadOnlyItem label="Mère" value={motherDisplayName} />
                <ReadOnlyItem label="Père" value={fatherDisplayName} />
                <ReadOnlyItem
                  label="Reproducteur"
                  value={animal.is_breeder ? "Oui" : "Non"}
                />
                <ReadOnlyItem
                  label="Animal extérieur"
                  value={animal.is_external ? "Oui" : "Non"}
                />
                <ReadOnlyItem
                  label="Retraité"
                  value={animal.is_retired ? "Oui" : "Non"}
                />
              </dl>
            </section>

            <form
              action={updateAnimalIdentity}
              className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
            >
              <input type="hidden" name="animal_id" value={animal.id} />
              <h2 className="text-xl font-semibold">
                Informations d’identité modifiables
              </h2>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField
                    id="animal-edit-display-name"
                    label="Nom principal"
                    name="display_name"
                    defaultValue={animal.display_name}
                    required
                  />
                </div>

                <TextField
                  id="animal-edit-identification"
                  label="Identification"
                  name="identification_number"
                  defaultValue={animal.identification_number}
                />
                <TextField
                  id="animal-edit-color"
                  label="Couleur"
                  name="color"
                  defaultValue={animal.color}
                />
                <TextField
                  id="animal-edit-coat-color"
                  label="Robe"
                  name="coat_color"
                  defaultValue={animal.coat_color}
                />

                {animal.litter_id ? (
                  <ReadOnlyItem
                    label="Date de naissance"
                    value={formatAnimalDate(animal.birth_date)}
                  />
                ) : (
                  <div>
                    <label htmlFor="animal-edit-birth-date" className={labelClass}>
                      Date de naissance
                    </label>
                    <input
                      id="animal-edit-birth-date"
                      name="birth_date"
                      type="date"
                      defaultValue={animal.birth_date ?? ""}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>

              {animal.litter_id ? (
                <p className="mt-5 text-sm leading-6 text-muted">
                  La date de naissance provient de la portée liée et n’est pas
                  modifiable dans ce lot.
                </p>
              ) : null}

              <div className="mt-8 flex flex-wrap items-center justify-end gap-4 border-t pt-6">
                <Link
                  href={`/animals/${animal.id}`}
                  className="text-sm font-semibold text-muted hover:text-foreground hover:underline"
                >
                  Annuler
                </Link>
                <button
                  type="submit"
                  className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
