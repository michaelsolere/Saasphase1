import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import {
  getDocumentStatusLabel,
  getDocumentTypeLabel,
  getSignatureRequiredLabel,
} from "@/features/documents/formatters";
import type { DBDocument } from "@/features/documents/types";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from "@/features/payments/formatters";
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
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  created_at: string;
  updated_at: string;
};

type RelatedApplication = {
  id: string | null;
  contact_id: string | null;
  contact_display_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  species: string | null;
  breed: string | null;
  desired_sex_preference: string | null;
  project_description: string | null;
  status: string | null;
  public_form_name: string | null;
  public_form_slug: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  internal_comment: string | null;
  desired_litter_id: string | null;
  desired_litter_group_id: string | null;
};

type RelatedLitter = {
  id: string;
  name: string;
  breed: string;
  species: string;
  status: string;
  expected_birth_date: string | null;
  actual_birth_date: string | null;
  mother_id: string | null;
  father_id: string | null;
  litter_group_id: string | null;
};

type RelatedAnimal = {
  id: string;
  display_name: string;
  sex: string;
  birth_date: string | null;
  identification_number: string | null;
  lof_number: string | null;
  collar_color_current: string | null;
  collar_color_initial: string | null;
  breed: string;
  status: string;
  call_name: string | null;
  chosen_name_by_adopter: string | null;
};

type OtherRelatedDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  signature_required: boolean;
};

type RelatedPayment = {
  id: string;
  amount_cents: number;
  currency: string;
  payment_type: string;
  status: string;
  payment_method: string;
  requested_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  external_reference: string | null;
  notes: string | null;
  contact_id: string;
  reservation_id: string | null;
  created_at: string;
  updated_at: string;
};

type RelatedNote = {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  visibility: string;
  created_at: string;
  created_by: string | null;
  profiles: { display_name: string | null } | null;
};

type RelatedEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  status: string;
  priority: string;
  planned_at: string | null;
  planned_date: string | null;
  actual_at: string | null;
  created_at: string;
};

type SellerOrganization = {
  id: string;
  name: string;
  legal_name: string | null;
  legal_form: string | null;
  siret: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  affix_name: string | null;
  dog_affix_name: string | null;
  cat_affix_name: string | null;
};

type SellerRepresentative = {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  representative_role: string | null;
  email: string | null;
  phone: string | null;
};

type OrganizationDocumentSettings = {
  mediator_name: string | null;
  mediator_contact: string | null;
  mediator_website_url: string | null;
  deposit_terms: string | null;
  refund_terms: string | null;
  postponement_terms: string | null;
  credit_terms: string | null;
  withholding_terms: string | null;
  reservation_contract_terms: string | null;
  commitment_certificate_text: string | null;
  legal_mentions: string | null;
  signature_city_default: string | null;
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

const legalFormLabels: Record<string, string> = {
  individual: "EI / entrepreneur individuel",
  earl: "EARL",
  company: "Société",
  association: "Association",
  other: "Autre structure",
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

function getLegalFormLabel(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return legalFormLabels[value] ?? value.replaceAll("_", " ");
}

function getAnimalSexLabel(value: string | null) {
  if (!value) {
    return "Non renseigné";
  }

  if (value === "M") {
    return "Mâle";
  }

  if (value === "F") {
    return "Femelle";
  }

  return value;
}

function getDaysBetweenDates(start: string | null, end: string | null) {
  if (!start || !end) {
    return null;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  return Math.floor(
    (endDate.getTime() - startDate.getTime()) / dayInMilliseconds,
  );
}

function getUsefulPaymentDate(payment: RelatedPayment) {
  if (payment.paid_at) {
    return { label: "Date de paiement", value: payment.paid_at };
  }

  if (payment.due_date) {
    return { label: "Échéance", value: payment.due_date };
  }

  if (payment.requested_at) {
    return { label: "Date de demande", value: payment.requested_at };
  }

  if (payment.updated_at) {
    return { label: "Mise à jour", value: payment.updated_at };
  }

  return { label: "Création", value: payment.created_at };
}

function getUsefulEventDate(event: RelatedEvent) {
  return event.actual_at ?? event.planned_at ?? event.planned_date ?? event.created_at;
}

function getEventTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getFinancialStatus(priceCents: number | null, paidCents: number | null, refundedCents: number | null) {
  if (paidCents === null && priceCents === null) return "État non calculable";

  const paid = paidCents ?? 0;
  const refunded = refundedCents ?? 0;
  const price = priceCents ?? 0;
  const netPaid = Math.max(0, paid - refunded);

  if (netPaid === 0) {
    return "Aucun paiement";
  }

  if (price > 0 && netPaid >= price) {
    return "Paiement intégral";
  }

  // 500 € = 50000 cents
  if (netPaid >= 50000) {
    return "Arrhes complètes";
  }

  if (netPaid > 0 && netPaid < 50000) {
    return "Arrhes partielles";
  }

  return "Reste dû";
}

function getExpectedNextStep(document: { status: string; signature_required: boolean }) {
  switch (document.status) {
    case "draft":
      return "À envoyer à l'adoptant";
    case "sent":
      return document.signature_required ? "En attente de signature" : "En attente de réception";
    case "signed":
    case "approved":
    case "completed":
      return "Document finalisé";
    case "rejected":
      return "Document rejeté (à recréer ou corriger)";
    default:
      return "Aucune action attendue";
  }
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
  value: React.ReactNode;
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

function LongTextItem({
  label,
  value,
  emptyLabel = "À compléter",
}: {
  label: string;
  value: string | null;
  emptyLabel?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 whitespace-pre-wrap rounded-lg border bg-background/30 p-3 text-sm leading-6 text-muted">
        {value || emptyLabel}
      </dd>
    </div>
  );
}

function RelatedSectionHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string | null;
  href: string | null;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex w-fit rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
        >
          Consulter
        </Link>
      ) : null}
    </div>
  );
}

