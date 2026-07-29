import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(600_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "e7270004-0000-4000-8000-0000000000";
const like = "e7270004-%";

const ids = {
  memberUser: `${prefix}05`,
  memberIdentity: `${prefix}06`,
  memberMembership: `${prefix}07`,
  viewerUser: `${prefix}08`,
  viewerIdentity: `${prefix}09`,
  viewerMembership: `${prefix}10`,
  foreignOrganization: `${prefix}11`,
  foreignUser: `${prefix}12`,
  foreignIdentity: `${prefix}13`,
  foreignMembership: `${prefix}14`,
  mother: `${prefix}15`,
  litter: `${prefix}16`,
  templateMilestone: `${prefix}17`,
  templateTask: `${prefix}18`,
  templateWindow: `${prefix}19`,
  templateLocked: `${prefix}20`,
  templateTerminal: `${prefix}21`,
  templatePending: `${prefix}22`,
  model: `${prefix}23`,
  itemMilestone: `${prefix}24`,
  itemTask: `${prefix}25`,
  itemWindow: `${prefix}26`,
  itemLocked: `${prefix}27`,
  itemTerminal: `${prefix}28`,
  itemPending: `${prefix}29`,
  applyCommand: `${prefix}30`,
} as const;

const credentials = {
  member: ["timeline-drag-member@saasphase1.invalid", "TimelineDragMember-2026!"],
  viewer: ["timeline-drag-viewer@saasphase1.invalid", "TimelineDragViewer-2026!"],
  foreign: ["timeline-drag-foreign@saasphase1.invalid", "TimelineDragForeign-2026!"],
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function authUserSql(
  userId: string,
  identityId: string,
  email: string,
  password: string,
  displayName: string,
) {
  return `
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      ${q(userId)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', ${q(email)},
      extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(),
      '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', ${q(displayName)}), now(), now()
    )
    on conflict (id) do update set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at,
      updated_at = now();
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(identityId)}::uuid, ${q(email)}, ${q(userId)}::uuid,
      jsonb_build_object('sub', ${q(userId)}, 'email', ${q(email)}, 'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    )
    on conflict (id) do update set
      provider_id = excluded.provider_id,
      identity_data = excluded.identity_data,
      updated_at = now();
  `;
}

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships
      set role = 'owner'
      where id = ${q(ownerMembershipId)}::uuid
        and organization_id = ${q(organizationId)}::uuid
        and profile_id = ${q(ownerId)}::uuid;
    delete from public.litter_care_task_schedule_changes
      where litter_id::text like ${q(like)} or task_id::text like ${q(like)};
    delete from public.litter_care_task_schedule_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_plan_application_commands
      where litter_id::text like ${q(like)} or client_command_id::text like ${q(like)};
    delete from public.litter_care_tasks
      where litter_id::text like ${q(like)} or id::text like ${q(like)};
    delete from public.litter_plan_items where litter_id::text like ${q(like)};
    delete from public.litter_plans where litter_id::text like ${q(like)};
    delete from public.litter_planning_model_items where id::text like ${q(like)};
    delete from public.litter_planning_model_commands where client_command_id::text like ${q(like)};
    delete from public.litter_planning_models where id::text like ${q(like)};
    delete from public.litter_care_task_templates where id::text like ${q(like)};
    delete from public.litters where id::text like ${q(like)};
    delete from public.animals where id::text like ${q(like)};
    alter table public.memberships disable trigger memberships_protect_owner;
    delete from public.memberships where id::text like ${q(like)}
      or organization_id = ${q(ids.foreignOrganization)}::uuid;
    alter table public.memberships enable trigger memberships_protect_owner;
    delete from public.profiles where id::text like ${q(like)};
    delete from auth.identities where user_id::text like ${q(like)};
    delete from auth.users where id::text like ${q(like)};
    delete from public.organizations where id = ${q(ids.foreignOrganization)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`select json_build_object(
      'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where litter_id::text like ${q(like)}),
      'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where litter_id::text like ${q(like)}),
      'application_commands', (select count(*) from public.litter_plan_application_commands where litter_id::text like ${q(like)}),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id::text like ${q(like)}),
      'plan_items', (select count(*) from public.litter_plan_items where litter_id::text like ${q(like)}),
      'plans', (select count(*) from public.litter_plans where litter_id::text like ${q(like)}),
      'model_items', (select count(*) from public.litter_planning_model_items where id::text like ${q(like)}),
      'models', (select count(*) from public.litter_planning_models where id::text like ${q(like)}),
      'templates', (select count(*) from public.litter_care_task_templates where id::text like ${q(like)}),
      'litters', (select count(*) from public.litters where id::text like ${q(like)}),
      'animals', (select count(*) from public.animals where id::text like ${q(like)}),
      'extra_memberships', (select count(*) from public.memberships where id::text like ${q(like)}),
      'extra_profiles', (select count(*) from public.profiles where id::text like ${q(like)}),
      'extra_auth_identities', (select count(*) from auth.identities where user_id::text like ${q(like)}),
      'extra_auth_users', (select count(*) from auth.users where id::text like ${q(like)}),
      'foreign_orgs', (select count(*) from public.organizations where id = ${q(ids.foreignOrganization)}::uuid)
    )::text;`),
  ) as Record<string, number>;
}

