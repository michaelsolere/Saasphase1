import { buildInternalQuestionnaireSections } from "./internal-read-model";
import type {
  PublicQuestionnaireDefinition,
  PublicQuestionnaireQuestion,
  QuestionnaireOption,
} from "./public-model";

function optionLabel(options: QuestionnaireOption[] | undefined, value: unknown) {
  return options?.find((option) => option.value === value)?.label ?? String(value ?? "—");
}

function nestedOptionLabel(
  question: PublicQuestionnaireQuestion,
  fieldKey: string,
  value: unknown,
) {
  const field = question.fields?.find((candidate) => candidate.key === fieldKey);
  const options = fieldKey === "category"
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
                    if (candidate === undefined || candidate === null || candidate === "") return null;
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

export function PostAdoptionCompleteAnswers({
  definition,
  answers,
}: {
  definition: PublicQuestionnaireDefinition;
  answers: Record<string, unknown>;
}) {
  const sections = buildInternalQuestionnaireSections(definition, answers);
  if (sections.length === 0) {
    return (
      <p role="alert" className="text-sm text-amber-800">
        Cette révision ne contient aucune réponse lisible.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {section.label}
          </h3>
          <dl className="mt-3 space-y-4">
            {section.questions.map((question) => (
              <div key={question.key} className="rounded-xl border bg-surface p-4">
                <dt className="text-sm font-medium text-foreground">{question.label}</dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                  <AnswerValue question={question} value={answers[question.key]} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
