# ADR 0033: 2026 holidays seed confirmed to 3 WCC-published dates; shift_days derived per weekday, not fixed at 1

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #78

## Context

`#22`/PR #77 shipped `db/seeds/03_holidays.js` as explicitly unverified
placeholder content: 5 rows for 2026 (New Year's Day, Day after New Year's
Day, Good Friday, Christmas Day, Boxing Day (observed)), each with
`shift_days: 1`. `#78` is the tracked follow-up confirming this against
WCC's actual published collection policy, the same pattern as #59
(recycling-week epoch) and #69/#70 (`sorting_rules`).

WCC's own page
(https://wellington.govt.nz/rubbish-recycling-and-waste/when-to-put-out-your-rubbish-and-recycling/suburban-and-inner-city-collections)
states: "Rubbish and recycling are not collected on: Christmas Day, New
Year's Day, Good Friday. Instead, the collection is moved to the following
Saturday. On all other holidays, collection days are as normal." This is
corroborated by a dated WCC news release for Easter/Anzac 2025 (via
Wellington.Scoop), which confirms Good Friday shifts to the following
Saturday while Easter Monday and Anzac Day do not shift at all.

This resolves two things the placeholder got wrong, not one:

1. The row set itself: "Day after New Year's Day" and "Boxing Day
   (observed)" are not on WCC's list, so — per "on all other holidays,
   collection days are as normal" — they don't belong in this table.
   Vision.md §4B's own example already only ever named "Christmas, New
   Year, and Good Friday," so this brings the seed back in line with the
   original product spec rather than away from it.
2. `shift_days`: "the following Saturday" is a date-relative rule, not a
   fixed 1-day shift. Its size depends on which weekday the named holiday
   falls on that year.

## Decision

`db/seeds/03_holidays.js`'s 2026 row set is exactly 3 rows:

| `holiday_date` | `name_en` | 2026 weekday | `shift_days` |
| --- | --- | --- | --- |
| 2026-01-01 | New Year's Day | Thursday | 2 (→ Sat 2026-01-03) |
| 2026-04-03 | Good Friday | Friday | 1 (→ Sat 2026-04-04) |
| 2026-12-25 | Christmas Day | Friday | 1 (→ Sat 2026-12-26) |

Every future calendar-year confirmation issue for this table (following
the #59/#69/#70 precedent of a per-year/per-dataset confirmation issue)
must independently recompute `shift_days` from that year's actual
weekdays using this same "moved to the following Saturday" rule — never
assume `shift_days = 1` by default, and never assume the same 3-holiday
row set recurs without re-checking WCC's page for that year.

## Alternatives considered

### A (chosen): 3-row set, per-year weekday-derived `shift_days`
- **Pros:** Matches WCC's own stated policy exactly, sourced and quotable.
  Matches `vision.md` §4B's original example. Gives every future
  confirmation issue an explicit, repeatable derivation rule instead of a
  guessed constant.
- **Cons:** Removes ADR 0030's originally-cited motivating example (the
  New Year's Day → Day-after-New-Year's-Day cascade) from real seed data —
  see Trade-offs below.

### B: Keep the 5-row placeholder set, only correcting `shift_days`
- **Pros:** Preserves the cascading-resolution example ADR 0030 was
  written around; smaller diff.
- **Cons:** Directly contradicts the sourced WCC policy — every shift
  alert for Jan 2 or Dec 28 would tell a resident their collection moved
  when WCC's own service says otherwise. This is the exact harm #78 exists
  to prevent; rejected outright once the source was found.

### C: Add the 7 candidate holidays as explicit "does not shift" rows (e.g. `shift_days: 0`)
- **Pros:** Leaves an explicit, queryable record of "we checked this one
  and it doesn't shift," rather than relying on absence-means-no-shift.
- **Cons:** The table's own row semantics (ADR 0029) is "this date shifts
  collection by this many days" — `computeHolidayShift` requires
  `shiftDays >= 1` and would need a special case for a `0`/non-shifting
  row that every consumer would have to know to ignore. The "checked and
  confirmed not to shift" record belongs in this ADR and the seed's header
  comment (both now do this), not encoded as rows in a table designed to
  mean the opposite.

## Trade-offs and consequences

Accepts that ADR 0030's originally-cited example (New Year's Day chaining
through Day-after-New-Year's-Day) no longer exists in real seed data — the
cascading mechanism itself is unaffected, still shipped, and still
correct/general-purpose, but as of this confirmation it's exercised only
by a synthetic test fixture (`__tests__/schedule/holiday-shift.test.ts`),
not any real 2026 row, since none of the 3 confirmed dates are
calendar-adjacent. ADR 0030 is not reversed or superseded — its decision
still holds — this ADR only records why the concrete example it cited no
longer matches shipped data. Revisit if a future year's confirmed row set
reintroduces two adjacent shifting dates.

Accepts that the Te Reo Māori name review (`name_mi` for all 3 retained
rows) remains open — #78's acceptance criterion for a fluent-speaker
review is explicitly not closed by this change and needs human sign-off.
