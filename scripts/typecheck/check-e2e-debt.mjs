import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { repoRoot } from "../e2e/shared.mjs";
import {
  compareDiagnosticBaseline,
  createDiagnosticBaseline,
  parseTypeScriptDiagnostics,
} from "./diagnostic-baseline-core.mjs";

const baselinePath = resolve(
  repoRoot,
  "scripts/typecheck/e2e-type-debt-baseline.json",
);
const update = process.argv.includes("--update");
const result = spawnSync(
  resolve(repoRoot, "node_modules/.bin/tsc"),
  ["--project", "tsconfig.e2e.json", "--pretty", "false"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  },
);
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const diagnostics = parseTypeScriptDiagnostics(output);
const current = createDiagnosticBaseline(diagnostics);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if ((result.status ?? 1) !== 0 && diagnostics.length === 0) {
  process.stderr.write(output);
  console.error("Le contrôle E2E a échoué sans diagnostic TypeScript exploitable.");
  process.exit(1);
}

if (update) {
  if (existsSync(baselinePath)) {
    const previous = JSON.parse(readFileSync(baselinePath, "utf8"));
    const comparison = compareDiagnosticBaseline(diagnostics, previous);
    if (comparison.newDiagnostics.length > 0) {
      printDiagnostics(
        "Mise à jour refusée — nouvelles erreurs TypeScript E2E :",
        comparison.newDiagnostics,
      );
      console.error(
        "L’inventaire ne peut enregistrer que des corrections d’erreurs historiques.",
      );
      process.exit(1);
    }
  }
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    `Inventaire E2E enregistré : ${current.totalDiagnostics} erreurs historiques dans ${current.totalFiles} fichiers.`,
  );
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(
    "Inventaire E2E absent. Exécutez pnpm run typecheck:e2e:baseline:update après revue du diagnostic.",
  );
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (baseline.version !== 1 || !Array.isArray(baseline.diagnostics)) {
  console.error("Le format de l’inventaire E2E n’est pas reconnu.");
  process.exit(1);
}

const comparison = compareDiagnosticBaseline(diagnostics, baseline);
if (comparison.matches) {
  console.log(
    `E2E TypeScript : aucune nouvelle erreur (${current.totalDiagnostics} erreurs historiques suivies dans ${current.totalFiles} fichiers).`,
  );
  process.exit(0);
}

function printDiagnostics(title, values) {
  if (values.length === 0) return;
  console.error(`\n${title}`);
  for (const diagnostic of values.slice(0, 20)) {
    console.error(
      `- ${diagnostic.file} ${diagnostic.code} ×${diagnostic.count}: ${diagnostic.message}`,
    );
  }
  if (values.length > 20) {
    console.error(`- … ${values.length - 20} autre(s) diagnostic(s)`);
  }
}

printDiagnostics("Nouvelles erreurs TypeScript E2E :", comparison.newDiagnostics);
printDiagnostics("Erreurs historiques résolues :", comparison.resolvedDiagnostics);
console.error(
  "\nL’inventaire doit rester strictement synchronisé. Corrigez les nouvelles erreurs ; si la dette diminue, exécutez pnpm run typecheck:e2e:baseline:update.",
);
process.exit(1);
