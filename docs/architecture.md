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
* **Header & Language Toggle:** `src/components/language-toggle.tsx` renders a Radix `RadioGroup` (`role="radiogroup"`, `radio` items) inside `<header>` in `src/app/layout.tsx`, giving every route a persistent, accessible EN/Te Reo switch wired directly to `useTranslation()`. Its items, and every other real interactive element in the app, share the .focus-ring / .touch-target utility classes declared in src/app/globals.css (vision.md §3, ADR 0020) rather than duplicating focus/sizing utilities per component. `RadioGroup`, not `ToggleGroup`, is deliberate: `ToggleGroup`'s roving focus moves the DOM focus on arrow keys without selecting, which breaks the "selection follows focus" keyboard contract implied by its own `role="radiogroup"`/`"radio"` output — `RadioGroup` selects on arrow-key focus, matching native radio behaviour. Shared, reusable UI components live in `src/components/`, one file per component (ADR 0011). `src/app/home-copy.tsx` and `src/app/address-schedule.tsx` are the colocated exceptions: each is a small Client Component holding page-specific composition (locale-dependent strings; the selected-address state shared between `AddressSearch` and `ScheduleDisplay`, ADR 0018) rather than a reusable primitive, colocated with (not exported from) `page.tsx`, which stays a Server Component per ADR 0011's "Server Component pages and layouts import and render them directly."
* **Shared Status Announcements:** `src/components/status-region.tsx`
  renders `<StatusRegion>`, a stateless `aria-live="polite"` wrapper
  parameterized by host element (`as`), `atomic`, and an optional
  `headingId` → `aria-labelledby` (ADR 0021). `ScheduleDisplay`'s outer
  `<section>`, `AddressSearch`'s status `<p>`, `SortingSearch`'s status
  messages, and `ShiftAlertBanner`'s announcement `<div>` all render
  through it today.
* **Address Search:** `src/components/address-search.tsx` renders
  `<AddressSearch>`, a hand-built WAI-ARIA 1.2 combobox (no Radix primitive —
  ADR 0014) that debounces keystrokes 300ms, queries
  `GET /api/suburbs/search`, and renders matches as a keyboard-navigable
  `role="listbox"`. Its loading/empty/error status message renders through
  the shared `<StatusRegion>` (ADR 0021). It is rendered directly from
  `src/app/page.tsx` (a Server
  Component) per ADR 0011. All fetch/debounce/keyboard state is local to the
  component — no `useEffect` reacts to the query; scheduling a search happens
  inside the `onChange` handler itself, which is what lets `selectResult`
  rewrite the input's display value without that rewrite re-triggering a
  search. Its input carries the shared `.focus-ring` / `.touch-target`
  classes (ADR 0020), gating its ring on `:focus-visible` like every other
  interactive element; the listbox rows take only `.touch-target`, since
  they never receive real DOM focus (ADR 0014).
* **Schedule Display:** `src/components/schedule-display.tsx` renders
  `<ScheduleDisplay>`, which shows today's computed collection rules
  (`computeCollectionRuleSet`, §2B) for the address selected via
  `<AddressSearch>`. It renders through the shared `<StatusRegion>`
  (ADR 0021), which supplies the
  `aria-live`/`aria-atomic`/`aria-labelledby` plumbing. It shows
  *today's* rules, not a scanned "next
  collection date" — ADR 0019 — and only ever computes "today" on a
  render path reachable exclusively client-side, after a user selection —
  ADR 0018. The two components are composed by the colocated
  `src/app/address-schedule.tsx`, rendered directly from `src/app/page.tsx`
  (a Server Component) per ADR 0011. `selected` is sourced from a
  `useSyncExternalStore` over a versioned `localStorage` cache of the
  selected `SuburbSearchResult` (`src/lib/schedule/address-cache.ts`), not
  local component state, so the schedule survives reload/offline relaunch —
  NFR-02, ADR 0052, issue #30 — while still starting `null` identically on
  the server and the client's first render, preserving ADR 0018's
  client-only-"today" safety property.
