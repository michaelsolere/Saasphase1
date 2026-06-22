export const desiredSexOptions = [
  {
    value: "male_only",
    label: "Mâle",
  },
  {
    value: "female_only",
    label: "Femelle",
  },
  {
    value: "male_preferred_female_possible",
    label: "Mâle envisagé, mais femelle possible",
  },
  {
    value: "female_preferred_male_possible",
    label: "Femelle envisagée, mais mâle possible",
  },
] as const;

export type DesiredSexPreference =
  (typeof desiredSexOptions)[number]["value"];

export type ApplicationFormValues = {
  firstName: string;
  lastName: string;
  familyOrStructureName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  desiredSexPreference: DesiredSexPreference | "";
  projectDescription: string;
  consentDataProcessing: boolean;
  consentContact: boolean;
};

export type ApplicationFormErrors = Partial<
  Record<keyof ApplicationFormValues | "form", string>
>;
