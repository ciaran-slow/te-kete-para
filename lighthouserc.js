/**
 * Lighthouse CI budget for NFR-01 (docs/prd0.md): First Contentful Paint
 * under 1.5s on mobile 4G, Accessibility and Best Practices scores of 100.
 * Lighthouse's default collection already emulates a mid-tier mobile device
 * over a throttled connection, so no extra `throttling`/`formFactor`
 * settings are needed to match "mobile 4G" — see docs/adr/0033.
 *
 * Scoped to `/` only: it is the only route composed into the app today
 * (ADR 0028, ADR 0031). Extend `collect.url` when a second route is
 * composed.
 */
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000/"],
      startServerCommand: "npm run start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 30000,
      numberOfRuns: 3,
      settings: {
        // ubuntu-latest's preinstalled Chrome needs --no-sandbox in CI;
        // --disable-dev-shm-usage avoids /dev/shm exhaustion on small runners.
        chromeFlags: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
    assert: {
      // No preset (e.g. lighthouse:recommended) — it would additionally gate
      // on SEO/PWA categories NFR-01 never mentions. Only these three.
      assertions: {
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 1 }],
        "first-contentful-paint": ["error", { maxNumericValue: 1500 }],
      },
    },
    upload: {
      // Local report files as a CI artifact, not a third-party upload —
      // see ADR 0033 alternatives (temporary-public-storage rejected).
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
