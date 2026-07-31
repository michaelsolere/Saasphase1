import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  cancelWhelpingBirthCore,
  correctWhelpingBirthCore,
  recordWhelpingBirthCore,
} from "../../src/features/whelping/whelping-core";
import {
  createTestAnimal,
  createTestLitter,
  createTestOrganization,
} from "./helpers/fixtures/breeding-fixtures";
import {
  createE2eFixtureRegistry,
  withE2eFixtures,
} from "./helpers/fixtures/fixture-registry";
import {
  createTestWhelpingSession,
  registerActualWhelpingCommands,
} from "./helpers/fixtures/whelping-fixtures";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const namespace = "litter-actual-birth-activation-lifecycle-01";
const prefix = "a7300007";
const sql = (statement: string) => runE2eSqlSync(statement);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

const ids = {
  mother: `${prefix}-0000-4000-8000-000000000001`,
  litter: `${prefix}-0000-4000-8000-000000000002`,
  session: `${prefix}-0000-4000-8000-000000000003`,
  firstBirthCommand: `${prefix}-0000-4000-8000-000000000004`,
  sameDayCorrection: `${prefix}-0000-4000-8000-000000000005`,
  nextDayCorrection: `${prefix}-0000-4000-8000-000000000006`,
  blockedCancellation: `${prefix}-0000-4000-8000-000000000007`,
  privateCancellation: `${prefix}-0000-4000-8000-000000000008`,
  historicalCancellation: `${prefix}-0000-4000-8000-000000000009`,
  secondBirthCommand: `${prefix}-0000-4000-8000-00000000000a`,
  secondBlockedCancellation: `${prefix}-0000-4000-8000-00000000000b`,
  nonSourceBirthCommand: `${prefix}-0000-4000-8000-00000000000c`,
  nonSourceCancellation: `${prefix}-0000-4000-8000-00000000000d`,
  concurrentMother: `${prefix}-0000-4000-8000-000000000011`,
  concurrentLitter: `${prefix}-0000-4000-8000-000000000012`,
  concurrentSession: `${prefix}-0000-4000-8000-000000000013`,
  concurrentBirthA: `${prefix}-0000-4000-8000-000000000014`,
  concurrentBirthB: `${prefix}-0000-4000-8000-000000000015`,
  rollbackMother: `${prefix}-0000-4000-8000-000000000021`,
  rollbackLitter: `${prefix}-0000-4000-8000-000000000022`,
  rollbackSession: `${prefix}-0000-4000-8000-000000000023`,
  rollbackFirstBirth: `${prefix}-0000-4000-8000-000000000024`,
  rollbackPrivateCancellation: `${prefix}-0000-4000-8000-000000000025`,
  rollbackRejectedBirth: `${prefix}-0000-4000-8000-000000000026`,
  foreignOrganization: `${prefix}-0000-4000-8000-000000000031`,
} as const;

type Json = Record<string, unknown>;
type Registry = ReturnType<typeof createE2eFixtureRegistry>;

function jsonSql<T>(statement: string): T {
  const output = sql(statement);
  for (const line of output.split("\n").reverse()) {
    const candidate = line.trim();
    if (!candidate.startsWith("{") && !candidate.startsWith("[")) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep searching command-tag output for the actual JSON row.
    }
  }
  throw new Error(`E2E SQL did not return JSON: ${output}`);
}

function privateCancelBirth(input: {
  birthId: string;
  commandId: string;
  expectedRevision: number;
  cancelledAt: string;
  reason: string;
}) {
  return jsonSql<{
    outcome: string;
    birth_id: string;
    revision_no: number;
    replayed: boolean;
    reason: string | null;
  }>(`
    begin;
    set local request.jwt.claims =
      '{"sub":"${ownerId}","role":"authenticated"}';
    select row_to_json(result)::text
    from public.cancel_whelping_birth_core_internal(
      ${q(input.birthId)}::uuid,
      ${q(input.commandId)}::uuid,
      ${input.expectedRevision},
      ${q(input.cancelledAt)}::timestamptz,
      ${q(input.reason)}
    ) result;
    commit;
  `);
}

