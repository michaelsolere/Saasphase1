import Link from "next/link";

import { ApplicationProjectDialog } from "@/features/applications/application-project-dialog";
import { ApplicationStatusActionDialog } from "@/features/applications/application-status-action-dialog";
import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import type {
  ApplicationFilter,
  ApplicationOverview,
} from "@/features/applications/types";

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

function getReturnPath(filter: ApplicationFilter) {
  if (filter === "validated") {
    return "/candidatures?filtre=validees";
  }

  if (filter === "unsuccessful") {
    return "/candidatures?filtre=non-abouties";
  }

  if (filter === "all") {
    return "/candidatures?filtre=toutes";
  }

  return "/candidatures";
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
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm text-foreground">
          <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="bg-background px-4 py-3">Candidat</th>
              <th className="bg-background px-4 py-3">Coordonnées</th>
              <th className="bg-background px-4 py-3">Statut</th>
              <th className="bg-background px-4 py-3">Préférence</th>
              <th className="bg-background px-4 py-3">Projet</th>
              <th className="bg-background px-4 py-3">Reçue le</th>
              <th className="bg-background px-4 py-3">Source</th>
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
                  className="transition-colors hover:bg-background"
                >
                  <td className="px-4 py-3 align-top font-medium">
                    <div className="flex flex-col items-start gap-1.5">
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
                          className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                        >
                          Candidature
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div>{application.contact_email ?? "Email non renseigné"}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {application.contact_phone ?? "Téléphone non renseigné"}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex max-w-[220px] flex-col items-start gap-1.5">
                      <span
                        className={
                          isToValidate
                            ? "inline-flex rounded-full border border-border bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent"
                            : "inline-flex rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted"
                        }
                      >
                        {getApplicationStatusLabel(application.status)}
                      </span>
                      {isToValidate && application.id ? (
                        <ApplicationStatusActionDialog
                          applicationId={application.id}
                          returnPath={getReturnPath(filter)}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {getSexPreferenceLabel(application.desired_sex_preference)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <ApplicationProjectDialog
                      candidateName={candidateName}
                      projectDescription={application.project_description}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-muted">
                    {formatApplicationDate(
                      application.submitted_at ?? application.created_at,
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
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
