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

test("sélectionne le Journal comme entrée Portées la plus précise", async ({
  page,
}) => {
  await login(page);
  await page.goto("/litters/journal");

  const sidebar = page.getByTestId("main-sidebar");
  const littersSection = sidebar.getByRole("button", { name: "Portées" });
  const currentLittersLink = sidebar.getByRole("link", { name: "Actuelles" });
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
          label === "Actuelles" || label === "Journal" || label?.startsWith("Passées"),
        )
        .map((label) => label?.replace("À venir", "").trim()),
    ),
  ).resolves.toEqual(["Actuelles", "Journal", "Passées"]);

  await page.goto("/litters");
  await expect(littersSection).toHaveAttribute("aria-expanded", "true");
  await expect(currentLittersLink).toHaveAttribute("aria-current", "page");
  await expect(journalLink).not.toHaveAttribute("aria-current", "page");
});
