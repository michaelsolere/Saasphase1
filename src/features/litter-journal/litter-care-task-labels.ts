import type {
  LitterCareTaskAnchorType,
  LitterCareTaskCategory,
  LitterCareTaskTargetScope,
} from "./litter-care-tasks";

export const litterCareTaskCategoryLabels: Record<
  LitterCareTaskCategory,
  string
> = {
  reproduction: "Reproduction",
  maternal_health: "Santé de la mère",
  maternal_feeding: "Alimentation de la mère",
  preparation: "Préparation",
  offspring_weight: "Poids des petits",
  offspring_health: "Santé des petits",
  offspring_feeding: "Alimentation des petits",
  socialization: "Socialisation",
  veterinary: "Vétérinaire",
  identification: "Identification",
  vaccination: "Vaccination",
  other: "Autre",
};

export const litterCareTaskTargetLabels: Record<
  LitterCareTaskTargetScope,
  string
> = {
  mother: "Mère",
  litter: "Portée",
  all_offspring: "Tous les petits",
  organization: "Élevage",
};

export const litterCareTaskAnchorLabels: Record<
  LitterCareTaskAnchorType,
  string
> = {
  first_mating: "Première saillie",
  estimated_ovulation: "Ovulation estimée",
  expected_birth: "Naissance prévue",
  actual_birth: "Naissance réelle",
  offspring_age: "Âge des petits",
};

export const litterCareTaskSpeciesLabels = {
  dog: "Chien",
  cat: "Chat",
} as const;

export function formatLitterCareTaskOffset(
  anchorType: LitterCareTaskAnchorType,
  offsetDays: number,
) {
  if (anchorType === "offspring_age") {
    if (offsetDays === 0) return "À la naissance";
    return `À ${offsetDays} ${Math.abs(offsetDays) === 1 ? "jour" : "jours"} de vie`;
  }

  if (offsetDays === 0) return "Le jour même";
  const absoluteDays = Math.abs(offsetDays);
  const dayLabel = absoluteDays === 1 ? "jour" : "jours";
  return offsetDays < 0
    ? `${absoluteDays} ${dayLabel} avant`
    : `${absoluteDays} ${dayLabel} après`;
}
