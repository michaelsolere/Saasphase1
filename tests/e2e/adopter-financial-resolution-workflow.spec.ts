import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createTestMembership,
  createTestOrganization,
} from "./helpers/fixtures/breeding-fixtures";
import { createTestAdopterCancellationReadyScenario } from "./helpers/fixtures/adopter-cancellation-fixtures";
import { createTestReceivedPayment } from "./helpers/fixtures/adopter-payment-fixtures";
import { registerActualRefundEffects } from "./helpers/fixtures/adopter-refund-fixtures";
import { createE2eFixtureRegistry, withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import { runE2eSql, runE2eSqlSync } from "./helpers/supabase";

const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";

function jsonSql(statement: string) {
  const line = sql(statement)
    .split(/\r?\n/)
    .find((value) => value.trimStart().startsWith("{"));
  if (!line) throw new Error("Expected a JSON SQL result");
  return JSON.parse(line) as Record<string, unknown>;
}

function jsonFromOutput(output: string) {
  const line = output
    .split(/\r?\n/)
    .find((value) => value.trimStart().startsWith("{"));
  if (!line) throw new Error("Expected a JSON SQL result");
  return JSON.parse(line) as Record<string, unknown>;
}

async function createPendingJourney(
  fixtures: ReturnType<typeof createE2eFixtureRegistry>,
  amountCents: number,
  targetStatus: "withdrawn" | "cancelled" | "expired" = "withdrawn",
) {
  const suffix = fixtures.namespace.slice(-8);
  const scenario = await createTestAdopterCancellationReadyScenario(
    runE2eSql,
    fixtures,
    {
      organizationId,
      ownerId,
      displayName: `E2E décision financière ${suffix}`,
    },
  );
  if (amountCents > 0) {
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents,
    });
  }

  const expectedUpdatedAt = sql(
    `select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`,
  );
  const opened = jsonSql(`
    begin;
    set local role authenticated;
    set local request.jwt.claim.sub = ${q(ownerId)};
    select jsonb_build_object(
      'outcome', response.outcome,
      'reason', response.reason,
      'eventId', response.event_id,
      'financialResolution', response.financial_resolution,
      'refundableCents', response.refundable_cents
    )::text
    from public.transition_adopter_journey_exit(
      ${q(scenario.journey.id)}::uuid,
      ${q(randomUUID())}::uuid,
      ${q(targetStatus)},
      ${q(expectedUpdatedAt)}::timestamptz
    ) response;
    commit;
  `);
  expect(opened.outcome).toBe("success");
  fixtures.register("adopter_financial_resolution_events", opened.eventId as string);
  return { scenario, opened };
}

function recordResolution(input: {
  reservationId: string;
  expectedEventId: string;
  actorId?: string;
  commandId?: string;
  resolution: "full_refund" | "partial_refund" | "no_refund";
  amountCents?: number;
  paymentMethod?: string | null;
  paidAt?: string | null;
  reason: string;
  voidPaymentId?: string | null;
}) {
  return jsonSql(`
    begin;
    set local role authenticated;
    set local request.jwt.claim.sub = ${q(input.actorId ?? ownerId)};
    select jsonb_build_object(
      'outcome', response.outcome,
      'reason', response.reason,
      'replayed', response.replayed,
      'eventId', response.event_id,
      'paymentId', response.payment_id,
      'financialResolution', response.financial_resolution,
      'refundedCents', response.refunded_cents,
      'refundableCents', response.refundable_cents,
      'retainedCents', response.retained_cents
    )::text
    from public.record_adopter_financial_resolution(
      ${q(input.reservationId)}::uuid,
      ${q(input.commandId ?? randomUUID())}::uuid,
      ${q(input.resolution)},
      ${input.amountCents ?? 0},
      ${input.paymentMethod ? q(input.paymentMethod) : "null"}::text,
      ${input.paidAt ? `${q(input.paidAt)}::timestamptz` : "null::timestamptz"},
      ${q(input.reason)},
      ${q(input.expectedEventId)}::uuid,
      ${input.voidPaymentId ? `${q(input.voidPaymentId)}::uuid` : "null::uuid"}
    ) response;
    commit;
  `);
}

