import Link from "next/link";
import { redirect } from "next/navigation";

import { reservationNeedsAttention } from "@/features/reservations/attention";
import { ReservationList } from "@/features/reservations/reservation-list";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReservationsSearchParams = {
  filter?: string;
  litter_group_id?: string;
  litter_id?: string;
};

type LitterFilterOption = {
  id: string;
  name: string | null;
  litter_group_name: string | null;
};

type LitterGroupFilterOption = {
  id: string;
  name: string | null;
};

function normalizeFilterParam(value: string | undefined) {
  return value?.trim() || null;
}

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les réservations</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<ReservationsSearchParams>;
}) {
  const params = await searchParams;
  const selectedFilter = normalizeFilterParam(params.filter);
  const isAttentionFilter = selectedFilter === "attention";
  const selectedLitterGroupId = normalizeFilterParam(params.litter_group_id);
  const selectedLitterId = normalizeFilterParam(params.litter_id);
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let reservations = null;
  let litterGroups: LitterGroupFilterOption[] = [];
  let litters: LitterFilterOption[] = [];
  let hasLoadingError = Boolean(authError);

  let reservationQuery = supabase
    .from("reservation_overview")
    .select(
      "id, contact_id, contact_display_name, status, reserved_sex_preference, rank_active, rank_initial, litter_id, litter_name, litter_group_id, litter_group_name, price_cents, paid_cents, refunded_cents, currency, animal_id, animal_display_name, created_at"
    )
    .order("created_at", { ascending: false });

  if (selectedLitterGroupId) {
    reservationQuery = reservationQuery.eq(
      "litter_group_id",
      selectedLitterGroupId,
    );
  }

  if (selectedLitterId) {
    reservationQuery = reservationQuery.eq("litter_id", selectedLitterId);
  }

  const [result, litterGroupsResult, littersResult] = await Promise.all([
    reservationQuery,
    supabase
      .from("litter_groups")
      .select("id, name")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("litter_overview")
      .select("id, name, litter_group_name")
      .order("created_at", { ascending: false }),
  ]);

  reservations = result.data as ReservationOverview[] | null;
  if (isAttentionFilter && reservations) {
    const reservationIds = reservations
      .map((reservation) => reservation.id)
      .filter((id): id is string => Boolean(id));
    const paidArrhesCentsByReservationId = new Map<string, number>();

    if (reservationIds.length > 0) {
      const { data: rawPaidArrhesPayments, error: paidArrhesError } =
        await supabase
          .from("payments")
          .select("reservation_id, amount_cents")
          .in("reservation_id", reservationIds)
          .eq("payment_type", "arrhes")
          .eq("status", "paid")
          .is("deleted_at", null);

      hasLoadingError = hasLoadingError || Boolean(paidArrhesError);

      for (const payment of rawPaidArrhesPayments ?? []) {
        if (!payment.reservation_id) {
          continue;
        }

        paidArrhesCentsByReservationId.set(
          payment.reservation_id,
          (paidArrhesCentsByReservationId.get(payment.reservation_id) ?? 0) +
            payment.amount_cents,
        );
      }
    }

    reservations = reservations.filter((reservation) => {
      const paidArrhesCents = reservation.id
        ? paidArrhesCentsByReservationId.get(reservation.id) ?? 0
        : 0;

      return reservationNeedsAttention(reservation, paidArrhesCents);
    });
  }
  litterGroups = (litterGroupsResult.data ?? []) as LitterGroupFilterOption[];
  litters = (littersResult.data ?? []) as LitterFilterOption[];
  hasLoadingError =
    hasLoadingError ||
    Boolean(result.error) ||
    Boolean(litterGroupsResult.error) ||
    Boolean(littersResult.error);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Parcours adoptants
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Consultez les dossiers adoptants en cours, du premier engagement au départ.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/reservations/new"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold !text-white transition hover:!text-white hover:opacity-90"
            >
              Nouvelle réservation
            </Link>
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          </div>
        </div>
      </header>

      <section className="py-8">
        {hasLoadingError || !reservations ? (
          <ErrorMessage />
        ) : (
          <>
            {isAttentionFilter ? (
              <div className="mb-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">Filtre : parcours adoptants à suivre</p>
                <Link
                  href="/reservations"
                  className="font-semibold text-amber-950 underline-offset-4 hover:underline"
                >
                  Voir tous les parcours
                </Link>
              </div>
            ) : null}

            <form
              key={`${selectedFilter ?? "all"}-${selectedLitterGroupId ?? "all"}-${selectedLitterId ?? "all"}`}
              action="/reservations"
              className="mb-5 rounded-2xl border bg-surface p-5"
            >
              {isAttentionFilter ? (
                <input type="hidden" name="filter" value="attention" />
              ) : null}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <div>
                  <label
                    htmlFor="litter-group-filter"
                    className="text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    Groupe de portées
                  </label>
                  <select
                    id="litter-group-filter"
                    name="litter_group_id"
                    defaultValue={selectedLitterGroupId ?? ""}
                    className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">Tous les groupes</option>
                    {litterGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name ?? `Groupe ${group.id.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="litter-filter"
                    className="text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    Portée
                  </label>
                  <select
                    id="litter-filter"
                    name="litter_id"
                    defaultValue={selectedLitterId ?? ""}
                    className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">Toutes les portées</option>
                    {litters.map((litter) => (
                      <option key={litter.id} value={litter.id}>
                        {[
                          litter.name ?? `Portée ${litter.id.slice(0, 8)}`,
                          litter.litter_group_name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Filtrer
                  </button>
                  <Link
                    href="/reservations"
                    className="rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                  >
                    Réinitialiser
                  </Link>
                </div>
              </div>
            </form>

            <ReservationList reservations={reservations} />
          </>
        )}
      </section>
    </main>
  );
}
