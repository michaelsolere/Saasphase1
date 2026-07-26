import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { localCivilDateTimeToUtcIso } from "../../src/lib/timezone";
import { projectCalendarReminder } from "../../src/features/breeding-calendar/calendar-reminder-projection";
import type { Database } from "../../src/types/database.types";
import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
/** Dedicated REMINDER-FOUNDATION-01 fixture prefix. */
const prefix = "9f260013-0000-4000-8000-000000000";
const otherOrganizationId = `${prefix}090`;
const fixturePrefix = "9f260013-%";
const TZ = "Europe/Paris";

const users = {
  admin: {
    id: `${prefix}010`,
    identityId: `${prefix}011`,
    membershipId: `${prefix}012`,
    email: "calendar-reminder-admin@saasphase1.invalid",
    password: "CalendarReminderAdmin-2026!",
    role: "admin",
  },
  member: {
    id: `${prefix}020`,
    identityId: `${prefix}021`,
    membershipId: `${prefix}022`,
    email: "calendar-reminder-member@saasphase1.invalid",
    password: "CalendarReminderMember-2026!",
    role: "member",
  },
  viewer: {
    id: `${prefix}030`,
    identityId: `${prefix}031`,
    membershipId: `${prefix}032`,
    email: "calendar-reminder-viewer@saasphase1.invalid",
    password: "CalendarReminderViewer-2026!",
    role: "viewer",
  },
  foreignOwner: {
    id: `${prefix}040`,
    identityId: `${prefix}041`,
    membershipId: `${prefix}042`,
    email: "calendar-reminder-foreign@saasphase1.invalid",
    password: "CalendarReminderForeign-2026!",
    role: "admin",
  },
} as const;

