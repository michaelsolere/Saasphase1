import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createLitterPlanAdHocItem,
  mapUpdateLitterPlanAdHocMetadataRpcResult,
  updateLitterPlanAdHocItemMetadata,
  type UpdateLitterPlanAdHocMetadataInput,
} from "../../src/features/litter-journal/litter-plan-ad-hoc";
import type { Database, Json } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

// LITTER-AD-HOC-METADATA-EDIT-01 — this suite deliberately contains no
// Journal UI assertions.  It is the first, RPC-only, half of the final E2E
// validation and is executable only through the protected preserve-demo mode.
test.setTimeout(600_000);

type Supabase = SupabaseClient<Database>;
type Item = { planId: string; itemId: string; taskId: string; kind: "milestone" | "task" | "window" };
type Revision = { plan: number; item: number; task: number };

const prefix = "e7280001-0000-4000-8000-0000000000";
const like = "e7280001-%";
const mainOrg = `${prefix}01`;
const foreignOrg = `${prefix}02`;
const ownerMembership = `${prefix}03`;
const viewerId = `${prefix}04`;
const viewerIdentity = `${prefix}05`;
const viewerMembership = `${prefix}06`;
const memberId = `${prefix}12`;
const memberIdentity = `${prefix}13`;
const memberMembership = `${prefix}14`;
const foreignId = `${prefix}07`;
const foreignIdentity = `${prefix}08`;
const foreignMembership = `${prefix}09`;
const mother = `${prefix}10`;
const litter = `${prefix}11`;
const template = `${prefix}26`;
const model = `${prefix}27`;
const commands = {
  milestone: `${prefix}20`, window: `${prefix}21`, model: `${prefix}22`,
  recurring: `${prefix}23`, terminal: `${prefix}24`, divergent: `${prefix}25`,
  editMilestone: `${prefix}30`, editWindow: `${prefix}31`, identical: `${prefix}32`,
  concurrentSame: `${prefix}33`, concurrentA: `${prefix}34`, concurrentB: `${prefix}35`,
  stalePlan: `${prefix}36`, staleItem: `${prefix}37`, staleTask: `${prefix}38`,
  invalid: `${prefix}39`, extra: `${prefix}40`, viewer: `${prefix}41`, foreign: `${prefix}42`,
  modelEdit: `${prefix}43`, recurringEdit: `${prefix}44`, terminalEdit: `${prefix}45`, divergentEdit: `${prefix}46`,
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function authUserSql(id: string, identity: string, email: string, password: string) {
  return `
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at)
    values (${q(id)}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${q(email)}, extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (${q(identity)}::uuid, ${q(email)}, ${q(id)}::uuid,
      jsonb_build_object('sub', ${q(id)}, 'email', ${q(email)}, 'email_verified', true), 'email', now(), now());
  `;
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    delete from public.litter_plan_ad_hoc_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_changes where litter_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_materialization_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_series_state_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks where litter_id::text like ${q(like)};
    delete from public.litter_plan_series_time_slots where series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)});
    delete from public.litter_plan_series where litter_id::text like ${q(like)};
    delete from public.litter_plan_items where litter_id::text like ${q(like)};
    delete from public.litter_plans where litter_id::text like ${q(like)};
    delete from public.litter_planning_model_items where model_id=${q(model)}::uuid;
    delete from public.litter_planning_models where id=${q(model)}::uuid;
    delete from public.litter_care_task_templates where id=${q(template)}::uuid;
    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};
    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships where id::text like ${q(like)};
    alter table public.memberships enable trigger memberships_protect_owner;
    delete from public.profiles where id::text like ${q(like)};
    delete from auth.identities where user_id::text like ${q(like)};
    delete from auth.users where id::text like ${q(like)};
    delete from public.organizations where id::text like ${q(like)};
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(sql(`select json_build_object(
    'commands',(select count(*) from public.litter_plan_ad_hoc_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
    'tasks',(select count(*) from public.litter_care_tasks where litter_id::text like ${q(like)}),
    'series',(select count(*) from public.litter_plan_series where litter_id::text like ${q(like)}),
    'series_slots',(select count(*) from public.litter_plan_series_time_slots where series_id in (select id from public.litter_plan_series where litter_id::text like ${q(like)})),
    'schedule_changes',(select count(*) from public.litter_care_task_schedule_changes where litter_id::text like ${q(like)}),
    'schedule_commands',(select count(*) from public.litter_care_task_schedule_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
    'series_materialization_commands',(select count(*) from public.litter_plan_series_materialization_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
    'series_state_commands',(select count(*) from public.litter_plan_series_state_commands where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)}),
    'model_items',(select count(*) from public.litter_planning_model_items where model_id=${q(model)}::uuid),
    'items',(select count(*) from public.litter_plan_items where litter_id::text like ${q(like)}),
    'plans',(select count(*) from public.litter_plans where litter_id::text like ${q(like)}),
    'models',(select count(*) from public.litter_planning_models where id=${q(model)}::uuid),
    'templates',(select count(*) from public.litter_care_task_templates where id=${q(template)}::uuid),
    'litters',(select count(*) from public.litters where id::text like ${q(like)}),
    'animals',(select count(*) from public.animals where id::text like ${q(like)}),
    'memberships',(select count(*) from public.memberships where id::text like ${q(like)}),
    'profiles',(select count(*) from public.profiles where id::text like ${q(like)}),
    'identities',(select count(*) from auth.identities where user_id::text like ${q(like)}),
    'users',(select count(*) from auth.users where id::text like ${q(like)}),
    'organizations',(select count(*) from public.organizations where id::text like ${q(like)})
  )::text;`)) as Record<string, number>;
}

