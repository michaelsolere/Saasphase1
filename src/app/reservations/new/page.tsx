import Link from "next/link";
import { redirect } from "next/navigation";

import {
  NewReservationForm,
  type NewReservationApplication,
  type NewReservationContact,
} from "@/features/reservations/new-reservation-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [contactsResult, applicationsResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, display_name, first_name, last_name, email, phone, created_at")
      .is("deleted_at", null)
      .order("display_name", { ascending: true }),
    supabase
      .from("applications")
      .select("id, contact_id, status, species, breed, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const hasLoadingError = Boolean(
    contactsResult.error || applicationsResult.error,
  );

  const contacts = (contactsResult.data ?? []) as NewReservationContact[];
  const applications = (applicationsResult.data ??
    []) as NewReservationApplication[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">
          |
        </span>
        <Link
          href="/reservations"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux réservations
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Espace privé · Réservations
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Nouvelle réservation
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Créez une réservation brouillon pour un contact existant, avec ou sans
          candidature. Aucun paiement, document ou attribution n’est créé
          automatiquement.
        </p>
      </header>

      {query.status === "error" ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-950"
        >
          Impossible de créer la réservation. Vérifiez le contact et la
          candidature sélectionnés, puis réessayez. Aucune autre donnée n’a été
          modifiée.
        </section>
      ) : null}

      {query.status === "duplicate" ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-sky-200 bg-sky-50 px-6 py-5 text-sm text-sky-950"
        >
          Une réservation existe déjà pour cette candidature. Ouvrez-la depuis la
          liste des réservations plutôt que d’en créer une nouvelle.
        </section>
      ) : null}

      {hasLoadingError ? (
        <section
          role="alert"
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
        >
          <p className="font-semibold">Impossible de charger les données</p>
          <p className="mt-2 text-sm">
            Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
          </p>
        </section>
      ) : contacts.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed bg-surface px-6 py-12 text-center">
          <p className="text-lg font-semibold">Aucun contact disponible</p>
          <p className="mt-2 text-sm text-muted">
            Créez d’abord un contact depuis le module Contacts avant de créer une
            réservation.
          </p>
          <Link
            href="/contacts/new"
            className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Créer un contact
          </Link>
        </section>
      ) : (
        <NewReservationForm contacts={contacts} applications={applications} />
      )}
    </main>
  );
}
