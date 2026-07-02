import { redirect } from "next/navigation";

import { PaymentList } from "@/features/payments/payment-list";
import type { PaymentListItem } from "@/features/payments/payment-list";
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

  let paymentListItems: PaymentListItem[] | null = null;

  if (payments) {
    const contactIds = Array.from(
      new Set(payments.map((payment) => payment.contact_id).filter(Boolean)),
    );
    const contactNameMap = new Map<string, string | null>();

    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, display_name")
        .in("id", contactIds);

      contacts?.forEach((contact) => {
        contactNameMap.set(contact.id, contact.display_name);
      });
    }

    paymentListItems = payments.map((payment) => ({
      ...payment,
      contact_display_name: contactNameMap.get(payment.contact_id) ?? null,
    }));
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
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
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !paymentListItems ? (
          <ErrorMessage />
        ) : (
          <PaymentList payments={paymentListItems} />
        )}
      </section>
    </main>
  );
}
