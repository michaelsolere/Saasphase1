export type DefaultPuppyPriceSettings = {
  default_male_puppy_price_cents: number | null;
  default_female_puppy_price_cents: number | null;
  default_puppy_price_cents: number | null;
};

export type ReservationPriceProposalSource =
  | "male"
  | "female"
  | "generic"
  | "none";

export type ReservationPriceProposal =
  | {
      amountCents: number;
      source: Exclude<ReservationPriceProposalSource, "none">;
    }
  | {
      amountCents: null;
      source: "none";
    };

type ResolveReservationPriceProposalInput = {
  settings: DefaultPuppyPriceSettings | null | undefined;
  animalSex: string | null | undefined;
  reservedSexPreference: string | null | undefined;
};

const noPriceProposal: ReservationPriceProposal = {
  amountCents: null,
  source: "none",
};

function resolveGenericPriceProposal(
  settings: DefaultPuppyPriceSettings,
): ReservationPriceProposal {
  return settings.default_puppy_price_cents === null
    ? noPriceProposal
    : {
        amountCents: settings.default_puppy_price_cents,
        source: "generic",
      };
}

function resolveSexPriceProposal(
  settings: DefaultPuppyPriceSettings,
  sex: "male" | "female",
): ReservationPriceProposal {
  const amountCents =
    sex === "male"
      ? settings.default_male_puppy_price_cents
      : settings.default_female_puppy_price_cents;

  return amountCents === null
    ? resolveGenericPriceProposal(settings)
    : { amountCents, source: sex };
}

export function resolveReservationPriceProposal({
  settings,
  animalSex,
  reservedSexPreference,
}: ResolveReservationPriceProposalInput): ReservationPriceProposal {
  if (!settings) {
    return noPriceProposal;
  }

  if (animalSex === "male" || animalSex === "female") {
    return resolveSexPriceProposal(settings, animalSex);
  }

  if (reservedSexPreference === "male_only") {
    return resolveSexPriceProposal(settings, "male");
  }

  if (reservedSexPreference === "female_only") {
    return resolveSexPriceProposal(settings, "female");
  }

  return resolveGenericPriceProposal(settings);
}
