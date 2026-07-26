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
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f260009-1000-4000-8000-0000000000";
const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  litterNoMother: `${prefix}03`,
  template: `${prefix}10`,
  model: `${prefix}11`,
  itemOvulation: `${prefix}12`,
  itemBirth: `${prefix}13`,
  applyCommand: `${prefix}20`,
  concurrentCommand: `${prefix}21`,
  forgedLitter: `${prefix}99`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships
      set role = 'owner'
      where id = ${q(ownerMembershipId)}::uuid
        and organization_id = ${q(org)}::uuid
        and profile_id = ${q(owner)}::uuid;
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

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships
      set role = ${q(role)}
      where id = ${q(ownerMembershipId)}::uuid
        and organization_id = ${q(org)}::uuid
        and profile_id = ${q(owner)}::uuid;
    set session_replication_role = origin;
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function openGestationSection(page: Page) {
  const section = page.locator("#dates-gestation");
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  return section;
}

function seedLitterWithPlan(options?: { motherId?: string | null; litterId?: string }) {
  const litterId = options?.litterId ?? ids.litter;
  const motherId =
    options && "motherId" in options ? options.motherId : ids.mother;
  const motherSql =
    motherId === null ? "null" : `${q(motherId)}::uuid`;

  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by)
    values (${q(ids.mother)}::uuid,${q(org)}::uuid,'UI ancre mother','dog','Golden Retriever','female','breeding','owned',${q(owner)}::uuid,${q(owner)}::uuid)
    on conflict (id) do nothing;
    insert into public.litters (
      id,organization_id,name,species,breed,mother_id,status,mating_date,estimated_ovulation_date,created_by,updated_by
    ) values (
      ${q(litterId)}::uuid,${q(org)}::uuid,'UI ancre recalcul','dog','Golden Retriever',${motherSql},
      'birth_expected','2026-06-10','2026-06-08',${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_care_task_templates (
      id,organization_id,title,category,target_scope,anchor_type,offset_days,species,revision,created_by,updated_by
    ) values (
      ${q(ids.template)}::uuid,${q(org)}::uuid,'UI ancre template','other','litter','estimated_ovulation',0,'dog',1,${q(owner)}::uuid,${q(owner)}::uuid
    ) on conflict (id) do nothing;
    insert into public.litter_planning_models (
      id,organization_id,title,species,breed,revision,created_by,updated_by
    ) values (
      ${q(ids.model)}::uuid,${q(org)}::uuid,'UI ancre model','dog','Golden Retriever',1,${q(owner)}::uuid,${q(owner)}::uuid
    ) on conflict (id) do nothing;
    insert into public.litter_planning_model_items (
      id,organization_id,model_id,organization_template_id,item_kind,priority,anchor_type,
      point_offset_days,display_order,is_required,is_selected_by_default,created_by,updated_by
    ) values
      (${q(ids.itemOvulation)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','estimated_ovulation',10,0,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
      (${q(ids.itemBirth)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'milestone','normal','expected_birth',0,1,true,true,${q(owner)}::uuid,${q(owner)}::uuid)
    on conflict (id) do nothing;
  `);
}

async function applyPlan(litterId: string, commandId: string) {
  const client = await createAuthenticatedSupabaseClient();
  const applied = await client.rpc("apply_litter_planning_model", {
    p_litter_id: litterId,
    p_planning_model_id: ids.model,
    p_client_command_id: commandId,
    p_expected_model_revision: 1,
    p_expected_plan_revision: null,
    p_selected_model_item_ids: null,
    p_timezone_name: "Europe/Paris",
  });
  expect(applied.error).toBeNull();
  expect(applied.data?.[0]?.outcome).toBe("success");
  return client;
}

test.beforeEach(() => {
  cleanup();
  expect(counts()).toEqual({ recalc: 0, tasks: 0, litters: 0, animals: 0 });
});

test.afterEach(() => {
  cleanup();
  expect(counts()).toEqual({ recalc: 0, tasks: 0, litters: 0, animals: 0 });
});

test("fiche Portée: intention serveur, mutation, idempotence et navigation", async ({
  page,
}) => {
  seedLitterWithPlan();
  await applyPlan(ids.litter, ids.applyCommand);

  await login(page);
  await page.goto(`/litters/${ids.litter}`);
  await openGestationSection(page);

  const form = page.getByTestId("gestation-anchors-form");
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="client_command_id"]')).toHaveCount(0);
  await expect(form.locator('input[name="expected_litter_updated_at"]')).toHaveCount(0);
  await expect(form.locator('input[name="expected_plan_revision"]')).toHaveCount(0);
  await expect(form.locator('input[name="litter_id"]')).toHaveCount(0);
  await expect(page.locator('#dates-gestation input[name="client_command_id"]')).toHaveCount(0);
  await expect(page.locator('#dates-gestation input[name="litter_id"]')).toHaveCount(0);

  await expect(page.getByTestId("gestation-mating-date-readonly")).toBeVisible();
  await expect(page.getByTestId("gestation-mating-date-2-readonly")).toBeVisible();
  await expect(page.getByTestId("gestation-actual-birth-readonly")).toBeVisible();
  await expect(page.getByTestId("gestation-estimated-ovulation-input")).toBeVisible();
  await expect(page.getByTestId("gestation-expected-birth-input")).toBeVisible();
  await expect(page.getByTestId("gestation-expected-birth-hint")).toContainText(
    "ovulation + 63",
  );

  const reproductionLinks = page.getByTestId("gestation-reproduction-link");
  await expect(reproductionLinks).toHaveCount(2);
  for (const link of await reproductionLinks.all()) {
    await expect(link).toHaveAttribute(
      "href",
      `/animals/${ids.mother}/reproduction`,
    );
  }
  await expect(page.locator('#dates-gestation a[href="/reproduction"]')).toHaveCount(0);
  await expect(
    page.locator(`#dates-gestation a[href="/animals/${ids.mother}/reproduction"]`),
  ).toHaveCount(2);

  const journalLink = page.getByTestId("gestation-journal-link");
  await expect(journalLink).toHaveAttribute(
    "href",
    `/litters/journal?litter=${ids.litter}`,
  );

  await Promise.all([
    page.waitForURL(new RegExp(`/animals/${ids.mother}/reproduction`)),
    reproductionLinks.first().click(),
  ]);
  await expect(page).toHaveURL(new RegExp(`/animals/${ids.mother}/reproduction/?$`));

  await page.goto(`/litters/${ids.litter}`);
  await openGestationSection(page);
  await Promise.all([
    page.waitForURL(new RegExp(`/litters/journal\\?litter=${ids.litter}`)),
    page.getByTestId("gestation-journal-link").click(),
  ]);
  await expect(page).toHaveURL(
    new RegExp(`/litters/journal\\?litter=${ids.litter}`),
  );
  const litterSelect = page.getByLabel("Portée affichée");
  await expect(litterSelect).toHaveValue(ids.litter);
  await expect(litterSelect.locator("option:checked")).toContainText(
    "UI ancre recalcul",
  );

  await page.goto(`/litters/${ids.litter}`);
  await openGestationSection(page);

  // General edit form must not expose gestation date inputs
  const editSection = page.locator("#modifier-portee");
  await editSection.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await expect(page.locator("#litter-edit-ovulation-date")).toHaveCount(0);
  await expect(page.locator("#litter-edit-mating-date")).toHaveCount(0);

  await openGestationSection(page);
  await page.getByTestId("gestation-estimated-ovulation-input").fill("2026-06-12");
  await page.getByTestId("gestation-anchors-submit").dblclick();

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

test("fiche Portée: champs techniques falsifiés ignorés ; révision concurrente refusée", async ({
  page,
}) => {
  seedLitterWithPlan();
  const client = await applyPlan(ids.litter, ids.applyCommand);

  await login(page);
  await page.goto(`/litters/${ids.litter}`);
  await openGestationSection(page);

  await page.evaluate(() => {
    const form = document.querySelector(
      '[data-testid="gestation-anchors-form"]',
    ) as HTMLFormElement | null;
    if (!form) return;
    for (const [name, value] of [
      ["litter_id", "9f260009-1000-4000-8000-000000000099"],
      ["client_command_id", "9f260009-1000-4000-8000-0000000000aa"],
      ["expected_litter_updated_at", "2000-01-01T00:00:00.000Z"],
      ["expected_plan_revision", "1"],
    ] as const) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
  });

  await expect(page.locator('#dates-gestation input[name="litter_id"]')).toHaveCount(1);
  await page.getByTestId("gestation-estimated-ovulation-input").fill("2026-06-15");
  await page.getByTestId("gestation-anchors-submit").click();

  await expect(page.getByTestId("gestation-anchors-success")).toContainText(
    "Le planning a été recalculé",
    { timeout: 15_000 },
  );
  expect(
    sql(`select estimated_ovulation_date::text from public.litters where id=${q(ids.litter)}::uuid;`),
  ).toBe("2026-06-15");
  expect(
    Number(
      sql(`select count(*) from public.litters where id=${q(ids.forgedLitter)}::uuid;`),
    ),
  ).toBe(0);
  expect(
    Number(
      sql(`select count(*) from public.litter_plan_anchor_recalculation_commands where litter_id=${q(ids.litter)}::uuid;`),
    ),
  ).toBe(1);
  expect(
    Number(
      sql(`select count(*) from public.litter_plan_anchor_recalculation_commands where client_command_id=${q("9f260009-1000-4000-8000-0000000000aa")}::uuid;`),
    ),
  ).toBe(0);

  await page.goto(`/litters/${ids.litter}`);
  await openGestationSection(page);

  const litterUpdatedAt = sql(
    `select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`,
  );
  const planRevision = Number(
    sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`),
  );
  const concurrent = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.concurrentCommand,
      p_expected_litter_updated_at: litterUpdatedAt,
      p_expected_plan_revision: planRevision,
      p_estimated_ovulation_date: "2026-06-16",
      p_expected_birth_date: null,
    },
  );
  expect(concurrent.error).toBeNull();
  expect(concurrent.data?.[0]?.outcome).toBe("recalculated");

  await page.getByTestId("gestation-estimated-ovulation-input").fill("2026-06-20");
  await page.getByTestId("gestation-anchors-submit").click();
  await expect(page.getByTestId("gestation-anchors-error")).toContainText(
    "modifié depuis l’ouverture de la page",
    { timeout: 15_000 },
  );
  expect(
    sql(`select estimated_ovulation_date::text from public.litters where id=${q(ids.litter)}::uuid;`),
  ).toBe("2026-06-16");
});

test("viewer: lecture seule sans formulaire ni intention technique", async ({
  page,
}) => {
  seedLitterWithPlan();
  await applyPlan(ids.litter, ids.applyCommand);

  try {
    setOwnerRole("viewer");
    await login(page);
    await page.goto(`/litters/${ids.litter}`);
    await openGestationSection(page);

    await expect(page.getByTestId("gestation-anchors-readonly")).toBeVisible();
    await expect(page.getByTestId("gestation-anchors-form")).toHaveCount(0);
    await expect(page.getByTestId("gestation-anchors-submit")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Enregistrer les dates de gestation/i }),
    ).toHaveCount(0);
    await expect(page.locator('#dates-gestation input[name="client_command_id"]')).toHaveCount(0);
    await expect(page.locator('#dates-gestation input[name="expected_litter_updated_at"]')).toHaveCount(0);
    await expect(page.locator('#dates-gestation input[name="expected_plan_revision"]')).toHaveCount(0);
    await expect(page.locator('#dates-gestation input[name="litter_id"]')).toHaveCount(0);
    await expect(page.locator('#dates-gestation input[type="date"]')).toHaveCount(0);
    await expect(page.getByTestId("gestation-estimated-ovulation-readonly")).toBeVisible();
    await expect(page.getByTestId("gestation-expected-birth-readonly")).toBeVisible();
    await expect(page.getByTestId("gestation-estimated-ovulation-readonly")).not.toHaveText("");
    await expect(page.getByTestId("gestation-expected-birth-readonly")).not.toHaveText("");
  } finally {
    setOwnerRole("owner");
  }
});

test("mère absente: texte non cliquable, aucune URL reproduction invalide", async ({
  page,
}) => {
  seedLitterWithPlan({ motherId: null, litterId: ids.litterNoMother });

  await login(page);
  await page.goto(`/litters/${ids.litterNoMother}`);
  await openGestationSection(page);

  await expect(page.getByTestId("gestation-reproduction-link")).toHaveCount(0);
  await expect(page.getByTestId("gestation-reproduction-nolink")).toHaveCount(2);
  await expect(page.getByTestId("gestation-reproduction-nolink").first()).toContainText(
    "fiche de la reproductrice",
  );
  await expect(page.locator('#dates-gestation a[href="/reproduction"]')).toHaveCount(0);
  await expect(
    page.locator('#dates-gestation a[href*="/reproduction"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId("gestation-journal-link")).toHaveAttribute(
    "href",
    `/litters/journal?litter=${ids.litterNoMother}`,
  );
});