function CommitmentCertificatePreview({
  document,
  sellerOrganization,
  sellerRepresentative,
  documentSettings,
  relatedContact,
  relatedApplication,
  relatedReservation,
  relatedLitter,
  relatedLitterGroup,
  relatedAnimal,
}: {
  document: DBDocument;
  sellerOrganization: SellerOrganization | null;
  sellerRepresentative: SellerRepresentative | null;
  documentSettings: OrganizationDocumentSettings | null;
  relatedContact: RelatedContact | null;
  relatedApplication: RelatedApplication | null;
  relatedReservation: ReservationOverview | null;
  relatedLitter: RelatedLitter | null;
  relatedLitterGroup: { id: string; name: string } | null;
  relatedAnimal: RelatedAnimal | null;
}) {
  if (document.document_type !== "commitment_certificate") {
    return null;
  }

  const adoptionPlannedAt = relatedReservation?.adoption_planned_at ?? null;
  const daysBeforeAdoption = getDaysBetweenDates(document.signed_at, adoptionPlannedAt);
  const sellerContactMissing =
    !sellerOrganization?.email ||
    !sellerOrganization.phone ||
    (!sellerOrganization.address_line1 &&
      !sellerOrganization.postal_code &&
      !sellerOrganization.city);
  const adopterContactMissing =
    !relatedContact?.email ||
    !relatedContact.phone ||
    (!relatedContact.address_line1 &&
      !relatedContact.postal_code &&
      !relatedContact.city);
  const certificateAttentionPoints = [
    !documentSettings?.commitment_certificate_text
      ? "Texte pédagogique du certificat à compléter dans les paramètres documentaires."
      : null,
    !sellerRepresentative ? "Signataire par défaut absent." : null,
    sellerRepresentative && !sellerRepresentative.representative_role
      ? "Qualité du signataire absente."
      : null,
    sellerContactMissing ? "Coordonnées vendeur incomplètes." : null,
    adopterContactMissing ? "Coordonnées adoptant incomplètes." : null,
    !document.signed_at ? "Date de signature absente." : null,
    !adoptionPlannedAt ? "Date de cession / adoption prévue absente." : null,
  ].filter(Boolean) as string[];

  const species = relatedLitter?.species || relatedApplication?.species;
  const breed =
    relatedAnimal?.breed || relatedLitter?.breed || relatedApplication?.breed;
  const litterOrGroup =
    relatedLitter?.name ??
    relatedReservation?.litter_name ??
    relatedLitterGroup?.name ??
    relatedReservation?.litter_group_name ??
    "Non renseigné";

  return (
    <section className="rounded-2xl border border-accent/20 bg-surface p-6 sm:p-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950">
        <p className="text-xs font-semibold uppercase tracking-wide">
          Aperçu interne non définitif
        </p>
        <p className="mt-2 text-sm leading-6">
          Ce bloc ne génère aucun document. Le texte devra être validé avant
          toute utilisation réelle.
        </p>
      </div>

      <div className="mt-7 border-b pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Prévisualisation interne
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Certificat d’engagement et de connaissance
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Structure indicative destinée à vérifier les données disponibles avant
          un futur prototype documentaire.
        </p>
      </div>

      <div className="mt-6 space-y-8">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Vendeur / élevage
          </h3>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <DetailItem label="Nom commercial" value={sellerOrganization?.name} />
            <DetailItem
              label="Raison sociale"
              value={sellerOrganization?.legal_name}
            />
            <DetailItem
              label="Forme juridique"
              value={getLegalFormLabel(sellerOrganization?.legal_form ?? null)}
            />
            <DetailItem
              label="SIRET / identifiant"
              value={sellerOrganization?.siret}
            />
            <DetailItem label="Email" value={sellerOrganization?.email} />
            <DetailItem label="Téléphone" value={sellerOrganization?.phone} />
            <DetailItem
              label="Signataire"
              value={sellerRepresentative?.display_name}
            />
            <DetailItem
              label="Qualité du signataire"
              value={sellerRepresentative?.representative_role}
            />
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Adresse vendeur
              </dt>
              <dd className="mt-1.5 text-sm leading-6">
                {sellerOrganization?.address_line1 ||
                sellerOrganization?.address_line2 ||
                sellerOrganization?.postal_code ||
                sellerOrganization?.city ? (
                  <div className="rounded-lg border bg-background/40 p-3">
                    {sellerOrganization.address_line1 ? (
                      <div>{sellerOrganization.address_line1}</div>
                    ) : null}
                    {sellerOrganization.address_line2 ? (
                      <div>{sellerOrganization.address_line2}</div>
                    ) : null}
                    <div>
                      {sellerOrganization.postal_code || "Non renseigné"}{" "}
                      {sellerOrganization.city || "Non renseignée"}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase text-muted">
                      {formatCountry(sellerOrganization.country)}
                    </div>
                  </div>
                ) : (
                  "Non renseignée"
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Adoptant</h3>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <DetailItem label="Nom complet" value={relatedContact?.display_name} />
            <DetailItem label="Email" value={relatedContact?.email} />
            <DetailItem label="Téléphone" value={relatedContact?.phone} />
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Adresse adoptant
              </dt>
              <dd className="mt-1.5 text-sm leading-6">
                {relatedContact?.address_line1 ||
                relatedContact?.address_line2 ||
                relatedContact?.postal_code ||
                relatedContact?.city ? (
                  <div className="rounded-lg border bg-background/40 p-3">
                    {relatedContact.address_line1 ? (
                      <div>{relatedContact.address_line1}</div>
                    ) : null}
                    {relatedContact.address_line2 ? (
                      <div>{relatedContact.address_line2}</div>
                    ) : null}
                    <div>
                      {relatedContact.postal_code || "Non renseigné"}{" "}
                      {relatedContact.city || "Non renseignée"}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase text-muted">
                      {formatCountry(relatedContact.country)}
                    </div>
                  </div>
                ) : (
                  "Non renseignée"
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Animal / projet
          </h3>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <DetailItem label="Espèce" value={species} />
            <DetailItem label="Race" value={breed} />
            <DetailItem
              label="Animal attribué"
              value={
                relatedAnimal?.display_name ??
                "Animal non attribué pour l’instant"
              }
            />
            <DetailItem
              label="Sexe"
              value={
                relatedAnimal
                  ? getAnimalSexLabel(relatedAnimal.sex)
                  : getSexPreferenceLabel(
                      relatedReservation?.reserved_sex_preference ??
                        relatedApplication?.desired_sex_preference ??
                        null,
                    )
              }
            />
            <DetailItem
              label="Date de naissance"
              value={formatApplicationDate(relatedAnimal?.birth_date ?? null)}
            />
            <DetailItem
              label="Identification"
              value={relatedAnimal?.identification_number}
            />
            <DetailItem label="LOF" value={relatedAnimal?.lof_number} />
            <DetailItem label="Portée / groupe" value={litterOrGroup} />
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Dates</h3>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <DetailItem
              label="Création du document"
              value={formatApplicationDate(document.created_at)}
            />
            <DetailItem
              label="Envoi"
              value={formatApplicationDate(document.sent_at)}
            />
            <DetailItem
              label="Signature"
              value={formatApplicationDate(document.signed_at)}
            />
            <DetailItem
              label="Cession / adoption prévue"
              value={formatApplicationDate(adoptionPlannedAt)}
            />
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                Indication délai 7 jours
              </dt>
              <dd className="mt-1.5 rounded-lg border bg-background/30 p-3 text-sm leading-6 text-muted">
                {daysBeforeAdoption === null
                  ? "À vérifier lorsque la date de signature et la date de cession / adoption prévue seront renseignées."
                  : `${daysBeforeAdoption} jour(s) entre la signature renseignée et la date de cession / adoption prévue. Indication informative uniquement.`}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Texte pédagogique / contenu certificat
          </h3>
          <p className="mt-3 whitespace-pre-wrap rounded-lg border bg-background/30 p-4 text-sm leading-7 text-muted">
            {documentSettings?.commitment_certificate_text ||
              "Texte pédagogique du certificat à compléter dans les paramètres documentaires."}
          </p>
        </div>

        {certificateAttentionPoints.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
            <h3 className="text-sm font-semibold text-amber-950">
              Points d’attention propres au certificat
            </h3>
            <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-amber-900">
              {certificateAttentionPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RelatedNotesSection({
  notes,
  hasError,
}: {
  notes: RelatedNote[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Notes liées</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les notes liées.
        </p>
      ) : !notes || notes.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucune note liée à ce document.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {notes.map((note) => {
            const authorName = note.profiles?.display_name ?? null;

            return (
              <div key={note.id} className="py-5 first:pt-0 last:pb-0">
                <div className="space-y-2">
                  {note.title ? (
                    <p className="text-sm font-semibold text-foreground">
                      {note.title}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                    {note.body}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span>Type : {note.note_type}</span>
                    <span>Visibilité : {note.visibility}</span>
                    <span>Créée le {formatApplicationDate(note.created_at)}</span>
                    {authorName ? <span>Par {authorName}</span> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RelatedEventsSection({
  events,
  hasError,
}: {
  events: RelatedEvent[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Événements liés</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les événements liés.
        </p>
      ) : !events || events.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Aucun événement lié à ce document.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {events.map((event) => (
            <div key={event.id} className="py-5 first:pt-0 last:pb-0">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    {event.title || getEventTypeLabel(event.event_type)}
                  </span>
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    {event.status}
                  </span>
                  <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                    Priorité : {event.priority}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Type : {getEventTypeLabel(event.event_type)}
                </p>
                <p className="text-xs text-muted">
                  Date utile : {formatApplicationDate(getUsefulEventDate(event))}
                </p>
                <p className="text-xs text-muted">
                  Créé le {formatApplicationDate(event.created_at)}
                </p>
                {event.description ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
                    {event.description}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
    document.litter_id
      ? { href: `/litters/${document.litter_id}`, label: "Portée" }
      : null,
    document.animal_id
      ? { href: `/animals/${document.animal_id}`, label: "Animal" }
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
      "id, organization_id, title, document_type, status, created_at, updated_at, sent_at, received_at, signed_at, expires_at, archived_at, file_name, file_path, file_size_bytes, mime_type, signature_required, generated_from_template, generated_at, notes, contact_id, application_id, reservation_id, payment_id, litter_id, animal_id, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const document = rawDocument as DBDocument | null;

  // 0. Seller organization and document settings
  const { data: rawSellerOrganization, error: sellerOrganizationError } =
    document?.organization_id
      ? await supabase
          .from("organizations")
          .select(
            "id, name, legal_name, legal_form, siret, email, phone, website_url, address_line1, address_line2, postal_code, city, country, affix_name, dog_affix_name, cat_affix_name",
          )
          .eq("id", document.organization_id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null, error: null };

  const sellerOrganization = rawSellerOrganization as SellerOrganization | null;

  const { data: rawSellerRepresentative, error: sellerRepresentativeError } =
    document?.organization_id
      ? await supabase
          .from("organization_representatives")
          .select("display_name, first_name, last_name, representative_role, email, phone")
          .eq("organization_id", document.organization_id)
          .eq("is_default_signatory", true)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null, error: null };

  const sellerRepresentative =
    rawSellerRepresentative as SellerRepresentative | null;

  const { data: rawDocumentSettings, error: documentSettingsError } =
    document?.organization_id
      ? await supabase
          .from("organization_document_settings")
          .select(
            "mediator_name, mediator_contact, mediator_website_url, deposit_terms, refund_terms, postponement_terms, credit_terms, withholding_terms, reservation_contract_terms, commitment_certificate_text, legal_mentions, signature_city_default",
          )
          .eq("organization_id", document.organization_id)
          .is("deleted_at", null)
          .maybeSingle()
      : { data: null, error: null };

  const documentSettings =
    rawDocumentSettings as OrganizationDocumentSettings | null;

  // 1. Contact
  const { data: rawContact, error: contactError } = document?.contact_id
    ? await supabase
        .from("contacts")
        .select(
          "id, display_name, first_name, last_name, email, phone, secondary_phone, contact_type, primary_status, origin_channel, address_line1, address_line2, postal_code, city, country, created_at, updated_at, deleted_at",
        )
        .eq("id", document.contact_id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null, error: null };

  const relatedContact = rawContact as RelatedContact | null;

  // 2. Application overview
  const { data: rawApplication, error: applicationError } =
    document?.application_id
      ? await supabase
          .from("application_overview")
          .select(
            "id, contact_id, contact_display_name, contact_email, contact_phone, species, breed, desired_sex_preference, project_description, status, public_form_name, public_form_slug, submitted_at, created_at, updated_at",
          )
          .eq("id", document.application_id)
          .maybeSingle()
      : { data: null, error: null };

  let relatedApplication = rawApplication as RelatedApplication | null;

  // applications fields (internal_comment, desired_litter_id, desired_litter_group_id)
  let appLitterName: string | null = null;
  let appLitterGroupName: string | null = null;
  if (document?.application_id) {
    const { data: appFields } = await supabase
      .from("applications")
      .select("internal_comment, desired_litter_id, desired_litter_group_id")
      .eq("id", document.application_id)
      .maybeSingle();

    if (appFields) {
      relatedApplication = {
        ...relatedApplication,
        id: document.application_id,
        contact_id: relatedApplication?.contact_id ?? null,
        contact_display_name: relatedApplication?.contact_display_name ?? null,
        contact_email: relatedApplication?.contact_email ?? null,
        contact_phone: relatedApplication?.contact_phone ?? null,
        species: relatedApplication?.species ?? null,
        breed: relatedApplication?.breed ?? null,
        desired_sex_preference: relatedApplication?.desired_sex_preference ?? null,
        project_description: relatedApplication?.project_description ?? null,
        status: relatedApplication?.status ?? null,
        public_form_name: relatedApplication?.public_form_name ?? null,
        public_form_slug: relatedApplication?.public_form_slug ?? null,
        submitted_at: relatedApplication?.submitted_at ?? null,
        created_at: relatedApplication?.created_at ?? null,
        updated_at: relatedApplication?.updated_at ?? null,
        internal_comment: appFields.internal_comment,
        desired_litter_id: appFields.desired_litter_id,
        desired_litter_group_id: appFields.desired_litter_group_id,
      };

      if (appFields.desired_litter_id) {
        const { data: l } = await supabase
          .from("litters")
          .select("name")
          .eq("id", appFields.desired_litter_id)
          .maybeSingle();
        if (l) appLitterName = l.name;
      }
      if (appFields.desired_litter_group_id) {
        const { data: g } = await supabase
          .from("litter_groups")
          .select("name")
          .eq("id", appFields.desired_litter_group_id)
          .maybeSingle();
        if (g) appLitterGroupName = g.name;
      }
    }
  }

  // 3. Reservation overview
  const { data: rawReservation, error: reservationError } =
    document?.reservation_id
      ? await supabase
          .from("reservation_overview")
          .select(
            "id, contact_id, contact_display_name, animal_id, animal_display_name, litter_id, litter_name, litter_group_id, litter_group_name, status, reserved_sex_preference, price_cents, currency, paid_cents, refunded_cents, adoption_planned_at, adoption_completed_at, created_at, updated_at",
          )
          .eq("id", document.reservation_id)
          .maybeSingle()
      : { data: null, error: null };

  const relatedReservation = rawReservation as ReservationOverview | null;

  // 4. Litter
  const targetLitterId = document?.litter_id || relatedReservation?.litter_id;
  const { data: rawLitter, error: litterError } = targetLitterId
    ? await supabase
        .from("litters")
        .select("id, name, breed, species, status, expected_birth_date, actual_birth_date, mother_id, father_id, litter_group_id")
        .eq("id", targetLitterId)
        .maybeSingle()
    : { data: null, error: null };

  const relatedLitter = rawLitter as RelatedLitter | null;

  // 5. Litter Group
  const targetLitterGroupId = document?.litter_id ? relatedLitter?.litter_group_id : (relatedReservation?.litter_group_id || relatedLitter?.litter_group_id);
  const { data: rawLitterGroup } = targetLitterGroupId
    ? await supabase
        .from("litter_groups")
        .select("id, name")
        .eq("id", targetLitterGroupId)
        .maybeSingle()
    : { data: null };

  const relatedLitterGroup = rawLitterGroup as { id: string; name: string } | null;

  // 6. Parents
  let litterParentsError = false;
  let mother: {
    id: string;
    display_name: string | null;
    identification_number: string | null;
    lof_number: string | null;
  } | null = null;
  let father: {
    id: string;
    display_name: string | null;
    identification_number: string | null;
    lof_number: string | null;
  } | null = null;

  if (relatedLitter) {
    const parentIds = [relatedLitter.mother_id, relatedLitter.father_id].filter(Boolean) as string[];

    if (parentIds.length > 0) {
      const { data: parents, error: parentsError } = await supabase
        .from("animals")
        .select("id, display_name, identification_number, lof_number")
        .in("id", parentIds);

      if (parentsError) {
        litterParentsError = true;
      } else if (parents) {
        const motherData = parents.find((a) => a.id === relatedLitter.mother_id);
        const fatherData = parents.find((a) => a.id === relatedLitter.father_id);

        if (relatedLitter.mother_id) {
          mother = {
            id: relatedLitter.mother_id,
            display_name: motherData?.display_name ?? null,
            identification_number: motherData?.identification_number ?? null,
            lof_number: motherData?.lof_number ?? null,
          };
        }

        if (relatedLitter.father_id) {
          father = {
            id: relatedLitter.father_id,
            display_name: fatherData?.display_name ?? null,
            identification_number: fatherData?.identification_number ?? null,
            lof_number: fatherData?.lof_number ?? null,
          };
        }
      }
    }
  }

  // 7. Animal
  const targetAnimalId = document?.animal_id || relatedReservation?.animal_id;
  const { data: rawAnimal, error: animalError } = targetAnimalId
    ? await supabase
        .from("animals")
        .select("id, display_name, sex, birth_date, identification_number, lof_number, collar_color_current, collar_color_initial, breed, status, call_name, chosen_name_by_adopter")
        .eq("id", targetAnimalId)
        .maybeSingle()
    : { data: null, error: null };

  const relatedAnimal = rawAnimal as RelatedAnimal | null;

  // 8. Payments
  let relatedPayments: RelatedPayment[] = [];
  let paymentsError = false;

  if (document?.reservation_id) {
    const { data: resPayments, error: resPaymentsErr } = await supabase
      .from("payments")
      .select(
        "id, amount_cents, currency, payment_type, status, payment_method, requested_at, due_date, paid_at, refunded_at, external_reference, notes, contact_id, reservation_id, created_at, updated_at, deleted_at",
      )
      .eq("reservation_id", document.reservation_id)
      .is("deleted_at", null);

    if (resPaymentsErr) {
      paymentsError = true;
    } else if (resPayments) {
      relatedPayments = resPayments as RelatedPayment[];
    }
  }

  // Si document.payment_id est renseigné et pas déjà dans relatedPayments
  if (document?.payment_id && !relatedPayments.some((p) => p.id === document.payment_id)) {
    const { data: docPayment, error: docPaymentErr } = await supabase
      .from("payments")
      .select(
        "id, amount_cents, currency, payment_type, status, payment_method, requested_at, due_date, paid_at, refunded_at, external_reference, notes, contact_id, reservation_id, created_at, updated_at, deleted_at",
      )
      .eq("id", document.payment_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (docPaymentErr) {
      paymentsError = true;
    } else if (docPayment) {
      relatedPayments.push(docPayment as RelatedPayment);
    }
  }

  // 9. Other documents
  let otherRelatedDocuments: OtherRelatedDocument[] = [];
  if (document?.reservation_id) {
    const { data: otherDocs } = await supabase
      .from("documents")
      .select("id, title, document_type, status, signature_required")
      .eq("reservation_id", document.reservation_id)
      .is("deleted_at", null);

    if (otherDocs) {
      otherRelatedDocuments = (otherDocs as OtherRelatedDocument[]).filter((d) => d.id !== document.id);
    }
  }

  const { data: rawNotes, error: notesError } = document?.id
    ? await supabase
        .from("notes")
        .select(
          "id, title, body, note_type, visibility, created_at, created_by, profiles!created_by(display_name)",
        )
        .eq("document_id", document.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const documentNotes = rawNotes as RelatedNote[] | null;

  const { data: rawEvents, error: eventsError } = document?.id
    ? await supabase
        .from("events")
        .select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at")
        .eq("document_id", document.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null, error: null };

  const documentEvents = rawEvents as RelatedEvent[] | null;

  // Diagnostic des points d'attention / données manquantes
  const pointsOfAttention: string[] = [];
  if (document) {
    if (!sellerOrganization) {
      pointsOfAttention.push("Données de l’élevage / vendeur non disponibles");
    } else {
      if (!sellerOrganization.legal_form) {
        pointsOfAttention.push("Forme juridique de l’élevage / vendeur absente");
      }
      if (!sellerOrganization.siret) {
        pointsOfAttention.push("SIRET ou identifiant légal de l’élevage absent");
      }
      if (
        !sellerOrganization.address_line1 &&
        !sellerOrganization.postal_code &&
        !sellerOrganization.city
      ) {
        pointsOfAttention.push("Adresse de l’élevage / vendeur absente");
      }
    }
    if (!sellerRepresentative) {
      pointsOfAttention.push("Aucun signataire par défaut renseigné");
    } else if (!sellerRepresentative.representative_role) {
      pointsOfAttention.push("Qualité du signataire absente");
    }
    if (!documentSettings?.mediator_name) {
      pointsOfAttention.push("Médiateur de la consommation non renseigné");
    }
    if (!documentSettings?.deposit_terms) {
      pointsOfAttention.push("Conditions d’arrhes absentes");
    }
    if (
      !documentSettings?.refund_terms ||
      !documentSettings?.postponement_terms ||
      !documentSettings?.credit_terms
    ) {
      pointsOfAttention.push("Conditions de remboursement, report ou avoir à compléter");
    }
    if (!documentSettings?.withholding_terms) {
      pointsOfAttention.push("Conditions de retenue à compléter");
    }
    if (
      document.document_type === "commitment_certificate" &&
      !documentSettings?.commitment_certificate_text
    ) {
      pointsOfAttention.push("Texte du certificat d’engagement à compléter");
    }
    if (
      document.document_type === "reservation_contract" &&
      !documentSettings?.reservation_contract_terms
    ) {
      pointsOfAttention.push("Conditions du contrat de réservation à compléter");
    }
    if (relatedContact) {
      if (!relatedContact.address_line1 && !relatedContact.postal_code && !relatedContact.city) {
        pointsOfAttention.push("Adresse postale de l’adoptant manquante (requise pour le contrat)");
      }
      if (!relatedContact.phone) {
        pointsOfAttention.push("Numéro de téléphone de l’adoptant manquant");
      }
    }
    if (!document.application_id) {
      pointsOfAttention.push("Aucune candidature liée à ce document");
    }
    if (!document.reservation_id) {
      pointsOfAttention.push("Aucune réservation liée à ce document");
    } else if (relatedReservation && !relatedReservation.litter_id) {
      pointsOfAttention.push("Aucune portée précise liée à la réservation");
    }
    if (mother && !mother.lof_number) {
      pointsOfAttention.push(`Numéro LOF de la mère (${mother.display_name || "Non renseignée"}) manquant`);
    }
    if (father && !father.lof_number) {
      pointsOfAttention.push(`Numéro LOF du père (${father.display_name || "Non renseigné"}) manquant`);
    }
    if (!targetAnimalId) {
      pointsOfAttention.push("Aucun animal attribué à ce dossier");
    }
    if (!document.sent_at) {
      pointsOfAttention.push("Document non marqué comme envoyé");
    }
    if (document.signature_required && !document.signed_at) {
      pointsOfAttention.push("Document en attente de signature adoptant");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/"
          className="text-sm font-medium text-accent hover:underline"
        >
          Tableau de bord
        </Link>
        <span className="text-muted text-sm select-none" aria-hidden="true">|</span>
        <Link
          href="/documents"
          className="text-sm font-medium text-accent hover:underline"
        >
          ← Retour aux documents
        </Link>
      </div>

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

            {pointsOfAttention.length > 0 && (
              <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
                <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                  <span className="text-base">⚠️</span> Données manquantes ou à compléter
                </h2>
                <ul className="mt-3 list-disc list-inside space-y-1.5 text-sm text-amber-800">
                  {pointsOfAttention.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </section>
            )}

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
                      label="Prochaine étape attendue"
                      value={getExpectedNextStep(document)}
                    />
                    <DetailItem
                      label="Généré depuis modèle"
                      value={booleanLabel(document.generated_from_template)}
                    />
                    <DetailItem
                      label="Date d'envoi"
                      value={formatApplicationDate(document.sent_at)}
                    />
                    <DetailItem
                      label="Date de signature"
                      value={formatApplicationDate(document.signed_at)}
                    />
                  </dl>

                  {document.document_type === "commitment_certificate" && (
                    <div className="mt-6 rounded-xl bg-accent-soft p-4 border border-accent/10">
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                        Information juridique · Certificat d’engagement
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted">
                        Le certificat d’engagement et de connaissance doit être signé par l’adoptant au moins 7 jours avant la cession effective de l’animal.
                      </p>
                      {document.signed_at ? (
                        <p className="mt-2 text-xs font-semibold text-emerald-700">
                          ✅ Signé le {formatApplicationDate(document.signed_at)}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          ⚠️ Certificat non signé / date de signature non renseignée.
                        </p>
                      )}
                    </div>
                  )}
                </section>

                <CommitmentCertificatePreview
                  document={document}
                  sellerOrganization={sellerOrganization}
                  sellerRepresentative={sellerRepresentative}
                  documentSettings={documentSettings}
                  relatedContact={relatedContact}
                  relatedApplication={relatedApplication}
                  relatedReservation={relatedReservation}
                  relatedLitter={relatedLitter}
                  relatedLitterGroup={relatedLitterGroup}
                  relatedAnimal={relatedAnimal}
                />

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <RelatedSectionHeader
                    title="Élevage / vendeur"
                    subtitle={sellerOrganization?.name ?? null}
                    href="/settings/organization"
                  />

                  {sellerOrganizationError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les données de l’élevage / vendeur.
                    </p>
                  ) : !sellerOrganization ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucune donnée d’élevage / vendeur disponible.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem label="Nom commercial" value={sellerOrganization.name} />
                      <DetailItem label="Raison sociale" value={sellerOrganization.legal_name} />
                      <DetailItem
                        label="Forme juridique"
                        value={getLegalFormLabel(sellerOrganization.legal_form)}
                      />
                      <DetailItem label="SIRET / identifiant" value={sellerOrganization.siret} />
                      <DetailItem label="Email" value={sellerOrganization.email} />
                      <DetailItem label="Téléphone" value={sellerOrganization.phone} />
                      <DetailItem
                        label="Site web"
                        value={
                          sellerOrganization.website_url ? (
                            <a
                              href={sellerOrganization.website_url}
                              className="font-medium text-accent hover:underline"
                              rel="noreferrer"
                              target="_blank"
                            >
                              {sellerOrganization.website_url}
                            </a>
                          ) : null
                        }
                      />
                      <DetailItem label="Affixe" value={sellerOrganization.affix_name} />
                      <DetailItem label="Affixe chien" value={sellerOrganization.dog_affix_name} />
                      <DetailItem label="Affixe chat" value={sellerOrganization.cat_affix_name} />
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Adresse
                        </dt>
                        <dd className="mt-1.5 text-sm leading-6">
                          {sellerOrganization.address_line1 ||
                          sellerOrganization.address_line2 ||
                          sellerOrganization.postal_code ||
                          sellerOrganization.city ? (
                            <div className="rounded-lg border bg-background/40 p-3">
                              {sellerOrganization.address_line1 ? (
                                <div>{sellerOrganization.address_line1}</div>
                              ) : null}
                              {sellerOrganization.address_line2 ? (
                                <div>{sellerOrganization.address_line2}</div>
                              ) : null}
                              <div>
                                {sellerOrganization.postal_code || "Non renseigné"}{" "}
                                {sellerOrganization.city || "Non renseignée"}
                              </div>
                              <div className="mt-1 text-xs font-semibold uppercase text-muted">
                                {formatCountry(sellerOrganization.country)}
                              </div>
                            </div>
                          ) : (
                            "Non renseignée"
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Représentant / signataire
                  </h2>

                  {sellerRepresentativeError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger le signataire par défaut.
                    </p>
                  ) : !sellerRepresentative ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucun signataire par défaut renseigné.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem
                        label="Nom affichable"
                        value={sellerRepresentative.display_name}
                      />
                      <DetailItem label="Prénom" value={sellerRepresentative.first_name} />
                      <DetailItem label="Nom" value={sellerRepresentative.last_name} />
                      <DetailItem
                        label="Qualité / rôle"
                        value={sellerRepresentative.representative_role}
                      />
                      <DetailItem label="Email" value={sellerRepresentative.email} />
                      <DetailItem label="Téléphone" value={sellerRepresentative.phone} />
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Paramètres documentaires
                  </h2>

                  {documentSettingsError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les paramètres documentaires.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem
                        label="Médiateur"
                        value={documentSettings?.mediator_name}
                      />
                      <DetailItem
                        label="Contact médiateur"
                        value={documentSettings?.mediator_contact}
                      />
                      <DetailItem
                        label="Site médiateur"
                        value={
                          documentSettings?.mediator_website_url ? (
                            <a
                              href={documentSettings.mediator_website_url}
                              className="font-medium text-accent hover:underline"
                              rel="noreferrer"
                              target="_blank"
                            >
                              {documentSettings.mediator_website_url}
                            </a>
                          ) : null
                        }
                      />
                      <DetailItem
                        label="Ville de signature par défaut"
                        value={documentSettings?.signature_city_default}
                      />
                      <div className="sm:col-span-2">
                        <LongTextItem
                          label="Mentions légales"
                          value={documentSettings?.legal_mentions ?? null}
                        />
                      </div>
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">
                    Conditions documentaires
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    Prévisualisation des paramètres saisis. Ces textes ne
                    constituent pas une validation juridique.
                  </p>

                  {documentSettingsError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les conditions documentaires.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6">
                      <LongTextItem
                        label="Conditions d’arrhes"
                        value={documentSettings?.deposit_terms ?? null}
                      />
                      <LongTextItem
                        label="Conditions de remboursement"
                        value={documentSettings?.refund_terms ?? null}
                      />
                      <LongTextItem
                        label="Conditions de report"
                        value={documentSettings?.postponement_terms ?? null}
                      />
                      <LongTextItem
                        label="Conditions d’avoir"
                        value={documentSettings?.credit_terms ?? null}
                      />
                      <LongTextItem
                        label="Conditions de retenue"
                        value={documentSettings?.withholding_terms ?? null}
                      />
                      <LongTextItem
                        label="Conditions du contrat de réservation"
                        value={documentSettings?.reservation_contract_terms ?? null}
                      />
                      <LongTextItem
                        label="Texte certificat d’engagement"
                        value={documentSettings?.commitment_certificate_text ?? null}
                      />
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <RelatedSectionHeader
                    title="Contact lié"
                    subtitle={relatedContact?.display_name ?? null}
                    href={
                      relatedContact?.id ? `/contacts/${relatedContact.id}` : null
                    }
                  />

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
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Adresse postale complète
                        </dt>
                        <dd className="mt-1.5 text-sm leading-6">
                          {relatedContact.address_line1 || relatedContact.address_line2 || relatedContact.postal_code || relatedContact.city ? (
                            <div className="bg-background/40 p-3 rounded-lg border">
                              {relatedContact.address_line1 && <div>{relatedContact.address_line1}</div>}
                              {relatedContact.address_line2 && <div>{relatedContact.address_line2}</div>}
                              <div>
                                {relatedContact.postal_code || "Non renseigné"} {relatedContact.city || "Non renseignée"}
                              </div>
                              <div className="text-xs text-muted mt-1 uppercase font-semibold">
                                {formatCountry(relatedContact.country)}
                              </div>
                            </div>
                          ) : (
                            "Non renseignée"
                          )}
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <RelatedSectionHeader
                    title="Candidature liée"
                    subtitle={
                      relatedApplication
                        ? relatedApplication.contact_display_name ??
                          "Contact non renseigné"
                        : null
                    }
                    href={
                      relatedApplication?.id
                        ? `/candidatures/${relatedApplication.id}`
                        : null
                    }
                  />

                  {applicationError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger la candidature liée.
                    </p>
                  ) : !relatedApplication ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucune candidature liée à ce document.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem
                        label="Statut"
                        value={getApplicationStatusLabel(
                          relatedApplication.status,
                        )}
                      />
                      <DetailItem
                        label="Espèce"
                        value={relatedApplication.species}
                      />
                      <DetailItem label="Race" value={relatedApplication.breed} />
                      <DetailItem
                        label="Sexe souhaité"
                        value={getSexPreferenceLabel(
                          relatedApplication.desired_sex_preference,
                        )}
                      />
                      <DetailItem
                        label="Contact"
                        value={relatedApplication.contact_display_name}
                      />
                      <DetailItem
                        label="Email contact"
                        value={relatedApplication.contact_email}
                      />
                      <DetailItem
                        label="Téléphone contact"
                        value={relatedApplication.contact_phone}
                      />
                      <DetailItem
                        label="Formulaire source"
                        value={
                          relatedApplication.public_form_name ??
                          relatedApplication.public_form_slug
                        }
                      />
                      <DetailItem
                        label="Soumission"
                        value={formatApplicationDate(
                          relatedApplication.submitted_at,
                        )}
                      />
                      <DetailItem
                        label="Création"
                        value={formatApplicationDate(
                          relatedApplication.created_at,
                        )}
                      />
                      <DetailItem
                        label="Mise à jour"
                        value={formatApplicationDate(
                          relatedApplication.updated_at,
                        )}
                      />
                      <DetailItem
                        label="Portée souhaitée"
                        value={appLitterName || "Aucune portée spécifique"}
                      />
                      <DetailItem
                        label="Groupe de portées souhaité"
                        value={appLitterGroupName || "Aucun groupe spécifique"}
                      />
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Projet
                        </dt>
                        <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6 bg-background/20 p-3 rounded-lg border">
                          {relatedApplication.project_description ||
                            "Non renseigné"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                          Remarques / Commentaire interne
                        </dt>
                        <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-6 bg-background/20 p-3 rounded-lg border text-muted">
                          {relatedApplication.internal_comment || "Aucune remarque interne."}
                        </dd>
                      </div>
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <RelatedSectionHeader
                    title="Réservation liée"
                    subtitle={
                      relatedReservation
                        ? relatedReservation.contact_display_name ??
                          "Contact non renseigné"
                        : null
                    }
                    href={
                      relatedReservation?.id
                        ? `/reservations/${relatedReservation.id}`
                        : null
                    }
                  />

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
                        value={
                          relatedReservation.contact_id ? (
                            <Link
                              href={`/contacts/${relatedReservation.contact_id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {relatedReservation.contact_display_name}
                            </Link>
                          ) : (
                            relatedReservation.contact_display_name
                          )
                        }
                      />
                      <DetailItem
                        label="Animal"
                        value={
                          relatedReservation.animal_id ? (
                            <Link
                              href={`/animals/${relatedReservation.animal_id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {relatedReservation.animal_display_name}
                            </Link>
                          ) : (
                            relatedReservation.animal_display_name
                          )
                        }
                      />
                      <DetailItem
                        label="Portée"
                        value={
                          relatedReservation.litter_id ? (
                            <Link
                              href={`/litters/${relatedReservation.litter_id}`}
                              className="font-medium text-accent hover:underline"
                            >
                              {relatedReservation.litter_name}
                            </Link>
                          ) : (
                            relatedReservation.litter_name
                          )
                        }
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
                        label="Prix convenu"
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
                        label="Reste dû"
                        value={formatPrice(
                          Math.max(
                            0,
                            (relatedReservation.price_cents ?? 0) -
                              (relatedReservation.paid_cents ?? 0) +
                              (relatedReservation.refunded_cents ?? 0),
                          ),
                          relatedReservation.currency,
                        )}
                      />
                      <DetailItem
                        label="État financier du dossier"
                        value={
                          <span className="font-semibold text-accent">
                            {getFinancialStatus(
                              relatedReservation.price_cents,
                              relatedReservation.paid_cents,
                              relatedReservation.refunded_cents,
                            )}
                          </span>
                        }
                      />
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
                  <h2 className="text-xl font-semibold">Portée & Parents de la portée</h2>

                  {litterParentsError || litterError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les détails ou les parents de la portée.
                    </p>
                  ) : !relatedLitter ? (
                    <div className="mt-5 space-y-4">
                      {relatedLitterGroup ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">
                            Groupe de portées : {relatedLitterGroup.name}
                          </p>
                          <p className="text-sm text-muted">
                            Aucune portée précise n’est encore liée à cette réservation.
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted">
                          Aucune portée précise liée pour l’instant.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 space-y-6">
                      {/* Détails de la Portée */}
                      <div>
                        <div className="flex justify-between items-start border-b pb-2">
                          <h3 className="text-sm font-semibold text-foreground">Détails de la portée</h3>
                          <Link
                            href={`/litters/${relatedLitter.id}`}
                            className="text-xs font-semibold text-accent hover:underline"
                          >
                            Consulter la fiche portée
                          </Link>
                        </div>
                        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                          <DetailItem label="Nom" value={relatedLitter.name} />
                          <DetailItem label="Race" value={relatedLitter.breed} />
                          <DetailItem label="Espèce" value={relatedLitter.species} />
                          <DetailItem label="Statut de la portée" value={relatedLitter.status} />
                          <DetailItem
                            label="Naissance prévue"
                            value={formatApplicationDate(relatedLitter.expected_birth_date)}
                          />
                          <DetailItem
                            label="Naissance réelle"
                            value={formatApplicationDate(relatedLitter.actual_birth_date)}
                          />
                        </dl>
                      </div>

                      {/* Parents de la Portée */}
                      <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t">
                        <div>
                          <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="text-sm font-semibold text-foreground">Mère</h3>
                            {mother?.id && (
                              <Link
                                href={`/animals/${mother.id}`}
                                className="text-xs font-medium text-accent hover:underline"
                              >
                                Fiche animal
                              </Link>
                            )}
                          </div>
                          <dl className="mt-3 space-y-3">
                            <DetailItem label="Nom" value={mother?.display_name ?? null} />
                            <DetailItem
                              label="Numéro d’identification"
                              value={mother?.identification_number ?? null}
                            />
                            <DetailItem label="Numéro LOF" value={mother?.lof_number ?? null} />
                          </dl>
                        </div>
                        <div>
                          <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="text-sm font-semibold text-foreground">Père</h3>
                            {father?.id && (
                              <Link
                                href={`/animals/${father.id}`}
                                className="text-xs font-medium text-accent hover:underline"
                              >
                                Fiche animal
                              </Link>
                            )}
                          </div>
                          <dl className="mt-3 space-y-3">
                            <DetailItem label="Nom" value={father?.display_name ?? null} />
                            <DetailItem
                              label="Numéro d’identification"
                              value={father?.identification_number ?? null}
                            />
                            <DetailItem label="Numéro LOF" value={father?.lof_number ?? null} />
                          </dl>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <RelatedSectionHeader
                    title="Animal attribué"
                    subtitle={relatedAnimal?.display_name ?? null}
                    href={relatedAnimal?.id ? `/animals/${relatedAnimal.id}` : null}
                  />

                  {animalError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les détails de l’animal attribué.
                    </p>
                  ) : !relatedAnimal ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucun animal attribué pour l’instant.
                    </p>
                  ) : (
                    <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                      <DetailItem label="Nom" value={relatedAnimal.display_name} />
                      <DetailItem
                        label="Sexe"
                        value={relatedAnimal.sex === "M" ? "Mâle" : relatedAnimal.sex === "F" ? "Femelle" : relatedAnimal.sex}
                      />
                      <DetailItem
                        label="Date de naissance"
                        value={formatApplicationDate(relatedAnimal.birth_date)}
                      />
                      <DetailItem
                        label="Collier / Couleur"
                        value={relatedAnimal.collar_color_current || relatedAnimal.collar_color_initial || "Non renseigné"}
                      />
                      <DetailItem
                        label="Numéro d'identification"
                        value={relatedAnimal.identification_number}
                      />
                      <DetailItem
                        label="Numéro LOF"
                        value={relatedAnimal.lof_number}
                      />
                      <DetailItem label="Race" value={relatedAnimal.breed} />
                      <DetailItem label="Statut" value={relatedAnimal.status} />
                    </dl>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Paiements liés</h2>

                  {paymentsError ? (
                    <p role="alert" className="mt-5 text-sm text-amber-800">
                      Impossible de charger les paiements liés.
                    </p>
                  ) : !relatedPayments || relatedPayments.length === 0 ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucun paiement lié trouvé.
                    </p>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {relatedPayments.map((payment) => {
                        const usefulDate = getUsefulPaymentDate(payment);
                        return (
                          <div key={payment.id} className="p-4 rounded-xl border bg-background/40 flex flex-col justify-between sm:flex-row sm:items-center gap-4 hover:border-accent/20 transition">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm">
                                  {formatPrice(payment.amount_cents, payment.currency)}
                                </span>
                                <span className="text-xs text-muted font-medium">
                                  ({getPaymentTypeLabel(payment.payment_type)} · {getPaymentMethodLabel(payment.payment_method)})
                                </span>
                              </div>
                              <div className="text-xs text-muted mt-1">
                                {usefulDate.label} : {formatApplicationDate(usefulDate.value)}
                              </div>
                              {payment.notes && (
                                <p className="text-xs text-muted italic mt-1.5 line-clamp-1">
                                  Note: {payment.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-surface text-muted">
                                {getPaymentStatusLabel(payment.status)}
                              </span>
                              <Link
                                href={`/payments/${payment.id}`}
                                className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                              >
                                Consulter
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-surface p-6 sm:p-8">
                  <h2 className="text-xl font-semibold">Autres documents du dossier</h2>
                  {!otherRelatedDocuments || otherRelatedDocuments.length === 0 ? (
                    <p className="mt-5 text-sm text-muted">
                      Aucun autre document lié à cette réservation.
                    </p>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {otherRelatedDocuments.map((doc) => (
                        <div key={doc.id} className="p-4 rounded-xl border bg-background/40 flex flex-col justify-between sm:flex-row sm:items-center gap-4 hover:border-accent/20 transition">
                          <div>
                            <span className="font-semibold text-sm block">
                              {doc.title}
                            </span>
                            <span className="text-xs text-muted">
                              Type : {getDocumentTypeLabel(doc.document_type)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-surface text-muted">
                              {getDocumentStatusLabel(doc.status)}
                            </span>
                            <Link
                              href={`/documents/${doc.id}`}
                              className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                            >
                              Visualiser
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
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

                <RelatedNotesSection
                  notes={documentNotes}
                  hasError={Boolean(notesError)}
                />

                <RelatedEventsSection
                  events={documentEvents}
                  hasError={Boolean(eventsError)}
                />
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
