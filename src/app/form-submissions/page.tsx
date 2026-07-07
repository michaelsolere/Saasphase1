import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatApplicationDate,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export const dynamic = "force-dynamic";

type FormSubmission = Pick<
  Tables<"form_submissions">,
  | "id"
  | "submitted_at"
  | "first_name"
  | "last_name"
  | "family_or_structure_name"
  | "email"
  | "phone"
  | "desired_sex_preference"
  | "project_description"
  | "status"
  | "duplicate_resolution"
  | "duplicate_candidate_contact_id"
>;

type CandidateContact = Pick<
  Tables<"contacts">,
  "id" | "display_name" | "email" | "phone"
>;

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

function getApplicantName(submission: FormSubmission) {
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

function EmptyState() {
  return (
    <section className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
      <h2 className="text-xl font-semibold">
        Aucune soumission suspecte à traiter
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted">
        Les formulaires publics acceptés sans candidature créée apparaîtront ici
        lorsqu’une revue manuelle sera nécessaire.
      </p>
    </section>
  );
}

function ErrorState() {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center text-amber-950"
    >
      <h2 className="text-xl font-semibold">
        Impossible de charger les soumissions
      </h2>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </section>
  );
}

export default async function FormSubmissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from("form_submissions")
    .select(
      "id, submitted_at, first_name, last_name, family_or_structure_name, email, phone, desired_sex_preference, project_description, status, duplicate_resolution, duplicate_candidate_contact_id",
    )
    .is("deleted_at", null)
    .or("status.eq.duplicate_suspected,duplicate_resolution.eq.pending_human_review")
    .order("submitted_at", { ascending: false });

  const candidateContactIds = Array.from(
    new Set(
      (submissions ?? [])
        .map((submission) => submission.duplicate_candidate_contact_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let contactsById = new Map<string, CandidateContact>();
  let contactsError = null;

  if (candidateContactIds.length > 0) {
    const { data: candidateContacts, error } = await supabase
      .from("contacts")
      .select("id, display_name, email, phone")
      .in("id", candidateContactIds)
      .is("deleted_at", null);

    contactsError = error;
    contactsById = new Map(
      (candidateContacts ?? []).map((contact) => [contact.id, contact]),
    );
  }

  const hasError = Boolean(submissionsError || contactsError);
  const suspectSubmissions = (submissions ?? []) as FormSubmission[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Tableau de bord
        </Link>
        <span className="select-none text-sm text-muted" aria-hidden="true">
          |
        </span>
        <Link
          href="/candidatures"
          className="text-sm font-medium text-accent hover:underline"
        >
          Candidatures
        </Link>
      </div>

      <header className="mt-8 border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Formulaires publics
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Soumissions à examiner
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted">
              Soumissions acceptées publiquement mais sans candidature créée
              automatiquement, à relire manuellement avant toute décision.
            </p>
          </div>
          <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            Lecture seule
          </span>
        </div>
      </header>

      <section className="py-8">
        {hasError ? (
          <ErrorState />
        ) : suspectSubmissions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {suspectSubmissions.map((submission) => {
              const candidateContact = submission.duplicate_candidate_contact_id
                ? contactsById.get(submission.duplicate_candidate_contact_id)
                : null;

              return (
                <article
                  key={submission.id}
                  className="rounded-2xl border bg-surface p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold">
                          {getApplicantName(submission)}
                        </h2>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                          {formatStatus(submission.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted">
                        Soumise le {formatApplicationDate(submission.submitted_at)}
                      </p>
                      <Link
                        href={`/form-submissions/${submission.id}`}
                        className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline"
                      >
                        Consulter la soumission
                      </Link>
                    </div>

                    <div className="rounded-xl border bg-background px-4 py-3 text-sm lg:min-w-72">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Contact candidat potentiel
                      </p>
                      {candidateContact ? (
                        <div className="mt-2 space-y-1">
                          <Link
                            href={`/contacts/${candidateContact.id}`}
                            className="font-semibold text-accent hover:underline"
                          >
                            {candidateContact.display_name}
                          </Link>
                          <p className="text-muted">
                            {candidateContact.email ??
                              candidateContact.phone ??
                              "Coordonnées non renseignées"}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-muted">
                          Aucun contact candidat unique identifié.
                        </p>
                      )}
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-5 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Email
                      </dt>
                      <dd className="mt-1.5 text-sm">
                        {submission.email ?? "Non renseigné"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Téléphone
                      </dt>
                      <dd className="mt-1.5 text-sm">
                        {submission.phone ?? "Non renseigné"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Sexe souhaité
                      </dt>
                      <dd className="mt-1.5 text-sm">
                        {getSexPreferenceLabel(submission.desired_sex_preference)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Résolution doublon
                      </dt>
                      <dd className="mt-1.5 text-sm">
                        {formatDuplicateResolution(
                          submission.duplicate_resolution,
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-6 border-t pt-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Description du projet
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {submission.project_description ?? "Non renseignée"}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
