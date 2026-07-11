export type CampaignEmailTemplateCategory =
  | "candidate_journey"
  | "adopter_journey"
  | "post_adoption";

export type CampaignEmailTemplateOption = {
  id: string;
  templateKey: string;
  title: string;
  category: CampaignEmailTemplateCategory;
  subject: string;
  body: string;
  brevoTemplateId: number | null;
  isActive: boolean;
};

const preferredCampaignCategories = new Set<CampaignEmailTemplateCategory>([
  "candidate_journey",
  "adopter_journey",
]);

const categoryOrder: Record<CampaignEmailTemplateCategory, number> = {
  candidate_journey: 0,
  adopter_journey: 1,
  post_adoption: 2,
};

export function isCampaignEmailTemplateCategory(
  category: string | null,
): category is CampaignEmailTemplateCategory {
  return (
    category === "candidate_journey" ||
    category === "adopter_journey" ||
    category === "post_adoption"
  );
}

export function getCampaignEmailTemplateOptions(
  templates: CampaignEmailTemplateOption[],
) {
  const preferredTemplates = templates.filter((template) =>
    preferredCampaignCategories.has(template.category),
  );
  const selectableTemplates =
    preferredTemplates.length > 0
      ? preferredTemplates
      : templates.filter((template) => template.category === "post_adoption");

  return [...selectableTemplates].sort((a, b) => {
    if (a.templateKey === "pre_reservation") {
      return -1;
    }

    if (b.templateKey === "pre_reservation") {
      return 1;
    }

    if (a.templateKey === "birth_documents_deposit") {
      return -1;
    }

    if (b.templateKey === "birth_documents_deposit") {
      return 1;
    }

    const categoryDelta = categoryOrder[a.category] - categoryOrder[b.category];

    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    return a.title.localeCompare(b.title, "fr");
  });
}
