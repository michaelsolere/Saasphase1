import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";
import {
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
  runE2eSql,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (statement: string) => runE2eSqlSync(statement);

test.setTimeout(300_000);
test.use({ deviceScaleFactor: 2 });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /connexion|se connecter/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("rend la fiche pilote en cinq onglets sans duplication et avec navigation accessible", async ({ page }) => {
  await withE2eFixtures(runE2eSql, async (fixtures) => {
    const femaleId = fixtures.register("animals", randomUUID());
    const maleId = fixtures.register("animals", randomUUID());
    const identityAnimalId = fixtures.register("animals", randomUUID());
    const litterId = fixtures.register("litters", randomUUID());
    const cycleId = fixtures.register("reproductive_cycles", randomUUID());
    const measurementId = fixtures.register("progesterone_measurements", randomUUID());
    const matingId = fixtures.register("reproductive_cycle_matings", randomUUID());
    const eventId = fixtures.register("events", randomUUID());
    const noteId = fixtures.register("notes", randomUUID());
    const documentId = fixtures.register("documents", randomUUID());

    sql(`
      insert into public.animals (
        id, organization_id, call_name, official_name, species, breed, sex, status,
        ownership_status, birth_date, identification_number, lof_number, coat_color,
        is_breeder, is_external, is_retired, notes, created_by, updated_by
      ) values
      (${q(femaleId)}::uuid, ${q(organizationId)}::uuid, 'Nova E2E', 'Nova du Profil E2E', 'dog', 'Golden Retriever', 'female', 'kept', 'produced', '2023-11-14', '250269590000001', 'LOF-E2E-001', 'Dorée', true, false, false, 'Note générale de Nova', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(maleId)}::uuid, ${q(organizationId)}::uuid, 'Orion E2E', 'Orion du Profil E2E', 'dog', 'Golden Retriever', 'male', 'active', 'owned', '2022-05-10', '250269590000002', 'LOF-E2E-002', 'Crème', true, false, false, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

      insert into public.litters (
        id, organization_id, name, species, breed, status, mother_id, father_id,
        actual_birth_date, born_total_count, born_male_count, born_female_count,
        alive_count, created_by, updated_by
      ) values (
        ${q(litterId)}::uuid, ${q(organizationId)}::uuid, 'Portée Profil E2E',
        'dog', 'Golden Retriever', 'born', ${q(femaleId)}::uuid, ${q(maleId)}::uuid,
        '2025-04-12', 7, 4, 3, 7, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.animals (
        id, organization_id, litter_id, call_name, species, breed, sex, status,
        ownership_status, created_by, updated_by
      ) values (
        ${q(identityAnimalId)}::uuid, ${q(organizationId)}::uuid, ${q(litterId)}::uuid,
        'Identité E2E', 'dog', 'Golden Retriever', 'female', 'available', 'produced',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.reproductive_cycles (
        id, organization_id, mother_id, species, breed, status, started_on,
        notes, created_by, updated_by
      ) values (
        ${q(cycleId)}::uuid, ${q(organizationId)}::uuid, ${q(femaleId)}::uuid,
        'dog', 'Golden Retriever', 'mated', '2026-06-22', 'Cycle E2E',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.progesterone_measurements (
        id, organization_id, cycle_id, measured_at, value, unit, created_by, updated_by
      ) values (
        ${q(measurementId)}::uuid, ${q(organizationId)}::uuid, ${q(cycleId)}::uuid,
        '2026-06-25T10:00:00Z', 7.8, 'ng_ml', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.reproductive_cycle_matings (
        id, organization_id, cycle_id, father_id, sequence_no, occurred_at,
        timezone_name, method, client_command_id, created_by, updated_by
      ) values (
        ${q(matingId)}::uuid, ${q(organizationId)}::uuid, ${q(cycleId)}::uuid,
        ${q(maleId)}::uuid, 1, '2026-06-26T10:00:00Z', 'Europe/Paris', 'natural',
        gen_random_uuid(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.events (
        id, organization_id, animal_id, event_type, title, description,
        planned_date, status, priority, is_task, created_by, updated_by
      ) values (
        ${q(eventId)}::uuid, ${q(organizationId)}::uuid, ${q(femaleId)}::uuid,
        'health_other', 'Contrôle santé E2E', 'Observation santé détaillée',
        '2026-08-19', 'late', 'urgent', true, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.notes (
        id, organization_id, animal_id, note_type, title, body, visibility,
        created_by, updated_by
      ) values (
        ${q(noteId)}::uuid, ${q(organizationId)}::uuid, ${q(femaleId)}::uuid,
        'health', 'Note santé E2E', 'Corps santé E2E', 'internal',
        ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );

      insert into public.documents (
        id, organization_id, animal_id, document_type, status, title,
        signature_required, file_name, created_by, updated_by
      ) values (
        ${q(documentId)}::uuid, ${q(organizationId)}::uuid, ${q(femaleId)}::uuid,
        'veterinary_certificate', 'received', 'Certificat santé E2E', false,
        'certificat-sante-e2e.pdf', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);

    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.goto(`/animals/${femaleId}`);

    await expect(page.getByRole("heading", { name: "Nova du Profil E2E" })).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Sections de la fiche animal" });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab")).toHaveCount(5);
    await expect(tabs.getByRole("tab", { name: /Aperçu/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Points d’attention" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dernières informations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Événements liés" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Notes liées" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Documents liés" })).toHaveCount(0);

    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.screenshot({ path: "/tmp/animal-profile-overview-2x.png", animations: "disabled" });
    }

    const healthTab = tabs.getByRole("tab", { name: /Santé/ });
    await healthTab.click();
    await expect(page).toHaveURL(new RegExp(`animals/${femaleId}\\?tab=health`));
    await expect(page.getByRole("heading", { name: "Suivi de santé" })).toBeVisible();
    await expect(page.getByText("Contrôle santé E2E")).toBeVisible();
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.getByRole("tabpanel").screenshot({ path: "/tmp/animal-profile-health-2x.png", animations: "disabled" });
    }
    await page.getByRole("button", { name: "Ajouter un événement santé" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Ajouter un événement santé" })).toBeVisible();
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.screenshot({ path: "/tmp/animal-profile-health-dialog-2x.png", animations: "disabled" });
    }
    await page.keyboard.press("Escape");

    await healthTab.focus();
    await expect(healthTab).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: /Reproduction/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`tab=reproduction`));
    await expect(page.getByText("7,8 ng/mL")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ouvrir le suivi complet" })).toHaveAttribute("href", `/animals/${femaleId}/reproduction`);
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.getByRole("tabpanel").screenshot({ path: "/tmp/animal-profile-female-reproduction-2x.png", animations: "disabled" });
    }

    await tabs.getByRole("tab", { name: /Documents/ }).click();
    await expect(page.getByText("Certificat santé E2E")).toBeVisible();
    await expect(page.getByRole("button", { name: /ajouter.*document/i })).toHaveCount(0);
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.getByRole("tabpanel").screenshot({ path: "/tmp/animal-profile-documents-2x.png", animations: "disabled" });
    }

    await tabs.getByRole("tab", { name: /Historique/ }).click();
    const history = page.getByTestId("animal-history-section");
    await expect(history).toBeVisible();
    await expect(history.getByText("Contrôle santé E2E")).toBeVisible();
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await history.screenshot({ path: "/tmp/animal-profile-history-2x.png", animations: "disabled" });
    }

    await page.goto(`/animals/${maleId}?tab=reproduction`);
    await expect(page.getByRole("heading", { name: "Descendance" })).toBeVisible();
    await expect(page.getByText("portée", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Descendance" }).locator("..")).toContainText("1");
    await expect(page.getByRole("link", { name: "Ouvrir le suivi complet" })).toHaveCount(0);
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.getByTestId("animal-profile").screenshot({ path: "/tmp/animal-profile-male-reproduction-2x.png", animations: "disabled" });
    }

    await page.goto(`/animals/${identityAnimalId}`);
    await page.getByRole("button", { name: "Consulter" }).click();
    await expect(page.getByRole("dialog", { name: "Renseigner l’identité définitive" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/animals/${femaleId}`);
    expect(await page.locator("main").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (process.env.E2E_CAPTURE_VISUAL === "1") {
      await page.screenshot({ path: "/tmp/animal-profile-mobile-initial-2x.png", animations: "disabled" });
      await page.getByRole("tab", { name: /Santé/ }).click();
      await page.getByRole("button", { name: "Ajouter un événement santé" }).click();
      await page.screenshot({ path: "/tmp/animal-profile-mobile-dialog-2x.png", animations: "disabled" });
    }

    await page.context().clearCookies();
    await login(page, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);
    await page.goto(`/animals/${femaleId}`);
    await expect(page.getByRole("button", { name: "Garder à l’élevage" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remettre disponible" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Promouvoir en reproductrice" })).toHaveCount(0);
    await page.getByRole("tab", { name: /Santé/ }).click();
    await expect(page.getByRole("button", { name: "Ajouter un événement santé" })).toBeVisible();

    await page.goto("/animals/new");
    await expect(page.locator('select[name="status"] option[value="available"]')).toHaveCount(0);
    await expect(page.locator('select[name="status"] option[value="kept"]')).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /Reproducteur maison/ })).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD);
    await page.goto(`/animals/${identityAnimalId}`);
    await page.getByRole("button", { name: "Consulter" }).click();
    await expect(page.locator("#animal-essential-identity")).toBeFocused();
  });
});

