# ADR 0077: Nightly dispatcher resolves a holiday-shifted real collection date, scanning the full `holidays` table instead of a fixed lookahead window

- **Status:** accepted
- **Date:** 2026-08-07
- **Issue:** #185

## Context

ADR 0073 (issue #144) gated `planDispatchForSubscription`
(`src/lib/notifications/dispatcher.ts`) on `isCollectionDay`, comparing
tomorrow's actual NZ weekday against a suburban address's confirmed
`collectionWeekday` (ADR 0063). That gate has never been aware of
`src/lib/schedule/holiday-shift.ts`'s `computeHolidayShift` — a gap ADR
0073 explicitly recorded as a "Known limitation, deliberately not fixed
here" and filed as this issue.

Before #144, the gap was inert: the dispatcher fired every night for every
resolvable suburban subscriber regardless of weekday, so it happened to
still cover a holiday-shifted collection date by accident (alongside also
firing, wrongly, on the holiday date itself). Gating on nominal-weekday
match turns that into an active bug, verified against the real seeded 2026
data (`db/seeds/03_holidays.js`): New Year's Day (2026-01-01, a Thursday)
shifts 2 days to Saturday 2026-01-03. All 7 currently-seeded
`collection_weekday: 4` addresses get a wrong push on 31 Dec (nothing is
collected 1 Jan) and no push on 2 Jan (for the real Saturday collection).
It also desyncs the dispatcher from `<ShiftAlertBanner>`
(`src/components/shift-alert-banner.tsx`), which already applies
`computeHolidayShift` correctly (ADR 0066).

Two things needed deciding, both named explicitly in the issue: what
"tomorrow" means for gating purposes when a holiday shift is in play (does
the dispatcher need to look further than one day ahead, and how far), and
whether this fix's scope extends to inner-city-night-collection dispatch,
which ADR 0073 left permanently "always eligible" and which never compares
against `collectionWeekday` at all.

## Decision

Add `isRealCollectionDay(classification, date, holidays)` to
`src/lib/notifications/dispatcher.ts` (not to `collection-day.ts` or
`holiday-shift.ts` — both stay pure and mutually unaware, exactly like
`<ShiftAlertBanner>`'s own `findUpcomingShift` composes them at the
component layer rather than merging them into either lib module, ADR
0015's split). It corrects `isCollectionDay`'s plain nominal-weekday check
in both directions this issue's "Why" identified:

- If `date` is itself a listed holiday (`computeHolidayShift(date,
  holidays).isShifted`), it is never a real collection day, regardless of
  whether its own weekday nominally matches `collectionWeekday` — the
  collection is delayed, not skipped.
- If `date` doesn't nominally match but is the chain-resolved (ADR 0030)
  shifted date of some *other* listed holiday whose own weekday does match
  `collectionWeekday`, it is a real collection day — the delayed
  collection this address is actually due for that week.
- Inner-city-night-collection is always eligible, unaffected by any of the
  above — see Alternative D.

`isRealCollectionDay` checks `date` against every row in the `holidays`
array passed to it, not a fixed number of days ahead or behind `date` —
see Alternative B for why a window constant was rejected.

`planDispatchForSubscription` gains a third parameter,
`holidays: HolidayRecord[] = []`, used as `isRealCollectionDay`'s third
argument in place of the old direct `isCollectionDay` call. The `= []`
default keeps every existing caller (all of this file's own pre-#185
tests) compiling and behaving identically — `computeHolidayShift(x, [])`
never shifts anything, so `isRealCollectionDay` degrades exactly to
`isCollectionDay` when no holiday data is supplied, the same explicit-input
pattern ADR 0015 established for `computeCollectionRuleSet`.
`collectNightlyDispatchCandidates` reads the entire `holidays` table once
per nightly run (mirroring `src/app/api/holidays/route.ts`'s own query
shape) and passes the mapped `HolidayRecord[]` into every
`planDispatchForSubscription` call in its loop, rather than querying it
once per subscription.

## Alternatives considered

### A (chosen): whole-`holidays`-table scan inside a new `isRealCollectionDay`, `planDispatchForSubscription` gains a `holidays` param defaulting to `[]`

- **Pros:** No arbitrary day-count constant to justify or later relitigate;
  correctness is bounded by the `holidays` table's own (small) size, which
  ADR 0032 already established is fetched in full for the same underlying
  reason. Reuses the explicit-input pattern already established for every
  other pure schedule function (`computeCollectionRuleSet`,
  `computeHolidayShift`, `isCollectionDay`), so `isRealCollectionDay` is
  directly unit-testable without a DB or a fake clock offset scheme.
  Existing callers keep working unmodified via the `= []` default.
- **Cons:** Every call to `isRealCollectionDay` re-validates and re-walks
  the `holidays` array (via `computeHolidayShift`'s internal validation
  loop) rather than validating once per nightly run; at the table's actual
  size (single digits to low tens of rows per year) this is not a measurable
  cost, but it would not scale to a table with thousands of rows without
  hoisting validation out.

### B: fixed day-count lookahead/lookback window (mirroring `<ShiftAlertBanner>`'s `LOOKAHEAD_DAYS = 6`, ADR 0032)

- **Pros:** Reuses an already-accepted, already-understood constant instead
  of introducing a new "how far" question; a fixed window is trivially
  cheap regardless of `holidays` table size.
- **Cons:** `LOOKAHEAD_DAYS` bounds a genuinely arbitrary UX judgment call
  (how many days in advance to warn a resident) — there is no equivalently
  arbitrary "how many days can a holiday shift reach" answer for the
  dispatcher's correctness question; picking one (say, 7) would be an
  unjustified magic number that happens to cover the currently-seeded
  `shiftDays` values (1–2) only by coincidence, and would silently
  under-cover a future holiday whose `shift_days` (a plain, uncapped
  integer column, `db/migrations/20260803090000_create_holidays.js`)
  exceeds the window. Rejected: the whole-table scan is no more expensive
  in practice and has no such ceiling.

### C: precompute a single resolved boolean/date for "tomorrow" inside `collectNightlyDispatchCandidates` and pass that into `planDispatchForSubscription`, instead of passing the raw `holidays` array through

- **Pros:** `planDispatchForSubscription` wouldn't need to know about
  `holidays` at all, arguably a narrower interface.
- **Cons:** Breaks the pattern every other decision this function already
  makes follows: `zone`, `collectionWeekday`, and now `holidays` are all
  explicit, DB-free inputs to a pure function, directly assertable in a
  unit test without going through `collectNightlyDispatchCandidates`'s DB
  path. Precomputing "is tomorrow real" once and threading a bare boolean
  through would also silently assume every subscriber shares the same
  answer for "tomorrow," which is false — the answer depends on each
  subscriber's own `collectionWeekday`. Rejected.

### D: also suppress inner-city-night-collection dispatch on a listed holiday's own date

- **Pros:** WCC's published policy quote ("Rubbish and recycling are not
  collected on: Christmas Day, New Year's Day, Good Friday") doesn't
  explicitly carve out inner-city collection, so this might be operationally
  correct too.
- **Cons:** No seeded fixture or prior issue confirms inner-city nightly
  collection actually pauses on these dates — unlike the suburban
  Thursday-address bug, which is directly provable against real seed data
  (7 currently-seeded addresses, a concrete wrong-push/missed-push pair).
  This issue's own Scope section frames the fix as resolving the real
  collection date "before comparing against `collectionWeekday`" —
  inner-city dispatch never performs that comparison at all (ADR 0073 left
  it unconditionally eligible), so extending holiday-awareness there is a
  new behaviour change with no confirmed policy backing and no test data to
  validate it against, not a narrower cut of this issue's proven bug.
  Rejected for this issue; revisit if inner-city holiday closures are ever
  confirmed against WCC's live tooling the way `collection_weekday` was
  (ADR 0063).

## Trade-offs and consequences

The 7 currently-seeded Thursday-collection addresses now correctly get no
push on 31 Dec (eve of New Year's Day) and a correct push on 2 Jan (eve of
the real 3 Jan Saturday collection), closing the exact bug ADR 0073's
"Known limitation" callout named. Good Friday and Christmas Day both fall
on a Friday in 2026 with no seeded `collection_weekday: 5` address, so
(per ADR 0073's own already-corrected wording) this fix's only currently-
observable effect is on the New Year's Day week; a future Friday-collection
address would be covered by the same mechanism without further change.

Accepted: a malformed `holidays` row (failing `computeHolidayShift`'s
validation) now rejects the *entire* nightly dispatch run, not just the
one subscription it would conceptually affect, because `holidays` is read
once per run and shared across every subscriber — a stricter blast radius
than the existing per-subscription `UnresolvedRecyclingCalendarGroupError`
handling (ADR 0068). This mirrors `collectNightlyDispatchCandidates`'s
existing "rejects on a query failure rather than swallowing it" stance for
its `push_subscriptions` query (a global data problem should be loud, not
silently partial), and is unlikely in practice: `holidays.holiday_date` is
a DB-level `unique` `date` column and `shift_days` defaults to `1`
(`db/migrations/20260803090000_create_holidays.js`), so a row reaching
`computeHolidayShift` malformed would itself indicate a deeper data
problem worth stopping the run for.

Inner-city-night-collection dispatch remains completely unaffected by
holiday shifts (Alternative D) — a deliberately narrower cut than
`<ShiftAlertBanner>`, which does flag an inner-city address's own selected
schedule for an upcoming holiday shift in its display-only 7-day lookahead.
This is an accepted, documented inconsistency between the dispatcher and
the banner for inner-city addresses specifically (never for suburban ones,
where both are now equally holiday-aware). Revisit trigger: WCC inner-city
holiday-closure policy is confirmed and worth dispatching on.
