import Link from "next/link";

import {
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { formatLitterDate, getSpeciesLabel } from "@/features/litters/formatters";

export type LinkedApplication = {
  id: string;
  contact_id: string | null;
  contact_display_name: string | null;
  species: string | null;
  breed: string | null;
  desired_sex_preference: string | null;
  status: string | null;
  created_at: string | null;
};

export function LinkedApplicationsSection({
  title,
  emptyLabel,
  applications,
  hasError,
}: {
  title: string;
  emptyLabel: string;
  applications: LinkedApplication[] | null;
  hasError: boolean;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">{title}</h2>

      {hasError ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">
          Impossible de charger les candidatures liées.
        </p>
      ) : !applications || applications.length === 0 ? (
        <p className="mt-5 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-6 divide-y divide-border">
          {applications.map((application) => (
            <div key={application.id} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {application.contact_id ? (
                        <Link
                          href={`/contacts/${application.contact_id}`}
                          className="text-accent hover:underline"
                        >
                          {application.contact_display_name ??
                            "Contact non renseigné"}
                        </Link>
                      ) : (
                        application.contact_display_name ??
                        "Contact non renseigné"
                      )}
                    </span>
                    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold text-muted">
                      {getApplicationStatusLabel(application.status)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {getSpeciesLabel(application.species)} ·{" "}
                    {application.breed || "Race non renseignée"}
                  </p>
                  <p className="text-xs text-muted">
                    Sexe souhaité :{" "}
                    {getSexPreferenceLabel(application.desired_sex_preference)}
                  </p>
                  <p className="text-xs text-muted">
                    Créée le {formatLitterDate(application.created_at)}
                  </p>
                </div>
                <Link
                  href={`/candidatures/${application.id}`}
                  className="inline-flex self-start rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft sm:self-center"
                >
                  Consulter
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
