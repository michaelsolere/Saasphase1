import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const ownerMembershipId = "30000000-0000-4000-8000-000000000001";
const prefix = "9f190005-0000-4000-8000-0000000000";
const fixtureNamePrefix = "E2E whelping journal panel";

const ids = {
  mother: `${prefix}01`,
  father: `${prefix}02`,
  mainLitter: `${prefix}10`,
  incompleteLitter: `${prefix}11`,
  incompleteSession: `${prefix}20`,
  incompleteEvent: `${prefix}21`,
  incompleteBirth: `${prefix}22`,
  missingAnimal: `${prefix}23`,
} as const;

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.whelping_commands
    where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid);

    delete from public.animal_weight_measurements measurement
    where measurement.animal_id in (
      select animal.id from public.animals animal
      where animal.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
    )
    or measurement.source_birth_id in (
      select birth.id from public.whelping_births birth
      join public.whelping_sessions session on session.id = birth.session_id
      where session.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
    );

    delete from public.whelping_births birth
    using public.whelping_sessions session
    where birth.session_id = session.id
      and session.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid);

    delete from public.whelping_events event
    using public.whelping_sessions session
    where event.session_id = session.id
      and session.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid);

    delete from public.whelping_sessions
    where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid);

    delete from public.animals
    where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid);

    delete from public.litters
    where id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
       or name like ${q(`${fixtureNamePrefix}%`)};

    delete from public.animals
    where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid);

    set session_replication_role = replica;
    update public.memberships set role = 'owner'
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function remainingFixtureCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'whelping_commands', (
          select count(*) from public.whelping_commands
          where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
        ),
        'animal_weight_measurements', (
          select count(*) from public.animal_weight_measurements measurement
          left join public.animals animal on animal.id = measurement.animal_id
          left join public.whelping_births birth on birth.id = measurement.source_birth_id
          left join public.whelping_sessions session on session.id = birth.session_id
          where animal.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
             or session.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
        ),
        'whelping_births', (
          select count(*) from public.whelping_births birth
          join public.whelping_sessions session on session.id = birth.session_id
          where session.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
        ),
        'whelping_events', (
          select count(*) from public.whelping_events event
          join public.whelping_sessions session on session.id = event.session_id
          where session.litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
        ),
        'whelping_sessions', (
          select count(*) from public.whelping_sessions
          where litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
        ),
        'litters', (
          select count(*) from public.litters
          where id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
             or name like ${q(`${fixtureNamePrefix}%`)}
        ),
        'animals', (
          select count(*) from public.animals
          where id in (${q(ids.mother)}::uuid, ${q(ids.father)}::uuid)
             or litter_id in (${q(ids.mainLitter)}::uuid, ${q(ids.incompleteLitter)}::uuid)
        ),
        'membership_role_changes', (
          select count(*) from public.memberships
          where id = ${q(ownerMembershipId)}::uuid and role <> 'owner'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  const counts = remainingFixtureCounts();
  for (const [table, count] of Object.entries(counts)) {
    expect(count, `${table} fixtures must be hard-deleted or restored`).toBe(0);
  }
  return counts;
}

function createFixtures() {
  sql(`
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status,
      ownership_status, is_breeder, created_by, updated_by
    ) values
      (${q(ids.mother)}::uuid, ${q(organizationId)}::uuid,
       'Mère panneau mise-bas E2E', 'dog', 'Golden Retriever', 'female',
       'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.father)}::uuid, ${q(organizationId)}::uuid,
       'Père panneau mise-bas E2E', 'dog', 'Golden Retriever', 'male',
       'breeding', 'owned', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id,
      status, expected_birth_date, created_by, updated_by
    ) values
      (${q(ids.mainLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} principale`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'birth_expected',
       current_date, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incompleteLitter)}::uuid, ${q(organizationId)}::uuid,
       ${q(`${fixtureNamePrefix} chargement incomplet`)}, 'dog', 'Golden Retriever',
       ${q(ids.mother)}::uuid, ${q(ids.father)}::uuid, 'birth_expected',
       current_date, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
}

function createIncompleteSessionFixture() {
  sql(`
    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at,
      timezone_name, created_by, updated_by
    ) values (
      ${q(ids.incompleteSession)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.incompleteLitter)}::uuid, ${q(ids.mother)}::uuid, 'open',
      '2026-07-19T07:00:00.000Z'::timestamptz, 'Europe/Paris',
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
    );

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at,
      event_type, note, author_id
    ) values (
      ${q(ids.incompleteEvent)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.incompleteSession)}::uuid, 1,
      '2026-07-19T07:30:00.000Z'::timestamptz, 'birth',
      'Événement volontairement incomplet pour le test.', ${q(ownerId)}::uuid
    );

    set session_replication_role = replica;
    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, initial_collar_color, occurred_at, note, created_by
    ) values (
      ${q(ids.incompleteBirth)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.incompleteSession)}::uuid, ${q(ids.incompleteEvent)}::uuid,
      ${q(ids.missingAnimal)}::uuid, 1, 'female', 'alive', 'Test',
      '2026-07-19T07:30:00.000Z'::timestamptz, 'Événement volontairement incomplet pour le test.',
      ${q(ownerId)}::uuid
    );
    set session_replication_role = origin;
  `);
}

