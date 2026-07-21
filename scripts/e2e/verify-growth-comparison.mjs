import { chromium } from "@playwright/test";
import { resolve } from "node:path";

import { growthComparisonScenario as scenario } from "./growth-comparison-scenario.mjs";
import { demoManifestDir, readDemoManifest } from "./shared.mjs";

const baseUrl = "http://127.0.0.1:3100";
const manifest = readDemoManifest(resolve(demoManifestDir, `${scenario.scenarioId}.json`));
if (manifest.status !== "active") throw new Error("growth-comparison must be active before visual verification");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertNoGlobalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth, `${label} has global horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function verifyJournal(page, litter, expectedAnimals, expectedRoutine, expectedIncompleteSessions) {
  await page.goto(`${baseUrl}/litters/journal?litter=${litter.id}`);
  await page.getByRole("heading", { name: litter.name }).waitFor();
  const panel = page.getByTestId("litter-weight-panel");
  await panel.waitFor();
  assert((await panel.textContent()).includes(`${expectedAnimals} animaux suivis · 31 séances de routine`), `${litter.name}: summary mismatch`);
  assert(await panel.getByTestId("latest-litter-weight-session-summary").isVisible(), `${litter.name}: latest summary missing`);
  assert(await panel.getByTestId("latest-litter-weight-session-comparison").isVisible(), `${litter.name}: latest comparison missing`);
  assert(await panel.getByTestId("entire-litter-growth-view").isVisible(), `${litter.name}: absolute chart missing`);
  await panel.getByRole("button", { name: "Progression relative" }).click();
  assert(await panel.getByTestId("relative-growth-view").isVisible(), `${litter.name}: relative chart missing`);
  assert(await panel.getByTestId("litter-weighing-schedule-summary").isVisible(), `${litter.name}: schedule missing`);
  assert(await panel.getByTestId("litter-weight-sessions-history").getByRole("listitem").count() === 31, `${litter.name}: session history mismatch`);
  assert(await panel.getByTestId("litter-weight-animals-history").locator("article").count() === expectedAnimals, `${litter.name}: animal history mismatch`);
  const text = await panel.textContent();
  for (const puppy of litter.puppies) {
    assert(text.includes(puppy.name), `${litter.name}: puppy ${puppy.name} missing`);
    assert(text.includes(puppy.collar), `${litter.name}: collar ${puppy.collar} missing`);
  }
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), `${litter.name}: UUID exposed`);
  if (expectedIncompleteSessions !== null) {
    assert((text.match(/4 poids enregistrés/g) ?? []).length === expectedIncompleteSessions, `${litter.name}: incomplete-session display mismatch`);
  }

  await panel.getByRole("button", { name: "Nouvelle pesée" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvelle pesée" });
  assert(await dialog.getByRole("group").count() === expectedAnimals, `${litter.name}: weighing choices mismatch`);
  assert(!(await dialog.textContent()).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i), `${litter.name}: UUID exposed in dialog`);
  await dialog.getByRole("button", { name: "Annuler" }).click();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.getByTestId("litter-weight-panel").waitFor();
  await assertNoGlobalOverflow(page, `${litter.name} at 375px`);
  await page.setViewportSize({ width: 1280, height: 900 });
  return { routineMeasurements: expectedRoutine, sessions: 31, animals: expectedAnimals };
}

function numberFromFrench(value) {
  return Number(value.replaceAll(" ", "").replaceAll(" ", "").replace(",", ".").replace(/[^0-9.-]/g, ""));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");

  const litterA = await verifyJournal(page, scenario.litters[0], 4, 124, null);
  const litterB = await verifyJournal(page, scenario.litters[1], 5, 153, 2);

  await page.goto(`${baseUrl}/litters/journal/comparison`);
  for (const litter of scenario.litters) {
    await page.getByLabel(`Sélectionner ${litter.name}`).check();
  }
  const chooserText = await page.locator("form").textContent();
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(chooserText), "comparison chooser exposes a UUID");
  await page.getByRole("button", { name: "Comparer les portées" }).click();
  const result = page.getByTestId("litter-comparison-result");
  await result.waitFor();
  const articles = result.locator("article");
  assert(await articles.count() === 2, "comparison did not return both litters");
  const byName = new Map();
  for (let index = 0; index < 2; index += 1) {
    const article = articles.nth(index);
    const name = await article.getByRole("heading", { level: 3 }).textContent();
    byName.set(name, article);
  }
  const articleA = byName.get(scenario.litters[0].name);
  const articleB = byName.get(scenario.litters[1].name);
  assert(articleA && articleB, "comparison labels are missing");
  const rowA30 = articleA.getByRole("row", { name: /^J30 / });
  const rowB30 = articleB.getByRole("row", { name: /^J30 / });
  const cellsA = await rowA30.getByRole("cell").allTextContents();
  const cellsB = await rowB30.getByRole("cell").allTextContents();
  const averageA = numberFromFrench(cellsA[1]);
  const averageB = numberFromFrench(cellsB[1]);
  const relativeA = numberFromFrench(cellsA[2]);
  const relativeB = numberFromFrench(cellsB[2]);
  assert(averageB > averageA, `litter B should be heavier at J30: ${averageA} vs ${averageB}`);
  assert(relativeB < relativeA, `litter B should grow more slowly relatively at J30: ${relativeA} vs ${relativeB}`);
  for (const ageDay of [7, 21]) {
    assert((await articleB.getByRole("row", { name: new RegExp(`^J${ageDay} 4 / 5`) }).count()) === 1, `J${ageDay} coverage 4/5 missing`);
  }
  const resultText = await result.textContent();
  assert(resultText.includes("Seules les journées réellement observées"), "no-interpolation statement missing");
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resultText), "comparison result exposes a UUID");
  await page.setViewportSize({ width: 375, height: 812 });
  await assertNoGlobalOverflow(page, "comparison at 375px");

  console.log(JSON.stringify({
    journals: { [scenario.litters[0].name]: litterA, [scenario.litters[1].name]: litterB },
    comparison: { averageAAtJ30: averageA, averageBAtJ30: averageB, relativeAAtJ30: relativeA, relativeBAtJ30: relativeB, incompleteDays: [7, 21] },
    responsiveWidth: 375,
  }, null, 2));
} finally {
  await browser.close();
}
