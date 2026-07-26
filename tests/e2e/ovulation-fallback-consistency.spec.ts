import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  generateLitterCareTasksFromPlanCore,
  planLitterCareTaskGenerationCore,
} from "../../src/features/litter-journal/litter-care-tasks-core";
import type { Database } from "../../src/types/database.types";
import {
  createTestAnimal,
  createTestLitter,
} from "./helpers/fixtures/breeding-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const sql = (value: string) => runE2eSqlSync(value);
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function cleanupExtras(extraIds: {
  ovulationTemplate: string;
  matingTemplate: string;
  model: string;
  planCommand: string;
  generationCommand: string;
  litterId?: string;
}) {
  if (extraIds.litterId) {
    sql(`
      delete from public.litter_care_task_generation_commands
        where litter_id = ${q(extraIds.litterId)}::uuid;
      delete from public.litter_care_tasks
        where litter_id = ${q(extraIds.litterId)}::uuid;
      delete from public.litter_plan_application_commands
        where litter_id = ${q(extraIds.litterId)}::uuid;
      delete from public.litter_plan_items
        where litter_id = ${q(extraIds.litterId)}::uuid;
      delete from public.litter_plans
        where litter_id = ${q(extraIds.litterId)}::uuid;
    `);
  }
  sql(`
    delete from public.litter_care_task_generation_commands
      where client_command_id = ${q(extraIds.generationCommand)}::uuid;
    delete from public.litter_plan_application_commands
      where client_command_id = ${q(extraIds.planCommand)}::uuid;
    delete from public.litter_planning_model_items
      where model_id = ${q(extraIds.model)}::uuid;
    delete from public.litter_planning_model_commands
      where model_id = ${q(extraIds.model)}::uuid;
    delete from public.litter_planning_models
      where id = ${q(extraIds.model)}::uuid;
    delete from public.litter_care_task_templates
      where id in (
        ${q(extraIds.ovulationTemplate)}::uuid,
        ${q(extraIds.matingTemplate)}::uuid
      );
  `);
}

