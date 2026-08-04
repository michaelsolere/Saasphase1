import { expect, test } from "@playwright/test";

import {
  createTestAdopterFinalizationReadyScenario,
} from "./helpers/fixtures/adopter-finalization-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  registerPostAdoptionQuestionnaireEffects,
} from "./helpers/fixtures/post-adoption-questionnaire-fixtures";
import { runE2eSql, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(300_000);

const organizationId = "9f340001-0000-4000-8000-000000000001";
const membershipId = "9f340001-0000-4000-8000-000000000002";
const ownerId = "10000000-0000-4000-8000-000000000001";
const outsiderId = "f3400000-0000-4000-8000-000000000099";
const commandIds = {
  historical: "9f340001-0000-4000-8000-000000000010",
  continuation: "9f340001-0000-4000-8000-000000000016",
  invalidBoundary: "9f340001-0000-4000-8000-000000000017",
  retry: "9f340001-0000-4000-8000-000000000011",
  concurrentA: "9f340001-0000-4000-8000-000000000012",
  concurrentB: "9f340001-0000-4000-8000-000000000013",
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function jsonSqlLine(statement: string) {
  return sql(statement)
    .split("\n")
    .find((line) => line.trimStart().startsWith("{"));
}

function numericSqlLine(statement: string) {
  return sql(statement)
    .split("\n")
    .find((line) => /^\d+$/.test(line.trim()));
}

function callReconciliation(
  commandId: string,
  batchSize = 100,
  cursor?: { adoptionCompletedAt: string; reservationId: string },
  boundary?: { adoptionCompletedAt: string; reservationId: string },
) {
  return JSON.parse(
    jsonSqlLine(`
      begin;
      set local role authenticated;
      set local request.jwt.claim.sub = ${q(ownerId)};
      select row_to_json(reconciliation)::text
      from public.reconcile_post_adoption_questionnaire_instances(
        ${q(organizationId)}::uuid,
        ${q(commandId)}::uuid,
        ${batchSize},
        ${cursor ? `${q(cursor.adoptionCompletedAt)}::timestamptz` : "null"},
        ${cursor ? `${q(cursor.reservationId)}::uuid` : "null"},
        ${boundary ? `${q(boundary.adoptionCompletedAt)}::timestamptz` : "null"},
        ${boundary ? `${q(boundary.reservationId)}::uuid` : "null"}
      ) reconciliation;
      commit;
    `) ?? "{}",
  ) as {
    outcome: string;
    reason: string | null;
    replayed: boolean;
    processed_reservation_count: number;
    created_count: number;
    already_present_count: number;
    missing_data_count: number;
    error_count: number;
    next_adoption_completed_at: string | null;
    next_reservation_id: string | null;
    until_adoption_completed_at: string | null;
    until_reservation_id: string | null;
    has_more: boolean;
  };
}

test(
  "post-adoption reconciliation provisions future and historical T1/T2 exactly once",
  async () =>
    withE2eFixtures(runE2eSql, async (fixtures) => {
    await runE2eSql(`
      insert into public.organizations (id, name, slug)
      values (
        ${q(organizationId)}::uuid,
        'E2E post-adoption reconciliation',
        'e2e-post-adoption-reconciliation'
      );
    `);
    fixtures.register("organizations", organizationId);
    await runE2eSql(`
      insert into public.memberships (
        id, organization_id, profile_id, role, status, created_by, updated_by
      ) values (
        ${q(membershipId)}::uuid,
        ${q(organizationId)}::uuid,
        ${q(ownerId)}::uuid,
        'admin',
        'active',
        ${q(ownerId)}::uuid,
        ${q(ownerId)}::uuid
      );
    `);
    fixtures.register("memberships", membershipId);

    const future = await createTestAdopterFinalizationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E future questionnaire family",
        animalCallName: "E2E questionnaire future",
        birthDate: "2024-01-15",
      },
    );
    const historical = await createTestAdopterFinalizationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E historical questionnaire family",
        animalCallName: "E2E questionnaire historical",
        birthDate: "2024-02-20",
      },
    );
    const missingBirth = await createTestAdopterFinalizationReadyScenario(
      runE2eSql,
      fixtures,
      {
        organizationId,
        ownerId,
        displayName: "E2E missing-birth questionnaire family",
        animalCallName: "E2E questionnaire missing birth",
        birthDate: null,
      },
    );
    const reservationIds = [
      future.journey.id,
      historical.journey.id,
      missingBirth.journey.id,
    ];
    const clientCommandIds = Object.values(commandIds);

    try {
      const installed = JSON.parse(
        sql(`
          select json_build_object(
            'releaseTable', to_regclass('public.post_adoption_questionnaire_releases') is not null,
            'runTable', to_regclass('public.post_adoption_questionnaire_reconciliation_runs') is not null,
            'attemptTable', to_regclass('public.post_adoption_questionnaire_reconciliation_attempts') is not null,
            'operatorFunction', to_regprocedure(
              'public.reconcile_post_adoption_questionnaire_instances(uuid,uuid,integer,timestamptz,uuid,timestamptz,uuid)'
            ) is not null
          )::text;
        `),
      );
      expect(installed).toEqual({
        releaseTable: true,
        runTable: true,
        attemptTable: true,
        operatorFunction: true,
      });

      expect(
        JSON.parse(
          sql(`
            select json_agg(json_build_object(
              'code', questionnaire_code,
              'version', questionnaire_version,
              'effectiveAt', effective_at::text
            ) order by questionnaire_code)::text
            from public.post_adoption_questionnaire_releases;
          `),
        ),
      ).toEqual([
        { code: "post-adoption-t1", version: 1, effectiveAt: "-infinity" },
        { code: "post-adoption-t2", version: 1, effectiveAt: "-infinity" },
      ]);

      sql(`
        begin;
        set local session_replication_role = replica;
        update public.reservations
        set status = 'adopted',
            adoption_completed_at = statement_timestamp() - interval '20 days',
            updated_by = ${q(ownerId)}::uuid
        where id = ${q(historical.journey.id)}::uuid;
        commit;
      `);

      sql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
        update public.reservations
        set status = 'adopted',
            adoption_completed_at = statement_timestamp() - interval '10 days',
            updated_by = ${q(ownerId)}::uuid
        where id = ${q(future.journey.id)}::uuid;
        update public.reservations
        set status = 'adopted',
            adoption_completed_at = statement_timestamp() - interval '15 days',
            updated_by = ${q(ownerId)}::uuid
        where id = ${q(missingBirth.journey.id)}::uuid;
        commit;
      `);

      await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
        reservationIds,
      });

      expect(
        JSON.parse(
          sql(`
            select json_agg(json_build_object(
              'milestone', milestone,
              'outcome', outcome,
              'reason', reason
            ) order by milestone)::text
            from public.post_adoption_questionnaire_reconciliation_attempts
            where reservation_id = ${q(missingBirth.journey.id)}::uuid;
          `),
        ),
      ).toEqual([
        { milestone: "t1", outcome: "created", reason: "instance_created" },
        {
          milestone: "t2",
          outcome: "missing_data",
          reason: "animal_birth_date_missing",
        },
      ]);

      expect(
        JSON.parse(
          sql(`
            select json_agg(json_build_object(
              'code', questionnaire_code,
              'version', questionnaire_version,
              'dueMatches', case questionnaire_code
                when 'post-adoption-t1' then due_at = (
                  select adoption_completed_at + interval '60 days'
                  from public.reservations
                  where id = ${q(future.journey.id)}::uuid
                )
                when 'post-adoption-t2' then due_at = (
                  select (birth_date::timestamp at time zone 'UTC') + interval '15 months'
                  from public.animals
                  where id = ${q(future.animal.id)}::uuid
                )
              end,
              'status', status
            ) order by questionnaire_code)::text
            from public.post_adoption_questionnaire_instances
            where reservation_id = ${q(future.journey.id)}::uuid;
          `),
        ),
      ).toEqual([
        {
          code: "post-adoption-t1",
          version: 1,
          dueMatches: true,
          status: "planned",
        },
        {
          code: "post-adoption-t2",
          version: 1,
          dueMatches: true,
          status: "due",
        },
      ]);

      expect(
        JSON.parse(
          sql(`
            select json_build_object(
              'instances', count(distinct instance.id),
              'createdEvents', count(*) filter (where event.event_type = 'instance_created'),
              'dueEvents', count(*) filter (where event.event_type = 'became_due')
            )::text
            from public.post_adoption_questionnaire_instances instance
            left join public.post_adoption_questionnaire_events event
              on event.organization_id = instance.organization_id
             and event.instance_id = instance.id
            where instance.reservation_id = ${q(future.journey.id)}::uuid;
          `),
        ),
      ).toEqual({ instances: 2, createdEvents: 2, dueEvents: 1 });

      sql(`
          begin;
          with version_two as (
            select
              definition.code,
              jsonb_set(definition.definition, '{version}', to_jsonb(2)) as definition
            from public.post_adoption_questionnaire_definitions definition
            where definition.code in ('post-adoption-t1', 'post-adoption-t2')
              and definition.version = 1
          )
          insert into public.post_adoption_questionnaire_definitions (
            code, version, milestone, title, species, breed, anchor_type,
            anchor_offset, response_window, published_at,
            definition, definition_sha256
          )
          select
            definition.code,
            2,
            definition.milestone,
            definition.title,
            definition.species,
            definition.breed,
            definition.anchor_type,
            definition.anchor_offset,
            definition.response_window,
            statement_timestamp(),
            version_two.definition,
            encode(
              extensions.digest(
                convert_to(version_two.definition::text, 'UTF8'),
                'sha256'
              ),
              'hex'
            )
          from public.post_adoption_questionnaire_definitions definition
          join version_two on version_two.code = definition.code
          where definition.version = 1;

          insert into public.post_adoption_questionnaire_releases (
            questionnaire_code, questionnaire_version, effective_at
          ) values
            ('post-adoption-t1', 2, statement_timestamp() + interval '1 day'),
            ('post-adoption-t2', 2, statement_timestamp() + interval '1 day');

          set local session_replication_role = replica;
          insert into public.reservations (
            id, organization_id, contact_id, animal_id, species, breed,
            status, adoption_completed_at, created_by, updated_by
          ) values (
            '9f340001-0000-4000-8000-000000000099'::uuid,
            ${q(organizationId)}::uuid,
            ${q(future.contact.id)}::uuid,
            ${q(future.animal.id)}::uuid,
            'dog',
            'Golden Retriever',
            'adopted',
            statement_timestamp() + interval '2 days',
            ${q(ownerId)}::uuid,
            ${q(ownerId)}::uuid
          );
          set local session_replication_role = origin;

          select public.reconcile_post_adoption_questionnaire_reservation_internal(
            '9f340001-0000-4000-8000-000000000099'::uuid,
            'manual_retry',
            null,
            ${q(ownerId)}::uuid,
            statement_timestamp() + interval '3 days'
          );
          do $assert$
          begin
            if (
              select count(*) <> 2
              from public.post_adoption_questionnaire_instances
              where reservation_id = '9f340001-0000-4000-8000-000000000099'::uuid
                and questionnaire_version = 2
            ) then
              raise exception 'future release did not select version 2';
            end if;
          end;
          $assert$;
          rollback;
        `);

      expect(
        Number(
          sql(`
            select count(*)
            from public.post_adoption_questionnaire_instances
            where reservation_id = ${q(historical.journey.id)}::uuid;
          `),
        ),
      ).toBe(0);

      const historicalRun = callReconciliation(commandIds.historical, 1);
      expect(historicalRun).toMatchObject({
        outcome: "success",
        reason: null,
        replayed: false,
        processed_reservation_count: 1,
        created_count: 2,
        has_more: true,
        error_count: 0,
      });
      expect(historicalRun.next_adoption_completed_at).not.toBeNull();
      expect(historicalRun.next_reservation_id).toBe(historical.journey.id);
      expect(historicalRun.until_adoption_completed_at).not.toBeNull();
      expect(historicalRun.until_reservation_id).toBe(future.journey.id);
      expect(
        callReconciliation(commandIds.invalidBoundary, 100, {
          adoptionCompletedAt: historicalRun.next_adoption_completed_at!,
          reservationId: historicalRun.next_reservation_id!,
        }),
      ).toMatchObject({ outcome: "error", reason: "invalid_input" });

      const afterBoundary = await createTestAdopterFinalizationReadyScenario(
        runE2eSql,
        fixtures,
        {
          organizationId,
          ownerId,
          displayName: "E2E questionnaire after boundary family",
          animalCallName: "E2E questionnaire after boundary",
          birthDate: "2024-04-10",
        },
      );
      reservationIds.push(afterBoundary.journey.id);
      sql(`
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
        update public.reservations
        set status = 'adopted',
            adoption_completed_at = statement_timestamp(),
            updated_by = ${q(ownerId)}::uuid
        where id = ${q(afterBoundary.journey.id)}::uuid;
        commit;
      `);
      await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
        reservationIds: [afterBoundary.journey.id],
      });

      expect(
        callReconciliation(
          commandIds.continuation,
          100,
          {
            adoptionCompletedAt: historicalRun.next_adoption_completed_at!,
            reservationId: historicalRun.next_reservation_id!,
          },
          {
            adoptionCompletedAt: historicalRun.until_adoption_completed_at!,
            reservationId: historicalRun.until_reservation_id!,
          },
        ),
      ).toMatchObject({
        outcome: "success",
        replayed: false,
        processed_reservation_count: 2,
        created_count: 0,
        already_present_count: 3,
        missing_data_count: 1,
        has_more: false,
      });
      expect(
        Number(
          sql(`
            select count(*)
            from public.post_adoption_questionnaire_instances
            where reservation_id = ${q(historical.journey.id)}::uuid;
          `),
        ),
      ).toBe(2);

      const attemptCountBeforeReplay = Number(
        sql(`
          select count(*)
          from public.post_adoption_questionnaire_reconciliation_attempts attempt
          join public.post_adoption_questionnaire_reconciliation_runs run
            on run.organization_id = attempt.organization_id
           and run.id = attempt.run_id
          where run.client_command_id = ${q(commandIds.historical)}::uuid;
        `),
      );
      expect(callReconciliation(commandIds.historical, 1)).toMatchObject({
        outcome: "success",
        replayed: true,
      });
      expect(
        Number(
          sql(`
            select count(*)
            from public.post_adoption_questionnaire_reconciliation_attempts attempt
            join public.post_adoption_questionnaire_reconciliation_runs run
              on run.organization_id = attempt.organization_id
             and run.id = attempt.run_id
            where run.client_command_id = ${q(commandIds.historical)}::uuid;
          `),
        ),
      ).toBe(attemptCountBeforeReplay);
      expect(callReconciliation(commandIds.historical, 99)).toMatchObject({
        outcome: "error",
        reason: "client_command_conflict",
        replayed: false,
      });

      sql(`
        update public.animals
        set birth_date = '2024-03-10'
        where id = ${q(missingBirth.animal.id)}::uuid;
      `);
      expect(callReconciliation(commandIds.retry)).toMatchObject({
        outcome: "success",
        replayed: false,
        error_count: 0,
      });
      expect(
        JSON.parse(
          sql(`
            select json_agg(questionnaire_code order by questionnaire_code)::text
            from public.post_adoption_questionnaire_instances
            where reservation_id = ${q(missingBirth.journey.id)}::uuid;
          `),
        ),
      ).toEqual(["post-adoption-t1", "post-adoption-t2"]);

      expect(() =>
        sql(`
          update public.reservations
          set adoption_completed_at = adoption_completed_at + interval '1 day'
          where id = ${q(future.journey.id)}::uuid;
        `),
      ).toThrow(/explicit correction workflow/i);
      expect(() =>
        sql(`
          update public.animals
          set birth_date = birth_date + 1
          where id = ${q(future.animal.id)}::uuid;
        `),
      ).toThrow(/explicit correction workflow/i);

      sql(`
        begin;
        set local app.qa_hard_delete = 'on';
        delete from public.post_adoption_questionnaire_reconciliation_attempts
        where reservation_id = ${q(historical.journey.id)}::uuid;
        delete from public.post_adoption_questionnaire_events
        where instance_id in (
          select id from public.post_adoption_questionnaire_instances
          where reservation_id = ${q(historical.journey.id)}::uuid
        );
        delete from public.post_adoption_questionnaire_instances
        where reservation_id = ${q(historical.journey.id)}::uuid;
        commit;
      `);

      const concurrentSql = (commandId: string) => `
        begin;
        set local role authenticated;
        set local request.jwt.claim.sub = ${q(ownerId)};
        select row_to_json(reconciliation)::text
        from public.reconcile_post_adoption_questionnaire_instances(
          ${q(organizationId)}::uuid,
          ${q(commandId)}::uuid,
          100,
          null,
          null,
          null,
          null
        ) reconciliation;
        commit;
      `;
      await Promise.all([
        runE2eSql(concurrentSql(commandIds.concurrentA)),
        runE2eSql(concurrentSql(commandIds.concurrentB)),
      ]);

      expect(
        JSON.parse(
          sql(`
            select json_build_object(
              'instances', (
                select count(*) from public.post_adoption_questionnaire_instances
                where reservation_id = ${q(historical.journey.id)}::uuid
              ),
              'createdEvents', (
                select count(*)
                from public.post_adoption_questionnaire_events event
                join public.post_adoption_questionnaire_instances instance
                  on instance.organization_id = event.organization_id
                 and instance.id = event.instance_id
                where instance.reservation_id = ${q(historical.journey.id)}::uuid
                  and event.event_type = 'instance_created'
              )
            )::text;
          `),
        ),
      ).toEqual({ instances: 2, createdEvents: 2 });

      expect(
        numericSqlLine(`
          begin;
          set local role authenticated;
          set local request.jwt.claim.sub = ${q(outsiderId)};
          select count(*)
          from public.post_adoption_questionnaire_reconciliation_attempts
          where reservation_id = any(array[
            ${reservationIds.map((id) => `${q(id)}::uuid`).join(", ")}
          ]);
          rollback;
        `),
      ).toBe("0");
      expect(
        JSON.parse(
          jsonSqlLine(`
            begin;
            set local role authenticated;
            set local request.jwt.claim.sub = ${q(outsiderId)};
            select row_to_json(reconciliation)::text
            from public.reconcile_post_adoption_questionnaire_instances(
              ${q(organizationId)}::uuid,
              gen_random_uuid(),
              1,
              null,
              null,
              null,
              null
            ) reconciliation;
            rollback;
          `) ?? "{}",
        ),
      ).toMatchObject({ outcome: "error", reason: "not_found" });

      expect(() =>
        sql(`
          update public.post_adoption_questionnaire_reconciliation_runs
          set payload = '{}'::jsonb
          where client_command_id = ${q(commandIds.historical)}::uuid;
        `),
      ).toThrow(/append-only/i);
      expect(() =>
        sql(`
          begin;
          set local role anon;
          select *
          from public.reconcile_post_adoption_questionnaire_instances(
            ${q(organizationId)}::uuid,
            gen_random_uuid(),
            1,
            null,
            null,
            null,
            null
          );
          rollback;
        `),
      ).toThrow(/permission denied/i);
    } finally {
      await registerPostAdoptionQuestionnaireEffects(runE2eSql, fixtures, {
        reservationIds,
        clientCommandIds,
      });
    }
  }, "post-adoption-questionnaire-reconciliation"),
);
