import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AttachApplicationForm,
  AttachReservationForm,
  LinkedApplicationsSection,
  type AttachableApplication,
  type AttachableReservation,
  type LinkedApplication,
} from "@/features/litters/linked-records";
import {
  formatLitterDate,
  getLitterDisplayName,
  getLitterGroupStatusLabel,
  getLitterStatusLabel,
  getSpeciesLabel,
} from "@/features/litters/formatters";
import { getReservationStatusLabel } from "@/features/reservations/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export const dynamic = "force-dynamic";

type DBLitterGroup = Pick<
  Database["public"]["Tables"]["litter_groups"]["Row"],
  | "id"
  | "organization_id"
  | "name"
  | "description"
  | "species"
  | "status"
  | "expected_period_start"
  | "expected_period_end"
  | "created_at"
  | "updated_at"
>;
type GroupLitter = Pick<
  Database["public"]["Views"]["litter_overview"]["Row"],
  | "id"
  | "name"
  | "status"
  | "mother_display_name"
  | "father_display_name"
  | "expected_birth_date"
  | "actual_birth_date"
>;
type GroupReservation = Pick<
  Database["public"]["Views"]["reservation_overview"]["Row"],
  | "id"
  | "contact_id"
  | "contact_display_name"
  | "status"
  | "litter_id"
  | "litter_name"
  | "animal_id"
  | "animal_display_name"
>;

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Groupe de portées introuvable ou inaccessible.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Ce groupe n’existe pas ou vous n’êtes pas autorisé à le consulter.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux portées
      </Link>
    </section>
  );
}

function ErrorMessage() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h1 className="text-xl font-semibold">
        Impossible de charger le groupe de portées
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/litters"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux portées
      </Link>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">{value || "Non renseigné"}</dd>
    </div>
  );
}

function formatPeriod(start: string | null, end: string | null) {
  if (start && end) {
    return `Du ${formatLitterDate(start)} au ${formatLitterDate(end)}`;
  }

  if (start) {
    return `À partir du ${formatLitterDate(start)}`;
  }

  if (end) {
    return `Jusqu’au ${formatLitterDate(end)}`;
  }

  return "Non renseignée";
}

