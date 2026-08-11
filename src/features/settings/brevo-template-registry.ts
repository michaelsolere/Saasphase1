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
  {
    templateKey: "birth_documents_deposit",
    title: "Contrat + certificat et complément d’arrhes",
    category: "adopter_journey",
  },
  {
    templateKey: "direct_late_sale",
    title: "Vente directe tardive — dossier individuel",
    category: "adopter_journey",
  },
  {
    templateKey: "adopter_profile_invitation",
    title: "Invitation au questionnaire Profil",
    category: "adopter_journey",
  },
  {
    templateKey: "adopter_profile_reminder",
    title: "Relance du questionnaire Profil à J+7",
    category: "adopter_journey",
  },
  {
    templateKey: "post_adoption_t1",
    title: "Invitation au suivi post-adoption T1",
    category: "post_adoption",
  },
  {
    templateKey: "post_adoption_t2",
    title: "Invitation au suivi post-adoption T2",
    category: "post_adoption",
  },
  {
    templateKey: "post_adoption_reminder_7",
    title: "Relance post-adoption J+7",
    category: "post_adoption",
  },
  {
    templateKey: "post_adoption_reminder_14",
    title: "Relance post-adoption J+14",
    category: "post_adoption",
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
