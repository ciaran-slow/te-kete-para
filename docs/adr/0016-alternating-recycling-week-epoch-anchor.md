# ADR 0016: Alternating recycling week computed from a fixed epoch anchor

- **Status:** superseded by ADR 0042
- **Date:** 2026-07-31
- **Issue:** #13

## Context

vision.md §4A requires suburban zones to alternate weekly between glass-crate
and paper/plastic/metal recycling. No issue or seed data in this repo yet
encodes which real WCC calendar week is "glass" vs "mixed" — `schedules`
(architecture.md §2C) has an `is_recycling_week` column, but it is unseeded,
and reconciling it with real council data is out of scope here: `#22`
("Wellington public holiday calendar & override schema") and `#23` ("Holiday
shift calculation logic") are the later issues that deal with per-date
overrides against real calendars. `#13`'s acceptance criteria requires a
*pure* function, which rules out a DB read regardless.

## Decision

Parity is computed from a fixed, hardcoded epoch: Monday **2024-01-01 UTC**
is defined as the start of a "glass" week.
`isGlassWeek = floor(floor((dateUtcMs − epochUtcMs) / msPerDay) / 7) is even`,
using `Date.UTC` calendar-day arithmetic (not the caller's local time zone),
with floor division so dates before the epoch still alternate consistently
rather than producing an off-by-one at the boundary.

## Alternatives considered

### A: Read `schedules.is_recycling_week` for the zone + date

- **Pros:** Would reflect real, per-date council data, including any
  holiday-driven exceptions, and reuses a column that already exists.
- **Cons:** Requires a DB query, which contradicts `#13`'s explicit "pure
  function" acceptance criterion. `schedules` has no seed data yet — that is
  future scope for `#22`/`#23` — so there is nothing correct to read today;
  building this issue on top of unseeded, unrelated future work would block
  it indefinitely.

### B (chosen): Fixed epoch-anchored formula

- **Pros:** Deterministic and fully testable without a database; unblocks
  both this issue and its dependent, `#14`, immediately. Boundary and
  periodicity are simple, fast unit tests.
- **Cons:** The anchor date is arbitrary — nothing ties 2024-01-01 to WCC's
  actually-published alternating calendar. Live parity for a real Wellington
  address could be wrong (off by one week, or entirely different) until
  corrected against real data.

## Trade-offs and consequences

Accepts a known-fictional business rule now in exchange for a pure,
DB-free, fully unit-testable module today. This must be revisited — via a
new ADR that supersedes this one, per `docs/adr/README.md` — before the app
quotes a real recycling week to a real Wellington user; that revisit is
naturally scoped to whichever future issue wires in real WCC recycling-week
data (not currently filed).
