import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  growthComparisonScenario as scenario,
  growthCountsSql,
  growthIntegritySql,
} from "./growth-comparison-scenario.mjs";
import {
  assertContainers,
  assertSafeE2eConfig,
  dbContainer,
  demoManifestDir,
  readDemoManifest,
} from "./shared.mjs";

const baseUrl = "http://127.0.0.1:3100";
const manifest = readDemoManifest(resolve(demoManifestDir, `${scenario.scenarioId}.json`));
if (manifest.status !== "active") throw new Error("growth-comparison must be active before visual verification");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJsonSql(sql) {
  assertSafeE2eConfig();
  assertContainers();
  const result = spawnSync("docker", ["exec", "-i", dbContainer, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"], {
    encoding: "utf8", input: sql, maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Read-only source verification failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
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
  const growthTable = panel.getByTestId("litter-growth-table");
  assert(await growthTable.isVisible(), `${litter.name}: growth table missing`);
  const puppyView = growthTable.getByTestId("growth-table-puppy-view");
  assert(await puppyView.isVisible(), `${litter.name}: desktop puppy view missing`);
  assert(await puppyView.locator("tbody tr").count() === expectedAnimals, `${litter.name}: puppy row count mismatch`);
  const puppyHeader = await puppyView.locator("thead").textContent();
  assert(puppyHeader.includes("Naissance") && puppyHeader.includes("J0 routine"), `${litter.name}: birth and routine J0 are not distinct`);
  for (const puppy of litter.puppies) {
    const row = puppyView.getByRole("row", { name: new RegExp(`^${puppy.name} `) });
    assert(await row.count() === 1, `${litter.name}: ${puppy.name} puppy row missing`);
    assert((await row.textContent()).includes(`${puppy.birthWeight} g`), `${litter.name}: ${puppy.name} birth weight mismatch`);
  }
  if (litter.puppies.some((puppy) => puppy.name === "Céleste")) {
    const celeste = puppyView.getByRole("row", { name: /^Céleste / });
    const celesteText = await celeste.textContent();
    assert(["548 g", "550 g", "552 g"].every((value) => celesteText.includes(value)), `${litter.name}: Céleste plateau data missing`);
  }

  const valueMode = growthTable.getByLabel("Valeur");
  await valueMode.selectOption("gain");
  assert((await puppyView.locator("tbody tr").first().textContent()).includes("↗ +"), `${litter.name}: gain mode missing`);
  await valueMode.selectOption("index");
  assert((await puppyView.locator("tbody tr").first().locator('[data-measurement-kind="birth"]').textContent()).trim() === "100", `${litter.name}: birth index is not 100`);
  await valueMode.selectOption("weight");
  await growthTable.getByRole("button", { name: "Par jour" }).click();
  const dayView = growthTable.getByTestId("growth-table-day-view");
  assert(await dayView.isVisible(), `${litter.name}: day view missing`);
  assert(await dayView.locator("tbody tr").count() === 32, `${litter.name}: expected birth plus 31 routine sessions`);
  assert(await dayView.locator("thead th").count() === expectedAnimals + 3, `${litter.name}: puppy columns mismatch`);
  let observedRoutineMeasurements = 0;
  const allDayRows = dayView.locator("tbody tr");
  for (let index = 1; index < await allDayRows.count(); index += 1) {
    const cells = allDayRows.nth(index).locator("td");
    const coverage = (await cells.nth(expectedAnimals).textContent()).match(/(\d+)\s*\/\s*(\d+)/);
    assert(coverage, `${litter.name}: invalid coverage cell`);
    observedRoutineMeasurements += Number(coverage[1]);
  }
  assert(observedRoutineMeasurements === expectedRoutine, `${litter.name}: routine measurement total mismatch (${observedRoutineMeasurements})`);
  if (expectedIncompleteSessions !== null) {
    for (const ageDay of [7, 21]) {
      const row = dayView.getByRole("row", { name: new RegExp(`^J${ageDay} `) });
      assert((await row.textContent()).includes("4 / 5"), `${litter.name}: J${ageDay} coverage 4 / 5 missing`);
      assert((await row.getByRole("cell").allTextContents()).includes("—"), `${litter.name}: J${ageDay} missing cell is not an absence`);
    }
  }
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
  await page.getByTestId("litter-growth-table").getByRole("button", { name: "Par jour", pressed: true }).waitFor();
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
  const summary = result.getByTestId("comparison-summary-table");
  const matrix = result.getByTestId("comparison-day-matrix");
  assert(await summary.getByRole("row").count() === 3, "comparison summary must contain one header and two litters");
  assert(await matrix.getByRole("row").count() === 33, "comparison matrix must contain two headers and 31 observed days");
  assert(await matrix.locator('th[scope="colgroup"]').count() === 2, "comparison matrix colgroups missing");
  const summaryText = await summary.textContent();
  for (const litter of scenario.litters) assert(summaryText.includes(litter.name), `summary missing ${litter.name}`);

  const row0 = matrix.getByRole("row", { name: /^J0 / });
  const row30 = matrix.getByRole("row", { name: /^J30 / });
  assert(await row0.count() === 1 && await row30.count() === 1, "comparison J0/J30 rows missing");
  const cells0 = row0.getByRole("cell");
  const cells30 = row30.getByRole("cell");
  const birthAverageA = numberFromFrench(await cells0.nth(1).textContent());
  const birthAverageB = numberFromFrench(await cells0.nth(4).textContent());
  const birthIndexA = numberFromFrench(await cells0.nth(2).locator("span").first().textContent());
  const birthIndexB = numberFromFrench(await cells0.nth(5).locator("span").first().textContent());
  assert(birthAverageA === 347.5 && birthAverageB === 484, `J0 averages must use birth weights: ${birthAverageA}, ${birthAverageB}`);
  assert(birthIndexA === 100 && birthIndexB === 100, `J0 indices must equal 100: ${birthIndexA}, ${birthIndexB}`);

  const averageA = numberFromFrench(await cells30.nth(1).textContent());
  const averageB = numberFromFrench(await cells30.nth(4).textContent());
  const relativeA = numberFromFrench(await cells30.nth(2).locator("span").first().textContent());
  const relativeB = numberFromFrench(await cells30.nth(5).locator("span").first().textContent());
  assert(averageB > averageA, `litter B should be heavier at J30: ${averageA} vs ${averageB}`);
  assert(relativeB < relativeA, `litter B should grow more slowly relatively at J30: ${relativeA} vs ${relativeB}`);
  for (const ageDay of [7, 21]) {
    const row = matrix.getByRole("row", { name: new RegExp(`^J${ageDay} `) });
    assert((await row.getByRole("cell").nth(3).textContent()).includes("4 / 5"), `J${ageDay} coverage 4/5 missing`);
  }
  const resultText = await result.textContent();
  assert(resultText.includes("Seules les journées réellement observées"), "no-interpolation statement missing");
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resultText), "comparison result exposes a UUID");
  await page.setViewportSize({ width: 375, height: 812 });
  await assertNoGlobalOverflow(page, "comparison at 375px");

  const sourceCounts = readJsonSql(growthCountsSql());
  assert(JSON.stringify(sourceCounts) === JSON.stringify(scenario.expectedCounts), `source counts changed: ${JSON.stringify(sourceCounts)}`);
  const integrity = readJsonSql(growthIntegritySql());
  assert(integrity.litterASessions === 31 && integrity.litterBSessions === 31, `session counts changed: ${JSON.stringify(integrity)}`);
  assert(integrity.litterARoutine === 124 && integrity.litterBRoutine === 153, `routine counts changed: ${JSON.stringify(integrity)}`);
  assert(integrity.litterBCoverage4Days === 2 && integrity.litterBWrongCoverageDays === 0, `partial coverage changed: ${JSON.stringify(integrity)}`);
  assert(Object.entries(integrity).filter(([key]) => key.startsWith("invalid")).every(([, value]) => value === 0), `source integrity changed: ${JSON.stringify(integrity)}`);

  console.log(JSON.stringify({
    journals: { [scenario.litters[0].name]: litterA, [scenario.litters[1].name]: litterB },
    comparison: { averageAAtJ0: birthAverageA, averageBAtJ0: birthAverageB, indexAAtJ0: birthIndexA, indexBAtJ0: birthIndexB, averageAAtJ30: averageA, averageBAtJ30: averageB, relativeAAtJ30: relativeA, relativeBAtJ30: relativeB, incompleteDays: [7, 21] },
    sourceCounts,
    sourceIntegrity: integrity,
    responsiveWidth: 375,
  }, null, 2));
} finally {
  await browser.close();
}
