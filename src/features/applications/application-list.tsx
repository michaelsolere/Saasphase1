import type {
  ApplicationFilter,
  ApplicationOverview,
} from "@/features/applications/types";

const statusLabels: Record<string, string> = {
  new: "Nouvelle",
  to_review: "À relire",
  to_call: "À appeler",
  qualified: "Qualifiée",
  waiting_litter: "En attente de portée",
  rejected: "Refusée",
  withdrawn: "Retirée",
  archived: "Archivée",
};

const sexPreferenceLabels: Record<string, string> = {
  male_only: "Mâle uniquement",
  female_only: "Femelle uniquement",
  male_preferred_female_possible: "Mâle préféré, femelle possible",
  female_preferred_male_possible: "Femelle préférée, mâle possible",
  no_preference: "Sans préférence",
  unknown: "Non précisé",
};

function formatDate(value: string | null) {
  if (!value) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getProjectExcerpt(value: string | null) {
  if (!value) {
    return "Projet non renseigné";
  }

  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}…` : value;
}

function getStatusLabel(value: string | null) {
  if (!value) {
    return "Statut inconnu";
  }

  return statusLabels[value] ?? value.replaceAll("_", " ");
}

function getSexPreferenceLabel(value: string | null) {
  if (!value) {
    return "Non précisé";
  }

  return sexPreferenceLabels[value] ?? value.replaceAll("_", " ");
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
                    {formatDate(
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
                      {getStatusLabel(application.status)}
                    </span>
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
