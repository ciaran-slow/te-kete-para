import { createRequire } from "node:module";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { Result } from "axe-core";

/* Loads the same axe-core devDependency (4.12.1) that the jsdom helper
   (__tests__/helpers/a11y.ts, ADR 0007) uses, so both test tiers audit
   against one pinned rule set instead of two independently-versioned
   packages drifting apart (ADR 0022). createRequire avoids a literal
   `require(...)` call, which @typescript-eslint/no-require-imports forbids
   as an error in this repo — mirrors src/lib/db.ts (ADR 0002). The
   resolver is deliberately not named `require`, so no call here reads as
   the pattern that rule targets. Anchored to a process.cwd()-based path
   (the ADR 0002 pattern) rather than `import.meta.url`, because Playwright
   transpiles these TS files to CommonJS, where `import.meta` is a syntax
   error; Playwright always runs from the repo root, where its config
   lives. */
const resolveModule = createRequire(path.join(process.cwd(), "package.json"));
const axeCoreScriptPath = resolveModule.resolve("axe-core/axe.min.js");

/* Deliberately duplicated from __tests__/helpers/a11y.ts rather than
   imported: that file is jsdom/Vitest-only territory (ADR 0001 draws the
   line at e2e/** in both directions) and is already at 100% covered,
   accepted behaviour — refactoring it to share ~15 lines with a different
   test runner is out of scope for this issue. Keep the two formatters in
   sync by eye if axe's Result shape ever changes. */
function formatViolations(violations: Result[]): string {
  const details = violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    ${node.target.join(" ")}\n      ${node.html}`)
        .join("\n");
      return [
        `  ${violation.id} (${violation.impact ?? "unknown"} impact): ${violation.help}`,
        nodes,
        `    ${violation.helpUrl}`,
      ].join("\n");
    })
    .join("\n\n");
  return `Expected no accessibility violations, found ${violations.length}:\n\n${details}`;
}

/* Unlike the jsdom helper (ADR 0007), no rules are disabled here: a real
   Chromium layout can compute color-contrast and the "region" landmark
   rule correctly, which is the entire reason this browser-level tier
   exists (ADR 0022, #17). Always await this — axe runs asynchronously and
   the injected script tag must load before `window.axe` exists. */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  await page.addScriptTag({ path: axeCoreScriptPath });
  const violations = await page.evaluate(async () => {
    const results = await (
      window as unknown as {
        axe: { run: () => Promise<{ violations: Result[] }> };
      }
    ).axe.run();
    return results.violations;
  });
  if (violations.length > 0) {
    throw new Error(formatViolations(violations));
  }
}
