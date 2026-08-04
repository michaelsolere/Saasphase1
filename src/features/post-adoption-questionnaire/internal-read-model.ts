import type {
  PublicQuestionnaireDefinition,
  PublicQuestionnaireQuestion,
  QuestionnaireAnswers,
} from "./public-model";

const SECTION_LABELS: Record<string, string> = {
  adaptation: "Adaptation",
  behavior: "Comportement",
  education: "Éducation et accompagnement",
  cleanliness: "Propreté",
  care: "Soins et manipulations",
  conclusion: "Conclusion",
  satisfaction: "Satisfaction",
  context: "Contexte",
  health: "Santé",
  health_events: "Événements de santé",
  weight: "Poids et silhouette",
  food: "Alimentation",
  sterilization: "Stérilisation",
};

export type InternalQuestionnaireSection = {
  key: string;
  label: string;
  questions: PublicQuestionnaireQuestion[];
};

export function formatInternalQuestionnaireSectionLabel(section: string) {
  const knownLabel = SECTION_LABELS[section];
  if (knownLabel) return knownLabel;

  const words = section.replaceAll("_", " ").trim();
  if (!words) return "Section";
  return `${words.charAt(0).toLocaleUpperCase("fr-FR")}${words.slice(1)}`;
}

export function buildInternalQuestionnaireSections(
  definition: PublicQuestionnaireDefinition,
  answers: QuestionnaireAnswers,
): InternalQuestionnaireSection[] {
  return definition.sectionOrder.flatMap((section) => {
    const questions = definition.questions.filter(
      (question) =>
        question.section === section &&
        Object.prototype.hasOwnProperty.call(answers, question.key),
    );

    return questions.length > 0
      ? [
          {
            key: section,
            label: formatInternalQuestionnaireSectionLabel(section),
            questions,
          },
        ]
      : [];
  });
}
