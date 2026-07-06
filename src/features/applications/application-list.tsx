import Link from "next/link";

import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import type {
  ApplicationFilter,
  ApplicationOverview,
} from "@/features/applications/types";

function getProjectExcerpt(value: string | null) {
  if (!value) {
    return "Projet non renseigné";
  }

  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}…` : value;
}

function getDecisionExcerpt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.length > 90 ? `${value.slice(0, 87).trimEnd()}…` : value;
}

function getEmptyMessage(filter: ApplicationFilter) {
  if (filter === "to_validate") {
    return "Aucune candidature à valider";
  }

  if (filter === "validated") {
    return "Aucune candidature validée";
  }

  if (filter === "unsuccessful") {
    return "Aucune candidature non aboutie";
  }

  return "Aucune candidature reçue";
}

function isToValidateStatus(status: string | null) {
  return status === "new" || status === "to_review" || status === "to_call";
}

export function ApplicationList({
  applications,
  filter,
}: {
  applications: ApplicationOverview[];
  filter: ApplicationFilter;
}) {
  if (applications.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
        <p className="text-lg font-semibold">{getEmptyMessage(filter)}</p>
        <p className="mt-2 text-sm text-muted">
          Les nouvelles candidatures apparaîtront ici après leur envoi.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="border-b bg-background text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-4">Candidat</th>
              <th className="px-5 py-4">Coordonnées</th>
              <th className="px-5 py-4">Statut</th>
              <th className="px-5 py-4">Préférence</th>
              <th className="px-5 py-4">Projet</th>
              <th className="px-5 py-4">Décision</th>
              <th className="px-5 py-4">Reçue le</th>
              <th className="px-5 py-4">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {applications.map((application) => {
              const isToValidate = isToValidateStatus(application.status);
              const candidateName =
                application.contact_display_name ?? "Nom non disponible";

              return (
                <tr
                  key={application.id}
                  className={isToValidate ? "bg-accent-soft/35" : undefined}
                >
                  <td className="px-5 py-5 align-top font-medium">
                    <div className="flex flex-col items-start gap-2">
                      {application.contact_id ? (
                        <Link
                          href={`/contacts/${application.contact_id}`}
                          className="text-accent hover:underline"
                        >
                          {candidateName}
                        </Link>
                      ) : (
                        <span>{candidateName}</span>
                      )}
                      {application.id ? (
                        <Link
                          href={`/candidatures/${application.id}`}
                          aria-label={`Ouvrir la candidature de ${candidateName}`}
                          className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                        >
                          Candidature
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-5 align-top">
                    <div>{application.contact_email ?? "Email non renseigné"}</div>
                    <div className="mt-1 text-muted">
                      {application.contact_phone ?? "Téléphone non renseigné"}
                    </div>
                  </td>
                  <td className="px-5 py-5 align-top">
                    <span
                      className={
                        isToValidate
                          ? "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                          : "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
                      }
                    >
                      {getApplicationStatusLabel(application.status)}
                    </span>
                  </td>
                  <td className="px-5 py-5 align-top">
                    {getSexPreferenceLabel(application.desired_sex_preference)}
                  </td>
                  <td className="max-w-sm px-5 py-5 align-top leading-6 text-muted">
                    {getProjectExcerpt(application.project_description)}
                  </td>
                  <td className="max-w-xs px-5 py-5 align-top">
                    {application.decision_note_preview ? (
                      <p className="leading-6 text-muted">
                        {getDecisionExcerpt(application.decision_note_preview)}
                      </p>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-5 align-top text-muted">
                    {formatApplicationDate(
                      application.submitted_at ?? application.created_at,
                    )}
                  </td>
                  <td className="px-5 py-5 align-top">
                    {application.public_form_name ??
                      application.public_form_slug ??
                      "Source non précisée"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
