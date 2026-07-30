import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ belongs to Playwright; its *.spec.ts files match Vitest's default
    // include pattern and would fail under jsdom if swept up here.
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      /* Measure product code only. With no `include`, the v8 provider reports
         __tests__/helpers/*.ts as if it were production code; with "src/**" it
         also sweeps in favicon.ico and globals.css. This pattern resolves to
         exactly layout.tsx, page.tsx, api/health/route.ts and lib/db.ts. */
      include: ["src/**/*.{ts,tsx}"],
      /* Lines and statements only, per #6's acceptance criteria. Branches sits
         at 50% because src/lib/db.ts:33 selects the "development" knex config
         when NODE_ENV !== "test", and Vitest always sets NODE_ENV=test, so that
         side is unreachable from the suite. Gating it would block every PR
         (ADR 0008). Both are still reported in the CI log. */
      thresholds: { lines: 90, statements: 90 },
    },
  },
});
