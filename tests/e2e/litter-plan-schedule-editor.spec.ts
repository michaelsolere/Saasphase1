import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";
import {
  rescheduleLitterCareTaskPointCore,
  rescheduleLitterCareTaskWindowCore,
} from "../../src/features/litter-journal/litter-care-tasks-core";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f240001-0000-4000-8000-0000000000";
const ids = { mother: `${prefix}01`, litter: `${prefix}02`, point: `${prefix}10`, window: `${prefix}11`, terminal: `${prefix}12` } as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = 'owner' where id = ${q(ownerMembershipId)}::uuid;
    set session_replication_role = origin;
    delete from public.litter_care_task_schedule_changes where task_id::text like '9f240001-%';
    delete from public.litter_care_task_schedule_commands where task_id::text like '9f240001-%';
    delete from public.litter_care_tasks where id::text like '9f240001-%' or litter_id::text like '9f240001-%';
    delete from public.litters where id::text like '9f240001-%';
    delete from public.animals where id::text like '9f240001-%';
  `);
}

function counts() {
  return JSON.parse(sql(`select json_build_object(
    'changes',(select count(*) from public.litter_care_task_schedule_changes where task_id::text like '9f240001-%'),
    'commands',(select count(*) from public.litter_care_task_schedule_commands where task_id::text like '9f240001-%'),
    'tasks',(select count(*) from public.litter_care_tasks where id::text like '9f240001-%' or litter_id::text like '9f240001-%'),
    'litters',(select count(*) from public.litters where id::text like '9f240001-%'),
    'animals',(select count(*) from public.animals where id::text like '9f240001-%')
  )::text;`)) as Record<string, number>;
}

function fixtures() {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by)
    values (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'Éditrice planning','dog','Golden Retriever','female','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters (id,organization_id,name,species,breed,mother_id,status,created_by,updated_by)
    values (${q(ids.litter)}::uuid,${q(organizationId)}::uuid,'E2E éditeur programmation','dog','Golden Retriever',${q(ids.mother)}::uuid,'birth_expected',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id,organization_id,litter_id,source,organization_template_id,system_template_code,litter_plan_item_id,occurrence_no,category,target_scope,title,anchor_type,anchor_date,offset_days,item_kind,planned_for,suggested_for,suggested_local_time,scheduled_local_time,schedule_timezone_name,schedule_source,status,creation_command_id,created_by,updated_by)
    values (${q(ids.point)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'system_template',null,'schedule-editor-point',null,1,'preparation','litter','Jalon éditable','expected_birth','2026-07-30',0,'milestone','2026-07-30','2026-07-30',null,null,null,'suggested','planned',${q(`${prefix}20`)}::uuid,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id,organization_id,litter_id,source,organization_template_id,system_template_code,litter_plan_item_id,occurrence_no,category,target_scope,title,anchor_type,anchor_date,offset_days,item_kind,planned_for,suggested_for,suggested_starts_on,suggested_ends_on,retained_starts_on,retained_ends_on,schedule_source,status,creation_command_id,created_by,updated_by)
    values (${q(ids.window)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'system_template',null,'schedule-editor-window',null,1,'preparation','litter','Fenêtre éditable','expected_birth','2026-07-29',0,'window',null,null,'2026-07-29','2026-08-02','2026-07-29','2026-08-02','suggested','planned',${q(`${prefix}21`)}::uuid,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id,organization_id,litter_id,source,occurrence_no,category,target_scope,title,item_kind,planned_for,status,creation_command_id,resolution_command_id,resolved_at,resolved_timezone_name,resolved_by,created_by,updated_by)
    values (${q(ids.terminal)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'manual',1,'preparation','litter','Jalon terminal','milestone','2026-07-30','done',${q(`${prefix}22`)}::uuid,${q(`${prefix}23`)}::uuid,now(),'UTC',${q(ownerId)}::uuid,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

async function verifyE2eOwnerFixture() {
  const fixture = JSON.parse(sql(`select json_build_object(
    'authUsers', (
      select count(*) from auth.users
      where id = ${q(ownerId)}::uuid
        and email = ${q(E2E_OWNER_EMAIL)}
        and email_confirmed_at is not null
        and encrypted_password is not null
    ),
    'matchingEmails', (
      select count(*) from auth.users where email = ${q(E2E_OWNER_EMAIL)}
    ),
    'profiles', (
      select count(*) from public.profiles where id = ${q(ownerId)}::uuid
    ),
    'memberships', (
      select count(*) from public.memberships
      where id = ${q(ownerMembershipId)}::uuid
        and organization_id = ${q(organizationId)}::uuid
        and profile_id = ${q(ownerId)}::uuid
        and status = 'active'
        and role in ('owner', 'admin', 'member')
    )
  )::text;`)) as Record<string, number>;

  expect(fixture).toEqual({
    authUsers: 1,
    matchingEmails: 1,
    profiles: 1,
    memberships: 1,
  });

  const client = await createAuthenticatedSupabaseClient();
  const { data, error } = await client.auth.getUser();

  expect(error).toBeNull();
  expect(data.user).toMatchObject({ id: ownerId, email: E2E_OWNER_EMAIL });
}

async function login(page: Page) {
  const failedResponses: string[] = [];
  const trackFailedResponse = (response: { status: () => number; url: () => string }) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on("response", trackFailedResponse);

  const loginAlert = page.locator("form").getByRole("alert");

  try {
    await page.goto("/login");
    const email = page.getByLabel("Email");
    const initialOutcome = await Promise.race([
      page.waitForURL(/\/candidatures(?:\?|$)/).then(() => "authenticated" as const),
      email.waitFor({ state: "visible" }).then(() => "form" as const),
    ]);

    if (initialOutcome === "authenticated") {
      return;
    }

    await email.fill(E2E_OWNER_EMAIL);
    await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();

    const outcome = await Promise.race([
      page.waitForURL(/\/candidatures(?:\?|$)/).then(() => "authenticated" as const),
      loginAlert.waitFor({ state: "visible" }).then(() => "error" as const),
    ]).catch(async (error) => {
      const alert = await loginAlert.textContent().catch(() => null);
      throw new Error(
        `Owner E2E login did not reach the protected page; final URL: ${page.url()}; alert: ${alert?.trim() || "none"}; failed responses: ${failedResponses.join(", ") || "none"}`,
        { cause: error },
      );
    });

    if (outcome === "error") {
      throw new Error(
        `Owner E2E login failed; final URL: ${page.url()}; alert: ${(await loginAlert.textContent())?.trim() || "unknown login alert"}; failed responses: ${failedResponses.join(", ") || "none"}`,
      );
    }
  } finally {
    page.off("response", trackFailedResponse);
  }
}

test("édite la programmation matérialisée sans effacer la suggestion", async ({ page }) => {
  cleanup(); expect(counts()).toEqual({ changes: 0, commands: 0, tasks: 0, litters: 0, animals: 0 });
  try {
    fixtures(); await verifyE2eOwnerFixture(); await login(page); await page.goto(`/litters/journal?litter=${ids.litter}`);
    const panel = page.getByRole("heading", { name: "Tâches de suivi" }).locator("xpath=ancestor::section[1]");
    const point = panel.locator("li").filter({ hasText: "Jalon éditable" });
    await expect(point).toContainText("Date suggérée : 30 juillet 2026");
    await expect(point).toContainText("Selon la suggestion");
    await point.getByRole("button", { name: "Modifier la programmation" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date retenue").fill("2026-07-31");
    await dialog.getByLabel("Heure (facultative)").fill("10:30");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect(point).toContainText("Date retenue : 31 juillet 2026 à 10 h 30");
    await expect(point).toContainText("Ajustée manuellement");
    expect(sql(`select suggested_for::text || ':' || planned_for::text || ':' || schedule_source from public.litter_care_tasks where id=${q(ids.point)}::uuid;`)).toBe("2026-07-30:2026-07-31:manual");

    const window = panel.locator("li").filter({ hasText: "Fenêtre éditable" });
    await window.getByRole("button", { name: "Modifier la programmation" }).click(); dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date retenue de début").fill("2026-08-03");
    await expect(dialog.getByRole("alert")).toContainText("La date de début doit précéder");
    await dialog.getByLabel("Date retenue de début").fill("2026-07-30");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(window).toContainText("Fenêtre retenue : du 30 juillet 2026 au 02 août 2026");

    await point.getByRole("button", { name: "Modifier la programmation" }).click(); dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Verrouiller la programmation" }).click();
    await expect(dialog).toBeHidden(); await expect(point).toContainText("Verrouillée");
    await point.getByRole("button", { name: "Modifier la programmation" }).click(); dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Remplacer la programmation" }).click();
    await expect(dialog.getByRole("alert")).toContainText("La confirmation du remplacement verrouillé est requise.");
    await dialog.getByLabel(/Je confirme le remplacement/).check();
    await dialog.getByRole("button", { name: "Remplacer la programmation" }).click();
    await expect(dialog).toBeHidden();
    await point.getByRole("button", { name: "Modifier la programmation" }).click(); dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Déverrouiller" }).click(); await expect(dialog).toBeHidden();
    await point.getByRole("button", { name: "Modifier la programmation" }).click(); dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Revenir à la suggestion" }).click(); await expect(dialog).toBeHidden();
    await expect(point).toContainText("Selon la suggestion");

    sql(`set session_replication_role=replica; update public.memberships set role='viewer' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);
    await page.reload(); await expect(panel.getByRole("button", { name: "Modifier la programmation" })).toHaveCount(0);
    await expect(panel.locator("li").filter({ hasText: "Jalon terminal" }).getByRole("button", { name: "Modifier la programmation" })).toHaveCount(0);

    const client = await createAuthenticatedSupabaseClient();
    await expect(rescheduleLitterCareTaskPointCore({ taskId: ids.point, clientCommandId: `${prefix}30`, expectedRevisionNo: 0, plannedFor: "2026-08-01" }, client)).resolves.toMatchObject({ outcome: "error", error: { code: "forbidden" } });
    const owner = await createAuthenticatedSupabaseClient();
    sql(`set session_replication_role=replica; update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);
    await expect(rescheduleLitterCareTaskWindowCore({ taskId: ids.window, clientCommandId: `${prefix}31`, expectedRevisionNo: 0, retainedStartsOn: "2026-08-03", retainedEndsOn: "2026-08-02" }, owner)).resolves.toMatchObject({ outcome: "error", error: { code: "invalid_input" } });
    await expect(rescheduleLitterCareTaskPointCore({ taskId: ids.point, clientCommandId: `${prefix}32`, expectedRevisionNo: 0, plannedFor: "2026-08-01" }, owner)).resolves.toMatchObject({ outcome: "error", error: { code: "stale_revision" } });
  } finally { cleanup(); expect(counts()).toEqual({ changes: 0, commands: 0, tasks: 0, litters: 0, animals: 0 }); }
});
