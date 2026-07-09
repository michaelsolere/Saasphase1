export function calculateRemainingBalanceCents({
  priceCents,
  paidCents,
  refundedCents,
}: {
  priceCents: number | null | undefined;
  paidCents: number | null | undefined;
  refundedCents: number | null | undefined;
}) {
  if (priceCents === null || priceCents === undefined) {
    return null;
  }

  return priceCents - ((paidCents ?? 0) - (refundedCents ?? 0));
}
