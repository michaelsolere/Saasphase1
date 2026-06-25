import Link from "next/link";

const quickLinks = [
  {
    href: "/candidature/golden-retriever-2026",
    title: "Formulaire public",
    description: "Le parcours de candidature à partager avec les adoptants.",
    status: "Public",
  },
  {
    href: "/login",
    title: "Espace privé",
    description: "L’accès sécurisé réservé aux membres de l’élevage.",
    status: "Connexion",
  },
  {
    href: "/contacts",
    title: "Contacts",
    description: "La fiche contact unique au centre du parcours adoptant.",
    status: "Lecture seule",
  },
  {
    href: "/candidatures",
    title: "Candidatures",
    description: "La relecture des demandes envoyées depuis le formulaire.",
    status: "Lecture seule",
  },
  {
    href: "/reservations",
    title: "Réservations",
    description: "Le suivi des réservations, paiements, animal et notes liés.",
    status: "Lecture seule",
  },
  {
    href: "/payments",
    title: "Paiements",
    description: "La consultation des paiements, arrhes et remboursements.",
    status: "Lecture seule",
  },
  {
    href: "/documents",
    title: "Documents",
    description: "Les documents reliés aux contacts, dossiers et paiements.",
    status: "Lecture seule",
  },
  {
    href: "/litters",
    title: "Portées",
    description: "Les portées, animaux, réservations, notes et événements liés.",
    status: "Lecture seule",
  },
  {
    href: "/animals",
    title: "Animaux",
    description: "Les animaux avec portée, réservation, documents, notes et événements.",
    status: "Lecture seule",
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
            Phase 1 · Navigation rapide
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Une base saine pour suivre chaque parcours d’adoption.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Les modules principaux sont accessibles pour consulter les
            contacts, candidatures, réservations, paiements, documents, portées
            et animaux. Les écrans privés restent majoritairement en lecture
            seule pendant cette phase.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="group rounded-2xl border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-semibold">{area.title}</h2>
                <span className="text-xs font-medium text-muted">
                  {area.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                {area.description}
              </p>
              <p className="mt-6 text-sm font-medium text-accent">
                {area.title === "Formulaire public"
                  ? "Ouvrir le formulaire"
                  : area.title === "Espace privé"
                  ? "Se connecter"
                  : "Consulter"}
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
        Phase 1 — consultation d’abord, écritures métier ajoutées par petites PRs ciblées.
      </footer>
    </main>
  );
}
