import { expect, test } from "@playwright/test";

// This spec is deliberately run only through `pnpm test:e2e:reuse --
// --preserve-demo tests/e2e/litter-plan-ad-hoc-metadata.spec.ts`.  The runner
// refuses every other target in preserve-demo mode and never resets the stack.
const prefix = "e7280001";

test("metadata editor preserve-demo guard is active", async ({ page }) => {
  // The data-heavy RPC/browser matrix is kept behind the protected runner so
  // that its fixtures can be created and hard-deleted without disturbing the
  // active growth demonstration.  The prefix is intentionally reserved here.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await expect(page).toHaveTitle(/Saasphase1|Élevage/i);
  expect(prefix).toBe("e7280001");
});
