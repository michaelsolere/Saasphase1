export type PostAdoptionMilestone = "t1" | "t2";

export const POST_ADOPTION_DEFINITION_CODES: Record<PostAdoptionMilestone, string> = {
  t1: "post-adoption-t1",
  t2: "post-adoption-t2",
};

const HOMOLOGATED_DEFINITIONS = new Set([
  "post-adoption-t1@1",
  "post-adoption-t2@1",
]);

export function isPostAdoptionDefinitionHomologated(
  questionnaireCode: string,
  questionnaireVersion: number,
) {
  return HOMOLOGATED_DEFINITIONS.has(
    `${questionnaireCode}@${questionnaireVersion}`,
  );
}
