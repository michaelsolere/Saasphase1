import { isQuestionVisible, type QuestionnaireCondition } from "./public-model";
import {
  isPostAdoptionDefinitionHomologated,
  POST_ADOPTION_DEFINITION_CODES,
  type PostAdoptionMilestone,
} from "./compatibility";

export type { PostAdoptionMilestone } from "./compatibility";

export type PostAdoptionQuestionnaireSnapshot = {
  milestone: PostAdoptionMilestone;
  questionnaireCode: string;
  questionnaireVersion: number;
  revisionNo: number;
  submittedAt: string;
  definition: unknown;
  answers: Record<string, unknown>;
};

type AxisState =
  | "answered"
  | "explicit_unobservable"
  | "hidden"
  | "missing"
  | "invalid"
  | "incompatible";

export type PostAdoptionAxisMilestoneValue = {
  state: AxisState;
  value: string | null;
  label: string;
  position: number | null;
};

export type PostAdoptionIndividualAxis = {
  axis: string;
  label: string;
  kind: "ordered" | "nominal";
  categories: Array<{ value: string; label: string; position: number }>;
  t1: PostAdoptionAxisMilestoneValue | null;
  t2: PostAdoptionAxisMilestoneValue | null;
  connect: boolean;
};

export type PostAdoptionIndividualVisualization = {
  animalName: string;
  revisions: Record<
    PostAdoptionMilestone,
    {
      questionnaireCode: string;
      questionnaireVersion: number;
      revisionNo: number;
      submittedAt: string;
    } | null
  >;
  axes: PostAdoptionIndividualAxis[];
};

type AxisContract = {
  axis: string;
  label: string;
  kind: "ordered" | "nominal";
  values: readonly string[];
  unobservableValues?: readonly string[];
};

const AXIS_CONTRACTS: readonly AxisContract[] = [
  {
    axis: "activity",
    label: "Niveau d’activité",
    kind: "ordered",
    values: ["very_calm", "rather_calm", "intermediate", "rather_active", "very_active"],
  },
  {
    axis: "calm_return",
    label: "Retour au calme",
    kind: "ordered",
    values: ["very_easily", "rather_easily", "depends", "difficult", "very_difficult"],
  },
  {
    axis: "novelty",
    label: "Réaction à la nouveauté",
    kind: "ordered",
    values: [
      "very_comfortable",
      "rather_comfortable",
      "variable",
      "often_worried",
      "very_often_worried",
      "not_exposed",
    ],
    unobservableValues: ["not_exposed"],
  },
  {
    axis: "unknown_people",
    label: "Rencontres avec des personnes inconnues",
    kind: "ordered",
    values: [
      "very_easily",
      "rather_easily",
      "variable",
      "frequent_reserve",
      "major_difficulty",
      "no_encounter",
    ],
    unobservableValues: ["no_encounter"],
  },
  {
    axis: "dogs_exposure",
    label: "Exposition à d’autres chiens",
    kind: "ordered",
    values: ["regularly", "sometimes", "very_rarely", "no"],
  },
  {
    axis: "dogs_course",
    label: "Relations avec les autres chiens",
    kind: "ordered",
    values: [
      "very_easily",
      "rather_easily",
      "variable",
      "frequent_reserve",
      "major_difficulties",
    ],
  },
  {
    axis: "solitude_exposure",
    label: "Expérience de la solitude",
    kind: "ordered",
    values: ["never", "occasionally", "regularly"],
  },
  {
    axis: "solitude_duration",
    label: "Durée habituelle de solitude",
    kind: "ordered",
    values: ["under_30m", "30m_1h", "1h_2h", "2h_4h", "over_4h"],
  },
  {
    axis: "solitude_course",
    label: "Vécu de la solitude",
    kind: "ordered",
    values: ["very_well", "rather_well", "variable", "difficult", "not_observable"],
    unobservableValues: ["not_observable"],
  },
  {
    axis: "management_impact",
    label: "Impact des difficultés au quotidien",
    kind: "ordered",
    values: ["none", "light", "regular_manageable", "major_daily_impact"],
  },
  {
    axis: "education_support",
    label: "Accompagnement éducatif",
    kind: "nominal",
    values: ["current", "past", "planned", "no"],
  },
] as const;


type ParsedOption = { value: string; label: string };
type ParsedQuestion = {
  key: string;
  type: string;
  longitudinalAxis?: string;
  options: ParsedOption[];
  visibleWhen?: QuestionnaireCondition;
};
type ParsedDefinition = {
  code: string;
  version: number;
  questions: ParsedQuestion[];
};

function parseDefinition(value: unknown): ParsedDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const rules =
    candidate.rules && typeof candidate.rules === "object" && !Array.isArray(candidate.rules)
      ? (candidate.rules as Record<string, unknown>)
      : null;
  if (
    candidate.schemaVersion !== 1 ||
    rules?.noGlobalScore !== true ||
    typeof candidate.code !== "string" ||
    typeof candidate.version !== "number" ||
    !Array.isArray(candidate.questions)
  ) {
    return null;
  }
  const questions: ParsedQuestion[] = [];
  for (const raw of candidate.questions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const question = raw as Record<string, unknown>;
    if (
      typeof question.key !== "string" ||
      typeof question.type !== "string" ||
      (question.longitudinalAxis !== undefined &&
        typeof question.longitudinalAxis !== "string")
    ) {
      return null;
    }
    const options = Array.isArray(question.options)
      ? question.options.flatMap((rawOption) => {
          if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) {
            return [];
          }
          const option = rawOption as Record<string, unknown>;
          return typeof option.value === "string" && typeof option.label === "string"
            ? [{ value: option.value, label: option.label }]
            : [];
        })
      : [];
    questions.push({
      key: question.key,
      type: question.type,
      longitudinalAxis: question.longitudinalAxis as string | undefined,
      options,
      visibleWhen:
        question.visibleWhen && typeof question.visibleWhen === "object"
          ? (question.visibleWhen as QuestionnaireCondition)
          : undefined,
    });
  }
  return { code: candidate.code, version: candidate.version, questions };
}

