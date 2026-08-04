import { listPublicAccessSummaries } from "./internal-service";
import { PublicQuestionnaireAccessManager } from "./public-access-manager";
import type {
  PublicQuestionnaireQuestion,
  QuestionnaireOption,
} from "./public-model";

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

function optionLabel(options: QuestionnaireOption[] | undefined, value: unknown) {
  return options?.find((option) => option.value === value)?.label ?? String(value ?? "—");
}

function nestedOptionLabel(
  question: PublicQuestionnaireQuestion,
  fieldKey: string,
  value: unknown,
) {
  const field = question.fields?.find((candidate) => candidate.key === fieldKey);
  const options =
    fieldKey === "category"
      ? question.eventCategories
      : field?.options?.map((option) =>
          typeof option === "string"
            ? { value: option, label: option.replaceAll("_", " ") }
            : option,
        );
  return optionLabel(options, value);
}

function AnswerValue({
  question,
  value,
}: {
  question: PublicQuestionnaireQuestion;
  value: unknown;
}) {
  if (question.type === "single_choice") {
    return <>{optionLabel(question.options, value)}</>;
  }
  if (question.type === "multi_choice" && Array.isArray(value)) {
    return <>{value.map((item) => optionLabel(question.options, item)).join(", ")}</>;
  }
  if (question.type === "matrix_single_choice" && value && typeof value === "object") {
    const matrix = value as Record<string, unknown>;
    return (
      <ul className="space-y-1">
        {question.rows?.map((row) => (
          <li key={row.key}>
            <span className="font-medium">{row.label ?? row.key} :</span>{" "}
            {optionLabel(question.options, matrix[row.key])}
          </li>
        ))}
      </ul>
    );
  }
  if (question.type === "repeater" && Array.isArray(value)) {
    return (
      <ol className="space-y-3">
        {value.map((entry, index) => (
          <li key={index} className="rounded-lg border bg-surface p-3">
            <p className="font-medium">Événement {index + 1}</p>
            <dl className="mt-2 space-y-1">
              {entry && typeof entry === "object"
                ? question.fields?.map((field) => {
                    const candidate = (entry as Record<string, unknown>)[field.key];
                    if (candidate === undefined || candidate === null || candidate === "") {
                      return null;
                    }
                    return (
                      <div key={field.key}>
                        <dt className="inline font-medium">
                          {field.label ?? field.key.replaceAll("_", " ")} :{" "}
                        </dt>
                        <dd className="inline">
                          {nestedOptionLabel(question, field.key, candidate)}
                        </dd>
                      </div>
                    );
                  })
                : null}
            </dl>
          </li>
        ))}
      </ol>
    );
  }
  return <>{Array.isArray(value) ? value.join(", ") : String(value ?? "—")}</>;
}

export async function ReservationPostAdoptionQuestionnaireSection({
  reservationId,
}: {
  reservationId: string;
}) {
  const summaries = await listPublicAccessSummaries(reservationId).catch(() => null);
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
          {summaries.map((summary) => {
            const active = Boolean(summary.accessId && !summary.revokedAt);
            return (
              <article key={summary.instanceId} className="rounded-2xl border bg-background p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">{summary.milestone.toUpperCase()}</p>
                    <h3 className="mt-1 font-semibold text-foreground">{summary.definition.title}</h3>
                  </div>
                  <span className="w-fit rounded-full border px-3 py-1 text-xs font-semibold text-muted">{statusLabels[summary.instanceStatus] ?? summary.instanceStatus}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-xs font-semibold uppercase text-muted">Échéance</dt><dd className="mt-1">{formatDate(summary.responseDeadlineAt ?? summary.dueAt)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Lien</dt><dd className="mt-1">{active ? `Actif · …${summary.tokenHint}` : summary.revokedAt ? "Révoqué" : "Non créé"}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Lecture publique</dt><dd className="mt-1">{formatDate(summary.publicReadUntil)}</dd></div>
                  <div><dt className="text-xs font-semibold uppercase text-muted">Version reçue</dt><dd className="mt-1">{summary.latestRevisionNo ? `n° ${summary.latestRevisionNo}` : "Aucune"}</dd></div>
                </dl>
                <PublicQuestionnaireAccessManager instanceId={summary.instanceId} reservationId={reservationId} hasActiveAccess={active} />
                {summary.latestAnswers ? (
                  <details className="mt-5 border-t pt-5">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">Lire la version courante · reçue le {formatDate(summary.latestSubmittedAt)}</summary>
                    <div className="mt-5 space-y-6">
                      {summary.definition.sectionOrder.map((section) => {
                        const questions = summary.definition.questions.filter((question) => question.section === section && summary.latestAnswers && question.key in summary.latestAnswers);
                        if (questions.length === 0) return null;
                        return (
                          <div key={section}>
                            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">{section.replaceAll("_", " ")}</h4>
                            <dl className="mt-3 space-y-4">
                              {questions.map((question) => (
                                <div key={question.key} className="rounded-xl border bg-surface p-4">
                                  <dt className="text-sm font-medium text-foreground">{question.label}</dt>
                                  <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted"><AnswerValue question={question} value={summary.latestAnswers?.[question.key]} /></dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
