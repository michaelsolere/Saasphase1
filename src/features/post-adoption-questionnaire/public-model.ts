export type QuestionnaireCondition = {
  question?: string;
  equals?: string;
  notEquals?: string;
  in?: string[];
  anyQuestion?: string[];
  notIn?: string[];
  matrixQuestion?: string;
};

export type QuestionnaireOption = { value: string; label: string };
export type QuestionnaireNestedField = {
  key: string;
  label?: string;
  type: string;
  required: boolean;
  options?: string[] | QuestionnaireOption[];
};

export type PublicQuestionnaireQuestion = {
  key: string;
  section: string;
  type: string;
  label: string;
  required: boolean;
  options?: QuestionnaireOption[];
  rows?: Array<{ key: string; label?: string }>;
  eventCategories?: QuestionnaireOption[];
  fields?: QuestionnaireNestedField[];
  min?: number;
  max?: number;
  visibleWhen?: QuestionnaireCondition;
  requiredWhen?: QuestionnaireCondition;
};

export type PublicQuestionnaireDefinition = {
  schemaVersion: number;
  code: string;
  version: number;
  title: string;
  estimatedMinutes: { min: number; max: number };
  sectionOrder: string[];
  questions: PublicQuestionnaireQuestion[];
};

export type QuestionnaireAnswers = Record<string, unknown>;

function conditionMatches(
  condition: QuestionnaireCondition,
  answers: QuestionnaireAnswers,
) {
  if (condition.question) {
    const answer = answers[condition.question];
    if (answer === undefined) return false;
    if (condition.equals !== undefined) return answer === condition.equals;
    if (condition.notEquals !== undefined) return answer !== condition.notEquals;
    if (condition.in) return condition.in.includes(String(answer));
  }
  if (condition.anyQuestion && condition.notIn) {
    return condition.anyQuestion.some(
      (key) =>
        key in answers && !condition.notIn?.includes(String(answers[key])),
    );
  }
  if (condition.matrixQuestion && condition.in) {
    const matrix = answers[condition.matrixQuestion];
    return typeof matrix === "object" && matrix !== null
      ? Object.values(matrix).some((value) =>
          condition.in?.includes(String(value)),
        )
      : false;
  }
  return false;
}

export function isQuestionVisible(
  question: PublicQuestionnaireQuestion,
  answers: QuestionnaireAnswers,
) {
  return question.visibleWhen
    ? conditionMatches(question.visibleWhen, answers)
    : true;
}

function hasValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function isRequired(
  question: PublicQuestionnaireQuestion,
  answers: QuestionnaireAnswers,
) {
  if (!isQuestionVisible(question, answers)) return false;
  return question.requiredWhen
    ? conditionMatches(question.requiredWhen, answers)
    : question.required;
}

export function validateQuestionnaireSection(
  definition: PublicQuestionnaireDefinition,
  section: string,
  answers: QuestionnaireAnswers,
) {
  const errors: Record<string, string> = {};
  for (const question of definition.questions.filter(
    (item) => item.section === section,
  )) {
    if (!isRequired(question, answers)) continue;
    const answer = answers[question.key];
    if (!hasValue(answer)) {
      errors[question.key] = "Ce champ est obligatoire.";
      continue;
    }
    if (question.type === "matrix_single_choice") {
      const matrix =
        answer && typeof answer === "object" && !Array.isArray(answer)
          ? (answer as Record<string, unknown>)
          : {};
      if (question.rows?.some((row) => !hasValue(matrix[row.key]))) {
        errors[question.key] = "Répondez à chaque ligne.";
      }
    } else if (question.type === "repeater") {
      const entries = Array.isArray(answer) ? answer : [];
      if (
        entries.length === 0 ||
        entries.some(
          (entry) =>
            !entry ||
            typeof entry !== "object" ||
            Array.isArray(entry) ||
            question.fields?.some(
              (field) =>
                field.required &&
                !hasValue((entry as Record<string, unknown>)[field.key]),
            ),
        )
      ) {
        errors[question.key] = "Complétez chaque événement obligatoire.";
      }
    } else if (question.type === "decimal") {
      const numeric = Number(answer);
      if (
        !Number.isFinite(numeric) ||
        (question.min !== undefined && numeric < question.min) ||
        (question.max !== undefined && numeric > question.max)
      ) {
        errors[question.key] = "La valeur saisie est hors limites.";
      }
    }
  }
  return errors;
}

export type PublicAccessState = "active" | "revoked";
export type PublicInstanceStatus =
  | "planned"
  | "due"
  | "invited"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "validated"
  | "expired"
  | "suspended";
export type PublicQuestionnaireState =
  | "open"
  | "submitted"
  | "revisable"
  | "expired"
  | "validated"
  | "unavailable";

export function getPublicQuestionnaireState(
  input: {
    accessState: PublicAccessState;
    instanceStatus: PublicInstanceStatus;
    responseDeadlineAt: string;
    publicReadUntil: string;
    latestRevisionNo: number | null;
    latestSubmittedAt: string | null;
  },
  now = new Date(),
): PublicQuestionnaireState {
  if (input.accessState !== "active" || input.instanceStatus === "suspended") {
    return "unavailable";
  }
  if (input.instanceStatus === "validated") return "validated";
  const deadline = new Date(input.responseDeadlineAt);
  const readUntil = new Date(input.publicReadUntil);
  if (now > readUntil || now > deadline || input.instanceStatus === "expired") {
    return "expired";
  }
  if (input.latestRevisionNo) return "revisable";
  if (input.instanceStatus === "submitted" || input.instanceStatus === "under_review") {
    return "submitted";
  }
  return "open";
}
