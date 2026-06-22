import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deconnexion?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Un utilisateur déjà connecté n’a pas à ressaisir ses identifiants.
  if (user) {
    redirect("/candidatures");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12 sm:px-10 lg:px-12">
      <div className="grid w-full gap-10 lg:grid-cols-[1fr_440px] lg:items-center">
        <section className="max-w-xl">
          <Link
            href="/"
            className="text-sm font-medium text-accent hover:underline"
          >
            ← Retour à l’accueil
          </Link>
          <p className="mt-10 text-sm font-semibold uppercase tracking-wide text-accent">
            Espace privé
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Retrouvez les candidatures de votre élevage.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted">
            Connectez-vous avec votre compte Supabase pour accéder aux données
            autorisées par votre organisation.
          </p>
        </section>

        <section className="rounded-3xl border bg-surface p-7 shadow-sm sm:p-9">
          <h2 className="text-2xl font-semibold">Connexion</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Utilisez l’email et le mot de passe associés à votre compte.
          </p>

          {params.deconnexion === "success" ? (
            <p
              role="status"
              className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            >
              Vous êtes maintenant déconnecté.
            </p>
          ) : null}

          <LoginForm />

          <p className="mt-6 text-xs leading-5 text-muted">
            L’inscription et la récupération de mot de passe ne sont pas encore
            disponibles dans cette première version.
          </p>
        </section>
      </div>
    </main>
  );
}
