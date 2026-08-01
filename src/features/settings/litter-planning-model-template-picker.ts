import type { LitterPlanningModelEditorTemplateOption } from "@/features/settings/litter-planning-model-editor-draft";
import {
  formatLitterCareCategoryLabel,
  formatLitterCareTargetLabel,
} from "@/features/settings/litter-planning-model-labels";

export type LitterPlanningModelTemplatePickerFilters = {
  query: string;
  category: string;
  targetScope: string;
};

export type LitterPlanningModelTemplatePickerPresentation = {
  title: string;
  description: string | null;
  categoryLabel: string;
  targetLabel: string;
  inactiveLabel: string | null;
  optionLabel: string;
};

export type LitterPlanningModelTemplatePickerResult = {
  templateId: string;
  category: string;
  targetScope: string;
  presentation: LitterPlanningModelTemplatePickerPresentation;
};

export type LitterPlanningModelTemplatePickerFilterOption = {
  value: string;
  label: string;
};

export type LitterPlanningModelTemplatePickerProjection = {
  results: LitterPlanningModelTemplatePickerResult[];
  categoryOptions: LitterPlanningModelTemplatePickerFilterOption[];
  targetOptions: LitterPlanningModelTemplatePickerFilterOption[];
};

export function normalizeLitterPlanningModelTemplateSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}

function uniqueFilterOptions(
  templates: LitterPlanningModelEditorTemplateOption[],
  field: "category" | "targetScope",
  formatLabel: (value: string) => string,
): LitterPlanningModelTemplatePickerFilterOption[] {
  const values = new Map<string, string>();
  for (const template of templates) {
    const value = template[field];
    if (!values.has(value)) values.set(value, formatLabel(value));
  }
  return [...values].map(([value, label]) => ({ value, label }));
}

export function projectLitterPlanningModelTemplatePicker(input: {
  templates: LitterPlanningModelEditorTemplateOption[];
  filters: LitterPlanningModelTemplatePickerFilters;
}): LitterPlanningModelTemplatePickerProjection {
  const normalizedQuery = normalizeLitterPlanningModelTemplateSearch(
    input.filters.query,
  );

  const results = input.templates.flatMap(
    (template): LitterPlanningModelTemplatePickerResult[] => {
      if (
        input.filters.category &&
        template.category !== input.filters.category
      ) {
        return [];
      }
      if (
        input.filters.targetScope &&
        template.targetScope !== input.filters.targetScope
      ) {
        return [];
      }

      const categoryLabel = formatLitterCareCategoryLabel(template.category);
      const targetLabel = formatLitterCareTargetLabel(template.targetScope);
      const searchableText = normalizeLitterPlanningModelTemplateSearch(
        [
          template.title,
          template.description ?? "",
          categoryLabel,
          targetLabel,
        ].join(" "),
      );
      if (normalizedQuery && !searchableText.includes(normalizedQuery)) return [];

      const inactiveLabel = template.isActive ? null : "Inactif";
      return [
        {
          templateId: template.id,
          category: template.category,
          targetScope: template.targetScope,
          presentation: {
            title: template.title,
            description: template.description,
            categoryLabel,
            targetLabel,
            inactiveLabel,
            optionLabel: [
              template.title,
              categoryLabel,
              targetLabel,
              inactiveLabel,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        },
      ];
    },
  );

  return {
    results,
    categoryOptions: uniqueFilterOptions(
      input.templates,
      "category",
      formatLitterCareCategoryLabel,
    ),
    targetOptions: uniqueFilterOptions(
      input.templates,
      "targetScope",
      formatLitterCareTargetLabel,
    ),
  };
}
