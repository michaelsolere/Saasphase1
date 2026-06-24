import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { createReservationFromApplication } from "@/features/applications/actions";
import { NoteForm } from "@/features/applications/note-form";
import { QualificationActions } from "@/features/applications/qualification-actions";
import type { ApplicationDetail } from "@/features/applications/types";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import { formatPrice, getReservationStatusLabel } from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RelatedDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  signed_at: string | null;
  received_at: string | null;
  file_name: string | null;
  signature_required: boolean;
};

function getUsefulDocumentDate(document: RelatedDocument) {
  if (document.signed_at) {
    return { label: "Signé le", value: document.signed_at };
  }

  if (document.received_at) {
    return { label: "Reçu le", value: document.received_at };
  }

  if (document.sent_at) {
    return { label: "Envoyé le", value: document.sent_at };
  }

  if (document.updated_at) {
    return { label: "Mis à jour le", value: document.updated_at };
  }

  return { label: "Créé le", value: document.created_at };
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Candidature introuvable</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Cette candidature n’existe pas ou vous n’êtes pas autorisé à la
        consulter.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux candidatures
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
        Impossible de charger la candidature
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/candidatures"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux candidatures
      </Link>
    </section>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6">
        {value || "Non renseigné"}
      </dd>
    </div>
  );
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    action?: string;
    note_status?: string;
    reservation_status?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("application_overview")
    .select(
      "id, organization_id, contact_id, contact_display_name, contact_email, contact_phone, desired_sex_preference, project_description, status, public_form_name, public_form_slug, species, breed, submitted_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const application = data as ApplicationDetail | null;

  const applicationId = application?.id;
  const { data: notes } = applicationId
    ? await supabase
        .from("notes")
        .select("id, body, created_at, created_by, profiles!created_by ( display_name )")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
    : { data: null };

  // Fetch reservations
  const { data: rawReservations, error: reservationsError } = applicationId
    ? await supabase
        .from("reservation_overview")
        .select("id, status, litter_name, litter_group_name, price_cents, paid_cents, currency, animal_display_name, reserved_sex_preference, created_at")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const applicationReservations = rawReservations as ReservationOverview[] | null;
  const hasApplicationReservation =
    Boolean(applicationReservations && applicationReservations.length > 0);
  const canCreateDraftReservation =
    application?.status === "qualified" &&
    !reservationsError &&
    applicationReservations !== null &&
    !hasApplicationReservation;

  // Fetch documents
  const { data: rawDocuments, error: documentsError } = applicationId
    ? await supabase
        .from("documents")
        .select("id, title, document_type, status, created_at, updated_at, sent_at, signed_at, received_at, file_name, signature_required")
        .eq("application_id", applicationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const applicationDocuments = rawDocuments as RelatedDocument[] | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <Link
        href="/candidatures"
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Retour aux candidatures
      </Link>

      <div className="mt-8">
        {error ? (
          <ErrorMessage />
        ) : !application ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            {query.action === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                Le statut de la candidature a bien été mis à jour.
              </p>
            ) : null}

            {query.action === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La candidature n’a pas pu être mise à jour. Réessayez.
              </p>
            ) : null}

            {query.note_status === "success" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La note interne a bien été ajoutée.
              </p>
            ) : null}

            {query.note_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La note n’a pas pu être ajoutée. Réessayez.
              </p>
            ) : null}

            {query.reservation_status === "created" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                La réservation brouillon a bien été créée. Elle apparaît
                maintenant dans la section Réservations liées.
              </p>
            ) : null}

            {query.reservation_status === "already_exists" ? (
              <p
                role="status"
                className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
              >
                Une réservation existe déjà pour cette candidature. Consultez
                la section Réservations liées pour l’ouvrir.
              </p>
            ) : null}

            {query.reservation_status === "not_qualified" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Seule une candidature qualifiée peut créer une réservation
                brouillon. Vérifiez d’abord le statut de qualification.
              </p>
            ) : null}

            {query.reservation_status === "error" ? (
              <p
                role="alert"
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                La réservation brouillon n’a pas pu être créée. Aucune donnée
                n’a été modifiée, vous pouvez réessayer.
              </p>
            ) : null}

            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Candidature · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {application.contact_display_name ??
                    "Candidature sans nom disponible"}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Soumise le{" "}
                  {formatApplicationDate(
                    application.submitted_at ?? application.created_at,
                  )}
                </p>
              </div>
              <span
                className={
                  application.status === "to_review"
                    ? "w-fit rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                    : "w-fit rounded-full border bg-surface px-3 py-1.5 text-sm font-semibold text-muted"
                }
              >
                {getApplicationStatusLabel(application.status)}
              </span>
            </header>

            {application.id ? (
              <section className="border-b py-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="font-semibold">Qualification</h2>
                    <p className="mt-1 text-sm text-muted">
                      Choisissez la prochaine étape de cette candidature.
                    </p>
                  </div>
                  <QualificationActions
                    applicationId={application.id}
                    status={application.status}
                  />
                </div>
              </section>
            ) : null}

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Projet d’adoption</h2>
                  <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                    {application.project_description ||
                      "Aucune description du projet n’a été renseignée."}
                  </p>

                  <dl className="mt-8 grid gap-6 border-t pt-7 sm:grid-cols-2">
                    <DetailItem
                      label="Préférence de sexe"
                      value={getSexPreferenceLabel(
                        application.desired_sex_preference,
                      )}
                    />
                    <DetailItem
                      label="Espèce et race"
                      value={
                        [application.species, application.breed]
                          .filter(Boolean)
                          .join(" · ") || null
                      }
                    />
                    <DetailItem
                      label="Formulaire source"
                      value={
                        application.public_form_name ??
                        application.public_form_slug
                      }
                    />
                    <DetailItem
                      label="Statut"
                      value={getApplicationStatusLabel(application.status)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Réservations liées
                      </h2>
                      <p className="mt-2 text-sm text-muted">
                        Une candidature qualifiée peut créer une réservation
                        en statut brouillon. Elle sera ajoutée ici, sans
                        paiement, document ou attribution animal.
                      </p>
                    </div>

                    {canCreateDraftReservation && applicationId ? (
                      <form action={createReservationFromApplication}>
                        <input
                          type="hidden"
                          name="application_id"
                          value={applicationId}
                        />
                        <button
                          type="submit"
                          className="inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                        >
                          Créer une réservation brouillon
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {reservationsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les réservations liées.
                    </p>
                  ) : applicationReservations && applicationReservations.length > 0 ? (
                    <div className="divide-y divide-border">
                      {applicationReservations.map((res) => {
                        const targetLitter =
                          res.litter_name ??
                          res.litter_group_name ??
                          "Portée non précisée";
                        const dateText = formatApplicationDate(res.created_at);

                        return (
                          <div
                            key={res.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-foreground text-sm">
                                    {targetLitter}
                                  </span>
                                  <span
                                    className={
                                      res.status === "active" ||
                                      res.status === "confirmed_after_birth" ||
                                      res.status === "animal_assigned"
                                        ? "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                                        : "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
                                    }
                                  >
                                    {getReservationStatusLabel(res.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted">
                                  Préférence : {getSexPreferenceLabel(res.reserved_sex_preference)}
                                </p>
                                <p className="text-xs text-muted">
                                  Tarif : {formatPrice(res.price_cents, res.currency)}
                                  {res.paid_cents !== null && res.paid_cents !== undefined && res.paid_cents > 0 ? (
                                    <span className="text-emerald-700 ml-2 font-medium">
                                      (Payé : {formatPrice(res.paid_cents, res.currency)})
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-muted">
                                  Animal : {res.animal_display_name ?? "Non attribué"}
                                </p>
                                <p className="text-xs text-muted">
                                  Créée le {dateText}
                                </p>
                              </div>
                              {res.id ? (
                                <Link
                                  href={`/reservations/${res.id}`}
                                  className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft self-start sm:self-center"
                                >
                                  Consulter
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucune réservation liée à cette candidature.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold mb-6">
                    Documents liés
                  </h2>

                  {documentsError ? (
                    <p role="alert" className="text-sm text-amber-800">
                      Impossible de charger les documents liés.
                    </p>
                  ) : applicationDocuments && applicationDocuments.length > 0 ? (
                    <div className="divide-y divide-border">
                      {applicationDocuments.map((document) => {
                        const usefulDate = getUsefulDocumentDate(document);

                        return (
                          <div
                            key={document.id}
                            className="py-5 first:pt-0 last:pb-0"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold text-foreground text-sm">
                                  {document.title}
                                </span>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                                  {getDocumentStatusLabel(document.status)}
                                </span>
                              </div>
                              <p className="text-xs text-muted">
                                Type : {getDocumentTypeLabel(document.document_type)}
                              </p>
                              <p className="text-xs text-muted">
                                {usefulDate.label}{" "}
                                {formatApplicationDate(usefulDate.value)}
                              </p>
                              <p className="text-xs text-muted">
                                Fichier : {document.file_name || "Non renseigné"}
                              </p>
                              <p className="text-xs text-muted">
                                Signature requise :{" "}
                                {getSignatureRequiredLabel(
                                  document.signature_required,
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Aucun document lié à cette candidature.
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Notes internes</h2>

                  <div className="mt-6 space-y-6">
                    {notes && notes.length > 0 ? (
                      <div className="divide-y divide-border">
                        {notes.map((note) => {
                          const authorName =
                            (
                              note.profiles as
                                | { display_name: string | null }
                                | null
                            )?.display_name || "Auteur inconnu";
                          return (
                            <div
                              key={note.id}
                              className="py-4 first:pt-0 last:pb-0"
                            >
                              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                {note.body}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                                <span>Par {authorName}</span>
                                <span>•</span>
                                <span>
                                  {formatApplicationDate(note.created_at)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">
                        Aucune note interne pour le moment.
                      </p>
                    )}
                  </div>

                  {application.id && application.organization_id ? (
                    <NoteForm
                      applicationId={application.id}
                      organizationId={application.organization_id}
                    />
                  ) : null}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6">
                <h2 className="text-lg font-semibold">Contact lié</h2>
                <dl className="mt-6 space-y-6">
                  <DetailItem
                    label="Nom"
                    value={application.contact_display_name}
                  />
                  <DetailItem
                    label="Email"
                    value={application.contact_email}
                  />
                  <DetailItem
                    label="Téléphone"
                    value={application.contact_phone}
                  />
                </dl>
                {application.contact_id ? (
                  <div className="mt-7 border-t pt-5">
                    <Link
                      href={`/contacts/${application.contact_id}`}
                      className="inline-flex w-full justify-center rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Voir le contact
                    </Link>
                  </div>
                ) : (
                  <p className="mt-7 border-t pt-5 text-xs leading-5 text-muted">
                    La gestion complète du contact sera ajoutée dans un module
                    dédié.
                  </p>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
