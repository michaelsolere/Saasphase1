import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

test.setTimeout(300_000);

/**
 * Representative private routes that must always show the desktop shell.
 * Includes /calendar (absent from the former private whitelist) and other
 * families that were already covered by prefix matching.
 */
const PRIVATE_SHELL_ROUTES = [
  "/",
  "/calendar",
  "/calendar/today",
  "/contacts",
  "/candidatures",
  "/form-submissions",
  "/reservations",
  "/payments",
  "/payments/settings",
  "/documents",
  "/documents/modeles",
  "/documents/email-templates",
  "/litters",
  "/litters/journal",
  "/litters/journal/calendar",
  "/litters/journal/comparison",
  "/litter-groups",
  "/animals",
  "/cheptel",
  "/settings/organization",
  "/settings/litter-care-task-templates",
] as const;

async function gotoShell(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function login(page: Page) {
  await gotoShell(page, "/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

async function expectPrivateShell(page: Page, { checkOverflow = false } = {}) {
  await expect(page.locator("[data-private-shell]")).toHaveCount(1);
  await expect(page.locator("[data-sidebar-desktop]")).toHaveCount(1);
  await expect(page.locator("[data-private-content]")).toHaveCount(1);
  await expect(page.getByTestId("main-sidebar")).toBeVisible();
  if (checkOverflow) {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  }
}

async function expectNoPrivateShell(page: Page) {
  await expect(page.locator("[data-private-shell]")).toHaveCount(0);
  await expect(page.locator("[data-sidebar-desktop]")).toHaveCount(0);
}

function firstId(table: string, where = "true") {
  return runE2eSqlSync(
    `select id::text from public.${table} where ${where} order by created_at asc nulls last, id asc limit 1;`,
  ).trim();
}

test("couverture shell privé : familles, calendrier, détail, public, whelping", async ({
  page,
  browser,
}) => {
  page.setDefaultNavigationTimeout(45_000);
  await login(page);

  // /calendar — previously missing from the private whitelist.
  await gotoShell(page, "/calendar");
  await expectPrivateShell(page, { checkOverflow: true });
  await expect(
    page.getByTestId("main-sidebar").getByRole("link", {
      name: "Calendrier de l’élevage",
    }),
  ).toHaveAttribute("aria-current", "page");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectPrivateShell(page);

  await gotoShell(page, "/calendar/today");
  await expectPrivateShell(page);
  await expect(
    page.getByTestId("main-sidebar").getByRole("link", {
      name: "Calendrier de l’élevage",
    }),
  ).toHaveAttribute("aria-current", "page");

  // Private → private navigation keeps a single shell.
  await gotoShell(page, "/contacts");
  await expectPrivateShell(page);
  await page
    .getByTestId("main-sidebar")
    .getByRole("link", { name: "Calendrier de l’élevage" })
    .click();
  await expect(page).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(page.locator("[data-private-shell]")).toHaveCount(1);
  await expect(page.locator("[data-sidebar-desktop]")).toHaveCount(1);

  for (const route of PRIVATE_SHELL_ROUTES) {
    await gotoShell(page, route);
    await expectPrivateShell(page, {
      checkOverflow: route === "/" || route === "/calendar",
    });
  }

  const contactId = firstId("contacts");
  const litterId = firstId("litters");
  const animalId = firstId("animals", "litter_id is null");
  const reservationId = firstId("reservations");
  const paymentId = firstId("payments");
  const litterGroupId = firstId("litter_groups");
  const candidatureId = firstId("applications");
  const formSubmissionId = firstId("form_submissions");
  const documentId = firstId("documents");

  const dynamicRoutes = [
    contactId ? `/contacts/${contactId}` : null,
    contactId ? `/contacts/${contactId}/edit` : null,
    litterId ? `/litters/${litterId}` : null,
    animalId ? `/animals/${animalId}` : null,
    reservationId ? `/reservations/${reservationId}` : null,
    paymentId ? `/payments/${paymentId}` : null,
    litterGroupId ? `/litter-groups/${litterGroupId}` : null,
    candidatureId ? `/candidatures/${candidatureId}` : null,
    formSubmissionId ? `/form-submissions/${formSubmissionId}` : null,
    documentId ? `/documents/${documentId}` : null,
  ].filter((route): route is string => Boolean(route));

  expect(dynamicRoutes.length).toBeGreaterThan(0);

  for (const route of dynamicRoutes) {
    await gotoShell(page, route);
    await expectPrivateShell(page);
  }

  // Collapse / restore + sessionStorage.
  const shell = page.locator("[data-private-shell]");
  await page.getByRole("button", { name: "Replier la navigation" }).click();
  await expect(shell).toHaveAttribute("data-collapsed", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(shell).toHaveAttribute("data-collapsed", "true");
  await page.getByRole("button", { name: "Déplier la navigation" }).click();
  await expect(shell).toHaveAttribute("data-collapsed", "false");

  // Whelping remains intentionally standalone (mobile midwifery PWA).
  await gotoShell(page, "/whelping");
  await expectNoPrivateShell(page);

  // Public pages in a clean context never show the shell.
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await gotoShell(publicPage, "/login");
  await expectNoPrivateShell(publicPage);
  await gotoShell(publicPage, "/candidature/golden-retriever-2026");
  await expectNoPrivateShell(publicPage);
  await publicContext.close();
});
