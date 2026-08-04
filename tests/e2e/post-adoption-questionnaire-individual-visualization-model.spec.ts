import { expect, test } from "@playwright/test";

import {
  buildPostAdoptionIndividualVisualization,
  type PostAdoptionQuestionnaireSnapshot,
} from "../../src/features/post-adoption-questionnaire/individual-visualization-model";

const orderedAxes = [
  ["activity", "behavior_activity", ["very_calm", "rather_calm", "intermediate", "rather_active", "very_active"]],
  ["calm_return", "behavior_calm_return", ["very_easily", "rather_easily", "depends", "difficult", "very_difficult"]],
  ["novelty", "behavior_novelty", ["very_comfortable", "rather_comfortable", "variable", "often_worried", "very_often_worried", "not_exposed"]],
  ["unknown_people", "behavior_unknown_people", ["very_easily", "rather_easily", "variable", "frequent_reserve", "major_difficulty", "no_encounter"]],
  ["dogs_exposure", "behavior_dogs_exposure", ["regularly", "sometimes", "very_rarely", "no"]],
  ["dogs_course", "behavior_dogs_course", ["very_easily", "rather_easily", "variable", "frequent_reserve", "major_difficulties"]],
  ["solitude_exposure", "behavior_solitude_exposure", ["never", "occasionally", "regularly"]],
  ["solitude_duration", "behavior_solitude_duration", ["under_30m", "30m_1h", "1h_2h", "2h_4h", "over_4h"]],
  ["solitude_course", "behavior_solitude_course", ["very_well", "rather_well", "variable", "difficult", "not_observable"]],
  ["management_impact", "behavior_management_impact", ["none", "light", "regular_manageable", "major_daily_impact"]],
] as const;

function definition(code: "post-adoption-t1" | "post-adoption-t2", version = 1) {
  return {
    schemaVersion: 1,
    rules: { noGlobalScore: true },
    code,
    version,
    title: code === "post-adoption-t1" ? "Questionnaire T1" : "Questionnaire T2",
    estimatedMinutes: { min: 8, max: 10 },
    sectionOrder: ["behavior", "education"],
    questions: [
      ...orderedAxes.map(([axis, key, values]) => ({
        key,
        section: "behavior",
        type: "single_choice",
        label: `Question ${axis}`,
        required: true,
        longitudinalAxis: axis,
        options: values.map((value) => ({ value, label: `Libellé ${value}` })),
        ...(axis === "dogs_course"
          ? { visibleWhen: { question: "behavior_dogs_exposure", notEquals: "no" } }
          : axis === "solitude_duration" || axis === "solitude_course"
            ? {
                visibleWhen: {
                  question: "behavior_solitude_exposure",
                  in: ["occasionally", "regularly"],
                },
              }
            : {}),
      })),
      {
        key: "education_support_status",
        section: "education",
        type: "single_choice",
        label: "Accompagnement éducatif",
        required: true,
        longitudinalAxis: "education_support",
        options: ["current", "past", "planned", "no"].map((value) => ({
          value,
          label: `Libellé ${value}`,
        })),
      },
    ],
  };
}

function snapshot(
  milestone: "t1" | "t2",
  answers: Record<string, unknown>,
  version = 1,
): PostAdoptionQuestionnaireSnapshot {
  return {
    milestone,
    questionnaireCode: `post-adoption-${milestone}`,
    questionnaireVersion: version,
    revisionNo: milestone === "t1" ? 2 : 1,
    submittedAt: milestone === "t1" ? "2026-08-01T10:00:00Z" : "2026-08-02T10:00:00Z",
    definition: definition(`post-adoption-${milestone}`, version),
    answers,
  };
}

