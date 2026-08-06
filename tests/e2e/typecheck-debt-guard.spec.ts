import { expect, test } from "@playwright/test";

import {
  compareDiagnosticBaseline,
  createDiagnosticBaseline,
  parseTypeScriptDiagnostics,
} from "../../scripts/typecheck/diagnostic-baseline-core.mjs";

test("normalise les diagnostics TypeScript sans dépendre des numéros de ligne", () => {
  const diagnostics = parseTypeScriptDiagnostics([
    "tests/e2e/example.spec.ts(10,2): error TS2339: Property 'id' does not exist.",
    "  Property 'id' does not exist on type 'ErrorResult'.",
    "tests/e2e/example.spec.ts(40,9): error TS2339: Property 'id' does not exist.",
    "tests/e2e/other.spec.ts(5,1): error TS18047: 'row' is possibly 'null'.",
  ].join("\n"));

  expect(diagnostics).toEqual([
    {
      file: "tests/e2e/example.spec.ts",
      code: "TS2339",
      message: "Property 'id' does not exist.",
      count: 2,
    },
    {
      file: "tests/e2e/other.spec.ts",
      code: "TS18047",
      message: "'row' is possibly 'null'.",
      count: 1,
    },
  ]);
});

test("refuse les nouvelles erreurs et signale aussi les erreurs résolues", () => {
  const baseline = createDiagnosticBaseline([
    { file: "tests/e2e/a.spec.ts", code: "TS2339", message: "Missing property.", count: 2 },
    { file: "tests/e2e/b.spec.ts", code: "TS18047", message: "Possibly null.", count: 1 },
  ]);
  const comparison = compareDiagnosticBaseline(
    [
      { file: "tests/e2e/a.spec.ts", code: "TS2339", message: "Missing property.", count: 3 },
      { file: "tests/e2e/c.spec.ts", code: "TS2322", message: "Wrong mock shape.", count: 1 },
    ],
    baseline,
  );

  expect(comparison.newDiagnostics).toEqual([
    { file: "tests/e2e/a.spec.ts", code: "TS2339", message: "Missing property.", count: 1 },
    { file: "tests/e2e/c.spec.ts", code: "TS2322", message: "Wrong mock shape.", count: 1 },
  ]);
  expect(comparison.resolvedDiagnostics).toEqual([
    { file: "tests/e2e/b.spec.ts", code: "TS18047", message: "Possibly null.", count: 1 },
  ]);
  expect(comparison.matches).toBe(false);
});

test("accepte une dette strictement identique", () => {
  const diagnostics = [
    { file: "tests/e2e/a.spec.ts", code: "TS2339", message: "Missing property.", count: 2 },
  ];
  const baseline = createDiagnosticBaseline(diagnostics);

  expect(compareDiagnosticBaseline(diagnostics, baseline)).toEqual({
    matches: true,
    newDiagnostics: [],
    resolvedDiagnostics: [],
  });
  expect(baseline.totalDiagnostics).toBe(2);
  expect(baseline.totalFiles).toBe(1);
});