* **Sorting Search:** `src/components/sorting-search.tsx` renders
  `<SortingSearch>` (FR-05, "He Aha Tēnei?"), a debounced (300ms) search
  over `GET /api/sorting/search` that renders matched items and their
  disposal instructions in the current locale as a plain labelled
  `<ul>`/`<li>` results list — deliberately *not* an ARIA combobox, since
  there is no selection step (ADR 0026). Status messages render through
  the shared `<StatusRegion>` (ADR 0021); the input and mic button carry
  the shared `.touch-target`/`.focus-ring` utilities (ADR 0020). Optional
  voice input uses the browser-native Web Speech API, feature-detected via
  `useSpeechRecognitionSupport()` (`src/lib/speech/`, a
  `useSyncExternalStore` hook with ambient types in
  `speech-recognition-types.d.ts`); when unsupported the mic button is
  simply absent and typed search is the fallback (ADR 0027). The component
  is fully built and tested but **not composed into any route yet**: the
  `sorting_rules` seed content it renders is unverified pending #69/#70
  (§2C), so wiring it into `page.tsx` is deferred until both close
  (ADR 0028).
* **Shift-Alert Banner:** `src/components/shift-alert-banner.tsx` renders
  `<ShiftAlertBanner>` (vision.md §4B, issue #24), which announces an
  upcoming holiday-shifted collection through the shared `<StatusRegion>`
  (ADR 0021), bilingual per `LanguageContext`. Its pure `findUpcomingShift`
  helper scans a 7-day window (today + 6 days, inclusive) over the
  council-wide holiday list, delegating shift math — including cascading
  adjacent-holiday chains (ADR 0030) — to `computeHolidayShift` (§2B); the
  window length is a recorded product judgment call (ADR 0032). Rendering
  and fetching are gated on the same address-selection prop
  `<ScheduleDisplay>` uses (ADR 0018): with no address selected the banner
  stays an empty `sr-only` live region and never fetches. Once an address
  is selected, it fetches `GET /api/holidays` (§2B) from a `useEffect`
  keyed on `address.id` — the codebase's **first effect-based data fetch**
  (as opposed to the event-handler fetches in `AddressSearch` and
  `SortingSearch`); ADR 0032 records the pattern (all `setState` inside the
  promise callbacks, never synchronously in the effect body, keeping
  `react-hooks/set-state-in-effect` satisfied) and future "fetch when a
  prop becomes available" components should follow it rather than
  re-litigating. Composed into `address-schedule.tsx` alongside
  `<ScheduleDisplay>` (issue #83), now that #78 has closed (ADR 0031, ADR
  0038). Its wording is deliberately council-wide ("Collections normally
  due... move to..."), not a per-address claim: nothing in
  `addresses`/`schedules`/`CollectionRuleSet` marks a real collection day
  for a given street (ADR 0019), so asserting "your collection" would be
  false precision for a resident whose street isn't actually collected on
  the affected day (ADR 0053). A genuine per-address version of this
  banner is tracked as a distinct, larger data-sourcing effort (issue
  #117), not part of this change.
* **Web App Manifest & Core Shell Caching:** `src/app/manifest.ts` (Next's
  App Router manifest convention, resolved at `/manifest.webmanifest`)
  supplies the installable-app name, Papa/Moana theme colours, and two
  hand-authored SVG icons (`public/icons/icon.svg`, `icon-maskable.svg`).
  `src/components/service-worker-registration.tsx`, rendered once from
  `layout.tsx`, feature-detects `navigator.serviceWorker` and registers a
  hand-written `public/sw.js` (no Serwist/next-pwa dependency) that
  precaches five stable-path shell assets on `install` (network-first for
  navigations, cache-first for the other precached assets, with older
  `tkp-shell-*` caches deleted on `activate`) — NFR-02's core-asset half. It
  also registers `push` and `notificationclick` listeners (#115, ADR 0055):
  `push` shows a notification for the delivered dispatch payload (§2B) via
  `self.registration.showNotification`, with a generic English fallback if
  the payload is missing or fails to parse as JSON; `notificationclick`
  closes the notification and focuses an existing app window or opens one
  at `/`. User-selected address-schedule offline caching is the separate,
  `localStorage`-backed piece of NFR-02 anticipated here and implemented by
  #30 (ADR 0052), which caches the selected `SuburbSearchResult` (not the
  raw search response or a computed rule set) and restores it via
  `useSyncExternalStore`, mirroring `LanguageProvider`'s locale persistence
  (ADR 0009).
* **Push Opt-In Toggle:** `src/components/push-subscription-toggle.tsx`
  renders `<PushSubscriptionToggle>`, a Radix `Switch` (ADR 0006) that
  requests Notification permission and calls `pushManager.subscribe()`
  only on explicit user interaction — never on mount, unlike
  `<ServiceWorkerRegistration>`'s unconditional shell-caching registration
  (ADR 0041) it builds on via `navigator.serviceWorker.ready`. On success
  it POSTs to `/api/notifications/subscribe` (#25, ADR 0033); toggling off
  calls `DELETE` on the same route (ADR 0034), rolling back the
  browser-level subscription only after the server confirms removal, and
  rolling back the browser-level subscription it just created if the
  POST fails — the two sides must never diverge, since "subscribed" is
  derived purely from `pushManager.getSubscription()` on next mount, with
  no server-side GET to cross-check against. Its `applicationServerKey`
  comes from `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`, validated by
  `parseVapidPublicKey`; an absent or malformed key renders a
  "misconfigured" state rather than throwing — no real VAPID keypair is
  provisioned yet (ADR 0047). Status text renders through the shared
  `<StatusRegion>` (ADR 0021). Like `<SortingSearch>`, it was fully built
  and tested but deferred from composition (ADR 0048) until #28's payload
  delivery and #110's nightly cron invocation both existed. Both have now
  closed; #113 (ADR 0058) composes it into `address-schedule.tsx`, gated on
  `selected !== null` — unlike `<ShiftAlertBanner>`/`<ScheduleDisplay>`, it
  has no "no address" display state of its own, so the composition site
  hides it entirely rather than let a resident create an undeliverable,
  addressId-less subscription (dispatcher.ts's zone lookup requires a real
  `address_id`).
* **Localization State:** `LanguageProvider` (`src/lib/i18n/language-provider.tsx`) holds the selected locale and exposes `useTranslation()` → `{ locale, setLocale, t }`. Flat dot-delimited keys live in `src/lib/i18n/dictionaries.ts`, where `en` is the source of truth (`as const`) and `mi` is typed `Record<TranslationKey, string>`, so drift fails `tsc` as well as the runtime parity test (ADR 0010). The locale is read from `localStorage` (`tkp.locale`) through `useSyncExternalStore`, never during render and never via `setState` in an effect — `react-hooks/set-state-in-effect` is an error in this repo (ADR 0009). `getServerSnapshot` returns `en` so `/` stays statically prerendered, which costs a brief flash of English before Te Reo on a hard load; the inline-script alternative that would remove it is recorded as rejected in ADR 0009. The provider mirrors the locale onto `<html lang>` in an effect so screen readers pick the right voice (vision.md §3). Macron-safe rendering comes from the Inter / Plus Jakarta Sans `latin-ext` subsets (ADR 0005).
* **Client Testing Strategy (Vitest + Testing Library + Axe):**
  * Unit tests verify bilingual UI component rendering, dictionary interpolation, and macron preservation.
  * Automated accessibility audits run inside Vitest via the shared helper `expectNoA11yViolations(container)` (`__tests__/helpers/a11y.ts`), which wraps `axe-core` directly — `@axe-core/react` only logs to the dev console and cannot fail a test (ADR 0007). The helper audits rendered fragments, so contrast rules (uncomputable in jsdom) and document-level rules (`html-has-lang`, landmarks-per-page) are deliberately excluded there; those are covered by the CI axe suite (#17), the Lighthouse budget (#31), and manual QA (#18). Two further limits are inherent rather than configured, so a green assertion means "no violation axe could decide here", not "accessible" (ADR 0007, §Trade-offs and consequences). First, `axe.run` also returns an `incomplete` bucket for checks it could not decide, and the helper fails only on `violations`; without layout, jsdom sends every visibility-dependent rule to `incomplete`, so a focusable element inside `aria-hidden="true"` reports `incomplete: ["aria-hidden-focus"]` and no violation. Those rules get a real verdict only in a browser, via #17 and #31. Second, many small fragments match no rules at all (`<p>Kia ora</p>` evaluates zero), so an audit can pass having checked nothing. The helper narrows that second case without closing it: it rejects a container with no child nodes, which catches a component regressing to returning `null`, but a fragment that renders and still matches no rules (`<div />`) passes.
* **End-to-End Testing (Playwright, ADR 0001):** Browser-level tests in `e2e/*.spec.ts` run via `npm run test:e2e` against a production build (`next build` + `next start`, managed by Playwright's `webServer`), Chromium-only. This is the layer that exercises hydration, real navigation, PWA/offline behaviour, and push flows. Vitest excludes `e2e/**`; Playwright owns `.spec.ts` there, Vitest owns `.test.ts(x)` everywhere else. E2E is a separate script, not one of the four fast gates. The axe a11y suite (`e2e/a11y.spec.ts`, `e2e/a11y-harness.spec.ts`, ADR 0022) runs in this layer, using a repo-owned helper (`e2e/helpers/axe.ts`) rather than `@axe-core/playwright` — it audits what the jsdom helper (ADR 0007) explicitly cannot: contrast and document-level landmark rules.
* **Manual Screen-Reader QA (ADR 0024):** `docs/qa/screen-reader-checklist.md`
  is a reusable checklist covering address search, schedule display, and
  the language toggle, cross-checked against ARIA-snapshot golden files
  captured by `e2e/manual-screen-reader-tree.spec.ts`
  (`npm run test:e2e:a11y-manual`) — a scriptable proxy for what
  VoiceOver/TalkBack/NVDA/JAWS actually consume, since this pipeline cannot
  drive those tools directly (ADR 0024, §Trade-offs and consequences). This
  spec is deliberately not part of `test:e2e:a11y` or any CI-invoked
  script; it's a manual/on-demand tool, not an automated gate. A
  human-operated pass with real assistive technology remains open as a
  follow-up issue and is what actually closes vision.md §3's named-tool
  claim.

### B. API & Business Logic Layer
* **Runtime Environment:** Node.js serverless functions / edge runtimes hosted via Vercel or Netlify.
* **Data Abstraction:** **Knex.js** query builder managing secure, parameterized SQL query generation and automated schema migrations.
* **API Testing Strategy (Vitest + Supertest, ADR 0002 / ADR 0003):** Integration tests share the helper `__tests__/helpers/api.ts`. `setupTestDb()` / `teardownTestDb()` give each test file its own in-memory SQLite3 database with all Knex migrations applied and `PRAGMA foreign_keys = ON` in force, because the instance is built from `knexfile.js`'s `test` config rather than a hand-rolled one. `createRequestListener(routeModule)` adapts this fork's Web-API route handlers (`Request` → `Response`) into a Node request listener that Supertest drives **in-process** — the only way the handler under test can see a `:memory:` database that lives inside the test process's single connection. API test files therefore run under `// @vitest-environment node` (Vitest's global environment is jsdom), and app code reaches the database only through `src/lib/db.ts` (`getDb()`), so handler and fixtures share one Knex instance. Supertest validates endpoint behaviour (`/api/suburbs/search`, `/api/notifications/subscribe`) — schedule math, holiday overrides, JSON payloads — plus each route's failure path; `/api/health` is the reference example.
* **Suburb Search Endpoint:** `GET /api/suburbs/search?q=` (`src/app/api/suburbs/search/route.ts`)
  fetches every `addresses` row ordered by `street_name` and does a macron- and
  case-insensitive partial match on `street_name` in JavaScript via
  `foldDiacritics` (`src/lib/api/fold-diacritics.ts`, ADR 0040), returning
  `{ results: [...] }` with camelCase fields; every JSON API response in this
  app follows the envelope and casing convention in ADR 0013, established here as the first
  data-returning endpoint.
* **Sorting Search Endpoint:** `GET /api/sorting/search?q=` (`src/app/api/sorting/search/route.ts`)
  fetches every `sorting_rules` row ordered by `item_key` and matches entirely
  in JavaScript: `q` is tokenized on whitespace (`tokenizeSearchQuery`,
  `src/lib/api/tokenize-search-query.ts`), and every term must match (AND
  across terms) at least one of `item_key`, `description_en`,
  `description_mi`, or `keywords` (OR across columns) — replacing the old
  single-contiguous-substring match (ADR 0035). Both sides of every
  comparison are normalized through the same function (`src/app/api/sorting/search/route.ts`'s
  `normalizeForMatch`): hyphens are stripped first (so a hyphen-free query
  matches a hyphenated stored value and vice versa, ADR 0035), then case and
  diacritics are folded via `foldDiacritics` (ADR 0040), so `KĒNE`/`kene` match
  `kēne` the same way `battery` matches `household-batteries`'s `keywords`.
  Matching moved from SQL `LIKE`/`REPLACE` to a post-fetch JS filter when the
  macron/case fold was added: both tables are small enough (16–30 rows) that
  fetching every row costs nothing, and the project's pinned `sqlite3` driver
  has no way to register a custom SQL scalar function, which foreclosed
  folding diacritics inside SQL (ADR 0040). Returns `{ results: [...] }` with
  camelCase fields and both locales' description/disposal-instructions text in
  every result (ADR 0013, ADR 0025, ADR 0035, ADR 0040); `keywords` is
  match-only and never appears in the response. `escapeLikePattern`
  (`src/lib/api/escape-like-pattern.ts`) remains a standalone, independently
  tested helper shared with `/api/suburbs/search` but is no longer invoked by
  either route's matching logic, since a plain JS substring check has no
  wildcard syntax to escape.
* **Holidays Endpoint:** `GET /api/holidays` (`src/app/api/holidays/route.ts`)
  takes no query parameters and returns every row of the `holidays` table
  (§2C) ordered by `holiday_date` ascending, camelCase-mapped to
  `{ results: [{ date, nameEn, nameMi, shiftDays }] }` (ADR 0013). No
  server-side date filtering — the table holds only a handful of rows per
  year, and the client needs rows from outside any naive window anyway to
  resolve adjacent-holiday chains (ADR 0030), so the 7-day lookahead is
  computed client-side in `<ShiftAlertBanner>` (§2A, ADR 0032). Failure
  path returns `{ error }` with status 503. The route is live and consumed
  by `<ShiftAlertBanner>`, composed into `address-schedule.tsx` (issue #83,
  ADR 0031, ADR 0032, ADR 0053).
* **Push Subscription Endpoints:** `POST` and `DELETE`
  `/api/notifications/subscribe`
  (`src/app/api/notifications/subscribe/route.ts`) create/update and remove
  rows in `push_subscriptions` (§2C). `POST` upserts on the unique
  `endpoint` column (`.onConflict("endpoint").merge([...])`), always
  responding `200 { subscription: { id, endpoint, languagePreference,
  addressId } }` (camelCase, ADR 0013) whether the row was inserted or
  updated, so a re-subscribe after a Web Push key rotation never needs to
  branch on "was this new" (ADR 0033); the response omits `p256dh`/`auth`,
  which the client already has. Validation (missing/empty `endpoint`,
  missing `keys`/`keys.p256dh`/`keys.auth`, an unsupported
  `languagePreference`, or a non-positive-integer `addressId`) returns
  `400 { error }`; an `addressId` with no matching `addresses` row is
  caught as a `FOREIGN KEY constraint failed` error and also mapped to
  `400`, not `503`. `DELETE` removes by `{ endpoint }` in the JSON body and
  always responds `200 { deleted: boolean }` — deleting an endpoint that
  was never subscribed, or was already removed, is not an error (ADR
  0034). Both verbs' catch-all failure path (e.g. a broken DB connection)
  returns `503 { error }`, matching every other route.
* **Collection Rule Engine:** `src/lib/schedule/rules.ts` exports a pure
  `computeCollectionRuleSet(zone, date)` that maps a zone's classification
  (`{ zone, isInnerCityNightCollection, recyclingCalendarGroup }`, sourced
  from `addresses`) and a
  calendar date to the applicable bin types, collection time window, and
  — for suburban zones — which side of the fortnightly glass/mixed
  recycling alternation the date falls on (vision.md §4A). The function
  takes no DB dependency: classification is passed in explicitly rather
  than re-derived from the zone string (ADR 0015), and the
  alternating recycling cadence is anchored to a sourced WCC calendar date
  (ADR 0042) representing WCC's "Calendar 1"; a `recyclingCalendarGroup` of
  `2` inverts that parity, since Calendar 2 is Calendar 1's exact
  photographic inverse (ADR 0042). Which calendar each address actually
  follows is confirmed per-address — not per-`zone`, since WCC's calendar
  boundary does not align with this repo's zone taxonomy (3 of the 4
  seeded suburban zones mix both calendars) — via WCC's live per-street
  lookup tool (ADR 0059, issue #102, superseding ADR 0042's uniform-
  Calendar-1 default). It reads only the UTC calendar date of the
  `Date` passed in, so callers must construct dates via `Date.UTC(...)`
  or a `Z`-suffixed ISO string, never a local-time constructor.
* **Holiday Shift Calculation:** `src/lib/schedule/holiday-shift.ts`
  exports a pure `computeHolidayShift(date, holidays)` that detects
  whether a candidate collection date falls on a public holiday and, if
  so, returns the effective shifted date (vision.md §4B: "Good Friday or
  Christmas moving to Saturday"). `holidays` is an explicit
  `HolidayRecord[]` (`{ date, shiftDays }`) that the caller sources from
  the `holidays` table (§2C) — the function takes no DB dependency
  itself, following the same explicit-input shape as
  `computeCollectionRuleSet` (ADR 0015, ADR 0029). A matched shift is
  re-checked against the same holiday list, so adjacent holiday dates
  chain into a single resolved date instead of stopping after one shift
  (ADR 0030) — no row in the confirmed 2026 `holidays` seed (issue #78,
  ADR 0038) is currently adjacent to another, so this path is exercised
  by a synthetic test fixture rather than any real seeded date, but
  remains load-bearing for any future year whose confirmed holidays do
  land on consecutive calendar dates. Like the rule engine, it reads only
  the UTC calendar date of the
  `Date` passed in and of every `holidays[].date` string.
* **Nightly Dispatch Pipeline (decision → localize → send):**
  `src/lib/notifications/dispatcher.ts` (#27, ADR 0044) exports
  `collectNightlyDispatchCandidates`, joining active `push_subscriptions` to
  their address's zone and computing tomorrow's NZ-local collection rule set
  via `tomorrowInNzAsUtcDate` + `computeCollectionRuleSet` (above).
  `src/lib/notifications/payload-builder.ts`'s `buildLocalizedPushContent`
  renders that rule set into a localized `{ title, body }` via the shared
  dictionaries (§2A), keyed on each subscription's `languagePreference` — a
  pure function with no DB access, mirroring the explicit-input pattern ADR
  0015 established for `rules.ts`/`holiday-shift.ts`.
  `src/lib/notifications/push-sender.ts`'s `sendDispatchPayload` signs and
  delivers the encrypted payload via the `web-push` package (ADR 0049),
  reading `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
  at the point of use and treating any of the three as missing as an
  unconfigured, logged no-op for that one subscription rather than throwing
  or blocking other sends (ADR 0050, extending ADR 0047).
  `src/lib/notifications/dispatch-runner.ts`'s `runNightlyDispatch` composes
  all three via `Promise.all`, so one subscriber's failure never blocks
  another's send. Once every send in the batch has been attempted,
  `runNightlyDispatch` calls `src/lib/notifications/subscription-pruner.ts`'s
  `pruneGoneSubscriptions`, which deletes any `push_subscriptions` row whose
  send came back with a 404/410 "gone" `failureReason` — single-strike, no
  retry counter or new column (#111, ADR 0057). A failed `runNightlyDispatch`
  call (e.g. `collectNightlyDispatchCandidates`'s DB read) is retried up to 3
  times with exponential backoff (`src/lib/notifications/retry.ts`'s
  `withRetry`) before the route gives up; retrying the whole call is safe
  only because a `pruneGoneSubscriptions` failure no longer rejects
  `runNightlyDispatch` (it's logged and swallowed instead), so every
  remaining rejection source happens strictly before any push is sent.
  Exhausting every attempt fires a best-effort webhook alert
  (`src/lib/notifications/alerting.ts`) to
  `process.env.DISPATCH_ALERT_WEBHOOK_URL` — an unprovisioned config gap in
  every environment today, same pattern as `CRON_SECRET` (#122, ADR 0061).
  `public/sw.js`'s `push` listener now
  calls `self.registration.showNotification(...)` to display what gets
  sent, falling back to a generic notification on a malformed/absent
  payload, with a `notificationclick` listener that focuses or opens the
  app's root route (#115, ADR 0055).

### C. Data Persistence Layer
* **Database Engine:** **SQLite3** stored as an embedded file database (`/data/teketepara.db`).
* **Core Schemas:**
  * `addresses`: Wellington street indices, council zones, suburb classifications (Suburban vs. CBD night collection), which of WCC's two independently-phased alternating recycling calendars the address follows (`recycling_calendar_group`, 1 or 2, `null` for CBD rows; confirmed per-address against WCC's live per-street lookup tool, ADR 0059, issue #102), and — for suburban rows — which real WCC weekday the address's weekly kerbside collection actually falls on (`collection_weekday`, 0–6 per `Date#getUTCDay()`, `null` for CBD rows and any address not yet confirmed; confirmed per-address against the same WCC live per-street lookup tool, ADR 0063, issue #117). `src/lib/schedule/collection-day.ts` exports the pure `isCollectionDay`/`findNextCollectionDate` functions that consume this field (no DB access, ADR 0015); wiring them into `<ScheduleDisplay>`/`<ShiftAlertBanner>` to restore a genuine per-address claim is issue #134's scope, not yet done.
  * `schedules`: migrated (issue #2) but still empty and unqueried — real per-street collection-day data lives on `addresses.collection_weekday` instead (ADR 0063), not as date-mapped rows here. This table remains a placeholder for a possible future per-date override model (e.g. one-off route changes), not the home for regular weekly collection days.
  * `i18n_strings`: Relational translation keys with explicit English (`en`) and Te Reo Māori (`mi`) text columns.
  * `sorting_rules`: Item keys, bilingual descriptions, WCC disposal instructions, and a `keywords` column — a curated, author-added set of extra search terms included in `GET /api/sorting/search`'s match scope (ADR 0035), populated incrementally as real recall gaps are found rather than translated/verified content, so it isn't blocked by #69/#70. The rest of the seed dataset (`db/seeds/02_sorting_rules.js`) is confirmed against live wellington.govt.nz pages (ADR 0054, issue #70) — a browser User-Agent bypasses the site's 403-to-bare-request block, which blocked PR #88's verify pass and every session before it. 14 of 15 rows are fully confirmed, with three corrected (pizza-box, polystyrene-packaging, light-bulb); `aerosol-can`'s exclusion from kerbside recycling is confirmed but its empty-vs-full handling split stays unconfirmed, tracked by issue #119. The Te Reo Māori text still awaits review by a fluent speaker (tracked by issue #69) — a similar confirm-against-real-data pattern to the schedule epoch resolved in ADR 0042 (§2B, issue #59). #69 blocks #21 surfacing this text to users; #70 stays open for the narrow aerosol-can gap. Queried by `GET /api/sorting/search` (ADR 0025, ADR 0035).
  * `holidays`: NZ/Wellington public holiday dates relevant to WCC
    collection shifts, bilingual names, and the number of days collection
    shifts by (ADR 0029). No foreign key to `addresses` or `schedules` — a
    public holiday is council-wide, not per-zone. Seed data
    (`db/seeds/03_holidays.js`) is confirmed for calendar year 2026
    against WCC's published collection policy (issue #78, ADR 0038):
    exactly 3 rows — New Year's Day, Good Friday, Christmas Day — each
    with `shift_days` derived from that date's actual 2026 weekday, not a
    uniform 1. The Te Reo Māori names remain an unreviewed draft pending a
    fluent-speaker review — the same open status as `sorting_rules` (issue
    #69) — so `name_mi` should still be treated as provisional by any
    future consumer.
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
   * Client renders today's bin requirements via `<ScheduleDisplay>` using localized templates (ADR 0019 — today's rules, not a scanned next date), validated via component and key-parity tests.
3. **Notification Scheduling & TDD Verification:**
   * User opts into "Night-Before" reminders via browser Service Worker.
   * Server stores subscription tokens in SQLite3. The Nightly Dispatch
     Pipeline (§2B) evaluates each subscription's NZ-local "tomorrow",
     builds a localized bilingual payload, and dispatches it to the Web
     Push API — the decision, localization, and send logic all exist today
     (#27, #28); a Vercel Cron Job hits the authenticated `GET
     /api/notifications/dispatch` route nightly to invoke the pipeline
     (#110, ADR 0056), though `CRON_SECRET` remains an unprovisioned config
     gap in every environment today (same pattern as the VAPID keys, ADR
     0047/0050). A failed nightly run is retried with backoff and, if still
     failing, raises a best-effort webhook alert rather than only a server
     log line (#122, ADR 0061). The browser side is handled by
     `public/sw.js`'s `push`/`notificationclick` listeners (#115, ADR 0055).

---

## 4. Testing Infrastructure & Quality Assurance Pipelines
* **Execution Engine:** **Vitest** configured for fast parallel execution across client unit tests, accessibility hooks, and API integration suites.
* **Suite Time Zone:** the whole Vitest suite runs at **`TZ=Pacific/Auckland`** (UTC+12/+13, never UTC), pinned by `process.env.TZ` at the top of `vitest.setup.ts` before any test module is imported. This is deliberate: CI's `ubuntu-latest` runs at UTC, where local-time `Date` getters (`getDay`, `getFullYear`, ...) are indistinguishable from their `getUTC*` twins, so the "UTC calendar date only" contract in `src/lib/schedule/rules.ts` (§2B) could never fail there — a `getUTCDay()` → local `getDay()` regression would pass CI and shift every Wellington collection result by a day in production. Consequence for test authors (including future date math in #22/#23): `new Date(...)` local-time constructors and local getters in tests resolve at Pacific/Auckland; construct instants with `Date.UTC(...)` or `Z`-suffixed ISO strings when you mean UTC (ADR 0017).
* **Continuous Integration:** `.github/workflows/ci.yml` runs four gates on every pull request and every push to `main`, as one sequential job on `ubuntu-latest` with Node 24: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`. Playwright is deliberately not wired in here — E2E stays a separate script (§2A). A second job, `a11y` (`name: a11y (axe)`), runs the Playwright axe suite against a production build in parallel with `gates`; it is not currently a required status check (ADR 0023) and Playwright's full E2E suite otherwise still runs only via the separate `npm run test:e2e` script. A third job, `lighthouse` (`name: lighthouse (perf & a11y budget)`), also runs in parallel with `gates`, asserting NFR-01's First Contentful Paint, Accessibility, and Best Practices budgets via `@lhci/cli` against the production build's `/` route (`lighthouserc.js`, ADR 0036); like `a11y`, it is not currently a required status check.
* **Local Build Gate in Worktrees:** every non-main worktree symlinks `node_modules` back to the main worktree (`.workmux.yaml`) so `workmux add` can spin up a worktree without a full install; Turbopack refuses to resolve through a symlink whose real target lies outside its auto-detected project root, so `next.config.ts` computes `turbopack.root` dynamically via `resolveTurbopackRoot()` (`src/lib/turbopack-root.ts`) to tolerate it (ADR 0043). `npm run build` works unmodified from inside any worktree as a result — no manual workaround needed.
* **Merge Enforcement:** the `lint, typecheck, test, build` check is a **required** status check on `main` (branch protection, #45), so a red pull request cannot be merged — including by repository admins (`enforce_admins`), and including a PR that is green against a stale `main` (`strict`). This is what makes the coverage number below binding rather than advisory; verified by a probe PR whose merge was refused with "the base branch policy prohibits the merge". The check name in the protection rule must stay byte-identical to the job's `name:` in `ci.yml` — a mismatch produces a rule that silently matches nothing.
* **Coverage Enforcement:** `npm run test:coverage` (`vitest run --coverage`) measures product code only — `src/**/*.{ts,tsx}`, via `@vitest/coverage-v8` (ADR 0008) — and fails the run if **lines or statements** fall below **90%**; both currently sit at 100%. Branches and functions are reported in the CI log but not gated: `src/lib/db.ts` selects its Knex config on `NODE_ENV === "test"`, and Vitest always sets `NODE_ENV=test`, so the `development` side of that branch is unreachable from the suite (ADR 0008 §Trade-offs and consequences).
* **Automated Linting & Type Safety:** TypeScript strict mode enabled across the entire codebase to prevent runtime type errors and ensure bulletproof database entity mapping.