test("construit une photographie T1 complète sans inventer un jalon T2", () => {
  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [
      snapshot("t1", {
        behavior_activity: "intermediate",
        behavior_calm_return: "rather_easily",
        behavior_novelty: "rather_comfortable",
        behavior_unknown_people: "very_easily",
        behavior_dogs_exposure: "regularly",
        behavior_dogs_course: "rather_easily",
        behavior_solitude_exposure: "occasionally",
        behavior_solitude_duration: "30m_1h",
        behavior_solitude_course: "rather_well",
        behavior_management_impact: "light",
        education_support_status: "current",
      }),
    ],
  });

  expect(model.animalName).toBe("Nova");
  expect(model.revisions).toEqual({
    t1: {
      questionnaireCode: "post-adoption-t1",
      questionnaireVersion: 1,
      revisionNo: 2,
      submittedAt: "2026-08-01T10:00:00Z",
    },
    t2: null,
  });
  expect(model.axes).toHaveLength(11);
  expect(model.axes[0]).toMatchObject({
    axis: "activity",
    kind: "ordered",
    t1: {
      state: "answered",
      value: "intermediate",
      label: "Libellé intermediate",
      position: 2,
    },
    t2: null,
  });
  expect(model.axes.at(-1)).toMatchObject({
    axis: "education_support",
    kind: "nominal",
    t1: {
      state: "answered",
      value: "current",
      label: "Libellé current",
      position: null,
    },
    t2: null,
  });
});

test("sélectionne explicitement la révision familiale la plus récente de chaque jalon", () => {
  const older = snapshot("t1", { behavior_activity: "rather_calm" });
  const latest = {
    ...snapshot("t1", { behavior_activity: "very_active" }),
    revisionNo: 3,
    submittedAt: "2026-08-03T10:00:00Z",
  };

  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [latest, older],
  });

  expect(model.revisions.t1).toMatchObject({
    revisionNo: 3,
    submittedAt: "2026-08-03T10:00:00Z",
  });
  expect(model.axes[0].t1).toMatchObject({
    state: "answered",
    value: "very_active",
  });
});

test("refuse une définition dont le schéma publié est incomplet", () => {
  const malformed = definition("post-adoption-t1") as Record<string, unknown>;
  delete malformed.schemaVersion;

  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [
      {
        ...snapshot("t1", { behavior_activity: "intermediate" }),
        definition: malformed,
      },
    ],
  });

  expect(model.axes[0].t1).toEqual({
    state: "invalid",
    value: null,
    label: "Définition ou donnée invalide",
    position: null,
  });
});

test("refuse une définition qui n’interdit pas explicitement le score global", () => {
  const unsafe = definition("post-adoption-t1") as Record<string, unknown>;
  unsafe.rules = { noGlobalScore: false };

  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [
      {
        ...snapshot("t1", { behavior_activity: "intermediate" }),
        definition: unsafe,
      },
    ],
  });

  expect(model.axes[0].t1?.state).toBe("invalid");
});

test("distingue les réponses absentes, invalides, masquées et non observables", () => {
  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [
      snapshot("t1", {
        behavior_calm_return: 42,
        behavior_novelty: "not_exposed",
        behavior_unknown_people: "no_encounter",
        behavior_dogs_exposure: "no",
        behavior_dogs_course: "major_difficulties",
        behavior_solitude_exposure: "regularly",
        behavior_solitude_course: "not_observable",
      }),
    ],
  });
  const state = (axis: string) => model.axes.find((item) => item.axis === axis)?.t1?.state;

  expect(state("activity")).toBe("missing");
  expect(state("calm_return")).toBe("invalid");
  expect(state("novelty")).toBe("explicit_unobservable");
  expect(state("unknown_people")).toBe("explicit_unobservable");
  expect(state("dogs_course")).toBe("hidden");
  expect(state("solitude_duration")).toBe("missing");
  expect(state("solitude_course")).toBe("explicit_unobservable");
});

test("refuse une version non homologuée sans masquer le jalon V1 compatible", () => {
  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [
      snapshot("t1", { behavior_activity: "intermediate" }),
      snapshot("t2", { behavior_activity: "very_active" }, 2),
    ],
  });

  expect(model.axes[0]).toMatchObject({
    t1: { state: "answered", value: "intermediate" },
    t2: { state: "incompatible", value: null },
    connect: false,
  });
});

test("refuse une définition dont le code ne correspond pas au jalon", () => {
  const mismatched = {
    ...snapshot("t1", { behavior_activity: "intermediate" }),
    questionnaireCode: "post-adoption-t2",
    definition: definition("post-adoption-t2"),
  };

  const model = buildPostAdoptionIndividualVisualization({
    animalName: "Nova",
    snapshots: [mismatched],
  });

  expect(model.axes[0].t1?.state).toBe("invalid");
});