function setOwnerRole(role: "owner" | "viewer") {
  sql(`
    set session_replication_role = replica;
    update public.memberships set role = ${q(role)}
    where id = ${q(ownerMembershipId)}::uuid
      and organization_id = ${q(organizationId)}::uuid
      and profile_id = ${q(ownerId)}::uuid;
    set session_replication_role = origin;
  `);
}

function outOfScopeCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (select count(*) from public.events),
        'litter_care_tasks', (select count(*) from public.litter_care_tasks),
        'reservations', (select count(*) from public.reservations),
        'documents', (select count(*) from public.documents),
        'payments', (select count(*) from public.payments)
      )::text;
    `),
  ) as Record<string, number>;
}

function whelpingDatabaseState() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions', (
          select count(*) from public.whelping_sessions where litter_id = ${q(ids.mainLitter)}::uuid
        ),
        'events', (
          select count(*) from public.whelping_events event
          join public.whelping_sessions session on session.id = event.session_id
          where session.litter_id = ${q(ids.mainLitter)}::uuid
        ),
        'births', (
          select count(*) from public.whelping_births birth
          join public.whelping_sessions session on session.id = birth.session_id
          where session.litter_id = ${q(ids.mainLitter)}::uuid
        ),
        'animals', (
          select count(*) from public.animals where litter_id = ${q(ids.mainLitter)}::uuid
        ),
        'measurements', (
          select count(*) from public.animal_weight_measurements measurement
          join public.animals animal on animal.id = measurement.animal_id
          where animal.litter_id = ${q(ids.mainLitter)}::uuid
        ),
        'born_total_count', (
          select born_total_count from public.litters where id = ${q(ids.mainLitter)}::uuid
        ),
        'born_female_count', (
          select born_female_count from public.litters where id = ${q(ids.mainLitter)}::uuid
        ),
        'alive_count', (
          select alive_count from public.litters where id = ${q(ids.mainLitter)}::uuid
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function createdArtifactIds() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'sessions', coalesce((
          select json_agg(id::text order by created_at) from public.whelping_sessions
          where litter_id = ${q(ids.mainLitter)}::uuid
        ), '[]'::json),
        'events', coalesce((
          select json_agg(event.id::text order by event.sequence_no)
          from public.whelping_events event
          join public.whelping_sessions session on session.id = event.session_id
          where session.litter_id = ${q(ids.mainLitter)}::uuid
        ), '[]'::json),
        'births', coalesce((
          select json_agg(birth.id::text order by birth.birth_order)
          from public.whelping_births birth
          join public.whelping_sessions session on session.id = birth.session_id
          where session.litter_id = ${q(ids.mainLitter)}::uuid
        ), '[]'::json),
        'animals', coalesce((
          select json_agg(id::text order by birth_order) from public.animals
          where litter_id = ${q(ids.mainLitter)}::uuid
        ), '[]'::json),
        'measurements', coalesce((
          select json_agg(measurement.id::text order by measurement.created_at)
          from public.animal_weight_measurements measurement
          join public.animals animal on animal.id = measurement.animal_id
          where animal.litter_id = ${q(ids.mainLitter)}::uuid
        ), '[]'::json),
        'commands', coalesce((
          select json_agg(id::text order by created_at) from public.whelping_commands
          where litter_id = ${q(ids.mainLitter)}::uuid
        ), '[]'::json)
      )::text;
    `),
  ) as Record<string, string[]>;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

function whelpingPanel(page: Page) {
  return page
    .getByRole("heading", { name: "Mise-bas", exact: true })
    .locator("xpath=ancestor::section[1]");
}

