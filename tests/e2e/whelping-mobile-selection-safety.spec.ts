import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const prefix = "WHELPING_MOBILE_SELECTION_SAFETY_20260722";
const ids = {
  salome: "9f270001-0000-4000-8000-000000000001",
  salomeFather: "9f270001-0000-4000-8000-000000000002",
  rosie: "9f270001-0000-4000-8000-000000000003",
  rosieFather: "9f270001-0000-4000-8000-000000000004",
  salomeLitter: "9f270002-0000-4000-8000-000000000001",
  rosieLitter: "9f270002-0000-4000-8000-000000000002",
  salomeSession: "9f270003-0000-4000-8000-000000000001",
};

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

const organizationId = sql("select id from public.organizations where slug='elevage-e2e';");
const ownerId = sql("select id from public.profiles where email='e2e-owner@saasphase1.invalid';");
const ownerMembershipId = sql(
  `select id from public.memberships where organization_id=${q(organizationId)}::uuid and profile_id=${q(ownerId)}::uuid;`,
);

function cleanup() {
  sql(`
    begin;
    set session_replication_role = replica;
    update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid;
    delete from public.whelping_birth_adjustment_commands where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid);
    delete from public.whelping_commands where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid);
    delete from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid));
    delete from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid));
    delete from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid));
    delete from public.animals where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid);
    delete from public.whelping_sessions where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid);
    delete from public.litters where id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid) or name like ${q(`${prefix}%`)};
    delete from public.animals where id in (${q(ids.salome)}::uuid,${q(ids.salomeFather)}::uuid,${q(ids.rosie)}::uuid,${q(ids.rosieFather)}::uuid) or notes like ${q(`${prefix}%`)};
    set session_replication_role = origin;
    commit;
  `);
}

