import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { resolveSuspectFormSubmissionWithExistingContact } from "@/features/form-submissions/actions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export const dynamic = "force-dynamic";

type FormSubmissionDetail = Pick<
  Tables<"form_submissions">,
  | "id"
  | "public_reference"
  | "submitted_at"
  | "first_name"
  | "last_name"
  | "family_or_structure_name"
  | "email"
  | "phone"
  | "address_line1"
  | "address_line2"
  | "postal_code"
  | "city"
  | "country"
  | "desired_sex_preference"
  | "project_description"
  | "source_channel"
  | "status"
  | "duplicate_resolution"
  | "contact_id"
  | "duplicate_candidate_contact_id"
  | "application_id"
  | "reviewed_at"
  | "reviewed_by"
  | "internal_comment"
  | "raw_data"
>;

type LinkedContact = Pick<Tables<"contacts">, "id" | "display_name" | "email" | "phone">;

type ReviewedByProfile = Pick<Tables<"profiles">, "display_name" | "email">;

type FormSubmissionQueryResult = FormSubmissionDetail & {
  duplicate_candidate_contact: LinkedContact | null;
  linked_contact: LinkedContact | null;
  reviewed_by_profile: ReviewedByProfile | null;
};

const submissionStatusLabels: Record<string, string> = {
  duplicate_suspected: "Doublon suspect",
  needs_review: "À examiner",
  submitted: "Soumise",
  application_created: "Candidature créée",
  reviewed: "Relue",
  merged: "Fusionnée",
  rejected: "Rejetée",
  archived: "Archivée",
};

const duplicateResolutionLabels: Record<string, string> = {
  pending_human_review: "Revue humaine en attente",
  matched_existing_contact: "Contact existant reconnu",
  created_new_contact: "Nouveau contact créé",
  resolved_existing_contact: "Rattachée à un contact existant",
};

const sourceChannelLabels: Record<string, string> = {
  sms_link: "Lien SMS",
  email_link: "Lien email",
  facebook_link: "Lien Facebook",
  instagram_link: "Lien Instagram",
  whatsapp_link: "Lien WhatsApp",
  leboncoin_link: "Lien Leboncoin",
  website: "Site web",
  manual: "Manuel",
  other: "Autre",
  unknown: "Inconnu",
};

function formatStatus(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return submissionStatusLabels[value] ?? value.replaceAll("_", " ");
}

function formatDuplicateResolution(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return duplicateResolutionLabels[value] ?? value.replaceAll("_", " ");
}

function formatSourceChannel(value: string | null) {
  if (!value) {
    return "Non renseignée";
  }

  return sourceChannelLabels[value] ?? value.replaceAll("_", " ");
}

function getApplicantName(submission: FormSubmissionDetail) {
  const personName = [submission.first_name, submission.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fullName = [personName, submission.family_or_structure_name]
    .filter(Boolean)
    .join(" - ")
    .trim();

  return fullName || "Nom non renseigné";
}

function formatAddress(submission: FormSubmissionDetail) {
  const cityLine = [submission.postal_code, submission.city]
    .filter(Boolean)
    .join(" ")
    .trim();

  return [
    submission.address_line1,
    submission.address_line2,
    cityLine,
    submission.country,
  ]
    .filter(Boolean)
    .join("\n");
}

function hasRawData(rawData: FormSubmissionDetail["raw_data"]) {
  if (!rawData || typeof rawData !== "object") {
    return rawData !== null && rawData !== undefined;
  }

  return Object.keys(rawData).length > 0;
}

function formatRawData(rawData: FormSubmissionDetail["raw_data"]) {
  return JSON.stringify(rawData, null, 2);
}

function NotFoundOrUnauthorized() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10 sm:px-10 lg:px-12">
      <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">
          Soumission introuvable ou inaccessible
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">
          Cette soumission n’existe pas, n’appartient pas à votre organisation
          ou ne nécessite plus de revue manuelle.
        </p>
        <Link
          href="/form-submissions"
          className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Retour aux soumissions
        </Link>
      </section>
    </main>
  );
}

