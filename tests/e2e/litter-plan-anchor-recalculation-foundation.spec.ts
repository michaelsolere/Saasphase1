import { expect, test } from "@playwright/test";

import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const ownerMembership = "30000000-0000-4000-8000-000000000001";
const prefix = "9f260009-0000-4000-8000-0000000000";
const ids = {
  mother: `${prefix}01`,
  litter: `${prefix}02`,
  litterNoPlan: `${prefix}03`,
  template: `${prefix}10`,
  model: `${prefix}11`,
  itemOvulation: `${prefix}12`,
  itemBirth: `${prefix}13`,
  itemMating: `${prefix}14`,
  itemWindow: `${prefix}15`,
  applyCommand: `${prefix}20`,
  recalc1: `${prefix}21`,
  recalc2: `${prefix}22`,
  recalc3: `${prefix}23`,
  recalc4: `${prefix}24`,
  recalc5: `${prefix}25`,
  recalc6: `${prefix}26`,
  recalc7: `${prefix}27`,
  recalc8: `${prefix}28`,
  recalc9: `${prefix}29`,
  recalcA: `${prefix}2a`,
  foreignLitter: `${prefix}30`,
  foreignOrg: `${prefix}31`,
  foreignOwner: `${prefix}32`,
  viewer: `${prefix}40`,
  viewerIdentity: `${prefix}41`,
  viewerMembership: `${prefix}42`,
  member: `${prefix}43`,
  memberIdentity: `${prefix}44`,
  memberMembership: `${prefix}45`,
} as const;

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

