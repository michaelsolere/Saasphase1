import Link from "next/link";
import { redirect } from "next/navigation";

import { ReproductionPanel } from "@/features/reproduction/reproduction-panel";
import {
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
    .select("id, call_name, official_name, species, breed, sex")
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

  const measurementResults = await Promise.all(
    cyclesResult.cycles.map(async (cycle) => ({
      cycle,
      result: await listProgesteroneMeasurementsForCycle({ cycleId: cycle.id }),
    })),
  );

  if (measurementResults.some(({ result }) => result.outcome === "error")) {
    return <UnavailableReproductionPage />;
  }

  const cycles = measurementResults.map(({ cycle, result }) => ({
    ...cycle,
    measurements: result.outcome === "success" ? result.measurements : [],
  }));
  const animalName = animal.official_name?.trim() || animal.call_name?.trim() || "Femelle";
  const canWrite = cyclesResult.role !== "viewer";

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
        <ReproductionPanel motherId={animal.id} cycles={cycles} canWrite={canWrite} />
      </div>
    </main>
  );
}
