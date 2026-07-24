import { expect, test, type Page } from "@playwright/test";

import { formatLitterJournalBusinessDate } from "@/features/litter-journal/date";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f260002-0000-4000-8000-0000000000";
const ids = { mother: `${prefix}01`, litter: `${prefix}02`, point: `${prefix}10`, window: `${prefix}11` } as const;
const pointReason = "Report demandé par l’éleveur";
const windowReason = "Fenêtre reportée après validation";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function addCivilDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function formatCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function cleanup() {
  sql(`
    delete from public.litter_care_task_schedule_changes where task_id::text like '9f260002-%';
    delete from public.litter_care_task_schedule_commands where task_id::text like '9f260002-%';
    delete from public.litter_care_tasks where id::text like '9f260002-%' or litter_id::text like '9f260002-%';
    delete from public.litters where id::text like '9f260002-%';
    delete from public.animals where id::text like '9f260002-%';
  `);
}

function counts() {
  return JSON.parse(sql(`select json_build_object(
    'changes',(select count(*) from public.litter_care_task_schedule_changes where task_id::text like '9f260002-%'),
    'commands',(select count(*) from public.litter_care_task_schedule_commands where task_id::text like '9f260002-%'),
    'tasks',(select count(*) from public.litter_care_tasks where id::text like '9f260002-%' or litter_id::text like '9f260002-%'),
    'litters',(select count(*) from public.litters where id::text like '9f260002-%'),
    'animals',(select count(*) from public.animals where id::text like '9f260002-%')
  )::text;`)) as Record<string, number>;
}

