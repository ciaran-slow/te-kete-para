# ADR 0073: Nightly dispatcher gates on confirmed `collection_weekday`; unconfirmed is a visible no-op

- **Status:** accepted
- **Date:** 2026-08-07
- **Issue:** #144

## Context

Issue #134 (ADR 0066) wired `isCollectionDay`/`findNextCollectionDate` (ADR
0063, `src/lib/schedule/collection-day.ts`) into `<ScheduleDisplay>` and
`<ShiftAlertBanner>`, restoring a genuine per-address collection-day claim in
the UI, but deliberately left `src/lib/notifications/dispatcher.ts`
untouched: its nightly dispatch decision
(`collectNightlyDispatchCandidates`/`planDispatchForSubscription`) still sent
every suburban subscriber a "tomorrow" push as long as they had a resolvable
zone classification, regardless of whether tomorrow was genuinely that
street's real collection day. `docs/architecture.md` and the function's own
doc comment already recorded this as "a known simplification, not a hidden
bug ... a future per-street collection calendar ... would gate here too, once
it exists." That data (`addresses.collection_weekday`, ADR 0063) now exists;
this issue wires it in.

ADR 0068 (issue #131) already established a precedent for this exact shape of
problem on a sibling field: an unresolved `recyclingCalendarGroup` silently
excluded a subscription from every future nightly run with no log line
anywhere, which #131 fixed by giving `rules.ts` a named
`UnresolvedRecyclingCalendarGroupError` subclass so `dispatcher.ts` could log
that one specific rejection reason. ADR 0068's own "Cons" section explicitly
anticipated a future issue needing "the same distinguishing power for a
different rejection" — the concern this issue's own dispatcher-gating work
now runs into directly.

## Decision

Extend `DispatchRow`/`DispatchSubscription`
(`src/lib/notifications/dispatcher.ts`) with `collection_weekday`/
`collectionWeekday`, selected in the same left-join query that already reads
`zone`/`is_inner_city_night_collection`/`recycling_calendar_group`, narrowed
via the existing `toCollectionDayClassification`
(`src/lib/schedule/collection-day.ts`) rather than reimplementing its 0-6
validation inline.

In `planDispatchForSubscription`, after a zone classification's rule set has
already resolved (the existing `recyclingCalendarGroup` handling is
unchanged), build a `CollectionDayClassification` from
`zone.isInnerCityNightCollection` and the subscription's `collectionWeekday`,
then:

- An inner-city-night-collection subscriber is always eligible past this
  point (collects every night) — unaffected, matching the issue's explicit
  acceptance criterion.
- A suburban subscriber with `collectionWeekday === null` (unconfirmed) is
  treated as a no-op, but — unlike the plain "no linked address" no-op — logs
  a `console.error("[dispatcher] ...")` line naming the subscription and
  `collectionWeekday`, using the exact same visibility reasoning ADR
  0068/#131 established for `recyclingCalendarGroup`: this is a permanent,
  per-address data gap that would otherwise silently exclude a subscriber
  from every future nightly run until someone confirms the field, not a
  today-specific fact about the world.
- A suburban subscriber with a confirmed `collectionWeekday` is gated via
  `isCollectionDay(classification, tomorrow)`: a non-matching day is a
  **silent** no-op — this is not a data gap, it is the address correctly not
  being due tomorrow, the exact case this issue exists to stop from firing.

No changes to `src/lib/schedule/collection-day.ts`. The guard that keeps
`isCollectionDay` from ever throwing (it throws only for a suburban
classification with a null weekday) is a plain `if` in `dispatcher.ts`,
checked *before* calling it — not a new named-error subclass mirroring
`UnresolvedRecyclingCalendarGroupError`. See Alternative D below for why.

**Known limitation, deliberately not fixed here:** `isCollectionDay` compares
tomorrow's *actual* weekday against the address's *nominal* `collectionWeekday`
and has no awareness of `src/lib/schedule/holiday-shift.ts`'s
`computeHolidayShift` — a gap that predates this issue (`dispatcher.ts` never
called `computeHolidayShift`) but was inert before this change, since the
old "fire every night" behaviour happened to still cover a holiday-shifted
collection date by accident. Now that dispatch is gated on nominal weekday
match, a holiday-shifted collection (e.g. a Thursday collection pushed to the
following Saturday, ADR 0038) gets this backwards: a push still fires the eve
of the holiday itself (nominal weekday matches, nothing is actually
collected that day) and no push fires the eve of the real shifted Saturday
collection (nominal weekday doesn't match, even though that is the address's
real collection day that week). This is the same failure class issue #144's
own "Why" describes, just from the holiday-shift axis rather than the
day-of-week axis, and it also desyncs the dispatcher from `<ShiftAlertBanner>`,
which does apply the shift. Filed as issue #185, tracked separately rather
than folded in here — teaching `dispatcher.ts` about `computeHolidayShift`
needs its own DB read (`holidays`), its own test fixtures against the seeded
2026 holiday rows, and a decision about how far ahead of the holiday to
start gating on the shifted date instead of the nominal one, none of which
this issue's scope (or plan) anticipated.

## Alternatives considered

### A (chosen): visible `console.error` no-op for unconfirmed `collectionWeekday`, silent no-op for a confirmed non-match

- **Pros:** Closes the exact bug named in the issue's "Why" (a suburban
  resident silently stops/keeps getting a "collection tomorrow" push
  incorrectly) while reusing ADR 0068's already-accepted visibility pattern
  for the *same class* of problem (a permanent per-address confirmation gap)
  on a different field, rather than inventing new conventions.
