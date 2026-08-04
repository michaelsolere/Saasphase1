import Link from "next/link";

import { listPublicAccessSummaries } from "./internal-service";
import { PublicQuestionnaireAccessManager } from "./public-access-manager";

const statusLabels: Record<string, string> = {
  planned: "Planifié",
  due: "À inviter",
  invited: "Ouvert",
  in_progress: "En cours",
  submitted: "Réponse reçue",
  under_review: "Lecture en cours",
  validated: "Validé",
  expired: "Expiré",
  suspended: "Suspendu",
};

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

export async function ReservationPostAdoptionQuestionnaireSection({
  animalName,
  animalId,
  reservationId,
}: {
  animalName: string;
  animalId: string | null;
  reservationId: string;
}) {
  const summaries = await listPublicAccessSummaries(reservationId).catch(() => null);
  const hasResults = Boolean(summaries?.some((summary) => summary.latestRevisionNo !== null));
  return (
    <section id="post-adoption-questionnaires" className="order-[19] rounded-2xl border bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Questionnaires post-adoption</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Liens publics T1/T2 et dernière version complète reçue. Créer un nouveau lien révoque immédiatement le précédent.
      </p>
      {!summaries ? (
        <p role="alert" className="mt-5 text-sm text-amber-800">Impossible de charger les questionnaires post-adoption.</p>
      ) : summaries.length === 0 ? (
        <p className="mt-5 text-sm text-muted">Aucun questionnaire n’est provisionné pour ce dossier.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {animalId && hasResults ? (
            <Link
              href={`/post-adoption/animals/${animalId}`}
              className="inline-flex rounded-xl border border-accent px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft"
            >
              Voir les résultats détaillés de {animalName}
            </Link>
          ) : null}
          {summaries.map((summary) => {
            const active = Boolean(summary.accessId && !summary.revokedAt);
            return (
              <article
                id={`post-adoption-responses-${summary.milestone}`}
                key={summary.instanceId}
                className="scroll-mt-24 rounded-2xl border bg-background p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                      {animalName} · {summary.milestone.toUpperCase()}
                    </p>
                    <h3 className="mt-1 font-semibold text-foreground">{summary.definition.title}</h3>
                  </div>
                  <span className="w-fit rounded-full border px-3 py-1 text-xs font-semibold text-muted">{statusLabels[summary.instanceStatus] ?? summary.instanceStatus}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div><dt className="text-xs font-semibold uppercase text-muted">Échéance</dt><dd className="mt-1">{formatDate(summary.responseDeadlineAt ?? summary.dueAt)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Lien</dt><dd className="mt-1">{active ? `Actif · …${summary.tokenHint}` : summary.revokedAt ? "Révoqué" : "Non créé"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Lecture publique</dt><dd className="mt-1">{formatDate(summary.publicReadUntil)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Version reçue</dt><dd className="mt-1">{summary.latestRevisionNo ? `Révision n° ${summary.latestRevisionNo}` : "Aucune"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Soumise le</dt><dd className="mt-1">{formatDate(summary.latestSubmittedAt)}</dd></div>
                </dl>
                <PublicQuestionnaireAccessManager instanceId={summary.instanceId} reservationId={reservationId} hasActiveAccess={active} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
