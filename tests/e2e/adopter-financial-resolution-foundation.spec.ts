import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createTestAdopterCancellationReadyScenario } from "./helpers/fixtures/adopter-cancellation-fixtures";
import { createTestReceivedPayment } from "./helpers/fixtures/adopter-payment-fixtures";
import { registerActualRefundEffects } from "./helpers/fixtures/adopter-refund-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import { runE2eSql, runE2eSqlSync } from "./helpers/supabase";

const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

function jsonSql(statement: string) {
  const line = sql(statement)
    .split(/\r?\n/)
    .find((value) => value.trimStart().startsWith("{"));
  if (!line) throw new Error("Expected a JSON SQL result");
  return JSON.parse(line) as Record<string, unknown>;
}

test("installs the adopter financial-resolution ledger and transactional RPCs", () => {
  const installed = JSON.parse(
    sql(`
      select json_build_object(
        'eventTable', to_regclass('public.adopter_financial_resolution_events') is not null,
        'currentEventColumn', exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'reservations'
            and column_name = 'current_financial_resolution_event_id'
        ),
        'exitRpc', to_regprocedure(
          'public.transition_adopter_journey_exit(uuid,uuid,text,timestamptz)'
        ) is not null,
        'resolutionRpc', to_regprocedure(
          'public.record_adopter_financial_resolution(uuid,uuid,text,integer,text,timestamptz,text,uuid,uuid)'
        ) is not null,
        'eventMutationPrivileges', case
          when to_regclass('public.adopter_financial_resolution_events') is null then -1
          else (
            select count(*)::integer
            from unnest(array['anon', 'authenticated', 'service_role']) role_name
            cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) privilege_name
            where has_table_privilege(
              role_name,
              'public.adopter_financial_resolution_events',
              privilege_name
            )
          )
        end
      )::text;
    `),
  );

  expect(installed).toEqual({
    eventTable: true,
    currentEventColumn: true,
    exitRpc: true,
    resolutionRpc: true,
    eventMutationPrivileges: 0,
  });
});

