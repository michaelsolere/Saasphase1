import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/features/auth/actions";
import { PaymentList } from "@/features/payments/payment-list";
import type { DBPayment } from "@/features/payments/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les paiements</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function PaymentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let payments = null;
  let hasLoadingError = Boolean(authError);

  const result = await supabase
    .from("payments")
    .select("id, amount_cents, currency, payment_type, status, payment_method, paid_at, created_at, contact_id, reservation_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  payments = result.data as DBPayment[] | null;
  hasLoadingError = hasLoadingError || Boolean(result.error);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour à l’accueil
        </Link>
        <div className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Paiements
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez l’historique des paiements, acomptes, arrhes et remboursements de votre élevage.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/candidatures"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Candidatures
            </Link>
            <Link
              href="/contacts"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Contacts
            </Link>
            <Link
              href="/reservations"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Réservations
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm font-medium text-muted hover:text-foreground hover:underline"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !payments ? (
          <ErrorMessage />
        ) : (
          <PaymentList payments={payments} />
        )}
      </section>
    </main>
  );
}
