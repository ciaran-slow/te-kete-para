# ADR 0019: ScheduleDisplay shows today's computed collection rules, not a scanned "next collection date"

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #14

## Context

Issue #14's acceptance criteria ask for "the next collection date(s) and
bin type(s)". `computeCollectionRuleSet(zone, date)`
(`src/lib/schedule/rules.ts`) is a pure function of a single calendar date:
given a zone classification and one date, it returns the bin types and time
window that would apply *if* that date is a collection day for that zone.
It has no concept of which days of the week a given street is actually
collected on — that per-street cadence is modelled by the `schedules`
table (docs/architecture.md §2C: "Date-mapped bin collection calendars,
alternating recycling flags, and holiday override rules").

That table's *schema* already exists: issue #2 migrated it in
`db/migrations/20260729100002_create_schedules.js` (`zone`,
`collection_date`, `waste_type`, `is_recycling_week`, `is_holiday_override`,
`original_date`, indexed on `["zone", "collection_date"]`). What does not
exist is any **data or access path**: `db/seeds/` holds only
`01_addresses.js`, and nothing under `src/` reads `schedules` at all. So the
table is empty and unqueried — the blocker here is seed data and a query
layer, not a migration.

Without that data there is no way to answer "which future date is the next
actual collection day for this address" — every day would have to be
assumed collectable, which is not true for suburban kerbside (real WCC
suburbs are collected roughly weekly, not daily) and would misrepresent the
product for the Suburban persona specifically.

## Decision

`ScheduleDisplay` computes and shows only the rule set for **today** (the
viewer's local calendar date, per ADR 0018): "if today is your collection
day, here is what goes out and when." It is headed and labelled
accordingly (`schedule.heading` = "Today's collection", not "Next
collection"), so the UI does not claim a forward-looking guarantee the data
can't back up. No forward scan across multiple candidate dates is
implemented in this issue.

## Alternatives considered

### A. Show only today's rule set (chosen)
- **Pros:** honest about what the data actually supports; ships FR-02's
  "see your schedule" behaviour now, using only already-built pieces
  (rules.ts, address search); small, one-PR scope.
- **Cons:** does not literally answer "when is my next collection" for a
  suburban resident whose street isn't collected today — the heading says
  "today's collection" rather than promising a next date, which is a real
  product gap against the issue's literal wording.

### B. Scan forward day-by-day (e.g. up to 14 days), calling `computeCollectionRuleSet` for each candidate date, and show the first one considered a "collection day"
- **Pros:** would produce an actual "next date" number.
- **Cons:** there is no field anywhere in `ZoneClassification`,
  `addresses`, or `CollectionRuleSet` that marks a candidate date as a real
  collection day versus not — every suburban day currently returns a
  non-null rule set (inner-city is nightly), so a naive scan would just
  return "today" again, giving a false sense of precision without adding
  real information. Implementing this honestly requires real rows in the
  `schedules` table plus a query path to read them; the table's migration is
  already in place, but seeding it with WCC calendar data and wiring a query
  are both out of scope here — neither is part of this issue.

### C. Block this issue until `schedules` holds a real collection-day calendar
- **Pros:** would let "next collection date" mean exactly what it says.
- **Cons:** blocks FR-02 UI work behind an unscheduled, unscoped
  data-modelling effort, and contradicts the issue's own "Depends on" list,
  which names only the already-merged rule engine and address search as
  prerequisites.

## Trade-offs and consequences

This ships a real, correct "what would today's collection look like" view
now, at the cost of not literally satisfying "next collection date" for a
suburban resident on a non-collection day — the UI is honest about this
(labelled "today's collection"), rather than inventing a scan that would
silently be wrong. Follow-up work — seeding `schedules` with real WCC
calendar data, adding a query path for it, and replacing "today's rules" with
a genuine forward search — should supersede this ADR once those rows exist;
that is a new issue to file, not something this PR does. Note that the
migration is *not* part of that follow-up: the table is already there and
waiting, so the remaining work is data plus a query layer.