function ErrorState() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10 sm:px-10 lg:px-12">
      <section
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
      >
        <h1 className="text-xl font-semibold">
          Impossible de charger la soumission
        </h1>
        <p className="mt-2 text-sm">
          Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
        </p>
        <Link
          href="/form-submissions"
          className="mt-6 inline-flex text-sm font-semibold underline"
        >
          Retour aux soumissions
        </Link>
      </section>
    </main>
  );
}

function DetailItem({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">
        {children ?? value ?? "Non renseigné"}
      </dd>
    </div>
  );
}

function ContactLink({ contact }: { contact: LinkedContact }) {
  return (
    <div className="space-y-1">
      <Link
        href={`/contacts/${contact.id}`}
        className="font-semibold text-accent hover:underline"
      >
        {contact.display_name}
      </Link>
      <p className="text-muted">
        {contact.email ?? contact.phone ?? "Coordonnées non renseignées"}
      </p>
    </div>
  );
}

function ResolutionAction({
  submission,
}: {
  submission: FormSubmissionQueryResult;
}) {
  const isResolvable =
    submission.status === "duplicate_suspected" &&
    submission.duplicate_resolution === "pending_human_review" &&
    !submission.application_id &&
    !submission.contact_id &&
    Boolean(submission.duplicate_candidate_contact_id);

  if (!isResolvable) {
    return (
      <div className="mt-6 rounded-xl border bg-background p-4">
        <p className="text-sm font-semibold">Soumission traitée</p>
        <p className="mt-1 text-sm leading-6 text-muted">
          Cette soumission n’est plus en attente de résolution manuelle.
        </p>
      </div>
    );
  }

  if (!submission.duplicate_candidate_contact) {
    return null;
  }

  return (
    <form
      action={resolveSuspectFormSubmissionWithExistingContact}
      className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
    >
      <input type="hidden" name="form_submission_id" value={submission.id} />
      <input
        type="hidden"
        name="contact_id"
        value={submission.duplicate_candidate_contact.id}
      />
      <p className="text-sm font-semibold">Résoudre le doublon suspect</p>
      <p className="mt-1 text-sm leading-6">
        Cette action rattache la soumission au contact suggéré, crée une
        candidature liée, puis promeut le contact en candidat sans modifier ses
        coordonnées.
      </p>
      <div className="mt-4 rounded-lg border border-amber-200 bg-white/70 p-3 text-sm">
        <ContactLink contact={submission.duplicate_candidate_contact} />
      </div>
      <button
        type="submit"
        className="mt-4 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
      >
        Rattacher au contact suggéré
      </button>
    </form>
  );
}

