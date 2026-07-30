# ADR 0012: Seed idempotency via delete-then-reinsert

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #10

## Context

Issue #10 requires a Knex seed file for `addresses` (architecture.md §2C)
that is "safe to re-run" — the acceptance criteria's word for idempotent.
The issue's only dependency, "Core DB schema migrations", is already merged
and out of scope to reopen: the `addresses` table
(`db/migrations/20260729100001_create_addresses.js`) has no unique
constraint on `street_name`, `suburb`, `zone`, or any combination of them,
so there is no natural key to upsert against with Knex's
`.onConflict().merge()` without first adding one via a new migration —
which this issue does not ask for and which would reopen a closed
dependency for a seed-only change. `addresses.id` is referenced (nullable,
`ON DELETE SET NULL`) from `users.address_id` and
`push_subscriptions.address_id` (architecture.md §2C "Core Schema
Relationships"), so however idempotency is achieved, deleting and
re-inserting `addresses` rows changes their `id` and will null out any
existing reference to them.

## Decision

`db/seeds/*.js` files that populate reference/lookup tables — starting with
`db/seeds/01_addresses.js` — achieve idempotency by deleting every row in
the target table (`knex(table).del()`) immediately before inserting the
fixed seed dataset, rather than upserting on a natural key or checking for
existence per row. Re-running the seed produces the exact same 17-row
`addresses` table every time, byte-for-byte, rather than a table that has
merely accumulated no duplicates.

## Alternatives considered

### A. Delete-then-insert (chosen)
- **Pros:** Works against today's schema with zero migration change; trivial
  to reason about and test — "run it N times, same result every time"; the
  seeded table always matches the fixture list exactly, so it can't drift
  from manual edits accumulating silently across dev/CI runs.
- **Cons:** Destructive — wipes any row added to the table since the last
  seed run, including rows inserted for reasons other than this seed file.
  Because `addresses.id` is an autoincrement primary key referenced by
  `users.address_id`/`push_subscriptions.address_id`
  (`ON DELETE SET NULL`), a re-run silently nulls those references even
  though a row with the same *content* is reinserted a moment later under a
  new id — tested explicitly in this issue's test suite rather than left as
  an undocumented surprise.

### B. Upsert via `.onConflict().merge()` on a natural key
- **Pros:** Non-destructive — preserves existing rows and their ids, so
  downstream foreign keys survive a re-seed unchanged.
- **Cons:** Requires a new migration to add a unique constraint (e.g. on
  `(street_name, suburb)`) that does not exist today — out of scope for a
  seed-only issue whose stated dependency ("Core DB schema migrations") is
  already closed. It also assumes `(street_name, suburb)` is genuinely
  unique in real WCC data, which has not been verified (Wellington has
  streets that legitimately span or repeat across suburb boundary
  descriptions); asserting that uniqueness via a DB constraint on
  unverified assumptions risks a future real-data import failing a
  constraint this issue invented.

### C. Check-then-insert per row (application-level existence check)
- **Pros:** Non-destructive, no migration required, no invented uniqueness
  assumption.
- **Cons:** O(n) existence queries per seed run for no real benefit at this
  data volume (17 rows now, low hundreds at most for a single city); still
  needs an equality key to check "does this row already exist", which is
  the same ambiguous-natural-key problem as option B, just resolved in
  application code instead of a DB constraint.

## Trade-offs and consequences

This accepts a destructive re-seed (any FK reference into `addresses` gets
nulled on re-run, any manually-added row in the table gets wiped) in
exchange for a seed file that is simple, needs no schema change, and is
easy to prove idempotent with a plain row-count assertion. The seed file's
own header comment and architecture.md §2C both flag this explicitly so it
is not rediscovered as a surprise later. If a future issue needs
`addresses` rows to keep stable ids across reseeds — e.g. because a
`schedules` seed or a user-facing feature comes to depend on a specific
address id surviving a reseed — that will need a superseding ADR once a
real natural key for `addresses` is settled (most likely via option B, once
research into WCC data confirms `(street_name, suburb)` or some other
column pair is actually unique).