test("marks a negative exit without payment as requiring no financial action", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 0, "expired");

    expect(opened).toMatchObject({
      outcome: "success",
      financialResolution: "none",
      refundableCents: 0,
    });
    expect(
      jsonSql(`
        select json_build_object(
          'status', r.status,
          'financialResolution', r.financial_resolution,
          'eventType', e.event_type
        )::text
        from public.reservations r
        join public.adopter_financial_resolution_events e
          on e.id = r.current_financial_resolution_event_id
        where r.id=${q(scenario.journey.id)}::uuid;
      `),
    ).toEqual({
      status: "expired",
      financialResolution: "none",
      eventType: "not_required",
    });
  }));

test("opens the same pending resolution for a cancelled journey with money received", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(
      fixtures,
      15_000,
      "cancelled",
    );
    expect(opened).toMatchObject({
      outcome: "success",
      financialResolution: "pending",
      refundableCents: 15_000,
    });
    expect(
      jsonSql(`
        select json_build_object(
          'status', status,
          'financialResolution', financial_resolution
        )::text
        from public.reservations
        where id=${q(scenario.journey.id)}::uuid;
      `),
    ).toEqual({ status: "cancelled", financialResolution: "pending" });
  }));

test("opens a pending resolution when a paid journey expires", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 18_000, "expired");

    expect(opened).toMatchObject({
      outcome: "success",
      financialResolution: "pending",
      refundableCents: 18_000,
    });
    expect(
      jsonSql(`
        select json_build_object(
          'status', r.status,
          'financialResolution', r.financial_resolution,
          'eventCount', count(distinct e.id)::integer,
          'refundCount', count(distinct p.id) filter (
            where p.payment_type in ('refund', 'partial_refund')
          )::integer
        )::text
        from public.reservations r
        join public.adopter_financial_resolution_events e
          on e.organization_id=r.organization_id and e.reservation_id=r.id
        left join public.payments p
          on p.organization_id=r.organization_id and p.reservation_id=r.id
        where r.id=${q(scenario.journey.id)}::uuid
        group by r.id;
      `),
    ).toEqual({
      status: "expired",
      financialResolution: "pending",
      eventCount: 1,
      refundCount: 0,
    });
  }));

test("blocks mixed currencies before opening a financial resolution", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const exitScenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E devises incohérentes sortie ${suffix}`,
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      contactId: exitScenario.contact.id,
      reservationId: exitScenario.journey.id,
      ownerId,
      amountCents: 15_000,
    });
    sql(`
      update public.reservations
      set currency='USD'
      where id=${q(exitScenario.journey.id)}::uuid;
    `);
    const exitUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(exitScenario.journey.id)}::uuid;`,
    );
    const mixedExit = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', outcome,
        'reason', reason,
        'eventId', event_id
      )::text
      from public.transition_adopter_journey_exit(
        ${q(exitScenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'expired',
        ${q(exitUpdatedAt)}::timestamptz
      );
      commit;
    `);
    if (mixedExit.eventId) {
      fixtures.register("adopter_financial_resolution_events", mixedExit.eventId as string);
    }
    expect(mixedExit).toMatchObject({ outcome: "blocked", reason: "currency_mismatch" });
    expect(
      jsonSql(`
        select json_build_object(
          'status', status,
          'financialResolution', financial_resolution,
          'eventCount', (
            select count(*)::integer
            from public.adopter_financial_resolution_events
            where reservation_id=r.id
          )
        )::text
        from public.reservations r
        where id=${q(exitScenario.journey.id)}::uuid;
      `),
    ).toEqual({ status: "active", financialResolution: "none", eventCount: 0 });

  }));

test("hides another organization's journey from exit and resolution commands", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const foreignOrganizationId = await createTestOrganization(runE2eSql, fixtures, {
      name: `E2E organisation financière étrangère ${suffix}`,
    });
    await createTestMembership(runE2eSql, fixtures, {
      organizationId: foreignOrganizationId,
      profileId: memberId,
      role: "admin",
    });
    const foreignScenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId: foreignOrganizationId,
        ownerId: memberId,
        displayName: `E2E décision financière étrangère ${suffix}`,
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId: foreignOrganizationId,
      contactId: foreignScenario.contact.id,
      reservationId: foreignScenario.journey.id,
      ownerId: memberId,
      amountCents: 22_000,
    });
    const expectedUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(foreignScenario.journey.id)}::uuid;`,
    );
    const foreignExitAttempt = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object('outcome', outcome, 'reason', reason)::text
      from public.transition_adopter_journey_exit(
        ${q(foreignScenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'withdrawn',
        ${q(expectedUpdatedAt)}::timestamptz
      );
      commit;
    `);
    expect(foreignExitAttempt).toEqual({ outcome: "error", reason: "not_found" });

    const opened = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(memberId)};
      select jsonb_build_object('outcome', outcome, 'eventId', event_id)::text
      from public.transition_adopter_journey_exit(
        ${q(foreignScenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'withdrawn',
        ${q(expectedUpdatedAt)}::timestamptz
      );
      commit;
    `);
    expect(opened.outcome).toBe("success");
    fixtures.register("adopter_financial_resolution_events", opened.eventId as string);

    const foreignResolutionAttempt = recordResolution({
      reservationId: foreignScenario.journey.id,
      expectedEventId: opened.eventId as string,
      actorId: ownerId,
      resolution: "full_refund",
      amountCents: 22_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T10:00:00Z",
      reason: "Cette décision d'un autre élevage doit rester inaccessible.",
    });
    expect(foreignResolutionAttempt).toEqual(
      expect.objectContaining({ outcome: "error", reason: "not_found" }),
    );
    expect(
      jsonSql(`
        select json_build_object(
          'status', r.status,
          'financialResolution', r.financial_resolution,
          'eventCount', count(distinct e.id)::integer,
          'refundCount', count(distinct p.id) filter (
            where p.payment_type in ('refund', 'partial_refund')
          )::integer
        )::text
        from public.reservations r
        left join public.adopter_financial_resolution_events e
          on e.organization_id=r.organization_id and e.reservation_id=r.id
        left join public.payments p
          on p.organization_id=r.organization_id and p.reservation_id=r.id
        where r.id=${q(foreignScenario.journey.id)}::uuid
        group by r.id;
      `),
    ).toEqual({
      status: "withdrawn",
      financialResolution: "pending",
      eventCount: 1,
      refundCount: 0,
    });
  }));