async function openDialog(panel: Locator, buttonName: string | RegExp) {
  await panel.getByRole("button", { name: buttonName }).click();
  const dialog = panel.page().getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("pilote une session de mise-bas et conserve une chronologie unique", async ({ page }) => {
  cleanup();
  expectCleanupAtZero();
  const createdFixtureIds = {
    mothers: [ids.mother, ids.father],
    litters: [ids.mainLitter, ids.incompleteLitter],
  };

  try {
    createFixtures();
    const outOfScopeBefore = outOfScopeCounts();
    await login(page);
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);

    let panel = whelpingPanel(page);
    await expect(panel.getByText("Aucune session démarrée")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Démarrer la mise-bas" })).toBeVisible();

    let dialog = await openDialog(panel, "Démarrer la mise-bas");
    await expect(dialog.getByLabel("Date et heure de début")).not.toHaveValue("");
    await dialog.getByLabel("Date et heure de début").fill("2026-07-19T09:00");
    await dialog.getByLabel("Note (facultative)").fill("Début suivi E2E.");
    await dialog.getByRole("button", { name: "Démarrer la mise-bas" }).click();

    await expect(panel.getByText("La session de mise-bas a été ouverte.")).toBeVisible();
    await expect(panel.getByText("En cours", { exact: true })).toBeVisible();
    const { timezone, formattedStart } = await page.evaluate(() => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      return {
        timezone,
        formattedStart: new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date("2026-07-19T09:00")),
      };
    });
    await expect(panel.getByText(`Début : ${formattedStart}`)).toBeVisible();
    await expect(panel.getByText(`Fuseau : ${timezone}`)).toBeVisible();
    await expect(panel.getByText("Naissances enregistrées")).toContainText("0");

    dialog = await openDialog(panel, "Ajouter un événement");
    await dialog.getByLabel("Type").selectOption("contractions");
    await dialog.getByLabel("Date et heure").fill("2026-07-19T09:15");
    await dialog.getByLabel("Note (facultative)").fill("Contractions régulières E2E.");
    await dialog.getByRole("button", { name: "Ajouter l’événement" }).click();
    await expect(panel.getByText("L’événement de mise-bas a été enregistré.")).toBeVisible();
    await expect(panel.locator("ol > li")).toHaveCount(1);
    await expect(panel.locator("ol > li").first()).toContainText("Contractions");

    dialog = await openDialog(panel, /ENREGISTRER UNE NAISSANCE/);
    await dialog.getByLabel("Date et heure de naissance").fill("2026-07-19T09:30");
    await dialog.getByLabel("Sexe").selectOption("female");
    await expect(dialog.getByLabel("Viabilité")).toHaveValue("alive");
    await dialog.getByLabel("Couleur ou collier initial (facultatif)").fill("Rose");
    await dialog.getByLabel("Poids en grammes (facultatif)").fill("425");
    await expect(dialog.getByLabel("Heure de pesée")).toBeVisible();
    await dialog.getByLabel("Heure de pesée").fill("2026-07-19T09:31");
    await dialog.getByLabel("Note (facultative)").fill("Naissance vivante E2E.");
    await dialog.getByRole("button", { name: "Enregistrer la naissance" }).click();

    await expect(panel.getByText("Naissance n° 1 enregistrée")).toBeVisible();
    await expect(panel.getByText("Naissances enregistrées")).toContainText("1");
    await expect(panel.locator("ol > li")).toHaveCount(2);
    const birthEntry = panel.locator("ol > li").filter({ hasText: "Naissance n° 1" });
    await expect(birthEntry).toHaveCount(1);
    await expect(birthEntry).toContainText("Femelle");
    await expect(birthEntry).toContainText("Vivant");
    await expect(birthEntry).toContainText("Rose");
    await expect(birthEntry).toContainText("425 g");
    await expect(birthEntry).toContainText("Naissance vivante E2E.");
    expect(await panel.textContent()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    expect(whelpingDatabaseState()).toMatchObject({
      sessions: 1,
      events: 2,
      births: 1,
      animals: 1,
      measurements: 1,
      born_total_count: 1,
      born_female_count: 1,
      alive_count: 1,
    });
    const summary = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Synthèse de la portée" }),
    });
    await expect(summary.getByText("Nombre né").locator("..").locator("dd")).toHaveText("1");
    await expect(summary.getByText("Nombre vivant").locator("..").locator("dd")).toHaveText("1");
    await expect(summary.getByText("Animaux liés").locator("..").locator("dd")).toHaveText("1");

    dialog = await openDialog(panel, /ENREGISTRER UNE NAISSANCE/);
    await dialog.getByLabel("Date et heure de naissance").fill("2026-07-19T09:45");
    await dialog.getByLabel("Sexe").selectOption("male");
    await dialog.getByLabel("Note (facultative)").fill("Poids de naissance à compléter E2E.");
    await dialog.getByRole("button", { name: "Enregistrer la naissance" }).click();
    await expect(panel.getByText("Naissance n° 2 enregistrée")).toBeVisible();
    await expect(panel.getByText("Naissances enregistrées")).toContainText("2");

    await page.reload();
    panel = whelpingPanel(page);
    await expect(panel.getByText("Contractions régulières E2E.")).toBeVisible();
    await expect(panel.getByText("Naissance vivante E2E.")).toBeVisible();
    await expect(panel.getByText("Poids de naissance à compléter E2E.")).toBeVisible();
    await expect(panel.locator("ol > li")).toHaveCount(3);

    setOwnerRole("viewer");
    await page.reload();
    panel = whelpingPanel(page);
    await expect(panel.getByText("Naissance n° 1")).toBeVisible();
    await expect(panel.getByRole("button", { name: /ENREGISTRER UNE NAISSANCE/ })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Ajouter un événement" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Clôturer la mise-bas" })).toHaveCount(0);

    setOwnerRole("owner");
    await page.reload();
    panel = whelpingPanel(page);
    dialog = await openDialog(panel, "Clôturer la mise-bas");
    await expect(dialog).toContainText("restera visible en cas de réouverture");
    await dialog.getByLabel("Date et heure de fin").fill("2026-07-19T10:30");
    await dialog.getByLabel("Note (facultative)").fill("Fin de mise-bas E2E.");
    await dialog.getByRole("button", { name: "Clôturer la mise-bas" }).click();

    await expect(panel.getByText("Clôturée", { exact: true })).toBeVisible();
    await expect(panel.getByText("Session clôturée")).toBeVisible();
    await expect(panel.getByText("Fin de mise-bas E2E.")).toBeVisible();
    await expect(panel.locator("ol > li")).toHaveCount(4);
    await expect(panel.getByRole("button", { name: /ENREGISTRER UNE NAISSANCE/ })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Ajouter un événement" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Clôturer la mise-bas" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Démarrer la mise-bas" })).toHaveCount(0);
    await expect(panel.getByText(
      "La session est clôturée. Seuls les poids de naissance manquants peuvent encore être renseignés. Rouvrez la session pour reprendre la mise-bas.",
    )).toBeVisible();
    await expect(panel.getByRole("button", { name: "Rouvrir la session" })).toBeVisible();
    expect(outOfScopeCounts()).toEqual(outOfScopeBefore);

    setOwnerRole("viewer");
    await page.reload();
    panel = whelpingPanel(page);
    await expect(panel.getByRole("button", { name: "Rouvrir la session" })).toHaveCount(0);

    setOwnerRole("owner");
    await page.reload();
    panel = whelpingPanel(page);
    dialog = await openDialog(panel, "Rouvrir la session");
    await expect(dialog).toContainText("L’ancienne clôture restera visible");
    await expect(dialog.getByLabel("Motif de la réouverture")).toHaveAttribute("required", "");
    await dialog.getByLabel("Motif de la réouverture").fill("Une naissance restait à enregistrer.");
    await dialog.getByRole("button", { name: "Confirmer la réouverture" }).click();

    await expect(panel.getByText("La session de mise-bas a été rouverte.")).toBeVisible();
    await expect(panel.getByText("En cours", { exact: true })).toBeVisible();
    await expect(panel.getByText("Session clôturée")).toBeVisible();
    await expect(panel.getByText("Session rouverte")).toBeVisible();
    await expect(panel.getByText("Une naissance restait à enregistrer.")).toBeVisible();
    await expect(panel.locator("ol > li")).toHaveCount(5);
    await expect(panel.getByRole("button", { name: /ENREGISTRER UNE NAISSANCE/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ajouter un événement" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Clôturer la mise-bas" })).toBeVisible();
    expect(await panel.textContent()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    dialog = await openDialog(panel, "Clôturer la mise-bas");
    await dialog.getByLabel("Date et heure de fin").fill("2026-07-19T11:00");
    await dialog.getByLabel("Note (facultative)").fill("Clôture finale E2E.");
    await dialog.getByRole("button", { name: "Clôturer la mise-bas" }).click();
    await expect(panel.getByText("Clôturée", { exact: true })).toBeVisible();
    await expect(panel.getByText("Session clôturée")).toHaveCount(2);
    await expect(panel.locator("ol > li")).toHaveCount(6);

    createIncompleteSessionFixture();
    await page.goto(`/litters/journal?litter=${ids.incompleteLitter}`);
    panel = whelpingPanel(page);
    await expect(panel.getByText("Les informations de mise-bas ne sont pas disponibles pour le moment.")).toBeVisible();
    await expect(panel.getByText("En cours", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button")).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto(`/litters/journal?litter=${ids.mainLitter}`);
    panel = whelpingPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Rouvrir la session" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    const artifacts = createdArtifactIds();
    console.info(`E2E whelping panel fixture IDs: ${JSON.stringify(createdFixtureIds)}`);
    console.info(`E2E whelping panel created artifact IDs: ${JSON.stringify(artifacts)}`);
  } finally {
    cleanup();
    const finalCounts = expectCleanupAtZero();
    console.info(`E2E whelping panel final fixture counts: ${JSON.stringify(finalCounts)}`);
  }
});
