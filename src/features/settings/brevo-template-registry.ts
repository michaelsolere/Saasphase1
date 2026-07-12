export const brevoTransactionalTemplateConfigs = [
  {
    templateKey: "mating_confirmation",
    title: "Confirmation de saillie",
    category: "candidate_journey",
  },
  {
    templateKey: "pre_reservation",
    title: "Demande de pré-réservation",
    category: "candidate_journey",
  },
] as const;

export type BrevoTransactionalTemplateKey =
  (typeof brevoTransactionalTemplateConfigs)[number]["templateKey"];

export function getBrevoTransactionalTemplateConfig(
  templateKey: string | null,
) {
  return brevoTransactionalTemplateConfigs.find(
    (config) => config.templateKey === templateKey,
  );
}