test("supports an attributed partial refund with an explicitly retained balance", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 50_000);
    const resolved = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      resolution: "partial_refund",
      amountCents: 30_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T10:00:00Z",
      reason: "Remboursement partiel effectué, avec un solde de 200 € explicitement conservé.",
    });
    fixtures.register("adopter_financial_resolution_events", resolved.eventId as string);
    fixtures.register("payments", resolved.paymentId as string);

    expect(resolved).toMatchObject({
      outcome: "success",
      financialResolution: "partial_refund",
      refundedCents: 30_000,
      refundableCents: 20_000,
      retainedCents: 20_000,
    });
  }));

test("supports an attributed no-refund decision without inventing a payment", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 50_000, "cancelled");
    const resolved = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      resolution: "no_refund",
      reason: "Aucun remboursement n'a été effectué et la totalité est explicitement conservée.",
    });
    fixtures.register("adopter_financial_resolution_events", resolved.eventId as string);

    expect(resolved).toMatchObject({
      outcome: "success",
      paymentId: null,
      financialResolution: "no_refund",
      refundedCents: 0,
      retainedCents: 50_000,
    });
    expect(
      sql(`
        select count(*)::text from public.payments
        where reservation_id=${q(scenario.journey.id)}::uuid
          and payment_type in ('refund', 'partial_refund');
      `),
    ).toBe("0");
  }));

test("refuses members, stale pages and future refund dates without side effects", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 25_000);
    const memberAttempt = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      actorId: memberId,
      resolution: "full_refund",
      amountCents: 25_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T10:00:00Z",
      reason: "Un membre ordinaire ne doit pas pouvoir finaliser cette résolution.",
    });
    const staleAttempt = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: randomUUID(),
      resolution: "no_refund",
      reason: "Une page périmée ne doit pas écraser l'état courant.",
    });
    const futureAttempt = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      resolution: "full_refund",
      amountCents: 25_000,
      paymentMethod: "bank_transfer",
      paidAt: "2099-01-01T10:00:00Z",
      reason: "Une date future doit être refusée.",
    });
    await registerActualRefundEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });

    expect(memberAttempt).toMatchObject({ outcome: "error", reason: "not_found" });
    expect(staleAttempt).toMatchObject({ outcome: "blocked", reason: "resolution_stale" });
    expect(futureAttempt).toMatchObject({ outcome: "error", reason: "invalid_refund_details" });
    expect(
      jsonSql(`
        select json_build_object(
          'financialResolution', financial_resolution,
          'eventCount', (
            select count(*)::integer from public.adopter_financial_resolution_events
            where reservation_id=r.id
          ),
          'refundCount', (
            select count(*)::integer from public.payments
            where reservation_id=r.id and payment_type in ('refund', 'partial_refund')
          )
        )::text
        from public.reservations r where id=${q(scenario.journey.id)}::uuid;
      `),
    ).toEqual({ financialResolution: "pending", eventCount: 1, refundCount: 0 });
  }));