function growthCounts() {
  return JSON.parse(sql(`select json_build_object(
    'animals',(select count(*) from public.animals where id::text like 'd3c9%'),
    'litters',(select count(*) from public.litters where id::text like 'd3c9%'),
    'sessions',(select count(*) from public.whelping_sessions where id::text like 'd3c9%'),
    'events',(select count(*) from public.whelping_events where id::text like 'd3c9%'),
    'births',(select count(*) from public.whelping_births where id::text like 'd3c9%'),
    'weighing',(select count(*) from public.litter_weighing_sessions where id::text like 'd3c9%'),
    'measurements',(select count(*) from public.animal_weight_measurements where id::text like 'd3c9%')
  )::text;`));
}

function seedActors() {
  sql(`
    insert into public.organizations (id,name,slug) values
      (${q(mainOrg)}::uuid,'e7280001 main','e7280001-main'),
      (${q(foreignOrg)}::uuid,'e7280001 foreign','e7280001-foreign');
    ${authUserSql(viewerId, viewerIdentity, 'e7280001-viewer@saasphase1.invalid', 'E7280001-Viewer!')}
    ${authUserSql(memberId, memberIdentity, 'e7280001-member@saasphase1.invalid', 'E7280001-Member!')}
    ${authUserSql(foreignId, foreignIdentity, 'e7280001-foreign@saasphase1.invalid', 'E7280001-Foreign!')}
    insert into public.memberships (id,organization_id,profile_id,role,status,created_by,updated_by) values
      (${q(ownerMembership)}::uuid,${q(mainOrg)}::uuid,${q(ownerId)}::uuid,'owner','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(viewerMembership)}::uuid,${q(mainOrg)}::uuid,${q(viewerId)}::uuid,'viewer','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(memberMembership)}::uuid,${q(mainOrg)}::uuid,${q(memberId)}::uuid,'member','active',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(foreignMembership)}::uuid,${q(foreignOrg)}::uuid,${q(foreignId)}::uuid,'owner','active',${q(foreignId)}::uuid,${q(foreignId)}::uuid);
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by)
      values (${q(mother)}::uuid,${q(mainOrg)}::uuid,'e7280001 mère','dog','Golden Retriever','female','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters (id,organization_id,name,species,breed,mother_id,status,mating_date,created_by,updated_by)
      values (${q(litter)}::uuid,${q(mainOrg)}::uuid,'e7280001 portée','dog','Golden Retriever',${q(mother)}::uuid,'birth_expected','2026-07-01',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_care_task_templates (id,organization_id,title,category,target_scope,anchor_type,offset_days,species,revision,created_by,updated_by)
      values (${q(template)}::uuid,${q(mainOrg)}::uuid,'e7280001 modèle','preparation','litter','first_mating',0,'dog',1,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_planning_models (id,organization_id,title,species,breed,revision,created_by,updated_by)
      values (${q(model)}::uuid,${q(mainOrg)}::uuid,'e7280001 modèle','dog','Golden Retriever',1,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

async function authenticated(email: string, password: string): Promise<Supabase> {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  return client;
}

function revisions(itemId: string): Revision {
  return JSON.parse(sql(`select json_build_object(
    'plan',(select p.revision from public.litter_plans p join public.litter_plan_items i on i.litter_plan_id=p.id where i.id=${q(itemId)}::uuid),
    'item',(select revision_no from public.litter_plan_items where id=${q(itemId)}::uuid),
    'task',(select max(revision_no) from public.litter_care_tasks where litter_plan_item_id=${q(itemId)}::uuid)
  )::text;`)) as Revision;
}

function snapshot(item: Item) {
  return JSON.parse(sql(`select json_build_object(
    'item', (select row_to_json(i) from public.litter_plan_items i where i.id=${q(item.itemId)}::uuid),
    'task', (select row_to_json(t) from public.litter_care_tasks t where t.id=${q(item.taskId)}::uuid),
    'plan', (select row_to_json(p) from public.litter_plans p where p.id=${q(item.planId)}::uuid)
  )::text;`)) as Record<string, Record<string, unknown>>;
}

function metadata(title: string, description: string | null = "description") {
  return { version: 1, operation: "update_metadata" as const, title, description, category: "veterinary" as const, targetScope: "litter" as const, priority: "important" as const };
}

function input(item: Item, command: string, revision = revisions(item.itemId), values = metadata("e7280001 corrigé")): UpdateLitterPlanAdHocMetadataInput {
  return { litterId: litter, litterPlanId: item.planId, litterPlanItemId: item.itemId, taskId: item.taskId, clientCommandId: command, expectedPlanRevision: revision.plan, expectedItemRevision: revision.item, expectedTaskRevision: revision.task, metadata: values };
}

async function create(owner: Supabase, command: string, kind: "milestone" | "window" | "recurring_task", expectedPlanRevision: number | null) {
  const item = kind === "window"
    ? { version: 1, kind, title: `e7280001 ${command.slice(-2)}`, description: "initial", category: "preparation", targetScope: "litter", priority: "normal", lockSchedule: true, startsOn: "2026-08-10", endsOn: "2026-08-12", startsLocalTime: "08:00", endsLocalTime: "16:00" }
    : kind === "recurring_task"
      ? { version: 1, kind, title: "e7280001 série", description: "initial", category: "preparation", targetScope: "litter", priority: "normal", lockSchedule: false, startsOn: "2026-08-10", intervalDays: 1, endKind: "fixed_recurrence_day_count", endsOn: null, recurrenceDayCount: 2, timeSlots: ["08:00"] }
      : { version: 1, kind, title: `e7280001 ${command.slice(-2)}`, description: "initial", category: "preparation", targetScope: "litter", priority: "normal", lockSchedule: true, scheduledDate: "2026-08-10", localTime: "09:00" };
  const result = await createLitterPlanAdHocItem({ litterId: litter, clientCommandId: command, expectedPlanRevision, timezoneName: "Europe/Paris", item }, owner);
  expect(result.outcome).toBe("success");
  if (result.outcome !== "success") throw new Error("fixture materialization failed");
  const taskId = result.taskId ?? sql(`select id::text from public.litter_care_tasks where litter_plan_item_id=${q(result.litterPlanItemId)}::uuid order by id limit 1;`);
  return { planId: result.litterPlanId, itemId: result.litterPlanItemId, taskId, kind: kind === "recurring_task" ? "task" : kind } as Item;
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 45_000 });
}

async function gotoJournal(page: Page) {
  await page.goto(`/litters/journal?litter=${litter}`, { waitUntil: "commit", timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Planning de la portée", exact: true })).toBeVisible({ timeout: 60_000 });
}

function timelineCard(page: Page, title: string) {
  return page.locator("[data-timeline-item]").filter({ has: page.getByText(title, { exact: true }) });
}

async function openMetadata(page: Page, title: string) {
  const card = timelineCard(page, title);
  await expect(card).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  const trigger = card.getByRole("button", { name: "Modifier les informations" });
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  await trigger.click({ trial: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Modifier les informations", { exact: true })).toBeVisible({ timeout: 15_000 });
  return dialog;
}

test("LITTER-AD-HOC-METADATA-EDIT-01 — RPC, idempotence, concurrence, Journal et cleanup", async ({ page }) => {
  const demoBefore = growthCounts();
  let demoAfter: unknown;
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "échec"}`));
  try {
    cleanup();
    seedActors();
    const owner = await createAuthenticatedSupabaseClient();
    const viewer = await authenticated("e7280001-viewer@saasphase1.invalid", "E7280001-Viewer!");
    const foreign = await authenticated("e7280001-foreign@saasphase1.invalid", "E7280001-Foreign!");

    const milestone = await test.step("fixtures: matérialise jalon et période ad hoc", async () => {
      const first = await create(owner, commands.milestone, "milestone", null);
      const window = await create(owner, commands.window, "window", revisions(first.itemId).plan);
      return { first, window };
    });
    const modelItem = await create(owner, commands.model, "milestone", revisions(milestone.first.itemId).plan);
    const recurring = await create(owner, commands.recurring, "recurring_task", revisions(milestone.first.itemId).plan);
    const terminal = await create(owner, commands.terminal, "milestone", revisions(milestone.first.itemId).plan);
    const divergent = await create(owner, commands.divergent, "milestone", revisions(milestone.first.itemId).plan);
    sql(`update public.litter_plan_items set origin_kind='planning_model', source_planning_model_id=${q(model)}::uuid, source_planning_model_revision=1, source_model_item_id=${q(`${prefix}71`)}::uuid, source_model_display_order=0, organization_template_id=${q(template)}::uuid, anchor_type='first_mating', anchor_resolution_source='first_mating', anchor_source_date_snapshot='2026-07-01', anchor_adjustment_days=0, anchor_date_snapshot='2026-07-01' where id=${q(modelItem.itemId)}::uuid;
      update public.litter_care_tasks set status='done', resolution_command_id=${q(`${prefix}50`)}::uuid, resolved_at=now(), resolved_timezone_name='Europe/Paris', resolved_by=${q(ownerId)}::uuid where id=${q(terminal.taskId)}::uuid;
      update public.litter_care_tasks set title='e7280001 divergent' where id=${q(divergent.taskId)}::uuid;`);

    await test.step("mutation nominale jalon, normalisation et invariants", async () => {
      const before = snapshot(milestone.first); const rev = revisions(milestone.first.itemId);
      const result = await updateLitterPlanAdHocItemMetadata(input(milestone.first, commands.editMilestone, rev, metadata("  e7280001 jalon corrigé  ", "   ")), owner);
      expect(result).toMatchObject({ outcome: "success", replayed: false, kind: "milestone", planRevision: rev.plan + 1, itemRevision: rev.item + 1, taskRevision: rev.task + 1 });
      const after = snapshot(milestone.first);
      for (const field of ["id", "item_kind", "point_offset_days", "point_local_time", "display_order", "origin_kind", "materialization_state"])
        expect(after.item[field]).toEqual(before.item[field]);
      for (const field of ["id", "planned_for", "scheduled_local_time", "schedule_timezone_name", "status", "is_schedule_locked", "source", "litter_plan_item_id"])
        expect(after.task[field]).toEqual(before.task[field]);
      expect(after.item.description).toBeNull(); expect(after.task.description).toBeNull();
      expect(after.item.title).toBe("e7280001 jalon corrigé"); expect(after.task.title).toBe("e7280001 jalon corrigé");
    });

    await test.step("mutation nominale période synchronise les deux projections", async () => {
      const before = snapshot(milestone.window); const rev = revisions(milestone.window.itemId);
      const result = await updateLitterPlanAdHocItemMetadata(input(milestone.window, commands.editWindow, rev, metadata("e7280001 période corrigée")), owner);
      expect(result).toMatchObject({ outcome: "success", kind: "window", planRevision: rev.plan + 1, itemRevision: rev.item + 1, taskRevision: rev.task + 1 });
      const after = snapshot(milestone.window);
      for (const field of ["window_starts_offset_days", "window_starts_local_time", "window_ends_offset_days", "window_ends_local_time", "display_order", "origin_kind"])
        expect(after.item[field]).toEqual(before.item[field]);
      for (const field of ["retained_starts_on", "retained_starts_local_time", "retained_ends_on", "retained_ends_local_time", "status", "is_schedule_locked", "source"])
        expect(after.task[field]).toEqual(before.task[field]);
      for (const field of ["title", "description", "category", "target_scope", "priority"]) expect(after.item[field]).toEqual(after.task[field]);
    });

    await test.step("rejeu et conflits de clé restent append-only", async () => {
      const rev = revisions(milestone.first.itemId); const firstInput = input(milestone.first, commands.identical, rev, metadata("e7280001 idempotent"));
      const first = await updateLitterPlanAdHocItemMetadata(firstInput, owner); const replay = await updateLitterPlanAdHocItemMetadata(firstInput, owner);
      expect(first).toMatchObject({ outcome: "success", replayed: false }); expect(replay).toMatchObject({ outcome: "success", replayed: true });
      expect(revisions(milestone.first.itemId)).toEqual({ plan: rev.plan + 1, item: rev.item + 1, task: rev.task + 1 });
      for (const changed of [input(milestone.window, commands.identical), input(milestone.first, commands.identical, { plan: rev.plan + 1, item: rev.item + 1, task: rev.task + 1 }), input(milestone.first, commands.identical, rev, metadata("e7280001 autre"))]) {
        const conflict = await updateLitterPlanAdHocItemMetadata(changed, owner);
        expect(conflict).toMatchObject({ outcome: "error", error: { code: "client_command_conflict" } });
      }
      const command = JSON.parse(sql(`select json_build_object('payload',payload,'result',result)::text from public.litter_plan_ad_hoc_commands where client_command_id=${q(commands.identical)}::uuid;`));
      expect(command.payload).toMatchObject({ operation: "update_metadata", litterId: litter, litterPlanItemId: milestone.first.itemId, expectedPlanRevision: rev.plan, expectedItemRevision: rev.item, expectedTaskRevision: rev.task });
      expect(command.result).toMatchObject({ litterPlanId: milestone.first.planId, litterPlanItemId: milestone.first.itemId, taskId: milestone.first.taskId, planRevision: rev.plan + 1, itemRevision: rev.item + 1, taskRevision: rev.task + 1 });
    });

    await test.step("concurrence identique: une mutation et un rejeu", async () => {
      const target = await create(owner, `${prefix}60`, "milestone", revisions(milestone.first.itemId).plan); const rev = revisions(target.itemId); const shared = input(target, commands.concurrentSame, rev, metadata("e7280001 concurrent identique"));
      const second = await createAuthenticatedSupabaseClient();
      const results = await Promise.all([updateLitterPlanAdHocItemMetadata(shared, owner), updateLitterPlanAdHocItemMetadata(shared, second)]);
      expect(results.map((r) => r.outcome)).toEqual(["success", "success"]); expect(results.filter((r) => r.outcome === "success" && r.replayed).length).toBe(1);
      expect(revisions(target.itemId)).toEqual({ plan: rev.plan + 1, item: rev.item + 1, task: rev.task + 1 });
    });

    await test.step("concurrence différente: une seule intention gagne", async () => {
      const target = await create(owner, `${prefix}61`, "milestone", revisions(milestone.first.itemId).plan); const rev = revisions(target.itemId); const second = await createAuthenticatedSupabaseClient();
      const results = await Promise.all([updateLitterPlanAdHocItemMetadata(input(target, commands.concurrentA, rev, metadata("e7280001 A")), owner), updateLitterPlanAdHocItemMetadata(input(target, commands.concurrentB, rev, metadata("e7280001 B")), second)]);
      expect(results.filter((r) => r.outcome === "success")).toHaveLength(1); expect(results.filter((r) => r.outcome === "error" && r.error.code === "stale_revision")).toHaveLength(1);
      const row = snapshot(target); expect(row.item.title).toBe(row.task.title);
    });

    await test.step("trois révisions obsolètes sont mappées comme stale_revision", async () => {
      const target = await create(owner, `${prefix}62`, "milestone", revisions(milestone.first.itemId).plan);
      const initial = revisions(target.itemId);
      expect((await updateLitterPlanAdHocItemMetadata(input(target, `${prefix}64`, initial, metadata("e7280001 préparation stale")), owner)).outcome).toBe("success");
      const current = revisions(target.itemId);
      const staleInputs = [
        input(target, commands.stalePlan, { ...current, plan: current.plan - 1 }),
        input(target, commands.staleItem, { ...current, item: current.item - 1 }),
        input(target, commands.staleTask, { ...current, task: Math.max(0, current.task - 1) }),
      ];
      for (const stale of staleInputs) {
        const before = snapshot(target); const result = await updateLitterPlanAdHocItemMetadata(stale, owner);
        expect(result).toMatchObject({ outcome: "error", error: { code: "stale_revision" } }); expect(snapshot(target)).toEqual(before);
      }
    });

    await test.step("non-éligibilité, rôles, isolation et JSON invalide n'écrivent pas", async () => {
      for (const [target, command] of [[modelItem, commands.modelEdit], [recurring, commands.recurringEdit], [terminal, commands.terminalEdit], [divergent, commands.divergentEdit]] as const) {
        const before = snapshot(target);
        const commandsBefore = Number(sql(`select count(*) from public.litter_plan_ad_hoc_commands where litter_id=${q(litter)}::uuid;`));
        const result = await updateLitterPlanAdHocItemMetadata(input(target, command), owner);
        expect(result).toMatchObject({ outcome: "error", error: { code: "not_found" } });
        expect(snapshot(target)).toEqual(before);
        expect(Number(sql(`select count(*) from public.litter_plan_ad_hoc_commands where litter_id=${q(litter)}::uuid;`))).toBe(commandsBefore);
      }
      for (const [client, command] of [[viewer, commands.viewer], [foreign, commands.foreign]] as const) {
        const before = snapshot(milestone.first);
        const commandsBefore = Number(sql(`select count(*) from public.litter_plan_ad_hoc_commands where litter_id=${q(litter)}::uuid;`));
        expect(await updateLitterPlanAdHocItemMetadata(input(milestone.first, command), client)).toMatchObject({ outcome: "error", error: { code: "forbidden" } });
        expect(snapshot(milestone.first)).toEqual(before);
        expect(Number(sql(`select count(*) from public.litter_plan_ad_hoc_commands where litter_id=${q(litter)}::uuid;`))).toBe(commandsBefore);
      }
      const rev = revisions(milestone.first.itemId);
      for (const bad of [{ ...metadata("bad"), title: 4 }, { ...metadata("bad"), extra: true }]) {
        const raw = await owner.rpc("update_litter_plan_ad_hoc_item_metadata", { p_litter_id: litter, p_litter_plan_item_id: milestone.first.itemId, p_client_command_id: bad.extra ? commands.extra : commands.invalid, p_expected_plan_revision: rev.plan, p_expected_item_revision: rev.item, p_expected_task_revision: rev.task, p_metadata: bad as unknown as Json });
        expect(raw.error).toBeNull(); expect(raw.data?.[0]?.reason).toBe("invalid_input");
      }
      const malformed = mapUpdateLitterPlanAdHocMetadataRpcResult({ outcome: "error", reason: "stale_revision", litter_plan_id: null, litter_plan_item_id: null, task_id: null, plan_revision: null, item_revision: null, task_revision: null, replayed: false, result: {} });
      expect(malformed).toMatchObject({ outcome: "error", error: { code: "database_error" } });
    });

    const uiMilestone = await create(owner, `${prefix}73`, "milestone", revisions(milestone.first.itemId).plan);
    const uiWindow = await create(owner, `${prefix}74`, "window", revisions(uiMilestone.itemId).plan);
    sql(`
      update public.litter_plan_items set title='Jalon UI éditable', description='Description UI initiale' where id=${q(uiMilestone.itemId)}::uuid;
      update public.litter_care_tasks set title='Jalon UI éditable', description='Description UI initiale' where id=${q(uiMilestone.taskId)}::uuid;
      update public.litter_plan_items set title='Période UI éditable', description='Période initiale' where id=${q(uiWindow.itemId)}::uuid;
      update public.litter_care_tasks set title='Période UI éditable', description='Période initiale' where id=${q(uiWindow.taskId)}::uuid;
      update public.litter_plan_items set title='Élément modèle non éditable' where id=${q(modelItem.itemId)}::uuid;
      update public.litter_care_tasks set title='Élément modèle non éditable' where id=${q(modelItem.taskId)}::uuid;
      update public.litter_plan_items set title='Série non éditable' where id=${q(recurring.itemId)}::uuid;
      update public.litter_care_tasks set title='Série non éditable' where litter_plan_item_id=${q(recurring.itemId)}::uuid;
      update public.litter_plan_items set title='Élément terminal non éditable' where id=${q(terminal.itemId)}::uuid;
      update public.litter_care_tasks set title='Élément terminal non éditable' where id=${q(terminal.taskId)}::uuid;
      update public.litter_plan_items set title='Élément divergent non éditable' where id=${q(divergent.itemId)}::uuid;
    `);

    await test.step("Journal: visibilité par rôle et éligibilité", async () => {
      await login(page, "e2e-owner@saasphase1.invalid", "LocalE2EOwner-2026!");
      await gotoJournal(page);
      await expect(timelineCard(page, "Jalon UI éditable").getByRole("button", { name: "Modifier les informations" })).toBeVisible();
      await expect(timelineCard(page, "Période UI éditable").getByRole("button", { name: "Modifier les informations" })).toBeVisible();
      await expect(timelineCard(page, "Élément modèle non éditable").getByRole("button", { name: "Modifier les informations" })).toHaveCount(0);
      await expect(timelineCard(page, "Série non éditable").getByRole("button", { name: "Modifier les informations" })).toHaveCount(0);
      await expect(timelineCard(page, "Élément terminal non éditable").getByRole("button", { name: "Modifier les informations" })).toHaveCount(0);
      await expect(timelineCard(page, "Élément divergent non éditable").getByRole("button", { name: "Modifier les informations" })).toHaveCount(0);
      await login(page, "e7280001-member@saasphase1.invalid", "E7280001-Member!");
      await gotoJournal(page);
      await expect(timelineCard(page, "Jalon UI éditable").getByRole("button", { name: "Modifier les informations" })).toBeVisible();
      await login(page, "e7280001-viewer@saasphase1.invalid", "E7280001-Viewer!");
      await gotoJournal(page);
      await expect(page.getByRole("button", { name: "Modifier les informations" })).toHaveCount(0);
    });

    await test.step("Journal: préremplissage, validation, mutation et double soumission", async () => {
      await login(page, "e2e-owner@saasphase1.invalid", "LocalE2EOwner-2026!");
      await gotoJournal(page);
      const dialog = await openMetadata(page, "Jalon UI éditable");
      await expect(dialog.getByText("Type : Jalon")).toBeVisible();
      await expect(dialog.getByLabel("Titre")).toHaveValue("Jalon UI éditable");
      await expect(dialog.getByLabel("Description")).toHaveValue("Description UI initiale");
      await expect(dialog.getByLabel("Catégorie")).toHaveValue("preparation");
      await expect(dialog.getByLabel("Cible")).toHaveValue("litter");
      await expect(dialog.getByLabel("Priorité")).toHaveValue("normal");
      await dialog.getByLabel("Titre").fill("");
      await dialog.getByRole("button", { name: "Enregistrer" }).click();
      const title = dialog.getByLabel("Titre");
      await expect(title).toHaveAttribute("aria-invalid", "true");
      const describedBy = await title.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(dialog.locator(`#${describedBy}`)).toBeVisible();
      await dialog.getByRole("button", { name: "Annuler" }).click();
      const reopened = await openMetadata(page, "Jalon UI éditable");
      await expect(reopened.getByRole("alert")).toHaveCount(0);
      await expect(reopened.getByLabel("Titre")).toHaveValue("Jalon UI éditable");
      const before = snapshot(uiMilestone); const rev = revisions(uiMilestone.itemId);
      const commandCountBefore = Number(sql(`select count(*) from public.litter_plan_ad_hoc_commands where litter_plan_item_id=${q(uiMilestone.itemId)}::uuid;`));
      await reopened.getByLabel("Titre").fill("Jalon UI enregistré");
      await reopened.getByLabel("Description").fill("Description UI corrigée");
      await reopened.getByLabel("Catégorie").selectOption("veterinary");
      await reopened.getByLabel("Cible").selectOption("mother");
      await reopened.getByLabel("Priorité").selectOption("important");
      const save = reopened.getByRole("button", { name: "Enregistrer" });
      await Promise.all([save.click(), save.click()]);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(revisions(uiMilestone.itemId)).toEqual({ plan: rev.plan + 1, item: rev.item + 1, task: rev.task + 1 });
      const after = snapshot(uiMilestone);
      expect(after.item.title).toBe("Jalon UI enregistré");
      expect(after.task.title).toBe("Jalon UI enregistré");
      expect(Number(sql(`select count(*) from public.litter_plan_ad_hoc_commands where litter_plan_item_id=${q(uiMilestone.itemId)}::uuid;`))).toBe(commandCountBefore + 1);
      for (const field of ["title", "description", "category", "target_scope", "priority"]) expect(after.item[field]).toEqual(after.task[field]);
      for (const field of ["planned_for", "scheduled_local_time", "status", "is_schedule_locked", "schedule_timezone_name"]) expect(after.task[field]).toEqual(before.task[field]);
      await expect(page.getByText("Jalon UI enregistré").first()).toBeVisible();
      const confirmation = page.getByRole("status").filter({ hasText: "Informations mises à jour." });
      await expect(confirmation).toHaveCount(1);
      await expect(confirmation).toBeVisible({ timeout: 10_000 });
      const period = await openMetadata(page, "Période UI éditable");
      await expect(period.getByText("Type : Période")).toBeVisible();
      await period.getByRole("button", { name: "Annuler" }).click();
    });

    await test.step("Journal: conflit obsolète, confidentialité et mobile", async () => {
      const triggerHtml = await timelineCard(page, "Jalon UI enregistré")
        .getByRole("button", { name: "Modifier les informations" })
        .evaluate((element) => element.outerHTML);
      const dialog = await openMetadata(page, "Jalon UI enregistré");
      await dialog.getByLabel("Titre").fill("Valeur conservée lors du conflit");
      const current = revisions(uiMilestone.itemId);
      expect((await updateLitterPlanAdHocItemMetadata(input(uiMilestone, `${prefix}72`, current, metadata("Mutation concurrente")), owner)).outcome).toBe("success");
      await dialog.getByRole("button", { name: "Enregistrer" }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Titre")).toHaveValue("Valeur conservée lors du conflit");
      await expect(dialog.getByText(/Journal a été modifié/)).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Recharger le Journal" })).toBeEnabled();
      await expect(dialog.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
      const privateSurfaces = [
        await dialog.evaluate((element) => element.outerHTML),
        triggerHtml,
        await dialog.locator("input, textarea, select").evaluateAll((elements) =>
          elements.map((element) => element.outerHTML).join("\n"),
        ),
        page.url(),
      ];
      for (const surface of privateSurfaces) {
        for (const forbidden of [
          uiMilestone.planId,
          uiMilestone.itemId,
          uiMilestone.taskId,
          "clientCommandId",
          "litterPlanId",
          "litterPlanItemId",
          "taskId",
          "expectedPlanRevision",
          "expectedItemRevision",
          "expectedTaskRevision",
        ]) {
          expect(surface).not.toContain(forbidden);
        }
      }
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(dialog.getByRole("button", { name: "Recharger le Journal" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await dialog.getByRole("button", { name: "Recharger le Journal" }).click();
      await expect(page.getByText("Mutation concurrente").first()).toBeVisible({ timeout: 60_000 });
      await expect(
        page.getByRole("button", {
          name: "Programmer",
          exact: true,
        }),
      ).toBeVisible();
      const preciseTrigger = timelineCard(page, "Mutation concurrente").getByRole(
        "button",
        { name: "Ajuster précisément", exact: true },
      );
      await expect(preciseTrigger).toBeVisible();
      await preciseTrigger.click();
      const preciseDialog = page.getByRole("dialog");
      await expect(preciseDialog).toBeVisible();
      await preciseDialog.getByRole("button", { name: "Annuler", exact: true }).click();
      await expect(preciseDialog).toHaveCount(0);
    });
  } finally {
    cleanup();
    for (const [table, count] of Object.entries(remainingCounts())) expect(count, `${table} e7280001 fixtures`).toBe(0);
    demoAfter = growthCounts();
    expect(demoAfter).toEqual(demoBefore);
    expect({ pageErrors, consoleErrors, failedRequests }).toEqual({ pageErrors: [], consoleErrors: [], failedRequests: [] });
  }
});
