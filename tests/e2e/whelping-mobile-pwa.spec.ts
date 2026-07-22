import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const prefix = "WHELPING_MOBILE_PWA_V1_20260722";
const ids = {
  motherA: "9f260001-0000-4000-8000-000000000001",
  fatherA: "9f260001-0000-4000-8000-000000000002",
  motherB: "9f260001-0000-4000-8000-000000000003",
  fatherB: "9f260001-0000-4000-8000-000000000004",
  litterA: "9f260002-0000-4000-8000-000000000001",
  litterB: "9f260002-0000-4000-8000-000000000002",
  sessionB: "9f260003-0000-4000-8000-000000000001",
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
    delete from public.whelping_birth_adjustment_commands where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid);
    delete from public.whelping_commands where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid);
    delete from public.animal_weight_measurements where animal_id in (
      select id from public.animals where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid)
    );
    delete from public.whelping_births where session_id in (
      select id from public.whelping_sessions where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid)
    );
    delete from public.whelping_events where session_id in (
      select id from public.whelping_sessions where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid)
    );
    delete from public.animals where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid);
    delete from public.whelping_sessions where litter_id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid);
    delete from public.litters where id in (${q(ids.litterA)}::uuid, ${q(ids.litterB)}::uuid) or name like ${q(`${prefix}%`)};
    delete from public.animals where id in (${q(ids.motherA)}::uuid, ${q(ids.fatherA)}::uuid, ${q(ids.motherB)}::uuid, ${q(ids.fatherB)}::uuid)
      or notes like ${q(`${prefix}%`)};
    set session_replication_role = origin;
    commit;
  `);
}

function uuidList(values: string[] | undefined) {
  return values?.length ? values.map((value) => `${q(value)}::uuid`).join(",") : "null";
}

function remainingFixtureCounts(createdIds?: Record<string, string[]>) {
  return JSON.parse(sql(`select json_build_object(
    'commands',(select count(*) from public.whelping_commands where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid) or id in (${uuidList(createdIds?.commands)})),
    'adjustments',(select count(*) from public.whelping_birth_adjustment_commands where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid)),
    'measurements',(select count(*) from public.animal_weight_measurements where animal_id in (select id from public.animals where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid)) or id in (${uuidList(createdIds?.measurements)})),
    'births',(select count(*) from public.whelping_births where session_id in (select id from public.whelping_sessions where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid)) or id in (${uuidList(createdIds?.births)})),
    'events',(select count(*) from public.whelping_events where session_id in (select id from public.whelping_sessions where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid)) or id in (${uuidList(createdIds?.events)})),
    'sessions',(select count(*) from public.whelping_sessions where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid)),
    'offspring',(select count(*) from public.animals where litter_id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid) or id in (${uuidList(createdIds?.animals)})),
    'litters',(select count(*) from public.litters where id in (${q(ids.litterA)}::uuid,${q(ids.litterB)}::uuid) or name like ${q(`${prefix}%`)}),
    'parents',(select count(*) from public.animals where id in (${q(ids.motherA)}::uuid,${q(ids.fatherA)}::uuid,${q(ids.motherB)}::uuid,${q(ids.fatherB)}::uuid) or notes like ${q(`${prefix}%`)}),
    'role_changes',(select count(*) from public.memberships where id=${q(ownerMembershipId)}::uuid and role<>'owner')
  )::text;`)) as Record<string, number>;
}

function expectCleanupAtZero(createdIds?: Record<string, string[]>) {
  const counts = remainingFixtureCounts(createdIds);
  for (const [name, count] of Object.entries(counts)) {
    expect(count, `${name} must be hard-deleted or restored`).toBe(0);
  }
  return counts;
}

function createFixtures() {
  sql(`
    insert into public.animals (id,organization_id,call_name,species,breed,sex,status,ownership_status,is_breeder,notes,created_by,updated_by) values
      (${q(ids.motherA)}::uuid,${q(organizationId)}::uuid,'Aube mobile','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.fatherA)}::uuid,${q(organizationId)}::uuid,'Atlas mobile','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.motherB)}::uuid,${q(organizationId)}::uuid,'Brume mobile','dog','Golden Retriever','female','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.fatherB)}::uuid,${q(organizationId)}::uuid,'Boréal mobile','dog','Golden Retriever','male','breeding','owned',true,${q(`${prefix} parent`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.litters (id,organization_id,name,species,breed,mother_id,father_id,status,expected_birth_date,notes,created_by,updated_by) values
      (${q(ids.litterA)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Alpha`)},'dog','Golden Retriever',${q(ids.motherA)}::uuid,${q(ids.fatherA)}::uuid,'birth_expected',current_date,${q(`${prefix} litter`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid),
      (${q(ids.litterB)}::uuid,${q(organizationId)}::uuid,${q(`${prefix} Bravo`)},'dog','Golden Retriever',${q(ids.motherB)}::uuid,${q(ids.fatherB)}::uuid,'birth_in_progress',current_date,${q(`${prefix} litter`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
    insert into public.whelping_sessions (id,organization_id,litter_id,mother_id,status,started_at,timezone_name,note,created_by,updated_by) values
      (${q(ids.sessionB)}::uuid,${q(organizationId)}::uuid,${q(ids.litterB)}::uuid,${q(ids.motherB)}::uuid,'open','2026-07-22T10:00:00Z','Europe/Paris',${q(`${prefix} session`)},${q(ownerId)}::uuid,${q(ownerId)}::uuid);
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role=${q(role)} where id=${q(ownerMembershipId)}::uuid;
    set session_replication_role = origin;
  `);
}