function remainingCounts() {
  return JSON.parse(sql(`select json_build_object(
    'commands',(select count(*) from public.whelping_commands where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid)),
    'adjustments',(select count(*) from public.whelping_birth_adjustment_commands where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid)),
    'measurements',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid))),
    'births',(select count(*) from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid))),
    'events',(select count(*) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid))),
    'sessions',(select count(*) from public.whelping_sessions where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid)),
    'offspring',(select count(*) from public.animals where litter_id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid)),
    'litters',(select count(*) from public.litters where id in (${q(ids.salomeLitter)}::uuid,${q(ids.rosieLitter)}::uuid) or name like ${q(`${prefix}%`)}),
    'parents',(select count(*) from public.animals where id in (${q(ids.salome)}::uuid,${q(ids.salomeFather)}::uuid,${q(ids.rosie)}::uuid,${q(ids.rosieFather)}::uuid) or notes like ${q(`${prefix}%`)}),
    'role_changes',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function expectCleanupAtZero() {
  const counts = remainingCounts();
  for (const [name, count] of Object.entries(counts)) {
    expect(count, `${name} must be hard-deleted or restored`).toBe(0);
  }
  return counts;
}

function createFixtures() {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by) values
      (${q(ids.salome)}::uuid,${q(organizationId)}::uuid,'Salomé sécurité','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.salomeFather)}::uuid,${q(organizationId)}::uuid,'Mistral sécurité','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.rosie)}::uuid,${q(organizationId)}::uuid,'Rosie sécurité','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.rosieFather)}::uuid,${q(organizationId)}::uuid,'Rimbaud sécurité','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters (id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,notes,created_at,updated_at,created_by,updated_by) values
      (${q(ids.salomeLitter)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Salomé`)},'dog','Golden Retriever',${q(ids.salome)}::uuid,${q(ids.salomeFather)}::uuid,'birth_in_progress',current_date,${q(`${prefix} litter`)},'2026-07-20T10:00:00Z','2026-07-20T10:00:00Z',${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.rosieLitter)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Rosie`)},'dog','Golden Retriever',${q(ids.rosie)}::uuid,${q(ids.rosieFather)}::uuid,'birth_expected',current_date + 1,${q(`${prefix} litter`)},'2026-07-21T10:00:00Z','2026-07-21T10:00:00Z',${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions (id,organization_id,litter_id,mother_id,status,started_at,timezone_name,note,created_by,updated_by) values
      (${q(ids.salomeSession)}::uuid,${q(organizationId)}::uuid,${q(ids.salomeLitter)}::uuid,${q(ids.salome)}::uuid,'open',now() - interval '1 hour','Europe/Paris',${q(`${prefix} session`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function state() {
  return JSON.parse(sql(`select json_build_object(
    'salomeSessions',(select count(*) from public.whelping_sessions where litter_id=${q(ids.salomeLitter)}::uuid),
    'salomeCommands',(select count(*) from public.whelping_commands where litter_id=${q(ids.salomeLitter)}::uuid),
    'salomeEvents',(select count(*) from public.whelping_events where session_id=${q(ids.salomeSession)}::uuid),
    'salomeBirths',(select count(*) from public.whelping_births where session_id=${q(ids.salomeSession)}::uuid),
    'salomeAnimals',(select count(*) from public.animals where litter_id=${q(ids.salomeLitter)}::uuid),
    'rosieSessions',(select count(*) from public.whelping_sessions where litter_id=${q(ids.rosieLitter)}::uuid),
    'rosieCommands',(select count(*) from public.whelping_commands where litter_id=${q(ids.rosieLitter)}::uuid),
    'rosieEvents',(select count(*) from public.whelping_events e join public.whelping_sessions s on s.id=e.session_id where s.litter_id=${q(ids.rosieLitter)}::uuid),
    'rosieBirths',(select count(*) from public.whelping_births b join public.whelping_sessions s on s.id=b.session_id where s.litter_id=${q(ids.rosieLitter)}::uuid),
    'rosieMaleBirths',(select count(*) from public.whelping_births b join public.whelping_sessions s on s.id=b.session_id where s.litter_id=${q(ids.rosieLitter)}::uuid and b.sex='male'),
    'rosieFemaleBirths',(select count(*) from public.whelping_births b join public.whelping_sessions s on s.id=b.session_id where s.litter_id=${q(ids.rosieLitter)}::uuid and b.sex='female'),
    'rosieAnimals',(select count(*) from public.animals where litter_id=${q(ids.rosieLitter)}::uuid),
    'rosieActualDate',(select actual_birth_date from public.litters where id=${q(ids.rosieLitter)}::uuid)
  )::text;`)) as Record<string, number | string | null>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}

async function chooseLitter(page: Page, label: RegExp) {
  const select = page.getByLabel("Portée affichée");
  const option = select.locator("option").filter({ hasText: label });
  const value = await option.getAttribute("value");
  expect(value).not.toBeNull();
  await select.selectOption(value!);
}

test("verrouille la course et conserve une sélection serveur stable", async ({ page, context }) => {
  const browserMessages: string[] = [];
  page.on("console", (message) => browserMessages.push(message.text()));
  cleanup();
  expectCleanupAtZero();
  createFixtures();

  try {
    await login(page);
    await page.goto("/whelping");
    await expect(page.getByRole("heading", { name: `${prefix} Salomé` })).toBeVisible();
    const initialSelectionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "whelping_mobile_selection",
    );
    expect(initialSelectionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/whelping" });
    await expect(page.getByText("Mère :").locator("..")).toContainText("Salomé sécurité");
    await expect(page.getByText("Session :").locator("..")).toContainText("En cours");

    const oldMaleButton = page.getByRole("button", { name: "+ NAISSANCE MÂLE" });
    const oldMaleHandle = await oldMaleButton.elementHandle();
    let delayFirstSelection = true;
    await page.route("**/whelping", async (route) => {
      if (route.request().method() === "POST" && delayFirstSelection) {
        delayFirstSelection = false;
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });

    await chooseLitter(page, /Rosie$/);
    await expect(page.getByText("Changement de portée…")).toBeVisible();
    await expect(oldMaleButton).toBeHidden();
    await expect(page.locator("[data-whelping-selection-boundary] > div[aria-hidden='true'][inert]")).toHaveCount(1);
    await oldMaleHandle?.evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByRole("heading", { name: `${prefix} Rosie` })).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    expect(state()).toMatchObject({
      salomeSessions: 1, salomeCommands: 0, salomeEvents: 0, salomeBirths: 0, salomeAnimals: 0,
      rosieSessions: 0, rosieCommands: 0, rosieEvents: 0, rosieBirths: 0, rosieAnimals: 0,
    });
    await expect(page).toHaveURL(/\/whelping$/);

    // L'onglet A garde une ancienne action Salomé ; l'onglet B change le cookie partagé vers Rosie.
    await chooseLitter(page, /Salomé$/);
    await expect(page.getByRole("heading", { name: `${prefix} Salomé` })).toBeVisible();
    const staleMaleButton = page.getByRole("button", { name: "+ NAISSANCE MÂLE" });
    const secondTab = await context.newPage();
    secondTab.on("console", (message) => browserMessages.push(message.text()));
    await secondTab.goto("/whelping");
    await chooseLitter(secondTab, /Rosie$/);
    await expect(secondTab.getByRole("heading", { name: `${prefix} Rosie` })).toBeVisible();
    await staleMaleButton.click();
    await expect(page.getByRole("alert").filter({ hasText: "La portée affichée a changé." })).toContainText(
      "La portée affichée a changé. Rechargez le mode mise-bas avant de continuer.",
    );
    expect(state()).toMatchObject({ salomeBirths: 0, salomeAnimals: 0, rosieBirths: 0, rosieAnimals: 0 });

    // Ouverture puis première naissance sur Rosie : le catalogue se réordonne mais le cookie garde Rosie.
    await secondTab.getByRole("button", { name: "Démarrer la mise-bas" }).click();
    let dialog = secondTab.getByRole("dialog");
    await dialog.getByRole("button", { name: "Démarrer la mise-bas" }).click();
    await expect(secondTab.getByText("Session :").locator("..")).toContainText("En cours");

    await secondTab.getByRole("button", { name: "+ NAISSANCE MÂLE" }).dblclick();
    await expect(secondTab.getByRole("status")).toContainText("Naissance n° 1");
    await expect.poll(() => state().rosieBirths).toBe(1);
    expect(state()).toMatchObject({ rosieMaleBirths: 1, rosieAnimals: 1, salomeBirths: 0, salomeAnimals: 0 });
    await secondTab.reload();
    await expect(secondTab.getByRole("heading", { name: `${prefix} Rosie` })).toBeVisible();
    await expect(secondTab.getByLabel("Portée affichée")).toHaveValue("0");
    expect(await secondTab.getByLabel("Portée affichée").locator("option:checked").textContent()).toContain("Rosie");
    expect(state().rosieActualDate).not.toBeNull();

    await secondTab.getByRole("button", { name: "+ NAISSANCE FEMELLE" }).click();
    await expect.poll(() => state().rosieBirths).toBe(2);
    expect(state()).toMatchObject({ rosieMaleBirths: 1, rosieFemaleBirths: 1, rosieAnimals: 2, salomeBirths: 0 });

    await expect(secondTab.getByRole("heading", { name: `${prefix} Rosie` })).toBeVisible();
    await secondTab.getByRole("button", { name: "Saisir tous les détails", exact: true }).click();
    dialog = secondTab.getByRole("dialog");
    await dialog.getByLabel("Sexe").selectOption("male");
    await dialog.getByLabel("Couleur ou collier initial (facultatif)").fill("Bleu sécurité");
    await dialog.getByRole("button", { name: "Enregistrer la naissance" }).click();
    await expect.poll(() => state().rosieBirths).toBe(3);
    expect(state()).toMatchObject({ rosieMaleBirths: 2, rosieFemaleBirths: 1, rosieAnimals: 3, salomeBirths: 0, salomeAnimals: 0 });
    await expect(secondTab.getByRole("button", { name: "+ NAISSANCE MÂLE" }).last()).toBeEnabled();

    const html = await secondTab.locator("main").evaluate((node) => node.outerHTML);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(html).not.toMatch(/mobileSelectionRevision|whelping_mobile_selection=|client_command_id/i);
    await expect(secondTab).toHaveURL(/\/whelping$/);

    sql(`set session_replication_role=replica; update public.memberships set role='viewer' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);
    await secondTab.reload();
    await expect(secondTab.getByRole("heading", { name: `${prefix} Rosie` })).toBeVisible();
    await expect(secondTab.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]").getByRole("button")).toHaveCount(0);
    sql(`set session_replication_role=replica; update public.memberships set role='owner' where id=${q(ownerMembershipId)}::uuid; set session_replication_role=origin;`);

    await secondTab.goto(`/litters/journal?litter=${ids.rosieLitter}`);
    await expect(secondTab.getByText("Naissance n° 1")).toBeVisible();
    await expect(secondTab.getByText("Naissance n° 3")).toBeVisible();
    await secondTab.setViewportSize({ width: 375, height: 812 });
    await secondTab.goto("/whelping");
    await expect(secondTab).toHaveURL(/\/whelping$/);
    expect(await secondTab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(browserMessages.join("\n")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    const createdIds = JSON.parse(sql(`select json_build_object(
      'sessions',coalesce((select json_agg(id::text) from public.whelping_sessions where litter_id=${q(ids.rosieLitter)}::uuid),'[]'::json),
      'commands',coalesce((select json_agg(id::text) from public.whelping_commands where litter_id=${q(ids.rosieLitter)}::uuid),'[]'::json),
      'events',coalesce((select json_agg(e.id::text) from public.whelping_events e join public.whelping_sessions s on s.id=e.session_id where s.litter_id=${q(ids.rosieLitter)}::uuid),'[]'::json),
      'births',coalesce((select json_agg(b.id::text) from public.whelping_births b join public.whelping_sessions s on s.id=b.session_id where s.litter_id=${q(ids.rosieLitter)}::uuid),'[]'::json),
      'animals',coalesce((select json_agg(id::text) from public.animals where litter_id=${q(ids.rosieLitter)}::uuid),'[]'::json)
    )::text;`));
    console.info(`E2E whelping selection safety created fixture IDs: ${JSON.stringify(createdIds)}`);
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero();
    console.info(`E2E whelping selection safety final fixture counts: ${JSON.stringify(finalCounts)}`);
  }
});