const ids = {
  mother: `${prefix}100`,
  litter: `${prefix}101`,
  plannedTask: `${prefix}102`,
  doneTask: `${prefix}103`,
  cycleMother: `${prefix}110`,
  plannedCycle: `${prefix}111`,
  matedMother: `${prefix}112`,
  matedCycle: `${prefix}113`,
  contact: `${prefix}120`,
  reservation: `${prefix}121`,
  plannedEvent: `${prefix}122`,
  doneEvent: `${prefix}123`,
  dstAmbiguousTask: `${prefix}130`,
  dstGapTask: `${prefix}131`,
  foreignMother: `${prefix}200`,
  foreignLitter: `${prefix}201`,
  foreignTask: `${prefix}202`,
  foreignCycleMother: `${prefix}203`,
  foreignCycle: `${prefix}204`,
  foreignContact: `${prefix}205`,
  foreignReservation: `${prefix}206`,
  foreignEvent: `${prefix}207`,
  missingSource: `${prefix}299`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function expectSqlFailure(statement: string, expected: RegExp) {
  expect(() => sql(statement)).toThrow(expected);
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    delete from public.calendar_reminder_commands
    where organization_id in (${q(organizationId)}::uuid, ${q(otherOrganizationId)}::uuid)
       or id::text like ${q(fixturePrefix)}
       or client_command_id::text like ${q(fixturePrefix)};
    delete from public.calendar_reminders
    where organization_id in (${q(organizationId)}::uuid, ${q(otherOrganizationId)}::uuid)
       or id::text like ${q(fixturePrefix)}
       or litter_care_task_id::text like ${q(fixturePrefix)}
       or reproductive_cycle_id::text like ${q(fixturePrefix)}
       or adopter_event_id::text like ${q(fixturePrefix)};
    delete from public.events
    where id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.reservations
    where id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.contacts
    where id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.litter_care_tasks
    where id::text like ${q(fixturePrefix)}
       or litter_id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.reproductive_cycles
    where id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.litters
    where id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.animals
    where id::text like ${q(fixturePrefix)}
       or organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.memberships where id::text like ${q(fixturePrefix)};
    delete from auth.identities where user_id::text like ${q(fixturePrefix)};
    delete from auth.users where id::text like ${q(fixturePrefix)};
    delete from public.profiles where id::text like ${q(fixturePrefix)};
    delete from public.organizations where id = ${q(otherOrganizationId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'reminders', (
          select count(*) from public.calendar_reminders
          where organization_id in (${q(organizationId)}::uuid, ${q(otherOrganizationId)}::uuid)
             or id::text like ${q(fixturePrefix)}
             or litter_care_task_id::text like ${q(fixturePrefix)}
             or reproductive_cycle_id::text like ${q(fixturePrefix)}
             or adopter_event_id::text like ${q(fixturePrefix)}
        ),
        'commands', (
          select count(*) from public.calendar_reminder_commands
          where organization_id in (${q(organizationId)}::uuid, ${q(otherOrganizationId)}::uuid)
             or id::text like ${q(fixturePrefix)}
             or client_command_id::text like ${q(fixturePrefix)}
        ),
        'events', (
          select count(*) from public.events
          where id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'reservations', (
          select count(*) from public.reservations
          where id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'contacts', (
          select count(*) from public.contacts
          where id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'tasks', (
          select count(*) from public.litter_care_tasks
          where id::text like ${q(fixturePrefix)}
             or litter_id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'cycles', (
          select count(*) from public.reproductive_cycles
          where id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'litters', (
          select count(*) from public.litters
          where id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'animals', (
          select count(*) from public.animals
          where id::text like ${q(fixturePrefix)}
             or organization_id = ${q(otherOrganizationId)}::uuid
        ),
        'memberships', (select count(*) from public.memberships where id::text like ${q(fixturePrefix)}),
        'profiles', (select count(*) from public.profiles where id::text like ${q(fixturePrefix)}),
        'auth_identities', (select count(*) from auth.identities where user_id::text like ${q(fixturePrefix)}),
        'auth_users', (select count(*) from auth.users where id::text like ${q(fixturePrefix)}),
        'organizations', (
          select count(*) from public.organizations where id = ${q(otherOrganizationId)}::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createRoleFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (
      ${q(otherOrganizationId)}::uuid,
      'Organisation E2E calendar reminders isolée',
      'e2e-calendar-reminders-isolee'
    );
  `);

  for (const user of Object.values(users)) {
    const orgId =
      user.id === users.foreignOwner.id ? otherOrganizationId : organizationId;
    sql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, phone_change,
        phone_change_token, email_change_token_current,
        reauthentication_token, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        ${q(user.id)}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', ${q(user.email)},
        extensions.crypt(${q(user.password)}, extensions.gen_salt('bf')),
        now(), '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', ${q(`Calendar reminder ${user.role}`)}),
        now(), now()
      );

      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, created_at, updated_at
      ) values (
        ${q(user.identityId)}::uuid, ${q(user.email)}, ${q(user.id)}::uuid,
        jsonb_build_object(
          'sub', ${q(user.id)}, 'email', ${q(user.email)},
          'email_verified', true, 'phone_verified', false
        ),
        'email', now(), now()
      );

      insert into public.memberships (
        id, organization_id, profile_id, role, status, created_by, updated_by
      ) values (
        ${q(user.membershipId)}::uuid, ${q(orgId)}::uuid,
        ${q(user.id)}::uuid, ${q(user.role)}, 'active',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);
  }
}

function createSourceFixtures() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex,
      status, ownership_status, is_breeder, created_by, updated_by
    ) values
      (
        ${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
        'Mère rappels E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.cycleMother)}::uuid, ${q(organizationId)}::uuid,
        'Mère cycle prévu E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.matedMother)}::uuid, ${q(organizationId)}::uuid,
        'Mère cycle mated E2E', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignMother)}::uuid, ${q(otherOrganizationId)}::uuid,
        'Mère étrangère rappels', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignCycleMother)}::uuid, ${q(otherOrganizationId)}::uuid,
        'Mère cycle étrangère', 'dog', 'Golden Retriever', 'female',
        'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status,
      created_by, updated_by
    ) values
      (
        ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid,
        'E2E rappels portée', 'dog', 'Golden Retriever',
        ${q(ids.mother)}::uuid, 'birth_expected',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignLitter)}::uuid, ${q(otherOrganizationId)}::uuid,
        'E2E rappels portée étrangère', 'dog', 'Golden Retriever',
        ${q(ids.foreignMother)}::uuid, 'birth_expected',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.litter_care_tasks (
      id, organization_id, litter_id, source, occurrence_no, item_kind,
      category, target_scope, title, planned_for, schedule_timezone_name,
      priority, schedule_source, is_schedule_locked, status,
      creation_command_id, created_by, updated_by
    ) values
      (
        ${q(ids.plannedTask)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter',
        'E2E rappel tâche prévue', '2026-09-10'::date, ${q(TZ)},
        'normal', 'suggested', false, 'planned',
        ${q(`${prefix}300`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.doneTask)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter',
        'E2E rappel tâche done', '2026-09-12'::date, ${q(TZ)},
        'normal', 'suggested', false, 'planned',
        ${q(`${prefix}301`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignTask)}::uuid, ${q(otherOrganizationId)}::uuid,
        ${q(ids.foreignLitter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter',
        'E2E rappel tâche étrangère', '2026-09-10'::date, ${q(TZ)},
        'normal', 'suggested', false, 'planned',
        ${q(`${prefix}302`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.dstAmbiguousTask)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter',
        'E2E rappel DST ambigu', '2026-10-25'::date, ${q(TZ)},
        'normal', 'suggested', false, 'planned',
        ${q(`${prefix}304`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.dstGapTask)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.litter)}::uuid, 'manual', 1, 'task', 'veterinary', 'litter',
        'E2E rappel DST trou', '2026-03-29'::date, ${q(TZ)},
        'normal', 'suggested', false, 'planned',
        ${q(`${prefix}305`)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    update public.litter_care_tasks
    set
      status = 'done',
      resolution_command_id = ${q(`${prefix}303`)}::uuid,
      resolved_at = '2026-09-12T10:00:00Z'::timestamptz,
      resolved_timezone_name = ${q(TZ)},
      resolved_by = ${q(ownerId)}::uuid
    where id = ${q(ids.doneTask)}::uuid;

    insert into public.reproductive_cycles (
      id, organization_id, mother_id, species, breed, status, started_on,
      created_by, updated_by
    ) values
      (
        ${q(ids.plannedCycle)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.cycleMother)}::uuid, 'dog', 'Golden Retriever', 'planned',
        '2026-09-15'::date, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.matedCycle)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.matedMother)}::uuid, 'dog', 'Golden Retriever', 'mated',
        '2026-08-01'::date, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignCycle)}::uuid, ${q(otherOrganizationId)}::uuid,
        ${q(ids.foreignCycleMother)}::uuid, 'dog', 'Golden Retriever', 'planned',
        '2026-09-15'::date, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

    insert into public.contacts (id, organization_id, display_name)
    values
      (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Contact rappels E2E'),
      (
        ${q(ids.foreignContact)}::uuid, ${q(otherOrganizationId)}::uuid,
        'Contact rappels étranger'
      );

    insert into public.reservations (
      id, organization_id, contact_id, species, breed, status
    ) values
      (
        ${q(ids.reservation)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever', 'active'
      ),
      (
        ${q(ids.foreignReservation)}::uuid, ${q(otherOrganizationId)}::uuid,
        ${q(ids.foreignContact)}::uuid, 'dog', 'Golden Retriever', 'active'
      );

    insert into public.events (
      id, organization_id, reservation_id, event_type, title, description,
      planned_at, status, priority, is_task, created_by, updated_by
    ) values
      (
        ${q(ids.plannedEvent)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.reservation)}::uuid, 'puppy_choice',
        'Rendez-vous de choix du chiot/chaton', null,
        '2026-09-20T08:00:00Z'::timestamptz, 'planned', 'normal', true,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.doneEvent)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.reservation)}::uuid, 'puppy_choice',
        'Rendez-vous de choix du chiot/chaton', null,
        '2026-09-21T08:00:00Z'::timestamptz, 'done', 'normal', false,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      ),
      (
        ${q(ids.foreignEvent)}::uuid, ${q(otherOrganizationId)}::uuid,
        ${q(ids.foreignReservation)}::uuid, 'puppy_choice',
        'Rendez-vous de choix du chiot/chaton', null,
        '2026-09-20T08:00:00Z'::timestamptz, 'planned', 'normal', true,
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
  `);
}

function sourceSnapshot() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'plannedTask', (
          select json_build_object(
            'planned_for', planned_for::text,
            'status', status,
            'revision_no', revision_no,
            'title', title
          )
          from public.litter_care_tasks where id = ${q(ids.plannedTask)}::uuid
        ),
        'doneTask', (
          select json_build_object(
            'planned_for', planned_for::text,
            'status', status,
            'resolved_at', resolved_at
          )
          from public.litter_care_tasks where id = ${q(ids.doneTask)}::uuid
        ),
        'plannedCycle', (
          select json_build_object(
            'status', status,
            'started_on', started_on::text,
            'updated_at', updated_at
          )
          from public.reproductive_cycles where id = ${q(ids.plannedCycle)}::uuid
        ),
        'matedCycle', (
          select json_build_object(
            'status', status,
            'started_on', started_on::text
          )
          from public.reproductive_cycles where id = ${q(ids.matedCycle)}::uuid
        ),
        'plannedEvent', (
          select json_build_object(
            'status', status,
            'planned_at', planned_at,
            'event_type', event_type
          )
          from public.events where id = ${q(ids.plannedEvent)}::uuid
        ),
        'doneEvent', (
          select json_build_object(
            'status', status,
            'planned_at', planned_at
          )
          from public.events where id = ${q(ids.doneEvent)}::uuid
        )
      )::text;
    `),
  );
}

async function clientFor(email: string, password: string) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return client;
}

function cmd(suffix: string) {
  return `${prefix}${suffix}`;
}

test.beforeEach(() => {
  cleanup();
  expect(remainingCounts().reminders).toBe(0);
  expect(remainingCounts().commands).toBe(0);
  createRoleFixtures();
  createSourceFixtures();
});

test.afterEach(() => {
  cleanup();
  const remaining = remainingCounts();
  for (const [table, count] of Object.entries(remaining)) {
    expect(count, `${table} must be hard-deleted`).toBe(0);
  }
});

test("RPC calendar reminders: rôles, sources, contraintes, ack, soft-delete, RLS", async () => {
  const owner = await createAuthenticatedSupabaseClient();
  const admin = await clientFor(users.admin.email, users.admin.password);
  const member = await clientFor(users.member.email, users.member.password);
  const viewer = await clientFor(users.viewer.email, users.viewer.password);
  const anonymous = createAnonymousSupabaseClient();
  const beforeSources = sourceSnapshot();

  const ownerCreate = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.plannedTask,
    p_days_before: 1,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("400"),
  });
  expect(ownerCreate.error).toBeNull();
  expect(ownerCreate.data?.[0]).toMatchObject({
    outcome: "success",
    reason: null,
    source_type: "litter_care_task",
    source_record_id: ids.plannedTask,
    days_before: 1,
    revision_no: 1,
    replayed: false,
  });
  const ownerReminderId = ownerCreate.data![0].reminder_id!;
  expect(ownerReminderId).toMatch(/^[0-9a-f-]{36}$/i);

  const adminCreate = await admin.rpc("create_calendar_reminder", {
    p_source_type: "reproductive_cycle",
    p_source_record_id: ids.plannedCycle,
    p_days_before: 0,
    p_local_time: "08:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("401"),
  });
  expect(adminCreate.error).toBeNull();
  expect(adminCreate.data?.[0]).toMatchObject({
    outcome: "success",
    source_type: "reproductive_cycle",
    source_record_id: ids.plannedCycle,
    revision_no: 1,
  });

  const memberCreate = await member.rpc("create_calendar_reminder", {
    p_source_type: "adopter_event",
    p_source_record_id: ids.plannedEvent,
    p_days_before: 2,
    p_local_time: "10:30",
    p_timezone_name: TZ,
    p_client_command_id: cmd("402"),
  });
  expect(memberCreate.error).toBeNull();
  expect(memberCreate.data?.[0]).toMatchObject({
    outcome: "success",
    source_type: "adopter_event",
    source_record_id: ids.plannedEvent,
    revision_no: 1,
  });
  const memberReminderId = memberCreate.data![0].reminder_id!;

  const viewerWrite = await viewer.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.plannedTask,
    p_days_before: 3,
    p_local_time: "11:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("403"),
  });
  expect(viewerWrite.error).toBeNull();
  expect(viewerWrite.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "membership_required",
    reminder_id: null,
  });

  const viewerSelect = await viewer
    .from("calendar_reminders")
    .select("id, litter_care_task_id, reproductive_cycle_id, adopter_event_id")
    .is("deleted_at", null);
  expect(viewerSelect.error).toBeNull();
  expect(viewerSelect.data?.length).toBeGreaterThanOrEqual(3);
  expect(
    viewerSelect.data?.some((row) => row.litter_care_task_id === ids.plannedTask),
  ).toBe(true);

  const doneTaskRefuse = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.doneTask,
    p_days_before: 0,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("410"),
  });
  expect(doneTaskRefuse.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_admissible",
  });

  const matedRefuse = await owner.rpc("create_calendar_reminder", {
    p_source_type: "reproductive_cycle",
    p_source_record_id: ids.matedCycle,
    p_days_before: 0,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("411"),
  });
  expect(matedRefuse.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_admissible",
  });

  const doneEventRefuse = await owner.rpc("create_calendar_reminder", {
    p_source_type: "adopter_event",
    p_source_record_id: ids.doneEvent,
    p_days_before: 0,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("412"),
  });
  expect(doneEventRefuse.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_admissible",
  });

  const foreignRefuse = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.foreignTask,
    p_days_before: 0,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("413"),
  });
  expect(foreignRefuse.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_found",
  });

  const missingRefuse = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.missingSource,
    p_days_before: 0,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("414"),
  });
  expect(missingRefuse.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_found",
  });

  expectSqlFailure(
    `
      insert into public.calendar_reminders (
        id, organization_id, days_before, local_time, timezone_name,
        created_by, updated_by
      ) values (
        ${q(`${prefix}500`)}::uuid, ${q(organizationId)}::uuid,
        0, '09:00', ${q(TZ)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `,
    /calendar_reminders_exactly_one_source_check|check constraint/i,
  );

  expectSqlFailure(
    `
      insert into public.calendar_reminders (
        id, organization_id, litter_care_task_id, reproductive_cycle_id,
        days_before, local_time, timezone_name, created_by, updated_by
      ) values (
        ${q(`${prefix}501`)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.plannedTask)}::uuid, ${q(ids.plannedCycle)}::uuid,
        0, '09:00', ${q(TZ)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `,
    /calendar_reminders_exactly_one_source_check|check constraint/i,
  );

  const duplicate = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.plannedTask,
    p_days_before: 1,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("420"),
  });
  expect(duplicate.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "duplicate_reminder",
  });

  const distinctSchedule = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.plannedTask,
    p_days_before: 7,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("421"),
  });
  expect(distinctSchedule.data?.[0]).toMatchObject({
    outcome: "success",
    days_before: 7,
    revision_no: 1,
  });

  const updated = await owner.rpc("update_calendar_reminder", {
    p_reminder_id: ownerReminderId,
    p_expected_revision_no: 1,
    p_days_before: 2,
    p_local_time: "10:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("430"),
  });
  expect(updated.error).toBeNull();
  expect(updated.data?.[0]).toMatchObject({
    outcome: "success",
    days_before: 2,
    revision_no: 2,
    acknowledged_trigger_at: null,
    acknowledged_at: null,
  });

  const stale = await owner.rpc("update_calendar_reminder", {
    p_reminder_id: ownerReminderId,
    p_expected_revision_no: 1,
    p_days_before: 3,
    p_local_time: "11:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("431"),
  });
  expect(stale.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "stale_revision",
  });

  const triggerAt = localCivilDateTimeToUtcIso("2026-09-18", "10:30", TZ)!;
  const ack = await member.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: memberReminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: triggerAt,
    p_client_command_id: cmd("440"),
  });
  expect(ack.error).toBeNull();
  expect(ack.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    replayed: false,
  });
  expect(ack.data?.[0].acknowledged_trigger_at).toBeTruthy();
  expect(ack.data?.[0].acknowledged_by).toBe(users.member.id);

  const ackReplay = await member.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: memberReminderId,
    p_expected_revision_no: 2,
    p_expected_trigger_at: triggerAt,
    p_client_command_id: cmd("441"),
  });
  expect(ackReplay.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    replayed: true,
  });

  const softDeleted = await owner.rpc("delete_calendar_reminder", {
    p_reminder_id: ownerReminderId,
    p_expected_revision_no: 2,
    p_client_command_id: cmd("450"),
  });
  expect(softDeleted.error).toBeNull();
  expect(softDeleted.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 3,
  });
  expect(softDeleted.data?.[0].deleted_at).toBeTruthy();
  expect(softDeleted.data?.[0].deleted_by).toBe(ownerId);

  const softRow = JSON.parse(
    sql(`
      select json_build_object(
        'deleted_at', deleted_at is not null,
        'deleted_by', deleted_by::text,
        'revision_no', revision_no
      )::text
      from public.calendar_reminders
      where id = ${q(ownerReminderId)}::uuid;
    `),
  );
  expect(softRow).toEqual({
    deleted_at: true,
    deleted_by: ownerId,
    revision_no: 3,
  });

  const directInsert = await owner.from("calendar_reminders").insert({
    organization_id: organizationId,
    litter_care_task_id: ids.plannedTask,
    days_before: 5,
    local_time: "12:00",
    timezone_name: TZ,
    created_by: ownerId,
    updated_by: ownerId,
  });
  expect(directInsert.error).not.toBeNull();

  const directUpdate = await owner
    .from("calendar_reminders")
    .update({ days_before: 9 })
    .eq("id", memberReminderId);
  expect(directUpdate.error).not.toBeNull();

  const directDelete = await owner
    .from("calendar_reminders")
    .delete()
    .eq("id", memberReminderId);
  expect(directDelete.error).not.toBeNull();

  const anonRead = await anonymous
    .from("calendar_reminders")
    .select("id")
    .limit(5);
  expect(anonRead.data ?? []).toEqual([]);

  expect(sourceSnapshot()).toEqual(beforeSources);

  // Ensure constraint path used a throw (zero-or-two sources) without leftover rows.
  expect(
    Number(
      sql(`
        select count(*)::text from public.calendar_reminders
        where id in (${q(`${prefix}500`)}::uuid, ${q(`${prefix}501`)}::uuid);
      `),
    ),
  ).toBe(0);
});

test("RPC calendar reminders: IANA, stale_trigger, sauvegarde sans changement", async () => {
  const owner = await createAuthenticatedSupabaseClient();
  const beforeSources = sourceSnapshot();

  const invalidCreate = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.plannedTask,
    p_days_before: 1,
    p_local_time: "08:00",
    p_timezone_name: "Mars/Phobos",
    p_client_command_id: cmd("600"),
  });
  expect(invalidCreate.error).toBeNull();
  expect(invalidCreate.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "invalid_input",
    reminder_id: null,
  });
  expect(
    Number(
      sql(`
        select count(*)::text from public.calendar_reminders
        where organization_id = ${q(organizationId)}::uuid
          and litter_care_task_id = ${q(ids.plannedTask)}::uuid;
      `),
    ),
  ).toBe(0);
  expect(
    Number(
      sql(`
        select count(*)::text from public.calendar_reminder_commands
        where client_command_id = ${q(cmd("600"))}::uuid
          and outcome = 'success';
      `),
    ),
  ).toBe(0);

  const created = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.plannedTask,
    p_days_before: 1,
    p_local_time: "08:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("601"),
  });
  expect(created.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 1,
    timezone_name: TZ,
  });
  const reminderId = created.data![0].reminder_id!;

  const invalidUpdate = await owner.rpc("update_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 1,
    p_days_before: 1,
    p_local_time: "08:00",
    p_timezone_name: "Mars/Phobos",
    p_client_command_id: cmd("602"),
  });
  expect(invalidUpdate.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "invalid_input",
  });
  const afterInvalidUpdate = JSON.parse(
    sql(`
      select json_build_object(
        'revision_no', revision_no,
        'timezone_name', timezone_name,
        'days_before', days_before
      )::text
      from public.calendar_reminders where id = ${q(reminderId)}::uuid;
    `),
  );
  expect(afterInvalidUpdate).toEqual({
    revision_no: 1,
    timezone_name: TZ,
    days_before: 1,
  });
  expect(
    Number(
      sql(`
        select count(*)::text from public.calendar_reminder_commands
        where client_command_id = ${q(cmd("602"))}::uuid
          and outcome = 'success';
      `),
    ),
  ).toBe(0);

  const arbitraryAck = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: "2020-01-01T00:00:00.000Z",
    p_client_command_id: cmd("610"),
  });
  expect(arbitraryAck.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "stale_trigger",
  });
  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'revision_no', revision_no,
          'ack', acknowledged_trigger_at is not null
        )::text
        from public.calendar_reminders where id = ${q(reminderId)}::uuid;
      `),
    ),
  ).toEqual({ revision_no: 1, ack: false });

  // planned_for 2026-09-10, days_before 1 → trigger local 2026-09-09 08:00 Paris
  const currentTrigger = localCivilDateTimeToUtcIso("2026-09-09", "08:00", TZ)!;
  const ackOk = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: currentTrigger,
    p_client_command_id: cmd("611"),
  });
  expect(ackOk.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    replayed: false,
  });
  expect(ackOk.data?.[0].acknowledged_trigger_at).toBeTruthy();

  const ackReplay = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 2,
    p_expected_trigger_at: currentTrigger,
    p_client_command_id: cmd("612"),
  });
  expect(ackReplay.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    replayed: true,
  });

  const noChangeUpdate = await owner.rpc("update_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 2,
    p_days_before: 1,
    p_local_time: "08:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("620"),
  });
  expect(noChangeUpdate.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 3,
  });
  const preservedAck = JSON.parse(
    sql(`
      select json_build_object(
        'ack_trigger', acknowledged_trigger_at is not null,
        'ack_at', acknowledged_at is not null,
        'ack_by', acknowledged_by is not null,
        'revision_no', revision_no
      )::text
      from public.calendar_reminders where id = ${q(reminderId)}::uuid;
    `),
  );
  expect(preservedAck).toEqual({
    ack_trigger: true,
    ack_at: true,
    ack_by: true,
    revision_no: 3,
  });

  const realUpdate = await owner.rpc("update_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 3,
    p_days_before: 2,
    p_local_time: "08:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("621"),
  });
  expect(realUpdate.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 4,
    acknowledged_trigger_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
  });

  // Re-ack then move source → stale_trigger; old ack must not succeed.
  const reAckTrigger = localCivilDateTimeToUtcIso("2026-09-08", "08:00", TZ)!;
  const reAck = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 4,
    p_expected_trigger_at: reAckTrigger,
    p_client_command_id: cmd("630"),
  });
  expect(reAck.data?.[0]?.outcome).toBe("success");
  const revisionAfterAck = reAck.data![0].revision_no!;

  sql(`
    update public.litter_care_tasks
    set planned_for = '2026-09-20'::date, revision_no = revision_no + 1
    where id = ${q(ids.plannedTask)}::uuid;
  `);

  const staleAfterMove = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: revisionAfterAck,
    p_expected_trigger_at: reAckTrigger,
    p_client_command_id: cmd("631"),
  });
  expect(staleAfterMove.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "stale_trigger",
  });
  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'revision_no', revision_no,
          'ack_present', acknowledged_trigger_at is not null,
          'ack_at_present', acknowledged_at is not null,
          'ack_by_present', acknowledged_by is not null
        )::text
        from public.calendar_reminders where id = ${q(reminderId)}::uuid;
      `),
    ),
  ).toEqual({
    revision_no: revisionAfterAck,
    ack_present: true,
    ack_at_present: true,
    ack_by_present: true,
  });

  const newTrigger = localCivilDateTimeToUtcIso("2026-09-18", "08:00", TZ)!;
  const ackNew = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: revisionAfterAck,
    p_expected_trigger_at: newTrigger,
    p_client_command_id: cmd("632"),
  });
  expect(ackNew.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: revisionAfterAck + 1,
    replayed: false,
  });

  // Cycle move → stale_trigger
  const cycleCreate = await owner.rpc("create_calendar_reminder", {
    p_source_type: "reproductive_cycle",
    p_source_record_id: ids.plannedCycle,
    p_days_before: 0,
    p_local_time: "09:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("640"),
  });
  const cycleReminderId = cycleCreate.data![0].reminder_id!;
  const cycleTrigger = localCivilDateTimeToUtcIso("2026-09-15", "09:00", TZ)!;
  sql(`
    update public.reproductive_cycles
    set started_on = '2026-09-22'::date
    where id = ${q(ids.plannedCycle)}::uuid;
  `);
  const cycleStale = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: cycleReminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: cycleTrigger,
    p_client_command_id: cmd("641"),
  });
  expect(cycleStale.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "stale_trigger",
  });

  // Appointment move → stale_trigger
  const eventCreate = await owner.rpc("create_calendar_reminder", {
    p_source_type: "adopter_event",
    p_source_record_id: ids.plannedEvent,
    p_days_before: 0,
    p_local_time: "08:00",
    p_timezone_name: TZ,
    p_client_command_id: cmd("650"),
  });
  const eventReminderId = eventCreate.data![0].reminder_id!;
  // planned_at 2026-09-20T08:00Z = 10:00 Paris → local date 2026-09-20; days_before 0 @ 08:00
  const eventTrigger = localCivilDateTimeToUtcIso("2026-09-20", "08:00", TZ)!;
  sql(`
    update public.events
    set planned_at = '2026-09-25T08:00:00Z'::timestamptz
    where id = ${q(ids.plannedEvent)}::uuid;
  `);
  const eventStale = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: eventReminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: eventTrigger,
    p_client_command_id: cmd("651"),
  });
  expect(eventStale.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "stale_trigger",
  });

  // Terminal source
  sql(`
    update public.litter_care_tasks
    set status = 'done',
        resolution_command_id = ${q(cmd("660"))}::uuid,
        resolved_at = now(),
        resolved_timezone_name = ${q(TZ)},
        resolved_by = ${q(ownerId)}::uuid
    where id = ${q(ids.plannedTask)}::uuid;
  `);
  const terminal = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: revisionAfterAck + 1,
    p_expected_trigger_at: newTrigger,
    p_client_command_id: cmd("661"),
  });
  expect(terminal.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_admissible",
  });

  // Soft-deleted cycle / event sources are indistinguishable (source_not_found).
  sql(`
    update public.reproductive_cycles
    set deleted_at = now()
    where id = ${q(ids.plannedCycle)}::uuid;
  `);
  const cycleGone = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: cycleReminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: cycleTrigger,
    p_client_command_id: cmd("670"),
  });
  sql(`
    update public.events
    set deleted_at = now()
    where id = ${q(ids.plannedEvent)}::uuid;
  `);
  const eventGone = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: eventReminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: eventTrigger,
    p_client_command_id: cmd("671"),
  });
  expect(cycleGone.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_found",
  });
  expect(eventGone.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "source_not_found",
  });
  expect(cycleGone.data?.[0]?.reason).toBe(eventGone.data?.[0]?.reason);

  // Spec #16: reminder RPCs must not silently corrupt unrelated business sources.
  // Intentional SQL moves/soft-deletes above are excluded from this snapshot.
  const after = sourceSnapshot();
  expect(after.doneTask).toEqual(beforeSources.doneTask);
  expect(after.matedCycle).toEqual(beforeSources.matedCycle);
  expect(after.doneEvent).toEqual(beforeSources.doneEvent);
  expect(after.foreignTask).toEqual(beforeSources.foreignTask);
});

test("RPC calendar reminders: heure ambiguë DST et trou de printemps", async () => {
  const owner = await createAuthenticatedSupabaseClient();
  const beforeSources = sourceSnapshot();

  const canonical = localCivilDateTimeToUtcIso("2026-10-25", "02:30", TZ);
  const earlierOccurrence = "2026-10-25T00:30:00.000Z";
  expect(canonical).toBe("2026-10-25T01:30:00.000Z");
  expect(earlierOccurrence).not.toBe(canonical);

  const sqlCanonical = sql(`
    select public.calendar_reminder_canonical_trigger_at(
      '2026-10-25 02:30:00'::timestamp,
      ${q(TZ)}
    )::text;
  `).trim();
  expect(new Date(sqlCanonical).toISOString()).toBe(canonical);

  const created = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.dstAmbiguousTask,
    p_days_before: 0,
    p_local_time: "02:30",
    p_timezone_name: TZ,
    p_client_command_id: cmd("700"),
  });
  expect(created.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 1,
  });
  const reminderId = created.data![0].reminder_id!;

  const refuseEarlier = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: earlierOccurrence,
    p_client_command_id: cmd("701"),
  });
  expect(refuseEarlier.data?.[0]).toMatchObject({
    outcome: "error",
    reason: "stale_trigger",
  });
  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'revision_no', revision_no,
          'ack_trigger', acknowledged_trigger_at is not null,
          'ack_at', acknowledged_at is not null,
          'ack_by', acknowledged_by is not null
        )::text
        from public.calendar_reminders where id = ${q(reminderId)}::uuid;
      `),
    ),
  ).toEqual({
    revision_no: 1,
    ack_trigger: false,
    ack_at: false,
    ack_by: false,
  });

  const ackCanonical = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 1,
    p_expected_trigger_at: canonical!,
    p_client_command_id: cmd("702"),
  });
  expect(ackCanonical.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    replayed: false,
  });
  expect(ackCanonical.data?.[0].acknowledged_trigger_at).toBeTruthy();
  expect(new Date(ackCanonical.data![0].acknowledged_trigger_at!).toISOString()).toBe(
    canonical,
  );

  const ackRow = JSON.parse(
    sql(`
      select json_build_object(
        'revision_no', revision_no,
        'ack_trigger', acknowledged_trigger_at,
        'ack_at', acknowledged_at,
        'days_before', days_before,
        'local_time', local_time::text,
        'timezone_name', timezone_name
      )::text
      from public.calendar_reminders where id = ${q(reminderId)}::uuid;
    `),
  );

  const projection = projectCalendarReminder({
    reminder: {
      id: reminderId,
      organizationId,
      sourceType: "litter_care_task",
      sourceRecordId: ids.dstAmbiguousTask,
      daysBefore: ackRow.days_before,
      localTime: String(ackRow.local_time).slice(0, 8),
      timezoneName: ackRow.timezone_name,
      revisionNo: ackRow.revision_no,
      acknowledgedTriggerAt: new Date(ackRow.ack_trigger).toISOString(),
      acknowledgedAt: new Date(ackRow.ack_at).toISOString(),
    },
    event: {
      identitySource: "litter-care",
      sourceType: "litter_care",
      sourceRecordId: ids.dstAmbiguousTask,
      litterId: ids.litter,
      itemKind: "task",
      title: "E2E rappel DST ambigu",
      contextLabel: "Rosie × Rimbaud",
      startsOn: "2026-10-25",
      startsLocalTime: null,
      endsOn: null,
      endsLocalTime: null,
      timezoneName: TZ,
      isAllDay: true,
      sequence: 1,
      lastModifiedAt: "2026-01-01T00:00:00.000Z",
      kind: "task",
      category: "veterinary",
      href: `/litters/journal?litter=${ids.litter}#litter-care-tasks`,
    },
    // Align "today" with the acknowledgement civil day so the treated state is visible.
    now: new Date(ackRow.ack_at),
  });
  expect(projection.currentTriggerAt).toBe(canonical);
  expect(projection.acknowledgedTriggerAt).toBe(canonical);
  expect(projection.projectionState).toBe("acknowledged_today");

  const replay = await owner.rpc("acknowledge_calendar_reminder", {
    p_reminder_id: reminderId,
    p_expected_revision_no: 2,
    p_expected_trigger_at: canonical!,
    p_client_command_id: cmd("703"),
  });
  expect(replay.data?.[0]).toMatchObject({
    outcome: "success",
    revision_no: 2,
    replayed: true,
  });

  // Spring gap: local 02:30 does not exist; no false success, no mutation.
  const gapCreate = await owner.rpc("create_calendar_reminder", {
    p_source_type: "litter_care_task",
    p_source_record_id: ids.dstGapTask,
    p_days_before: 0,
    p_local_time: "02:30",
    p_timezone_name: TZ,
    p_client_command_id: cmd("710"),
  });
  expect(gapCreate.data?.[0]?.outcome).toBe("success");
  const gapReminderId = gapCreate.data![0].reminder_id!;
  expect(localCivilDateTimeToUtcIso("2026-03-29", "02:30", TZ)).toBeNull();
  expect(
    sql(`
      select public.calendar_reminder_canonical_trigger_at(
        '2026-03-29 02:30:00'::timestamp,
        ${q(TZ)}
      ) is null;
    `).trim(),
  ).toBe("t");

  const gapAttempts = [
    "2026-03-29T00:30:00.000Z",
    "2026-03-29T01:30:00.000Z",
    "2026-03-29T01:00:00.000Z",
  ];
  for (const [index, instant] of gapAttempts.entries()) {
    const refused = await owner.rpc("acknowledge_calendar_reminder", {
      p_reminder_id: gapReminderId,
      p_expected_revision_no: 1,
      p_expected_trigger_at: instant,
      p_client_command_id: cmd(`71${index + 1}`),
    });
    expect(refused.data?.[0]).toMatchObject({
      outcome: "error",
      reason: "stale_trigger",
    });
  }
  expect(
    JSON.parse(
      sql(`
        select json_build_object(
          'revision_no', revision_no,
          'ack', acknowledged_trigger_at is not null
        )::text
        from public.calendar_reminders where id = ${q(gapReminderId)}::uuid;
      `),
    ),
  ).toEqual({ revision_no: 1, ack: false });

  const after = sourceSnapshot();
  expect(after.doneTask).toEqual(beforeSources.doneTask);
  expect(after.matedCycle).toEqual(beforeSources.matedCycle);
  expect(after.doneEvent).toEqual(beforeSources.doneEvent);
  expect(after.foreignTask).toEqual(beforeSources.foreignTask);
});
