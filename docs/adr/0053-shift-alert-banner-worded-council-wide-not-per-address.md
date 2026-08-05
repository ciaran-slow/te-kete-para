# ADR 0053: Shift-alert banner wording narrowed to a council-wide statement, not a per-address claim

- **Status:** superseded by ADR 0066
- **Date:** 2026-08-05
- **Issue:** #83

## Context

`<ShiftAlertBanner>` and `GET /api/holidays` shipped fully built and tested
in PR #82 but deliberately uncomposed pending #78 (ADR 0031). #78 has now
closed (ADR 0038), confirming the 2026 holiday row set and deriving
`shift_days` per-weekday — but ADR 0038 resolves nothing about *which
street is collected on which weekday*, a completely separate question from
*which dates WCC's collection service shifts for*.

The banner's shipped copy (`src/lib/i18n/dictionaries.ts`,
`shiftAlert.prefix`/`shiftAlert.shiftsTo`) reads "Your collection due
DD/MM/YYYY (Holiday) shifts to DD/MM/YYYY" — a per-address claim. ADR 0019
(issue #14) already established that no per-street collection-day data
exists anywhere in this codebase: `computeCollectionRuleSet` returns a
non-null rule set for every suburban day regardless of whether that street
is really collected that day. ADR 0032 (this banner's own lookahead-window
ADR) explicitly inherits and acknowledges that same constraint, and gets
away with it only because a public holiday's *existence* is council-wide
(ADR 0029) — but the banner's *wording* goes further than that council-wide
fact supports, asserting a specific date is "your collection," which
nothing backs. A resident whose street is collected on, say, Tuesdays
could be told a Friday holiday shifted "their" collection when it never
applied to them.

Two datasets that might look adjacent do not close this gap:
- **#59/#102** (recycling-week epoch/calendar) resolve *which fortnight* a
  suburban zone's glass/mixed recycling alternates on — a different axis
  entirely from *which weekday* a street's regular collection happens on.
  #102's own "Not in scope" section confirms per-date overrides (this
  issue's territory) are excluded.
- **#78/ADR 0038** resolves *which calendar dates* are WCC-recognized
  shifting holidays and *by how many days* collection moves — again
  orthogonal to which street is collected which weekday.

No issue currently tracks sourcing real per-street collection-day data.
ADR 0019 named this as necessary follow-up work ("seeding `schedules` with
real WCC calendar data... that is a new issue to file") but no such issue
existed before this one.

## Decision

Reword `shiftAlert.prefix` and `shiftAlert.shiftsTo` (both `en` and `mi`)
to a council-wide policy statement instead of a per-address claim:
`"Collections normally due"` / `"move to"` (English), `"Ko ngā kohinga e
tika ana mō te"` / `"ka huri ki te"` (Māori) — dropping the personal
possessive ("Your"/"tō") the same way ADR 0019 labelled `<ScheduleDisplay>`
"Today's collection" rather than promising a "next collection date" the
data couldn't back. This mirrors WCC's own published phrasing quoted in
ADR 0038 ("the collection is moved to the following Saturday"), which is
itself a general policy statement, not an address-specific one.

Compose `<ShiftAlertBanner address={selected} />` into
`src/app/address-schedule.tsx` now, between `<AddressSearch>` and
`<ScheduleDisplay>`.

File issue #117 tracking the larger, distinct, unscoped effort — sourcing
real per-street collection-day data and restoring a genuine per-address
claim in both this banner and `<ScheduleDisplay>` (superseding this ADR and
ADR 0019 when it lands). This ADR does not attempt that work.

The reworded Māori copy is drafted by the engineer, not reviewed by a
fluent Te Reo Māori speaker — the same open status ADR 0038 already
recorded for the seeded holiday names (`name_mi`). Both remain provisional
pending the same kind of review.

## Alternatives considered

### A (chosen): narrow wording to a council-wide statement
- **Pros:** ships an honest, fully-supportable claim now; no new data
  model or migration; matches ADR 0019's own precedent for handling this
  exact class of gap; keeps this issue single-PR-scoped.
- **Cons:** the banner is less specifically useful to an individual
  resident than "your collection" would be — it tells them a WCC-wide
  policy fact, and they must still know their own street's regular
  collection day to judge whether it applies to them. Mitigated by: this
  is materially better than the alternative status quo (not shown at all,
  ADR 0031), and is no less specific than `<ScheduleDisplay>`'s
  already-accepted "today's collection, not next" framing (ADR 0019).

### B: gate the banner on a real per-address collection-day source
- **Pros:** would let the banner make the fully specific, more useful
  claim the issue's original copy implied.
- **Cons:** requires sourcing real WCC per-street calendar data, choosing
  a schema, a migration, and a query path — an unscoped data-sourcing
  effort with no size bound, wholly disproportionate to "compose an
  already-built component into a route." Tracked instead as issue #117;
  not attempted here, per the same reasoning ADR 0019's Alternative C
  rejected blocking issue #14 on unscoped data-modelling work.

### C: compose the banner with its current per-address wording unchanged
- **Pros:** zero copy changes, smallest possible diff.
- **Cons:** ships exactly the false-precision harm this issue exists to
  prevent — a real resident could be told a holiday shifted "their"
  collection when their street isn't actually collected on that date.
  Rejected outright; this is the issue's own stated problem, not an
  acceptable trade-off.

### D: caveat the banner text itself ("may not apply to your street")
- **Pros:** ships the existing per-address wording with a hedge.
- **Cons:** same rejection ADR 0031 already recorded for a similar
  caveat-the-content idea (Alternative D there): a "might not apply to you"
  proactive alert undermines the entire point of a proactive alert — a
  resident who can't trust it has little reason to act on it. A clean
  council-wide statement (chosen alternative) is both more honest and less
  hedgy than a caveated personal claim.

## Trade-offs and consequences

Accepts a less individually-actionable banner than the original copy
implied, in exchange for one that is fully honest about what the data
supports — consistent with ADR 0019's accepted trade-off for
`<ScheduleDisplay>`. Accepts that the reworded Māori copy is
engineer-drafted, not fluent-speaker-reviewed, same open status as ADR
0038's holiday names. Revisit trigger: issue #117 landing real per-street
collection-day data — at that point, both this ADR and ADR 0019 should be
superseded by a new ADR restoring genuine per-address wording in both
`<ShiftAlertBanner>` and `<ScheduleDisplay>`.
