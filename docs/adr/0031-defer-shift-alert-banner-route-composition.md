# ADR 0031: Build the shift-alert banner now, defer composing it into a live route

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #24

## Context

`docs/architecture.md` §2C's `holidays` bullet and issue #78 (open) state
explicitly that #78 blocks #23/#24 "surfacing holiday shift alerts to real
users": the seeded 2026 calendar (`db/seeds/03_holidays.js`) is flagged
`UNVERIFIED CONTENT` — the exact set of WCC-observed collection-shifting
holidays isn't confirmed against WCC's own published calendar (candidate
missing rows: Wellington Anniversary, Waitangi Day, Easter Monday, ANZAC Day
observed, Matariki, Labour Day), and the `name_mi` values are an unreviewed
machine-translated draft. This app deploys straight from `main`
(architecture.md §1), so merging any change that renders
`<ShiftAlertBanner>` from a route reachable by a real resident is
equivalent to shipping that unverified calendar as a live, affirmative claim
("your collection has shifted") — a stronger claim than passively displaying
unverified reference data, which is what #21/`<SortingSearch>` faced from
#69/#70. ADR 0028 already set the precedent for exactly this shape of block.

## Decision

Build `<ShiftAlertBanner>` (`src/components/shift-alert-banner.tsx`), its
pure `findUpcomingShift` helper, `GET /api/holidays`
(`src/app/api/holidays/route.ts`), and their full test suites in this PR.
Do **not** import or render `<ShiftAlertBanner>` from
`src/app/address-schedule.tsx`, `src/app/page.tsx`, or any other route.
#24's acceptance criterion ("component test asserts the alert renders only
when a shift applies") is satisfied entirely by Testing-Library tests that
render the component directly — the same way
`__tests__/components/sorting-search.test.tsx` satisfies #21's equivalent
criterion today. Wiring `<ShiftAlertBanner>` into `address-schedule.tsx`
alongside `<ScheduleDisplay>` is a small, mechanical follow-up once #78
closes.

## Alternatives considered

### A. Build fully, leave unwired from any route (chosen)
- **Pros:** fully reviewable, tested, and mergeable now with zero risk of
  shipping an unconfirmed holiday calendar as a live user-facing claim
  (merging changes nothing a resident can reach); mirrors the already-
  accepted ADR 0028 precedent, so reviewers apply one consistent rule
  instead of re-deciding it; the follow-up to wire it in is small and
  mechanical.
- **Cons:** the feature isn't usable by anyone until a second, small PR
  lands; a reviewer must know to check that no route renders it (mitigated:
  `git grep -n "ShiftAlertBanner"` outside `src/components/shift-alert-banner.tsx`
  and its test file should show nothing under `src/app/`, and this ADR
  records the expectation explicitly for that check).

### B. Wire it in behind a feature flag / environment variable
- **Pros:** composition code ships now; flipping a flag later is small.
- **Cons:** same rejection as ADR 0028's Alternative B — the actual problem
  is the *content's confirmation status*, not the *code path*; a flag adds
  its own removal-tracking burden to guard against the same single failure
  mode (someone forgets to check it) that simply not rendering the
  component already avoids for free.

### C. Do not build any of it until #78 closes
- **Pros:** avoids any chance of the block being misjudged.
- **Cons:** contradicts being handed #24 to plan/build now; the component
  and endpoint carry no user-facing risk while nothing renders them — only
  rendering from a route does.

### D. Wire it in but caveat the banner text itself ("unconfirmed — check WCC directly")
- **Pros:** ships something visible now.
- **Cons:** a "might be wrong" proactive alert undermines the entire point
  of vision.md §4B ("issues proactive alerts") — a resident who can't trust
  the alert has no reason to act on it, which is arguably worse than no
  banner at all; it also still requires #78's row-by-row confirmation
  before the caveat could ever be removed, so it doesn't shorten the real
  path to "done."

## Trade-offs and consequences

This PR ships a component and an endpoint nobody can reach yet. The
follow-up (wire `<ShiftAlertBanner>` into `address-schedule.tsx`) must
happen once #78 closes, or the feature stays invisible despite being fully
built — revisit-trigger: close of #78.
