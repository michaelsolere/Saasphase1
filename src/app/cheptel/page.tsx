import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatAnimalDate,
  getAnimalDisplayName,
  getAnimalSexLabel,
  getAnimalStatusLabel,
} from "@/features/animals/formatters";
import { getReservationStatusLabel } from "@/features/reservations/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type HerdAnimal = Pick<
  Database["public"]["Tables"]["animals"]["Row"],
  | "id"
  | "display_name"
  | "temporary_name"
  | "call_name"
  | "official_name"
  | "species"
  | "sex"
  | "status"
  | "ownership_status"
  | "is_breeder"
  | "is_external"
  | "is_retired"
  | "litter_id"
  | "pedigree_url"
  | "created_at"
>;

type LitterLookup = {
  id: string | null;
  name: string | null;
  litter_group_name: string | null;
};

type ReservationLookup = {
  id: string | null;
  animal_id: string | null;
  contact_display_name: string | null;
  status: string | null;
  created_at: string | null;
};

type AnimalEventLookup = {
  id: string;
  animal_id: string | null;
  title: string;
  event_type: string;
  status: string;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
};

type HerdAnimalItem = HerdAnimal & {
  litterName: string | null;
  litterGroupName: string | null;
  reservation: ReservationLookup | null;
  nextHealthEvent: AnimalEventLookup | null;
};

type HerdCategory = {
  key: string;
  title: string;
  description: string;
  animals: HerdAnimalItem[];
};

const HEALTH_KEYWORDS = [
  "health",
  "sante",
  "sanitaire",
  "medical",
  "veterinaire",
  "veterinary",
  "vaccin",
  "vaccination",
  "vaccine",
  "vermifuge",
  "deworming",
  "xray",
  "ultrasound",
  "pregnancy_check",
];

const herdOwnershipStatusLabels: Record<string, string> = {
  owned: "Maison",
  produced: "Né à l’élevage",
  external_stud: "Étalon extérieur",
  external_female: "Femelle extérieure",
  co_owned: "Copropriété",
  sold: "Adopté / vendu",
  adopted_out: "Adopté / vendu",
  unknown: "Non précisé",
};

const nonPresentHerdStatuses = new Set([
  "adopted",
  "archived",
  "deceased",
  "planned",
  "stillborn",
]);

const outOfHomeOwnershipStatuses = new Set([
  "adopted_out",
  "sold",
]);

function uniqueIds(values: Array<string | null>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function isExternalAnimal(animal: Pick<HerdAnimal, "is_external" | "ownership_status">) {
  return (
    animal.is_external ||
    animal.ownership_status === "external_stud" ||
    animal.ownership_status === "external_female"
  );
}

function isHomeBreeder(
  animal: Pick<HerdAnimal, "is_breeder" | "is_external">,
) {
  return animal.is_breeder && !animal.is_external;
}

function isHomeAnimalPresent(
  animal: Pick<HerdAnimal, "is_external" | "ownership_status" | "status">,
) {
  return (
    !isExternalAnimal(animal) &&
    !outOfHomeOwnershipStatuses.has(animal.ownership_status ?? "") &&
    !nonPresentHerdStatuses.has(animal.status)
  );
}

function normalizeHealthLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isHealthEvent(event: AnimalEventLookup) {
  const normalizedValue = normalizeHealthLookup(
    `${event.event_type} ${event.title}`,
  );

  return HEALTH_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
}

function getEventDateValue(event: AnimalEventLookup) {
  return event.planned_date ?? event.planned_at ?? event.actual_at ?? event.created_at;
}

function getHerdSituationLabel(animal: Pick<HerdAnimal, "status">) {
  if (animal.status === "kept") {
    return "Reste à l’élevage";
  }

  if (animal.status === "active") {
    return null;
  }

  return getAnimalStatusLabel(animal.status);
}

function getHerdOwnershipStatusLabel(value: string | null) {
  if (!value) {
    return "Non précisé";
  }

  return herdOwnershipStatusLabels[value] ?? value.replaceAll("_", " ");
}

function buildCategories(animals: HerdAnimalItem[]): HerdCategory[] {
  return [
    {
      key: "home_females",
      title: "Reproductrices",
      description: "Femelles reproductrices détenues ou produites à l’élevage.",
      animals: animals.filter(
        (animal) =>
          isHomeBreeder(animal) &&
          animal.sex === "female",
      ),
    },
    {
      key: "kept",
      title: "Restent à l’élevage",
      description: "Animaux identifiés avec le statut Gardé à l’élevage.",
      animals: animals.filter(
        (animal) => animal.status === "kept" && !isHomeBreeder(animal),
      ),
    },
    {
      key: "retired",
      title: "Retraités",
      description: "Animaux marqués comme retraités.",
      animals: animals.filter(
        (animal) => animal.status === "retired" || animal.is_retired,
      ),
    },
    {
      key: "home_males",
      title: "Reproducteurs",
      description: "Mâles reproducteurs détenus ou produits à l’élevage.",
      animals: animals.filter(
        (animal) =>
          isHomeBreeder(animal) &&
          animal.sex === "male",
      ),
    },
    {
      key: "external_breeders",
      title: "Reproducteurs extérieurs",
      description: "Étalons ou femelles extérieurs utilisés dans le suivi.",
      animals: animals.filter(
        (animal) =>
          animal.is_breeder &&
          !isHomeBreeder(animal) &&
          isExternalAnimal(animal),
      ),
    },
  ];
}

function ErrorMessage() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h2 className="text-xl font-semibold">Impossible de charger le cheptel.</h2>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </section>
  );
}