test("opens one pending financial resolution when a paid journey is withdrawn", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E résolution financière ${suffix}`,
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents: 25_000,
    });

    const commandId = randomUUID();
    const expectedUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`,
    );
    const call = () =>
      jsonSql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
        select jsonb_build_object(
          'outcome', response.outcome,
          'reason', response.reason,
          'replayed', response.replayed,
          'eventId', response.event_id,
          'financialResolution', response.financial_resolution,
          'refundableCents', response.refundable_cents
        )::text
        from public.transition_adopter_journey_exit(
          ${q(scenario.journey.id)}::uuid,
          ${q(commandId)}::uuid,
          'withdrawn',
          ${q(expectedUpdatedAt)}::timestamptz
        ) response;
        commit;
      `);

    const first = call();
    expect(first).toMatchObject({
      outcome: "success",
      replayed: false,
      financialResolution: "pending",
      refundableCents: 25_000,
    });
    fixtures.register("adopter_financial_resolution_events", first.eventId as string);
    expect(call()).toMatchObject({
      outcome: "success",
      replayed: true,
      eventId: first.eventId,
    });

    expect(
      jsonSql(`
        select json_build_object(
          'status', status,
          'financialResolution', financial_resolution,
          'currentEventId', current_financial_resolution_event_id,
          'eventCount', (
            select count(*)::integer
            from public.adopter_financial_resolution_events
            where reservation_id = r.id
          ),
          'paymentCount', (
            select count(*)::integer
            from public.payments
            where reservation_id = r.id and deleted_at is null
          )
        )::text
        from public.reservations r
        where id=${q(scenario.journey.id)}::uuid;
      `),
    ).toEqual({
      status: "withdrawn",
      financialResolution: "pending",
      currentEventId: first.eventId,
      eventCount: 1,
      paymentCount: 1,
    });
  }));

test("records a full refund and the terminal decision atomically", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E résolution totale ${suffix}`,
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents: 25_000,
    });

    const exitCommandId = randomUUID();
    const expectedUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`,
    );
    const opened = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', response.outcome,
        'eventId', response.event_id
      )::text
      from public.transition_adopter_journey_exit(
        ${q(scenario.journey.id)}::uuid,
        ${q(exitCommandId)}::uuid,
        'withdrawn',
        ${q(expectedUpdatedAt)}::timestamptz
      ) response;
      commit;
    `);
    expect(opened.outcome).toBe("success");
    fixtures.register("adopter_financial_resolution_events", opened.eventId as string);

    const resolutionCommandId = randomUUID();
    const call = () =>
      jsonSql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
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
          ${q(scenario.journey.id)}::uuid,
          ${q(resolutionCommandId)}::uuid,
          'full_refund',
          25000,
          'bank_transfer',
          '2026-08-05T10:00:00Z'::timestamptz,
          'Remboursement intégral confirmé après le virement réel.',
          ${q(opened.eventId as string)}::uuid,
          null::uuid
        ) response;
        commit;
      `);

    const resolved = call();
    expect(resolved).toMatchObject({
      outcome: "success",
      replayed: false,
      financialResolution: "full_refund",
      refundedCents: 25_000,
      refundableCents: 0,
      retainedCents: 0,
    });
    fixtures.register("adopter_financial_resolution_events", resolved.eventId as string);
    fixtures.register("payments", resolved.paymentId as string);
    expect(call()).toMatchObject({
      outcome: "success",
      replayed: true,
      eventId: resolved.eventId,
      paymentId: resolved.paymentId,
    });

    expect(
      jsonSql(`
        select json_build_object(
          'financialResolution', financial_resolution,
          'currentEventId', current_financial_resolution_event_id,
          'eventCount', (
            select count(*)::integer
            from public.adopter_financial_resolution_events
            where reservation_id = r.id
          ),
          'refundCount', (
            select count(*)::integer
            from public.payments
            where reservation_id = r.id
              and payment_type = 'refund'
              and status = 'paid'
              and deleted_at is null
          )
        )::text
        from public.reservations r
        where id=${q(scenario.journey.id)}::uuid;
      `),
    ).toEqual({
      financialResolution: "full_refund",
      currentEventId: resolved.eventId,
      eventCount: 2,
      refundCount: 1,
    });
  }));

test("rolls back the refund when the requested terminal outcome is inconsistent", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E résolution incohérente ${suffix}`,
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents: 25_000,
    });

    const expectedUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`,
    );
    const opened = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object('outcome', response.outcome, 'eventId', response.event_id)::text
      from public.transition_adopter_journey_exit(
        ${q(scenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'withdrawn',
        ${q(expectedUpdatedAt)}::timestamptz
      ) response;
      commit;
    `);
    fixtures.register("adopter_financial_resolution_events", opened.eventId as string);

    const blocked = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', response.outcome,
        'reason', response.reason,
        'eventId', response.event_id,
        'paymentId', response.payment_id
      )::text
      from public.record_adopter_financial_resolution(
        ${q(scenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'full_refund',
        10000,
        'bank_transfer',
        '2026-08-05T10:00:00Z'::timestamptz,
        'Ce remboursement partiel ne peut pas être qualifié de remboursement total.',
        ${q(opened.eventId as string)}::uuid,
        null::uuid
      ) response;
      commit;
    `);
    const discovered = await registerActualRefundEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });

    expect(blocked).toMatchObject({
      outcome: "blocked",
      reason: "resolution_amount_mismatch",
      eventId: null,
      paymentId: null,
    });
    expect(discovered.filter((row) => row.payment_id)).toHaveLength(0);
    expect(
      sql(`
        select count(*)::text
        from public.adopter_financial_resolution_events
        where reservation_id=${q(scenario.journey.id)}::uuid;
      `),
    ).toBe("1");
  }));

test("blocks the legacy refund RPC once the adopter journey is final", async () =>
  withE2eFixtures(runE2eSql, async (fixtures) => {
    const suffix = fixtures.namespace.slice(-8);
    const scenario = await createTestAdopterCancellationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: `E2E remboursement final bloqué ${suffix}`,
      },
    );
    await createTestReceivedPayment(runE2eSql, fixtures, {
      organizationId,
      contactId: scenario.contact.id,
      reservationId: scenario.journey.id,
      ownerId,
      amountCents: 25_000,
    });

    const expectedUpdatedAt = sql(
      `select updated_at::text from public.reservations where id=${q(scenario.journey.id)}::uuid;`,
    );
    const opened = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object('outcome', response.outcome, 'eventId', response.event_id)::text
      from public.transition_adopter_journey_exit(
        ${q(scenario.journey.id)}::uuid,
        ${q(randomUUID())}::uuid,
        'cancelled',
        ${q(expectedUpdatedAt)}::timestamptz
      ) response;
      commit;
    `);
    fixtures.register("adopter_financial_resolution_events", opened.eventId as string);

    const legacy = jsonSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select jsonb_build_object(
        'outcome', response.outcome,
        'reason', response.reason,
        'paymentId', response.payment_id
      )::text
      from public.create_reservation_refund(
        ${q(scenario.journey.id)}::uuid,
        10000,
        'bank_transfer',
        '2026-08-05T10:00:00Z'::timestamptz,
        'Cette voie historique doit être refusée après la sortie.'
      ) response;
      commit;
    `);
    const discovered = await registerActualRefundEffects(runE2eSql, fixtures, {
      organizationId,
      reservationId: scenario.journey.id,
      contactId: scenario.contact.id,
    });

    expect(legacy).toMatchObject({
      outcome: "ineligible",
      reason: "reservation_final",
      paymentId: null,
    });
    expect(discovered.filter((row) => row.payment_id)).toHaveLength(0);
  }));