test("rectifies a partial decision with a supplemental refund without rewriting history", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 50_000);
    const partial = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      resolution: "partial_refund",
      amountCents: 30_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T10:00:00Z",
      reason: "Première décision avec un solde conservé.",
    });
    fixtures.register("adopter_financial_resolution_events", partial.eventId as string);
    fixtures.register("payments", partial.paymentId as string);

    const corrected = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: partial.eventId as string,
      resolution: "full_refund",
      amountCents: 20_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T11:00:00Z",
      reason: "Décision rectifiée après un remboursement réel supplémentaire de 200 €.",
    });
    fixtures.register("adopter_financial_resolution_events", corrected.eventId as string);
    fixtures.register("payments", corrected.paymentId as string);

    expect(corrected).toMatchObject({
      outcome: "success",
      financialResolution: "full_refund",
      refundedCents: 50_000,
      refundableCents: 0,
    });
    expect(
      jsonSql(`
        select json_build_object(
          'events', count(*)::integer,
          'rectifications', count(*) filter (where event_type='rectified')::integer,
          'immutablePrevious', count(*) filter (where id=${q(partial.eventId as string)}::uuid)::integer
        )::text
        from public.adopter_financial_resolution_events
        where reservation_id=${q(scenario.journey.id)}::uuid;
      `),
    ).toEqual({ events: 3, rectifications: 1, immutablePrevious: 1 });
  }));

test("neutralizes an erroneous refund through an explicit rectification", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 25_000);
    const initial = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      resolution: "full_refund",
      amountCents: 25_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T10:00:00Z",
      reason: "Saisie initiale déclarée ensuite sans virement réel correspondant.",
    });
    fixtures.register("adopter_financial_resolution_events", initial.eventId as string);
    fixtures.register("payments", initial.paymentId as string);

    const corrected = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: initial.eventId as string,
      resolution: "no_refund",
      reason: "Rectification : aucun virement réel n'avait été effectué.",
      voidPaymentId: initial.paymentId as string,
    });
    fixtures.register("adopter_financial_resolution_events", corrected.eventId as string);

    expect(corrected).toMatchObject({
      outcome: "success",
      paymentId: null,
      financialResolution: "no_refund",
      refundedCents: 0,
      retainedCents: 25_000,
    });
    expect(
      jsonSql(`
        select json_build_object(
          'paymentStatus', (select status from public.payments where id=${q(initial.paymentId as string)}::uuid),
          'voidedPaymentId', (select voided_payment_id from public.adopter_financial_resolution_events where id=${q(corrected.eventId as string)}::uuid),
          'eventType', (select event_type from public.adopter_financial_resolution_events where id=${q(corrected.eventId as string)}::uuid)
        )::text;
      `),
    ).toEqual({
      paymentStatus: "cancelled",
      voidedPaymentId: initial.paymentId,
      eventType: "rectified",
    });
  }));