function expectCleanup() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrganization)}::uuid, 'E2E timeline drag foreign e7270004', 'e2e-timeline-drag-foreign-e7270004')
    on conflict (id) do nothing;

    ${authUserSql(ids.memberUser, ids.memberIdentity, ...credentials.member, "Member timeline drag")}
    ${authUserSql(ids.viewerUser, ids.viewerIdentity, ...credentials.viewer, "Viewer timeline drag")}
    ${authUserSql(ids.foreignUser, ids.foreignIdentity, ...credentials.foreign, "Foreign timeline drag")}

    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by) values
      (${q(ids.memberMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.memberUser)}::uuid, 'member', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.viewerMembership)}::uuid, ${q(organizationId)}::uuid, ${q(ids.viewerUser)}::uuid, 'viewer', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.foreignMembership)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignUser)}::uuid, 'owner', 'active', ${q(ids.foreignUser)}::uuid, ${q(ids.foreignUser)}::uuid);

    insert into public.animals (id, organization_id, call_name, species, breed, sex, status, ownership_status, created_by, updated_by)
    values (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid, 'E2E timeline drag mère', 'dog', 'Golden Retriever', 'female', 'breeding', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, status, mating_date, created_by, updated_by
    ) values (
      ${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'E2E timeline drag portée',
      'dog', 'Golden Retriever', ${q(ids.mother)}::uuid, 'birth_expected', '2026-07-01',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.litter_care_task_templates (
      id, organization_id, title, category, target_scope, anchor_type, offset_days, species, revision, created_by, updated_by
    ) values
      (${q(ids.templateMilestone)}::uuid, ${q(organizationId)}::uuid, 'Radiographie de comptage', 'preparation', 'litter', 'first_mating', 28, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.templateTask)}::uuid, ${q(organizationId)}::uuid, 'Tâche ponctuelle frise', 'veterinary', 'litter', 'first_mating', 30, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.templateWindow)}::uuid, ${q(organizationId)}::uuid, 'Surveillance de la température', 'maternal_health', 'mother', 'first_mating', 40, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.templateLocked)}::uuid, ${q(organizationId)}::uuid, 'Jalon verrouillé frise', 'identification', 'litter', 'first_mating', 35, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.templateTerminal)}::uuid, ${q(organizationId)}::uuid, 'Jalon terminal frise', 'other', 'litter', 'first_mating', 20, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.templatePending)}::uuid, ${q(organizationId)}::uuid, 'Pending ancre frise', 'offspring_health', 'all_offspring', 'actual_birth', 2, 'dog', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_planning_models (id, organization_id, title, species, breed, revision, created_by, updated_by)
    values (${q(ids.model)}::uuid, ${q(organizationId)}::uuid, 'E2E timeline drag modèle', 'dog', 'Golden Retriever', 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litter_planning_model_items (
      id, organization_id, model_id, organization_template_id, item_kind, priority,
      anchor_type, point_offset_days, window_starts_offset_days, window_ends_offset_days,
      display_order, is_required, is_selected_by_default, created_by, updated_by
    ) values
      (${q(ids.itemMilestone)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templateMilestone)}::uuid, 'milestone', 'normal', 'first_mating', 28, null, null, 0, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.itemTask)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templateTask)}::uuid, 'task', 'normal', 'first_mating', 30, null, null, 1, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.itemWindow)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templateWindow)}::uuid, 'window', 'normal', 'first_mating', null, 40, 47, 2, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.itemLocked)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templateLocked)}::uuid, 'milestone', 'normal', 'first_mating', 35, null, null, 3, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.itemTerminal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templateTerminal)}::uuid, 'milestone', 'normal', 'first_mating', 20, null, null, 4, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.itemPending)}::uuid, ${q(organizationId)}::uuid, ${q(ids.model)}::uuid, ${q(ids.templatePending)}::uuid, 'task', 'normal', 'actual_birth', 2, null, null, 5, true, true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

