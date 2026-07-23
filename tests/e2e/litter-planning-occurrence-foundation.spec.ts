import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  getLitterCareTaskWindowState,
  reapplyLitterCareTaskScheduleSuggestionCore,
  replaceLockedLitterCareTaskPointScheduleCore,
  replaceLockedLitterCareTaskWindowScheduleCore,
  rescheduleLitterCareTaskPointCore,
  rescheduleLitterCareTaskWindowCore,
  setLitterCareTaskScheduleLockCore,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9f230001-0000-4000-8000-0000000000";
const labelPrefix = "E2E_OCCURRENCE_FOUNDATION_20260723";

const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  foreignOrganization: `${prefix}03`,
  foreignMother: `${prefix}04`,
  foreignLitter: `${prefix}05`,
  point: `${prefix}10`,
  window: `${prefix}11`,
  milestone: `${prefix}12`,
  recurring: `${prefix}13`,
  terminal: `${prefix}14`,
  templatePoint: `${prefix}15`,
  foreignPoint: `${prefix}16`,
  validTimedPoint: `${prefix}17`,
  backfillTemplate: `${prefix}18`,
  admin: `${prefix}20`,
  member: `${prefix}21`,
  viewer: `${prefix}22`,
  inactive: `${prefix}23`,
  adminIdentity: `${prefix}30`,
  memberIdentity: `${prefix}31`,
  viewerIdentity: `${prefix}32`,
  inactiveIdentity: `${prefix}33`,
  adminMembership: `${prefix}40`,
  memberMembership: `${prefix}41`,
  viewerMembership: `${prefix}42`,
  inactiveMembership: `${prefix}43`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    drop trigger if exists e2e_litter_schedule_history_failure
      on public.litter_care_task_schedule_changes;
    drop function if exists public.e2e_raise_litter_schedule_history_error();

    delete from public.litter_care_task_schedule_changes
    where task_id::text like '9f230001-%'
       or changed_by::text like '9f230001-%';

    delete from public.litter_care_task_schedule_commands
    where task_id::text like '9f230001-%'
       or client_command_id::text like '9f230001-%'
       or created_by::text like '9f230001-%';

    delete from public.litter_care_tasks
    where id::text like '9f230001-%'
       or litter_id::text like '9f230001-%'
       or creation_command_id::text like '9f230001-%'
       or resolution_command_id::text like '9f230001-%';

    delete from public.litters
    where id::text like '9f230001-%'
       or name like ${q(`${labelPrefix}%`)};

    delete from public.animals where id::text like '9f230001-%';
    delete from public.memberships where id::text like '9f230001-%';
    delete from auth.identities where user_id::text like '9f230001-%';
    delete from auth.users where id::text like '9f230001-%';
    delete from public.organizations
    where id::text like '9f230001-%'
       or slug like 'e2e-occurrence-foundation-%';
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'changes', (
          select count(*) from public.litter_care_task_schedule_changes
          where task_id::text like '9f230001-%'
             or changed_by::text like '9f230001-%'
        ),
        'commands', (
          select count(*) from public.litter_care_task_schedule_commands
          where task_id::text like '9f230001-%'
             or client_command_id::text like '9f230001-%'
             or created_by::text like '9f230001-%'
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where id::text like '9f230001-%'
             or litter_id::text like '9f230001-%'
             or creation_command_id::text like '9f230001-%'
             or resolution_command_id::text like '9f230001-%'
        ),
        'litters', (
          select count(*) from public.litters
          where id::text like '9f230001-%'
             or name like ${q(`${labelPrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals where id::text like '9f230001-%'
        ),
        'memberships', (
          select count(*) from public.memberships where id::text like '9f230001-%'
        ),
        'profiles', (
          select count(*) from public.profiles where id::text like '9f230001-%'
        ),
        'auth_identities', (
          select count(*) from auth.identities where user_id::text like '9f230001-%'
        ),
        'auth_users', (
          select count(*) from auth.users where id::text like '9f230001-%'
        ),
        'organizations', (
          select count(*) from public.organizations
          where id::text like '9f230001-%'
             or slug like 'e2e-occurrence-foundation-%'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanup() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function authUserSql(
  userId: string,
  identityId: string,
  email: string,
) {
  return `
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(userId)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', ${q(email)},
      extensions.crypt('OccurrenceE2E-2026!', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Occurrence E2E"}'::jsonb, now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
      jsonb_build_object(
        'sub', ${q(userId)}, 'email', ${q(email)},
        'email_verified', true, 'phone_verified', false
      ),
      'email', now(), now()
    );
  `;
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(ids.foreignOrganization)}::uuid,
      '${labelPrefix} foreign',
      'e2e-occurrence-foundation-foreign'
    );

    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, created_by, updated_by
    ) values
      (
        ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
        '${labelPrefix} mother', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignMother)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        '${labelPrefix} foreign mother', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id,
      status, created_by, updated_by
    ) values
      (
        ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid,
        '${labelPrefix} litter', 'dog', 'Golden Retriever',
        ${q(ids.mother)}::uuid, 'birth_expected',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrganization)}::uuid,
        '${labelPrefix} foreign litter', 'dog', 'Golden Retriever',
        ${q(ids.foreignMother)}::uuid, 'birth_expected',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    ${authUserSql(ids.admin, ids.adminIdentity, "occurrence-admin@saasphase1.invalid")}
    ${authUserSql(ids.member, ids.memberIdentity, "occurrence-member@saasphase1.invalid")}
    ${authUserSql(ids.viewer, ids.viewerIdentity, "occurrence-viewer@saasphase1.invalid")}
    ${authUserSql(ids.inactive, ids.inactiveIdentity, "occurrence-inactive@saasphase1.invalid")}

    insert into public.memberships (
      id, organization_id, profile_id, role, status,
      created_by, updated_by, created_at, updated_at
    ) values
      (
        ${q(ids.adminMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.admin)}::uuid, 'admin', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now(), now()
      ),
      (
        ${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.member)}::uuid, 'member', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now(), now()
      ),
      (
        ${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.viewer)}::uuid, 'viewer', 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now(), now()
      ),
      (
        ${q(ids.inactiveMembership)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.inactive)}::uuid, 'member', 'disabled',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now(), now()
      );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, planned_for, status, creation_command_id,
      created_by, updated_by
    ) values (
      ${q(ids.point)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
      'manual', 1, 'preparation', 'litter', '${labelPrefix} point',
      '2026-08-01', 'planned', ${q(`${prefix}60`)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, system_template_code,
      occurrence_no, category, target_scope, title, anchor_type, anchor_date,
      offset_days, planned_for, status, creation_command_id,
      created_by, updated_by
    ) values (
      ${q(ids.backfillTemplate)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.litter)}::uuid, 'system_template', 'e2e-backfill-template', 1,
      'preparation', 'litter', '${labelPrefix} backfill template',
      'expected_birth', '2026-08-01', 6, '2026-08-07', 'planned',
      ${q(`${prefix}68`)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, planned_for, status, creation_command_id,
      created_by, updated_by
    ) values (
      ${q(ids.foreignPoint)}::uuid, ${q(ids.foreignOrganization)}::uuid,
      ${q(ids.foreignLitter)}::uuid, 'manual', 1, 'preparation', 'litter',
      '${labelPrefix} foreign point', '2026-08-01', 'planned',
      ${q(`${prefix}67`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, item_kind,
      suggested_starts_on, suggested_starts_local_time,
      suggested_ends_on, suggested_ends_local_time,
      retained_starts_on, retained_ends_on, planned_for, status,
      schedule_timezone_name, creation_command_id, created_by, updated_by
    ) values (
      ${q(ids.window)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
      'manual', 1, 'preparation', 'litter', '${labelPrefix} window', 'window',
      '2026-08-02', '08:00', '2026-08-04', '18:00',
      '2026-08-02', '2026-08-04', null, 'planned', 'Europe/Paris',
      ${q(`${prefix}61`)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, item_kind, priority, planned_for, status,
      creation_command_id, created_by, updated_by
    ) values
      (
        ${q(ids.milestone)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
        'manual', 1, 'preparation', 'litter', '${labelPrefix} milestone',
        'milestone', 'important', '2026-08-03', 'planned',
        ${q(`${prefix}62`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.recurring)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
        'manual', 2, 'preparation', 'litter', '${labelPrefix} recurring',
        'recurring_task', 'organization_critical', '2026-08-04', 'planned',
        ${q(`${prefix}63`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, system_template_code,
      occurrence_no, category, target_scope, title, anchor_type, anchor_date,
      offset_days, planned_for, suggested_local_time, schedule_timezone_name,
      status, creation_command_id,
      created_by, updated_by
    ) values (
      ${q(ids.templatePoint)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
      'system_template', 'e2e-occurrence-template', 1, 'preparation', 'litter',
      '${labelPrefix} suggested', 'expected_birth', '2026-08-01', 5,
      '2026-08-06', '08:00', 'Europe/Paris', 'planned',
      ${q(`${prefix}64`)}::uuid,
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, category,
      target_scope, title, planned_for, status, creation_command_id,
      resolution_command_id, resolved_at, resolved_timezone_name,
      resolved_by, resolution_note, created_by, updated_by
    ) values (
      ${q(ids.terminal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid,
      'manual', 1, 'preparation', 'litter', '${labelPrefix} terminal',
      '2026-08-01', 'done', ${q(`${prefix}65`)}::uuid,
      ${q(`${prefix}66`)}::uuid, '2026-08-01T08:00:00Z', 'Europe/Paris',
      ${q(ownerId)}::uuid, 'État historique préservé',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );
  `);
}

function verifyConservativeBackfill() {
  sql(`
    update public.litter_care_tasks
    set
      item_kind = 'milestone',
      priority = 'important',
      suggested_for = planned_for,
      schedule_source = 'suggested',
      revision_no = 7
    where id in (
      ${q(ids.terminal)}::uuid,
      ${q(ids.backfillTemplate)}::uuid
    );

    create temporary table e2e_occurrence_backfill_snapshot on commit drop as
    select
      id,
      to_jsonb(task) - array[
        'item_kind', 'priority', 'suggested_for', 'suggested_local_time',
        'scheduled_local_time', 'schedule_timezone_name',
        'suggested_starts_on', 'suggested_starts_local_time',
        'suggested_ends_on', 'suggested_ends_local_time',
        'retained_starts_on', 'retained_starts_local_time',
        'retained_ends_on', 'retained_ends_local_time',
        'schedule_source', 'is_schedule_locked', 'schedule_locked_at',
        'schedule_locked_by', 'revision_no'
      ] as legacy_values
    from public.litter_care_tasks task
    where id in (
      ${q(ids.terminal)}::uuid,
      ${q(ids.backfillTemplate)}::uuid
    );

    alter table public.litter_care_tasks
      disable trigger litter_care_tasks_set_updated_at;

    update public.litter_care_tasks
    set
      item_kind = 'task',
      priority = 'normal',
      suggested_for = case when source = 'manual' then null else planned_for end,
      suggested_local_time = null,
      scheduled_local_time = null,
      schedule_timezone_name = null,
      suggested_starts_on = null,
      suggested_starts_local_time = null,
      suggested_ends_on = null,
      suggested_ends_local_time = null,
      retained_starts_on = null,
      retained_starts_local_time = null,
      retained_ends_on = null,
      retained_ends_local_time = null,
      schedule_source = case when source = 'manual' then 'manual' else 'suggested' end,
      is_schedule_locked = false,
      schedule_locked_at = null,
      schedule_locked_by = null,
      revision_no = 0
    where id in (
      ${q(ids.terminal)}::uuid,
      ${q(ids.backfillTemplate)}::uuid
    );

    alter table public.litter_care_tasks
      enable trigger litter_care_tasks_set_updated_at;

    do $$
    begin
      if exists (
        select 1
        from public.litter_care_tasks task
        join e2e_occurrence_backfill_snapshot snapshot using (id)
        where snapshot.legacy_values is distinct from (
          to_jsonb(task) - array[
            'item_kind', 'priority', 'suggested_for', 'suggested_local_time',
            'scheduled_local_time', 'schedule_timezone_name',
            'suggested_starts_on', 'suggested_starts_local_time',
            'suggested_ends_on', 'suggested_ends_local_time',
            'retained_starts_on', 'retained_starts_local_time',
            'retained_ends_on', 'retained_ends_local_time',
            'schedule_source', 'is_schedule_locked', 'schedule_locked_at',
            'schedule_locked_by', 'revision_no'
          ]
        )
      ) then
        raise exception 'legacy litter care task values changed during backfill';
      end if;

      if exists (
        select 1
        from public.litter_care_tasks task
        where task.id in (
          ${q(ids.terminal)}::uuid,
          ${q(ids.backfillTemplate)}::uuid
        )
          and (
            task.item_kind <> 'task'
            or task.priority <> 'normal'
            or task.revision_no <> 0
            or (
              task.source = 'manual'
              and (
                task.suggested_for is not null
                or task.schedule_source <> 'manual'
              )
            )
            or (
              task.source <> 'manual'
              and (
                task.suggested_for is distinct from task.planned_for
                or task.schedule_source <> 'suggested'
              )
            )
          )
      ) then
        raise exception 'litter care task schedule backfill is invalid';
      end if;
    end;
    $$;
  `);
}

async function authenticated(email: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signIn = await client.auth.signInWithPassword({
    email,
    password: "OccurrenceE2E-2026!",
  });
  expect(signIn.error).toBeNull();
  return client;
}

function command(suffix: string) {
  return `${prefix}${suffix}`;
}

test("fonde les occurrences et leur historique de planification", async () => {
  cleanup();
  expectCleanup();

  try {
    createFixtures();
    verifyConservativeBackfill();
    const owner = await createAuthenticatedSupabaseClient();
    const admin = await authenticated("occurrence-admin@saasphase1.invalid");
    const member = await authenticated("occurrence-member@saasphase1.invalid");
    const viewer = await authenticated("occurrence-viewer@saasphase1.invalid");
    const inactive = await authenticated("occurrence-inactive@saasphase1.invalid");

    const defaults = JSON.parse(
      sql(`
        select json_build_object(
          'manual_kind', (select item_kind from public.litter_care_tasks where id = ${q(ids.point)}::uuid),
          'manual_priority', (select priority from public.litter_care_tasks where id = ${q(ids.point)}::uuid),
          'manual_source', (select schedule_source from public.litter_care_tasks where id = ${q(ids.point)}::uuid),
          'manual_suggestion', (select suggested_for from public.litter_care_tasks where id = ${q(ids.point)}::uuid),
          'template_source', (select schedule_source from public.litter_care_tasks where id = ${q(ids.templatePoint)}::uuid),
          'template_suggestion', (select suggested_for::text from public.litter_care_tasks where id = ${q(ids.templatePoint)}::uuid),
          'revision', (select revision_no from public.litter_care_tasks where id = ${q(ids.point)}::uuid)
        )::text;
      `),
    );
    expect(defaults).toEqual({
      manual_kind: "task",
      manual_priority: "normal",
      manual_source: "manual",
      manual_suggestion: null,
      template_source: "suggested",
      template_suggestion: "2026-08-06",
      revision: 0,
    });

    expect(
      getLitterCareTaskWindowState(
        {
          itemKind: "window",
          status: "planned",
          retainedStartsOn: "2026-08-02",
          retainedStartsLocalTime: null,
          retainedEndsOn: "2026-08-04",
          retainedEndsLocalTime: null,
        },
        { date: "2026-08-03", localTime: "12:00" },
      ),
    ).toBe("open");

    for (const invalidInsert of [
      `insert into public.litter_care_tasks (
        organization_id, litter_id, source, occurrence_no, category, target_scope,
        title, item_kind, planned_for, status, creation_command_id
      ) values (
        ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1,
        'preparation', 'litter', 'invalid window', 'window', '2026-08-01',
        'planned', ${q(command("70"))}::uuid
      );`,
      `insert into public.litter_care_tasks (
        organization_id, litter_id, source, occurrence_no, category, target_scope,
        title, item_kind, retained_starts_on, retained_ends_on, status,
        creation_command_id
      ) values (
        ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1,
        'preparation', 'litter', 'reversed window', 'window',
        '2026-08-05', '2026-08-04', 'planned', ${q(command("71"))}::uuid
      );`,
      `insert into public.litter_care_tasks (
        organization_id, litter_id, source, occurrence_no, category, target_scope,
        title, item_kind, priority, planned_for, status, creation_command_id
      ) values (
        ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1,
        'preparation', 'litter', 'invalid priority', 'task', 'medical_emergency',
        '2026-08-01', 'planned', ${q(command("72"))}::uuid
      );`,
      `insert into public.litter_care_tasks (
        organization_id, litter_id, source, occurrence_no, category, target_scope,
        title, item_kind, planned_for, scheduled_local_time,
        schedule_timezone_name, status, creation_command_id
      ) values (
        ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'manual', 1,
        'preparation', 'litter', 'invalid timezone', 'task', '2026-08-01',
        '08:00', 'Invalid/Timezone', 'planned', ${q(command("73"))}::uuid
      );`,
    ]) {
      expect(() => sql(invalidInsert)).toThrow();
    }

    sql(`
      insert into public.litter_care_tasks (
        id, organization_id, litter_id, source, occurrence_no, category, target_scope,
        title, item_kind, priority, planned_for, scheduled_local_time,
        schedule_timezone_name, status, creation_command_id
      ) values (
        ${q(ids.validTimedPoint)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.litter)}::uuid, 'manual', 1,
        'preparation', 'litter', '${labelPrefix} valid timezone', 'task',
        'normal', '2026-08-08', '08:30', 'Europe/Paris', 'planned',
        ${q(command("74"))}::uuid
      );
    `);

    for (const client of [owner, admin, member]) {
      const taskId =
        client === owner ? ids.point : client === admin ? ids.milestone : ids.recurring;
      const result = await rescheduleLitterCareTaskPointCore(
        {
          taskId,
          clientCommandId:
            client === owner ? command("80") : client === admin ? command("81") : command("82"),
          expectedRevisionNo: 0,
          plannedFor: "2026-08-10",
          scheduledLocalTime: "09:15",
          timezoneName: "Europe/Paris",
          reason: "Report organisationnel",
        },
        client,
      );
      expect(result).toMatchObject({ outcome: "success", revisionNo: 1 });
    }

    expect(
      await rescheduleLitterCareTaskPointCore(
        {
          taskId: ids.templatePoint,
          clientCommandId: command("83"),
          expectedRevisionNo: 0,
          plannedFor: "2026-08-12",
        },
        viewer,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    expect(
      await rescheduleLitterCareTaskPointCore(
        {
          taskId: ids.templatePoint,
          clientCommandId: command("84"),
          expectedRevisionNo: 0,
          plannedFor: "2026-08-12",
        },
        inactive,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });
    expect(
      await rescheduleLitterCareTaskPointCore(
        {
          taskId: ids.foreignPoint,
          clientCommandId: command("95"),
          expectedRevisionNo: 0,
          plannedFor: "2026-08-12",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_found" } });

    const firstWindow = await rescheduleLitterCareTaskWindowCore(
      {
        taskId: ids.window,
        clientCommandId: command("85"),
        expectedRevisionNo: 0,
        retainedStartsOn: "2026-08-06",
        retainedEndsOn: "2026-08-08",
        reason: "Fenêtre retenue",
      },
      owner,
    );
    expect(firstWindow).toMatchObject({ outcome: "success", revisionNo: 1 });
    const replay = await rescheduleLitterCareTaskWindowCore(
      {
        taskId: ids.window,
        clientCommandId: command("85"),
        expectedRevisionNo: 0,
        retainedStartsOn: "2026-08-06",
        retainedEndsOn: "2026-08-08",
        reason: "Fenêtre retenue",
      },
      owner,
    );
    expect(replay).toMatchObject({
      outcome: "success",
      revisionNo: 1,
      replayed: true,
    });
    expect(
      await rescheduleLitterCareTaskWindowCore(
        {
          taskId: ids.window,
          clientCommandId: command("85"),
          expectedRevisionNo: 0,
          retainedStartsOn: "2026-08-07",
          retainedEndsOn: "2026-08-09",
          reason: "Commande conflictuelle",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });

    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'suggested_starts_local_time', suggested_starts_local_time::text,
            'suggested_ends_local_time', suggested_ends_local_time::text,
            'retained_starts_local_time', retained_starts_local_time::text,
            'retained_ends_local_time', retained_ends_local_time::text,
            'timezone_name', schedule_timezone_name,
            'schedule_source', schedule_source
          )::text
          from public.litter_care_tasks
          where id = ${q(ids.window)}::uuid;
        `),
      ),
    ).toEqual({
      suggested_starts_local_time: "08:00:00",
      suggested_ends_local_time: "18:00:00",
      retained_starts_local_time: null,
      retained_ends_local_time: null,
      timezone_name: "Europe/Paris",
      schedule_source: "manual",
    });

    expect(
      await reapplyLitterCareTaskScheduleSuggestionCore(
        {
          taskId: ids.window,
          clientCommandId: command("96"),
          expectedRevisionNo: 1,
          reason: "Retour à la fenêtre suggérée",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "success", revisionNo: 2 });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'retained_starts_on', retained_starts_on::text,
            'retained_starts_local_time', retained_starts_local_time::text,
            'retained_ends_on', retained_ends_on::text,
            'retained_ends_local_time', retained_ends_local_time::text,
            'timezone_name', schedule_timezone_name,
            'schedule_source', schedule_source
          )::text
          from public.litter_care_tasks
          where id = ${q(ids.window)}::uuid;
        `),
      ),
    ).toEqual({
      retained_starts_on: "2026-08-02",
      retained_starts_local_time: "08:00:00",
      retained_ends_on: "2026-08-04",
      retained_ends_local_time: "18:00:00",
      timezone_name: "Europe/Paris",
      schedule_source: "suggested",
    });

    expect(
      await setLitterCareTaskScheduleLockCore(
        {
          taskId: ids.window,
          clientCommandId: command("75"),
          expectedRevisionNo: 2,
          isLocked: true,
          reason: "Fenêtre confirmée",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "success", revisionNo: 3 });
    expect(
      await rescheduleLitterCareTaskWindowCore(
        {
          taskId: ids.window,
          clientCommandId: command("76"),
          expectedRevisionNo: 3,
          retainedStartsOn: "2026-08-09",
          retainedEndsOn: "2026-08-11",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(
      await replaceLockedLitterCareTaskWindowScheduleCore(
        {
          taskId: ids.window,
          clientCommandId: command("77"),
          expectedRevisionNo: 3,
          retainedStartsOn: "2026-08-09",
          retainedEndsOn: "2026-08-11",
          reason: "Remplacement de fenêtre confirmé côté serveur",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "success", revisionNo: 4 });
    expect(
      sql(`
        select is_schedule_locked::text || ':' || retained_starts_on::text
          || ':' || schedule_timezone_name
        from public.litter_care_tasks where id = ${q(ids.window)}::uuid;
      `),
    ).toBe("true:2026-08-09:Europe/Paris");

    expect(
      await rescheduleLitterCareTaskPointCore(
        {
          taskId: ids.templatePoint,
          clientCommandId: command("78"),
          expectedRevisionNo: 0,
          plannedFor: "2026-08-12",
          reason: "Report en journée entière",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "success", revisionNo: 1 });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'suggested_for', suggested_for::text,
            'suggested_local_time', suggested_local_time::text,
            'planned_for', planned_for::text,
            'scheduled_local_time', scheduled_local_time::text,
            'timezone_name', schedule_timezone_name,
            'schedule_source', schedule_source
          )::text
          from public.litter_care_tasks
          where id = ${q(ids.templatePoint)}::uuid;
        `),
      ),
    ).toEqual({
      suggested_for: "2026-08-06",
      suggested_local_time: "08:00:00",
      planned_for: "2026-08-12",
      scheduled_local_time: null,
      timezone_name: "Europe/Paris",
      schedule_source: "manual",
    });
    expect(
      await reapplyLitterCareTaskScheduleSuggestionCore(
        {
          taskId: ids.templatePoint,
          clientCommandId: command("79"),
          expectedRevisionNo: 1,
          reason: "Retour à la suggestion horaire",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "success", revisionNo: 2 });
    expect(
      sql(`
        select planned_for::text || ':' || scheduled_local_time::text
          || ':' || schedule_timezone_name || ':' || schedule_source
        from public.litter_care_tasks
        where id = ${q(ids.templatePoint)}::uuid;
      `),
    ).toBe("2026-08-06:08:00:00:Europe/Paris:suggested");

    const locked = await setLitterCareTaskScheduleLockCore(
      {
        taskId: ids.templatePoint,
        clientCommandId: command("86"),
        expectedRevisionNo: 2,
        isLocked: true,
        reason: "Planning confirmé",
      },
      owner,
    );
    expect(locked).toMatchObject({ outcome: "success", revisionNo: 3 });
    expect(
      await rescheduleLitterCareTaskPointCore(
        {
          taskId: ids.templatePoint,
          clientCommandId: command("87"),
          expectedRevisionNo: 3,
          plannedFor: "2026-08-14",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "conflict" } });
    expect(
      Number(
        sql(`
          select count(*) from public.litter_care_task_schedule_changes change
          join public.litter_care_task_schedule_commands command
            on command.id = change.command_id
          where command.client_command_id = ${q(command("87"))}::uuid;
        `),
      ),
    ).toBe(0);

    const replaced = await replaceLockedLitterCareTaskPointScheduleCore(
      {
        taskId: ids.templatePoint,
        clientCommandId: command("88"),
        expectedRevisionNo: 3,
        plannedFor: "2026-08-14",
        scheduledLocalTime: "10:00",
        timezoneName: "Europe/Paris",
        reason: "Remplacement confirmé côté serveur",
      },
      owner,
    );
    expect(replaced).toMatchObject({ outcome: "success", revisionNo: 4 });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'locked', task.is_schedule_locked,
            'planned_for', task.planned_for::text,
            'override', change.locked_override_confirmed,
            'change_type', change.change_type
          )::text
          from public.litter_care_tasks task
          join public.litter_care_task_schedule_changes change
            on change.task_id = task.id
          where task.id = ${q(ids.templatePoint)}::uuid
            and change.id = ${q(
              replaced.outcome === "success" ? replaced.changeId : ids.point,
            )}::uuid;
        `),
      ),
    ).toEqual({
      locked: true,
      planned_for: "2026-08-14",
      override: true,
      change_type: "replace_locked_point",
    });

    const unlocked = await setLitterCareTaskScheduleLockCore(
      {
        taskId: ids.templatePoint,
        clientCommandId: command("89"),
        expectedRevisionNo: 4,
        isLocked: false,
        reason: "Déverrouillage explicite",
      },
      owner,
    );
    expect(unlocked).toMatchObject({ outcome: "success", revisionNo: 5 });
    const reapplied = await reapplyLitterCareTaskScheduleSuggestionCore(
      {
        taskId: ids.templatePoint,
        clientCommandId: command("90"),
        expectedRevisionNo: 5,
        reason: "Retour à la suggestion",
      },
      owner,
    );
    expect(reapplied).toMatchObject({ outcome: "success", revisionNo: 6 });
    expect(
      sql(`
        select planned_for::text || ':' || scheduled_local_time::text
          || ':' || schedule_timezone_name || ':' || schedule_source
        from public.litter_care_tasks where id = ${q(ids.templatePoint)}::uuid;
      `),
    ).toBe("2026-08-06:08:00:00:Europe/Paris:suggested");

    expect(
      await rescheduleLitterCareTaskPointCore(
        {
          taskId: ids.terminal,
          clientCommandId: command("91"),
          expectedRevisionNo: 0,
          plannedFor: "2026-08-20",
        },
        owner,
      ),
    ).toMatchObject({ outcome: "error", error: { code: "not_planned" } });
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'status', status,
            'planned_for', planned_for::text,
            'resolved_at', resolved_at,
            'resolved_timezone_name', resolved_timezone_name,
            'resolved_by', resolved_by,
            'resolution_note', resolution_note,
            'revision_no', revision_no
          )::text
          from public.litter_care_tasks where id = ${q(ids.terminal)}::uuid;
        `),
      ),
    ).toMatchObject({
      status: "done",
      planned_for: "2026-08-01",
      resolved_timezone_name: "Europe/Paris",
      resolved_by: ownerId,
      resolution_note: "État historique préservé",
      revision_no: 0,
    });

    const concurrentTaskId = ids.point;
    const concurrentRevision = 1;
    const concurrent = await Promise.all([
      rescheduleLitterCareTaskPointCore(
        {
          taskId: concurrentTaskId,
          clientCommandId: command("92"),
          expectedRevisionNo: concurrentRevision,
          plannedFor: "2026-08-21",
        },
        owner,
      ),
      rescheduleLitterCareTaskPointCore(
        {
          taskId: concurrentTaskId,
          clientCommandId: command("93"),
          expectedRevisionNo: concurrentRevision,
          plannedFor: "2026-08-22",
        },
        await createAuthenticatedSupabaseClient(),
      ),
    ]);
    expect(concurrent.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(
      concurrent.filter(
        (result) =>
          result.outcome === "error" && result.error.code === "stale_revision",
      ),
    ).toHaveLength(1);
    expect(
      sql(`
        select (scheduled_local_time is null)::text || ':'
          || (schedule_timezone_name is null)::text
        from public.litter_care_tasks
        where id = ${q(concurrentTaskId)}::uuid;
      `),
    ).toBe("true:true");

    const schemaAssertions = JSON.parse(
      sql(`
        select json_build_object(
          'snapshot_volatility', (
            select procedure.provolatile
            from pg_catalog.pg_proc procedure
            join pg_catalog.pg_namespace namespace
              on namespace.oid = procedure.pronamespace
            where namespace.nspname = 'public'
              and procedure.proname = 'litter_care_task_schedule_snapshot'
              and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
                = 'p_task litter_care_tasks'
          ),
          'revision_check', (
            select pg_catalog.pg_get_constraintdef(constraint_row.oid)
            from pg_catalog.pg_constraint constraint_row
            where constraint_row.conname
              = 'litter_care_task_schedule_changes_revision_check'
          ),
          'has_catch_all', position(
            'exception when others' in lower(
              pg_catalog.pg_get_functiondef(
                'public.execute_litter_care_task_schedule_command(
                  uuid, uuid, integer, text, date, time without time zone,
                  date, time without time zone, date, time without time zone,
                  text, text
                )'::regprocedure
              )
            )
          ) > 0
        )::text;
      `),
    );
    expect(schemaAssertions.snapshot_volatility).toBe("s");
    expect(schemaAssertions.revision_check).toContain(
      "expected_revision_no = previous_revision_no",
    );
    expect(schemaAssertions.has_catch_all).toBe(false);

    sql(`
      create function public.e2e_raise_litter_schedule_history_error()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'forced E2E schedule history failure'
          using errcode = 'XX999';
      end;
      $$;

      create trigger e2e_litter_schedule_history_failure
      before insert on public.litter_care_task_schedule_changes
      for each row
      execute function public.e2e_raise_litter_schedule_history_error();
    `);
    const technicalFailure = await rescheduleLitterCareTaskPointCore(
      {
        taskId: ids.validTimedPoint,
        clientCommandId: command("97"),
        expectedRevisionNo: 0,
        plannedFor: "2026-08-23",
      },
      owner,
    );
    expect(technicalFailure).toMatchObject({
      outcome: "error",
      error: { code: "database_error" },
    });
    if (technicalFailure.outcome === "error") {
      expect(technicalFailure.error.code).not.toBe("invalid_input");
      expect(technicalFailure.error.message).not.toContain(
        "forced E2E schedule history failure",
      );
    }
    sql(`
      drop trigger e2e_litter_schedule_history_failure
        on public.litter_care_task_schedule_changes;
      drop function public.e2e_raise_litter_schedule_history_error();
    `);
    expect(
      JSON.parse(
        sql(`
          select json_build_object(
            'revision_no', (
              select revision_no
              from public.litter_care_tasks
              where id = ${q(ids.validTimedPoint)}::uuid
            ),
            'commands', (
              select count(*)
              from public.litter_care_task_schedule_commands
              where client_command_id = ${q(command("97"))}::uuid
            ),
            'changes', (
              select count(*)
              from public.litter_care_task_schedule_changes change
              join public.litter_care_task_schedule_commands command_row
                on command_row.id = change.command_id
              where command_row.client_command_id = ${q(command("97"))}::uuid
            )
          )::text;
        `),
      ),
    ).toEqual({ revision_no: 0, commands: 0, changes: 0 });

    const grants = JSON.parse(
      sql(`
        select json_build_object(
          'commands_select', has_table_privilege(
            'authenticated', 'public.litter_care_task_schedule_commands', 'select'
          ),
          'commands_insert', has_table_privilege(
            'authenticated', 'public.litter_care_task_schedule_commands', 'insert'
          ),
          'changes_select', has_table_privilege(
            'authenticated', 'public.litter_care_task_schedule_changes', 'select'
          ),
          'changes_update', has_table_privilege(
            'authenticated', 'public.litter_care_task_schedule_changes', 'update'
          )
        )::text;
      `),
    );
    expect(grants).toEqual({
      commands_select: false,
      commands_insert: false,
      changes_select: false,
      changes_update: false,
    });

    const historicalRows = JSON.parse(
      sql(`
        select json_build_object(
          'successful_commands', (
            select count(*) from public.litter_care_task_schedule_commands
            where task_id::text like '9f230001-%' and outcome = 'success'
          ),
          'successful_changes', (
            select count(*) from public.litter_care_task_schedule_changes
            where task_id::text like '9f230001-%'
          ),
          'refused_commands', (
            select count(*) from public.litter_care_task_schedule_commands
            where task_id::text like '9f230001-%' and outcome = 'error'
          )
        )::text;
      `),
    );
    expect(historicalRows.successful_commands).toBe(
      historicalRows.successful_changes,
    );
    expect(historicalRows.refused_commands).toBeGreaterThan(0);
  } finally {
    cleanup();
    expectCleanup();
  }
});
