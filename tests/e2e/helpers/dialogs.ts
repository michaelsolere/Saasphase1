import { expect, type Locator } from "@playwright/test";

export async function openDialog(trigger: Locator, heading: Locator) {
  await expect(trigger).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    try {
      await expect(heading).toBeVisible({ timeout: 2_000 });
      return;
    } catch {
      // Client dialogs can be visible before hydration; retry the trigger.
    }
  }

  await expect(heading).toBeVisible();
}
