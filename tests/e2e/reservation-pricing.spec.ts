import { expect, test } from "@playwright/test";

import { resolveReservationPriceProposal } from "../../src/features/reservations/pricing";

const settings = {
  default_male_puppy_price_cents: 181000,
  default_female_puppy_price_cents: 202000,
  default_puppy_price_cents: 190000,
};

test("proposes the male setting for an assigned male animal", () => {
  expect(
    resolveReservationPriceProposal({
      settings,
      animalSex: "male",
      reservedSexPreference: "female_only",
    }),
  ).toEqual({ amountCents: 181000, source: "male" });
});

test("proposes the female setting for an assigned female animal", () => {
  expect(
    resolveReservationPriceProposal({
      settings,
      animalSex: "female",
      reservedSexPreference: "male_only",
    }),
  ).toEqual({ amountCents: 202000, source: "female" });
});

test("falls back to the generic setting when a sex setting is absent", () => {
  expect(
    resolveReservationPriceProposal({
      settings: {
        ...settings,
        default_male_puppy_price_cents: null,
      },
      animalSex: "male",
      reservedSexPreference: "female_only",
    }),
  ).toEqual({ amountCents: 190000, source: "generic" });
});

test("uses a strict preference when no animal is assigned", () => {
  expect(
    resolveReservationPriceProposal({
      settings,
      animalSex: null,
      reservedSexPreference: "female_only",
    }),
  ).toEqual({ amountCents: 202000, source: "female" });
});

test("uses only the generic setting for a flexible preference", () => {
  expect(
    resolveReservationPriceProposal({
      settings,
      animalSex: null,
      reservedSexPreference: "male_preferred_female_possible",
    }),
  ).toEqual({ amountCents: 190000, source: "generic" });
});

test("returns no proposal when every eligible setting is absent", () => {
  expect(
    resolveReservationPriceProposal({
      settings: {
        default_male_puppy_price_cents: null,
        default_female_puppy_price_cents: null,
        default_puppy_price_cents: null,
      },
      animalSex: null,
      reservedSexPreference: "unknown",
    }),
  ).toEqual({ amountCents: null, source: "none" });
});