test("serializes payment writes against a concurrent negative exit", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E paiement concurrent sortie ${suffix}`,
      },
    );
    const paymentId = randomUUID();
    const interleavingLock = `e2e-financial-payment-exit:${fixtures.namespace}`;
    fixtures.register("payments", paymentId);
    const expectedUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`,
    );

    const paymentWrite = runE2eSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      insert into public.payments (
        id, organization_id, contact_id, reservation_id, amount_cents,
        currency, payment_type, status, payment_method, paid_at,
        created_by, updated_by
      ) values (
        ${q(paymentId)}::uuid,
        ${q(organizationId)}::uuid,
        ${q(scenario.contact.id)}::uuid,
        ${q(scenario.journey.id)}::uuid,
        12000,
        'EUR',
        'arrhes',
        'paid',
        'bank_transfer',
        '2026-08-05T10:00:00Z'::timestamptz,
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      );
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(${q(interleavingLock)}, 0)
      );
      select pg_catalog.pg_sleep(3);
      commit;
    `);

    let paymentLockHeld = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const acquired = sql(`
        select pg_catalog.pg_try_advisory_lock(
          pg_catalog.hashtextextended(${q(interleavingLock)}, 0)
        )::text;
      `);
      if (acquired === "false") {
        paymentLockHeld = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!paymentLockHeld) {
      await paymentWrite;
    }
    expect(
      paymentLockHeld,
      "the payment transaction must hold its readiness lock before the exit starts",
    ).toBe(true);

    const exit = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', outcome,
        'financialResolution', financial_resolution,
        'paidCents', paid_cents,
        'eventId', event_id
      )::text
      from public.transition_adopter_journey_exit(
        ${q(scenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'cancelled',
        ${q(expectedUpdatedAt)}::timestamptz
      );
      commit;
    `);
    await paymentWrite;
    if (exit.eventId) {
      fixtures.register("adopter_financial_resolution_events", exit.eventId as string);
    }

    expect(exit).toMatchObject({
      outcome: "success",
      financialResolution: "pending",
      paidCents: 12_000,
    });
  }));

test("lets the first concurrent financial decision win without duplicate refunds", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 25_000);
    const expectedEventId = opened.eventId as string;
    const statement = (clientCommandId: string) => `
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select json_build_object(
        'outcome', response.outcome,
        'reason', response.reason,
        'eventId', response.event_id,
        'paymentId', response.payment_id
      )::text
      from public.record_adopter_financial_resolution(
        ${q(scenario.journey.id)}::uuid,
        ${q(clientCommandId)}::uuid,
        'full_refund',
        25000,
        'bank_transfer',
        '2026-08-05T10:00:00Z'::timestamptz,
        'Décision concurrente de test.',
        ${q(expectedEventId)}::uuid,
        null
      ) response;
      commit;
    `;

    const results = (
      await Promise.all([
        runE2eSql(statement(randomUUID())),
        runE2eSql(statement(randomUUID())),
      ])
    ).map(jsonFromOutput);
    const success = results.find((result) => result.outcome === "success");
    const blocked = results.find((result) => result.outcome === "blocked");

    expect(success).toBeDefined();
    expect(blocked).toMatchObject({ reason: "resolution_stale" });
    fixtures.register(
      "adopter_financial_resolution_events",
      success?.eventId as string,
    );
    await registerActualRefundEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });
    expect(
      sql(`
        select count(*)::text
        from public.payments
        where reservation_id = ${q(scenario.journey.id)}::uuid
          and payment_type in ('refund', 'partial_refund')
          and status = 'paid'
          and deleted_at is null;
      `).trim(),
    ).toBe("1");
  }));

test("rejects a previous event from another journey in the same organization", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const first = await createPendingJourney(fixtures, 10_000);
    const second = await createPendingJourney(fixtures, 12_000);
    const invalidEventId = randomUUID();
    fixtures.register("adopter_financial_resolution_events", invalidEventId);

    await expect(
      runE2eSql(`
        insert into public.adopter_financial_resolution_events (
          id, organization_id, reservation_id, contact_id, event_type,
          client_command_id, actor_profile_id, actor_role,
          financial_resolution, previous_financial_resolution,
          paid_cents, refunded_cents, refundable_cents, retained_cents,
          reason, previous_event_id, details
        ) values (
          ${q(invalidEventId)}::uuid,
          ${q(organizationId)}::uuid,
          ${q(second.scenario.journey.id)}::uuid,
          ${q(second.scenario.contact.id)}::uuid,
          'rectified',
          ${q(randomUUID())}::uuid,
          ${q(ownerId)}::uuid,
          'owner',
          'no_refund',
          'pending',
          12000,
          0,
          12000,
          12000,
          'Chaîne historique volontairement incohérente pour le test.',
          ${q(first.opened.eventId as string)}::uuid,
          '{}'::jsonb
        );
      `),
    ).rejects.toThrow(/foreign key constraint/i);
  }));

