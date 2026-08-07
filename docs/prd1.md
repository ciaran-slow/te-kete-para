# Product Requirements Document (PRD v1.0): Te Kete Para

Supersedes `docs/prd0.md` (PRD v0.2). Written by re-comparing `docs/vision.md` against what actually shipped, rather than iterating on v0.2's own text — v0.2 had silently narrowed two vision-doc features out of scope (never flagged as cuts) and carried two success metrics that were never instrumented. Both are corrected here. Everything v0.2 tracked as "Done" without caveat is carried forward unchanged; nothing that already shipped is re-litigated.

## 0. What changed from v0.2, and why

* **FR-03 and FR-05 both stay accepted trade-offs, deliberately — neither is a near-term concern.** v0.2 downgraded the WCAG AAA claim to automated-checks-only (ADR 0065) and shipped the sorting search's Te Reo Māori text as an unreviewed machine draft (ADR 0064), in both cases because a human reviewer (screen-reader tester; fluent Te Reo speaker) wasn't available. Neither constraint has changed, and — explicitly, not just for now — neither is expected to for the foreseeable future; this is a standing product decision for this prototype, not a gap waiting to be scheduled. Both stay carried forward as-is: the accepted risk stays recorded and visible, not re-promised, re-scheduled, or treated as pending.
* **Two vision.md features that were never scoped at all** are added as new requirements: FR-06 (kaitiakitanga micro-copy) and FR-07 (weather-triggered shift alerts). Neither was cut deliberately — they simply never made it from `vision.md` §2 and §4B into `prd0.md`'s FR list, and so were never built, never filed as an issue, and never showed up in any review. Confirmed absent via direct code search, not assumption.
* **The two PRD success metrics that were never measurable** (push delivery success rate, onboarding time) get a real NFR instead of remaining aspirational prose with no instrumentation behind them.
* **A third vision.md-traceable gap, found the same way as FR-06/FR-07:** vision.md's own opening line — "ensuring that **all Wellingtonians**... can effortlessly track their local rubbish schedule" — implies real address coverage. `db/seeds/01_addresses.js` seeds 17 curated streets. FR-02 was marked "Done" in v0.2 without data completeness ever being part of its acceptance bar, so this gap was never flagged. Added as **FR-08**.
* Everything else — bilingual UI, address finder, push notifications, offline resilience, coverage gate — is carried forward as-is. It was verified done in the 2026-08-06 code review and is not re-scoped here.

---

## 1. Product Overview & Objectives

* **Product Name:** Te Kete Para (BinSync Wellington)
* **Goal:** Deliver a fast, fully accessible, bilingual (English / Te Reo Māori) web application that eliminates rubbish and recycling collection confusion for Wellington City Council (WCC) residents.
* **Success Metrics:**
  * Zero-friction onboarding (<30 seconds to find schedule) — **now instrumented**, see NFR-04.
  * 90%+ push notification delivery success rate — **now instrumented**, see NFR-04. (The dispatch pipeline itself already retries, alerts, and prunes dead subscriptions per-attempt — ADR 0057, ADR 0061 — but nothing today reports an aggregate delivery-success percentage anywhere a human can check it.)
  * 100% pass rate on automated WCAG 2.2 AAA checks (axe-core) — unchanged from v0.2; a human-operated assistive-technology pass is explicitly not part of this metric, see FR-03.
  * **>90% test code coverage** enforced via Vitest — unchanged, already enforced (currently 98.2%/99.2%).

---

## 2. User Personas

Unchanged from v0.2:

1. **The Accessible Household Resident:** Relies heavily on screen readers (VoiceOver/TalkBack) or high-contrast visual settings to manage weekly chores independently.
2. **The Inner-City Apartment Flatmate:** Subject to complex Wellington CBD night-collection windows (5:30 PM – 10:00 PM) who needs precise evening timing alerts.
3. **The Eco-Conscious Reo Speaker:** Prefers navigating public utilities entirely in Te Reo Māori and values accurate guidance on local recycling rules to prevent bin contamination.

---

## 3. Functional Requirements & TDD Specifications

### FR-01: Full-App Bilingual Interface & Macron Support — *Shipped, carried forward*
* **Status:** Done. Verified: `Inter`/`Plus Jakarta Sans` load via `next/font/google`; dictionary key-parity enforced at the type level (ADR 0010); culturally-grounded terms (`Pēke Kōwhai Para`, `Kete Karāhe`, `Rauemi Hangarua`, `āpōpō`) confirmed present in `src/lib/i18n/dictionaries.ts`, not just placeholder translations.
* **Requirement:** No change from v0.2.

### FR-02: Address & Collection Zone Finder — *Shipped, carried forward*
* **Status:** Done. No change from v0.2.

