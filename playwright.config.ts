import { defineConfig, devices } from "@playwright/test";

// E2E tests live in e2e/ and run against a production build (`next build` +
// `next start`), per node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md.
// Vitest owns unit/integration tests; its config excludes e2e/ so the two
// runners never pick up each other's files (see docs/adr/0001).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