test("rejects generic writes that would bypass the financial-resolution ledger", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const { scenario, opened } = await createPendingJourney(fixtures, 25_000);
    const resolved = recordResolution({
      reservationId: scenario.journey.id,
      expectedEventId: opened.eventId as string,
      resolution: "full_refund",
      amountCents: 25_000,
      paymentMethod: "bank_transfer",
      paidAt: "2026-08-05T10:00:00Z",
      reason: "Résolution protégée contre les écritures génériques.",
    });
    fixtures.register(
      "adopter_financial_resolution_events",
      resolved.eventId as string,
    );
    fixtures.register("payments", resolved.paymentId as string);
    const receivedPaymentId = sql(`
      select id::text
      from public.payments
      where reservation_id=${q(scenario.journey.id)}::uuid
        and payment_type not in ('refund', 'partial_refund')
      limit 1;
    `);

    const authenticatedAttempt = (statement: string) =>
      runE2eSql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
        ${statement}
        rollback;
      `);

    await expect(
      authenticatedAttempt(`
        update public.reservations
        set financial_resolution = 'no_refund'
        where id = ${q(scenario.journey.id)}::uuid;
      `),
    ).rejects.toThrow(/financial resolution managed fields/i);
    await expect(
      authenticatedAttempt(`
        update public.reservations
        set status = 'active'
        where id = ${q(scenario.journey.id)}::uuid;
      `),
    ).rejects.toThrow(/financial resolution managed fields/i);
    await expect(
      authenticatedAttempt(`
        select pg_catalog.set_config(
          'app.adopter_financial_resolution_managed_write',
          'on',
          true
        );
        update public.reservations
        set financial_resolution = 'pending'
        where id = ${q(scenario.journey.id)}::uuid;
      `),
    ).rejects.toThrow(/dedicated RPC/i);
    await expect(
      authenticatedAttempt(`
        update public.payments
        set status = 'cancelled'
        where id = ${q(resolved.paymentId as string)}::uuid;
      `),
    ).rejects.toThrow(/financial resolution managed payment/i);
    await expect(
      authenticatedAttempt(`
        update public.payments
        set status = 'cancelled'
        where id = ${q(receivedPaymentId)}::uuid;
      `),
    ).rejects.toThrow(/financial resolution managed payment/i);
    await expect(
      authenticatedAttempt(`
        insert into public.payments (
          organization_id, contact_id, reservation_id, amount_cents,
          currency, payment_type, status, payment_method, paid_at,
          created_by, updated_by
        ) values (
          ${q(organizationId)}::uuid,
          ${q(scenario.contact.id)}::uuid,
          ${q(scenario.journey.id)}::uuid,
          100,
          'EUR',
          'refund',
          'paid',
          'bank_transfer',
          '2026-08-05T10:00:00Z'::timestamptz,
          ${q(ownerId)}::uuid,
          ${q(ownerId)}::uuid
        );
      `),
    ).rejects.toThrow(/financial resolution managed payment/i);
    await expect(
      runE2eSql(`
        update public.adopter_financial_resolution_events
        set reason = 'Réécriture interdite'
        where id = ${q(resolved.eventId as string)}::uuid;
      `),
    ).rejects.toThrow(/history is immutable/i);
    await expect(
      runE2eSql(`
        delete from public.adopter_financial_resolution_events
        where id = ${q(resolved.eventId as string)}::uuid;
      `),
    ).rejects.toThrow(/history is immutable/i);
    await expect(
      authenticatedAttempt(
        "truncate table public.adopter_financial_resolution_events;",
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      authenticatedAttempt(`
        update public.adopter_financial_resolution_events
        set reason='Mutation authentifiée interdite'
        where id=${q(resolved.eventId as string)}::uuid;
      `),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      authenticatedAttempt(`
        delete from public.adopter_financial_resolution_events
        where id=${q(resolved.eventId as string)}::uuid;
      `),
    ).rejects.toThrow(/permission denied/i);

    const serviceRoleAttempt = (statement: string) =>
      runE2eSql(`
        begin;
        set local role service_role;
        ${statement}
        rollback;
      `);
    for (const statement of [
      `update public.adopter_financial_resolution_events set reason='Mutation service interdite' where id=${q(resolved.eventId as string)}::uuid;`,
      `delete from public.adopter_financial_resolution_events where id=${q(resolved.eventId as string)}::uuid;`,
      "truncate table public.adopter_financial_resolution_events;",
    ]) {
      await expect(serviceRoleAttempt(statement)).rejects.toThrow(/permission denied/i);
    }
  }));
