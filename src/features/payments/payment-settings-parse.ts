/** Postgres `integer` upper bound — shared with animal price settings. */
export const POSTGRES_INTEGER_MAX_CENTS = 2_147_483_647;
const centsPerEuro = BigInt(100);

export type ParseEuroCentsSuccess = {
  ok: true;
  value: number | null;
};

export type ParseEuroCentsFailure = {
  ok: false;
};

export type ParseEuroCentsResult = ParseEuroCentsSuccess | ParseEuroCentsFailure;

export type ParseIntegerSuccess = {
  ok: true;
  value: number;
};

export type ParseIntegerFailure = {
  ok: false;
};

export type ParseIntegerResult = ParseIntegerSuccess | ParseIntegerFailure;

function normalizeFormText(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim();
}

/**
 * Parses a euro amount into integer cents.
 * Accepts `250`, `250,00`, `250.50`. Rejects empty (unless allowEmpty),
 * negatives, more than two decimals, non-numeric text, and amounts above
 * the Postgres integer range.
 */
export function parseEuroAmountCents(
  value: FormDataEntryValue | string | null | undefined,
  {
    allowEmpty = false,
    requirePositive = false,
  }: { allowEmpty?: boolean; requirePositive?: boolean } = {},
): ParseEuroCentsResult {
  const trimmedValue = normalizeFormText(value);
  if (trimmedValue === null) {
    return { ok: false };
  }

  if (!trimmedValue) {
    return allowEmpty ? { ok: true, value: null } : { ok: false };
  }

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(trimmedValue)) {
    return { ok: false };
  }

  const [euros, decimals = ""] = trimmedValue.replace(",", ".").split(".");
  const cents = BigInt(euros) * centsPerEuro + BigInt(decimals.padEnd(2, "0"));

  if (cents > BigInt(POSTGRES_INTEGER_MAX_CENTS)) {
    return { ok: false };
  }

  const amountCents = Number(cents);
  if (!Number.isSafeInteger(amountCents)) {
    return { ok: false };
  }

  if (requirePositive && amountCents <= 0) {
    return { ok: false };
  }

  if (!requirePositive && amountCents < 0) {
    return { ok: false };
  }

  return { ok: true, value: amountCents };
}

export function parseRequiredPositiveEuroCents(
  value: FormDataEntryValue | string | null | undefined,
): { ok: true; value: number } | ParseEuroCentsFailure {
  const parsed = parseEuroAmountCents(value, { requirePositive: true });
  if (!parsed.ok || parsed.value === null) {
    return { ok: false };
  }

  return { ok: true, value: parsed.value };
}

export function parseOptionalEuroCents(
  value: FormDataEntryValue | string | null | undefined,
): ParseEuroCentsResult {
  return parseEuroAmountCents(value, { allowEmpty: true });
}

export function parseNonNegativeInteger(
  value: FormDataEntryValue | string | null | undefined,
): ParseIntegerResult {
  const trimmedValue = normalizeFormText(value);
  if (trimmedValue === null || !trimmedValue) {
    return { ok: false };
  }

  if (!/^\d+$/.test(trimmedValue)) {
    return { ok: false };
  }

  const integerValue = Number(trimmedValue);
  if (
    !Number.isSafeInteger(integerValue) ||
    integerValue < 0 ||
    integerValue > POSTGRES_INTEGER_MAX_CENTS
  ) {
    return { ok: false };
  }

  return { ok: true, value: integerValue };
}

export function formatEuroInputValue(amountCents: number | null) {
  if (amountCents === null) {
    return "";
  }

  return (amountCents / 100).toFixed(2);
}

/** Live preview helper: returns cents or null when the field is empty/invalid. */
export function previewEuroAmountCents(value: string): number | null {
  const parsed = parseEuroAmountCents(value, { allowEmpty: true });
  if (!parsed.ok || parsed.value === null) {
    return null;
  }

  return parsed.value;
}

export function formatEuroPreview(amountCents: number | null, currency = "EUR") {
  if (amountCents === null) {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}
