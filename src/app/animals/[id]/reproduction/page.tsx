import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { recordReproductiveCycleMatingAction } from "@/features/reproduction/actions";
import { filterEligibleLitterParents } from "@/features/litters/parent-eligibility";
import { ReproductionPanel } from "@/features/reproduction/reproduction-panel";
import {
  listReproductiveCycleMatingsForCycle,
  listProgesteroneMeasurementsForCycle,
  listReproductiveCyclesForMother,
} from "@/features/reproduction/reproductive-cycles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReproductionAnimal = {
  id: string;
  call_name: string | null;
  official_name: string | null;
  species: string;
  breed: string;
  sex: string;
  organization_id: string;
};

type ReproductionFather = {
  id: string;
  call_name: string | null;
  official_name: string | null;
  sex: string | null;
  species: string | null;
  status: string | null;
  ownership_status: string | null;
  is_breeder: boolean | null;
  is_external: boolean | null;
  is_retired: boolean | null;
  deleted_at: string | null;
};

function speciesLabel(species: string) {
  return species === "dog" ? "Chien" : species === "cat" ? "Chat" : species;
}

function UnavailableReproductionPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10 sm:px-10">
      <Link href="/animals" className="text-sm font-medium text-accent hover:underline">
        ← Retour aux animaux
      </Link>
      <section className="mt-8 rounded-2xl border bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Reproduction indisponible</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Cette fiche n’est pas disponible ou ne concerne pas une femelle.
        </p>
      </section>
    </main>
  );
}

export default async function AnimalReproductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rawAnimal, error: animalError } = await supabase
    .from("animals")
    .select("id, call_name, official_name, species, breed, sex, organization_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const animal = rawAnimal as ReproductionAnimal | null;

  if (animalError || !animal || animal.sex !== "female") {
    return <UnavailableReproductionPage />;
  }

  const cyclesResult = await listReproductiveCyclesForMother({ motherId: animal.id });

  if (cyclesResult.outcome === "error") {
    return <UnavailableReproductionPage />;
  }

  const cycleDetails = await Promise.all(
    cyclesResult.cycles.map(async (cycle) => ({
      cycle,
      measurementsResult: await listProgesteroneMeasurementsForCycle({ cycleId: cycle.id }),
      matingsResult: await listReproductiveCycleMatingsForCycle({ cycleId: cycle.id }),
    })),
  );

  if (
    cycleDetails.some(
      ({ measurementsResult, matingsResult }) =>
        measurementsResult.outcome === "error" || matingsResult.outcome === "error",
    )
  ) {
    return <UnavailableReproductionPage />;
  }

  const fathersResult = await supabase
    .from("animals")
    .select(
      "id, call_name, official_name, sex, species, status, ownership_status, is_breeder, is_external, is_retired, deleted_at",
    )
    .eq("organization_id", animal.organization_id)
    .eq("species", animal.species)
    .order("call_name", { ascending: true });

  if (fathersResult.error) return <UnavailableReproductionPage />;

  const fathers = (fathersResult.data ?? []) as ReproductionFather[];
  const eligibleFathers = filterEligibleLitterParents(fathers, "father", animal.species).map(
    (father) => ({
      id: father.id,
      name: father.official_name?.trim() || father.call_name?.trim() || "Étalon sans nom",
    }),
  );
  const fatherNames = Object.fromEntries(
    fathers.map((father) => [
      father.id,
      father.official_name?.trim() || father.call_name?.trim() || "Étalon non disponible",
    ]),
  );
  const litterIds = cycleDetails.flatMap(({ cycle }) => (cycle.litterId ? [cycle.litterId] : []));
  const littersResult = litterIds.length
    ? await supabase
        .from("litters")
        .select("id, name")
        .in("id", litterIds)
        .is("deleted_at", null)
    : { data: [], error: null };

  if (littersResult.error) return <UnavailableReproductionPage />;

  const litterNames = Object.fromEntries(
    (littersResult.data ?? []).map((litter) => [litter.id, litter.name]),
  );
  const cycles = cycleDetails.map(({ cycle, measurementsResult, matingsResult }) => ({
    ...cycle,
    measurements: measurementsResult.outcome === "success" ? measurementsResult.measurements : [],
    matings: matingsResult.outcome === "success" ? matingsResult.matings : [],
    litterName: cycle.litterId ? litterNames[cycle.litterId] ?? null : null,
    matingAction: recordReproductiveCycleMatingAction.bind(null, {
      motherId: animal.id,
      cycleId: cycle.id,
      clientCommandId: randomUUID(),
      fatherId:
        matingsResult.outcome === "success" && matingsResult.matings.length > 0
          ? matingsResult.matings[0].fatherId
          : undefined,
    }),
  }));
  const animalName = animal.official_name?.trim() || animal.call_name?.trim() || "Femelle";
  const canWrite = ["owner", "admin", "member"].includes(cyclesResult.role);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
      <Link href={`/animals/${animal.id}`} className="text-sm font-medium text-accent hover:underline">
        ← Retour à la fiche Animal
      </Link>
      <header className="mt-8 border-b pb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Animal · Reproduction</p>
        <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{animalName}</h1>
        <p className="mt-3 text-sm text-muted">{speciesLabel(animal.species)} · {animal.breed}</p>
      </header>
      <div className="py-8">
        <ReproductionPanel
          motherId={animal.id}
          cycles={cycles}
          canWrite={canWrite}
          eligibleFathers={eligibleFathers}
          fatherNames={fatherNames}
        />
      </div>
    </main>
  );
}