### FR-03: WCAG 2.2 AAA Accessibility Compliance — *Accepted trade-off, carried forward*
* **Requirement:** Unchanged from v0.2: automated WCAG 2.2 AAA compliance (axe-core in CI and Vitest, plus the computed-accessibility-tree snapshot proxy, ADR 0024).
* **Status:** Done, with a known, recorded gap — a human-operated pass with real VoiceOver, TalkBack, and NVDA/JAWS (ADR 0065) is not part of this app's current scope. This is not restored to full ambition in v1: it is not a near-term concern for this prototype, now or on any particular horizon, and this document does not commit to a date it can't back.
* **Carried, not dropped:** the gap stays named here so it does not quietly disappear from view. Issue #65 stays closed as out-of-scope-for-prototype — this is a standing product decision, not a pending item waiting on availability.

### FR-04: Smart "Night-Before" Push Notifications — *Shipped, carried forward*
* **Status:** Done — cron-triggered, retried with backoff, alerted on failure, prunes dead subscriptions, re-syncs on address change, displays via service worker. No change from v0.2.

### FR-05: The "He Aha Tēnei?" Sorting Search — *Accepted trade-off, carried forward*
* **Requirement:** Unchanged from v0.2: a searchable index of common household waste items mapped directly to WCC disposal regulations, localized in English and Te Reo Māori.
* **Status:** Done, with a known, recorded gap — the Te Reo Māori text (`db/seeds/02_sorting_rules.js`, all 30 `_mi` fields) is a machine draft, never reviewed by a fluent speaker (ADR 0064). This is not restored to full ambition in v1: sourcing a fluent-speaker reviewer is not something this team can facilitate right now, and this document does not commit to a date it can't back.
* **Carried, not dropped:** this is a real gap affecting PRD persona 3 (navigates entirely in Te Reo Māori). It stays named here specifically so it does not quietly disappear from view. Issue #69 stays closed as won't-fix-for-prototype — this is a standing product decision, not a pending item waiting on reviewer availability.

### FR-06: Kaitiakitanga Micro-Copy — *New, never previously scoped*
* **Requirement:** Positive-reinforcement micro-copy highlighting environmental guardianship (*kaitiakitanga*) surfaces when a user successfully completes a recycling action or correctly identifies a sorting item — per `vision.md` §2, "Karakia / Kaitiakitanga Micro-Copy."
* **Why this is new, not a bug:** confirmed via direct code search — zero references to "kaitiakitanga" or "karakia" exist anywhere outside `vision.md` itself. This was never filed as an issue against v0.2; it simply didn't make the cut when `prd0.md` was first written from the vision doc, and nothing since has caught the gap.
* **Scope, to be refined in planning:** the most natural trigger point is `<SortingSearch>`'s results list (a correct-match state already exists) and/or a successful address-schedule lookup. Exact copy, trigger conditions, and whether this is a `<StatusRegion>` announcement, a visual banner, or both, is a planning-stage decision — this PRD names the requirement, not the implementation.
* **TDD Strategy:** Component tests asserting the micro-copy renders (and, if visual, is dismissible or auto-hides) on the defined success condition, in both locales.

### FR-07: Weather-Triggered Shift Alerts — *New, never previously scoped*
* **Requirement:** Collection-shift alerts extend beyond public holidays to weather-driven disruptions (e.g., high-wind warnings affecting bin placement or collection), per `vision.md` §4B: "Smart Holiday **and Weather** Shift Alerts... Wellington's southerlies... disrupt normal routines."
* **Why this is new, not a bug:** `ShiftAlertBanner`/`holiday-shift.ts` (ADR 0030, ADR 0032) implement the holiday half of this vision-doc feature completely and well. The weather half was never scoped as an issue, never built, and never appeared in any prior review because nothing was tracking it as owed.
* **Open question for planning, not this document:** WCC does not appear to publish a structured, machine-readable weather-disruption-to-collection-schedule feed (unlike its public holiday calendar). Planning must first establish whether a real data source exists before design — if none exists, the honest outcome may be an ADR documenting that this vision-doc feature is currently infeasible without a data source, not a built feature. Do not fabricate synthetic weather data to satisfy this requirement.
* **TDD Strategy:** Deferred to planning pending the data-source question above.
* **Status:** Infeasible without a data source — investigated and recorded in ADR
  0074. No structured, machine-readable weather-disruption-to-collection-schedule
  data source exists; `ShiftAlertBanner`/`holiday-shift.ts` remain holiday-only.
  This is a standing product decision, not a pending item awaiting a data source
  that might appear — re-open only if WCC or another authoritative source publishes
  one.

