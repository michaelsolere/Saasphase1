import Link from "next/link";
import { redirect } from "next/navigation";

import { updateAnimalIdentity } from "@/features/animals/actions";
import {
  animalSexOptions,
  animalSpeciesOptions,
  type AnimalParentOption,
} from "@/features/animals/animal-fields";
import {
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalSpeciesLabel,
  getAnimalStatusLabel,
} from "@/features/animals/formatters";
import type { DBAnimal } from "@/features/animals/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  name_required: "Renseignez au moins un nom complet ou un nom d’usage.",
  invalid_date: "La date de naissance est invalide.",
  invalid: "Les informations envoyées sont invalides.",
  error: "Impossible d’enregistrer les informations pour le moment.",
};

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted";
const administrativeStatusOptions = [
  ["active", "Actif"],
  ["retired", "Retraité"],
  ["deceased", "Décédé"],
  ["archived", "Archivé"],
] as const;
const workflowControlledStatuses = new Set([
  "born",
  "available",
  "reserved",
  "kept",
  "adopted",
  "planned",
]);

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

function parentOptionLabel(animal: AnimalParentOption) {
  const parts = [
    animal.call_name ?? animal.official_name ?? "Animal sans nom",
    getAnimalSexLabel(animal.sex),
  ];
  const speciesBreed = [getAnimalSpeciesLabel(animal.species), animal.breed]
    .filter(Boolean)
    .join(" / ");

  if (speciesBreed) {
    parts.push(speciesBreed);
  }

  if (animal.status) {
    parts.push(animal.status);
  }

  return parts.join(" · ");
}

function TextField({
  id,
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | null;
  type?: string;
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
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        className={inputClass}
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  name,
  defaultValue,
  options,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | null;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AdministrativeStatusField({ status }: { status: string | null }) {
  if (status && workflowControlledStatuses.has(status)) {
    return (
      <div className="sm:col-span-2">
        <dt className={labelClass}>Statut administratif</dt>
        <dd className="mt-1.5 text-sm leading-6">
          {getAnimalStatusLabel(status)}
        </dd>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ce statut est piloté par le parcours de l’animal et se modifie avec les actions dédiées.
        </p>
      </div>
    );
  }

  const options =
    status === "breeding"
      ? ([["breeding", "Reproducteur — ancien statut"], ...administrativeStatusOptions] as const)
      : administrativeStatusOptions;

  return (
    <SelectField
      id="animal-edit-status"
      label="Statut administratif"
      name="status"
      defaultValue={status}
      options={options}
    />
  );
}

function ParentSelectField({
  id,
  label,
  name,
  defaultValue,
  options,
  emptyLabel,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | null;
  options: AnimalParentOption[];
  emptyLabel: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      >
        <option value="">{emptyLabel}</option>
        {options.map((animal) => (
          <option key={animal.id} value={animal.id}>
            {parentOptionLabel(animal)}
          </option>
        ))}
      </select>
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
      "id, organization_id, call_name, official_name, species, breed, sex, status, ownership_status, birth_date, litter_id, mother_id, father_id, birth_order, collar_color_current, collar_color_initial, identification_number, pedigree_url, lof_number, color, coat_color, is_breeder, is_external, is_retired",
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
        .select("id, call_name")
        .in("id", parentIds)
        .is("deleted_at", null)
    : { data: [] };
  const parentsById = new Map(
    (rawParents ?? []).map((parent) => [parent.id, parent.call_name]),
  );
  const motherDisplayName = animal?.mother_id
    ? parentsById.get(animal.mother_id) ?? null
    : null;
  const fatherDisplayName = animal?.father_id
    ? parentsById.get(animal.father_id) ?? null
    : null;
  const { data: parentOptionsRaw } = animal
    ? await supabase
        .from("animals")
        .select("id, call_name, official_name, sex, species, breed, status")
        .eq("organization_id", animal.organization_id)
        .neq("id", animal.id)
        .is("deleted_at", null)
        .order("call_name", { ascending: true, nullsFirst: false })
        .order("official_name", { ascending: true, nullsFirst: false })
    : { data: [] };
  const parentOptions = (parentOptionsRaw ?? []) as AnimalParentOption[];
  const animalDisplay = animal
    ? getAnimalDisplayName({
        ...animal,
        motherCallName: motherDisplayName,
        fatherCallName: fatherDisplayName,
      })
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
                Animal · Modification
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Modifier {animalDisplay}
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-muted">
                Corrigez les informations descriptives de la fiche de l’animal.
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

            <form
              action={updateAnimalIdentity}
              className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8"
            >
              <input type="hidden" name="animal_id" value={animal.id} />
              <h2 className="text-xl font-semibold">
                Modifier la fiche de l’animal
              </h2>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField
                    id="animal-edit-official-name"
                    label="Nom complet"
                    name="official_name"
                    defaultValue={animal.official_name}
                  />
                </div>

                <div className="sm:col-span-2">
                  <TextField
                    id="animal-edit-call-name"
                    label="Nom d’usage"
                    name="call_name"
                    defaultValue={animal.call_name}
                  />
                </div>

                <SelectField
                  id="animal-edit-species"
                  label="Espèce"
                  name="species"
                  defaultValue={animal.species}
                  options={animalSpeciesOptions}
                />
                <TextField
                  id="animal-edit-breed"
                  label="Race"
                  name="breed"
                  defaultValue={animal.breed}
                  required
                />
                <SelectField
                  id="animal-edit-sex"
                  label="Sexe"
                  name="sex"
                  defaultValue={animal.sex}
                  options={animalSexOptions}
                />
                <AdministrativeStatusField status={animal.status} />
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
                <TextField
                  id="animal-edit-identification"
                  label="Numéro d’identification"
                  name="identification_number"
                  defaultValue={animal.identification_number}
                />
                <div className="sm:col-span-2">
                  <TextField
                    id="animal-edit-pedigree-url"
                    label="Lien vers la page SCC de l’animal"
                    name="pedigree_url"
                    type="url"
                    defaultValue={animal.pedigree_url}
                  />
                </div>
                <TextField
                  id="animal-edit-lof-number"
                  label="Numéro LOF"
                  name="lof_number"
                  defaultValue={animal.lof_number}
                />
                <TextField
                  id="animal-edit-coat-color"
                  label="Robe"
                  name="coat_color"
                  defaultValue={animal.coat_color}
                />

                {animal.litter_id ? (
                  <>
                    <ReadOnlyItem label="Mère" value={motherDisplayName} />
                    <ReadOnlyItem label="Père" value={fatherDisplayName} />
                  </>
                ) : (
                  <>
                    <ParentSelectField
                      id="animal-edit-mother"
                      label="Mère"
                      name="mother_id"
                      defaultValue={animal.mother_id}
                      options={parentOptions}
                      emptyLabel="Aucune mère"
                    />
                    <ParentSelectField
                      id="animal-edit-father"
                      label="Père"
                      name="father_id"
                      defaultValue={animal.father_id}
                      options={parentOptions}
                      emptyLabel="Aucun père"
                    />
                  </>
                )}
              </div>

              {animal.litter_id ? (
                <p className="mt-5 text-sm leading-6 text-muted">
                  Ces informations proviennent de la portée liée et doivent être
                  corrigées depuis la{" "}
                  <Link
                    href={`/litters/${animal.litter_id}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    fiche de la portée
                  </Link>
                  .
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
