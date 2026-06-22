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
        <p className="text-lg font-semibold">
          {filter === "to_review"
            ? "Aucune candidature à relire"
            : "Aucune candidature reçue"}
        </p>
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
              <th className="px-5 py-4">Reçue le</th>
              <th className="px-5 py-4">Contact</th>
              <th className="px-5 py-4">Coordonnées</th>
              <th className="px-5 py-4">Préférence</th>
              <th className="px-5 py-4">Projet</th>
              <th className="px-5 py-4">Source</th>
              <th className="px-5 py-4">Statut</th>
              <th className="px-5 py-4">
                <span className="sr-only">Ouvrir</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {applications.map((application) => {
              const isToReview = application.status === "to_review";

              return (
                <tr
                  key={application.id}
                  className={isToReview ? "bg-accent-soft/35" : undefined}
                >
                  <td className="whitespace-nowrap px-5 py-5 align-top text-muted">
                    {formatApplicationDate(
                      application.submitted_at ?? application.created_at,
                    )}
                  </td>
                  <td className="px-5 py-5 align-top font-medium">
                    {application.contact_display_name ?? "Nom non disponible"}
                  </td>
                  <td className="px-5 py-5 align-top">
                    <div>{application.contact_email ?? "Email non renseigné"}</div>
                    <div className="mt-1 text-muted">
                      {application.contact_phone ?? "Téléphone non renseigné"}
                    </div>
                  </td>
                  <td className="px-5 py-5 align-top">
                    {getSexPreferenceLabel(application.desired_sex_preference)}
                  </td>
                  <td className="max-w-sm px-5 py-5 align-top leading-6 text-muted">
                    {getProjectExcerpt(application.project_description)}
                  </td>
                  <td className="px-5 py-5 align-top">
                    {application.public_form_name ??
                      application.public_form_slug ??
                      "Source non précisée"}
                  </td>
                  <td className="px-5 py-5 align-top">
                    <span
                      className={
                        isToReview
                          ? "inline-flex rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white"
                          : "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted"
                      }
                    >
                      {getApplicationStatusLabel(application.status)}
                    </span>
                  </td>
                  <td className="px-5 py-5 text-right align-top">
                    {application.id ? (
                      <Link
                        href={`/candidatures/${application.id}`}
                        aria-label={`Ouvrir la candidature de ${
                          application.contact_display_name ??
                          "ce contact"
                        }`}
                        className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
                      >
                        Consulter
                      </Link>
                    ) : null}
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
