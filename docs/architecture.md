# Architecture: Te Kete Para (BinSync Wellington)

---

## 1. System Overview & Architecture Style
**Te Kete Para** is structured as a modular, high-performance **Progressive Web Application (PWA)** built on a Jamstack/Server-Side Rendering (SSR) hybrid model. It cleanly separates client-side presentation layers from an edge-optimized API backend and an embedded relational database.

[ Client PWA (Next.js / Tailwind / Radix UI / Vitest) ]
│  (HTTPS / REST / Web Push)
▼
[ Vercel Edge / Serverless API Layer (Node.js) ]
│  (Knex.js Query Builder)
▼
[ SQLite3 Database (WCC Schedules, Localizations, Users) ]

---

## 2. Component Breakdown & TDD Testing Strategy

### A. Client-Side Layer (Frontend PWA)
* **Framework:** Next.js (React) utilizing App Router for file-system routing and static/dynamic rendering optimization.
* **Styling & Design System:** Tailwind CSS v4 with Wellington design tokens declared CSS-first in the `@theme` block of `src/app/globals.css` (`--color-kakariki` #1B4D3E, `--color-moana` #003B46, `--color-kowhai` #B45309, `--color-papa` #F8FAFC, `--color-papa-ink` #0F172A); there is deliberately no `tailwind.config` file (ADR 0004). Typography is Inter (body, `--font-sans`) and Plus Jakarta Sans (headings/UI, `--font-heading`), self-hosted at build time via `next/font/google` with `latin` + `latin-ext` subsets so macrons render from the primary faces (ADR 0005).
* **Accessibility Primitives:** Radix UI headless components ensuring W3C ARIA compliance, keyboard navigation, and screen-reader optimization, consumed through the unified `radix-ui` package — primitives import as namespaces (`import { Separator } from "radix-ui"`), so later issues add no new dependencies (ADR 0006).
* **Header & Language Toggle:** `src/components/language-toggle.tsx` renders a Radix `RadioGroup` (`role="radiogroup"`, `radio` items) inside `<header>` in `src/app/layout.tsx`, giving every route a persistent, accessible EN/Te Reo switch wired directly to `useTranslation()`. `RadioGroup`, not `ToggleGroup`, is deliberate: `ToggleGroup`'s roving focus moves the DOM focus on arrow keys without selecting, which breaks the "selection follows focus" keyboard contract implied by its own `role="radiogroup"`/`"radio"` output — `RadioGroup` selects on arrow-key focus, matching native radio behaviour. Shared, reusable UI components live in `src/components/`, one file per component (ADR 0011). `src/app/home-copy.tsx` is the one exception: it's a small Client Component holding only the three locale-dependent strings, colocated with (not exported from) `page.tsx`, which stays a Server Component per ADR 0011's "Server Component pages and layouts import and render them directly" — converting the whole page would needlessly move the static macron sample and colour-token list into client JS.
* **Localization State:** `LanguageProvider` (`src/lib/i18n/language-provider.tsx`) holds the selected locale and exposes `useTranslation()` → `{ locale, setLocale, t }`. Flat dot-delimited keys live in `src/lib/i18n/dictionaries.ts`, where `en` is the source of truth (`as const`) and `mi` is typed `Record<TranslationKey, string>`, so drift fails `tsc` as well as the runtime parity test (ADR 0010). The locale is read from `localStorage` (`tkp.locale`) through `useSyncExternalStore`, never during render and never via `setState` in an effect — `react-hooks/set-state-in-effect` is an error in this repo (ADR 0009). `getServerSnapshot` returns `en` so `/` stays statically prerendered, which costs a brief flash of English before Te Reo on a hard load; the inline-script alternative that would remove it is recorded as rejected in ADR 0009. The provider mirrors the locale onto `<html lang>` in an effect so screen readers pick the right voice (vision.md §3). Macron-safe rendering comes from the Inter / Plus Jakarta Sans `latin-ext` subsets (ADR 0005).
* **Client Testing Strategy (Vitest + Testing Library + Axe):**
  * Unit tests verify bilingual UI component rendering, dictionary interpolation, and macron preservation.
  * Automated accessibility audits run inside Vitest via the shared helper `expectNoA11yViolations(container)` (`__tests__/helpers/a11y.ts`), which wraps `axe-core` directly — `@axe-core/react` only logs to the dev console and cannot fail a test (ADR 0007). The helper audits rendered fragments, so contrast rules (uncomputable in jsdom) and document-level rules (`html-has-lang`, landmarks-per-page) are deliberately excluded there; those are covered by the CI axe suite (#17), the Lighthouse budget (#31), and manual QA (#18). Two further limits are inherent rather than configured, so a green assertion means "no violation axe could decide here", not "accessible" (ADR 0007, §Trade-offs and consequences). First, `axe.run` also returns an `incomplete` bucket for checks it could not decide, and the helper fails only on `violations`; without layout, jsdom sends every visibility-dependent rule to `incomplete`, so a focusable element inside `aria-hidden="true"` reports `incomplete: ["aria-hidden-focus"]` and no violation. Those rules get a real verdict only in a browser, via #17 and #31. Second, many small fragments match no rules at all (`<p>Kia ora</p>` evaluates zero), so an audit can pass having checked nothing. The helper narrows that second case without closing it: it rejects a container with no child nodes, which catches a component regressing to returning `null`, but a fragment that renders and still matches no rules (`<div />`) passes.
* **End-to-End Testing (Playwright, ADR 0001):** Browser-level tests in `e2e/*.spec.ts` run via `npm run test:e2e` against a production build (`next build` + `next start`, managed by Playwright's `webServer`), Chromium-only. This is the layer that exercises hydration, real navigation, PWA/offline behaviour, and push flows. Vitest excludes `e2e/**`; Playwright owns `.spec.ts` there, Vitest owns `.test.ts(x)` everywhere else. E2E is a separate script, not one of the four fast gates.

### B. API & Business Logic Layer
* **Runtime Environment:** Node.js serverless functions / edge runtimes hosted via Vercel or Netlify.
* **Data Abstraction:** **Knex.js** query builder managing secure, parameterized SQL query generation and automated schema migrations.
* **API Testing Strategy (Vitest + Supertest, ADR 0002 / ADR 0003):** Integration tests share the helper `__tests__/helpers/api.ts`. `setupTestDb()` / `teardownTestDb()` give each test file its own in-memory SQLite3 database with all Knex migrations applied and `PRAGMA foreign_keys = ON` in force, because the instance is built from `knexfile.js`'s `test` config rather than a hand-rolled one. `createRequestListener(routeModule)` adapts this fork's Web-API route handlers (`Request` → `Response`) into a Node request listener that Supertest drives **in-process** — the only way the handler under test can see a `:memory:` database that lives inside the test process's single connection. API test files therefore run under `// @vitest-environment node` (Vitest's global environment is jsdom), and app code reaches the database only through `src/lib/db.ts` (`getDb()`), so handler and fixtures share one Knex instance. Supertest validates endpoint behaviour (`/api/suburbs/search`, `/api/notifications/subscribe`) — schedule math, holiday overrides, JSON payloads — plus each route's failure path; `/api/health` is the reference example.
* **Suburb Search Endpoint:** `GET /api/suburbs/search?q=` (`src/app/api/suburbs/search/route.ts`)
  does a case-insensitive, wildcard-escaped partial match on `addresses.street_name` via
  Knex, returning `{ results: [...] }` with camelCase fields; every JSON API response in this
  app follows the envelope and casing convention in ADR 0012, established here as the first
  data-returning endpoint.

### C. Data Persistence Layer
* **Database Engine:** **SQLite3** stored as an embedded file database (`/data/teketepara.db`).
* **Core Schemas:**
  * `addresses`: Wellington street indices, council zones, suburb classifications (Suburban vs. CBD night collection).
  * `schedules`: Date-mapped bin collection calendars, alternating recycling flags, and holiday override rules.
  * `i18n_strings`: Relational translation keys with explicit English (`en`) and Te Reo Māori (`mi`) text columns.
  * `sorting_rules`: Item keys, bilingual descriptions, and WCC disposal instructions.
  * `users` & `push_subscriptions`: User preferences, language toggles, address foreign keys, and Web Push tokens.
  * *Database Testing:* Vitest verifies migration up/down cycles against clean test databases before test execution.
* **Dependencies:** `knex` (query builder + migration runner) and `sqlite3` (driver). `sqlite3` is already on Next.js's auto-external package list; `knex` is not, and its dynamic dialect requires break when bundled into a route handler, so `next.config.ts` sets `serverExternalPackages: ["knex"]` (ADR 0002).
* **Runtime Access:** App code never constructs Knex directly — it calls `getDb()` from `src/lib/db.ts`, a lazily-created shared instance configured from `knexfile.js` (`test` config when `NODE_ENV === "test"`, otherwise `development`), with `destroyDb()` for teardown (ADR 0002). `src/lib/db.ts` loads knexfile.js through a runtime require of a `process.cwd()`-based path rather than a static import, because bundling that CommonJS file rewrites its `__dirname` to a `/ROOT` placeholder and breaks both `next build` and its path resolution.
* **Migration & Seed Tooling:** Migrations and seeds run via the Knex CLI, driven by the root `knexfile.js` (`development` and `test` environments). `development` writes to `data/teketepara.db` (git-ignored; the directory is created idempotently when `knexfile.js` loads); `test` uses `:memory:`. Migration files live in `db/migrations/`, seeds in `db/seeds/`. The sqlite3 dialect's default connection pool is `{ min: 1, max: 1 }`, which is what keeps an in-memory test database consistent across queries — do not override `pool` **sizing**. The one permitted `pool` entry is the `afterCreate` hook described below, which does not change sizing.
* **Seed Idempotency:** `db/seeds/*.js` files that populate reference/lookup tables (starting with `db/seeds/01_addresses.js`) achieve idempotency by deleting all rows in the target table before reinserting the fixed dataset, not by upserting on a natural key — `addresses` has no unique constraint to upsert against, and adding one is out of scope for a seed-only change. This is deliberately destructive: a re-run nulls any `users.address_id` / `push_subscriptions.address_id` that referenced a previously-seeded row, via the existing `ON DELETE SET NULL` foreign keys (ADR 0012).
* **Foreign Key Enforcement:** SQLite opens every connection with `PRAGMA foreign_keys = OFF`, which silently reduces `references()`/`onDelete()` clauses in migrations to documentation — orphan foreign keys insert without error and `SET NULL` never fires. Both `knexfile.js` environments therefore set `pool.afterCreate` to run `PRAGMA foreign_keys = ON`; the pragma is per-connection, so it cannot be set once globally. `__tests__/db/schema.test.ts` asserts the pragma is on and covers both enforcement paths, so a regression here fails the suite rather than corrupting referential integrity silently.
* **Core Schema Relationships:** `schedules.zone` is a plain indexed string matched loosely against `addresses.zone`, not a foreign key — many addresses share one zone, so zone is not a candidate key. `users` and `push_subscriptions` are sibling tables, each with its own nullable `address_id` referencing `addresses.id`; subscriptions are written directly and never joined through `users`. `push_subscriptions.endpoint` is unique, as the Web Push endpoint URL is the natural dedup key for repeat subscribe calls.

---

## 3. Data Flow & Request Lifecycle

1. **Address Lookup & Initialization:**
   * User inputs street address in the PWA client.
   * Client sends a GET request to `/api/suburbs/search?q=TeAro`.
   * API queries SQLite3 via Knex, returning matching zones, collection rules, and inner-city night collection flags.
2. **Schedule Rendering & Localization:**
   * Client renders upcoming bin requirements using localized templates, validated via component and key-parity tests.
3. **Notification Scheduling & TDD Verification:**
   * User opts into "Night-Before" reminders via browser Service Worker.
   * Server stores subscription tokens in SQLite3. Cron workers execute nightly at 6:00 PM NZST, evaluating timezones and dispatching bilingual payloads to the Web Push API.

---

## 4. Testing Infrastructure & Quality Assurance Pipelines
* **Execution Engine:** **Vitest** configured for fast parallel execution across client unit tests, accessibility hooks, and API integration suites.
* **Continuous Integration:** `.github/workflows/ci.yml` runs four gates on every pull request and every push to `main`, as one sequential job on `ubuntu-latest` with Node 24: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`. Playwright is deliberately not wired in here — E2E stays a separate script (§2A).
* **Merge Enforcement:** the `lint, typecheck, test, build` check is a **required** status check on `main` (branch protection, #45), so a red pull request cannot be merged — including by repository admins (`enforce_admins`), and including a PR that is green against a stale `main` (`strict`). This is what makes the coverage number below binding rather than advisory; verified by a probe PR whose merge was refused with "the base branch policy prohibits the merge". The check name in the protection rule must stay byte-identical to the job's `name:` in `ci.yml` — a mismatch produces a rule that silently matches nothing.
* **Coverage Enforcement:** `npm run test:coverage` (`vitest run --coverage`) measures product code only — `src/**/*.{ts,tsx}`, via `@vitest/coverage-v8` (ADR 0008) — and fails the run if **lines or statements** fall below **90%**; both currently sit at 100%. Branches and functions are reported in the CI log but not gated: `src/lib/db.ts` selects its Knex config on `NODE_ENV === "test"`, and Vitest always sets `NODE_ENV=test`, so the `development` side of that branch is unreachable from the suite (ADR 0008 §Trade-offs and consequences).
* **Automated Linting & Type Safety:** TypeScript strict mode enabled across the entire codebase to prevent runtime type errors and ensure bulletproof database entity mapping.