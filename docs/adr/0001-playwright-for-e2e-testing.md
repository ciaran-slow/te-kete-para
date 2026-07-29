# ADR 0001: Playwright for end-to-end browser testing

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** none (direct tooling request)

## Context

The test suite covers components (Vitest + Testing Library + axe, jsdom) and
API routes (Vitest + Supertest, in-memory SQLite), but nothing exercises the
app as a browser does: real navigation, hydration, service-worker/PWA
behaviour (NFR-02 offline caching), and Web Push flows can only be observed
end-to-end. jsdom cannot catch a hydration mismatch or a prerender crash the
way a real browser render does. This fork's Next.js docs
(`node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`)
recommend running E2E against a production build.

## Decision

Adopt **@playwright/test** as the E2E layer. Tests live in `e2e/*.spec.ts`,
run via `npm run test:e2e`, against a production build that Playwright's
`webServer` starts itself (`npm run build && npm run start`). Chromium is the
only configured browser project initially. Vitest explicitly excludes
`e2e/**` because its default include pattern would otherwise sweep up
Playwright specs and fail them under jsdom.

## Alternatives considered

### Playwright (chosen)
- **Pros:** First-class in this fork's own docs; one API for Chromium,
  Firefox, and WebKit when cross-browser coverage is wanted later; built-in
  `webServer` lifecycle management; trace viewer for debugging; parallel by
  default; no run-time service dependency.
- **Cons:** Heavy browser binaries per machine/CI runner; a second test
  runner and assertion style alongside Vitest; slower than jsdom tests.

### Cypress
- **Pros:** Mature ecosystem, interactive runner well-liked for debugging.
- **Cons:** Not the fork docs' recommendation; historically weaker
  multi-tab/WebKit support (Web Push and PWA flows matter here);
  component-testing overlap with existing Vitest setup invites drift; slower
  CI without paid parallelization.

### Vitest browser mode
- **Pros:** No second runner — one config, one assertion style.
- **Cons:** Runs components in a browser but is not an end-to-end harness: no
  production `next start` lifecycle, no real navigation across routes, and it
  was still stabilizing as of adoption. Doesn't cover the gap this ADR is
  about.

### No E2E layer (status quo)
- **Pros:** Zero new dependencies, fastest suite.
- **Cons:** Hydration, PWA offline behaviour, and push-notification flows —
  the core of NFR-02 and FR-level product promises — stay permanently
  untested in a real browser.

## Trade-offs and consequences

- **Accepted cost:** browser binaries (~150 MB) per environment; CI must run
  `npx playwright install chromium` (plus `install-deps` on Linux). E2E runs
  build the app first, so `test:e2e` is minutes, not seconds — it stays a
  separate script rather than joining the four fast gates
  (typecheck/lint/test/build); plans decide per-issue when E2E runs are
  required.
- **Chromium-only** keeps CI lean; the config's `projects` array is the
  single place to add WebKit/Firefox if cross-browser bugs appear — that
  addition would supersede nothing and needs no new ADR.
- **Naming convention:** Playwright owns `e2e/*.spec.ts`; Vitest owns
  `*.test.ts(x)` elsewhere. A `.spec.ts` file outside `e2e/` is a mistake.
- **Revisit if:** Vitest browser mode matures into a true E2E harness, or CI
  cost of browser installs outweighs the coverage.
