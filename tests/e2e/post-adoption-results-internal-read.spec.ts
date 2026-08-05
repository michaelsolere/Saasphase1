import { expect, test, type Page } from "@playwright/test";

import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(180_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const otherOrganizationId = "9f360001-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ids = {
  litter: "9f360002-0000-4000-8000-000000000001",
  contact: "9f360003-0000-4000-8000-000000000001",
  animal: "9f360004-0000-4000-8000-000000000001",
  reservation: "9f360005-0000-4000-8000-000000000001",
  instance: "9f360006-0000-4000-8000-000000000001",
  revision: "9f360007-0000-4000-8000-000000000001",
  secondAnimal: "9f360004-0000-4000-8000-000000000003",
  secondReservation: "9f360005-0000-4000-8000-000000000003",
  secondInstance: "9f360006-0000-4000-8000-000000000003",
  secondRevision: "9f360007-0000-4000-8000-000000000003",
  otherLitter: "9f360002-0000-4000-8000-000000000002",
  otherContact: "9f360003-0000-4000-8000-000000000002",
  otherAnimal: "9f360004-0000-4000-8000-000000000002",
  otherReservation: "9f360005-0000-4000-8000-000000000002",
  otherInstance: "9f360006-0000-4000-8000-000000000002",
} as const;
const familyPii = "famille-resultats-e2e@example.test";

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function cleanup() {
  sql(`
    begin;
    set local app.qa_hard_delete = 'on';
    set local session_replication_role = replica;
    delete from public.post_adoption_questionnaire_response_revisions
      where id in (${q(ids.revision)}::uuid, ${q(ids.secondRevision)}::uuid);
    delete from public.post_adoption_questionnaire_instances
      where id in (${q(ids.instance)}::uuid, ${q(ids.secondInstance)}::uuid, ${q(ids.otherInstance)}::uuid);
    delete from public.reservations
      where id in (${q(ids.reservation)}::uuid, ${q(ids.secondReservation)}::uuid, ${q(ids.otherReservation)}::uuid);
    delete from public.animals
      where id in (${q(ids.animal)}::uuid, ${q(ids.secondAnimal)}::uuid, ${q(ids.otherAnimal)}::uuid);
    delete from public.contacts
      where id in (${q(ids.contact)}::uuid, ${q(ids.otherContact)}::uuid);
    delete from public.litters
      where id in (${q(ids.litter)}::uuid, ${q(ids.otherLitter)}::uuid);
    delete from public.organization_settings where organization_id = ${q(otherOrganizationId)}::uuid;
    delete from public.organizations where id = ${q(otherOrganizationId)}::uuid;
    set local session_replication_role = origin;
    commit;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`select json_build_object(
      'revisions', (select count(*) from public.post_adoption_questionnaire_response_revisions where id in (${q(ids.revision)}::uuid, ${q(ids.secondRevision)}::uuid)),
      'instances', (select count(*) from public.post_adoption_questionnaire_instances where id in (${q(ids.instance)}::uuid, ${q(ids.secondInstance)}::uuid, ${q(ids.otherInstance)}::uuid)),
      'reservations', (select count(*) from public.reservations where id in (${q(ids.reservation)}::uuid, ${q(ids.secondReservation)}::uuid, ${q(ids.otherReservation)}::uuid)),
      'animals', (select count(*) from public.animals where id in (${q(ids.animal)}::uuid, ${q(ids.secondAnimal)}::uuid, ${q(ids.otherAnimal)}::uuid)),
      'contacts', (select count(*) from public.contacts where id in (${q(ids.contact)}::uuid, ${q(ids.otherContact)}::uuid)),
      'litters', (select count(*) from public.litters where id in (${q(ids.litter)}::uuid, ${q(ids.otherLitter)}::uuid)),
      'organizations', (select count(*) from public.organizations where id = ${q(otherOrganizationId)}::uuid)
    )::text;`),
  ) as Record<string, number>;
}

function createFixture() {
  sql(`
    begin;
    set local session_replication_role = replica;
    insert into public.organizations (id, name, slug)
    values (${q(otherOrganizationId)}::uuid, 'Organisation E2E isolée', 'post-adoption-results-isolated-e2e');

    insert into public.litters (id, organization_id, name, species, breed, status, expected_birth_date, created_by, updated_by)
    values
      (${q(ids.litter)}::uuid, ${q(organizationId)}::uuid, 'Portée Résultats E2E', 'dog', 'Golden Retriever', 'planned', '2025-01-01', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherLitter)}::uuid, ${q(otherOrganizationId)}::uuid, 'Portée autre organisation', 'dog', 'Golden Retriever', 'planned', '2025-02-01', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.contacts (id, organization_id, display_name, email, origin_channel, primary_status, created_by, updated_by)
    values
      (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Famille Résultats E2E', ${q(familyPii)}, 'other', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherContact)}::uuid, ${q(otherOrganizationId)}::uuid, 'Famille autre organisation', 'autre-organisation@example.test', 'other', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.animals (id, organization_id, litter_id, call_name, official_name, species, breed, sex, birth_date, status, ownership_status, created_by, updated_by)
    values
      (${q(ids.animal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'Nova Résultats E2E', 'Nova Officielle', 'dog', 'Golden Retriever', 'female', '2025-01-01', 'adopted', 'adopted_out', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondAnimal)}::uuid, ${q(organizationId)}::uuid, ${q(ids.litter)}::uuid, 'Orion Résultats E2E', 'Orion Officiel', 'dog', 'Golden Retriever', 'male', '2025-01-01', 'adopted', 'adopted_out', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherAnimal)}::uuid, ${q(otherOrganizationId)}::uuid, ${q(ids.otherLitter)}::uuid, 'Animal isolé E2E', 'Animal isolé officiel', 'dog', 'Golden Retriever', 'male', '2025-02-01', 'adopted', 'adopted_out', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reservations (id, organization_id, contact_id, litter_id, animal_id, species, breed, status, adoption_completed_at, created_by, updated_by)
    values
      (${q(ids.reservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, ${q(ids.animal)}::uuid, 'dog', 'Golden Retriever', 'adopted', '2025-03-01T12:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondReservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.litter)}::uuid, ${q(ids.secondAnimal)}::uuid, 'dog', 'Golden Retriever', 'adopted', '2025-03-02T12:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherReservation)}::uuid, ${q(otherOrganizationId)}::uuid, ${q(ids.otherContact)}::uuid, ${q(ids.otherLitter)}::uuid, ${q(ids.otherAnimal)}::uuid, 'dog', 'Golden Retriever', 'adopted', '2025-04-01T12:00:00Z', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.post_adoption_questionnaire_instances
      (id, organization_id, questionnaire_code, questionnaire_version, contact_id, reservation_id, animal_id, milestone, due_at, status, created_by, updated_by)
    values
      (${q(ids.instance)}::uuid, ${q(organizationId)}::uuid, 'post-adoption-t1', 1, ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid, ${q(ids.animal)}::uuid, 't1', '2025-05-01T12:00:00Z', 'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.secondInstance)}::uuid, ${q(organizationId)}::uuid, 'post-adoption-t1', 1, ${q(ids.contact)}::uuid, ${q(ids.secondReservation)}::uuid, ${q(ids.secondAnimal)}::uuid, 't1', '2025-05-01T12:00:00Z', 'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherInstance)}::uuid, ${q(otherOrganizationId)}::uuid, 'post-adoption-t1', 1, ${q(ids.otherContact)}::uuid, ${q(ids.otherReservation)}::uuid, ${q(ids.otherAnimal)}::uuid, 't1', '2025-06-01T12:00:00Z', 'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.post_adoption_questionnaire_response_revisions
      (id, organization_id, instance_id, revision_no, definition_sha256, answers, submitted_at, submission_source)
    select ${q(ids.revision)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid, 1,
      definition_sha256, '{"behavior_activity":"intermediate","t1_final_comment":"Texte libre E2E"}'::jsonb,
      '2025-05-02T12:00:00Z', 'family'
    from public.post_adoption_questionnaire_definitions
    where code = 'post-adoption-t1' and version = 1;
    insert into public.post_adoption_questionnaire_response_revisions
      (id, organization_id, instance_id, revision_no, definition_sha256, answers, submitted_at, submission_source)
    select ${q(ids.secondRevision)}::uuid, ${q(organizationId)}::uuid, ${q(ids.secondInstance)}::uuid, 1,
      definition_sha256,
      pg_catalog.jsonb_build_object(
        'behavior_activity', 'very_active',
        'behavior_calm_return', ${q(familyPii)},
        't1_final_comment', 'Autre texte libre E2E'
      ),
      '2025-05-03T12:00:00Z', 'family'
    from public.post_adoption_questionnaire_definitions
    where code = 'post-adoption-t1' and version = 1;
    set local session_replication_role = origin;
    commit;
  `);
}

test("les lectures internes sont groupées, isolées par organisation et navigables sans coordonnées familiales", async ({ browser, page }) => {
  try {
    cleanup();
    expect(Object.values(remainingCounts()).every((count) => count === 0)).toBe(true);
    createFixture();
    expect(JSON.parse(sql(`select json_build_object(
      'anon_overview', has_function_privilege('anon', 'public.list_post_adoption_questionnaire_results_overview(uuid)', 'execute'),
      'authenticated_overview', has_function_privilege('authenticated', 'public.list_post_adoption_questionnaire_results_overview(uuid)', 'execute'),
      'anon_individual', has_function_privilege('anon', 'public.read_post_adoption_questionnaire_individual_results(uuid)', 'execute'),
      'authenticated_individual', has_function_privilege('authenticated', 'public.read_post_adoption_questionnaire_individual_results(uuid)', 'execute'),
      'anon_collective', has_function_privilege('anon', 'public.read_post_adoption_questionnaire_collective_results(uuid)', 'execute'),
      'authenticated_collective', has_function_privilege('authenticated', 'public.read_post_adoption_questionnaire_collective_results(uuid)', 'execute')
    )::text;`))).toEqual({
      anon_overview: false,
      authenticated_overview: true,
      anon_individual: false,
      authenticated_individual: true,
      anon_collective: false,
      authenticated_collective: true,
    });

    const before = sql(`select json_build_object(
      'instances', count(*),
      'revisions', (select count(*) from public.post_adoption_questionnaire_response_revisions)
    )::text from public.post_adoption_questionnaire_instances;`);

    const anonymous = createAnonymousSupabaseClient();
    const anonymousOverview = await anonymous.rpc(
      "list_post_adoption_questionnaire_results_overview" as never,
      { p_litter_id: null } as never,
    );
    expect(anonymousOverview.error).not.toBeNull();
    const anonymousCollective = await anonymous.rpc(
      "read_post_adoption_questionnaire_collective_results" as never,
      { p_litter_id: ids.litter } as never,
    );
    expect(anonymousCollective.error).not.toBeNull();

    const member = await createAuthenticatedSupabaseClient();
    const overview = await member.rpc(
      "list_post_adoption_questionnaire_results_overview" as never,
      { p_litter_id: ids.litter } as never,
    );
    expect(overview.error).toBeNull();
    expect(overview.data).toEqual([
      expect.objectContaining({
        litter_id: ids.litter,
        animal_id: ids.animal,
        animal_name: "Nova Résultats E2E",
        instance_id: ids.instance,
        milestone: "t1",
        latest_revision_no: 1,
        definition_valid: true,
      }),
      expect.objectContaining({
        litter_id: ids.litter,
        animal_id: ids.secondAnimal,
        animal_name: "Orion Résultats E2E",
        instance_id: ids.secondInstance,
        milestone: "t1",
        latest_revision_no: 1,
        definition_valid: true,
      }),
    ]);
    expect(JSON.stringify(overview.data)).not.toContain(familyPii);
    expect(JSON.stringify(overview.data)).not.toContain("Famille Résultats E2E");

    const allVisible = await member.rpc(
      "list_post_adoption_questionnaire_results_overview" as never,
      { p_litter_id: null } as never,
    );
    expect(allVisible.error).toBeNull();
    expect(JSON.stringify(allVisible.data)).not.toContain(ids.otherAnimal);
    expect(JSON.stringify(allVisible.data)).not.toContain("Animal isolé E2E");

    const individual = await member.rpc(
      "read_post_adoption_questionnaire_individual_results" as never,
      { p_animal_id: ids.animal } as never,
    );
    expect(individual.error).toBeNull();
    expect(individual.data).toEqual([
      expect.objectContaining({
        animal_id: ids.animal,
        reservation_id: ids.reservation,
        latest_answers: {
          behavior_activity: "intermediate",
          t1_final_comment: "Texte libre E2E",
        },
      }),
    ]);
    expect(JSON.stringify(individual.data)).not.toContain(familyPii);
    expect(JSON.stringify(individual.data)).not.toContain("Famille Résultats E2E");

    const isolatedIndividual = await member.rpc(
      "read_post_adoption_questionnaire_individual_results" as never,
      { p_animal_id: ids.otherAnimal } as never,
    );
    expect(isolatedIndividual.error).toBeNull();
    expect(isolatedIndividual.data).toEqual([]);

    const collective = await member.rpc(
      "read_post_adoption_questionnaire_collective_results" as never,
      { p_litter_id: ids.litter } as never,
    );
    expect(collective.error).toBeNull();
    expect(collective.data).toEqual([
      expect.objectContaining({
        litter_id: ids.litter,
        animal_id: ids.animal,
        milestone: "t1",
        latest_structured_answers: { behavior_activity: "intermediate" },
      }),
      expect.objectContaining({
        litter_id: ids.litter,
        animal_id: ids.secondAnimal,
        milestone: "t1",
        latest_structured_answers: {
          behavior_activity: "very_active",
          behavior_calm_return: "__invalid__",
        },
      }),
    ]);
    expect(JSON.stringify(collective.data)).not.toContain("Texte libre E2E");
    expect(JSON.stringify(collective.data)).not.toContain("Autre texte libre E2E");
    expect(JSON.stringify(collective.data)).not.toContain(familyPii);
    const isolatedCollective = await member.rpc(
      "read_post_adoption_questionnaire_collective_results" as never,
      { p_litter_id: ids.otherLitter } as never,
    );
    expect(isolatedCollective.error).toBeNull();
    expect(isolatedCollective.data).toEqual([]);

    await login(page);
    await page.goto("/post-adoption");
    await expect(page.getByRole("heading", { name: "Suivi post-adoption" })).toBeVisible();
    await expect(page.getByTestId("main-sidebar").getByRole("link", { name: "Suivi post-adoption" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: /Portée Résultats E2E/ })).toBeVisible();
    await expect(page.getByText("T1 : 2 questionnaires reçus pour 2 chiots concernés")).toBeVisible();
    await expect(page.getByText(familyPii)).toHaveCount(0);

    const litterLink = page.getByRole("link", { name: /Portée Résultats E2E/ });
    await litterLink.focus();
    await expect(litterLink).toBeFocused();
    await litterLink.press("Enter");
    await expect(page).toHaveURL(`/post-adoption/litters/${ids.litter}`, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Portée Résultats E2E" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nova Résultats E2E" })).toBeVisible();
    await expect(page.getByText("Réponse reçue", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Jalon absent", { exact: true }).first()).toBeVisible();
    const t1Tab = page.getByRole("tab", { name: "T1 — 2 mois" });
    await expect(t1Tab).toHaveAttribute("aria-selected", "true");
    await t1Tab.focus();
    await t1Tab.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "T2 — 15 mois" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "T2 — 15 mois" }).press("ArrowLeft");
    await expect(t1Tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("2 questionnaires reçus", { exact: true })).toBeVisible();
    await expect(page.getByText("2 réponses représentées", { exact: true }).first()).toBeVisible();
    const intermediateLegend = page.getByRole("button", { name: /intermédiaire · 1/i }).first();
    await intermediateLegend.click();
    await expect(page.getByRole("link", { name: "Nova Résultats E2E" }).first()).toHaveAttribute(
      "href",
      `/post-adoption/animals/${ids.animal}`,
    );
    await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);
    await page.getByRole("button", { name: "Vue en tableau" }).click();
    const activityTable = page.getByRole("table", { name: /Niveau d’activité/ });
    await expect(activityTable).toBeVisible();
    await expect(activityTable.getByRole("link", { name: "Nova Résultats E2E" })).toHaveAttribute(
      "href",
      `/post-adoption/animals/${ids.animal}`,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(activityTable).toBeVisible();
    expect(await activityTable.evaluate((table) => table.scrollWidth <= table.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("tab", { name: "T2 — 15 mois" }).click();
    await expect(page.getByText("0 questionnaires reçus", { exact: true })).toBeVisible();
    await expect(page.getByText("Jalon absent : 2 chiots", { exact: true })).toBeVisible();
    await expect(page.getByText("Aucun questionnaire T2 n’a encore été reçu pour cette portée.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Niveau d’activité" })).toHaveCount(0);
    await page.getByRole("tab", { name: "T1 — 2 mois" }).click();
    await page.getByRole("button", { name: "Graphiques" }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("tab", { name: "T1 — 2 mois" })).toBeVisible();
    await expect(page.getByRole("button", { name: /intermédiaire · 1/i }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "400%"; });
    await expect(page.getByRole("tab", { name: "T1 — 2 mois" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vue en tableau" })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });

    const collectiveCaptureContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 900 },
    });
    try {
      const capturePage = await collectiveCaptureContext.newPage();
      await login(capturePage);
      await capturePage.goto(`/post-adoption/litters/${ids.litter}`);
      await expect(async () => {
        const activityCard = capturePage.locator("article").filter({
          has: capturePage.getByRole("heading", { name: "Niveau d’activité" }),
        });
        await expect(activityCard).toBeVisible();
        await activityCard.screenshot({ path: "/tmp/post-adoption-collective-activity-2x.png" });
      }).toPass({ timeout: 15_000 });
    } finally {
      await collectiveCaptureContext.close();
    }

    const novaItem = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: "Nova Résultats E2E" }),
    });
    const individualLink = novaItem.getByRole("link", { name: "Voir les résultats individuels" });
    await individualLink.focus();
    await expect(individualLink).toBeFocused();
    await individualLink.press("Enter");
    await expect(page).toHaveURL(`/post-adoption/animals/${ids.animal}`, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Résultats individuels de Nova Résultats E2E" })).toBeVisible();
    await expect(page.getByText("Texte libre E2E")).toBeVisible();
    await expect(page.getByText(familyPii)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Résultats individuels de Nova Résultats E2E" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir le parcours adoptant associé" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => { document.documentElement.style.zoom = "400%"; });
    await expect(page.getByRole("heading", { name: "Résultats individuels de Nova Résultats E2E" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir le parcours adoptant associé" })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });

    const captureContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 900 },
    });
    try {
      const capturePage = await captureContext.newPage();
      await login(capturePage);
      await capturePage.goto(`/post-adoption/animals/${ids.animal}`);
      await expect(async () => {
        const milestoneSection = capturePage.locator("section[aria-labelledby='milestones-heading']");
        await expect(milestoneSection).toBeVisible();
        await milestoneSection.screenshot({ path: "/tmp/post-adoption-results-milestones-2x.png" });
      }).toPass({ timeout: 15_000 });
    } finally {
      await captureContext.close();
    }

    await page.getByRole("link", { name: "Voir le parcours adoptant associé" }).click();
    await expect(page).toHaveURL(`/reservations/${ids.reservation}`, { timeout: 60_000 });

    const after = sql(`select json_build_object(
      'instances', count(*),
      'revisions', (select count(*) from public.post_adoption_questionnaire_response_revisions)
    )::text from public.post_adoption_questionnaire_instances;`);
    expect(after).toBe(before);
  } finally {
    cleanup();
    expect(remainingCounts()).toEqual({
      revisions: 0,
      instances: 0,
      reservations: 0,
      animals: 0,
      contacts: 0,
      litters: 0,
      organizations: 0,
    });
  }
});