function cleanup() {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = 'owner' where id = ${q(ownerMembership)}::uuid;
    delete from public.litter_care_task_schedule_changes
      where task_id in (select id from public.litter_care_tasks where litter_id::text like '9f260009-%')
         or litter_id::text like '9f260009-%';
    delete from public.litter_care_task_schedule_commands
      where task_id in (select id from public.litter_care_tasks where litter_id::text like '9f260009-%')
         or litter_id::text like '9f260009-%'
         or client_command_id::text like '9f260009-%';
    delete from public.litter_plan_anchor_recalculation_commands
      where litter_id::text like '9f260009-%' or client_command_id::text like '9f260009-%';
    delete from public.litter_plan_application_commands
      where litter_id::text like '9f260009-%' or client_command_id::text like '9f260009-%';
    delete from public.litter_care_tasks where litter_id::text like '9f260009-%';
    delete from public.litter_plan_items where litter_id::text like '9f260009-%';
    delete from public.litter_plans where litter_id::text like '9f260009-%';
    delete from public.litter_planning_model_items where model_id::text like '9f260009-%';
    delete from public.litter_planning_model_commands where model_id::text like '9f260009-%';
    delete from public.litter_planning_models where id::text like '9f260009-%';
    delete from public.litter_care_task_templates where id::text like '9f260009-%';
    delete from public.litters where id::text like '9f260009-%';
    delete from public.animals where id::text like '9f260009-%';
    delete from public.memberships where id::text like '9f260009-%';
    delete from auth.identities where user_id::text like '9f260009-%';
    delete from auth.users where id::text like '9f260009-%';
    delete from public.profiles where id::text like '9f260009-%';
    delete from public.organizations where id::text like '9f260009-%';
    set session_replication_role = origin;
  `);
}

function counts() {
  return JSON.parse(
    sql(`select json_build_object(
      'recalc_commands', (select count(*) from public.litter_plan_anchor_recalculation_commands where client_command_id::text like '9f260009-%' or litter_id::text like '9f260009-%'),
      'schedule_commands', (select count(*) from public.litter_care_task_schedule_commands where client_command_id::text like '9f260009-%' or litter_id::text like '9f260009-%'),
      'schedule_changes', (select count(*) from public.litter_care_task_schedule_changes where litter_id::text like '9f260009-%'),
      'tasks', (select count(*) from public.litter_care_tasks where litter_id::text like '9f260009-%'),
      'items', (select count(*) from public.litter_plan_items where litter_id::text like '9f260009-%'),
      'plans', (select count(*) from public.litter_plans where litter_id::text like '9f260009-%'),
      'litters', (select count(*) from public.litters where id::text like '9f260009-%'),
      'animals', (select count(*) from public.animals where id::text like '9f260009-%'),
      'memberships', (select count(*) from public.memberships where id::text like '9f260009-%'),
      'orgs', (select count(*) from public.organizations where id::text like '9f260009-%')
    )::text;`),
  ) as Record<string, number>;
}

function seedPlanLitter() {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,created_by,updated_by)
    values (${q(ids.mother)}::uuid,${q(org)}::uuid,'Ancre mother','dog','Golden Retriever','female','breeding','owned',${q(owner)}::uuid,${q(owner)}::uuid);
    insert into public.litters (
      id,organization_id,name,species,breed,mother_id,status,mating_date,mating_date_2,
      estimated_ovulation_date,expected_birth_date,created_by,updated_by
    ) values (
      ${q(ids.litter)}::uuid,${q(org)}::uuid,'Ancre recalcul','dog','Golden Retriever',${q(ids.mother)}::uuid,
      'birth_expected','2026-06-10','2026-06-12','2026-06-08',null,${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_care_task_templates (
      id,organization_id,title,category,target_scope,anchor_type,offset_days,species,revision,created_by,updated_by
    ) values (
      ${q(ids.template)}::uuid,${q(org)}::uuid,'Ancre template','other','litter','estimated_ovulation',0,'dog',1,${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_planning_models (
      id,organization_id,title,species,breed,revision,created_by,updated_by
    ) values (
      ${q(ids.model)}::uuid,${q(org)}::uuid,'Ancre model','dog','Golden Retriever',1,${q(owner)}::uuid,${q(owner)}::uuid
    );
    insert into public.litter_planning_model_items (
      id,organization_id,model_id,organization_template_id,item_kind,priority,anchor_type,
      point_offset_days,window_starts_offset_days,window_ends_offset_days,display_order,
      is_required,is_selected_by_default,created_by,updated_by
    ) values
      (${q(ids.itemOvulation)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','estimated_ovulation',10,null,null,0,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
      (${q(ids.itemBirth)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'milestone','normal','expected_birth',0,null,null,1,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
      (${q(ids.itemMating)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'task','normal','first_mating',5,null,null,2,true,true,${q(owner)}::uuid,${q(owner)}::uuid),
      (${q(ids.itemWindow)}::uuid,${q(org)}::uuid,${q(ids.model)}::uuid,${q(ids.template)}::uuid,'window','normal','estimated_ovulation',null,20,25,3,true,true,${q(owner)}::uuid,${q(owner)}::uuid);
  `);
}

async function ownerClient() {
  const client = await createAuthenticatedSupabaseClient();
  const { error } = await client.auth.signInWithPassword({
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
  });
  expect(error).toBeNull();
  return client;
}

test.beforeEach(() => {
  cleanup();
  expect(counts()).toEqual({
    recalc_commands: 0,
    schedule_commands: 0,
    schedule_changes: 0,
    tasks: 0,
    items: 0,
    plans: 0,
    litters: 0,
    animals: 0,
    memberships: 0,
    orgs: 0,
  });
});

test.afterEach(() => {
  cleanup();
  expect(counts()).toEqual({
    recalc_commands: 0,
    schedule_commands: 0,
    schedule_changes: 0,
    tasks: 0,
    items: 0,
    plans: 0,
    litters: 0,
    animals: 0,
    memberships: 0,
    orgs: 0,
  });
});