function fixtures({ today, yesterday }: { today: string; yesterday: string }) {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by)
    values (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'Mère report aujourd’hui','dog','Golden Retriever','female','breeding','owned',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters (id,organization_id,name,species,breed,mother_id,status,created_by,updated_by)
    values (${q(ids.litter)}::uuid,${q(organizationId)}::uuid,'E2E report aujourd’hui','dog','Golden Retriever',${q(ids.mother)}::uuid,'birth_expected',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id,organization_id,litter_id,source,system_template_code,occurrence_no,category,target_scope,title,anchor_type,anchor_date,offset_days,item_kind,planned_for,suggested_for,schedule_source,status,creation_command_id,created_by,updated_by)
    values (${q(ids.point)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'system_template','today-reschedule-point',1,'preparation','litter','Tâche à reporter','expected_birth',${q(today)}::date,0,'milestone',${q(today)}::date,${q(today)}::date,'suggested','planned',${q(`${prefix}20`)}::uuid,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litter_care_tasks (id,organization_id,litter_id,source,system_template_code,occurrence_no,category,target_scope,title,anchor_type,anchor_date,offset_days,item_kind,suggested_starts_on,suggested_ends_on,retained_starts_on,retained_ends_on,schedule_source,is_schedule_locked,schedule_locked_at,schedule_locked_by,status,creation_command_id,created_by,updated_by)
    values (${q(ids.window)}::uuid,${q(organizationId)}::uuid,${q(ids.litter)}::uuid,'system_template','today-reschedule-window',1,'preparation','litter','Fenêtre verrouillée à reporter','expected_birth',${q(yesterday)}::date,0,'window',${q(yesterday)}::date,${q(today)}::date,${q(yesterday)}::date,${q(today)}::date,'suggested',true,now(),${q(ownerId)}::uuid,'planned',${q(`${prefix}21`)}::uuid,${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  if (await page.getByLabel("Email").isVisible()) {
    await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
    await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/\/candidatures(?:\?|$)/);
  }
}

test("reporte les éléments actifs depuis Aujourd’hui en préservant leur traçabilité", async ({ page }) => {
  cleanup();
  expect(counts()).toEqual({ changes: 0, commands: 0, tasks: 0, litters: 0, animals: 0 });
  try {
    const todayDate = formatLitterJournalBusinessDate(new Date());
    const yesterday = addCivilDays(todayDate, -1);
    const tomorrow = addCivilDays(todayDate, 1);
    const dayAfterTomorrow = addCivilDays(todayDate, 2);
    expect(Number(sql(`select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role='owner' and status='active';`))).toBe(1);
    fixtures({ today: todayDate, yesterday });
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.litter}`);
    const today = page.getByRole("heading", { name: "Aujourd’hui" }).locator("xpath=ancestor::section[1]");
    const point = today.locator("li").filter({ hasText: "Tâche à reporter" });
    const window = today.locator("li").filter({ hasText: "Fenêtre verrouillée à reporter" });
    await expect(point.getByRole("button", { name: "Reporter" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Reporter" })).toBeVisible();

    await point.getByRole("button", { name: "Reporter" }).click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Date suggérée : ${formatCivilDate(todayDate)}`);
    await expect(dialog.getByLabel("Date retenue")).toHaveValue(todayDate);
    await dialog.getByLabel("Date retenue").fill(tomorrow);
    await dialog.getByLabel("Motif (facultatif)").fill(pointReason);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect(point).toHaveCount(0);
    expect(JSON.parse(sql(`select json_build_object('suggested',suggested_for::text,'planned',planned_for::text,'source',schedule_source,'revision',revision_no)::text from public.litter_care_tasks where id=${q(ids.point)}::uuid;`))).toEqual({ suggested: todayDate, planned: tomorrow, source: "manual", revision: 1 });
    const pointCommand = JSON.parse(sql(`select json_agg(json_build_object('id',id::text,'clientCommandId',client_command_id::text,'changeId',result->>'changeId','createdBy',created_by::text,'reason',payload->>'reason','result',result) order by created_at desc)::text from public.litter_care_task_schedule_commands where task_id=${q(ids.point)}::uuid and command_type='reschedule_point' and outcome='success';`));
    expect(pointCommand).toHaveLength(1);
    expect(pointCommand[0]).toMatchObject({ createdBy: ownerId, reason: pointReason });
    expect(pointCommand[0].changeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(sql(`select json_build_object('id',id::text,'taskId',task_id::text,'changedBy',changed_by::text,'reason',reason,'type',change_type,'previous',previous_planned_for::text,'result',result_planned_for::text)::text from public.litter_care_task_schedule_changes where id=${q(pointCommand[0].changeId)}::uuid;`))).toEqual({ id: pointCommand[0].changeId, taskId: ids.point, changedBy: ownerId, reason: pointReason, type: "reschedule_point", previous: todayDate, result: tomorrow });

    await window.getByRole("button", { name: "Reporter" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date retenue de début").fill(tomorrow);
    await dialog.getByLabel("Date retenue de fin").fill(dayAfterTomorrow);
    await dialog.getByLabel("Motif (facultatif)").fill(windowReason);
    await dialog.getByRole("button", { name: "Remplacer la programmation" }).click();
    await expect(dialog.getByRole("alert")).toContainText("La confirmation du remplacement verrouillé est requise.");
    await dialog.getByLabel(/Je confirme le remplacement/).check();
    await dialog.getByRole("button", { name: "Remplacer la programmation" }).click();
    await expect(dialog).toBeHidden();
    await expect(window).toHaveCount(0);
    expect(JSON.parse(sql(`select json_build_object('suggestedStart',suggested_starts_on::text,'suggestedEnd',suggested_ends_on::text,'start',retained_starts_on::text,'end',retained_ends_on::text,'locked',is_schedule_locked)::text from public.litter_care_tasks where id=${q(ids.window)}::uuid;`))).toEqual({ suggestedStart: yesterday, suggestedEnd: todayDate, start: tomorrow, end: dayAfterTomorrow, locked: true });
    const windowCommand = JSON.parse(sql(`select json_agg(json_build_object('id',id::text,'clientCommandId',client_command_id::text,'changeId',result->>'changeId','createdBy',created_by::text,'reason',payload->>'reason','result',result) order by created_at desc)::text from public.litter_care_task_schedule_commands where task_id=${q(ids.window)}::uuid and command_type='replace_locked_window' and outcome='success';`));
    expect(windowCommand).toHaveLength(1);
    expect(windowCommand[0]).toMatchObject({ createdBy: ownerId, reason: windowReason });
    expect(windowCommand[0].changeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(sql(`select json_build_object('id',id::text,'taskId',task_id::text,'changedBy',changed_by::text,'reason',reason,'type',change_type,'previousStart',previous_retained_starts_on::text,'previousEnd',previous_retained_ends_on::text,'resultStart',result_retained_starts_on::text,'resultEnd',result_retained_ends_on::text,'locked',result_is_schedule_locked,'override',locked_override_confirmed)::text from public.litter_care_task_schedule_changes where id=${q(windowCommand[0].changeId)}::uuid;`))).toEqual({ id: windowCommand[0].changeId, taskId: ids.window, changedBy: ownerId, reason: windowReason, type: "replace_locked_window", previousStart: yesterday, previousEnd: todayDate, resultStart: tomorrow, resultEnd: dayAfterTomorrow, locked: true, override: true });
  } finally {
    cleanup();
    expect(counts()).toEqual({ changes: 0, commands: 0, tasks: 0, litters: 0, animals: 0 });
  }
});
