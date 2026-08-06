import { expect, test, type Page } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const contactIds = [
  "95000000-0000-4000-8000-000000000001",
  "95000000-0000-4000-8000-000000000002",
];
const applicationIds = [
  "95000000-0000-4000-8000-000000000011",
  "95000000-0000-4000-8000-000000000012",
];

function sqlList(values: string[]) {
  return values.map((value) => `'${value}'::uuid`).join(", ");
}

function cleanup() {
  runE2eSqlSync(`
    delete from public.notes where application_id in (${sqlList(applicationIds)});
    delete from public.reservations where application_id in (${sqlList(applicationIds)});
    delete from public.applications where id in (${sqlList(applicationIds)});
    delete from public.contact_roles where contact_id in (${sqlList(contactIds)});
    delete from public.contacts where id in (${sqlList(contactIds)});
  `);

  const remaining = Number(
    runE2eSqlSync(`
      select count(*) from (
        select id::text from public.notes where application_id in (${sqlList(applicationIds)})
        union all select id::text from public.reservations where application_id in (${sqlList(applicationIds)})
        union all select id::text from public.applications where id in (${sqlList(applicationIds)})
        union all select id::text from public.contact_roles where contact_id in (${sqlList(contactIds)})
        union all select id::text from public.contacts where id in (${sqlList(contactIds)})
      ) remaining;
    `),
  );

  if (remaining !== 0) throw new Error(`cleanup candidate workbench: ${remaining} row(s) remain`);
}

function createFixture() {
  cleanup();
  runE2eSqlSync(`
    insert into public.contacts (
      id, organization_id, contact_type, first_name, last_name, display_name,
      email, phone, origin_channel, primary_status, created_by, updated_by
    ) values
      ('${contactIds[0]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Alpha', 'E2E Workbench Alpha', 'alpha.workbench@example.invalid', '+33600000001', 'website', 'active', '${userId}'::uuid, '${userId}'::uuid),
      ('${contactIds[1]}'::uuid, '${organizationId}'::uuid, 'person', 'E2E', 'Beta', 'E2E Workbench Beta', 'beta.workbench@example.invalid', '+33600000002', 'website', 'active', '${userId}'::uuid, '${userId}'::uuid);

    insert into public.applications (
      id, organization_id, contact_id, species, breed, desired_sex_preference,
      desired_quantity, project_description, status, submitted_at, created_by, updated_by
    ) values
      ('${applicationIds[0]}'::uuid, '${organizationId}'::uuid, '${contactIds[0]}'::uuid, 'dog', 'Golden Retriever', 'female_only', 1, 'Projet Alpha à lire dans le panneau.', 'new', '2026-08-06 12:02:00+00', '${userId}'::uuid, '${userId}'::uuid),
      ('${applicationIds[1]}'::uuid, '${organizationId}'::uuid, '${contactIds[1]}'::uuid, 'dog', 'Golden Retriever', 'no_preference', 1, 'Projet Beta suivant.', 'new', '2026-08-06 12:01:00+00', '${userId}'::uuid, '${userId}'::uuid);
  `);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures(?:\?connexion=success)?$/);
}

test("qualifies candidates successively without losing the candidate list context", async ({ page }) => {
  test.setTimeout(60_000);
  createFixture();

  try {
    await login(page);
    await page.goto("/candidatures");

    await page.setViewportSize({ width: 390, height: 844 });
    const alphaButton = page.getByRole("button", { name: "E2E Workbench Alpha" });
    await alphaButton.click();
    const mobileDialog = page.getByRole("dialog", {
      name: "Dossier candidat E2E Workbench Alpha",
    });
    await expect(mobileDialog).toBeVisible();
    await expect(mobileDialog.getByRole("button", { name: "Fermer" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(mobileDialog).toHaveCount(0);
    await expect(alphaButton).toBeFocused();

    await page.setViewportSize({ width: 1280, height: 900 });
    await alphaButton.click();
    const panel = page.getByRole("complementary", {
      name: "Dossier candidat sélectionné",
    });
    await expect(panel).toContainText("Projet Alpha à lire dans le panneau.");
    await expect(panel).toContainText("Relire et qualifier");
    await expect(page).toHaveURL(new RegExp(`candidature=${applicationIds[0]}`));

    await panel.getByRole("link", { name: "Agrandir le dossier" }).click();
    await expect(page).toHaveURL(new RegExp(`/candidatures/${applicationIds[0]}`));
    await page.getByRole("button", { name: "Valider", exact: true }).click();

    await expect(page).toHaveURL(/\/candidatures/);
    await expect(panel).toContainText("E2E Workbench Beta");
    await expect(page.getByRole("button", { name: "E2E Workbench Alpha" })).toHaveCount(0);

    await page.getByRole("textbox", { name: "Rechercher" }).fill("Beta");
    await page.getByRole("combobox", { name: "Trier" }).selectOption("name");
    await expect(page).toHaveURL(/recherche=Beta/);
    await expect(page).toHaveURL(/tri=nom/);

    await page
      .getByRole("navigation", { name: "Filtrer les candidatures" })
      .getByRole("link", { name: "Validées" })
      .click();
    await expect(page).toHaveURL(/\/candidatures\?filtre=validees$/);
    await expect(
      page.getByRole("textbox", { name: "Rechercher" }),
    ).toHaveValue("");
    await expect(
      page.getByRole("complementary", {
        name: "Dossier candidat sélectionné",
      }),
    ).toContainText("Sélectionnez un candidat");
  } finally {
    cleanup();
  }
});
