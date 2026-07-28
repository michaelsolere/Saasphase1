export type LitterPlanAdHocMetadataEligibility = {
  role: "owner" | "admin" | "member" | "viewer" | null;
  originKind: string; itemKind: string; materializationState: string;
  hasModelSource: boolean; hasSeries: boolean; taskStatus: string | null;
  taskSource: string | null; taskKind: string | null; itemKindMatches: boolean;
  projectionsMatch: boolean;
};

export function canEditLitterPlanAdHocMetadata(value: LitterPlanAdHocMetadataEligibility) {
  return (value.role === "owner" || value.role === "admin" || value.role === "member")
    && value.originKind === "ad_hoc" && ["milestone", "task", "window"].includes(value.itemKind)
    && value.materializationState === "materialized" && !value.hasModelSource && !value.hasSeries
    && value.taskStatus === "planned" && value.taskSource === "manual" && value.taskKind === value.itemKind
    && value.itemKindMatches && value.projectionsMatch;
}
