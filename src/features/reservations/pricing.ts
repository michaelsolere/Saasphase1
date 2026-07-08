export type DefaultPuppyPriceSettings = {
  default_male_puppy_price_cents: number | null;
  default_female_puppy_price_cents: number | null;
  default_puppy_price_cents: number | null;
};

export function resolveDefaultPuppyPriceCents(
  settings: DefaultPuppyPriceSettings | null | undefined,
  animalSex: string | null | undefined,
) {
  if (!settings) {
    return null;
  }

  if (animalSex === "male" && settings.default_male_puppy_price_cents !== null) {
    return settings.default_male_puppy_price_cents;
  }

  if (
    animalSex === "female" &&
    settings.default_female_puppy_price_cents !== null
  ) {
    return settings.default_female_puppy_price_cents;
  }

  return settings.default_puppy_price_cents;
}
