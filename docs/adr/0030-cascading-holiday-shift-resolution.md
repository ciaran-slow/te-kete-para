# ADR 0030: Cascading holiday-shift resolution through adjacent holidays

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #23

## Context

`#23` requires detecting whether a candidate collection date falls on a
public holiday and, if so, returning "the shifted date" (vision.md §4B:
"Good Friday or Christmas moving to Saturday"). The seeded `holidays` table
(`#22`, `db/seeds/03_holidays.js`) already contains two adjacent calendar
dates in the same week — `2026-01-01` ("New Year's Day") and `2026-01-02`
("Day after New Year's Day") — both with `shift_days: 1`. A collection
candidate landing on `2026-01-01` shifts, by the simplest possible rule, to
`2026-01-02` — but that date is itself a holiday in the same table. A
single, non-chained shift would return a "shifted" date that is still a
public holiday: exactly the problem the shift calculation exists to solve,
reproduced one day later. Vision.md §4B's own example describes only a
single shift, so the issue text alone doesn't resolve the adjacent-holiday
case — this is a genuine fork forced by the real seed data already on
`main`, not a hypothetical.

## Decision

`computeHolidayShift` re-checks the shifted date against the same
`holidays` list and shifts again if it, too, matches — repeating until it
reaches a date absent from the list. Every `holidays[].shiftDays` is
validated as a positive integer before resolution begins; combined with
calendar dates being unique keys in the lookup, each shift strictly
advances to a later, previously-unvisited date, so the chain is guaranteed
to terminate — no explicit iteration cap is needed.

## Alternatives considered

### A: Single shift only, regardless of what the destination date is

- **Pros:** Simplest implementation; matches the single-example wording in
  vision.md literally.
- **Cons:** Given the real seeded data, a collection due `2026-01-01`
  would "shift" to `2026-01-02` — itself a listed public holiday — an
  obviously wrong answer for a user-facing "your collection is now on this
  date" alert (`#24`). This isn't a hypothetical edge case; it fires every
  year this table has two adjacent holiday rows, which the current seed
  already does.

### B (chosen): Cascading shift, chained until a non-holiday date, no iteration cap

- **Pros:** Correct for the data already seeded; no date `computeHolidayShift`
  returns can itself be a listed holiday. Termination is provable from the
  function's own validated invariants (unique dates, positive-integer
  shifts) rather than an arbitrary cap.
- **Cons:** Marginally more complex than a single conditional. Correctness
  depends on the `shiftDays` validation remaining a hard, non-bypassable
  gate inside this same function — if that guarantee were ever weakened,
  the termination proof would no longer hold.

### C: Cascading shift with a hardcoded iteration cap (e.g. 30) as a backstop

- **Pros:** Extra defense-in-depth against a future validation regression
  reintroducing a non-terminating loop.
- **Cons:** Given the validated invariants, the cap can never be exercised
  — dead code the coverage gate would never cover — and is an arbitrary
  magic number with no data-driven basis; a cap set too low could silently
  truncate a legitimate multi-holiday chain in some future year's calendar
  with more adjacent holiday rows than 2026's.

## Trade-offs and consequences

Accepts that correctness depends on `shiftDays` validation staying a hard
gate inside `computeHolidayShift` itself, not something delegated to or
assumed of callers — if that invariant is ever relaxed, the termination
proof must be revisited alongside it. Revisit this decision if a future
calendar needs a shift rule more complex than "move forward by a fixed
number of days per matched date" (e.g. "also skip weekends"), which is out
of scope for the data seeded by `#22`.
