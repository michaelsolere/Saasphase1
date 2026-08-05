import {
  buildPostAdoptionIndividualVisualization,
  type PostAdoptionAxisMilestoneValue,
} from "./individual-visualization-model";
import type { PostAdoptionMilestone } from "./compatibility";
import type { PostAdoptionResultsReadRow } from "./results-model";

export type PostAdoptionCollectiveAnimal = {
  animalId: string;
  animalName: string;
};

export type PostAdoptionCollectiveCategory = {
  value: string;
  label: string;
  count: number;
  animalNames: string[];
  animals: PostAdoptionCollectiveAnimal[];
};

export type PostAdoptionCollectiveState = {
  count: number;
  animalNames: string[];
  animals: PostAdoptionCollectiveAnimal[];
};

export type PostAdoptionCollectiveAxis = {
  axis: string;
  label: string;
  representedAnswers: number;
  hasChart: boolean;
  categories: PostAdoptionCollectiveCategory[];
  explicitUnobservable: PostAdoptionCollectiveState;
  notApplicable: PostAdoptionCollectiveState;
  missing: PostAdoptionCollectiveState;
  invalid: PostAdoptionCollectiveState;
};

export type PostAdoptionCollectiveQuestionnaireStates = {
  absent: PostAdoptionCollectiveState;
  notSubmitted: PostAdoptionCollectiveState;
  incompatible: PostAdoptionCollectiveState;
  invalid: PostAdoptionCollectiveState;
  linkageIssue: PostAdoptionCollectiveState;
};

export type PostAdoptionCollectiveResults = {
  milestone: PostAdoptionMilestone;
  counts: {
    concernedAnimals: number;
    receivedQuestionnaires: number;
  };
  usableQuestionnaires: number;
  questionnaireStates: PostAdoptionCollectiveQuestionnaireStates;
  axes: PostAdoptionCollectiveAxis[];
};

function emptyState(): PostAdoptionCollectiveState {
  return { count: 0, animalNames: [], animals: [] };
}

function addState(
  state: PostAdoptionCollectiveState,
  animal: PostAdoptionCollectiveAnimal,
) {
  state.count += 1;
  state.animalNames.push(animal.animalName);
  state.animals.push(animal);
}

function applyValue(
  axis: PostAdoptionCollectiveAxis,
  value: PostAdoptionAxisMilestoneValue | null,
  animal: PostAdoptionCollectiveAnimal,
) {
  if (!value) return;
  if (value.state === "answered" && value.value) {
    const category = axis.categories.find((item) => item.value === value.value);
    if (!category) return;
    category.count += 1;
    category.animalNames.push(animal.animalName);
    category.animals.push(animal);
    axis.representedAnswers += 1;
    return;
  }
  if (value.state === "explicit_unobservable") {
    addState(axis.explicitUnobservable, animal);
  } else if (value.state === "hidden") {
    addState(axis.notApplicable, animal);
  } else if (value.state === "missing") {
    addState(axis.missing, animal);
  } else if (value.state === "invalid") {
    addState(axis.invalid, animal);
  }
}

function isNewerRow(
  row: PostAdoptionResultsReadRow,
  current: PostAdoptionResultsReadRow,
) {
  return (
    (row.latestRevisionNo ?? -1) > (current.latestRevisionNo ?? -1) ||
    ((row.latestRevisionNo ?? -1) === (current.latestRevisionNo ?? -1) &&
      (row.latestSubmittedAt ?? "") > (current.latestSubmittedAt ?? ""))
  );
}

export function buildPostAdoptionCollectiveResults(
  rows: readonly PostAdoptionResultsReadRow[],
  milestone: PostAdoptionMilestone,
): PostAdoptionCollectiveResults {
  const animals = new Map<string, PostAdoptionCollectiveAnimal>();
  const latestByAnimal = new Map<string, PostAdoptionResultsReadRow>();
  for (const row of rows) {
    animals.set(row.animalId, {
      animalId: row.animalId,
      animalName: row.animalName,
    });
    if (row.milestone !== milestone) continue;
    const current = latestByAnimal.get(row.animalId);
    if (!current || isNewerRow(row, current)) latestByAnimal.set(row.animalId, row);
  }

  const questionnaireStates: PostAdoptionCollectiveQuestionnaireStates = {
    absent: emptyState(),
    notSubmitted: emptyState(),
    incompatible: emptyState(),
    invalid: emptyState(),
    linkageIssue: emptyState(),
  };
  const axes = new Map<string, PostAdoptionCollectiveAxis>();
  let usableQuestionnaires = 0;

  for (const animal of animals.values()) {
    const row = latestByAnimal.get(animal.animalId);
    if (!row || !row.instanceId) {
      addState(questionnaireStates.absent, animal);
      continue;
    }
    const linkageIssue =
      !row.reservationLitterId ||
      !row.animalLitterId ||
      row.reservationLitterId !== row.animalLitterId;
    if (linkageIssue) {
      addState(questionnaireStates.linkageIssue, animal);
      continue;
    }
    if (row.latestRevisionNo === null || !row.latestSubmittedAt) {
      addState(questionnaireStates.notSubmitted, animal);
      continue;
    }
    if (
      !row.questionnaireCode ||
      row.questionnaireVersion === null ||
      row.definitionValid === false ||
      !row.definition ||
      !row.latestAnswers
    ) {
      addState(questionnaireStates.invalid, animal);
      continue;
    }

    const visualization = buildPostAdoptionIndividualVisualization({
      animalName: row.animalName,
      snapshots: [{
        milestone,
        questionnaireCode: row.questionnaireCode,
        questionnaireVersion: row.questionnaireVersion,
        revisionNo: row.latestRevisionNo,
        submittedAt: row.latestSubmittedAt,
        definition: row.definition,
        answers: row.latestAnswers,
      }],
    });
    const projectedValues = visualization.axes.map((axis) => axis[milestone]);
    if (projectedValues.every((value) => value?.state === "incompatible")) {
      addState(questionnaireStates.incompatible, animal);
      continue;
    }
    if (projectedValues.every((value) => value?.state === "invalid")) {
      addState(questionnaireStates.invalid, animal);
      continue;
    }
    const hasUsableStructuredValue = projectedValues.some(
      (value) =>
        value?.state === "answered" ||
        value?.state === "explicit_unobservable" ||
        value?.state === "hidden",
    );
    if (!hasUsableStructuredValue) {
      addState(questionnaireStates.invalid, animal);
      continue;
    }

    usableQuestionnaires += 1;
    for (const projected of visualization.axes) {
      let aggregate = axes.get(projected.axis);
      if (!aggregate) {
        aggregate = {
          axis: projected.axis,
          label: projected.label,
          representedAnswers: 0,
          hasChart: false,
          categories: projected.categories.map((category) => ({
            value: category.value,
            label: category.label,
            count: 0,
            animalNames: [],
            animals: [],
          })),
          explicitUnobservable: emptyState(),
          notApplicable: emptyState(),
          missing: emptyState(),
          invalid: emptyState(),
        };
        axes.set(projected.axis, aggregate);
      }
      applyValue(aggregate, projected[milestone], animal);
    }
  }

  return {
    milestone,
    counts: {
      concernedAnimals: animals.size,
      receivedQuestionnaires: Array.from(latestByAnimal.values()).filter(
        (row) => row.latestRevisionNo !== null,
      ).length,
    },
    usableQuestionnaires,
    questionnaireStates,
    axes: Array.from(axes.values(), (axis) => ({
      ...axis,
      hasChart: axis.representedAnswers > 0,
      categories: axis.categories.filter((category) => category.count > 0),
    })),
  };
}
