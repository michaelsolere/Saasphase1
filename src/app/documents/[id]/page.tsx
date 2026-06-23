import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import type { DBDocument } from "@/features/documents/types";
import {
  formatPrice,
  getReservationStatusLabel,
} from "@/features/reservations/formatters";
import type { ReservationOverview } from "@/features/reservations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RelatedContact = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  contact_type: string;
  primary_status: string;
  origin_channel: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  created_at: string;
  updated_at: string;
};

const contactTypeLabels: Record<string, string> = {
  person: "Personne",
  family: "Famille",
  organization: "Organisation",
  professional: "Professionnel",
  other: "Autre",
};

const contactStatusLabels: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  archived: "Archivé",
  blocked: "Bloqué",
};

const originChannelLabels: Record<string, string> = {
  public_form: "Formulaire public",
  manual: "Saisie manuelle",
  referral: "Recommandation",
  social_media: "Réseaux sociaux",
  phone: "Téléphone",
  email: "Email",
  other: "Autre",
};

function formatFileSize(value: number | null) {
  if (value === null || value === undefined) {
    return "Non renseigné";
  }

  if (value < 1024) {
    return `${value} o`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} Ko`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function booleanLabel(value: boolean | null) {
  return value ? "Oui" : "Non";
}

function getContactTypeLabel(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  return contactTypeLabels[value] ?? value.replaceAll("_", " ");
}

function getContactStatusLabel(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  return contactStatusLabels[value] ?? value.replaceAll("_", " ");
}

function getOriginChannelLabel(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  return originChannelLabels[value] ?? value.replaceAll("_", " ");
}

function formatCountry(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  return value === "FR" ? "France" : value;
}

function NotFoundOrUnauthorized() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        Document introuvable ou inaccessible
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
        Ce document n’existe pas ou vous n’êtes pas autorisé à le consulter.
      </p>
      <Link
        href="/documents"
        className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Retour aux documents
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
        Impossible de charger le document
      </h1>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
      <Link
        href="/documents"
        className="mt-6 inline-flex text-sm font-semibold underline"
      >
        Retour aux documents
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

function RelatedBusinessLinks({ document }: { document: DBDocument }) {
  const links = [
    document.contact_id
      ? { href: `/contacts/${document.contact_id}`, label: "Contact" }
      : null,
    document.application_id
      ? { href: `/candidatures/${document.application_id}`, label: "Candidature" }
      : null,
    document.reservation_id
      ? { href: `/reservations/${document.reservation_id}`, label: "Réservation" }
      : null,
    document.payment_id
      ? { href: `/payments/${document.payment_id}`, label: "Paiement" }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  if (links.length === 0) {
    return (
      <p className="text-sm text-muted">Aucun lien métier renseigné.</p>
    );
  }

  return (
    <div className="space-y-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex w-full justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawDocument, error: readError } = await supabase
    .from("documents")
    .select(
      "id, title, document_type, status, created_at, updated_at, sent_at, received_at, signed_at, expires_at, archived_at, file_name, file_path, file_size_bytes, mime_type, signature_required, generated_from_template, generated_at, notes, contact_id, application_id, reservation_id, payment_id, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const document = rawDocument as DBDocument | null;

  const { data: rawContact, error: contactError } = document?.contact_id
    ? await supabase
        .from("contacts")
        .select(
          "id, display_name, first_name, last_name, email, phone, secondary_phone, contact_type, primary_status, origin_channel, postal_code, city, country, created_at, updated_at, deleted_at",
        )
        .eq("id", document.contact_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  const relatedContact = rawContact as RelatedContact | null;

  const { data: rawReservation, error: reservationError } =
    document?.reservation_id
      ? await supabase
          .from("reservation_overview")
          .select(
            "id, contact_id, contact_display_name, animal_id, animal_display_name, litter_id, litter_name, litter_group_id, litter_group_name, status, reserved_sex_preference, price_cents, currency, paid_cents, refunded_cents, created_at, updated_at",
          )
          .eq("id", document.reservation_id)
          .maybeSingle()
      : { data: null, error: null };

  const relatedReservation = rawReservation as ReservationOverview | null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <Link
        href="/documents"
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Retour aux documents
      </Link>

      <div className="mt-8">
        {readError ? (
          <ErrorMessage />
        ) : !document ? (
          <NotFoundOrUnauthorized />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent">
                  Document · Lecture seule
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {document.title}
                </h1>
                <p className="mt-3 text-sm text-muted">
                  Créé le {formatApplicationDate(document.created_at)}
                </p>
              </div>
              <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-sm font-semibold text-muted">
                {getDocumentStatusLabel(document.status)}
              </span>
            </header>

            <div className="grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Informations du document
                  </h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem label="Titre" value={document.title} />
                    <DetailItem
                      label="Type"
                      value={getDocumentTypeLabel(document.document_type)}
                    />
                    <DetailItem
                      label="Statut"
                      value={getDocumentStatusLabel(document.status)}
                    />
                    <DetailItem
                      label="Signature requise"
                      value={getSignatureRequiredLabel(
                        document.signature_required,
                      )}
                    />
                    <DetailItem
                      label="Généré depuis modèle"
                      value={booleanLabel(document.generated_from_template)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">Contact lié</h2>
                      {relatedContact ? (
                        <p className="mt-2 text-sm text-muted">
                          {relatedContact.display_name}
                        </p>
                      ) : null}
                    </div>
                    {relatedContact?.id ? (
                      <Link
                        href={`/contacts/${relatedContact.id}`}
                        className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter
                      </Link>
                    ) : null}
                  </div>

                  {contactError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger le contact lié.
                    </p>
                  ) : !relatedContact ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucun contact lié à ce document.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem
                        label="Nom affichable"
                        value={relatedContact.display_name}
                      />
                      <DetailItem
                        label="Prénom"
                        value={relatedContact.first_name}
                      />
                      <DetailItem label="Nom" value={relatedContact.last_name} />
                      <DetailItem label="Email" value={relatedContact.email} />
                      <DetailItem
                        label="Téléphone"
                        value={relatedContact.phone}
                      />
                      <DetailItem
                        label="Téléphone secondaire"
                        value={relatedContact.secondary_phone}
                      />
                      <DetailItem
                        label="Type de contact"
                        value={getContactTypeLabel(relatedContact.contact_type)}
                      />
                      <DetailItem
                        label="Statut"
                        value={getContactStatusLabel(
                          relatedContact.primary_status,
                        )}
                      />
                      <DetailItem
                        label="Origine"
                        value={getOriginChannelLabel(
                          relatedContact.origin_channel,
                        )}
                      />
                      <DetailItem label="Ville" value={relatedContact.city} />
                      <DetailItem
                        label="Code postal"
                        value={relatedContact.postal_code}
                      />
                      <DetailItem
                        label="Pays"
                        value={formatCountry(relatedContact.country)}
                      />
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h2 className="text-xl font-semibold">
                        Réservation liée
                      </h2>
                      {relatedReservation ? (
                        <p className="mt-2 text-sm text-muted">
                          {relatedReservation.contact_display_name ??
                            "Contact non renseigné"}
                        </p>
                      ) : null}
                    </div>
                    {relatedReservation?.id ? (
                      <Link
                        href={`/reservations/${relatedReservation.id}`}
                        className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter
                      </Link>
                    ) : null}
                  </div>

                  {reservationError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger la réservation liée.
                    </p>
                  ) : !relatedReservation ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucune réservation liée à ce document.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem
                        label="Statut"
                        value={getReservationStatusLabel(
                          relatedReservation.status,
                        )}
                      />
                      <DetailItem
                        label="Contact"
                        value={relatedReservation.contact_display_name}
                      />
                      <DetailItem
                        label="Animal"
                        value={relatedReservation.animal_display_name}
                      />
                      <DetailItem
                        label="Portée"
                        value={relatedReservation.litter_name}
                      />
                      <DetailItem
                        label="Groupe de portée"
                        value={relatedReservation.litter_group_name}
                      />
                      <DetailItem
                        label="Préférence de sexe"
                        value={getSexPreferenceLabel(
                          relatedReservation.reserved_sex_preference,
                        )}
                      />
                      <DetailItem
                        label="Prix"
                        value={formatPrice(
                          relatedReservation.price_cents,
                          relatedReservation.currency,
                        )}
                      />
                      <DetailItem
                        label="Montant payé"
                        value={formatPrice(
                          relatedReservation.paid_cents,
                          relatedReservation.currency,
                        )}
                      />
                      {relatedReservation.refunded_cents !== null &&
                      relatedReservation.refunded_cents !== undefined &&
                      relatedReservation.refunded_cents > 0 ? (
                        <DetailItem
                          label="Montant remboursé"
                          value={formatPrice(
                            relatedReservation.refunded_cents,
                            relatedReservation.currency,
                          )}
                        />
                      ) : null}
                      <DetailItem
                        label="Création"
                        value={formatApplicationDate(
                          relatedReservation.created_at,
                        )}
                      />
                      <DetailItem
                        label="Mise à jour"
                        value={formatApplicationDate(
                          relatedReservation.updated_at,
                        )}
                      />
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Dates</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Création"
                      value={formatApplicationDate(document.created_at)}
                    />
                    <DetailItem
                      label="Mise à jour"
                      value={formatApplicationDate(document.updated_at)}
                    />
                    <DetailItem
                      label="Envoi"
                      value={formatApplicationDate(document.sent_at)}
                    />
                    <DetailItem
                      label="Réception"
                      value={formatApplicationDate(document.received_at)}
                    />
                    <DetailItem
                      label="Signature"
                      value={formatApplicationDate(document.signed_at)}
                    />
                    <DetailItem
                      label="Expiration"
                      value={formatApplicationDate(document.expires_at)}
                    />
                    <DetailItem
                      label="Génération"
                      value={formatApplicationDate(document.generated_at)}
                    />
                    <DetailItem
                      label="Archivage"
                      value={formatApplicationDate(document.archived_at)}
                    />
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Fichier</h2>
                  <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                    <DetailItem
                      label="Nom du fichier"
                      value={document.file_name}
                    />
                    <DetailItem
                      label="Type MIME"
                      value={document.mime_type}
                    />
                    <DetailItem
                      label="Taille"
                      value={formatFileSize(document.file_size_bytes)}
                    />
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Chemin fichier
                      </dt>
                      <dd className="mt-1.5 break-all text-sm leading-6">
                        {document.file_path || "Non renseigné"}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Notes</h2>
                  <p className="mt-5 whitespace-pre-wrap leading-7 text-muted">
                    {document.notes || "Aucune note renseignée."}
                  </p>
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-surface p-6">
                <h2 className="text-lg font-semibold">Liens métier</h2>
                <div className="mt-6">
                  <RelatedBusinessLinks document={document} />
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
