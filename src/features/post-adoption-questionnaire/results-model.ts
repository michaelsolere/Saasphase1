import {
  isPostAdoptionDefinitionHomologated,
  type PostAdoptionMilestone,
} from "./compatibility";

export type { PostAdoptionMilestone } from "./compatibility";

export type PostAdoptionResultsReadRow = {
  litterId: string | null;
  litterName: string | null;
  litterDate: string | null;
  reservationId: string;
  reservationLitterId: string | null;
  animalId: string;
  animalLitterId: string | null;
  animalName: string;
  animalBirthDate: string | null;
  animalSex: string | null;
  instanceId: string | null;
  milestone: PostAdoptionMilestone | null;
  questionnaireCode: string | null;
  questionnaireVersion: number | null;
  instanceStatus: string | null;
  dueAt: string | null;
  responseDeadlineAt: string | null;
  latestRevisionNo: number | null;
  latestSubmittedAt: string | null;
  latestAnswers: Record<string, unknown> | null;
  definition: unknown | null;
  definitionValid: boolean | null;
};

export type PostAdoptionResultsOverview = {
  litters: Array<{
    id: string;
    name: string;
    date: string | null;
    coverage: {
      concernedAnimals: number;
      t1Received: number;
      t2Received: number;
    };
    animals: Array<{
      id: string;
      name: string;
      reservationId: string;
      milestones: Record<
        PostAdoptionMilestone,
        {
          state:
            | "absent"
            | "available_not_submitted"
            | "received"
            | "incompatible"
            | "invalid"
            | "linkage_issue";
          instanceId: string | null;
          revisionNo: number | null;
        }
      >;
    }>;
  }>;
};

export function buildPostAdoptionResultsOverview(
  rows: readonly PostAdoptionResultsReadRow[],
): PostAdoptionResultsOverview {
  const grouped = new Map<string, PostAdoptionResultsReadRow[]>();
  for (const row of rows) {
    if (!row.litterId) continue;
    grouped.set(row.litterId, [...(grouped.get(row.litterId) ?? []), row]);
  }

  const litters = Array.from(grouped, ([id, litterRows]) => {
    const received = (milestone: PostAdoptionMilestone) =>
      new Set(
        litterRows
          .filter(
            (row) =>
              row.milestone === milestone && row.latestRevisionNo !== null,
          )
          .map((row) => row.animalId),
      ).size;

    const animalRows = new Map<string, PostAdoptionResultsReadRow[]>();
    for (const row of litterRows) {
      animalRows.set(row.animalId, [...(animalRows.get(row.animalId) ?? []), row]);
    }
    const animals = Array.from(animalRows, ([animalId, rowsForAnimal]) => {
      const reference = rowsForAnimal[0];
      const linkageIssue =
        !reference.reservationLitterId ||
        !reference.animalLitterId ||
        reference.reservationLitterId !== reference.animalLitterId;
      const milestone = (code: PostAdoptionMilestone) => {
        const instance = rowsForAnimal.find((row) => row.milestone === code);
        if (linkageIssue) {
          return {
            state: "linkage_issue" as const,
            instanceId: instance?.instanceId ?? null,
            revisionNo: instance?.latestRevisionNo ?? null,
          };
        }
        if (!instance) {
          return { state: "absent" as const, instanceId: null, revisionNo: null };
        }
        const definition =
          instance.definition &&
          typeof instance.definition === "object" &&
          !Array.isArray(instance.definition)
            ? instance.definition as Record<string, unknown>
            : null;
        const invalid =
          !instance.instanceId ||
          !instance.questionnaireCode ||
          instance.questionnaireVersion === null ||
          instance.definitionValid === false ||
          (definition !== null && (
            definition.schemaVersion !== 1 ||
            (definition.rules as Record<string, unknown> | undefined)?.noGlobalScore !== true ||
            definition.code !== instance.questionnaireCode ||
            definition.version !== instance.questionnaireVersion
          ));
        return instance
          ? {
              state:
                invalid
                  ? "invalid" as const
                  : instance.questionnaireCode &&
                instance.questionnaireVersion !== null &&
                !isPostAdoptionDefinitionHomologated(
                  instance.questionnaireCode,
                  instance.questionnaireVersion,
                )
                  ? "incompatible" as const
                  : instance.latestRevisionNo === null
                    ? "available_not_submitted" as const
                    : "received" as const,
              instanceId: instance.instanceId,
              revisionNo: instance.latestRevisionNo,
            }
          : { state: "absent" as const, instanceId: null, revisionNo: null };
      };
      return {
        id: animalId,
        name: rowsForAnimal[0].animalName,
        reservationId: rowsForAnimal[0].reservationId,
        milestones: { t1: milestone("t1"), t2: milestone("t2") },
      };
    });

    return {
      id,
      name: litterRows[0].litterName ?? "Portée sans nom",
      date: litterRows[0].litterDate,
      coverage: {
        concernedAnimals: new Set(litterRows.map((row) => row.animalId)).size,
        t1Received: received("t1"),
        t2Received: received("t2"),
      },
      animals,
    };
  });

  litters.sort((left, right) => {
    if (left.date === right.date) return left.name.localeCompare(right.name, "fr");
    if (left.date === null) return 1;
    if (right.date === null) return -1;
    return right.date.localeCompare(left.date);
  });

  return { litters };
}