function activationSnapshot(litterId: string) {
  return jsonSql<{
    activations: Array<{
      id: string;
      previousActivationId: string | null;
      commandId: string;
      actualBirthDate: string;
    }>;
    state: {
      id: string;
      currentActivationId: string | null;
      lastActivationId: string;
      revision: number;
    } | null;
    deactivations: Array<{
      id: string;
      activationId: string;
      commandId: string;
      previousRevision: number;
      resultingRevision: number;
    }>;
  }>(`
    select json_build_object(
      'activations', coalesce((
        select json_agg(json_build_object(
          'id', activation.id::text,
          'previousActivationId', activation.previous_activation_id::text,
          'commandId', activation.whelping_client_command_id::text,
          'actualBirthDate', activation.actual_birth_date::text
        ) order by activation.created_at, activation.id)
        from public.litter_plan_actual_birth_activations activation
        where activation.organization_id = ${q(organizationId)}::uuid
          and activation.litter_id = ${q(litterId)}::uuid
      ), '[]'::json),
      'state', (
        select json_build_object(
          'id', state.id::text,
          'currentActivationId', state.current_activation_id::text,
          'lastActivationId', state.last_activation_id::text,
          'revision', state.revision
        )
        from public.litter_plan_actual_birth_activation_states state
        where state.organization_id = ${q(organizationId)}::uuid
          and state.litter_id = ${q(litterId)}::uuid
      ),
      'deactivations', coalesce((
        select json_agg(json_build_object(
          'id', deactivation.id::text,
          'activationId', deactivation.activation_id::text,
          'commandId',
            deactivation.birth_adjustment_client_command_id::text,
          'previousRevision', deactivation.previous_state_revision,
          'resultingRevision', deactivation.resulting_state_revision
        ) order by deactivation.created_at, deactivation.id)
        from public.litter_plan_actual_birth_activation_deactivations
          deactivation
        where deactivation.organization_id = ${q(organizationId)}::uuid
          and deactivation.litter_id = ${q(litterId)}::uuid
      ), '[]'::json)
    )::text;
  `);
}

