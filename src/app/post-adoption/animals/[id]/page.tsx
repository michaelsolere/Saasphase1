import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PostAdoptionCompleteAnswers } from "@/features/post-adoption-questionnaire/complete-answers";
import { PostAdoptionIndividualVisualization } from "@/features/post-adoption-questionnaire/individual-visualization";
import { buildPostAdoptionIndividualVisualization } from "@/features/post-adoption-questionnaire/individual-visualization-model";
import { readPostAdoptionIndividualResultsRows } from "@/features/post-adoption-questionnaire/internal-service";
import type { PublicQuestionnaireDefinition } from "@/features/post-adoption-questionnaire/public-model";
import { buildPostAdoptionResultsOverview } from "@/features/post-adoption-questionnaire/results-model";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const stateLabels = {
  absent: "Jalon absent",
  available_not_submitted: "Disponible, non soumis",
  received: "Réponse reçue",
  incompatible: "Version non compatible",
  invalid: "Donnée invalide",
  linkage_issue: "Rattachement à vérifier",
} as const;

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function sexLabel(value: string | null) {
  if (value === "female") return "Femelle";
  if (value === "male") return "Mâle";
  return "Sexe non renseigné";
}

export default async function PostAdoptionAnimalResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await readPostAdoptionIndividualResultsRows(id, supabase).catch(() => null);
  if (rows === null) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          Impossible de charger ces résultats. Aucune donnée n’a été modifiée.
        </p>
      </main>
    );
  }
  if (rows.length === 0) notFound();

  const identity = rows[0];
  const animal = buildPostAdoptionResultsOverview(rows).litters[0]?.animals[0];
  if (!animal) notFound();

  const snapshots = rows.flatMap((row) => {
    if (
      !row.milestone ||
      !row.questionnaireCode ||
      row.questionnaireVersion === null ||
      row.latestRevisionNo === null ||
      !row.latestSubmittedAt ||
      !row.latestAnswers ||
      !row.definition
    ) return [];
    return [{
      milestone: row.milestone,
      questionnaireCode: row.questionnaireCode,
      questionnaireVersion: row.questionnaireVersion,
      revisionNo: row.latestRevisionNo,
      submittedAt: row.latestSubmittedAt,
      definition: row.definition as PublicQuestionnaireDefinition,
      answers: row.latestAnswers,
    }];
  });
  const visualization = snapshots.length > 0
    ? buildPostAdoptionIndividualVisualization({ animalName: identity.animalName, snapshots })
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10">
      <header className="border-b pb-7">
        <Link href={`/post-adoption/litters/${identity.litterId}`} className="text-sm font-semibold text-accent hover:underline">
          {identity.litterName}
        </Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-accent">
          Suivi post-adoption · Résultats individuels
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Résultats individuels de {identity.animalName}
        </h1>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="font-semibold text-muted">Portée</dt><dd className="mt-1">{identity.litterName}</dd></div>
          <div><dt className="font-semibold text-muted">Date de naissance</dt><dd className="mt-1">{formatDate(identity.animalBirthDate)}</dd></div>
          <div><dt className="font-semibold text-muted">Sexe</dt><dd className="mt-1">{sexLabel(identity.animalSex)}</dd></div>
        </dl>
        <Link href={`/reservations/${identity.reservationId}`} className="mt-5 inline-flex text-sm font-medium text-muted hover:text-accent hover:underline">
          Voir le parcours adoptant associé
        </Link>
      </header>

      <section className="py-8" aria-labelledby="milestones-heading">
        <h2 id="milestones-heading" className="text-xl font-semibold">Jalons T1 et T2</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {(["t1", "t2"] as const).map((milestone) => {
            const row = rows.find((candidate) => candidate.milestone === milestone);
            const state = animal.milestones[milestone].state;
            return (
              <article key={milestone} className="rounded-2xl border bg-surface p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold">{milestone.toUpperCase()}</h3>
                  <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold">{stateLabels[state]}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold uppercase text-muted">Version</dt><dd className="mt-1">{row?.questionnaireVersion ? `V${row.questionnaireVersion}` : "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Révision</dt><dd className="mt-1">{row?.latestRevisionNo ? `n° ${row.latestRevisionNo}` : "—"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Soumise le</dt><dd className="mt-1">{formatDate(row?.latestSubmittedAt ?? null, true)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Échéance</dt><dd className="mt-1">{formatDate(row?.responseDeadlineAt ?? row?.dueAt ?? null, true)}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      {visualization ? (
        <section className="pb-8" aria-label="Photographie descriptive T1 et T2">
          <PostAdoptionIndividualVisualization model={visualization} />
        </section>
      ) : null}

      <section className="border-t py-8" aria-labelledby="complete-answers-heading">
        <h2 id="complete-answers-heading" className="text-xl font-semibold">Réponses complètes</h2>
        <div className="mt-6 space-y-8">
          {rows.filter((row) => row.milestone && row.latestAnswers).map((row) => (
            <article id={`post-adoption-responses-${row.milestone}`} key={row.instanceId ?? row.milestone ?? row.animalId} className="scroll-mt-24 rounded-2xl border bg-background p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Questionnaire {row.milestone?.toUpperCase()}</h3>
              <p className="mt-1 text-sm text-muted">Révision n° {row.latestRevisionNo} · {formatDate(row.latestSubmittedAt, true)}</p>
              <div className="mt-6">
                {row.definition && row.definitionValid !== false ? (
                  <PostAdoptionCompleteAnswers
                    definition={row.definition as PublicQuestionnaireDefinition}
                    answers={row.latestAnswers ?? {}}
                  />
                ) : (
                  <p role="alert" className="text-sm text-amber-800">Cette version ne peut pas être affichée de façon fiable.</p>
                )}
              </div>
            </article>
          ))}
          {rows.every((row) => !row.latestAnswers) ? (
            <p className="rounded-2xl border bg-surface p-6 text-muted">Aucune réponse n’a encore été reçue.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
