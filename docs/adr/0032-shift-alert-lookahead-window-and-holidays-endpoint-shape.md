# ADR 0032: Shift-alert banner — 7-day client-computed lookahead window over an unfiltered `/api/holidays`, fetched from an effect gated on address selection

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #24

## Context

`<ShiftAlertBanner>` needs to answer "does a public holiday fall soon
enough to affect this resident's next collection?" using
`computeHolidayShift(date, holidays)`
(`src/lib/schedule/holiday-shift.ts`), a pure function of one calendar date.
Three things need deciding that echo ADR 0019's territory without fully
resolving the same way:

1. **How far ahead to check.** ADR 0019 explicitly declined to build a
   scanned "next collection date" for `<ScheduleDisplay>`, because nothing
   in `ZoneClassification`/`addresses`/`CollectionRuleSet` marks a candidate
   date as a real collection day for a given street — every suburban day
   currently returns a non-null rule set regardless. That constraint
   applies here too, but not fatally: `holidays` is council-wide (ADR
   0029), so "is any of the next N days a public holiday" doesn't need
   per-street collection-day data at all — it's exactly as well-founded a
   question for day+6 as it is for today, which is all ADR 0019 was
   willing to answer.
2. **Where holiday data comes from.** This is the first client-visible
   dataset in the app that doesn't depend on the selected address (ADR
   0029: no FK from `holidays` to `addresses`), unlike
   `computeCollectionRuleSet`'s zone-classification input.
3. **Whether a `useEffect` is allowed.** ADR 0018's Alternative C ruled out
   a `useEffect` + `setState` mount-flag pattern, but for a different
   reason (avoiding a guaranteed hydration flash for a value computable
   synchronously). This app's only two existing fetching components,
   `AddressSearch` and `SortingSearch`, both fetch from an `onChange`
   handler because their fetch is triggered by a keystroke — neither has
   ever needed to fetch in reaction to a *prop* becoming non-null.

## Decision

**Lookahead window:** `findUpcomingShift(todayUtc, holidays)`
(`src/components/shift-alert-banner.tsx`) scans exactly 7 calendar days —
`todayUtc` through `todayUtc + 6` days, inclusive — calling
`computeHolidayShift` on each candidate date and returning the earliest one
where `isShifted` is `true`, together with the matching `holidays` row (for
its bilingual name) and `computeHolidayShift`'s fully chain-resolved
`shiftedDate` (ADR 0030).

**Holidays endpoint:** `GET /api/holidays` (`src/app/api/holidays/route.ts`)
takes no query parameters and returns every row in the `holidays` table,
camelCase-mapped (`{ date, nameEn, nameMi, shiftDays }`, ADR 0013), ordered
by `holiday_date` ascending. No server-side date filtering.

**Fetch mechanism:** `<ShiftAlertBanner>` fetches from a `useEffect` keyed
on `address === null ? null : address.id`. The effect returns immediately
when that key is `null`, so the request only ever fires after a real
client-side `AddressSearch.onSelect` callback — never during any render
reachable by SSR, the same gating property ADR 0018 established for
`ScheduleDisplay`'s `now` computation. `setState` calls happen inside the
fetch promise's `.then()`/`.catch()` callbacks, not synchronously in the
effect body, so `react-hooks/set-state-in-effect` (error-level in this
repo's ESLint config, verified via `npx eslint --print-config`) does not
fire: that rule's implementation
(`eslint-plugin-react-hooks`'s `validateNoSetStateInEffects`) only flags a
`setState` call reachable synchronously as one of the effect's own
instructions, not one nested inside a `.then()` callback's separate
function body.

## Alternatives considered

### A. 7-day window, unfiltered endpoint, effect-based fetch (chosen)
- **Pros:** stays inside ADR 0019's own standard for what this data model
  honestly supports; the endpoint is a two-line query with no new
  pagination contract to design; effect-based fetch is the standard,
  doc-endorsed pattern
  (`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`,
  "Client Components" section) for a Client Component reacting to a prop
  change, and is not blocked by any rule in this repo's ESLint config.
- **Cons:** 7 days is a product judgment call with no PRD-specified number;
  changing it later is a one-constant follow-up if product feedback
  disagrees.

### B. Today-only window (mirrors ADR 0019 exactly)
- **Pros:** zero new judgment call — reuses ADR 0019's reasoning verbatim.
- **Cons:** defeats "**proactive** alerts" (vision.md §4B) — a resident
  would only ever see the banner on the holiday itself, the one day they
  need it least (their bins already didn't go out, or did, by the time they
  read it).

### C. Server Component fetch + `use()` + `<Suspense>` (this fork's docs'
"Streaming data with the `use` API" pattern)
- **Pros:** no client-side effect at all; matches the newest recommended
  data-fetching pattern documented for this fork.
- **Cons:** introduces async Server Components and `<Suspense>` boundaries
  to a codebase that has neither yet, purely to fetch a 5-row reference
  table — disproportionate new architectural surface for this issue's
  scope, and this repo's Vitest+jsdom setup has no existing precedent for
  testing a `use()`-suspending Client Component. Left for a future issue if
  a heavier data-fetching need ever justifies introducing the pattern.

### D. Add a `?from=`/`?days=` date-range query parameter to `/api/holidays` now
- **Pros:** smaller response payload; server enforces the window instead of
  the client.
- **Cons:** the table holds ~5 rows for all of 2026 — the parameter would
  save bytes nobody can measure. The client also needs holiday rows
  *before* the window's start to resolve chains (ADR 0030: a chain's second
  date, e.g. Day-after-New-Year, can start outside a window whose first day
  is New Year's Day itself, but a window that instead starts one day later
  would miss the chain's trigger row entirely) — supporting that server-side
  would mean either shipping two different filtered sets or duplicating
  `computeHolidayShift`'s chain-walk in the query layer. Rejected as
  complexity with no present payoff.

## Trade-offs and consequences

Accepted: the 7-day figure is a product guess, not a PRD number — revisit
if user feedback or a future issue specifies a different lead time.
Accepted: `/api/holidays` returns its entire table on every call with no
caching or filtering — fine at 5–50 rows/year; revisit (Alternative D) if
the table grows enough for this to become a real payload concern.  This is
the first effect-based data fetch in the codebase (as opposed to a fetch
triggered from an event handler); the next component that needs the same
"fetch when a prop becomes available" shape should follow this ADR rather
than re-litigating the `set-state-in-effect` question from scratch.