async function login(page: Page, target = "/login") {
  await page.goto(target);
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}

function panel(page: Page) {
  return page.getByRole("heading", { name: "Mise-bas", exact: true }).locator("xpath=ancestor::section[1]");
}

async function verifyLoginReturns(browser: Browser) {
  const returnContext = await browser.newContext();
  try {
    const returnPage = await returnContext.newPage();
    await returnPage.goto("/whelping");
    await expect(returnPage).toHaveURL(/\/login\?next=%2Fwhelping|\/login\?next=\/whelping/);
    await login(returnPage, returnPage.url());
    await expect(returnPage).toHaveURL(/\/whelping(?:\?|$)/);
  } finally {
    await returnContext.close();
  }

  const rejectedContext = await browser.newContext();
  try {
    const rejectedPage = await rejectedContext.newPage();
    await login(rejectedPage, "/login?next=https%3A%2F%2Fautre-site.example");
    await expect(rejectedPage).toHaveURL(/\/candidatures\?connexion=success$/);
  } finally {
    await rejectedContext.close();
  }
}

async function verifyAuthenticatedLoginReturns(page: Page) {
  await page.goto("/login?next=%2Fwhelping%3Flitter%3D1");
  await expect(page).toHaveURL(/\/whelping\?litter=1$/);

  await page.goto("/login?next=https%3A%2F%2Fautre-site.example");
  await expect(page).toHaveURL(/\/candidatures$/);
  expect(page.url()).not.toContain("autre-site.example");
}

