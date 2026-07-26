import { relative, resolve } from "node:path";

import { repoRoot } from "./shared.mjs";

// This is deliberately an allow-list, not a filename convention. Add a spec here
// only after confirming it has no dependency on the managed E2E environment.
export const pureE2eSpecPaths = Object.freeze([
  "tests/e2e/adopter-activation-fixtures.spec.ts",
  "tests/e2e/adopter-animal-assignment-fixtures.spec.ts",
  "tests/e2e/adopter-appointment-fixtures.spec.ts",
  "tests/e2e/adopter-cancellation-fixtures.spec.ts",
  "tests/e2e/adopter-document-fixtures.spec.ts",
  "tests/e2e/adopter-finalization-fixtures.spec.ts",
  "tests/e2e/adopter-note-fixtures.spec.ts",
  "tests/e2e/adopter-payment-fixtures.spec.ts",
  "tests/e2e/adopter-refund-fixtures.spec.ts",
  "tests/e2e/animal-weight-relative-series.spec.ts",
  "tests/e2e/breeding-calendar-core.spec.ts",
  "tests/e2e/breeding-today-core.spec.ts",
  "tests/e2e/calendar-private-feed-core.spec.ts",
  "tests/e2e/deposit-thresholds.spec.ts",
  "tests/e2e/document-generation-snapshot-schemas.spec.ts",
  "tests/e2e/document-pdf-renderer.spec.ts",
  "tests/e2e/document-template-pdf-preview.spec.ts",
  "tests/e2e/fixture-registry.spec.ts",
  "tests/e2e/litter-age-comparison-chart-model.spec.ts",
  "tests/e2e/litter-age-comparison-model.spec.ts",
  "tests/e2e/litter-care-calendar-model.spec.ts",
  "tests/e2e/litter-care-icalendar.spec.ts",
  "tests/e2e/litter-care-task-window-state.spec.ts",
  "tests/e2e/litter-care-today-projection.spec.ts",
  "tests/e2e/litter-group-reservation-document-batch-action.spec.ts",
  "tests/e2e/litter-group-reservation-document-batch-plan-core.spec.ts",
  "tests/e2e/litter-growth-chart-model.spec.ts",
  "tests/e2e/litter-growth-table-model.spec.ts",
  "tests/e2e/litter-plan-timeline-projection.spec.ts",
  "tests/e2e/litter-reservation-document-batch-action.spec.ts",
  "tests/e2e/litter-weighing-policy-preview.spec.ts",
  "tests/e2e/litter-weighing-schedule-history-adapter.spec.ts",
  "tests/e2e/litter-weighing-schedule-model.spec.ts",
  "tests/e2e/litter-weighing-schedule-summary.spec.tsx",
  "tests/e2e/litter-weighing-session-comparison.spec.ts",
  "tests/e2e/litter-weighing-session-statistics.spec.ts",
  "tests/e2e/litter-weight-adjustment-actions-core.spec.ts",
  "tests/e2e/litter-weights-actions-core.spec.ts",
  "tests/e2e/maternal-temperature-chart-model.spec.ts",
  "tests/e2e/payment-settings-parse.spec.ts",
  "tests/e2e/pre-reservation-deposit.spec.ts",
  "tests/e2e/reservation-contract-v2.spec.ts",
  "tests/e2e/reservation-pricing.spec.ts",
  "tests/e2e/reproductive-cycle-lifecycle-core.spec.ts",
  "tests/e2e/routine-weight-eligibility.spec.ts",
  "tests/e2e/whelping-actions-core.spec.ts",
  "tests/e2e/whelping-birth-adjustment-actions-core.spec.ts",
  "tests/e2e/whelping-fixtures.spec.ts",
  "tests/e2e/whelping-mobile-selection.spec.ts",
  "tests/e2e/whelping-quick-completion-actions-core.spec.ts",
  "tests/e2e/weighing-fixtures.spec.ts",
]);

const pureE2eSpecSet = new Set(pureE2eSpecPaths);

function normalizePath(path) {
  return relative(repoRoot, resolve(repoRoot, path)).replaceAll("\\", "/");
}

export function isPureE2eSpec(path) {
  return pureE2eSpecSet.has(normalizePath(path));
}

function isSpecSelector(argument) {
  return argument.includes("tests/e2e/") && /\.spec\.(?:ts|tsx)$/.test(argument);
}

export function assertDirectPlaywrightInvocationAllowed(argv) {
  const selectedSpecs = argv.filter(isSpecSelector);

  if (selectedSpecs.length > 0 && selectedSpecs.every(isPureE2eSpec)) {
    return;
  }

  const requestedSpec = selectedSpecs[0] ?? "tests/e2e/<spec>";
  throw new Error(
    `Integrated E2E specs must use the managed runner:\n` +
      `pnpm test:e2e -- ${requestedSpec}`,
  );
}

export function resolvePlaywrightRunMode({ environment = process.env, argv = process.argv.slice(2) } = {}) {
  const managedRunner = environment.E2E_RUNNER_MANAGED === "1";
  if (!managedRunner) {
    assertDirectPlaywrightInvocationAllowed(argv);
  }
  return { managedRunner };
}

export function createManagedPlaywrightEnvironment(environment) {
  return { ...environment, E2E_RUNNER_MANAGED: "1" };
}
