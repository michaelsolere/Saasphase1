import { expect, test } from "@playwright/test";

import { createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import { createTestAdopterRefundReadyScenario } from "./helpers/fixtures/adopter-refund-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (statement: string) => runE2eSqlSync(statement);

async function createRefund(args: {
  reservationId: string;
  amountCents: number;
  paidAt?: string;
  paymentMethod?: string;
  notes?: string | null;
}) {
  const supabase = await createAuthenticatedSupabaseClient();
  return supabase.rpc("create_reservation_refund", {
    p_reservation_id: args.reservationId,
    p_amount_cents: args.amountCents,
    p_payment_method: args.paymentMethod ?? "bank_transfer",
    p_paid_at: args.paidAt ?? "2026-07-25T12:00:00.000Z",
    p_notes: args.notes ?? null,
  });
}

async function readOverview(reservationId: string) {
  const supabase = await createAuthenticatedSupabaseClient();
  return expectSupabaseData(
    await supabase
      .from("reservation_overview")
      .select("id, paid_cents, refunded_cents")
      .eq("id", reservationId)
      .maybeSingle(),
    "read reservation_overview financials",
  );
}

async function readPayments(reservationId: string) {
  const supabase = await createAuthenticatedSupabaseClient();
  return expectSupabaseData(
    await supabase
      .from("payments")
      .select("id, amount_cents, payment_type, status")
      .eq("reservation_id", reservationId)
      .is("deleted_at", null)
      .order("created_at"),
    "read reservation payments",
  );
}

test("create_reservation_refund enforces refundable balance including concurrency", async () => {
  test.setTimeout(90_000);
  await withE2eFixtures(sql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const supabase = await createAuthenticatedSupabaseClient();

    const full = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund total ${suffix}`,
    });
    const partial = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund partiel ${suffix}`,
    });
    const sequential = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund successif ${suffix}`,
    });
    const concurrent = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund concurrent ${suffix}`,
    });
    const nonEur = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund devise USD ${suffix}`,
    });
    const mixedCurrency = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund devises incohérentes ${suffix}`,
    });
    const foreignOrganizationId = await createTestOrganization(sql, fixtures, {
      name: `E2E org refund étrangère ${suffix}`,
    });
    const foreign = await createTestAdopterRefundReadyScenario(sql, fixtures, {
      organizationId: foreignOrganizationId,
      ownerId,
      amountCents: 25_000,
      displayName: `E2E refund étranger ${suffix}`,
    });

    sql(`
      update public.reservations
      set currency='USD'
      where id in (
        '${nonEur.journey.id}'::uuid,
        '${mixedCurrency.journey.id}'::uuid
      );
      update public.payments
      set currency='USD'
      where id='${nonEur.payment.id}'::uuid;
    `);

    const nonEurRefund = await createRefund({
      reservationId: nonEur.journey.id,
      amountCents: 5_000,
    });
    expect(nonEurRefund.error).toBeNull();
    expect(nonEurRefund.data?.[0]?.outcome).toBe("created");
    fixtures.register("payments", nonEurRefund.data![0]!.payment_id!);
    expect(
      sql(`
        select currency
        from public.payments
        where id='${nonEurRefund.data![0]!.payment_id}'::uuid;
      `),
    ).toBe("USD");

    const mixedCurrencyRefund = await createRefund({
      reservationId: mixedCurrency.journey.id,
      amountCents: 5_000,
    });
    if (mixedCurrencyRefund.data?.[0]?.payment_id) {
      fixtures.register("payments", mixedCurrencyRefund.data[0].payment_id);
    }
    expect(mixedCurrencyRefund.error).toBeNull();
    expect(mixedCurrencyRefund.data?.[0]).toMatchObject({
      outcome: "ineligible",
      reason: "currency_mismatch",
      payment_id: null,
    });

    const exact = await createRefund({
      reservationId: full.journey.id,
      amountCents: 25_000,
      notes: "Remboursement total exact",
    });
    expect(exact.error).toBeNull();
    expect(exact.data?.[0]).toMatchObject({
      outcome: "created",
      amount_cents: 25_000,
      paid_cents: 25_000,
      refunded_cents: 25_000,
      refundable_cents: 0,
      reservation_id: full.journey.id,
      contact_id: full.contact.id,
    });
    expect(exact.data?.[0]?.payment_id).toEqual(expect.any(String));
    fixtures.register("payments", exact.data![0]!.payment_id!);
    expect(await readOverview(full.journey.id)).toMatchObject({
      paid_cents: 25_000,
      refunded_cents: 25_000,
    });
    const fullPayments = await readPayments(full.journey.id);
    expect(fullPayments).toHaveLength(2);
    expect(fullPayments.find((row) => row.id === full.payment.id)).toMatchObject({
      amount_cents: 25_000,
      payment_type: "pre_reservation_deposit_refundable",
      status: "paid",
    });
    expect(
      fullPayments.find((row) => row.payment_type === "refund"),
    ).toMatchObject({
      amount_cents: 25_000,
      status: "paid",
    });

    const overExact = await createRefund({
      reservationId: full.journey.id,
      amountCents: 1,
    });
    expect(overExact.error).toBeNull();
    expect(overExact.data?.[0]).toMatchObject({
      outcome: "exceeds_refundable",
      reason: "amount_exceeds_refundable",
      refundable_cents: 0,
      payment_id: null,
    });
    expect(overExact.data?.[0]?.message).toContain("dépasse le solde encore remboursable");
    expect(await readPayments(full.journey.id)).toHaveLength(2);

    const firstPartial = await createRefund({
      reservationId: partial.journey.id,
      amountCents: 10_000,
    });
    expect(firstPartial.error).toBeNull();
    expect(firstPartial.data?.[0]).toMatchObject({
      outcome: "created",
      amount_cents: 10_000,
      refundable_cents: 15_000,
    });
    fixtures.register("payments", firstPartial.data![0]!.payment_id!);

    const remainingPartial = await createRefund({
      reservationId: partial.journey.id,
      amountCents: 15_000,
    });
    expect(remainingPartial.error).toBeNull();
    expect(remainingPartial.data?.[0]).toMatchObject({
      outcome: "created",
      amount_cents: 15_000,
      refundable_cents: 0,
      refunded_cents: 25_000,
    });
    fixtures.register("payments", remainingPartial.data![0]!.payment_id!);
    expect(await readOverview(partial.journey.id)).toMatchObject({
      paid_cents: 25_000,
      refunded_cents: 25_000,
    });

    const firstSequential = await createRefund({
      reservationId: sequential.journey.id,
      amountCents: 20_000,
    });
    expect(firstSequential.data?.[0]?.outcome).toBe("created");
    fixtures.register("payments", firstSequential.data![0]!.payment_id!);

    const secondSequential = await createRefund({
      reservationId: sequential.journey.id,
      amountCents: 10_000,
    });
    expect(secondSequential.error).toBeNull();
    expect(secondSequential.data?.[0]).toMatchObject({
      outcome: "exceeds_refundable",
      reason: "amount_exceeds_refundable",
      refundable_cents: 5_000,
      payment_id: null,
    });
    expect(secondSequential.data?.[0]?.message).toMatch(/100,00 €/);
    expect(secondSequential.data?.[0]?.message).toMatch(/50,00 €/);
    expect(await readOverview(sequential.journey.id)).toMatchObject({
      paid_cents: 25_000,
      refunded_cents: 20_000,
    });
    expect(
      (await readPayments(sequential.journey.id)).filter(
        (row) => row.payment_type === "refund",
      ),
    ).toHaveLength(1);

    const [left, right] = await Promise.all([
      createRefund({
        reservationId: concurrent.journey.id,
        amountCents: 25_000,
        notes: "concurrent-a",
      }),
      createRefund({
        reservationId: concurrent.journey.id,
        amountCents: 25_000,
        notes: "concurrent-b",
      }),
    ]);
    expect(left.error).toBeNull();
    expect(right.error).toBeNull();
    const concurrentOutcomes = [left.data?.[0]?.outcome, right.data?.[0]?.outcome].sort();
    expect(concurrentOutcomes).toEqual(["created", "exceeds_refundable"]);
    const createdConcurrent = [left.data?.[0], right.data?.[0]].find(
      (row) => row?.outcome === "created",
    );
    expect(createdConcurrent?.payment_id).toEqual(expect.any(String));
    fixtures.register("payments", createdConcurrent!.payment_id!);
    expect(await readOverview(concurrent.journey.id)).toMatchObject({
      paid_cents: 25_000,
      refunded_cents: 25_000,
    });
    expect(
      (await readPayments(concurrent.journey.id)).filter(
        (row) => row.payment_type === "refund",
      ),
    ).toHaveLength(1);

    const foreignHidden = await supabase
      .from("reservations")
      .select("id")
      .eq("id", foreign.journey.id)
      .maybeSingle();
    expect(foreignHidden.error).toBeNull();
    expect(foreignHidden.data).toBeNull();

    const foreignPaymentsBefore = Number(
      await sql(
        `select count(*)::text from public.payments
         where reservation_id = '${foreign.journey.id}'::uuid
           and organization_id = '${foreignOrganizationId}'::uuid`,
      ),
    );
    expect(foreignPaymentsBefore).toBe(1);

    const foreignRefund = await createRefund({
      reservationId: foreign.journey.id,
      amountCents: 1_000,
    });
    expect(foreignRefund.error).toBeNull();
    expect(foreignRefund.data?.[0]).toMatchObject({
      outcome: "ineligible",
      reason: "reservation_not_found_or_forbidden",
      payment_id: null,
      contact_id: null,
    });
    expect(foreignRefund.data?.[0]?.message).toBe("La réservation est introuvable.");

    const missingRefund = await createRefund({
      reservationId: "bbbbbbbb-0002-4000-8000-00000000f099",
      amountCents: 1_000,
    });
    expect(missingRefund.error).toBeNull();
    expect(missingRefund.data?.[0]).toMatchObject({
      outcome: "ineligible",
      reason: "reservation_not_found_or_forbidden",
      payment_id: null,
      contact_id: null,
    });
    expect(missingRefund.data?.[0]?.message).toBe(foreignRefund.data?.[0]?.message);
    expect(missingRefund.data?.[0]?.reason).toBe(foreignRefund.data?.[0]?.reason);

    const foreignPaymentsAfter = Number(
      await sql(
        `select count(*)::text from public.payments
         where reservation_id = '${foreign.journey.id}'::uuid
           and organization_id = '${foreignOrganizationId}'::uuid`,
      ),
    );
    expect(foreignPaymentsAfter).toBe(1);
  });
});