function OptionalMeta({ label, value }: { label: string; value: string | null }) {
  return (
    <p>
      <span className="font-medium text-foreground">{label} : </span>
      {value || "Non renseigné"}
    </p>
  );
}

function HerdAnimalCard({ animal }: { animal: HerdAnimalItem }) {
  const reservation = animal.reservation;
  const healthEvent = animal.nextHealthEvent;
  const situationLabel = getHerdSituationLabel(animal);

  return (
    <article className="rounded-xl border bg-background p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Link
            href={`/animals/${animal.id}`}
            className="font-semibold text-accent hover:underline"
          >
            {getAnimalDisplayName(animal)}
          </Link>
          <p className="mt-1 text-xs text-muted">
            {getAnimalSexLabel(animal.sex)}
            {situationLabel ? ` · ${situationLabel}` : null}
          </p>
        </div>
        {animal.pedigree_url ? (
          <a
            href={animal.pedigree_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-accent hover:underline"
          >
            Pedigree
          </a>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 text-xs leading-5 text-muted sm:grid-cols-2">
        <OptionalMeta
          label="Origine / détention"
          value={getHerdOwnershipStatusLabel(animal.ownership_status)}
        />
        {situationLabel ? (
          <OptionalMeta label="Situation" value={situationLabel} />
        ) : null}
        <OptionalMeta label="Portée" value={animal.litterName} />
        <OptionalMeta label="Groupe" value={animal.litterGroupName} />
        <p>
          <span className="font-medium text-foreground">Réservation : </span>
          {reservation?.id ? (
            <Link
              href={`/reservations/${reservation.id}`}
              className="font-medium text-accent hover:underline"
            >
              {reservation.contact_display_name ||
                getReservationStatusLabel(reservation.status)}
            </Link>
          ) : (
            "Aucune"
          )}
        </p>
      </div>

      <div className="mt-4 rounded-lg border bg-surface px-3 py-2 text-xs leading-5 text-muted">
        {healthEvent ? (
          <p>
            <span className="font-medium text-foreground">Prochain soin : </span>
            {healthEvent.title || healthEvent.event_type} ·{" "}
            {formatAnimalDate(getEventDateValue(healthEvent))}
          </p>
        ) : (
          <p>Aucun soin prévu identifié.</p>
        )}
      </div>
    </article>
  );
}

function HerdCategorySection({ category }: { category: HerdCategory }) {
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">{category.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {category.description}
          </p>
        </div>
        <span className="w-fit rounded-full border bg-background px-3 py-1 text-xs font-semibold text-muted">
          {category.animals.length}
        </span>
      </div>

      {category.animals.length === 0 ? (
        <p className="mt-5 text-sm text-muted">Aucun animal dans cette catégorie.</p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {category.animals.slice(0, 6).map((animal) => (
            <HerdAnimalCard key={animal.id} animal={animal} />
          ))}
        </div>
      )}

      {category.animals.length > 6 ? (
        <p className="mt-4 text-xs text-muted">
          {category.animals.length - 6} animal
          {category.animals.length - 6 > 1 ? "aux" : ""} supplémentaire
          {category.animals.length - 6 > 1 ? "s" : ""} visible
          {category.animals.length - 6 > 1 ? "s" : ""} depuis la liste Animaux.
        </p>
      ) : null}
    </section>
  );
}

export default async function HerdPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let hasLoadingError = Boolean(authError);

  const { data: rawAnimals, error: animalsError } = await supabase
    .from("animals")
    .select(
      "id, display_name, temporary_name, call_name, official_name, species, sex, status, ownership_status, is_breeder, is_external, is_retired, litter_id, pedigree_url, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  hasLoadingError = hasLoadingError || Boolean(animalsError);
  const animals = (rawAnimals as HerdAnimal[] | null) ?? [];
  const animalIds = animals.map((animal) => animal.id);
  const litterIds = uniqueIds(animals.map((animal) => animal.litter_id));

  const { data: rawLitters, error: littersError } = litterIds.length
    ? await supabase
        .from("litter_overview")
        .select("id, name, litter_group_name")
        .in("id", litterIds)
    : { data: [], error: null };

  const { data: rawReservations, error: reservationsError } = animalIds.length
    ? await supabase
        .from("reservation_overview")
        .select("id, animal_id, contact_display_name, status, created_at")
        .in("animal_id", animalIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const { data: rawEvents, error: eventsError } = animalIds.length
    ? await supabase
        .from("events")
        .select(
          "id, animal_id, title, event_type, status, planned_at, planned_date, actual_at, created_at",
        )
        .in("animal_id", animalIds)
        .is("deleted_at", null)
        .in("status", ["planned", "todo", "in_progress", "late"])
        .order("planned_date", { ascending: true, nullsFirst: false })
        .order("planned_at", { ascending: true, nullsFirst: false })
    : { data: [], error: null };

  hasLoadingError =
    hasLoadingError ||
    Boolean(littersError) ||
    Boolean(reservationsError) ||
    Boolean(eventsError);

  const littersById = new Map<string, LitterLookup>(
    ((rawLitters as LitterLookup[] | null) ?? []).flatMap((litter) =>
      litter.id ? [[litter.id, litter]] : [],
    ),
  );

  const reservationsByAnimalId = new Map<string, ReservationLookup>();
  ((rawReservations as ReservationLookup[] | null) ?? []).forEach((reservation) => {
    if (reservation.animal_id && !reservationsByAnimalId.has(reservation.animal_id)) {
      reservationsByAnimalId.set(reservation.animal_id, reservation);
    }
  });

  const nextHealthEventByAnimalId = new Map<string, AnimalEventLookup>();
  ((rawEvents as AnimalEventLookup[] | null) ?? [])
    .filter(isHealthEvent)
    .forEach((event) => {
      if (event.animal_id && !nextHealthEventByAnimalId.has(event.animal_id)) {
        nextHealthEventByAnimalId.set(event.animal_id, event);
      }
    });

  const herdAnimals: HerdAnimalItem[] = animals.map((animal) => {
    const litter = animal.litter_id ? littersById.get(animal.litter_id) : null;

    return {
      ...animal,
      litterName: litter?.name ?? null,
      litterGroupName: litter?.litter_group_name ?? null,
      reservation: reservationsByAnimalId.get(animal.id) ?? null,
      nextHealthEvent: nextHealthEventByAnimalId.get(animal.id) ?? null,
    };
  });

  const categories = buildCategories(herdAnimals);
  const herdCount = herdAnimals.filter(isHomeAnimalPresent).length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Cockpit
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Cheptel
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Vue synthétique des reproducteurs, animaux restant à l’élevage,
              et retraités, à partir des données Animaux existantes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/animals"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Liste Animaux
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError ? (
          <ErrorMessage />
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Cheptel
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {herdCount}
                </p>
              </div>
              <div className="rounded-2xl border bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Reproductrices
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {categories.find((category) => category.key === "home_females")?.animals.length ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Reproducteurs
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {categories.find((category) => category.key === "home_males")?.animals.length ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Restent à l’élevage
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {categories.find((category) => category.key === "kept")?.animals.length ?? 0}
                </p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {categories.map((category) => (
                <HerdCategorySection key={category.key} category={category} />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
