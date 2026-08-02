# ADR 0029: Standalone `holidays` reference table with no foreign keys

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #22

## Context

#22 requires modelling "NZ/Wellington public holidays relevant to
collection shifts" (vision.md §4B: Christmas, New Year, Good Friday moving
to Saturday) with at least one full calendar year of seed data. The
`schedules` table (architecture.md §2C, migrated in #2) already has
`is_holiday_override` (boolean) and `original_date` (nullable date) columns
for a per-zone, per-date schedule row that happens to be a holiday
override, but it has no seed data and no rows exist to override yet — #23
("Holiday shift calculation logic") is the issue that will populate
`schedules` rows using `computeCollectionRuleSet`
(src/lib/schedule/rules.ts, ADR 0015) plus whatever holiday data this issue
provides. ADR 0016 already named #22 as the future issue that "deals with
per-date overrides against real calendars," anticipating this decision.

This issue's own first comment (from the #2 verify pass) flagged that *if*
a holidays table references `addresses` or `schedules`, seed/migration
ordering has to respect the FK's parent-before-child requirement now that
`PRAGMA foreign_keys = ON` is enforced (architecture.md §2C). That
conditional needs a decision either way — either accept the FK-ordering
constraint, or decide the table doesn't need the FK at all.

## Decision

Add a new, standalone `holidays` table
(`db/migrations/20260803090000_create_holidays.js`) with no foreign key to
`addresses` or `schedules`: `id`, `holiday_date` (unique), `name_en`,
`name_mi`, `shift_days` (integer, default 1). A public holiday date and how
many days it shifts collection by is a council-wide fact, not a per-zone or
per-address one, so there is nothing for a foreign key to usefully point
at. `#23` is expected to join this table against `addresses`/`schedules`
data at read/compute time, not via a DB-level FK.

## Alternatives considered

### A (chosen): Standalone `holidays` table, no foreign keys
- **Pros:** Models the real-world fact shape directly — one row per
  holiday date, independent of zone/address — so seeding "one full
  calendar year" is 5 rows, not 5 rows × every zone. No FK means no
  migration-ordering or seed-ordering constraint to manage (the
  foreign-key caveat in this issue's first comment doesn't apply). Trivial
  to query "is this date a holiday, and by how much does it shift" without
  joining anything.
- **Cons:** #23 must join this table against zone/address data itself at
  compute time rather than following a DB-declared relationship; nothing
  in the schema documents *which* zones a given holiday affects (answer:
  all of them, uniformly — WCC's stated policy doesn't vary shift-by-zone,
  only which zone is suburban-kerbside vs. inner-city-night, which
  `computeCollectionRuleSet` already knows independently).

### B: Extend `schedules` with pre-populated per-zone holiday rows
- **Pros:** Reuses `is_holiday_override`/`original_date`, columns that
  already exist and were clearly provisioned for exactly this; no new
  table or migration at all.
- **Cons:** `schedules.zone` is a loose string match against
  `addresses.zone` (architecture.md §2C), not a candidate key, and
  `schedules` has no seed data yet, so "one full calendar year" would mean
  generating one row per (zone × collection day in the affected week) for
  every zone in `addresses` — far more seed rows than the actual holiday
  count, all derived from the same 5 underlying dates, and brittle to keep
  in sync if a zone is added or renamed later. It also conflates "this
  date is a public holiday" (a calendar fact) with "this zone's schedule
  entry for this date is overridden" (a computed consequence), which is
  exactly the kind of derived-data duplication ADR 0015 rejected for the
  rule engine's zone classification.

### C: A `holidays` table with a foreign key to `addresses` or `schedules`
- **Pros:** Would satisfy the letter of this issue's first comment's
  caveat about FK ordering, and enforces referential integrity if a row
  ever needs to point at a specific zone or schedule entry.
- **Cons:** There is no real per-zone or per-address variation to point
  at — every WCC collection zone observes the same public holidays on the
  same dates. A foreign key here would force inventing a parent row
  relationship that doesn't reflect any real constraint, and would need
  migration timestamps and seed run order to respect parent-before-child
  (per that same comment) for no referential-integrity benefit.

## Trade-offs and consequences

Accepts that #23 does the join between "this date is a holiday" (this
table) and "which zone/schedule row that affects" (addresses/schedules) in
application code rather than the database enforcing it. This is consistent
with ADR 0015's existing choice to keep `computeCollectionRuleSet` free of
DB-derived state — #23 is expected to follow the same shape: read
`holidays` explicitly, pass the result in as data, not re-derive it inside
a "pure" function. Revisit only if a future requirement needs holidays that
genuinely vary by zone (nothing in vision.md §4B or the current roadmap
does).