async function applyPlan() {
  const client = await createAuthenticatedSupabaseClient();
  const result = await client.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.model,
    p_client_command_id: ids.applyCommand,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(result.error).toBeNull();
  expect(result.data?.[0]?.outcome).toBe("success");

  sql(`
    update public.litter_care_tasks
    set scheduled_local_time = '09:30:00',
        schedule_timezone_name = 'Europe/Paris',
        suggested_local_time = '09:30:00'
    where litter_id = ${q(ids.litter)}::uuid
      and title = 'Radiographie de comptage';

    update public.litter_care_tasks
    set retained_starts_local_time = '08:00:00',
        retained_ends_local_time = '18:00:00',
        schedule_timezone_name = 'Europe/Paris',
        suggested_starts_local_time = '08:00:00',
        suggested_ends_local_time = '18:00:00'
    where litter_id = ${q(ids.litter)}::uuid
      and title = 'Surveillance de la température';

    update public.litter_care_tasks
    set is_schedule_locked = true,
        schedule_locked_at = now(),
        schedule_locked_by = ${q(ownerId)}::uuid
    where litter_id = ${q(ids.litter)}::uuid
      and title = 'Jalon verrouillé frise';

    update public.litter_care_tasks
    set status = 'done',
        resolution_command_id = ${q(`${prefix}31`)}::uuid,
        resolved_at = now(),
        resolved_timezone_name = 'Europe/Paris',
        resolved_by = ${q(ownerId)}::uuid
    where litter_id = ${q(ids.litter)}::uuid
      and title = 'Jalon terminal frise';
  `);
}

async function login(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 45_000 });
}

