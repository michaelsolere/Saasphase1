"use client";

import Link from "next/link";
import type { FormEvent } from "react";

export type AnimalQuickFilter =
  | "born"
  | "available"
  | "reserved"
  | "kept"
  | "adopted"
  | "home_breeders"
  | "external_breeders"
  | "retired";

export type AnimalSexFilter = "male" | "female" | "unknown";
export type AnimalOriginFilter = "produced" | "external" | "home";

export type AnimalFilterState = {
  filter: AnimalQuickFilter | null;
  sex: AnimalSexFilter | null;
  origin: AnimalOriginFilter | null;
  litter_id: string | null;
};

export type AnimalLitterFilterOption = {
  id: string;
  label: string;
};

const quickFilters: Array<{ value: AnimalQuickFilter; label: string }> = [
  { value: "born", label: "Nés d’une portée" },
  { value: "available", label: "Disponibles" },
  { value: "reserved", label: "Réservés / attribués" },
  { value: "kept", label: "Gardés à l’élevage" },
  { value: "adopted", label: "Adoptés" },
  { value: "home_breeders", label: "Reproducteurs maison" },
  { value: "external_breeders", label: "Reproducteurs extérieurs" },
  { value: "retired", label: "Retraités" },
];

function animalsHref(filters: AnimalFilterState) {
  const params = new URLSearchParams();

  if (filters.filter) {
    params.set("filter", filters.filter);
  }
  if (filters.sex) {
    params.set("sex", filters.sex);
  }
  if (filters.origin) {
    params.set("origin", filters.origin);
  }
  if (filters.litter_id) {
    params.set("litter_id", filters.litter_id);
  }

  const query = params.toString();

  return query ? `/animals?${query}` : "/animals";
}

function selectValue(value: string | null) {
  return value ?? "";
}

function cleanEmptyFilterFields(event: FormEvent<HTMLFormElement>) {
  const controls = event.currentTarget.querySelectorAll("select");

  controls.forEach((control) => {
    control.disabled = !control.value;
  });
}

export function AnimalFilters({
  filters,
  litterOptions,
}: {
  filters: AnimalFilterState;
  litterOptions: AnimalLitterFilterOption[];
}) {
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={animalsHref({ ...filters, filter: null })}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              filters.filter
                ? "text-muted hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                : "border-accent/50 bg-accent-soft text-accent"
            }`}
          >
            Tous
          </Link>
          {quickFilters.map((quickFilter) => {
            const isActive = filters.filter === quickFilter.value;

            return (
              <Link
                key={quickFilter.value}
                href={animalsHref({ ...filters, filter: quickFilter.value })}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  isActive
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "text-muted hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                }`}
              >
                {quickFilter.label}
              </Link>
            );
          })}
        </div>

        <form
          className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
          method="get"
          onSubmit={cleanEmptyFilterFields}
        >
          {filters.filter ? (
            <input type="hidden" name="filter" value={filters.filter} />
          ) : null}
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Sexe</span>
            <select
              name="sex"
              defaultValue={selectValue(filters.sex)}
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
            >
              <option value="">Tous les sexes</option>
              <option value="female">Femelle</option>
              <option value="male">Mâle</option>
              <option value="unknown">Non renseigné</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Origine</span>
            <select
              name="origin"
              defaultValue={selectValue(filters.origin)}
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
            >
              <option value="">Toutes les origines</option>
              <option value="produced">Nés à l’élevage</option>
              <option value="external">Extérieurs</option>
              <option value="home">Maison</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Portée</span>
            <select
              name="litter_id"
              defaultValue={selectValue(filters.litter_id)}
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
            >
              <option value="">Toutes les portées</option>
              {litterOptions.map((litter) => (
                <option key={litter.id} value={litter.id}>
                  {litter.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
            >
              Filtrer
            </button>
            <Link
              href="/animals"
              className="py-2 text-sm font-semibold text-muted transition hover:text-foreground hover:underline"
            >
              Réinitialiser
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
