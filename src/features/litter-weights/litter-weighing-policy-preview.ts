import {
  parseLitterWeighingSchedulePolicy,
  type LitterWeighingSchedulePolicy,
} from "./litter-weighing-schedule-model";

export type LitterWeighingPolicyPreview = {
  policy: LitterWeighingSchedulePolicy;
  scheduledCount: number;
  ageDays: number[];
};

export type BuildLitterWeighingPolicyPreviewResult =
  | { ok: true; preview: LitterWeighingPolicyPreview }
  | { ok: false; error: string };

export function buildLitterWeighingPolicyPreview(
  candidate: unknown,
): BuildLitterWeighingPolicyPreviewResult {
  const parsed = parseLitterWeighingSchedulePolicy(candidate);
  if (!parsed.ok) return parsed;

  const ageDays: number[] = [];
  for (const phase of parsed.policy.phases) {
    for (
      let ageDay = phase.startAgeDay;
      ageDay <= phase.endAgeDay;
      ageDay += phase.intervalDays
    ) {
      ageDays.push(ageDay);
    }
  }

  return {
    ok: true,
    preview: {
      policy: parsed.policy,
      scheduledCount: ageDays.length,
      ageDays,
    },
  };
}