export default async function LitterGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    attach_status?: string;
    reservation_attach_status?: string;
  }>;
}) {
  const { id } = await params;
  const { attach_status, reservation_attach_status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawGroup, error: readError } = await supabase
    .from("litter_groups")
    .select(
      "id, organization_id, name, description, species, status, expected_period_start, expected_period_end, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const group = rawGroup as DBLitterGroup | null;

  // Portées du groupe.
  const { data: rawGroupLitters, error: littersError } = group
    ? await supabase
        .from("litter_overview")
        .select(
          "id, name, status, mother_display_name, father_display_name, expected_birth_date, actual_birth_date",
        )
        .eq("litter_group_id", id)
        .order("expected_birth_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const groupLitters = rawGroupLitters as GroupLitter[] | null;

  // Réservations rattachées au groupe.
  const { data: rawGroupReservations, error: reservationsError } = group
    ? await supabase
        .from("reservation_overview")
        .select(
          "id, contact_id, contact_display_name, status, litter_id, litter_name, animal_id, animal_display_name",
        )
        .eq("litter_group_id", id)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const groupReservations = rawGroupReservations as GroupReservation[] | null;

  // Candidatures souhaitant ce groupe (lecture seule).
  const { data: rawLinkedApplications, error: linkedAppsError } =
    group && group.organization_id
      ? await supabase
          .from("applications")
          .select(
            "id, contact_id, species, breed, desired_sex_preference, status, created_at",
          )
          .eq("organization_id", group.organization_id)
          .eq("desired_litter_group_id", id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null, error: null };

  let linkedApplications: LinkedApplication[] | null = null;

  if (
    rawLinkedApplications &&
    rawLinkedApplications.length > 0 &&
    group &&
    group.organization_id
  ) {
    const linkedContactIds = Array.from(
      new Set(
        rawLinkedApplications
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    const contactNameMap = new Map<string, string | null>();

    if (linkedContactIds.length > 0) {
      const { data: linkedContacts } = await supabase
        .from("contacts")
        .select("id, display_name")
        .eq("organization_id", group.organization_id)
        .in("id", linkedContactIds);

      linkedContacts?.forEach((contact) => {
        contactNameMap.set(contact.id, contact.display_name);
      });
    }

    linkedApplications = rawLinkedApplications.map((app) => ({
      id: app.id,
      contact_id: app.contact_id,
      contact_display_name: app.contact_id
        ? (contactNameMap.get(app.contact_id) ?? null)
        : null,
      species: app.species,
      breed: app.breed,
      desired_sex_preference: app.desired_sex_preference,
      status: app.status,
      created_at: app.created_at,
    }));
  } else if (rawLinkedApplications) {
    linkedApplications = [];
  }

  // Candidatures rattachables à ce groupe (hors archivées, hors déjà liées
  // à ce groupe), pour l'action manuelle de rattachement.
  const { data: rawAttachableApplications } =
    group && group.organization_id
      ? await supabase
          .from("applications")
          .select(
            "id, contact_id, status, created_at, desired_litter_id, desired_litter_group_id",
          )
          .eq("organization_id", group.organization_id)
          .neq("status", "archived")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  let attachableApplications: AttachableApplication[] = [];

  if (
    rawAttachableApplications &&
    rawAttachableApplications.length > 0 &&
    group &&
    group.organization_id
  ) {
    const candidates = rawAttachableApplications.filter(
      (app) => app.desired_litter_group_id !== id,
    );

    const attachableContactIds = Array.from(
      new Set(
        candidates
          .map((app) => app.contact_id)
          .filter((cid): cid is string => Boolean(cid)),
      ),
    );

    const attachableContactMap = new Map<string, string | null>();

    if (attachableContactIds.length > 0) {
      const { data: attachableContacts } = await supabase
        .from("contacts")
        .select("id, display_name")
        .eq("organization_id", group.organization_id)
        .in("id", attachableContactIds);

      attachableContacts?.forEach((contact) => {
        attachableContactMap.set(contact.id, contact.display_name);
      });
    }

    attachableApplications = candidates.map((app) => ({
      id: app.id,
      contact_display_name: app.contact_id
        ? (attachableContactMap.get(app.contact_id) ?? null)
        : null,
      status: app.status,
      created_at: app.created_at,
      already_attached_elsewhere: Boolean(
        app.desired_litter_id || app.desired_litter_group_id,
      ),
    }));
  }

  const attachBanner =
    attach_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        La candidature a été rattachée à ce groupe. Son statut n’a pas été
        modifié et aucune réservation n’a été créée.
      </p>
    ) : attach_status === "error" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible de rattacher la candidature. Aucune modification n’a été
        appliquée.
      </p>
    ) : null;

  // Réservations rattachables à ce groupe (même organisation, hors déjà liées
  // à ce groupe). Celles avec animal attribué restent visibles mais désactivées.
  const { data: rawAttachableReservations } =
    group && group.organization_id
      ? await supabase
          .from("reservation_overview")
          .select(
            "id, contact_display_name, status, litter_id, litter_name, litter_group_id, litter_group_name, animal_id",
          )
          .eq("organization_id", group.organization_id)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null };

  const attachableReservations: AttachableReservation[] = (
    rawAttachableReservations ?? []
  )
    .filter((reservation) => reservation.litter_group_id !== id)
    .map((reservation) => ({
      id: reservation.id as string,
      contact_display_name: reservation.contact_display_name,
      status: reservation.status,
      litter_name: reservation.litter_name,
      litter_group_name: reservation.litter_group_name,
      has_animal: Boolean(reservation.animal_id),
    }));

  const reservationAttachBanner =
    reservation_attach_status === "success" ? (
      <p
        role="status"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        La réservation a été rattachée à ce groupe. Son statut, ses paiements,
        documents et son animal éventuel n’ont pas été modifiés.
      </p>
    ) : reservation_attach_status === "animal_attributed" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Cette réservation a déjà un animal attribué. Retirez ou traitez d’abord
        cette attribution avant de changer la portée ou le groupe.
      </p>
    ) : reservation_attach_status === "error" ? (
      <p
        role="alert"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        Impossible de rattacher la réservation. Aucune modification n’a été
        appliquée.
      </p>
    ) : null;

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
          href="/litters"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux portées
        </Link>
      </div>

      <div className="mt-8">
        {readError ? (
          <ErrorMessage />
        ) : !group ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Groupe de portées
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {group.name || `Groupe ${group.id.slice(0, 8)}`}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatLitterDate(group.created_at)}
                </p>
              </div>
            </header>

            <div className="space-y-6 py-8">
              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Informations</h2>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <DetailItem
                    label="Nom"
                    value={group.name || `Groupe ${group.id.slice(0, 8)}`}
                  />
                  <DetailItem
                    label="Espèce"
                    value={getSpeciesLabel(group.species)}
                  />
                  <DetailItem
                    label="Statut"
                    value={getLitterGroupStatusLabel(group.status)}
                  />
                  <DetailItem
                    label="Période prévue"
                    value={formatPeriod(
                      group.expected_period_start,
                      group.expected_period_end,
                    )}
                  />
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Description
                    </dt>
                    <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                      {group.description || "Non renseignée"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold">Portées du groupe</h2>

                {littersError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger les portées du groupe.
                  </p>
                ) : !groupLitters || groupLitters.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">
                    Aucune portée rattachée à ce groupe.
                  </p>
                ) : (
                  <div className="mt-6 divide-y divide-border">
                    {groupLitters.map((litter) => {
                      const birthDate =
                        litter.actual_birth_date || litter.expected_birth_date;
                      const birthLabel = litter.actual_birth_date
                        ? "Naissance réelle"
                        : "Naissance prévue";

                      return (
                        <div
                          key={litter.id ?? litter.name}
                          className="py-5 first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold text-foreground">
                                  {getLitterDisplayName(litter.name, litter.id)}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  {getLitterStatusLabel(litter.status)}
                                </span>
                              </div>
                              <p className="text-xs text-muted">
                                Mère :{" "}
                                {litter.mother_display_name || "Non renseignée"}
                              </p>
                              <p className="text-xs text-muted">
                                Père :{" "}
                                {litter.father_display_name || "Non renseigné"}
                              </p>
                              <p className="text-xs text-muted">
                                {birthLabel} :{" "}
                                {birthDate
                                  ? formatLitterDate(birthDate)
                                  : "Non renseignée"}
                              </p>
                            </div>
                            {litter.id ? (
                              <Link
                                href={`/litters/${litter.id}`}
                                className="inline-flex self-start rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft sm:self-center"
                              >
                                Consulter
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <LinkedApplicationsSection
                title="Candidatures liées à ce groupe"
                emptyLabel="Aucune candidature ne souhaite ce groupe."
                applications={linkedApplications}
                hasError={Boolean(linkedAppsError)}
                sectionId="candidatures-liees"
                banner={attachBanner}
                footer={
                  <AttachApplicationForm
                    scope={{
                      kind: "group",
                      groupId: group.id,
                      label:
                        "Rattacher une candidature existante à ce groupe",
                      warning:
                        "Cette action modifiera la période souhaitée de la candidature (groupe), sans portée précise.",
                    }}
                    applications={attachableApplications}
                  />
                }
              />

              <section
                id="reservations-liees"
                className="rounded-2xl border bg-surface p-6 sm:p-8"
              >
                <h2 className="text-xl font-semibold">
                  Réservations liées à ce groupe
                </h2>

                {reservationAttachBanner}

                {reservationsError ? (
                  <p role="alert" className="mt-5 text-sm text-amber-800">
                    Impossible de charger les réservations liées.
                  </p>
                ) : !groupReservations || groupReservations.length === 0 ? (
                  <p className="mt-5 text-sm text-muted">
                    Aucune réservation rattachée à ce groupe.
                  </p>
                ) : (
                  <div className="mt-6 divide-y divide-border">
                    {groupReservations.map((reservation, index) => (
                      <div
                        key={reservation.id ?? `${reservation.contact_id}-${index}`}
                        className="py-5 first:pt-0 last:pb-0"
                      >
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-sm font-semibold text-foreground">
                                {reservation.contact_id ? (
                                  <Link
                                    href={`/contacts/${reservation.contact_id}`}
                                    className="text-accent hover:underline"
                                  >
                                    {reservation.contact_display_name ??
                                      "Contact non renseigné"}
                                  </Link>
                                ) : (
                                  reservation.contact_display_name ??
                                  "Contact non renseigné"
                                )}
                              </span>
                              <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                {getReservationStatusLabel(reservation.status)}
                              </span>
                            </div>
                            <p className="text-xs text-muted">
                              Portée :{" "}
                              {reservation.litter_id ? (
                                <Link
                                  href={`/litters/${reservation.litter_id}`}
                                  className="font-medium text-accent hover:underline"
                                >
                                  {reservation.litter_name ?? "Portée"}
                                </Link>
                              ) : (
                                "Aucune portée précise"
                              )}
                            </p>
                            <p className="text-xs text-muted">
                              Animal :{" "}
                              {reservation.animal_id ? (
                                <Link
                                  href={`/animals/${reservation.animal_id}`}
                                  className="font-medium text-accent hover:underline"
                                >
                                  {reservation.animal_display_name}
                                </Link>
                              ) : (
                                (reservation.animal_display_name ??
                                "Non attribué")
                              )}
                            </p>
                          </div>
                          {reservation.id ? (
                            <Link
                              href={`/reservations/${reservation.id}`}
                              className="inline-flex self-start rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft sm:self-center"
                            >
                              Consulter
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <AttachReservationForm
                  scope={{
                    kind: "group",
                    groupId: group.id,
                    label: "Rattacher une réservation existante à ce groupe",
                    warning:
                      "Cette action modifiera le rattachement portée/groupe de la réservation (groupe, sans portée précise).",
                  }}
                  reservations={attachableReservations}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