test("recalcule les ancres, préserve manuel/verrouillé/terminal et refuse les contournements", async () => {
  seedPlanLitter();
  const client = await ownerClient();

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

  const litterMeta = JSON.parse(
    sql(`select json_build_object(
      'updatedAt', updated_at,
      'ovulation', estimated_ovulation_date,
      'expected', expected_birth_date,
      'mating', mating_date,
      'mating2', mating_date_2
    )::text from public.litters where id=${q(ids.litter)}::uuid;`),
  );
  const planRevision = Number(
    sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid and status='active';`),
  );

  // Mark one task manual, one locked, one done
  const taskIds = JSON.parse(
    sql(`select json_build_object(
      'auto', (select id::text from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid and title='Ancre template' and item_kind='task' and anchor_type='estimated_ovulation' limit 1),
      'birth', (select id::text from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid and anchor_type='expected_birth' limit 1),
      'mating', (select id::text from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid and anchor_type='first_mating' limit 1),
      'window', (select id::text from public.litter_care_tasks where litter_id=${q(ids.litter)}::uuid and item_kind='window' limit 1)
    )::text;`),
  );

  sql(`
    update public.litter_care_tasks
    set schedule_source='manual', planned_for='2026-07-01', revision_no=revision_no+1
    where id=${q(taskIds.birth)}::uuid;
    update public.litter_care_tasks
    set is_schedule_locked=true, schedule_locked_at=now(), schedule_locked_by=${q(owner)}::uuid,
        planned_for='2026-06-20', revision_no=revision_no+1
    where id=${q(taskIds.auto)}::uuid;
    update public.litter_care_tasks
    set status='done', resolved_at=now(), resolved_by=${q(owner)}::uuid,
        resolution_command_id=gen_random_uuid(), resolved_timezone_name='Europe/Paris',
        revision_no=revision_no+1
    where id=${q(taskIds.window)}::uuid;
  `);

  const before = JSON.parse(
    sql(`select json_build_object(
      'autoPlanned', (select planned_for::text from public.litter_care_tasks where id=${q(taskIds.auto)}::uuid),
      'autoSuggested', (select suggested_for::text from public.litter_care_tasks where id=${q(taskIds.auto)}::uuid),
      'birthPlanned', (select planned_for::text from public.litter_care_tasks where id=${q(taskIds.birth)}::uuid),
      'birthSuggested', (select suggested_for::text from public.litter_care_tasks where id=${q(taskIds.birth)}::uuid),
      'matingPlanned', (select planned_for::text from public.litter_care_tasks where id=${q(taskIds.mating)}::uuid),
      'windowStatus', (select status from public.litter_care_tasks where id=${q(taskIds.window)}::uuid),
      'windowRetained', (select retained_starts_on::text from public.litter_care_tasks where id=${q(taskIds.window)}::uuid),
      'matingItemDate', (select anchor_date_snapshot::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and anchor_type='first_mating')
    )::text;`),
  );

  // Move ovulation +2 days
  const recalc = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc1,
      p_expected_litter_updated_at: litterMeta.updatedAt,
      p_expected_plan_revision: planRevision,
      p_estimated_ovulation_date: "2026-06-10",
      p_expected_birth_date: null,
    },
  );
  expect(recalc.error).toBeNull();
  expect(recalc.data?.[0]?.outcome).toBe("recalculated");
  expect(recalc.data?.[0]?.replayed).toBe(false);
  expect(Number(recalc.data?.[0]?.recalculated_item_count)).toBeGreaterThan(0);
  expect(Number(recalc.data?.[0]?.preserved_locked_schedule_count)).toBe(1);
  expect(Number(recalc.data?.[0]?.preserved_manual_schedule_count)).toBe(1);
  expect(Number(recalc.data?.[0]?.preserved_terminal_count)).toBe(1);

  const after = JSON.parse(
    sql(`select json_build_object(
      'ovulation', (select estimated_ovulation_date::text from public.litters where id=${q(ids.litter)}::uuid),
      'expected', (select expected_birth_date::text from public.litters where id=${q(ids.litter)}::uuid),
      'autoPlanned', (select planned_for::text from public.litter_care_tasks where id=${q(taskIds.auto)}::uuid),
      'autoSuggested', (select suggested_for::text from public.litter_care_tasks where id=${q(taskIds.auto)}::uuid),
      'birthPlanned', (select planned_for::text from public.litter_care_tasks where id=${q(taskIds.birth)}::uuid),
      'birthSuggested', (select suggested_for::text from public.litter_care_tasks where id=${q(taskIds.birth)}::uuid),
      'matingPlanned', (select planned_for::text from public.litter_care_tasks where id=${q(taskIds.mating)}::uuid),
      'windowStatus', (select status from public.litter_care_tasks where id=${q(taskIds.window)}::uuid),
      'windowRetained', (select retained_starts_on::text from public.litter_care_tasks where id=${q(taskIds.window)}::uuid),
      'windowSuggested', (select suggested_starts_on::text from public.litter_care_tasks where id=${q(taskIds.window)}::uuid),
      'matingItemDate', (select anchor_date_snapshot::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and anchor_type='first_mating'),
      'ovulationItemSource', (select anchor_resolution_source from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and anchor_type='estimated_ovulation' and item_kind='task'),
      'birthItemSource', (select anchor_resolution_source from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and anchor_type='expected_birth'),
      'birthItemDate', (select anchor_date_snapshot::text from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and anchor_type='expected_birth'),
      'planRevision', (select revision from public.litter_plans where litter_id=${q(ids.litter)}::uuid and status='active'),
      'history', (select count(*) from public.litter_care_task_schedule_changes where litter_id=${q(ids.litter)}::uuid and change_type='anchor_recalculation')
    )::text;`),
  );

  expect(after.ovulation).toBe("2026-06-10");
  expect(after.expected).toBeNull();
  expect(after.ovulationItemSource).toBe("estimated_ovulation");
  expect(after.birthItemSource).toBe("estimated_ovulation");
  expect(after.birthItemDate).toBe("2026-08-12"); // ovulation + 63
  expect(after.matingItemDate).toBe(before.matingItemDate);
  expect(after.matingPlanned).toBe(before.matingPlanned);
  expect(after.autoPlanned).toBe(before.autoPlanned); // locked retained
  expect(after.autoSuggested).not.toBe(before.autoSuggested);
  expect(after.birthPlanned).toBe("2026-07-01"); // manual retained
  expect(after.birthSuggested).not.toBe(before.birthSuggested);
  expect(after.windowStatus).toBe("done");
  expect(after.windowRetained).toBe(before.windowRetained);
  expect(after.windowSuggested).not.toBe(before.windowRetained);
  expect(after.planRevision).toBe(planRevision + 1);
  expect(after.history).toBeGreaterThan(0);

  // Ignore mating_date_2: clear ovulation → fallback first mating -1 / +62
  const litter2 = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const plan2 = Number(sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`));
  const clearOvulation = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc2,
      p_expected_litter_updated_at: litter2,
      p_expected_plan_revision: plan2,
      p_estimated_ovulation_date: null,
      p_expected_birth_date: null,
    },
  );
  expect(clearOvulation.data?.[0]?.outcome).toBe("recalculated");
  expect(
    sql(`select anchor_resolution_source || ':' || anchor_date_snapshot::text
         from public.litter_plan_items
         where litter_id=${q(ids.litter)}::uuid and anchor_type='estimated_ovulation' and item_kind='task';`),
  ).toBe("first_mating_minus_24h:2026-06-09");
  expect(
    sql(`select anchor_resolution_source || ':' || anchor_date_snapshot::text
         from public.litter_plan_items
         where litter_id=${q(ids.litter)}::uuid and anchor_type='expected_birth';`),
  ).toBe("first_mating:2026-08-11");
  expect(sql(`select mating_date_2::text from public.litters where id=${q(ids.litter)}::uuid;`)).toBe(
    "2026-06-12",
  );

  // Explicit expected birth priority
  const litter3 = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const plan3 = Number(sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`));
  const explicitBirth = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc3,
      p_expected_litter_updated_at: litter3,
      p_expected_plan_revision: plan3,
      p_estimated_ovulation_date: null,
      p_expected_birth_date: "2026-09-01",
    },
  );
  expect(explicitBirth.data?.[0]?.outcome).toBe("recalculated");
  expect(
    sql(`select anchor_resolution_source || ':' || anchor_date_snapshot::text
         from public.litter_plan_items where litter_id=${q(ids.litter)}::uuid and anchor_type='expected_birth';`),
  ).toBe("expected_birth:2026-09-01");

  // Exact replay
  const replay = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc3,
      p_expected_litter_updated_at: litter3,
      p_expected_plan_revision: plan3,
      p_estimated_ovulation_date: null,
      p_expected_birth_date: "2026-09-01",
    },
  );
  expect(replay.data?.[0]?.replayed).toBe(true);
  expect(replay.data?.[0]?.outcome).toBe(explicitBirth.data?.[0]?.outcome);
  expect(replay.data?.[0]?.result_plan_revision).toBe(
    explicitBirth.data?.[0]?.result_plan_revision,
  );

  // Command conflict
  const conflict = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc3,
      p_expected_litter_updated_at: litter3,
      p_expected_plan_revision: plan3,
      p_estimated_ovulation_date: "2026-06-01",
      p_expected_birth_date: "2026-09-01",
    },
  );
  expect(conflict.data?.[0]?.reason).toBe("client_command_conflict");

  // stale_litter
  const staleLitter = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc4,
      p_expected_litter_updated_at: "2000-01-01T00:00:00+00:00",
      p_expected_plan_revision: Number(
        sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`),
      ),
      p_estimated_ovulation_date: null,
      p_expected_birth_date: "2026-09-02",
    },
  );
  expect(staleLitter.data?.[0]?.reason).toBe("stale_litter");

  // stale_plan
  const litter4 = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const stalePlan = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc5,
      p_expected_litter_updated_at: litter4,
      p_expected_plan_revision: 1,
      p_estimated_ovulation_date: null,
      p_expected_birth_date: "2026-09-03",
    },
  );
  expect(stalePlan.data?.[0]?.reason).toBe("stale_plan");

  // Direct authenticated update refused
  const direct = await client
    .from("litters")
    .update({ estimated_ovulation_date: "2026-01-01" })
    .eq("id", ids.litter);
  expect(direct.error).not.toBeNull();

  // No-op unchanged
  const litter5 = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const plan5 = Number(sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`));
  const noop = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc6,
      p_expected_litter_updated_at: litter5,
      p_expected_plan_revision: plan5,
      p_estimated_ovulation_date: null,
      p_expected_birth_date: "2026-09-01",
    },
  );
  expect(noop.data?.[0]?.outcome).toBe("unchanged");
  expect(Number(noop.data?.[0]?.result_plan_revision)).toBe(plan5);

  // Without plan
  sql(`
    insert into public.litters (
      id,organization_id,name,species,breed,mother_id,status,mating_date,created_by,updated_by
    ) values (
      ${q(ids.litterNoPlan)}::uuid,${q(org)}::uuid,'Sans planning','dog','Golden Retriever',
      ${q(ids.mother)}::uuid,'planned','2026-06-10',${q(owner)}::uuid,${q(owner)}::uuid
    );
  `);
  const noPlanUpdatedAt = sql(
    `select updated_at::text from public.litters where id=${q(ids.litterNoPlan)}::uuid;`,
  );
  const noPlan = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litterNoPlan,
      p_client_command_id: ids.recalc7,
      p_expected_litter_updated_at: noPlanUpdatedAt,
      p_expected_plan_revision: null,
      p_estimated_ovulation_date: "2026-06-11",
      p_expected_birth_date: null,
    },
  );
  expect(noPlan.data?.[0]?.outcome).toBe("updated_without_plan");
  expect(
    sql(`select estimated_ovulation_date::text from public.litters where id=${q(ids.litterNoPlan)}::uuid;`),
  ).toBe("2026-06-11");

  // Foreign litter neutralized
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.foreignOrg)}::uuid, 'Foreign ancre', 'foreign-ancre-9f260009');
    insert into public.litters (
      id, organization_id, name, species, breed, status, created_by, updated_by
    ) values (
      ${q(ids.foreignLitter)}::uuid, ${q(ids.foreignOrg)}::uuid, 'Foreign litter', 'dog', 'Golden Retriever',
      'planned', ${q(owner)}::uuid, ${q(owner)}::uuid
    );
  `);
  const foreign = await client.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.foreignLitter,
      p_client_command_id: ids.recalc8,
      p_expected_litter_updated_at: "2026-01-01T00:00:00+00:00",
      p_expected_plan_revision: null,
      p_estimated_ovulation_date: "2026-06-01",
      p_expected_birth_date: null,
    },
  );
  expect(foreign.data?.[0]?.reason).toBe("not_found");

  // Viewer refused
  sql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(ids.viewer)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'ancre-viewer@saasphase1.invalid',
      extensions.crypt('AncreViewer-2026!', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Ancre Viewer"}'::jsonb, now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(ids.viewerIdentity)}::uuid, 'ancre-viewer@saasphase1.invalid', ${q(ids.viewer)}::uuid,
      jsonb_build_object('sub', ${q(ids.viewer)}, 'email', 'ancre-viewer@saasphase1.invalid', 'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );
    insert into public.profiles (id, email, display_name)
    values (${q(ids.viewer)}::uuid, 'ancre-viewer@saasphase1.invalid', 'Viewer')
    on conflict (id) do nothing;
    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by)
    values (${q(ids.viewerMembership)}::uuid, ${q(org)}::uuid, ${q(ids.viewer)}::uuid, 'viewer', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid);
  `);
  const viewerClient = createAnonymousSupabaseClient();
  expect(
    (
      await viewerClient.auth.signInWithPassword({
        email: "ancre-viewer@saasphase1.invalid",
        password: "AncreViewer-2026!",
      })
    ).error,
  ).toBeNull();
  const litter6 = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const plan6 = Number(sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`));
  const viewerDenied = await viewerClient.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalc9,
      p_expected_litter_updated_at: litter6,
      p_expected_plan_revision: plan6,
      p_estimated_ovulation_date: "2026-06-15",
      p_expected_birth_date: null,
    },
  );
  expect(viewerDenied.data?.[0]?.reason).toBe("membership_required");

  // Member allowed
  sql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${q(ids.member)}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'ancre-member@saasphase1.invalid',
      extensions.crypt('AncreMember-2026!', extensions.gen_salt('bf')),
      now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Ancre Member"}'::jsonb, now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      ${q(ids.memberIdentity)}::uuid, 'ancre-member@saasphase1.invalid', ${q(ids.member)}::uuid,
      jsonb_build_object('sub', ${q(ids.member)}, 'email', 'ancre-member@saasphase1.invalid', 'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );
    insert into public.profiles (id, email, display_name)
    values (${q(ids.member)}::uuid, 'ancre-member@saasphase1.invalid', 'Member')
    on conflict (id) do nothing;
    insert into public.memberships (id, organization_id, profile_id, role, status, created_by, updated_by)
    values (${q(ids.memberMembership)}::uuid, ${q(org)}::uuid, ${q(ids.member)}::uuid, 'member', 'active', ${q(owner)}::uuid, ${q(owner)}::uuid);
  `);
  const memberClient = createAnonymousSupabaseClient();
  expect(
    (
      await memberClient.auth.signInWithPassword({
        email: "ancre-member@saasphase1.invalid",
        password: "AncreMember-2026!",
      })
    ).error,
  ).toBeNull();
  const litter7 = sql(`select updated_at::text from public.litters where id=${q(ids.litter)}::uuid;`);
  const plan7 = Number(sql(`select revision::text from public.litter_plans where litter_id=${q(ids.litter)}::uuid;`));
  const memberOk = await memberClient.rpc(
    "update_litter_gestation_anchors_and_recalculate_plan",
    {
      p_litter_id: ids.litter,
      p_client_command_id: ids.recalcA,
      p_expected_litter_updated_at: litter7,
      p_expected_plan_revision: plan7,
      p_estimated_ovulation_date: "2026-06-16",
      p_expected_birth_date: "2026-09-01",
    },
  );
  expect(memberOk.data?.[0]?.outcome).toBe("recalculated");
});
