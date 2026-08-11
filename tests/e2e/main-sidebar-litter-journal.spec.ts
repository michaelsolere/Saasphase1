import { expect, test, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
} from "./helpers/supabase";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30_000 });
}

test("donne un accès direct aux positionnements depuis Portées", async ({
  page,
}) => {
  await login(page);
  await page.goto("/litters/journal");

  const sidebar = page.getByTestId("main-sidebar");
  const littersSection = sidebar.getByRole("button", { name: "Portées" });
  const currentLittersLink = sidebar.getByRole("link", { name: "Actuelles" });
  const positioningLink = sidebar.getByRole("link", { name: /Positionnements/ });
  const journalLink = sidebar.getByRole("link", { name: "Journal" });

  await expect(littersSection).toHaveAttribute("aria-expanded", "true");
  await expect(journalLink).toHaveAttribute("href", "/litters/journal");
  await expect(journalLink).toHaveAttribute("aria-current", "page");
  await expect(currentLittersLink).not.toHaveAttribute("aria-current", "page");
  await expect(
    littersSection.locator("..").evaluate((section) =>
      Array.from(section.querySelectorAll("a, [aria-disabled='true']"))
        .map((item) => item.textContent?.trim())
        .filter((label) =>
          label === "Actuelles" || label?.startsWith("Positionnements") || label === "Journal" || label?.startsWith("Passées"),
        )
        .map((label) => label?.startsWith("Positionnements") ? "Positionnements" : label?.replace("À venir", "").trim()),
    ),
  ).resolves.toEqual(["Actuelles", "Positionnements", "Journal", "Passées"]);

  await positioningLink.click();
  await expect(page).toHaveURL(/\/positionnements$/);
  await expect(page.getByRole("heading", { name: "Positionnements" })).toBeVisible();
  await expect(positioningLink).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByLabel("1 groupe à traiter")).toBeVisible();

  await page.goto("/litters");
  await expect(littersSection).toHaveAttribute("aria-expanded", "true");
  await expect(currentLittersLink).toHaveAttribute("aria-current", "page");
  await expect(journalLink).not.toHaveAttribute("aria-current", "page");

  await page.goto("/reservations");

  await expect(page.getByRole("link", { name: "Voir tous les positionnements" })).toHaveAttribute("href", "/positionnements");
  const firstRow = page.locator("tbody tr").first();
  await firstRow.getByText(/jalons/).click();

  const panel = page.getByRole("complementary", { name: "Parcours adoptant sélectionné" });
  await expect(panel.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Positionnement" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Ouvrir le positionnement" })).toBeVisible();
});