function metadata(snapshot: PostAdoptionQuestionnaireSnapshot) {
  return {
    questionnaireCode: snapshot.questionnaireCode,
    questionnaireVersion: snapshot.questionnaireVersion,
    revisionNo: snapshot.revisionNo,
    submittedAt: snapshot.submittedAt,
  };
}

function unavailable(
  state: Exclude<AxisState, "answered" | "explicit_unobservable">,
  label: string,
): PostAdoptionAxisMilestoneValue {
  return { state, value: null, label, position: null };
}

function projectMilestone(
  snapshot: PostAdoptionQuestionnaireSnapshot,
  contract: AxisContract,
): { value: PostAdoptionAxisMilestoneValue; categories: PostAdoptionIndividualAxis["categories"] } {
  const definition = parseDefinition(snapshot.definition);
  if (
    !definition ||
    snapshot.questionnaireCode !== POST_ADOPTION_DEFINITION_CODES[snapshot.milestone] ||
    definition.code !== snapshot.questionnaireCode ||
    definition.version !== snapshot.questionnaireVersion
  ) {
    return { value: unavailable("invalid", "Définition ou donnée invalide"), categories: [] };
  }
  if (!isPostAdoptionDefinitionHomologated(definition.code, definition.version)) {
    return { value: unavailable("incompatible", "Version de définition non homologuée"), categories: [] };
  }
  const matches = definition.questions.filter((question) => question.longitudinalAxis === contract.axis);
  if (matches.length !== 1 || matches[0].type !== "single_choice") {
    return { value: unavailable("invalid", "Définition ou donnée invalide"), categories: [] };
  }
  const question = matches[0];
  const optionValues = question.options.map((option) => option.value);
  if (
    optionValues.length !== contract.values.length ||
    optionValues.some((value, index) => value !== contract.values[index])
  ) {
    return { value: unavailable("invalid", "Définition ou donnée invalide"), categories: [] };
  }
  const unobservable = new Set(contract.unobservableValues ?? []);
  const categories = question.options
    .filter((option) => !unobservable.has(option.value))
    .map((option, position) => ({ ...option, position }));
  if (!isQuestionVisible(question, snapshot.answers)) {
    return { value: unavailable("hidden", "Question masquée par le questionnaire"), categories };
  }
  if (!(question.key in snapshot.answers) || snapshot.answers[question.key] == null || snapshot.answers[question.key] === "") {
    return { value: unavailable("missing", "Réponse absente"), categories };
  }
  const answer = snapshot.answers[question.key];
  if (typeof answer !== "string") {
    return { value: unavailable("invalid", "Réponse invalide"), categories };
  }
  const option = question.options.find((candidate) => candidate.value === answer);
  if (!option) return { value: unavailable("invalid", "Réponse invalide"), categories };
  if (unobservable.has(answer)) {
    return {
      value: { state: "explicit_unobservable", value: answer, label: option.label, position: null },
      categories,
    };
  }
  return {
    value: {
      state: "answered",
      value: answer,
      label: option.label,
      position: contract.kind === "ordered" ? categories.findIndex((item) => item.value === answer) : null,
    },
    categories,
  };
}

export function buildPostAdoptionIndividualVisualization(input: {
  animalName: string;
  snapshots: readonly PostAdoptionQuestionnaireSnapshot[];
}): PostAdoptionIndividualVisualization {
  const byMilestone = new Map<PostAdoptionMilestone, PostAdoptionQuestionnaireSnapshot>();
  for (const snapshot of input.snapshots) {
    const current = byMilestone.get(snapshot.milestone);
    if (!current || snapshot.revisionNo > current.revisionNo) {
      byMilestone.set(snapshot.milestone, snapshot);
    }
  }
  const t1Snapshot = byMilestone.get("t1") ?? null;
  const t2Snapshot = byMilestone.get("t2") ?? null;
  const axes = AXIS_CONTRACTS.map((contract) => {
    const t1Projection = t1Snapshot ? projectMilestone(t1Snapshot, contract) : null;
    const t2Projection = t2Snapshot ? projectMilestone(t2Snapshot, contract) : null;
    return {
      axis: contract.axis,
      label: contract.label,
      kind: contract.kind,
      categories: t1Projection?.categories.length
        ? t1Projection.categories
        : (t2Projection?.categories ?? []),
      t1: t1Projection?.value ?? null,
      t2: t2Projection?.value ?? null,
      connect:
        contract.kind === "ordered" &&
        t1Projection?.value.state === "answered" &&
        t2Projection?.value.state === "answered",
    } satisfies PostAdoptionIndividualAxis;
  });
  return {
    animalName: input.animalName,
    revisions: {
      t1: t1Snapshot ? metadata(t1Snapshot) : null,
      t2: t2Snapshot ? metadata(t2Snapshot) : null,
    },
    axes,
  };
}
