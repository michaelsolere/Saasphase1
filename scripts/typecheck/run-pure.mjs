import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { pureE2eSpecPaths } from "../e2e/test-suite.mjs";
import { repoRoot } from "../e2e/shared.mjs";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kermes-typecheck-pure-"));
const configPath = join(temporaryDirectory, "tsconfig.json");

try {
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        extends: resolve(repoRoot, "tsconfig.json"),
        compilerOptions: {
          incremental: false,
          plugins: [],
        },
        files: [
          resolve(repoRoot, "next-env.d.ts"),
          ...pureE2eSpecPaths.map((path) => resolve(repoRoot, path)),
        ],
        include: [],
        exclude: [],
      },
      null,
      2,
    )}\n`,
  );

  const result = spawnSync(
    resolve(repoRoot, "node_modules/.bin/tsc"),
    ["--project", configPath, "--pretty", "false"],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