- **Cons:** Two distinct rejection reasons now log, not one; a future reader
  of `dispatcher.ts` needs to know both exist. Documented explicitly in the
  updated `docs/architecture.md` §2B paragraph to avoid this becoming tribal
  knowledge.

### B: silent no-op for unconfirmed `collectionWeekday`, no logging

- **Pros:** One fewer branch; a literal reading of the issue's own "likely
  the same no-op treatment as an unresolvable zone" wording, and the
  "unresolvable zone" (`zone: null`) case is itself silent today.
- **Cons:** Reproduces exactly the "no log line anywhere" gap ADR 0068/#131
  fixed for `recyclingCalendarGroup` — `collectionWeekday` is the same shape
  of per-address confirmation gap on the same table, and a silent, permanent
  exclusion here is worse than a one-off missed push: it recurs indefinitely
  with zero operator visibility, exactly the failure mode #131 was filed to
  close. Rejected.

### C: treat unconfirmed (`null`) `collectionWeekday` as always-eligible (dispatch anyway, i.e. today's behaviour)

- **Pros:** Never suppresses a legitimate notification just because
  per-address backfill hasn't happened yet for a newly seeded address.
- **Cons:** Directly reintroduces the exact bug this issue exists to close,
  and does so specifically for the addresses most likely to need the fix —
  any future not-yet-confirmed row. Every currently-seeded suburban address
  is already fully confirmed (ADR 0063), so this alternative would only ever
  protect a hypothetical future row, at the cost of guaranteeing that row
  repeats the false-positive-tomorrow-push bug for as long as it stays
  unconfirmed. Rejected — contradicts the issue's own stated purpose.

### D: add a named error subclass to `collection-day.ts` (mirroring `UnresolvedRecyclingCalendarGroupError`) and branch on `instanceof` in a try/catch, instead of a pre-check `if`

- **Pros:** Exactly the extensibility path ADR 0068's own "Cons" section
  anticipated for a future issue needing "the same distinguishing power for
  a different rejection."
- **Cons:** `rules.ts` needed a named subclass because *only* `rules.ts`
  knows the exact validation condition for `recyclingCalendarGroup`, and two
  separate callers (`schedule-display.tsx`, `dispatcher.ts`) both need to
  distinguish that one rejection reason from `rules.ts`'s two other throw
  sites without duplicating its condition (ADR 0068's own rejected
  Alternative A). Here, `dispatcher.ts` is `collection-day.ts`'s only caller
  and already has direct, cheap access to the exact condition
  (`collectionWeekday === null && !isInnerCityNightCollection`) without
  needing to catch anything — adding a throw-and-catch path (and a second
  named-error export) for a condition a plain `if` already checks correctly
  is unneeded indirection. Rejected as unnecessary complexity for a
  single-caller check; revisit if a second caller ever needs the same
  distinction from `collection-day.ts` and a shared pattern becomes worth the
  duplication tradeoff.

## Trade-offs and consequences

Suburban subscribers now only receive a "collection tomorrow" push on a day
whose weekday matches their real, confirmed collection day — closing the bug
named in issue #144's "Why" for the ordinary weekly cycle, which is every
week of the year except the three 2026 holiday weeks (ADR 0038). Every
currently-seeded suburban address is already confirmed (ADR 0063), so no
currently-seeded subscriber's nightly notification volume changes *in a
non-holiday week*; only a future, not-yet-confirmed suburban address would
newly no-op (visibly, via `console.error`, not silently) instead of
continuing to fire every night the way today's dispatcher would for a
hypothetical unconfirmed row. In the New Year's Day holiday week
specifically, this issue's own gate is now wrong in both directions for the
7 currently-seeded `collection_weekday: 4` (Thursday) addresses — Good
Friday and Christmas Day both fall on a Friday in 2026 and no address is
seeded with `collection_weekday: 5`, so those two holiday weeks affect zero
currently-seeded addresses this year, though a future Friday-collection
address would hit the same bug there too. See the "Known limitation"
callout above and issue #185, filed to track the fix. Revisit trigger:
issue #185 landing (`dispatcher.ts` gaining holiday-shift awareness), and —
independently of that — the "unconfirmed" branch should stay unreachable in
practice for any address seeded going forward, under the same
confirm-before-seed discipline ADR 0063 and ADR 0059 both already
established for their own fields. If a second `collection-day.ts` caller
ever needs to distinguish "unconfirmed" from other rejection reasons the way
`dispatcher.ts` now can via a plain `if`, Alternative D above should be
revisited.
