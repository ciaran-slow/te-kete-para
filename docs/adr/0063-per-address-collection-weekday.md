# ADR 0063: Per-address `collection_weekday` closes the per-street collection-day gap

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #117

## Context

ADR 0019 (issue #14) established that nothing in `addresses`/`schedules`/
`CollectionRuleSet` marks a given calendar date as a real collection day for
a specific street — every suburban day currently returns a non-null rule
set from `computeCollectionRuleSet`, so there was no honest way to answer
"is this actually my collection day" for one address. ADR 0053 (issue #83)
hit the same gap from `<ShiftAlertBanner>`'s side and narrowed its wording
to a council-wide statement rather than build this out, explicitly deferring
to this issue.

WCC's live per-street lookup tool — the same two endpoints ADR 0059/issue
#102 already documented and used (`RubbishCollectionStreetsHandler.ashx` for
street → `streetId`, then `collection-search-results?streetId=` for the
actual schedule page) — directly answers "what weekday is this street's
collection," reachable by plain `curl` with a realistic browser
`User-Agent`. Querying both endpoints for all 12 currently-seeded suburban
addresses (fetched 2026-08-05) gives a fully sourced weekday for every one
of them:

| Street, suburb | Zone | WCC weekday | `collection_weekday` |
| --- | --- | --- | --- |
| Marjoribanks Street, Mount Victoria [^1] | zone-east | Thursday | 4 |
| Hataitai Road, Hataitai | zone-east | Thursday | 4 |
| Oriental Parade, Oriental Bay | zone-east | Thursday | 4 |
| Riddiford Street, Newtown | zone-south | Thursday | 4 |
| Constable Street, Newtown | zone-south | Thursday | 4 |
| The Parade, Island Bay | zone-south | Thursday | 4 |
| Adelaide Road, Mount Cook | zone-south | Thursday | 4 |
| Karori Road, Karori | zone-west | Wednesday | 3 |
| Kelburn Parade, Kelburn | zone-west | Tuesday | 2 |
| Brooklyn Road, Brooklyn | zone-west | Wednesday | 3 |
| Tinakori Road, Thorndon | zone-north | Tuesday | 2 |
| Broderick Road, Johnsonville | zone-north | Monday | 1 |

[^1]: Queried via its suburban house-number segment (streetId 8070, "odds
  15-109, evens 20-104"), the same segment ADR 0059 used for this row's
  `recycling_calendar_group` — not the low house-number segment that is
  actually inner-city collection (issue #125).

The 5 CBD rows get `collection_weekday: null` — they are nightly
inner-city collection (every night, not one weekday), the same reasoning
`recycling_calendar_group: null` already uses for these rows. Two of the
four suburban zones are **not** internally uniform: zone-west mixes
Tuesday (Kelburn Parade) with Wednesday (Karori Road, Brooklyn Road), and
zone-north mixes Monday (Broderick Road) with Tuesday (Tinakori Road) —
independent of, and additional to, ADR 0059's separate finding that
zone-south/zone-west/zone-north each mix recycling-calendar groups.

## Decision

Add a nullable `collection_weekday` integer column to `addresses` (0-6,
`Date#getUTCDay()` convention: 0 = Sunday ... 6 = Saturday), confirmed
per-address exactly like `recycling_calendar_group` already is (ADR 0059) —
not derived from `zone`. `null` for every CBD/inner-city-night-collection
row (which collects every night, not one weekday) and for any suburban
address not yet confirmed.

Add a new pure module, `src/lib/schedule/collection-day.ts`, exporting
`CollectionDayClassification` (`{ isInnerCityNightCollection,
collectionWeekday }`), `toCollectionDayClassification` (raw-row →
classification mapping), and two pure functions:
`isCollectionDay(classification, date)` — is this date a genuine collection
day for this address — and `findNextCollectionDate(classification,
fromDate)` — the next real collection date on or after `fromDate`,
inclusive. Both take no DB dependency, mirroring
`computeCollectionRuleSet`/`computeHolidayShift`'s explicit-input pattern
(ADR 0015); both reject a suburban classification with a missing/invalid
`collectionWeekday` with a `RangeError` rather than guessing, matching ADR
0059's "rejected unknown is safer than a silently wrong assumption" stance.
Both read only the UTC calendar date of any `Date` passed in (ADR 0017).

This issue and PR stop here — at the data + pure-function layer. Consuming
`isCollectionDay`/`findNextCollectionDate` inside `<ScheduleDisplay>` (ADR
0019) and `<ShiftAlertBanner>` (ADR 0053) to restore a genuine per-address
claim, and deciding whether `src/lib/notifications/dispatcher.ts`'s nightly
dispatch decision should also gate on this data, is issue #134 — already
filed, and explicitly scoped to own exactly that work — not this one.
`SuburbSearchResult`, the `localStorage` address cache, and the dispatcher's
`addresses` join are therefore deliberately left untouched here; #134 will
thread `collection_weekday` through whichever of those its own consuming
work actually needs, the same way ADR 0059 threaded
`recycling_calendar_group` through every layer that needed it in one pass —
but that thread has no current consumer yet, so doing it now would be
speculative plumbing for a caller that doesn't exist in this PR.

### A note on this ADR's number

This issue's number was originally reserved as 0060 (recorded in
`.workmux/PROMPT-117-per-street-collection-day-data.md` and in issue #134's
own body), based on `origin/main` being at 0059 at the time. Before this
issue was built, it became clear that three concurrently-running,
not-yet-merged lanes had already committed ADRs at 0060 (#119,
`aerosol-can-disposal-split-sourced-via-wcc-search-tool-api`), 0061 (#122,
`nightly-dispatch-retry-backoff-and-webhook-alerting`), and 0062 (#126,
`resubscribe-push-toggle-on-address-change`) on their own branches — none
visible from `origin/main` yet, since none had merged. This ADR uses 0063
instead. `.workmux/PROMPT-117-...md` and issue #134's body still say 0060;
that is a stale artifact of when they were written, not corrected by this
PR.

## Alternatives considered

### A: Populate the `schedules` table with real per-street calendar rows

- **Pros:** uses the already-migrated table exactly as ADR 0019's own text
  anticipated ("seeding `schedules` with real WCC calendar data"); its
  `is_holiday_override`/`original_date` columns already model per-date
  overrides, which a real calendar will eventually need.
- **Cons:** WCC's real per-street collection day is a fixed **weekly
  recurrence** (a day-of-week), not a finite list of specific calendar
  dates. `schedules.collection_date` is a single `DATE` column suited to a
  bounded calendar (like the 3-row `holidays` table) — representing "every
  Wednesday, forever" there would mean inserting one row per street per
  future collection date, an unbounded, perpetually-stale reseeding
  problem with no natural end date, or building an "expand a weekly rule
  into concrete dates" layer that doesn't exist and is out of this issue's
  scope. Rejected: wrong shape for the actual data.

### B: A `collection_weekday` value per `zone`, not per `addresses` row

- **Pros:** smaller data footprint (5 zone values vs. 12+ address values);
  matches the issue's literal "at least per-zone, if that's what the data
  supports" fallback text.
- **Cons:** directly contradicted by the sourced data — zone-west and
  zone-north each mix weekdays across their own seeded streets (table
  above). Picking one value per zone would be correct for some of that
  zone's addresses and wrong for others — the exact failure mode ADR 0059
  already rejected for `recycling_calendar_group`, now confirmed on a
  second, independent axis of the same zone taxonomy.

### C (chosen): Per-address `collection_weekday` column, with pure query functions and no wired consumer yet

- **Pros:** matches real WCC granularity exactly, mirrors ADR 0059's
  already-accepted `recycling_calendar_group` pattern; every currently
  seeded suburban address is fully confirmable today via the live lookup
  tool; keeps this issue to a single, reviewable PR by stopping before the
  larger, separately-tracked (#134) consuming-component work.
- **Cons:** no user-visible behaviour changes yet — the practical benefit
  of this PR alone is a closed data gap and a tested query path, not a
  shipped product improvement; that lands with #134. Same per-address
  seeding discipline burden as ADR 0059 going forward for any newly seeded
  address.

## Trade-offs and consequences

Every currently-seeded suburban address now has a real, sourced
`collection_weekday`, and `isCollectionDay`/`findNextCollectionDate` give
any future caller (starting with #134) a way to answer "is this really my
collection day" and "when's my next real collection" honestly, without
guessing. The `schedules` table remains exactly as empty and unused as ADR
0019 left it — this ADR does not change that, and does not claim the table
is now redundant; it may still suit a future per-date-override model this
issue does not attempt. Revisit trigger: issue #134 landing, which should
supersede ADR 0019 and ADR 0053 with a new ADR once `<ScheduleDisplay>`/
`<ShiftAlertBanner>` actually consume this data.
