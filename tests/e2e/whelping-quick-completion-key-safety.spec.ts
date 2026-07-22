import { expect, test, type Locator, type Page } from "@playwright/test";

import { QUICK_WHELPING_COMPLETION_REASON } from "../../src/features/whelping/whelping-core";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const prefix = "WHELPING_QUICK_KEY_SAFETY_20260722";
const ids = {
  mother: "9f270301-0000-4000-8000-000000000001",
  father: "9f270301-0000-4000-8000-000000000002",
  litter: "9f270302-0000-4000-8000-000000000001",
};

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(statement: string) { return runE2eSqlSync(statement); }
const organizationId = sql("select id from public.organizations where slug='elevage-e2e';");
const ownerId = sql("select id from public.profiles where email='e2e-owner@saasphase1.invalid';");
const ownerMembershipId = sql(`select id from public.memberships where organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid;`);

function cleanup() {
  sql(`
    begin;
    set local session_replication_role=replica;
    update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid;
    delete from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_commands where litter_id=${q(ids.litter)}::uuid;
    delete from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid);
    delete from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid);
    delete from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid);
    delete from public.animals where litter_id=${q(ids.litter)}::uuid;
    delete from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${prefix}%`)};
    delete from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or notes like ${q(`${prefix}%`)};
    commit;
  `);
}

function fixtureCounts() {
  return JSON.parse(sql(`select json_build_object(
    'organisations',(select count(*) from public.organizations where name like ${q(`${prefix}%`)}),
    'animaux',(select count(*) from public.animals where id in (${q(ids.mother)}::uuid,${q(ids.father)}::uuid) or litter_id=${q(ids.litter)}::uuid or notes like ${q(`${prefix}%`)}),
    'portees',(select count(*) from public.litters where id=${q(ids.litter)}::uuid or name like ${q(`${prefix}%`)}),
    'sessions',(select count(*) from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid),
    'evenements',(select count(*) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),
    'naissances',(select count(*) from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid)),
    'commandes',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),
    'rectifications',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid),
    'mesures',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id=${q(ids.litter)}::uuid)),
    'changements_role',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function expectClean() {
  const counts = fixtureCounts();
  for (const [name, count] of Object.entries(counts)) expect(count, `${name} cleanup`).toBe(0);
  return counts;
}

