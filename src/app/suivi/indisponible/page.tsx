import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicQuestionnaireUnavailablePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border bg-surface p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Suivi post-adoption
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Ce questionnaire n’est pas disponible
        </h1>
        <p className="mt-4 leading-7 text-muted">
          Le lien peut avoir expiré, avoir été remplacé ou être temporairement indisponible.
          Si vous pensez qu’il s’agit d’une erreur, contactez directement votre éleveur.
        </p>
      </section>
    </main>
  );
}