test("partage le Journal, reste autonome, installable et online-only", async ({ page, browser, request }) => {
  cleanup();
  expectCleanupAtZero();
  const createdIds: Record<string, string[]> = {
    parents: [ids.motherA, ids.fatherA, ids.motherB, ids.fatherB],
    litters: [ids.litterA, ids.litterB],
    sessions: [ids.sessionB],
    events: [], births: [], animals: [], measurements: [], commands: [],
  };

  try {
    createFixtures();
    await login(page);
    await page.goto("/whelping");
    await expect(page.getByRole("heading", { name: "Mise-bas mobile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${prefix} Bravo` })).toBeVisible();
    await expect(page.locator("[data-private-shell], [data-sidebar-desktop]")).toHaveCount(0);
    await expect(page.getByText("Session :").locator("..")).toContainText("En cours");

    const mobilePanel = panel(page);
    let dialog = await mobilePanel.getByRole("button", { name: "Ajouter un événement" }).click().then(() => page.getByRole("dialog"));
    await dialog.getByLabel("Type").selectOption("contractions");
    await dialog.getByLabel("Date et heure").fill("2026-07-22T12:15");
    await dialog.getByLabel("Note (facultative)").fill(`${prefix} contractions`);
    await dialog.getByRole("button", { name: "Ajouter l’événement" }).click();
    await expect(mobilePanel.getByText(`${prefix} contractions`)).toBeVisible();

    await mobilePanel.getByRole("button", { name: /ENREGISTRER UNE NAISSANCE/ }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date et heure de naissance").fill("2026-07-22T12:30");
    await dialog.getByLabel("Sexe").selectOption("female");
    await dialog.getByLabel("Couleur ou collier initial (facultatif)").fill("Sauge");
    await dialog.getByLabel("Poids en grammes (facultatif)").fill("410");
    await dialog.getByLabel("Heure de pesée").fill("2026-07-22T12:31");
    await dialog.getByLabel("Note (facultative)").fill(`${prefix} naissance`);
    await dialog.getByRole("button", { name: "Enregistrer la naissance" }).click();
    await expect(mobilePanel.getByText("Naissance n° 1")).toBeVisible();
    await expect(mobilePanel.getByText(`${prefix} naissance`)).toBeVisible();
    await expect(mobilePanel.getByRole("heading", { name: "Chronologie" })).toBeVisible();

    Object.assign(createdIds, JSON.parse(sql(`select json_build_object(
      'events',coalesce((select json_agg(id::text) from public.whelping_events where session_id=${q(ids.sessionB)}::uuid),'[]'::json),
      'births',coalesce((select json_agg(id::text) from public.whelping_births where session_id=${q(ids.sessionB)}::uuid),'[]'::json),
      'animals',coalesce((select json_agg(id::text) from public.animals where litter_id=${q(ids.litterB)}::uuid),'[]'::json),
      'measurements',coalesce((select json_agg(m.id::text) from public.animal_weight_measurements m join public.animals a on a.id=m.animal_id where a.litter_id=${q(ids.litterB)}::uuid),'[]'::json),
      'commands',coalesce((select json_agg(id::text) from public.whelping_commands where litter_id=${q(ids.litterB)}::uuid),'[]'::json)
    )::text;`)));
    console.info(`E2E whelping mobile created fixture IDs: ${JSON.stringify(createdIds)}`);

    const mobileHtml = await page.locator("main").evaluate((node) => node.outerHTML);
    expect(mobileHtml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(mobileHtml).not.toMatch(/revision|client_command|command_id|record_whelping|whelping_births|snapshot/i);
    for (const option of await page.getByLabel("Portée affichée").locator("option").all()) {
      expect(await option.getAttribute("value")).toMatch(/^\d+$/);
    }
    expect(page.url()).not.toContain(ids.litterB);

    await page.goto(`/litters/journal?litter=${ids.litterB}`);
    const journalPanel = panel(page);
    await expect(journalPanel.getByText(`${prefix} contractions`)).toBeVisible();
    await expect(journalPanel.getByText(`${prefix} naissance`)).toBeVisible();
    await expect(page.locator('link[rel="manifest"][href="/whelping.webmanifest"]')).toHaveCount(0);

    await page.goto("/whelping");
    await page.getByLabel("Portée affichée").selectOption("0");
    await expect(page).toHaveURL(/\/whelping\?litter=0$/);
    await expect(page.getByRole("heading", { name: `${prefix} Alpha` })).toBeVisible();

    setOwnerRole("viewer");
    await page.goto("/whelping");
    await expect(panel(page).getByText(`${prefix} naissance`)).toBeVisible();
    await expect(panel(page).getByRole("button")).toHaveCount(0);
    setOwnerRole("owner");

    await verifyAuthenticatedLoginReturns(page);
    await verifyLoginReturns(browser);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/whelping");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('link[rel="manifest"][href="/whelping.webmanifest"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const manifestResponse = await request.get("/whelping.webmanifest");
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()["content-type"]).toMatch(/json|manifest/);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      id: "/whelping", name: "SaaS Élevage – Mise-bas", short_name: "Mise-bas",
      start_url: "/whelping", scope: "/", display: "standalone", lang: "fr",
    });
    expect(JSON.stringify(manifest)).not.toMatch(/Users\/|secret|localhost|127\.0\.0\.1/i);
    expect(manifest.icons).toHaveLength(2);
    for (const [index, size] of [192, 512].entries()) {
      const iconResponse = await request.get(manifest.icons[index].src);
      expect(iconResponse.status()).toBe(200);
      expect(iconResponse.headers()["content-type"]).toContain("image/png");
      const dimensions = await page.evaluate(async ({ src }) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, { src: manifest.icons[index].src });
      expect(dimensions).toEqual([size, size]);
    }
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose?.includes("maskable"))).toBe(true);
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero(createdIds);
    console.info(`E2E whelping mobile final fixture counts: ${JSON.stringify(finalCounts)}`);
  }
});
