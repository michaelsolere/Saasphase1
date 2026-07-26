import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const prefix = "9f260009-1000-4000-8000-0000000000";
const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  template: `${prefix}10`,
  model: `${prefix}11`,
  itemOvulation: `${prefix}12`,
  itemBirth: `${prefix}13`,
  applyCommand: `${prefix}20`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    set session_replication_role = replica;
    delete from public.litter_care_task_schedule_changes where litter_id::text like '9f260009-1000-%';
    delete from public.litter_care_task_schedule_commands where litter_id::text like '9f260009-1000-%' or client_command_id::text like '9f260009-1000-%';
    delete from public.litter_plan_anchor_recalculation_commands where litter_id::text like '9f260009-1000-%' or client_command_id::text like '9f260009-1000-%';
    delete from public.litter_plan_application_commands where litter_id::text like '9f260009-1000-%' or client_command_id::text like '9f260009-1000-%';
    delete from public.litter_care_tasks where litter_id::text like '9f260009-1000-%';
    delete from public.litter_plan_items where litter_id::text like '9f260009-1000-%';
    delete from public.litter_plans where litter_id::text like '9f260009-1000-%';
    delete from public.litter_planning_model_items where model_id::text like '9f260009-1000-%';
    delete from public.litter_planning_models where id::text like '9f260009-1000-%';
    delete from public.litter_care_task_templates where id::text like '9f260009-1000-%';
    delete from public.litters where id::text like '9f260009-1000-%';
    delete from public.animals where id::text like '9f260009-1000-%';
    set session_replication_role = origin;
  `);
}

function counts() {
  return JSON.parse(
    sql(`select json_build_object(
      'recalc', (select count(*) from public.litter_plan_anchor_recalculation_commands where litter_id::text like '9f260009-1000-%'),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id::text like '9f260009-1000-%'),
      'litters', (select count(*) from public.litters where id::text like '9f260009-1000-%'),
      'animals', (select count(*) from public.animals where id::text like '9f260009-1000-%')
    )::text;`),
  );
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.beforeEach(() => {
  cleanup();
  expect(counts()).toEqual({ recalc: 0, tasks: 0, litters: 0, animals: 0 });
});

test.afterEach(() => {
  cleanup();
  expect(counts()).toEqual({ recalc: 0, tasks: 0, litters: 0, animals: 0 });
});

test("fiche Portée: dates gestation modifiables et recalcul visibles", async ({
  page,
}) => {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by)
    values (${q(ids.mother)}::uuid,${q(org)}::uuid,'UI ancre mother','dog','Golden Retriever','female','breeding','owned',${q(owner)}::uuid,${q(owner)}::uuid);
    insert into public.litters (
      id,organization_id,name,species,breed,mother_id,status,mating_date,estimated_ovulation_date,created_by,updated_by
    ) values (
      ${q(ids.litter)}::uuid,${q(org)}::uuid,'UI ancre recalcul','dog','Golden Retriever',${q(ids.mother)}::uuid,
      'birth_expected','2026-06-10','2026-06-08',${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_care_task_templates (
      id,organization_id,title,category,target_scope,anchor_type,offset_days,species,revision,created_by,updated_by
    ) values (
      ${q(ids.template)}::uuid,${q(org)}::uuid,'UI ancre template','other','litter','estimated_ovulation',0,'dog',1,${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_planning_models (
      id,organization_id,title,species,breed,revision,created_by,updated_by
    ) values (
      ${q(ids.model)}::uuid,${q(org)}::uuid,'UI ancre model','dog','Golden Retriever',1,${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_planning_model_items (
      id,organization_id,model_id,organization_template_id,item_kind,priority,anchor_type,
      point_offset_days,display_order,is_required,is_selected_by_default,created_by,updated_by
    ) values
      (${q(ids.itemOvulation)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','estimated_ovulation',10,0,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
      (${q(ids.itemBirth)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'milestone','normal','expected_birth',0,1,true,true,${q(owner)}::uuid,${q(owner)}::uuid);
  `);

  const client = await createAuthenticatedSupabaseClient();
  const applied = await client.rpc("apply_litter_planning_model", {
    p_litter_id: ids.litter,
    p_planning_model_id: ids.model,
    p_client_command_id: ids.applyCommand,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applied.error).toBeNull();
  expect(applied.data?.[0]?.outcome).toBe("success");

  await login(page);
  await page.goto(`/litters/${ids.litter}`);
  const section = page.locator("#dates-gestation");
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await expect(page.getByTestId("gestation-mating-date-readonly")).toBeVisible();
  await expect(page.getByTestId("gestation-mating-date-2-readonly")).toBeVisible();
  await expect(page.getByTestId("gestation-actual-birth-readonly")).toBeVisible();
  await expect(page.getByTestId("gestation-estimated-ovulation-input")).toBeVisible();
  await expect(page.getByTestId("gestation-expected-birth-input")).toBeVisible();
  await expect(page.getByTestId("gestation-expected-birth-hint")).toContainText(
    "ovulation + 63",
  );

  // General edit form must not expose gestation date inputs
  const editSection = page.locator("#modifier-portee");
  await editSection.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await expect(page.locator("#litter-edit-ovulation-date")).toHaveCount(0);
  await expect(page.locator("#litter-edit-mating-date")).toHaveCount(0);

  await section.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.getByTestId("gestation-estimated-ovulation-input").fill("2026-06-12");
  await page.getByTestId("gestation-anchors-submit").click();

  await expect(page.getByTestId("gestation-anchors-success")).toContainText(
    "Le planning a été recalculé",
    { timeout: 15_000 },
  );
  expect(
    sql(`select estimated_ovulation_date::text from public.litters where id=${q(ids.litter)}::uuid;`),
  ).toBe("2026-06-12");
  expect(
    Number(
      sql(`select count(*) from public.litter_plan_anchor_recalculation_commands where litter_id=${q(ids.litter)}::uuid;`),
    ),
  ).toBe(1);
});
