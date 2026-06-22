import Link from "next/link";

const futureAreas = [
  {
    href: "/candidature/golden-retriever-2026",
    title: "Formulaire public",
    description: "Le futur parcours de candidature envoyé aux adoptants.",
  },
  {
    href: "/espace-prive",
    title: "Espace privé",
    description: "Le futur accès sécurisé réservé aux membres de l’élevage.",
  },
  {
    href: "/candidatures",
    title: "Candidatures",
    description: "La future liste de relecture et de qualification.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-12">
      <header className="flex items-center justify-between border-b pb-6">
        <div>
          <p className="text-sm font-medium tracking-wide text-accent">
            SaaS Élevage
          </p>
          <p className="mt-1 text-sm text-muted">
            Gestion d’élevage canin et félin
          </p>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          Phase 1
        </span>
      </header>

      <section className="flex flex-1 flex-col justify-center py-20">
        <div className="max-w-3xl">
          <p className="mb-5 inline-flex rounded-full border bg-surface px-3 py-1 text-sm text-muted">
            Socle technique en place
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Une base saine pour suivre chaque parcours d’adoption.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Next.js, TypeScript, Tailwind CSS et Supabase sont prêts. Les
            fonctionnalités métier seront ajoutées progressivement, sans
            dupliquer les contacts au fil de leur parcours.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {futureAreas.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="group rounded-2xl border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-semibold">{area.title}</h2>
                <span className="text-xs font-medium text-muted">Bientôt</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                {area.description}
              </p>
              <p className="mt-6 text-sm font-medium text-accent">
                Aperçu du futur module
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block transition group-hover:translate-x-1"
                >
                  →
                </span>
              </p>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t pt-6 text-sm text-muted">
        Phase initiale — aucun module métier complet n’est encore activé.
      </footer>
    </main>
  );
}