async function gotoJournal(page: Page, litterId: string) {
  const url = `/litters/journal?litter=${litterId}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await expect(
        page.getByRole("region", { name: "Planning de la portée", exact: true }),
      ).toBeVisible({ timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(4_000);
    }
  }
  throw lastError;
}

function taskRow(title: string) {
  return JSON.parse(
    sql(`select json_build_object(
      'id', id::text,
      'plannedFor', planned_for::text,
      'suggestedFor', suggested_for::text,
      'scheduledLocalTime', scheduled_local_time::text,
      'timezone', schedule_timezone_name,
      'scheduleSource', schedule_source,
      'revision', revision_no,
      'locked', is_schedule_locked,
      'retainedStartsOn', retained_starts_on::text,
      'retainedEndsOn', retained_ends_on::text,
      'retainedStartsLocalTime', retained_starts_local_time::text,
      'retainedEndsLocalTime', retained_ends_local_time::text,
      'suggestedStartsOn', suggested_starts_on::text,
      'suggestedEndsOn', suggested_ends_on::text
    )::text from public.litter_care_tasks
    where litter_id = ${q(ids.litter)}::uuid and title = ${q(title)};`),
  ) as Record<string, string | number | boolean | null>;
}

function scheduleCommandCount() {
  return Number(
    sql(`select count(*)::text from public.litter_care_task_schedule_commands
      where litter_id = ${q(ids.litter)}::uuid;`),
  );
}

function scheduleChangeCount() {
  return Number(
    sql(`select count(*)::text from public.litter_care_task_schedule_changes
      where litter_id = ${q(ids.litter)}::uuid;`),
  );
}

async function dragHandleByDays(
  page: Page,
  handle: ReturnType<Page["locator"]>,
  days: number,
  previewHost?: ReturnType<Page["locator"]>,
) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const track = page
    .getByRole("region", { name: "Planning de la portée", exact: true })
    .locator("div.min-w-\\[48rem\\]");
  const trackBox = await track.boundingBox();
  expect(trackBox).not.toBeNull();
  const pxPerDay = Math.max(24, trackBox!.width / 50);
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  const sign = Math.sign(days) || 1;
  const targetAbs = Math.abs(days);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  let reached = false;
  for (let step = 1; step <= targetAbs * 20; step += 1) {
    await page.mouse.move(startX + sign * pxPerDay * (step / 4), startY, { steps: 2 });
    if (previewHost) {
      const text = (await previewHost.textContent()) ?? "";
      const offsetLabel =
        days > 0
          ? `+${targetAbs} jour`
          : days < 0
            ? `−${targetAbs} jour`
            : "0 jour";
      if (text.includes("Aperçu — non enregistré") && text.includes(offsetLabel)) {
        reached = true;
        break;
      }
    }
  }
  if (previewHost) {
    expect(reached).toBe(true);
  }
  return { startX, startY, endX: startX + sign * pxPerDay * targetAbs, pointerId: 0 };
}

async function releasePointerDrag(page: Page) {
  await page.mouse.up();
}

test("manipule graphiquement la frise sans écriture pendant l’aperçu", async ({ page }) => {
  cleanup();
  expectCleanup();
  try {
    createFixtures();
    await applyPlan();

    const beforeLoadCommands = scheduleCommandCount();
    const beforeLoadChanges = scheduleChangeCount();
    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await gotoJournal(page, ids.litter);
    const panel = page.getByRole("region", { name: "Planning de la portée", exact: true });
    await expect(panel).toContainText("Radiographie de comptage");
    await expect(panel).toContainText("Surveillance de la température");
    await expect(panel).toContainText("Suggestion");
    await expect(panel).toContainText("Verrouillé");
    await expect(
      panel.getByText("Jalon terminal frise", { exact: true }),
    ).toHaveCount(0);
    await expect(panel).toContainText("En attente d’une date de référence");
    expect(scheduleCommandCount()).toBe(beforeLoadCommands);
    expect(scheduleChangeCount()).toBe(beforeLoadChanges);

    const milestone = panel.locator("[data-timeline-item]").filter({ hasText: "Radiographie de comptage" });
    const milestoneHandle = milestone.getByRole("button", { name: /modifier la date de Radiographie de comptage/ });
    const locked = panel.locator("[data-timeline-item]").filter({ hasText: "Jalon verrouillé frise" });
    await expect(locked.getByRole("button", { name: /modifier la date/ })).toHaveCount(0);
    await expect(locked.getByRole("button", { name: "Ajuster précisément" })).toBeVisible();

    const beforePoint = taskRow("Radiographie de comptage");
    const commandsBeforeDrag = scheduleCommandCount();
    const drag = await dragHandleByDays(page, milestoneHandle, 2, milestone);
    await expect(milestone).toContainText("Aperçu — non enregistré");
    expect(scheduleCommandCount()).toBe(commandsBeforeDrag);
    await releasePointerDrag(page);
    await expect(panel).toContainText("Programmation modifiée");
    await expect.poll(() => taskRow("Radiographie de comptage").plannedFor).toBe(
      sql(`select (date ${q(String(beforePoint.plannedFor))} + 2)::text;`).trim(),
    );
    const afterPoint = taskRow("Radiographie de comptage");
    expect(afterPoint.suggestedFor).toBe(beforePoint.suggestedFor);
    expect(afterPoint.scheduledLocalTime).toBe("09:30:00");
    expect(afterPoint.timezone).toBe("Europe/Paris");
    expect(afterPoint.scheduleSource).toBe("manual");
    expect(Number(afterPoint.revision)).toBe(Number(beforePoint.revision) + 1);
    expect(scheduleCommandCount()).toBe(commandsBeforeDrag + 1);
    expect(scheduleChangeCount()).toBe(beforeLoadChanges + 1);

    await gotoJournal(page, ids.litter);
    await expect(panel).toContainText("Surveillance de la température");

    const windowCard = panel.locator("[data-timeline-window]").filter({ hasText: "Surveillance de la température" });
    const beforeWindow = taskRow("Surveillance de la température");
    const endHandle = windowCard.getByRole("button", { name: /modifier la fin/ });
    const commandsBeforeEnd = scheduleCommandCount();
    await dragHandleByDays(page, endHandle, 2, windowCard);
    await expect(windowCard).toContainText("Aperçu — non enregistré");
    await expect(windowCard).toContainText("Fin déplacée de");
    expect(scheduleCommandCount()).toBe(commandsBeforeEnd);
    await releasePointerDrag(page);
    await expect.poll(() => taskRow("Surveillance de la température").retainedEndsOn).toBe(
      sql(`select (date ${q(String(beforeWindow.retainedEndsOn))} + 2)::text;`).trim(),
    );
    expect(taskRow("Surveillance de la température").retainedStartsOn).toBe(beforeWindow.retainedStartsOn);
    expect(taskRow("Surveillance de la température").retainedStartsLocalTime).toBe("08:00:00");
    expect(taskRow("Surveillance de la température").retainedEndsLocalTime).toBe("18:00:00");

    await gotoJournal(page, ids.litter);
    const midWindow = taskRow("Surveillance de la température");
    const startHandle = windowCard.getByRole("button", { name: /modifier le début/ });
    const commandsBeforeStart = scheduleCommandCount();
    await dragHandleByDays(page, startHandle, -1, windowCard);
    expect(scheduleCommandCount()).toBe(commandsBeforeStart);
    await releasePointerDrag(page);
    await expect.poll(() => taskRow("Surveillance de la température").retainedStartsOn).toBe(
      sql(`select (date ${q(String(midWindow.retainedStartsOn))} - 1)::text;`).trim(),
    );
    expect(taskRow("Surveillance de la température").retainedEndsOn).toBe(midWindow.retainedEndsOn);

    await gotoJournal(page, ids.litter);
    const beforeMove = taskRow("Surveillance de la température");
    const moveHandle = windowCard.getByRole("button", { name: /Déplacer toute la période/ });
    const durationBefore = sql(`select ((date ${q(String(beforeMove.retainedEndsOn))} - date ${q(String(beforeMove.retainedStartsOn))}) + 1)::text;`).trim();
    await dragHandleByDays(page, moveHandle, 3, windowCard);
    await expect(windowCard).toContainText("Période déplacée de");
    await releasePointerDrag(page);
    await expect.poll(() => taskRow("Surveillance de la température").retainedStartsOn).toBe(
      sql(`select (date ${q(String(beforeMove.retainedStartsOn))} + 3)::text;`).trim(),
    );
    await expect.poll(() => taskRow("Surveillance de la température").retainedEndsOn).toBe(
      sql(`select (date ${q(String(beforeMove.retainedEndsOn))} + 3)::text;`).trim(),
    );
    const afterMove = taskRow("Surveillance de la température");
    expect(sql(`select ((date ${q(String(afterMove.retainedEndsOn))} - date ${q(String(afterMove.retainedStartsOn))}) + 1)::text;`).trim()).toBe(durationBefore);
    expect(afterMove.retainedStartsLocalTime).toBe("08:00:00");
    expect(afterMove.retainedEndsLocalTime).toBe("18:00:00");
    expect(afterMove.suggestedStartsOn).toBe(beforeWindow.suggestedStartsOn);
    expect(afterMove.suggestedEndsOn).toBe(beforeWindow.suggestedEndsOn);

    await gotoJournal(page, ids.litter);
    const endHandleForKeyboard = windowCard.getByRole("button", { name: /modifier la fin/ });
    await endHandleForKeyboard.focus();
    await page.keyboard.press("ArrowRight");
    await expect(windowCard).toContainText("Fin déplacée de +1 jour");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(windowCard).toContainText("Fin déplacée de −6 jours");
    await page.keyboard.press("Escape");

    const milestoneHandleFresh = milestone.getByRole("button", { name: /modifier la date de Radiographie de comptage/ });
    const commandsBeforeCancel = scheduleCommandCount();
    await milestoneHandleFresh.dispatchEvent("pointerdown", { pointerId: 1, bubbles: true, button: 0, clientX: drag.startX, clientY: drag.startY });
    await milestoneHandleFresh.dispatchEvent("pointercancel", { pointerId: 1, bubbles: true });
    expect(scheduleCommandCount()).toBe(commandsBeforeCancel);

    await milestoneHandleFresh.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    expect(scheduleCommandCount()).toBe(commandsBeforeCancel);

    await gotoJournal(page, ids.litter);
    const handleAfterReload = page
      .getByRole("region", { name: "Planning de la portée", exact: true })
      .locator("[data-timeline-item]")
      .filter({ hasText: "Radiographie de comptage" })
      .getByRole("button", { name: /modifier la date de Radiographie de comptage/ });
    const keyBase = taskRow("Radiographie de comptage");
    await handleAfterReload.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect.poll(() => taskRow("Radiographie de comptage").plannedFor).toBe(
      sql(`select (date ${q(String(keyBase.plannedFor))} + 1)::text;`).trim(),
    );

    await gotoJournal(page, ids.litter);
    await expect(panel).toContainText("Tâche ponctuelle frise");

    const staleBefore = taskRow("Tâche ponctuelle frise");
    sql(`update public.litter_care_tasks set revision_no = revision_no + 1 where id = ${q(String(staleBefore.id))}::uuid;`);
    const staleCard = panel
      .locator("[data-timeline-item]")
      .filter({ hasText: "Tâche ponctuelle frise" });
    const staleHandle = staleCard.getByRole("button", {
      name: /modifier la date de Tâche ponctuelle frise/,
    });
    const commandsBeforeStale = scheduleCommandCount();
    await staleHandle.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(staleCard.getByRole("alert")).toContainText("modifiée ailleurs", {
      timeout: 15_000,
    });
    await expect(staleCard.getByRole("button", { name: "Recharger le Journal" })).toBeVisible();
    await expect(staleCard.getByRole("button", { name: /modifier la date/ })).toHaveCount(0);
    expect(scheduleCommandCount()).toBe(commandsBeforeStale + 1);
    const commandsAfterStale = scheduleCommandCount();
    await staleCard.click({ position: { x: 8, y: 8 } });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    expect(scheduleCommandCount()).toBe(commandsAfterStale);

    const lockedBefore = taskRow("Jalon verrouillé frise");
    const commandsBeforeLocked = scheduleCommandCount();
    await locked.getByRole("button", { name: "Ajuster précisément" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Programmation verrouillée");
    await dialog.getByLabel("Date retenue").fill("2026-08-10");
    await dialog.getByRole("button", { name: "Remplacer la programmation" }).click();
    await expect(dialog.getByRole("alert")).toContainText("confirmation", { timeout: 10_000 });
    expect(taskRow("Jalon verrouillé frise").plannedFor).toBe(lockedBefore.plannedFor);
    expect(scheduleCommandCount()).toBe(commandsBeforeLocked);
    await dialog.getByLabel(/Je confirme le remplacement/).check();
    await dialog.getByRole("button", { name: "Remplacer la programmation" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => taskRow("Jalon verrouillé frise").plannedFor).toBe("2026-08-10");
    expect(Number(taskRow("Jalon verrouillé frise").revision)).toBe(Number(lockedBefore.revision) + 1);
    expect(scheduleCommandCount()).toBe(commandsBeforeLocked + 1);

    await login(page, ...credentials.member);
    await gotoJournal(page, ids.litter);
    await expect(page.getByRole("region", { name: "Planning de la portée", exact: true }).getByRole("button", { name: /modifier la date/ }).first()).toBeVisible();

    await login(page, ...credentials.viewer);
    await gotoJournal(page, ids.litter);
    await expect(page.getByRole("region", { name: "Planning de la portée", exact: true }).getByRole("button")).toHaveCount(0);

    await login(page, ...credentials.foreign);
    await page.goto(`/litters/journal?litter=${ids.litter}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(page.getByText("Radiographie de comptage")).toHaveCount(0);

    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await gotoJournal(page, ids.litter);
    await expect(page.getByRole("heading", { name: "Tâches de suivi" }).locator("xpath=ancestor::section[1]")).toContainText("Radiographie de comptage");
    expect(sql(`select count(*)::text from public.litter_planning_models where id = ${q(ids.model)}::uuid and revision = 1;`)).toBe("1");
    expect(sql(`select mating_date::text from public.litters where id = ${q(ids.litter)}::uuid;`)).toBe("2026-07-01");
  } finally {
    cleanup();
    expectCleanup();
  }
});