test("charge la fiche depuis l’organisation de l’animal quand l’utilisateur a plusieurs adhésions", async ({ page }) => {
  await withE2eFixtures(runE2eSql, async (fixtures) => {
    const secondOrganizationId = fixtures.register("organizations", randomUUID());
    const secondMembershipId = fixtures.register("memberships", randomUUID());
    const animalId = fixtures.register("animals", randomUUID());

    sql(`
      insert into public.organizations (id, name, slug)
      values (${q(secondOrganizationId)}::uuid, 'Organisation secondaire E2E', ${q(`animal-profile-secondary-${secondOrganizationId}`)});
      insert into public.memberships (
        id, organization_id, profile_id, role, status, created_by, updated_by
      ) values (
        ${q(secondMembershipId)}::uuid, ${q(secondOrganizationId)}::uuid,
        ${q(ownerId)}::uuid, 'admin', 'active', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
      insert into public.animals (
        id, organization_id, call_name, official_name, species, breed, sex,
        status, ownership_status, created_by, updated_by
      ) values (
        ${q(animalId)}::uuid, ${q(secondOrganizationId)}::uuid, 'Multi E2E',
        'Animal multi-organisation E2E', 'dog', 'Golden Retriever', 'male',
        'active', 'owned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);

    await login(page, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
    await page.goto(`/animals/${animalId}`);
    await expect(page.getByRole("heading", { name: "Animal multi-organisation E2E" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Sections de la fiche animal" })).toBeVisible();
    await page.getByRole("button", { name: "Garder à l’élevage" }).click();
    const decisionDialog = page.getByRole("dialog");
    await decisionDialog.getByRole("checkbox").check();
    await decisionDialog.getByRole("button", { name: "Garder à l’élevage" }).click();
    await expect.poll(() => sql(`select status from public.animals where id = ${q(animalId)}::uuid`)).toBe("kept");
  });
});