test("repli ovulation = première saillie − 24 h : frise, planning et base", async ({
  page,
}) => {
  const countsBefore = {
    tasks: Number(sql("select count(*) from public.litter_care_tasks")),
    templates: Number(sql("select count(*) from public.litter_care_task_templates")),
    plans: Number(sql("select count(*) from public.litter_plans")),
    planItems: Number(sql("select count(*) from public.litter_plan_items")),
    planCommands: Number(
      sql("select count(*) from public.litter_plan_application_commands"),
    ),
    generationCommands: Number(
      sql("select count(*) from public.litter_care_task_generation_commands"),
    ),
    models: Number(sql("select count(*) from public.litter_planning_models")),
    modelItems: Number(
      sql("select count(*) from public.litter_planning_model_items"),
    ),
  };

  const extraIds = {
    ovulationTemplate: crypto.randomUUID(),
    matingTemplate: crypto.randomUUID(),
    model: crypto.randomUUID(),
    modelOvulationItem: crypto.randomUUID(),
    modelMatingItem: crypto.randomUUID(),
    planCommand: crypto.randomUUID(),
    generationCommand: crypto.randomUUID(),
    litterId: undefined as string | undefined,
  };

  try {
    await withE2eFixtures(sql, async (fixtures) => {
      const label = fixtures.namespace.slice(-8);
      const matingDate = "2026-06-08";
      const matingDate2 = "2026-06-12";
      const derivedOvulation = "2026-06-07";
      const j7 = "2026-06-14";
      const j63 = "2026-08-09";

      const mother = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        callName: `E2E mère ovul ${label}`,
      });
      const father = await createTestAnimal(sql, fixtures, {
        organizationId,
        ownerId,
        sex: "male",
        callName: `E2E père ovul ${label}`,
      });
      const litterId = await createTestLitter(sql, fixtures, {
        organizationId,
        ownerId,
        motherId: mother,
        fatherId: father,
        name: `E2E ovul fallback ${label}`,
        status: "pregnancy_confirmed",
        matingDate,
        matingDate2,
        expectedBirthDate: j63,
      });
      extraIds.litterId = litterId;

      expect(
        sql(
          `select estimated_ovulation_date is null from public.litters where id = ${q(litterId)}::uuid;`,
        ),
      ).toBe("t");

      sql(`
        insert into public.litter_care_task_templates (
          id, organization_id, title, category, target_scope, anchor_type, offset_days,
          species, breed, is_active, sort_order, revision, created_by, updated_by
        ) values
          (${q(extraIds.ovulationTemplate)}::uuid, ${q(organizationId)}::uuid,
           ${q(`E2E ovul tpl ${label}`)}, 'veterinary', 'litter', 'estimated_ovulation', 7,
           'dog', null, true, 10, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
          (${q(extraIds.matingTemplate)}::uuid, ${q(organizationId)}::uuid,
           ${q(`E2E mating tpl ${label}`)}, 'reproduction', 'mother', 'first_mating', 0,
           'dog', null, true, 20, 1, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

        insert into public.litter_planning_models (
          id, organization_id, title, species, breed, revision, created_by, updated_by
        ) values (
          ${q(extraIds.model)}::uuid, ${q(organizationId)}::uuid,
          ${q(`E2E ovul model ${label}`)}, 'dog', 'Golden Retriever', 1,
          ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
        );

        insert into public.litter_planning_model_items (
          id, organization_id, model_id, organization_template_id, item_kind, priority,
          anchor_type, point_offset_days, window_starts_offset_days, window_ends_offset_days,
          display_order, is_required, is_selected_by_default, created_by, updated_by
        ) values
          (${q(extraIds.modelOvulationItem)}::uuid, ${q(organizationId)}::uuid,
           ${q(extraIds.model)}::uuid, ${q(extraIds.ovulationTemplate)}::uuid,
           'task', 'normal', 'estimated_ovulation', 7, null, null, 0, true, true,
           ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
          (${q(extraIds.modelMatingItem)}::uuid, ${q(organizationId)}::uuid,
           ${q(extraIds.model)}::uuid, ${q(extraIds.matingTemplate)}::uuid,
           'task', 'normal', 'first_mating', 0, null, null, 1, true, true,
           ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
      `);

      const owner = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      expect(
        (
          await owner.auth.signInWithPassword({
            email: E2E_OWNER_EMAIL,
            password: E2E_OWNER_PASSWORD,
          })
        ).error,
      ).toBeNull();

      const plan = await planLitterCareTaskGenerationCore({ litterId }, owner);
      expect(plan.outcome).toBe("success");
      if (plan.outcome !== "success") throw new Error("plan failed");

      const ovulationReady = plan.readyPlan.find(
        (item) => item.templateId === extraIds.ovulationTemplate,
      );
      const matingReady = plan.readyPlan.find(
        (item) => item.templateId === extraIds.matingTemplate,
      );
      expect(ovulationReady).toEqual({
        templateId: extraIds.ovulationTemplate,
        revision: 1,
        anchorType: "estimated_ovulation",
        anchorDate: derivedOvulation,
        plannedFor: j7,
      });
      expect(matingReady).toEqual({
        templateId: extraIds.matingTemplate,
        revision: 1,
        anchorType: "first_mating",
        anchorDate: matingDate,
        plannedFor: matingDate,
      });

      const generated = await generateLitterCareTasksFromPlanCore(
        {
          litterId,
          clientCommandId: extraIds.generationCommand,
          plan: [ovulationReady!, matingReady!],
        },
        owner,
      );
      expect(generated).toMatchObject({
        outcome: "success",
        createdCount: 2,
      });

      // Wipe simple-generator tasks so the composite model can materialize cleanly.
      sql(`
        delete from public.litter_care_tasks where litter_id = ${q(litterId)}::uuid;
        delete from public.litter_care_task_generation_commands
          where client_command_id = ${q(extraIds.generationCommand)}::uuid;
      `);

      const applied = await owner.rpc("apply_litter_planning_model", {
        p_litter_id: litterId,
        p_planning_model_id: extraIds.model,
        p_client_command_id: extraIds.planCommand,
        p_expected_model_revision: 1,
        p_expected_plan_revision: null,
        p_selected_model_item_ids: null,
        p_timezone_name: "Europe/Paris",
      });
      expect(applied.error).toBeNull();
      expect(applied.data?.[0]?.outcome).toBe("success");

      const planItems = JSON.parse(
        sql(`
          select json_agg(json_build_object(
            'anchor', anchor_type,
            'source', anchor_resolution_source,
            'sourceDate', anchor_source_date_snapshot::text,
            'adjustment', anchor_adjustment_days,
            'date', anchor_date_snapshot::text
          ) order by display_order)::text
          from public.litter_plan_items
          where litter_id = ${q(litterId)}::uuid;
        `),
      );
      expect(planItems[0]).toMatchObject({
        anchor: "estimated_ovulation",
        source: "first_mating_minus_24h",
        sourceDate: matingDate,
        adjustment: -1,
        date: derivedOvulation,
      });
      expect(planItems[1]).toMatchObject({
        anchor: "first_mating",
        source: "first_mating",
        sourceDate: matingDate,
        adjustment: 0,
        date: matingDate,
      });

      const taskRows = JSON.parse(
        sql(`
          select json_agg(json_build_object(
            'anchor_type', anchor_type,
            'anchor_date', anchor_date::text,
            'planned_for', planned_for::text
          ) order by anchor_type)::text
          from public.litter_care_tasks
          where litter_id = ${q(litterId)}::uuid;
        `),
      );
      expect(taskRows).toEqual([
        {
          anchor_type: "estimated_ovulation",
          anchor_date: derivedOvulation,
          planned_for: j7,
        },
        {
          anchor_type: "first_mating",
          anchor_date: matingDate,
          planned_for: matingDate,
        },
      ]);

      expect(
        sql(
          `select estimated_ovulation_date is null from public.litters where id = ${q(litterId)}::uuid;`,
        ),
      ).toBe("t");
      expect(
        sql(`
          select count(*) filter (where anchor_date = ${q(matingDate2)}::date) = 0
          from public.litter_care_tasks
          where litter_id = ${q(litterId)}::uuid;
        `),
      ).toBe("t");

      await login(page);
      await page.goto(
        `/litters/journal/calendar?litter=${litterId}&view=timeline&zoom=gestation`,
      );
      await expect(page.locator("[data-timeline-anchor-message]")).toContainText(
        "Ovulation estimée automatiquement",
      );
      await expect(page.locator("[data-timeline-anchor-message]")).toContainText(
        "Calcul provisoire",
      );
      await expect(page.locator("[data-timeline-anchor-message]")).toContainText(
        "− 24 h",
      );
      await expect(
        page.locator("[data-timeline-ovulation-derived='true']"),
      ).toBeVisible();

      await expect(page.locator("[data-timeline-bio-day='J0']")).toHaveCount(1);
      await expect(page.locator("[data-timeline-bio-day='J7']")).toHaveCount(1);
      await expect(page.locator("[data-timeline-bio-day='J63']")).toHaveCount(1);

      const ovulationMarker = page.locator(
        `[data-timeline-biology-cell='${derivedOvulation}'] [data-timeline-marker='estimated_ovulation']`,
      );
      await expect(ovulationMarker).toHaveCount(1);
      await expect(ovulationMarker).toHaveAttribute(
        "aria-label",
        `Ovulation estimée automatiquement le ${derivedOvulation}`,
      );
      await expect(
        page.locator(
          `[data-timeline-biology-cell='${matingDate}'] [data-timeline-marker='first_mating']`,
        ),
      ).toHaveCount(1);
      await expect(
        page.locator(
          `[data-timeline-biology-cell='${matingDate2}'] [data-timeline-marker='second_mating']`,
        ),
      ).toHaveCount(1);

      await expect(
        page.locator("[data-timeline-item]").filter({ hasText: `E2E ovul tpl ${label}` }),
      ).toHaveCount(1);
      await expect(
        page
          .locator("[data-timeline-item]")
          .filter({ hasText: `E2E mating tpl ${label}` }),
      ).toHaveCount(1);

      await page.goto(`/litters/journal?litter=${litterId}`);
      await expect(
        page.getByText(/J\+\d+ depuis l’ovulation estimée automatiquement/),
      ).toBeVisible();

      await page.goto("/calendar");
      await expect(
        page.getByRole("navigation", { name: "Navigation principale" }),
      ).toBeVisible();
      await page.goto("/calendar/today");
      await expect(
        page.getByRole("navigation", { name: "Navigation principale" }),
      ).toBeVisible();

      cleanupExtras(extraIds);
      extraIds.litterId = undefined;
    });
  } finally {
    cleanupExtras(extraIds);
    expect(Number(sql("select count(*) from public.litter_care_tasks"))).toBe(
      countsBefore.tasks,
    );
    expect(
      Number(sql("select count(*) from public.litter_care_task_templates")),
    ).toBe(countsBefore.templates);
    expect(Number(sql("select count(*) from public.litter_plans"))).toBe(
      countsBefore.plans,
    );
    expect(Number(sql("select count(*) from public.litter_plan_items"))).toBe(
      countsBefore.planItems,
    );
    expect(
      Number(sql("select count(*) from public.litter_plan_application_commands")),
    ).toBe(countsBefore.planCommands);
    expect(
      Number(sql("select count(*) from public.litter_care_task_generation_commands")),
    ).toBe(countsBefore.generationCommands);
    expect(Number(sql("select count(*) from public.litter_planning_models"))).toBe(
      countsBefore.models,
    );
    expect(
      Number(sql("select count(*) from public.litter_planning_model_items")),
    ).toBe(countsBefore.modelItems);
  }
});
