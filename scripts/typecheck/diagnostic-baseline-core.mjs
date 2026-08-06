function diagnosticKey({ file, code, message }) {
  return `${file}\u0000${code}\u0000${message}`;
}

function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((left, right) =>
    diagnosticKey(left).localeCompare(diagnosticKey(right), "en"),
  );
}

/**
 * @param {string} output
 * @returns {Array<{file: string, code: string, message: string, count: number}>}
 */
export function parseTypeScriptDiagnostics(output) {
  const counts = new Map();
  const pattern = /^(.+?\.(?:[cm]?ts|tsx|[cm]?js|jsx))\(\d+,\d+\): error (TS\d+): (.+)$/gm;

  for (const match of output.matchAll(pattern)) {
    const diagnostic = {
      file: match[1].replaceAll("\\", "/"),
      code: match[2],
      message: match[3].trim(),
    };
    const key = diagnosticKey(diagnostic);
    const current = counts.get(key);
    counts.set(key, current ? { ...current, count: current.count + 1 } : { ...diagnostic, count: 1 });
  }

  return sortDiagnostics(counts.values());
}

/**
 * @param {Array<{file: string, code: string, message: string, count: number}>} diagnostics
 */
export function createDiagnosticBaseline(diagnostics) {
  const normalized = sortDiagnostics(diagnostics);
  return {
    version: 1,
    totalDiagnostics: normalized.reduce((total, diagnostic) => total + diagnostic.count, 0),
    totalFiles: new Set(normalized.map((diagnostic) => diagnostic.file)).size,
    diagnostics: normalized,
  };
}

/**
 * @param {Array<{file: string, code: string, message: string, count: number}>} currentDiagnostics
 * @param {{diagnostics: Array<{file: string, code: string, message: string, count: number}>}} baseline
 */
export function compareDiagnosticBaseline(currentDiagnostics, baseline) {
  const current = new Map(currentDiagnostics.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic]));
  const expected = new Map(baseline.diagnostics.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic]));
  const newDiagnostics = [];
  const resolvedDiagnostics = [];

  for (const [key, diagnostic] of current) {
    const expectedCount = expected.get(key)?.count ?? 0;
    if (diagnostic.count > expectedCount) {
      newDiagnostics.push({ ...diagnostic, count: diagnostic.count - expectedCount });
    }
  }

  for (const [key, diagnostic] of expected) {
    const currentCount = current.get(key)?.count ?? 0;
    if (diagnostic.count > currentCount) {
      resolvedDiagnostics.push({ ...diagnostic, count: diagnostic.count - currentCount });
    }
  }

  return {
    matches: newDiagnostics.length === 0 && resolvedDiagnostics.length === 0,
    newDiagnostics: sortDiagnostics(newDiagnostics),
    resolvedDiagnostics: sortDiagnostics(resolvedDiagnostics),
  };
}