async function discoverLifecycleFixtures(
  fixtures: Registry,
  litterIds: readonly string[],
  birthCommandIds: readonly string[],
  adjustmentCommandIds: readonly string[],
) {
  for (const litterId of litterIds) {
    await registerActualWhelpingCommands(sql, fixtures, {
      organizationId,
      litterId,
      commandIds: birthCommandIds,
      adjustmentCommandIds,
    });
  }

  const litterList = litterIds.map((id) => `${q(id)}::uuid`).join(", ");
  const tableQueries = {
    litter_plan_actual_birth_plan_reversal_changes: `
      select change.id::text
      from public.litter_plan_actual_birth_plan_reversal_changes change
      join public.litter_plan_actual_birth_plan_reversals reversal
        on reversal.organization_id = change.organization_id
       and reversal.id = change.reversal_id
      where reversal.organization_id = ${q(organizationId)}::uuid
        and reversal.litter_id in (${litterList})
    `,
    litter_plan_actual_birth_plan_reversals: `
      select id::text
      from public.litter_plan_actual_birth_plan_reversals
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_actual_birth_reconciliation_task_changes: `
      select change.id::text
      from public.litter_plan_actual_birth_reconciliation_task_changes change
      join public.litter_plan_actual_birth_reconciliations command
        on command.organization_id = change.organization_id
       and command.id = change.command_id
      where command.organization_id = ${q(organizationId)}::uuid
        and command.litter_id in (${litterList})
    `,
    litter_plan_actual_birth_reconciliations: `
      select id::text
      from public.litter_plan_actual_birth_reconciliations
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_series_actual_birth_reconciliation_changes: `
      select change.id::text
      from public.litter_plan_series_actual_birth_reconciliation_changes change
      join public.litter_plan_series_actual_birth_reconciliation_commands command
        on command.organization_id = change.organization_id
       and command.id = change.command_id
      where command.organization_id = ${q(organizationId)}::uuid
        and command.litter_id in (${litterList})
    `,
    litter_plan_series_actual_birth_reconciliation_commands: `
      select id::text
      from public.litter_plan_series_actual_birth_reconciliation_commands
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_actual_birth_activation_reversal_changes: `
      select id::text
      from public.litter_plan_actual_birth_activation_reversal_changes
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_actual_birth_activation_reversal_snapshots: `
      select id::text
      from public.litter_plan_actual_birth_activation_reversal_snapshots
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_actual_birth_activation_deactivations: `
      select id::text
      from public.litter_plan_actual_birth_activation_deactivations
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_actual_birth_activation_states: `
      select id::text
      from public.litter_plan_actual_birth_activation_states
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
    litter_plan_actual_birth_activations: `
      select id::text
      from public.litter_plan_actual_birth_activations
      where organization_id = ${q(organizationId)}::uuid
        and litter_id in (${litterList})
    `,
  } as const;

  for (const [table, query] of Object.entries(tableQueries) as Array<
    [keyof typeof tableQueries, string]
  >) {
    const rowIds = jsonSql<string[]>(`
      select coalesce(json_agg(row.id order by row.id), '[]'::json)::text
      from (${query}) row;
    `);
    for (const id of rowIds) {
      if (!fixtures.has(table, id)) fixtures.register(table, id);
    }
  }
}

test("audite le cycle activation, désactivation et activation suivante", async () => {
  const owner = await createAuthenticatedSupabaseClient();
  const birthCommands = [
    ids.firstBirthCommand,
    ids.nonSourceBirthCommand,
    ids.secondBirthCommand,
    ids.concurrentBirthA,
    ids.concurrentBirthB,
    ids.rollbackFirstBirth,
    ids.rollbackRejectedBirth,
  ];
  const adjustmentCommands = [
    ids.sameDayCorrection,
    ids.nextDayCorrection,
    ids.nonSourceCancellation,
    ids.privateCancellation,
    ids.secondBlockedCancellation,
    ids.rollbackPrivateCancellation,
  ];
  const litterIds = [ids.litter, ids.concurrentLitter, ids.rollbackLitter];
  let fixtureManifest: Json = {};

  await withE2eFixtures(
    sql,
    async (fixtures) => {
      try {
        await createTestAnimal(sql, fixtures, {
          id: ids.mother,
          organizationId,
          ownerId,
          callName: "E2E activation lifecycle mother",
          sex: "female",
        });
        await createTestLitter(sql, fixtures, {
          id: ids.litter,
          organizationId,
          ownerId,
          motherId: ids.mother,
          name: "E2E activation lifecycle litter",
        });
        await createTestWhelpingSession(sql, fixtures, {
          id: ids.session,
          organizationId,
          litterId: ids.litter,
          motherId: ids.mother,
          ownerId,
          startedAt: "2026-07-30T08:00:00+02:00",
        });

        const firstInput = {
          sessionId: ids.session,
          clientCommandId: ids.firstBirthCommand,
          occurredAt: "2026-07-30T09:00:00+02:00",
          sex: "female" as const,
          viability: "alive" as const,
          note: "Première activation auditée",
        };
        const first = await recordWhelpingBirthCore(firstInput, owner);
        expect(first, JSON.stringify(first)).toMatchObject({
          outcome: "success",
          birthOrder: 1,
          replayed: false,
        });
        if (first.outcome !== "success") throw new Error("first birth required");

        const firstState = activationSnapshot(ids.litter);
        expect(firstState.activations).toHaveLength(1);
        expect(firstState.activations[0]).toMatchObject({
          previousActivationId: null,
          commandId: ids.firstBirthCommand,
          actualBirthDate: "2026-07-30",
        });
        expect(firstState.state).toMatchObject({
          currentActivationId: firstState.activations[0]!.id,
          lastActivationId: firstState.activations[0]!.id,
          revision: 0,
        });
        expect(firstState.deactivations).toEqual([]);

        const exactReplay = await recordWhelpingBirthCore(firstInput, owner);
        expect(exactReplay).toMatchObject({
          outcome: "success",
          birthId: first.birthId,
          animalId: first.animalId,
          birthOrder: 1,
          replayed: true,
        });
        expect(activationSnapshot(ids.litter)).toEqual(firstState);

        expect(() =>
          sql(`
            select public.activate_litter_plan_on_first_birth_internal(
              ${q(organizationId)}::uuid,
              ${q(ids.concurrentLitter)}::uuid,
              '2026-07-30'::date,
              ${q(ownerId)}::uuid,
              ${q(ids.firstBirthCommand)}::uuid
            );
          `),
        ).toThrow(/client_command_conflict/);

        const sameDay = await correctWhelpingBirthCore(
          {
            birthId: first.birthId,
            clientCommandId: ids.sameDayCorrection,
            expectedRevisionNo: 0,
            occurredAt: "2026-07-30T12:00:00+02:00",
            sex: "female",
            viability: "alive",
            birthNote: "Même jour",
            reason: "Correction horaire le même jour",
          },
          owner,
        );
        expect(sameDay).toMatchObject({ outcome: "success", revisionNo: 1 });
        expect(activationSnapshot(ids.litter)).toEqual(firstState);
        expect(
          sql(`
            select count(*)::text
            from public.litter_plan_actual_birth_reconciliations
            where litter_id = ${q(ids.litter)}::uuid;
          `),
        ).toBe("0");

        const nextDay = await correctWhelpingBirthCore(
          {
            birthId: first.birthId,
            clientCommandId: ids.nextDayCorrection,
            expectedRevisionNo: 1,
            occurredAt: "2026-07-31T09:00:00+02:00",
            sex: "female",
            viability: "alive",
            birthNote: "Jour corrigé",
            reason: "Correction au jour suivant",
          },
          owner,
        );
        expect(nextDay).toMatchObject({ outcome: "success", revisionNo: 2 });
        expect(activationSnapshot(ids.litter)).toEqual(firstState);
        expect(
          sql(`
            select count(*)::text
            from public.litter_plan_actual_birth_reconciliations
            where litter_id = ${q(ids.litter)}::uuid;
          `),
        ).toBe("1");

        const blocked = await cancelWhelpingBirthCore(
          {
            birthId: first.birthId,
            clientCommandId: ids.blockedCancellation,
            expectedRevisionNo: 2,
            cancelledAt: "2026-07-31T10:00:00+02:00",
            reason: "Le garde doit rester actif",
          },
          owner,
        );
        expect(blocked).toMatchObject({
          outcome: "error",
          error: { code: "birth_has_downstream_data" },
        });
        expect(
          sql(`
            select count(*)::text
            from public.whelping_birth_adjustment_commands
            where client_command_id = ${q(ids.blockedCancellation)}::uuid;
          `),
        ).toBe("0");
        expect(activationSnapshot(ids.litter).deactivations).toEqual([]);

        const nonSourceBirth = await recordWhelpingBirthCore(
          {
            sessionId: ids.session,
            clientCommandId: ids.nonSourceBirthCommand,
            occurredAt: "2026-07-31T10:01:00+02:00",
            sex: "male",
            viability: "alive",
            note: "Naissance adverse sans nouvelle activation",
          },
          owner,
        );
        expect(nonSourceBirth).toMatchObject({
          outcome: "success",
          birthOrder: 2,
          replayed: false,
        });
        if (nonSourceBirth.outcome !== "success") {
          throw new Error("non-source birth required");
        }

        const beforeMismatchedDeactivation = activationSnapshot(ids.litter);
        const firstActivationId =
          beforeMismatchedDeactivation.activations[0]!.id;
        expect(beforeMismatchedDeactivation).toEqual(firstState);

        const nonSourceCancellation = privateCancelBirth({
          birthId: nonSourceBirth.birthId,
          commandId: ids.nonSourceCancellation,
          expectedRevision: 0,
          cancelledAt: "2026-07-31T10:02:00+02:00",
          reason: "Annulation adverse de la deuxième naissance",
        });
        expect(nonSourceCancellation).toMatchObject({
          outcome: "success",
          birth_id: nonSourceBirth.birthId,
          revision_no: 1,
          replayed: false,
        });

        expect(() =>
          sql(`
            select public.deactivate_litter_plan_actual_birth_activation_internal(
              ${q(organizationId)}::uuid,
              ${q(ids.litter)}::uuid,
              ${q(firstActivationId)}::uuid,
              ${q(ids.nonSourceCancellation)}::uuid
            );
          `),
        ).toThrow(/cancel-birth adjustment source birth invariant failed/);

        expect(activationSnapshot(ids.litter)).toEqual(
          beforeMismatchedDeactivation,
        );

        const privateCancellation = privateCancelBirth({
          birthId: first.birthId,
          commandId: ids.privateCancellation,
          expectedRevision: 2,
          cancelledAt: "2026-07-31T10:05:00+02:00",
          reason: "Annulation technique auditée",
        });
        expect(privateCancellation).toMatchObject({
          outcome: "success",
          birth_id: first.birthId,
          revision_no: 3,
          replayed: false,
        });

        const deactivated = jsonSql<Json>(`
          select public.deactivate_litter_plan_actual_birth_activation_internal(
            ${q(organizationId)}::uuid,
            ${q(ids.litter)}::uuid,
            ${q(firstActivationId)}::uuid,
            ${q(ids.privateCancellation)}::uuid
          )::text;
        `);
        expect(deactivated).toMatchObject({
          outcome: "success",
          activationId: firstActivationId,
          currentActivationId: null,
          lastActivationId: firstActivationId,
          previousStateRevision: 0,
          resultingStateRevision: 1,
        });

        const deactivationReplay = jsonSql<Json>(`
          select public.deactivate_litter_plan_actual_birth_activation_internal(
            ${q(organizationId)}::uuid,
            ${q(ids.litter)}::uuid,
            ${q(firstActivationId)}::uuid,
            ${q(ids.privateCancellation)}::uuid
          )::text;
        `);
        expect(deactivationReplay).toEqual(deactivated);

        expect(() =>
          sql(`
            select public.deactivate_litter_plan_actual_birth_activation_internal(
              ${q(organizationId)}::uuid,
              ${q(ids.litter)}::uuid,
              '00000000-0000-4000-8000-000000000001'::uuid,
              ${q(ids.privateCancellation)}::uuid
            );
          `),
        ).toThrow(/client_command_conflict/);

        const inactiveState = activationSnapshot(ids.litter);
        expect(inactiveState.activations).toEqual(firstState.activations);
        expect(inactiveState.state).toMatchObject({
          currentActivationId: null,
          lastActivationId: firstActivationId,
          revision: 1,
        });
        expect(inactiveState.deactivations).toHaveLength(1);
        expect(inactiveState.deactivations[0]).toMatchObject({
          activationId: firstActivationId,
          commandId: ids.privateCancellation,
          previousRevision: 0,
          resultingRevision: 1,
        });

        const activationReplay = jsonSql<Json>(`
          select public.activate_litter_plan_on_first_birth_internal(
            ${q(organizationId)}::uuid,
            ${q(ids.litter)}::uuid,
            '2026-07-30'::date,
            ${q(ownerId)}::uuid,
            ${q(ids.firstBirthCommand)}::uuid
          )::text;
        `);
        expect(activationReplay).toMatchObject({ outcome: "success" });
        expect(activationSnapshot(ids.litter)).toEqual(inactiveState);

        const historicalIgnored = await cancelWhelpingBirthCore(
          {
            birthId: first.birthId,
            clientCommandId: ids.historicalCancellation,
            expectedRevisionNo: 3,
            cancelledAt: "2026-07-31T10:10:00+02:00",
            reason: "Activation historique ignorée",
          },
          owner,
        );
        expect(historicalIgnored).toMatchObject({
          outcome: "error",
          error: { code: "birth_cancelled" },
        });

        const second = await recordWhelpingBirthCore(
          {
            sessionId: ids.session,
            clientCommandId: ids.secondBirthCommand,
            occurredAt: "2026-07-31T11:00:00+02:00",
            sex: "male",
            viability: "alive",
            note: "Seconde activation de la lignée",
          },
          owner,
        );
        expect(second).toMatchObject({
          outcome: "success",
          birthOrder: 1,
          replayed: false,
        });
        if (second.outcome !== "success") throw new Error("second birth required");

        const lineage = activationSnapshot(ids.litter);
        expect(lineage.activations).toHaveLength(2);
        expect(lineage.activations[1]).toMatchObject({
          previousActivationId: firstActivationId,
          commandId: ids.secondBirthCommand,
          actualBirthDate: "2026-07-31",
        });
        expect(lineage.state).toMatchObject({
          currentActivationId: lineage.activations[1]!.id,
          lastActivationId: lineage.activations[1]!.id,
          revision: 2,
        });
        expect(lineage.deactivations).toEqual(inactiveState.deactivations);

        const secondCancellation = await cancelWhelpingBirthCore(
          {
            birthId: second.birthId,
            clientCommandId: ids.secondBlockedCancellation,
            expectedRevisionNo: 0,
            cancelledAt: "2026-07-31T11:05:00+02:00",
            reason: "Le nouveau courant est restauré",
          },
          owner,
        );
        expect(secondCancellation).toMatchObject({
          outcome: "success",
          revisionNo: 1,
          replayed: false,
        });
        expect(activationSnapshot(ids.litter)).toMatchObject({
          state: {
            currentActivationId: null,
            lastActivationId: lineage.activations[1]!.id,
            revision: 3,
          },
          deactivations: [
            inactiveState.deactivations[0],
            expect.objectContaining({
              activationId: lineage.activations[1]!.id,
              commandId: ids.secondBlockedCancellation,
              previousRevision: 2,
              resultingRevision: 3,
            }),
          ],
        });

        await createTestAnimal(sql, fixtures, {
          id: ids.concurrentMother,
          organizationId,
          ownerId,
          callName: "E2E concurrent activation mother",
          sex: "female",
        });
        await createTestLitter(sql, fixtures, {
          id: ids.concurrentLitter,
          organizationId,
          ownerId,
          motherId: ids.concurrentMother,
          name: "E2E concurrent activation litter",
        });
        await createTestWhelpingSession(sql, fixtures, {
          id: ids.concurrentSession,
          organizationId,
          litterId: ids.concurrentLitter,
          motherId: ids.concurrentMother,
          ownerId,
          startedAt: "2026-08-01T08:00:00+02:00",
        });

        const concurrent = await Promise.all([
          recordWhelpingBirthCore(
            {
              sessionId: ids.concurrentSession,
              clientCommandId: ids.concurrentBirthA,
              occurredAt: "2026-08-01T09:00:00+02:00",
              sex: "female",
              viability: "alive",
            },
            owner,
          ),
          recordWhelpingBirthCore(
            {
              sessionId: ids.concurrentSession,
              clientCommandId: ids.concurrentBirthB,
              occurredAt: "2026-08-01T09:01:00+02:00",
              sex: "male",
              viability: "alive",
            },
            owner,
          ),
        ]);
        expect(concurrent.every((result) => result.outcome === "success")).toBe(
          true,
        );
        expect(
          concurrent
            .filter((result) => result.outcome === "success")
            .map((result) => result.birthOrder)
            .sort(),
        ).toEqual([1, 2]);
        const concurrentState = activationSnapshot(ids.concurrentLitter);
        expect(concurrentState.activations).toHaveLength(1);
        expect(concurrentState.state).toMatchObject({
          currentActivationId: concurrentState.activations[0]!.id,
          lastActivationId: concurrentState.activations[0]!.id,
          revision: 0,
        });

        await createTestAnimal(sql, fixtures, {
          id: ids.rollbackMother,
          organizationId,
          ownerId,
          callName: "E2E rollback activation mother",
          sex: "female",
        });
        await createTestLitter(sql, fixtures, {
          id: ids.rollbackLitter,
          organizationId,
          ownerId,
          motherId: ids.rollbackMother,
          name: "E2E rollback activation litter",
        });
        await createTestWhelpingSession(sql, fixtures, {
          id: ids.rollbackSession,
          organizationId,
          litterId: ids.rollbackLitter,
          motherId: ids.rollbackMother,
          ownerId,
          startedAt: "2026-08-02T08:00:00+02:00",
        });
        const rollbackFirst = await recordWhelpingBirthCore(
          {
            sessionId: ids.rollbackSession,
            clientCommandId: ids.rollbackFirstBirth,
            occurredAt: "2026-08-02T09:00:00+02:00",
            sex: "female",
            viability: "alive",
          },
          owner,
        );
        expect(rollbackFirst).toMatchObject({
          outcome: "success",
          birthOrder: 1,
        });
        if (rollbackFirst.outcome !== "success") {
          throw new Error("rollback first birth required");
        }
        expect(
          privateCancelBirth({
            birthId: rollbackFirst.birthId,
            commandId: ids.rollbackPrivateCancellation,
            expectedRevision: 0,
            cancelledAt: "2026-08-02T10:00:00+02:00",
            reason: "Préparer le rollback global",
          }),
        ).toMatchObject({ outcome: "success" });

        sql(`
          begin;
          set local session_replication_role = replica;
          delete from public.litter_plan_actual_birth_activation_states
          where organization_id = ${q(organizationId)}::uuid
            and litter_id = ${q(ids.rollbackLitter)}::uuid;
          commit;
        `);
        const rollbackBefore = jsonSql<Json>(`
          select json_build_object(
            'commands', (
              select count(*) from public.whelping_commands
              where litter_id = ${q(ids.rollbackLitter)}::uuid
            ),
            'births', (
              select count(*) from public.whelping_births birth
              join public.whelping_sessions session
                on session.organization_id = birth.organization_id
               and session.id = birth.session_id
              where session.litter_id = ${q(ids.rollbackLitter)}::uuid
            ),
            'animals', (
              select count(*) from public.animals
              where litter_id = ${q(ids.rollbackLitter)}::uuid
            ),
            'activations', (
              select count(*)
              from public.litter_plan_actual_birth_activations
              where litter_id = ${q(ids.rollbackLitter)}::uuid
            )
          )::text;
        `);
        const rejected = await recordWhelpingBirthCore(
          {
            sessionId: ids.rollbackSession,
            clientCommandId: ids.rollbackRejectedBirth,
            occurredAt: "2026-08-02T11:00:00+02:00",
            sex: "male",
            viability: "alive",
          },
          owner,
        );
        expect(rejected.outcome).toBe("error");
        expect(
          sql(`
            select count(*)::text from public.whelping_commands
            where client_command_id = ${q(ids.rollbackRejectedBirth)}::uuid;
          `),
        ).toBe("0");
        expect(
          jsonSql<Json>(`
            select json_build_object(
              'commands', (
                select count(*) from public.whelping_commands
                where litter_id = ${q(ids.rollbackLitter)}::uuid
              ),
              'births', (
                select count(*) from public.whelping_births birth
                join public.whelping_sessions session
                  on session.organization_id = birth.organization_id
                 and session.id = birth.session_id
                where session.litter_id = ${q(ids.rollbackLitter)}::uuid
              ),
              'animals', (
                select count(*) from public.animals
                where litter_id = ${q(ids.rollbackLitter)}::uuid
              ),
              'activations', (
                select count(*)
                from public.litter_plan_actual_birth_activations
                where litter_id = ${q(ids.rollbackLitter)}::uuid
              )
            )::text;
          `),
        ).toEqual(rollbackBefore);

        await createTestOrganization(sql, fixtures, {
          id: ids.foreignOrganization,
          name: "E2E foreign lifecycle organization",
          slug: "e2e-foreign-lifecycle-activation",
        });
        expect(() =>
          sql(`
            update public.litter_plan_actual_birth_activation_states
            set organization_id = ${q(ids.foreignOrganization)}::uuid
            where litter_id = ${q(ids.litter)}::uuid;
          `),
        ).toThrow(/foreign key constraint/);
        expect(() =>
          sql(`
            update public.litter_plan_actual_birth_activations
            set previous_activation_id = null
            where id = ${q(lineage.activations[1]!.id)}::uuid;
          `),
        ).toThrow(/append-only/);
        expect(() =>
          sql(`
            update public.litter_plan_actual_birth_activation_deactivations
            set reason = 'Mutation interdite'
            where activation_id = ${q(firstActivationId)}::uuid;
          `),
        ).toThrow(/append-only/);

        const schema = jsonSql<{
          tables: Array<{
            name: string;
            rls: boolean;
            policies: number;
            clientGrants: number;
          }>;
          functions: Array<{
            name: string;
            publicExecute: boolean;
            anonExecute: boolean;
            authenticatedExecute: boolean;
          }>;
          lineageConstraints: string[];
          cancelUsesState: boolean;
          cancelCallsDeactivation: boolean;
          signatures: Record<string, string>;
        }>(`
          select json_build_object(
            'tables', (
              select json_agg(json_build_object(
                'name', class.relname,
                'rls', class.relrowsecurity,
                'policies', (
                  select count(*) from pg_catalog.pg_policy policy
                  where policy.polrelid = class.oid
                ),
                'clientGrants', (
                  select count(*)
                  from information_schema.role_table_grants grant_row
                  where grant_row.table_schema = 'public'
                    and grant_row.table_name = class.relname
                    and grant_row.grantee in (
                      'PUBLIC',
                      'anon',
                      'authenticated'
                    )
                )
              ) order by class.relname)
              from pg_catalog.pg_class class
              join pg_catalog.pg_namespace namespace
                on namespace.oid = class.relnamespace
              where namespace.nspname = 'public'
                and class.relname in (
                  'litter_plan_actual_birth_activation_states',
                  'litter_plan_actual_birth_activation_deactivations'
                )
            ),
            'functions', (
              select json_agg(json_build_object(
                'name', procedure.proname,
                'publicExecute', exists (
                  select 1
                  from pg_catalog.aclexplode(
                    coalesce(
                      procedure.proacl,
                      pg_catalog.acldefault('f', procedure.proowner)
                    )
                  ) acl
                  where acl.grantee = 0
                    and acl.privilege_type = 'EXECUTE'
                ),
                'anonExecute', pg_catalog.has_function_privilege(
                  'anon',
                  procedure.oid,
                  'execute'
                ),
                'authenticatedExecute', pg_catalog.has_function_privilege(
                  'authenticated',
                  procedure.oid,
                  'execute'
                )
              ) order by procedure.proname)
              from pg_catalog.pg_proc procedure
              join pg_catalog.pg_namespace namespace
                on namespace.oid = procedure.pronamespace
              where namespace.nspname = 'public'
                and procedure.proname in (
                  'current_litter_plan_actual_birth_activation_id_internal',
                  'advance_litter_plan_actual_birth_activation_state_internal',
                  'deactivate_litter_plan_actual_birth_activation_internal'
                )
            ),
            'lineageConstraints', (
              select json_agg(constraint_row.conname order by constraint_row.conname)
              from pg_catalog.pg_constraint constraint_row
              where constraint_row.conrelid =
                'public.litter_plan_actual_birth_activations'::regclass
            ),
            'cancelUsesState', position(
              'litter_plan_actual_birth_activation_states'
              in pg_catalog.pg_get_functiondef(
                'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure
              )
            ) > 0,
            'cancelCallsDeactivation', position(
              'deactivate_litter_plan_actual_birth_activation_internal'
              in pg_catalog.pg_get_functiondef(
                'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure
              )
            ) > 0,
            'signatures', json_build_object(
              'activate', pg_catalog.pg_get_function_identity_arguments(
                'public.activate_litter_plan_on_first_birth_internal(uuid,uuid,date,uuid,uuid)'::regprocedure
              ),
              'cancel', pg_catalog.pg_get_function_identity_arguments(
                'public.cancel_whelping_birth(uuid,uuid,integer,timestamptz,text)'::regprocedure
              ),
              'record', pg_catalog.pg_get_function_identity_arguments(
                'public.record_whelping_birth(uuid,uuid,timestamptz,text,text,text,integer,timestamptz,text)'::regprocedure
              )
            )
          )::text;
        `);
        expect(schema.tables).toHaveLength(2);
        for (const table of schema.tables) {
          expect(table).toMatchObject({
            rls: true,
            policies: 0,
            clientGrants: 0,
          });
        }
        for (const fn of schema.functions) {
          expect(fn).toMatchObject({
            publicExecute: false,
            anonExecute: false,
            authenticatedExecute: false,
          });
        }
        expect(schema.lineageConstraints).toEqual(
          expect.arrayContaining([
            "litter_plan_actual_birth_activations_org_command_key",
            "litter_plan_actual_birth_activations_previous_fk",
            "litter_plan_actual_birth_activations_one_successor_key",
          ]),
        );
        expect(schema.lineageConstraints).not.toContain(
          "litter_plan_actual_birth_activations_org_litter_key",
        );
        expect(schema.cancelUsesState).toBe(true);
        expect(schema.cancelCallsDeactivation).toBe(false);
        expect(schema.signatures).toEqual({
          activate:
            "p_organization_id uuid, p_litter_id uuid, p_actual_birth_date date, p_actor_id uuid, p_whelping_client_command_id uuid",
          cancel:
            "p_birth_id uuid, p_client_command_id uuid, p_expected_revision_no integer, p_cancelled_at timestamp with time zone, p_reason text",
          record:
            "p_session_id uuid, p_client_command_id uuid, p_occurred_at timestamp with time zone, p_sex text, p_viability text, p_initial_collar_color text, p_weight_grams integer, p_measured_at timestamp with time zone, p_note text",
        });

        const stateRead = await owner
          .from("litter_plan_actual_birth_activation_states")
          .select("id")
          .limit(1);
        expect(stateRead.error).not.toBeNull();
        const deactivationRead = await owner
          .from("litter_plan_actual_birth_activation_deactivations")
          .select("id")
          .limit(1);
        expect(deactivationRead.error).not.toBeNull();
        const privateRpc = await (
          owner.rpc as unknown as (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: { message: string } | null }>
        )("current_litter_plan_actual_birth_activation_id_internal", {
          p_organization_id: organizationId,
          p_litter_id: ids.litter,
        });
        expect(privateRpc.error).not.toBeNull();

        const migration = readFileSync(
          resolve(
            process.cwd(),
            "supabase/migrations/202607300007_litter_actual_birth_activation_lifecycle.sql",
          ),
          "utf8",
        );
        expect(migration).toContain(
          "insert into public.litter_plan_actual_birth_activation_states",
        );
        expect(migration).toContain(
          "from public.litter_plan_actual_birth_activations activation",
        );
        expect(migration).not.toMatch(
          /update\s+public\.litter_plan_actual_birth_activations\b/i,
        );
        expect(migration).not.toMatch(
          /delete\s+from\s+public\.litter_plan_actual_birth_activations\b/i,
        );

        fixtureManifest = {
          namespace,
          deterministicIds: ids,
          lifecycle: lineage,
          concurrent: concurrentState,
          rollback: rollbackBefore,
        };
      } finally {
        await discoverLifecycleFixtures(
          fixtures,
          litterIds,
          birthCommands,
          adjustmentCommands,
        );
      }
    },
    namespace,
  );

  const finalCounts = jsonSql<Record<string, number>>(`
    select json_build_object(
      'reversal_changes', (
        select count(*)
        from public.litter_plan_actual_birth_activation_reversal_changes
        where litter_id::text like ${q(`${prefix}-%`)}
      ),
      'reversal_snapshots', (
        select count(*)
        from public.litter_plan_actual_birth_activation_reversal_snapshots
        where litter_id::text like ${q(`${prefix}-%`)}
      ),
      'deactivations', (
        select count(*)
        from public.litter_plan_actual_birth_activation_deactivations
        where litter_id::text like ${q(`${prefix}-%`)}
          or birth_adjustment_client_command_id::text like ${q(`${prefix}-%`)}
      ),
      'states', (
        select count(*)
        from public.litter_plan_actual_birth_activation_states
        where litter_id::text like ${q(`${prefix}-%`)}
      ),
      'activations', (
        select count(*)
        from public.litter_plan_actual_birth_activations
        where litter_id::text like ${q(`${prefix}-%`)}
          or whelping_client_command_id::text like ${q(`${prefix}-%`)}
      ),
      'adjustments', (
        select count(*) from public.whelping_birth_adjustment_commands
        where client_command_id::text like ${q(`${prefix}-%`)}
      ),
      'reconciliations', (
        select count(*)
        from public.litter_plan_actual_birth_reconciliations
        where litter_id::text like ${q(`${prefix}-%`)}
          or birth_adjustment_client_command_id::text like ${q(`${prefix}-%`)}
      ),
      'commands', (
        select count(*) from public.whelping_commands
        where client_command_id::text like ${q(`${prefix}-%`)}
      ),
      'births', (
        select count(*) from public.whelping_births
        where id::text like ${q(`${prefix}-%`)}
          or session_id::text like ${q(`${prefix}-%`)}
      ),
      'events', (
        select count(*) from public.whelping_events
        where id::text like ${q(`${prefix}-%`)}
          or session_id::text like ${q(`${prefix}-%`)}
      ),
      'sessions', (
        select count(*) from public.whelping_sessions
        where id::text like ${q(`${prefix}-%`)}
          or litter_id::text like ${q(`${prefix}-%`)}
      ),
      'litters', (
        select count(*) from public.litters
        where id::text like ${q(`${prefix}-%`)}
      ),
      'animals', (
        select count(*) from public.animals
        where id::text like ${q(`${prefix}-%`)}
          or litter_id::text like ${q(`${prefix}-%`)}
      ),
      'organizations', (
        select count(*) from public.organizations
        where id::text like ${q(`${prefix}-%`)}
      )
    )::text;
  `);
  expect(Object.values(finalCounts).every((count) => count === 0)).toBe(true);
  console.log(
    `LITTER_ACTIVATION_LIFECYCLE_FIXTURES=${JSON.stringify(fixtureManifest)}`,
  );
  console.log(
    `LITTER_ACTIVATION_LIFECYCLE_CLEANUP=${JSON.stringify(finalCounts)}`,
  );
});