### FR-08: Full Wellington Street & Address Coverage — *New, never previously scoped*
* **Requirement:** `AddressSearch`/`FR-02` should find any real Wellington City street a resident types, not just the 17 curated ones in `db/seeds/01_addresses.js` (5 inner-city, 12 suburban across 5 zones) — matching vision.md's own framing that this app serves "all Wellingtonians," not a demo subset.
* **Why this is new, not a bug:** `prd0.md`'s FR-02 acceptance criteria never named data completeness — a small, hand-picked, individually-WCC-confirmed sample fully satisfied it as written. The gap is real (the large majority of actual Wellington addresses return no result today) but was never flagged because nothing was checking for it.
* **What's actually needed — two genuinely different data problems, researched directly rather than assumed:**
  1. **The street/suburb registry itself** — solved. Toitū Te Whenua LINZ's "NZ Addresses" dataset (`data.linz.govt.nz`) is a real, free, CC-BY-licensed, bulk-downloadable (CSV/GeoJSON, free registered account required) national address dataset that includes every Wellington City street and suburb. This is a legitimate, citable source for `street_name`/`suburb` — not something to fabricate.
  2. **The operational classification per street** (`zone`, `is_inner_city_night_collection`, `recycling_calendar_group`, `collection_weekday`) — **not solved**. No bulk WCC dataset for this was found despite a real search pass (WCC's open data portal has a public-bin-location dataset, not a per-street collection-schedule one). Every one of the 17 rows already in `01_addresses.js` was confirmed individually against WCC's live per-street lookup tool (ADR 0059, ADR 0060, ADR 0063) — there is no shortcut here: the file's own comments document that neighbouring streets in the same zone can have *different* calendar groups and collection weekdays, so classification cannot be assumed from zone or suburb alone.
* **Do not fabricate:** never invent a `zone`/`recycling_calendar_group`/`collection_weekday` value for a street that hasn't actually been checked. This app already has the right shape for "not yet confirmed" (`collection_weekday: null`, `UnresolvedRecyclingCalendarGroupError`, ADR 0068) — extending coverage must use that, not a guessed default. A real address the app can find but describes wrongly is worse than one it honestly can't find yet.
* **Realistic path for planning, not this document:** likely a phased data-acquisition project, not a single PR — (1) bulk-import the full LINZ street/suburb list as the base registry so every real street is at least *findable* by name, with classification fields left genuinely `null`/unconfirmed; (2) reuse the same reverse-engineered per-address lookup approach ADR 0060 already validated to confirm classification incrementally, likely automated given the volume (Wellington has several hundred to low thousands of named streets, not a hand-entry-scale problem); (3) prioritize by suburb population/traffic rather than attempting full coverage in one pass.
* **TDD Strategy:** Deferred to planning — this requirement establishes the two-part shape of the problem and the anti-fabrication constraint, not the exact import/confirmation mechanism.

---

## 4. Non-Functional Requirements (NFR)

### NFR-01: Performance — *Unchanged*
First Contentful Paint (FCP) under 1.5 seconds on mobile 4G networks; Lighthouse Accessibility and Best Practices scores of 100. Already CI-gated (non-blocking job).

### NFR-02: Offline Resilience — *Unchanged*
PWA service worker must cache core assets and user-selected address schedules to allow offline viewing when mobile coverage drops. Already shipped (#29, #30/#118).

### NFR-03: Testing Standards & Quality Assurance — *Unchanged*
Strict TDD; Vitest + CI; merges blocked below 90% coverage. Already enforced via required branch-protection check.

### NFR-04: Success-Metric Instrumentation — *New*
* **Requirement:** The two PRD success metrics named in §1 (push delivery success rate, onboarding time) must be actually measurable, not aspirational prose. At minimum:
  * Log/expose an aggregate delivery-success percentage from the nightly dispatch pipeline (the per-attempt retry/alerting/pruning logic in `dispatch-runner.ts`/`alerting.ts` already exists — this is about surfacing an aggregate number somewhere reviewable, not new delivery logic).
  * Instrument time-to-first-successful-schedule-lookup from initial page load, in a way that respects the existing no-telemetry-by-default posture (this is a prototype for a council service; do not introduce third-party analytics without an explicit decision — an ADR should record whether this is self-hosted, sampled, or opt-in).
* **Why this is new:** confirmed via code search — no analytics/telemetry package exists in this codebase (`package.json` has none), and no dispatch-outcome aggregation exists beyond per-run logging. The metrics have been unmeasurable since v0.2 was written.
* **TDD Strategy:** Deferred to planning — this requirement is about establishing *that* instrumentation must exist and *what* it must not do (no third-party analytics without a recorded decision), not prescribing the exact mechanism.

---

## 5. Out of scope for v1

Explicitly not requirements of this document — do not infer them from adjacent items:

* Re-litigating any decision recorded in an existing accepted ADR that isn't named above (e.g. the recycling-week epoch anchor, ADR 0042; the dispatcher's per-address gating on `collection_weekday`, tracked separately as issue #144).
* A human-operated WCAG screen-reader pass (FR-03) and a fluent Te Reo Māori speaker review of the sorting-search content (FR-05) — both are explicitly not a near-term concern for this prototype, not on any particular horizon. A future PRD pass should not restore either to active scope without a genuine change in circumstances (e.g. this app leaving prototype status entirely).
* New locales beyond English/Te Reo Māori.
* Native mobile apps — this remains a PWA by design (vision.md §5).
