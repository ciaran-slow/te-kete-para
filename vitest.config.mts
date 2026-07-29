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
  },
});
