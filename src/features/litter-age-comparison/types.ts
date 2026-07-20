export type LitterComparisonCatalogItem = {
  selectionIndex: number;
  publicLabel: string;
  species: string;
  breed: string;
  birthDate: string | null;
  birthDateKind: "actual" | "expected" | null;
  status: string;
  compatibilityGroup: string;
};

export type LitterComparisonCatalogSnapshot = {
  entries: Array<{
    selectionIndex: number;
    litterId: string;
  }>;
};

export type LitterComparisonActionState =
  | { status: "idle" }
  | {
      status: "success";
      result: {
        species: string;
        breed: string;
        series: Array<{
          publicLabel: string;
          seriesIndex: number;
          totalAnimalCount: number;
          eligibleAnimalCount: number;
          excludedAnimalCount: number;
          status: "available" | "no_eligible_animals";
          points: Array<{
            ageDay: number;
            observedAnimalCount: number;
            averageGrams: number;
            averageRelativeIndex: number;
            averageRelativeProgressPercentage: number;
          }>;
        }>;
      };
    }
  | { status: "error"; message: string };

export const initialLitterComparisonActionState: LitterComparisonActionState = {
  status: "idle",
};
