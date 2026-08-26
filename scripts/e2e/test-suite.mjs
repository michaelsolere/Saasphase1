import { relative, resolve } from "node:path";

import { repoRoot } from "./shared.mjs";

// This is deliberately an allow-list, not a filename convention. Add a spec here
// only after confirming it has no dependency on the managed E2E environment.
export const pureE2eSpecPaths = Object.freeze([
  "tests/e2e/adoption-handover-core.spec.ts",
  "tests/e2e/adopter-workbench-core.spec.ts",
  "tests/e2e/adopter-workbench-foundation.spec.ts",
  "tests/e2e/adopter-profile-questionnaire-core.spec.ts",
  "tests/e2e/adopter-profile-questionnaire-migration.spec.ts",
  "tests/e2e/candidate-workbench-model.spec.ts",
  "tests/e2e/candidate-positioning-pre-reservation-core.spec.ts",
  "tests/e2e/choice-appointment-planning-core.spec.ts",
  "tests/e2e/choice-appointment-delivery-finalization-core.spec.ts",
  "tests/e2e/choice-appointments-assignment-foundation.spec.ts",
  "tests/e2e/contact-360-model.spec.ts",
  "tests/e2e/direct-late-sale-core.spec.ts",
  "tests/e2e/adopter-financial-resolution-core.spec.ts",
  "tests/e2e/adopter-activation-fixtures.spec.ts",
  "tests/e2e/adopter-animal-assignment-fixtures.spec.ts",
  "tests/e2e/adopter-appointment-fixtures.spec.ts",
  "tests/e2e/adopter-cancellation-fixtures.spec.ts",
  "tests/e2e/adopter-document-fixtures.spec.ts",
  "tests/e2e/adopter-finalization-fixtures.spec.ts",
  "tests/e2e/adopter-journey-detail-model.spec.ts",
  "tests/e2e/adopter-note-fixtures.spec.ts",
  "tests/e2e/adopter-payment-fixtures.spec.ts",
  "tests/e2e/adopter-refund-fixtures.spec.ts",
  "tests/e2e/animal-profile-model.spec.ts",
  "tests/e2e/animal-unified-history-model.spec.ts",
  "tests/e2e/animal-weight-relative-series.spec.ts",
  "tests/e2e/breeding-calendar-core.spec.ts",
  "tests/e2e/breeding-today-core.spec.ts",
  "tests/e2e/birth-documents-deposit-model.spec.ts",
  "tests/e2e/calendar-private-feed-core.spec.ts",
  "tests/e2e/calendar-reminder-projection.spec.ts",
  "tests/e2e/deposit-thresholds.spec.ts",
  "tests/e2e/departure-planning-core.spec.ts",
  "tests/e2e/departure-handover-orchestration-foundation.spec.ts",
  "tests/e2e/departure-calendar-interactions.spec.ts",
  "tests/e2e/departure-planning-foundation.spec.ts",
  "tests/e2e/departure-readiness-core.spec.ts",
  "tests/e2e/departure-review-corrections-foundation.spec.ts",
  "tests/e2e/departure-signature-core.spec.ts",
  "tests/e2e/departure-time-zone.spec.ts",
  "tests/e2e/dog-pre-whelping-temperature-model-pure.spec.ts",
  "tests/e2e/dog-postnatal-care-model-pure.spec.ts",
  "tests/e2e/document-generation-snapshot-schemas.spec.ts",
  "tests/e2e/document-pdf-renderer.spec.ts",
  "tests/e2e/document-template-pdf-preview.spec.ts",
  "tests/e2e/expected-birth-anchor.spec.ts",
  "tests/e2e/home-today-model.spec.ts",
  "tests/e2e/home-today-post-adoption-alerts.spec.ts",
  "tests/e2e/fixture-registry.spec.ts",
  "tests/e2e/gestation-anchor.spec.ts",
  "tests/e2e/gestation-default-planning.spec.ts",
  "tests/e2e/gestation-planning-outcome.spec.ts",
  "tests/e2e/litter-age-comparison-chart-model.spec.ts",
  "tests/e2e/litter-age-comparison-model.spec.ts",
  "tests/e2e/litter-care-calendar-model.spec.ts",
  "tests/e2e/litter-journal-tabs-model.spec.ts",
  "tests/e2e/litter-journal-today-action-queue.spec.ts",
  "tests/e2e/litter-journal-unified-history.spec.ts",
  "tests/e2e/litter-unified-history-projection.spec.ts",
  "tests/e2e/litter-weight-entry-deltas.spec.ts",
  "tests/e2e/litter-weight-gain-alert.spec.ts",
  "tests/e2e/litter-gain-alert-policy.spec.ts",
  "tests/e2e/litter-care-timeline-model.spec.ts",
  "tests/e2e/litter-care-icalendar.spec.ts",
  "tests/e2e/litter-care-task-window-state.spec.ts",
  "tests/e2e/litter-care-today-projection.spec.ts",
  "tests/e2e/litter-group-reservation-document-batch-action.spec.ts",
  "tests/e2e/litter-group-reservation-document-batch-plan-core.spec.ts",
  "tests/e2e/litter-collar-colors.spec.ts",
  "tests/e2e/litter-growth-chart-model.spec.ts",
  "tests/e2e/litter-weight-animal-identity.spec.ts",
  "tests/e2e/litter-weight-gain-summary.spec.ts",
  "tests/e2e/litter-growth-vigilance.spec.ts",
  "tests/e2e/litter-growth-table-model.spec.ts",
  "tests/e2e/litter-plan-timeline-projection.spec.ts",
  "tests/e2e/litter-plan-ad-hoc-pure.spec.ts",
  "tests/e2e/litter-plan-ad-hoc-programmer-pure.spec.ts",
  "tests/e2e/litter-plan-timeline-direct-manipulation-pure.spec.ts",
  "tests/e2e/litter-plan-anchor-recalculation-outcome.spec.ts",
  "tests/e2e/litter-planning-model-library-recurrence-pure.spec.ts",
  "tests/e2e/litter-planning-models-ui-pure.spec.ts",
  "tests/e2e/litter-planning-model-editor-pure.spec.ts",
  "tests/e2e/litter-planning-model-apply-ui-pure.spec.ts",
  "tests/e2e/litter-recurring-tasks-pure.spec.ts",
  "tests/e2e/litter-recurring-tasks-ui-pure.spec.ts",
  "tests/e2e/litter-reservation-document-batch-action.spec.ts",
  "tests/e2e/litter-weighing-policy-preview.spec.ts",
  "tests/e2e/litter-weighing-schedule-history-adapter.spec.ts",
  "tests/e2e/litter-weighing-schedule-model.spec.ts",
  "tests/e2e/litter-weighing-schedule-summary.spec.tsx",
  "tests/e2e/litter-weighing-today-pure.spec.ts",
  "tests/e2e/litter-weighing-session-comparison.spec.ts",
  "tests/e2e/litter-weighing-session-statistics.spec.ts",
  "tests/e2e/litter-weight-adjustment-actions-core.spec.ts",
  "tests/e2e/litter-weight-quick-entry-pure.spec.ts",
  "tests/e2e/litter-weights-actions-core.spec.ts",
  "tests/e2e/maternal-temperature-chart-model.spec.ts",
  "tests/e2e/maternal-temperature-planning-link-pure.spec.ts",
  "tests/e2e/payment-settings-parse.spec.ts",
  "tests/e2e/planning-fact-link-visibility-pure.spec.ts",
  "tests/e2e/post-adoption-automated-delivery-core.spec.ts",
  "tests/e2e/post-adoption-automated-delivery-migration.spec.ts",
  "tests/e2e/post-adoption-automated-delivery-model.spec.ts",
  "tests/e2e/post-adoption-questionnaire-internal-read-model.spec.ts",
  "tests/e2e/post-adoption-questionnaire-individual-visualization-model.spec.ts",
  "tests/e2e/post-adoption-questionnaire-public-core.spec.ts",
  "tests/e2e/post-adoption-results-model.spec.ts",
  "tests/e2e/post-adoption-results-collective-model.spec.ts",
  "tests/e2e/post-birth-positioning-core.spec.ts",
  "tests/e2e/post-birth-positioning-workbench-foundation.spec.ts",
  "tests/e2e/post-birth-positioning.spec.ts",
  "tests/e2e/pre-reservation-deposit.spec.ts",
  "tests/e2e/private-route-shell.spec.ts",
  "tests/e2e/public-form-administration-core.spec.ts",
  "tests/e2e/reservation-contract-v2.spec.ts",
  "tests/e2e/reservation-pricing.spec.ts",
  "tests/e2e/reservation-preparation-action-core.spec.ts",
  "tests/e2e/reservation-preparation-foundation.spec.ts",
  "tests/e2e/reservation-preparation-model.spec.ts",
  "tests/e2e/transactional-campaign-recovery.spec.ts",
  "tests/e2e/reproductive-cycle-lifecycle-core.spec.ts",
  "tests/e2e/routine-weight-eligibility.spec.ts",
  "tests/e2e/typecheck-debt-guard.spec.ts",
  "tests/e2e/unified-journey-history-model.spec.ts",
  "tests/e2e/whelping-actions-core.spec.ts",
  "tests/e2e/whelping-birth-adjustment-actions-core.spec.ts",
  "tests/e2e/whelping-birth-cancellation-service-core.spec.ts",
  "tests/e2e/whelping-fixtures.spec.ts",
  "tests/e2e/whelping-mobile-selection.spec.ts",
  "tests/e2e/whelping-pwa-assets.spec.ts",
  "tests/e2e/whelping-pwa-display-mode.spec.ts",
  "tests/e2e/whelping-pwa-manifest.spec.ts",
  "tests/e2e/whelping-quick-completion-actions-core.spec.ts",
  "tests/e2e/whelping-session-summary.spec.ts",
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