function createFixtures() {
  sql(`
    insert into public.animals(id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by) values
      (${q(ids.mother)}::uuid,${q(organizationId)}::uuid,'Aurore key safety','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} mother`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid,${q(organizationId)}::uuid,'Sirius key safety','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} father`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters(id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,notes,created_by,updated_by)
      values(${q(ids.litter)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Portée`)},'dog','Golden Retriever',${q(ids.mother)}::uuid,${q(ids.father)}::uuid,'birth_expected',current_date,${q(`${prefix} litter`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function workflowState() {
  return JSON.parse(sql(`with sessions as (
    select id from public.whelping_sessions where litter_id=${q(ids.litter)}::uuid
  ), births as (
    select b.* from public.whelping_births b where b.session_id in (select id from sessions)
  ), offspring as (
    select a.* from public.animals a where a.litter_id=${q(ids.litter)}::uuid
  ) select json_build_object(
    'sessions',(select count(*) from sessions),
    'births',(select count(*) from births),
    'animals',(select count(*) from offspring),
    'events',(select count(*) from public.whelping_events where session_id in (select id from sessions)),
    'birthEvents',(select count(*) from public.whelping_events where session_id in (select id from sessions) and event_type='birth'),
    'correctionEvents',(select count(*) from public.whelping_events where session_id in (select id from sessions) and event_type='birth_corrected'),
    'commands',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid),
    'recordBirthCommands',(select count(*) from public.whelping_commands where litter_id=${q(ids.litter)}::uuid and command_type='record_birth'),
    'quickCompletionActions',(select count(*) from births b left join public.animal_weight_measurements w on w.source_birth_id=b.id and w.cancelled_at is null where b.cancelled_at is null and (b.initial_collar_color is null or w.id is null)),
    'quickCompletionItems',(select count(*) from births b left join public.animal_weight_measurements w on w.source_birth_id=b.id and w.cancelled_at is null where b.cancelled_at is null and (b.initial_collar_color is null or w.id is null)),
    'adjustments',(select count(*) from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid and reason=${q(QUICK_WHELPING_COMPLETION_REASON)}),
    'measurements',(select count(*) from public.animal_weight_measurements where animal_id in (select id from offspring) and measurement_kind='birth' and cancelled_at is null),
    'orders',coalesce((select json_agg(birth_order order by birth_order) from births),'[]'::json),
    'sexes',coalesce((select json_agg(sex order by birth_order) from births),'[]'::json),
    'revisions',coalesce((select json_agg(revision_no order by birth_order) from births),'[]'::json),
    'duplicateOrders',(select count(*) from (select birth_order from births where cancelled_at is null group by birth_order having count(*)>1) d),
    'duplicateEvents',(select count(*) from (select event_type,occurred_at from public.whelping_events where session_id in (select id from sessions) group by event_type,occurred_at having count(*)>1) d),
    'duplicateMeasurements',(select count(*) from (select source_birth_id from public.animal_weight_measurements where animal_id in (select id from offspring) and measurement_kind='birth' and cancelled_at is null group by source_birth_id having count(*)>1) d),
    'duplicateAdjustments',(select count(*) from (select client_command_id from public.whelping_birth_adjustment_commands where litter_id=${q(ids.litter)}::uuid group by client_command_id having count(*)>1) d)
  )::text;`)) as Record<string, number | string[]>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}

function panel(page: Page) {
  return page.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]");
}

function quickCard(scope: Locator, order: number) {
  return scope.getByTestId("quick-completion-card").filter({ hasText: `Naissance n°${order}` });
}

function expressBirthButton(scope: Locator, name: "+ NAISSANCE MÂLE" | "+ NAISSANCE FEMELLE") {
  return scope.getByTestId("express-birth-actions").last().getByRole("button", { name, exact: true });
}

async function chooseFixture(page: Page) {
  const selector = page.getByLabel("Portée affichée");
  const option = selector.locator("option").filter({ hasText: prefix });
  const value = await option.getAttribute("value");
  expect(value).not.toBeNull();
  await page.goto(`/whelping/selection?litter=${value}`);
  await expect(page.getByRole("heading", { name: `${prefix} Portée` })).toBeVisible({ timeout: 20_000 });
}

async function uiState(page: Page) {
  const scope = panel(page);
  return scope.evaluate((element) => {
    const quickCards = Array.from(element.querySelectorAll('[data-testid="quick-completion-card"]'));
    const timelineItems = Array.from(element.querySelectorAll("ol > li")).filter((item) => item.textContent?.trim().startsWith("#"));
    const history = Array.from(element.querySelectorAll("details")).find((detail) => detail.querySelector("summary")?.textContent?.includes("Historique des compléments et rectifications"));
    return {
      cards: quickCards.length,
      visibleOrders: quickCards.map((card) => Number(card.textContent?.match(/Naissance n°(\d+)/)?.[1])).filter(Number.isFinite),
      timeline: timelineItems.length,
      history: history?.querySelectorAll("ol > li").length ?? 0,
    };
  });
}

test("ouvre une session puis complète exactement deux naissances sans collision de clé", async ({ page }) => {
  const warning = "Encountered two children with the same key";
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes(warning)) {
      warnings.push(message.text());
      throw new Error(`React duplicate key warning: ${message.text()}`);
    }
  });

  async function checkpoint(step: string, expected: Record<string, unknown>) {
    const database = workflowState();
    const ui = await uiState(page);
    console.info(JSON.stringify({ quickCompletionKeySafetyCheckpoint: { step, warnings: warnings.length, database, ui } }));
    expect(warnings, `console warning at ${step}`).toEqual([]);
    expect({ ...database, ...ui }).toMatchObject(expected);
  }

  cleanup();
  expectClean();
  createFixtures();

  try {
    await login(page);
    await page.goto("/whelping");
    await chooseFixture(page);
    await checkpoint("1-initial-load", { sessions: 0, births: 0, events: 0, cards: 0 });

    await page.getByRole("button", { name: "Démarrer la mise-bas" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Démarrer la mise-bas" }).click();
    await expect(page.getByText("Session :").locator("..")).toContainText("En cours");
    await checkpoint("2-session-opened", { sessions: 1, commands: 1, births: 0, cards: 0 });
    await page.reload();
    await checkpoint("3-session-refresh-complete", { sessions: 1, births: 0, events: 0, cards: 0 });

    let mobilePanel = panel(page);
    await expressBirthButton(mobilePanel, "+ NAISSANCE MÂLE").click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n° 1");
    await checkpoint("4-male-birth-action", { births: 1, animals: 1, birthEvents: 1, recordBirthCommands: 1 });
    await expect(quickCard(mobilePanel, 1)).toBeVisible();
    await checkpoint("5-male-birth-refresh-complete", { births: 1, quickCompletionActions: 1, quickCompletionItems: 1, cards: 1, visibleOrders: [1], timeline: 1 });

    await expressBirthButton(mobilePanel, "+ NAISSANCE FEMELLE").click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n° 2");
    await checkpoint("6-female-birth-action", { births: 2, animals: 2, birthEvents: 2, recordBirthCommands: 2 });
    await expect(mobilePanel.getByTestId("quick-completion-card")).toHaveCount(2);
    await checkpoint("7-female-birth-refresh-complete", { births: 2, quickCompletionItems: 2, cards: 2, visibleOrders: [2, 1], timeline: 2, orders: [1, 2], sexes: ["male", "female"] });

    const male = quickCard(mobilePanel, 1);
    const female = quickCard(mobilePanel, 2);
    await male.locator("button[aria-expanded]").click();
    await expect(male.getByLabel("Poids de naissance")).toBeVisible();
    await expect(female.getByLabel("Poids de naissance")).toHaveCount(0);
    await male.getByRole("button", { name: "Bleu", exact: true }).click();
    await checkpoint("8-male-color-selected", { births: 2, quickCompletionItems: 2, cards: 2 });
    await male.getByLabel("Poids de naissance").fill("500");
    await checkpoint("9-male-weight-entered", { births: 2, measurements: 0, quickCompletionActions: 2, adjustments: 0 });
    await male.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°1 complétée : 500 g · collier bleu.");
    await expect(quickCard(mobilePanel, 1)).toHaveCount(0);
    await checkpoint("10-male-completion-saved", { births: 2, measurements: 1, quickCompletionActions: 1, adjustments: 1, correctionEvents: 1, cards: 1, visibleOrders: [2], history: 1 });
    await page.reload();
    mobilePanel = panel(page);
    await checkpoint("11-male-refresh-complete", { births: 2, cards: 1, visibleOrders: [2], timeline: 2, history: 1 });

    const remainingFemale = quickCard(mobilePanel, 2);
    await remainingFemale.getByRole("button", { name: "Rose", exact: true }).click();
    await checkpoint("12-female-color-selected", { births: 2, quickCompletionItems: 1, cards: 1 });
    await remainingFemale.getByLabel("Poids de naissance").fill("400");
    await checkpoint("13-female-weight-entered", { births: 2, measurements: 1, quickCompletionActions: 1, adjustments: 1 });
    await remainingFemale.getByRole("button", { name: "Enregistrer le complément" }).click();
    await expect(mobilePanel.getByRole("status")).toContainText("Naissance n°2 complétée : 400 g · collier rose.");
    await expect(mobilePanel.getByRole("heading", { name: "Naissances à compléter" })).toHaveCount(0);
    await checkpoint("14-female-completion-saved", { births: 2, animals: 2, measurements: 2, quickCompletionActions: 0, adjustments: 2, correctionEvents: 2, cards: 0, history: 2 });
    await page.reload();
    await checkpoint("15-final-refresh", {
      sessions: 1, births: 2, animals: 2, events: 4, birthEvents: 2, correctionEvents: 2,
      commands: 3, recordBirthCommands: 2, quickCompletionActions: 0, quickCompletionItems: 0, adjustments: 2,
      measurements: 2, orders: [1, 2], sexes: ["male", "female"], revisions: [1, 1],
      duplicateOrders: 0, duplicateEvents: 0, duplicateMeasurements: 0, duplicateAdjustments: 0,
      cards: 0, timeline: 2, history: 2,
    });
  } finally {
    cleanup();
    console.info(JSON.stringify({ quickCompletionKeySafetyCleanup: { prefix, remaining: expectClean() } }));
  }
});
