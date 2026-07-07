import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import {
  formatPrice,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import {
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
import {
  getDocumentTypeLabel,
  getDocumentStatusLabel,
} from "@/features/documents/formatters";
import {
  getLitterStatusLabel,
  formatLitterDate,
} from "@/features/litters/formatters";
import { COMPLETE_DEPOSIT_AMOUNT_CENTS } from "@/features/payments/deposit-thresholds";

export const dynamic = "force-dynamic";

const quickLinks = [
  {
    href: "/candidature/golden-retriever-2026",
    title: "Formulaire public",
    description: "Le parcours de candidature à partager avec les adoptants.",
    status: "Public",
  },
  {
    href: "/contacts",
    title: "Contacts",
    description: "La fiche contact unique au centre du parcours adoptant.",
    status: "Privé",
  },
  {
    href: "/candidatures",
    title: "Candidatures",
    description: "La relecture des demandes envoyées depuis le formulaire.",
    status: "Privé",
  },
  {
    href: "/reservations",
    title: "Parcours adoptants",
    description: "Le cockpit des dossiers adoptants, paiements, documents, animal et suivi liés.",
    status: "Privé",
  },
  {
    href: "/payments",
    title: "Paiements",
    description: "La consultation des paiements, arrhes et remboursements.",
    status: "Privé",
  },
  {
    href: "/documents",
    title: "Documents",
    description: "Les documents reliés aux contacts, dossiers et paiements.",
    status: "Privé",
  },
  {
    href: "/litters",
    title: "Portées",
    description: "Les portées, animaux, parcours adoptants, notes et événements liés.",
    status: "Privé",
  },
  {
    href: "/animals",
    title: "Animaux",
    description: "Les animaux avec portée, réservation, documents, notes et événements.",
    status: "Privé",
  },
  {
    href: "/cheptel",
    title: "Cheptel",
    description: "Le cockpit synthétique des reproducteurs, chiots et statuts clés.",
    status: "Privé",
  },
];

const closedOrNegativeReservationStatuses = new Set([
  "adopted",
  "withdrawn",
  "cancelled",
  "expired",
  "archived",
]);

function isClosedOrNegativeReservationStatus(status: string | null | undefined) {
  return Boolean(status && closedOrNegativeReservationStatuses.has(status));
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unauthenticated landing page view
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
          <Link
            href="/login"
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Se connecter
          </Link>
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
              contacts, candidatures, parcours adoptants, paiements, documents, portées
              et animaux. Connectez-vous à l’espace privé pour piloter l’élevage.
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

  // 1. Authenticated Dashboard view data fetching
  // Load applications needing review
  const { data: rawApplications } = await supabase
    .from("application_overview")
    .select("id, contact_display_name, status, desired_sex_preference, breed, submitted_at, created_at")
    .in("status", ["new", "to_review"])
    .order("created_at", { ascending: false });
  const applicationsNeedReview = rawApplications || [];

  // Load requested/pending payments
  const { data: rawPayments } = await supabase
    .from("payments")
    .select("id, amount_cents, currency, payment_type, status, due_date, created_at, contact_id, reservation_id")
    .in("status", ["requested", "pending", "partially_paid"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Load documents to generate or sent (not signed)
  const { data: rawDocuments } = await supabase
    .from("documents")
    .select("id, title, document_type, status, signature_required, created_at, contact_id, reservation_id")
    .in("status", ["to_generate", "sent"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Load reservations for attention checks
  const { data: rawReservations } = await supabase
    .from("reservation_overview")
    .select("id, contact_id, contact_display_name, status, reserved_sex_preference, litter_name, litter_group_name, price_cents, paid_cents, currency, animal_id, animal_display_name, created_at")
    .order("created_at", { ascending: false });
  const reservationIds = (rawReservations || [])
    .map((reservation) => reservation.id)
    .filter((id): id is string => Boolean(id));
  const { data: rawPaidArrhesPayments } = reservationIds.length > 0
    ? await supabase
        .from("payments")
        .select("reservation_id, amount_cents")
        .in("reservation_id", reservationIds)
        .eq("payment_type", "arrhes")
        .eq("status", "paid")
        .is("deleted_at", null)
    : { data: [] };
  const paidArrhesCentsByReservationId = new Map<string, number>();

  for (const payment of rawPaidArrhesPayments || []) {
    if (!payment.reservation_id) {
      continue;
    }

    paidArrhesCentsByReservationId.set(
      payment.reservation_id,
      (paidArrhesCentsByReservationId.get(payment.reservation_id) ?? 0) +
        payment.amount_cents,
    );
  }
  const reservationStatusById = new Map(
    (rawReservations || []).map((reservation) => [
      reservation.id,
      reservation.status,
    ]),
  );
  const isActionableLinkedReservation = (reservationId: string | null) => {
    if (!reservationId) {
      return true;
    }

    return !isClosedOrNegativeReservationStatus(
      reservationStatusById.get(reservationId),
    );
  };
  const paymentsNeedAttention = (rawPayments || []).filter((payment) =>
    isActionableLinkedReservation(payment.reservation_id),
  );
  const documentsNeedAttention = (rawDocuments || []).filter((document) =>
    isActionableLinkedReservation(document.reservation_id),
  );
  const reservationsNeedAttention = (rawReservations || []).filter((r) => {
    const isPreResRequested = r.status === "pre_reservation_requested";
    const isPreResPaid = r.status === "pre_reservation_paid";
    const paidArrhesCents = r.id
      ? paidArrhesCentsByReservationId.get(r.id) ?? 0
      : 0;
    const isArrhesCompleteNoAnimal =
      paidArrhesCents >= COMPLETE_DEPOSIT_AMOUNT_CENTS &&
      !r.animal_id &&
      r.status !== "animal_assigned" &&
      !isClosedOrNegativeReservationStatus(r.status);
    return isPreResRequested || isPreResPaid || isArrhesCompleteNoAnimal;
  });

  // Load litters in progress
  const { data: rawLitters } = await supabase
    .from("litters")
    .select("id, name, status, expected_birth_date, actual_birth_date, mating_date, expected_puppy_count")
    .order("created_at", { ascending: false });
  const littersInProgress = (rawLitters || []).filter(
    (l) => l.status !== "closed" && l.status !== "cancelled" && l.status !== "archived"
  );

  // Collect and resolve unique contact names for payments and documents
  const contactIds = Array.from(
    new Set([
      ...paymentsNeedAttention.map((p) => p.contact_id).filter(Boolean),
      ...documentsNeedAttention.map((d) => d.contact_id).filter(Boolean),
    ])
  ) as string[];

  const contactMap: Record<string, string> = {};
  if (contactIds.length > 0) {
    const { data: contactsData } = await supabase
      .from("contacts")
      .select("id, display_name")
      .in("id", contactIds);
    if (contactsData) {
      contactsData.forEach((c) => {
        if (c.id && c.display_name) {
          contactMap[c.id] = c.display_name;
        }
      });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-12">
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">
            Espace privé · Tableau de bord
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
            SaaS Élevage
          </h1>
          <p className="mt-2 text-sm text-muted">
            Qu’est-ce qui demande mon attention aujourd’hui ?
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/50">
            Connecté
          </span>
        </div>
      </header>

      {/* Grid of Dashboard Flow Cards */}
      <section className="py-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. Candidats à suivre */}
          <div className="rounded-2xl border bg-surface p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-lg font-semibold text-foreground">Candidats à suivre</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  applicationsNeedReview.length > 0
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-muted-soft text-muted border border-border"
                }`}>
                  {applicationsNeedReview.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {applicationsNeedReview.length === 0 ? (
                  <p className="text-sm text-muted py-2">Aucun candidat à relire pour l’instant.</p>
                ) : (
                  applicationsNeedReview.slice(0, 5).map((app) => (
                    <div key={app.id} className="flex flex-col gap-2 py-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <Link
                          href={`/candidatures/${app.id}`}
                          className="block font-semibold text-accent hover:underline"
                        >
                          {app.contact_display_name ?? "Candidat anonyme"}
                        </Link>
                        <span className="text-xs text-muted">
                          {app.breed ?? "Race non spécifiée"} · {getSexPreferenceLabel(app.desired_sex_preference)}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-muted sm:text-right">
                        {app.submitted_at || app.created_at ? formatLitterDate(app.submitted_at || app.created_at) : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <Link
                href="/candidatures"
                className="text-sm font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                Voir les candidats ({applicationsNeedReview.length}) →
              </Link>
            </div>
          </div>

          {/* 2. Paiements attendus */}
          <div className="rounded-2xl border bg-surface p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-lg font-semibold text-foreground">Paiements attendus</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  paymentsNeedAttention.length > 0
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-muted-soft text-muted border border-border"
                }`}>
                  {paymentsNeedAttention.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {paymentsNeedAttention.length === 0 ? (
                  <p className="text-sm text-muted py-2">Aucun paiement attendu pour l’instant.</p>
                ) : (
                  paymentsNeedAttention.slice(0, 5).map((pay) => {
                    const contactName = pay.contact_id ? contactMap[pay.contact_id] : null;
                    return (
                      <div key={pay.id} className="flex flex-col gap-2 py-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <Link
                            href={`/payments/${pay.id}`}
                            className="block font-semibold text-accent hover:underline"
                          >
                            {formatPrice(pay.amount_cents, pay.currency)} — {getPaymentTypeLabel(pay.payment_type)}
                          </Link>
                          <span className="text-xs text-muted">
                            {contactName ? `Contact : ${contactName}` : "Contact non chargé"}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-muted sm:text-right">
                          {pay.due_date ? `Échéance : ${formatLitterDate(pay.due_date)}` : "Sans échéance"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <Link
                href="/payments"
                className="text-sm font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                Voir les paiements attendus ({paymentsNeedAttention.length}) →
              </Link>
            </div>
          </div>

          {/* 3. Documents à traiter */}
          <div className="rounded-2xl border bg-surface p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-lg font-semibold text-foreground">Documents à traiter</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  documentsNeedAttention.length > 0
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-muted-soft text-muted border border-border"
                }`}>
                  {documentsNeedAttention.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {documentsNeedAttention.length === 0 ? (
                  <p className="text-sm text-muted py-2">Aucun document à traiter pour l’instant.</p>
                ) : (
                  documentsNeedAttention.slice(0, 5).map((doc) => {
                    const contactName = doc.contact_id ? contactMap[doc.contact_id] : null;
                    return (
                      <div key={doc.id} className="flex flex-col gap-2 py-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="block font-semibold text-accent hover:underline"
                          >
                            {doc.title || getDocumentTypeLabel(doc.document_type)}
                          </Link>
                          <span className="text-xs text-muted">
                            {contactName ? `Contact : ${contactName}` : "Contact non chargé"}
                          </span>
                        </div>
                        <span className="h-fit self-start rounded border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 sm:self-center sm:text-right">
                          {getDocumentStatusLabel(doc.status, doc.document_type)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <Link
                href="/documents"
                className="text-sm font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                Voir tous les documents ({documentsNeedAttention.length}) →
              </Link>
            </div>
          </div>

          {/* 4. Parcours adoptants à suivre */}
          <div className="rounded-2xl border bg-surface p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-lg font-semibold text-foreground">Parcours adoptants à suivre</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  reservationsNeedAttention.length > 0
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-muted-soft text-muted border border-border"
                }`}>
                  {reservationsNeedAttention.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {reservationsNeedAttention.length === 0 ? (
                  <p className="text-sm text-muted py-2">Aucun parcours adoptant à suivre pour l’instant.</p>
                ) : (
                  reservationsNeedAttention.slice(0, 5).map((res) => {
                    const paidArrhesCents = res.id
                      ? paidArrhesCentsByReservationId.get(res.id) ?? 0
                      : 0;
                    const isArrhesCompleteNoAnimal =
                      paidArrhesCents >= COMPLETE_DEPOSIT_AMOUNT_CENTS &&
                      !res.animal_id &&
                      res.status !== "animal_assigned" &&
                      !isClosedOrNegativeReservationStatus(res.status);
                    let detailText = getReservationStatusLabel(res.status);
                    if (isArrhesCompleteNoAnimal) {
                      detailText = "Arrhes complètes — animal non attribué";
                    }
                    if (res.status === "pre_reservation_paid") {
                      detailText = isArrhesCompleteNoAnimal
                        ? "Dossier en pré-réservation réglée — arrhes complètes"
                        : "Dossier en pré-réservation réglée";
                    }
                    return (
                      <div key={res.id} className="flex flex-col gap-2 py-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <Link
                            href={`/reservations/${res.id}`}
                            className="block font-semibold text-accent hover:underline"
                          >
                            {res.contact_display_name ?? "Contact anonyme"}
                          </Link>
                          <span className="text-xs text-muted font-normal">
                            {res.litter_name || res.litter_group_name || "Aucune portée liée"}
                          </span>
                        </div>
                        <span className={`h-fit max-w-full self-start whitespace-normal rounded border px-2 py-0.5 text-left text-[11px] font-medium sm:max-w-[170px] sm:self-center sm:text-right ${
                          isArrhesCompleteNoAnimal
                            ? "text-emerald-700 bg-emerald-50 border-emerald-200/60"
                            : "text-amber-700 bg-amber-50 border-amber-200/60"
                        }`}>
                          {detailText}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <Link
                href="/reservations"
                className="text-sm font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                Voir les parcours adoptants à suivre ({reservationsNeedAttention.length}) →
              </Link>
            </div>
          </div>

          {/* 5. Portées en cours */}
          <div className="rounded-2xl border bg-surface p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-lg font-semibold text-foreground">Portées en cours</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  littersInProgress.length > 0
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-muted-soft text-muted border border-border"
                }`}>
                  {littersInProgress.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {littersInProgress.length === 0 ? (
                  <p className="text-sm text-muted py-2">Aucune portée en cours pour l’instant.</p>
                ) : (
                  littersInProgress.slice(0, 5).map((lit) => {
                    const dateLabel = lit.actual_birth_date
                      ? "Née le"
                      : lit.expected_birth_date
                      ? "Attendue le"
                      : "Saillie le";
                    const dateValue = lit.actual_birth_date
                      ? lit.actual_birth_date
                      : lit.expected_birth_date
                      ? lit.expected_birth_date
                      : lit.mating_date;
                    return (
                      <div key={lit.id} className="flex flex-col gap-2 py-1 text-sm sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <Link
                            href={`/litters/${lit.id}`}
                            className="block font-semibold text-accent hover:underline"
                          >
                            {lit.name || `Portée ${lit.id.slice(0, 8)}`}
                          </Link>
                          <span className="text-xs text-muted">
                            {dateLabel} {dateValue ? formatLitterDate(dateValue) : "Non précisée"}
                          </span>
                        </div>
                        <span className="h-fit self-start rounded border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 sm:self-center sm:text-right">
                          {getLitterStatusLabel(lit.status)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <Link
                href="/litters"
                className="text-sm font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                Voir toutes les portées ({littersInProgress.length}) →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t pt-6 text-sm text-muted">
        Phase 1 — consultation d’abord, écritures métier ajoutées par petites PRs ciblées.
      </footer>
    </main>
  );
}