export default async function FormSubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resolution?: string }>;
}) {
  const { id } = await params;
  const { resolution } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("form_submissions")
    .select(
      `
        id,
        public_reference,
        submitted_at,
        first_name,
        last_name,
        family_or_structure_name,
        email,
        phone,
        address_line1,
        address_line2,
        postal_code,
        city,
        country,
        desired_sex_preference,
        project_description,
        source_channel,
        status,
        duplicate_resolution,
        contact_id,
        duplicate_candidate_contact_id,
        application_id,
        reviewed_at,
        reviewed_by,
        internal_comment,
        raw_data,
        duplicate_candidate_contact:contacts!form_submissions_duplicate_contact_organization_fk(id, display_name, email, phone),
        linked_contact:contacts!form_submissions_contact_organization_fk(id, display_name, email, phone),
        reviewed_by_profile:profiles!form_submissions_reviewed_by_fkey(display_name, email)
      `,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return <ErrorState />;
  }

  if (!data) {
    return <NotFoundOrUnauthorized />;
  }

  const submission = data as FormSubmissionQueryResult;
  const address = formatAddress(submission);
  const reviewedByLabel =
    submission.reviewed_by_profile?.display_name ??
    submission.reviewed_by_profile?.email ??
    submission.reviewed_by;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Tableau de bord
        </Link>
        <span className="select-none text-sm text-muted" aria-hidden="true">
          |
        </span>
        <Link
          href="/form-submissions"
          className="text-sm font-medium text-accent hover:underline"
        >
          Soumissions à examiner
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Soumission publique
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {getApplicantName(submission)}
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted">
              Détail complet et résolution limitée par rattachement à un contact
              existant.
            </p>
          </div>
          <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            Revue manuelle
          </span>
        </div>
      </header>

      <section className="py-8">
        <article className="rounded-2xl border bg-surface p-6 shadow-sm">
          {resolution === "success" ? (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-950">
              Soumission résolue : le contact existant est rattaché et la
              candidature liée a été créée.
            </div>
          ) : null}
          {resolution === "error" ? (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950"
            >
              La résolution n’a pas pu être appliquée. Vérifiez que la
              soumission est toujours en attente et que le contact existe dans
              votre organisation.
            </div>
          ) : null}
          <div className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm text-muted">
                Soumise le {formatApplicationDate(submission.submitted_at)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                  {formatStatus(submission.status)}
                </span>
                <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold text-muted">
                  {formatDuplicateResolution(submission.duplicate_resolution)}
                </span>
              </div>
            </div>
            <Link
              href="/form-submissions"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Retour aux soumissions
            </Link>
          </div>

          <ResolutionAction submission={submission} />

          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <DetailItem
              label="Référence publique"
              value={submission.public_reference}
            />
            <DetailItem
              label="Source"
              value={formatSourceChannel(submission.source_channel)}
            />
            <DetailItem label="Nom" value={submission.last_name} />
            <DetailItem label="Prénom" value={submission.first_name} />
            <DetailItem
              label="Famille ou structure"
              value={submission.family_or_structure_name}
            />
            <DetailItem label="Email" value={submission.email} />
            <DetailItem label="Téléphone" value={submission.phone} />
            <DetailItem label="Adresse" value={address || null} />
            <DetailItem
              label="Sexe souhaité"
              value={getSexPreferenceLabel(submission.desired_sex_preference)}
            />
            <DetailItem label="Statut" value={formatStatus(submission.status)} />
            <DetailItem
              label="Résolution doublon"
              value={formatDuplicateResolution(submission.duplicate_resolution)}
            />
            <DetailItem label="Contact lié" value={submission.contact_id}>
              {submission.linked_contact ? (
                <ContactLink contact={submission.linked_contact} />
              ) : (
                submission.contact_id ?? "Non renseigné"
              )}
            </DetailItem>
            <DetailItem
              label="Contact potentiel"
              value={submission.duplicate_candidate_contact_id}
            >
              {submission.duplicate_candidate_contact ? (
                <ContactLink contact={submission.duplicate_candidate_contact} />
              ) : (
                submission.duplicate_candidate_contact_id ?? "Non renseigné"
              )}
            </DetailItem>
            <DetailItem label="Candidature liée">
              {submission.application_id ? (
                <Link
                  href={`/candidatures/${submission.application_id}`}
                  className="font-semibold text-accent hover:underline"
                >
                  {submission.application_id}
                </Link>
              ) : (
                "Non renseigné"
              )}
            </DetailItem>
            <DetailItem
              label="Revue le"
              value={
                submission.reviewed_at
                  ? formatApplicationDate(submission.reviewed_at)
                  : null
              }
            />
            <DetailItem label="Revue par" value={reviewedByLabel} />
          </dl>

          <div className="mt-6 border-t pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Description du projet
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {submission.project_description ?? "Non renseignée"}
            </p>
          </div>

          <div className="mt-6 border-t pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Commentaire interne
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {submission.internal_comment ?? "Non renseigné"}
            </p>
          </div>

          {hasRawData(submission.raw_data) ? (
            <details className="mt-6 border-t pt-6">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
                Données techniques
              </summary>
              <pre className="mt-3 overflow-x-auto rounded-xl border bg-background p-4 text-xs leading-5 text-muted">
                {formatRawData(submission.raw_data)}
              </pre>
            </details>
          ) : null}
        </article>
      </section>
    </main>
  );
}
