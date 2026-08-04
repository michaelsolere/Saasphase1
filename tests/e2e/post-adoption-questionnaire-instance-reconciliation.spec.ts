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
const sanitizedErrorAttemptId = "9f340001-0000-4000-8000-000000000018";
const ownerId = "10000000-0000-4000-8000-000000000001";
const outsiderId = "f3400000-0000-4000-8000-000000000099";
const commandIds = {
  historical: "9f340001-0000-4000-8000-000000000010",
  continuation: "9f340001-0000-4000-8000-000000000016",
  invalidBoundary: "9f340001-0000-4000-8000-000000000017",
  retry: "9f340001-0000-4000-8000-000000000011",
  concurrentA: "9f340001-0000-4000-8000-000000000012",
  concurrentB: "9f340001-0000-4000-8000-000000000013",
  concurrentReplay: "9f340001-0000-4000-8000-000000000019",
} as const;
const lockReleaseOrganizationIds = {
  reservations: "9f340001-0000-4000-8000-000000000021",
  contacts: "9f340001-0000-4000-8000-000000000022",
  animals: "9f340001-0000-4000-8000-000000000023",
  contactAdoption: "9f340001-0000-4000-8000-000000000024",
  animalAdoption: "9f340001-0000-4000-8000-000000000025",
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function parseJsonSqlOutput(output: string) {
  const line = output
    .split("\n")
    .find((line) => line.trimStart().startsWith("{"));
  if (!line) {
    throw new Error(`Expected JSON SQL output, received: ${output.slice(0, 500)}`);
  }
  return line;
}

function jsonSqlLine(statement: string) {
  return parseJsonSqlOutput(sql(statement));
}

function numericSqlLine(statement: string) {
  const output = sql(statement);
  const line = output
    .split("\n")
    .find((line) => /^\d+$/.test(line.trim()));
  if (!line) {
    throw new Error(`Expected numeric SQL output, received: ${output.slice(0, 500)}`);
  }
  return line;
}

async function waitForAdvisorySignal(label: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const held = Number(
      numericSqlLine(`
        select case
          when pg_try_advisory_lock(hashtextextended(${q(label)}, 0)) then
            case
              when pg_advisory_unlock(hashtextextended(${q(label)}, 0)) then 0
              else 0
            end
          else 1
        end;
      `),
    );
    if (held === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for PostgreSQL lock signal ${label}`);
}

async function releaseLockHolder(releaseId: string, holder: Promise<string>) {
  await runE2eSql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(releaseId)}::uuid,
      'E2E PostgreSQL lock release',
      ${q(`e2e-lock-release-${releaseId.slice(-3)}`)}
    )
    on conflict (id) do nothing;
  `);
  await holder;
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
    `),
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
            'reviewTriggerCount', (
              select count(*)::integer
              from pg_catalog.pg_trigger trigger
              where not trigger.tgisinternal
                and trigger.tgname in (
                  'aa_post_adoption_questionnaire_instances_lock_anchors',
                  'ab_reservations_protect_effective_adoption_questionnaire_anchor',
                  'ab_contacts_protect_effective_adoption_questionnaire_anchor',
                  'ab_animals_protect_effective_adoption_questionnaire_anchor',
                  'aa_post_adoption_questionnaire_attempts_sanitize_error'
                )
            ),
            'advisoryAnchorFunctionAbsent',
              to_regprocedure(
                'public.acquire_post_adoption_questionnaire_anchor_lock(text,uuid)'
              ) is null,
            'tupleLockInstalled', position(
              'for no key update of reservation nowait'
              in lower(pg_get_functiondef(
                'public.lock_post_adoption_questionnaire_instance_anchors()'::regprocedure
              ))
            ) > 0,
            'serviceRoleMutationPrivilegeCount', (
              select count(*)::integer
              from unnest(array[
                'public.post_adoption_questionnaire_releases',
                'public.post_adoption_questionnaire_reconciliation_runs',
                'public.post_adoption_questionnaire_reconciliation_attempts',
                'public.post_adoption_questionnaire_reconciliation_run_results'
              ]) table_name
              cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) privilege_name
              where has_table_privilege('service_role', table_name, privilege_name)
            ),
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
        reviewTriggerCount: 5,
        advisoryAnchorFunctionAbsent: true,
        tupleLockInstalled: true,
        serviceRoleMutationPrivilegeCount: 0,
        operatorFunction: true,
      });

      for (const statement of [
        "insert into public.post_adoption_questionnaire_releases default values",
        "update public.post_adoption_questionnaire_reconciliation_runs set batch_size = batch_size where false",
        "delete from public.post_adoption_questionnaire_reconciliation_attempts where false",
        "truncate table public.post_adoption_questionnaire_reconciliation_run_results",
      ]) {
        expect(() =>
          sql(`begin; set local role service_role; ${statement}; rollback;`),
        ).toThrow(/permission denied/i);
      }

      expect(
        JSON.parse(
          sql(`
            select json_agg(json_build_object(
              'code', questionnaire_code,
              'version', questionnaire_version,
              'effectiveAt', effective_at::text
            ) order by questionnaire_code)::text
            from public.post_adoption_questionnaire_releases
            where questionnaire_version = 1
              and questionnaire_code in ('post-adoption-t1', 'post-adoption-t2');
          `),
        ),
      ).toEqual([
        { code: "post-adoption-t1", version: 1, effectiveAt: "-infinity" },
        { code: "post-adoption-t2", version: 1, effectiveAt: "-infinity" },
      ]);

      fixtures.register(
        "post_adoption_questionnaire_reconciliation_attempts",
        sanitizedErrorAttemptId,
      );
      await runE2eSql(`
        insert into public.post_adoption_questionnaire_reconciliation_attempts (
          id,
          organization_id,
          reservation_id,
          milestone,
          source,
          outcome,
          reason,
          error_sqlstate,
          error_message,
          details
        ) values (
          ${q(sanitizedErrorAttemptId)}::uuid,
          ${q(organizationId)}::uuid,
          ${q(historical.journey.id)}::uuid,
          't1',
          'manual_retry',
          'error',
          'instance_creation_failed',
          '23514',
          'sensitive relation and offending value',
          jsonb_build_object(
            'databaseMessage', 'sensitive relation and offending value',
            'databaseContext', 'private schema detail'
          )
        );
      `);
      expect(
        JSON.parse(
          jsonSqlLine(`
            begin;
            set local role authenticated;
            set local request.jwt.claim.sub = ${q(ownerId)};
            select json_build_object(
              'sqlstate', error_sqlstate,
              'message', error_message,
              'details', details,
              'rawDiagnosticPresent',
                row_to_json(post_adoption_questionnaire_reconciliation_attempts)::text
                  like '%sensitive relation%'
            )::text
            from public.post_adoption_questionnaire_reconciliation_attempts
            where id = ${q(sanitizedErrorAttemptId)}::uuid;
            rollback;
          `),
        ),
      ).toEqual({
        sqlstate: "23514",
        message: "Post-adoption questionnaire provisioning failed.",
        details: { errorCategory: "integrity_error" },
        rawDiagnosticPresent: false,
      });

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

      expect(
        Number(
          sql(`
            select count(*)
            from public.post_adoption_questionnaire_instances
            where reservation_id = ${q(historical.journey.id)}::uuid;
          `),
        ),
      ).toBe(0);
      expect(() =>
        sql(`
          update public.reservations
          set adoption_completed_at = adoption_completed_at + interval '1 day'
          where id = ${q(historical.journey.id)}::uuid;
        `),
      ).toThrow(/effective adoption questionnaire anchor/i);
      expect(() =>
        sql(`
          update public.contacts
          set deleted_at = statement_timestamp()
          where id = ${q(historical.contact.id)}::uuid;
        `),
      ).toThrow(/effective adoption questionnaire contact/i);
      expect(() =>
        sql(`
          update public.animals
          set birth_date = birth_date + 1
          where id = ${q(historical.animal.id)}::uuid;
        `),
      ).toThrow(/effective adoption questionnaire animal/i);

      const directInstanceInsert = `
        insert into public.post_adoption_questionnaire_instances (
          organization_id,
          questionnaire_code,
          questionnaire_version,
          contact_id,
          reservation_id,
          animal_id,
          due_at,
          status,
          created_by,
          updated_by
        )
        select
          reservation.organization_id,
          definition.code,
          definition.version,
          reservation.contact_id,
          reservation.id,
          reservation.animal_id,
          reservation.adoption_completed_at + definition.anchor_offset,
          'planned',
          ${q(ownerId)}::uuid,
          ${q(ownerId)}::uuid
        from public.reservations reservation
        join public.post_adoption_questionnaire_definitions definition
          on definition.code = 'post-adoption-t1'
         and definition.version = 1
        where reservation.id = ${q(historical.journey.id)}::uuid;
      `;
      const assertParentContentionIsRetryable = async (
        table: "reservations" | "contacts" | "animals",
        id: string,
      ) => {
        const signal = `post-adoption-parent-lock:${table}`;
        const releaseId = lockReleaseOrganizationIds[table];
        fixtures.register("organizations", releaseId);
        const holder = runE2eSql(`
          begin;
          set local application_name = ${q(signal)};
          select 1 from public.${table} where id = ${q(id)}::uuid for update;
          select pg_advisory_xact_lock(hashtextextended(${q(signal)}, 0));
          do $lock_wait$
          declare
            deadline timestamptz := clock_timestamp() + interval '120 seconds';
          begin
            while not exists (
              select 1 from public.organizations
              where id = ${q(releaseId)}::uuid
            ) loop
              if clock_timestamp() >= deadline then
                raise exception 'timed out waiting for E2E lock release';
              end if;
              perform pg_sleep(0.05);
            end loop;
          end
          $lock_wait$;
          rollback;
        `);
        try {
          await waitForAdvisorySignal(signal);
          await expect(runE2eSql(directInstanceInsert)).rejects.toThrow(
            /could not obtain lock|55P03/i,
          );
        } finally {
          await releaseLockHolder(releaseId, holder);
        }
      };

      await assertParentContentionIsRetryable(
        "reservations",
        historical.journey.id,
      );
      await assertParentContentionIsRetryable("contacts", historical.contact.id);
      await assertParentContentionIsRetryable("animals", historical.animal.id);

      const assertAdoptionLockRejectsParentMutation = async (
        label: string,
        releaseId: string,
        mutation: string,
      ) => {
        fixtures.register("organizations", releaseId);
        const holder = runE2eSql(`
          begin;
          set local application_name = ${q(label)};
          select 1
          from public.reservations
          where id = ${q(future.journey.id)}::uuid
          for no key update;
          select pg_advisory_xact_lock(hashtextextended(${q(label)}, 0));
          do $lock_wait$
          declare
            deadline timestamptz := clock_timestamp() + interval '120 seconds';
          begin
            while not exists (
              select 1 from public.organizations
              where id = ${q(releaseId)}::uuid
            ) loop
              if clock_timestamp() >= deadline then
                raise exception 'timed out waiting for E2E lock release';
              end if;
              perform pg_sleep(0.05);
            end loop;
          end
          $lock_wait$;
          rollback;
        `);
        try {
          await waitForAdvisorySignal(label);
          await expect(
            runE2eSql(`begin; ${mutation}; rollback;`),
          ).rejects.toThrow(/could not obtain lock|55P03/i);
        } finally {
          await releaseLockHolder(releaseId, holder);
        }
      };

      await assertAdoptionLockRejectsParentMutation(
        "post-adoption-contact-versus-adoption",
        lockReleaseOrganizationIds.contactAdoption,
        `update public.contacts
         set deleted_at = statement_timestamp()
         where id = ${q(future.contact.id)}::uuid`,
      );
      await assertAdoptionLockRejectsParentMutation(
        "post-adoption-animal-versus-adoption",
        lockReleaseOrganizationIds.animalAdoption,
        `update public.animals
         set breed = 'Temporary incompatible breed'
         where id = ${q(future.animal.id)}::uuid`,
      );

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
      const distinctCommandResults = (await Promise.all([
        runE2eSql(concurrentSql(commandIds.concurrentA)),
        runE2eSql(concurrentSql(commandIds.concurrentB)),
      ])).map((output) => JSON.parse(parseJsonSqlOutput(output)));
      expect(distinctCommandResults).toEqual([
        expect.objectContaining({ outcome: "success", replayed: false }),
        expect.objectContaining({ outcome: "success", replayed: false }),
      ]);

      const sameCommandResults = (await Promise.all([
        runE2eSql(concurrentSql(commandIds.concurrentReplay)),
        runE2eSql(concurrentSql(commandIds.concurrentReplay)),
      ])).map((output) => JSON.parse(parseJsonSqlOutput(output)));
      expect(sameCommandResults).toEqual([
        expect.objectContaining({ outcome: "success" }),
        expect.objectContaining({ outcome: "success" }),
      ]);
      expect(
        sameCommandResults
          .map((result) => result.replayed as boolean)
          .sort((left, right) => Number(left) - Number(right)),
      ).toEqual([false, true]);
      expect(
        JSON.parse(
          sql(`
            select json_build_object(
              'runs', (
                select count(*)
                from public.post_adoption_questionnaire_reconciliation_runs
                where organization_id = ${q(organizationId)}::uuid
                  and client_command_id = ${q(commandIds.concurrentReplay)}::uuid
              ),
              'results', (
                select count(*)
                from public.post_adoption_questionnaire_reconciliation_run_results result
                join public.post_adoption_questionnaire_reconciliation_runs run
                  on run.organization_id = result.organization_id
                 and run.id = result.run_id
                where run.organization_id = ${q(organizationId)}::uuid
                  and run.client_command_id = ${q(commandIds.concurrentReplay)}::uuid
              )
            )::text;
          `),
        ),
      ).toEqual({ runs: 1, results: 1 });

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
          `),
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
