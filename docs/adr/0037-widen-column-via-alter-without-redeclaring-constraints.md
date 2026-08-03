# ADR 0037: Widen a column type via bare `alter()`, never redeclaring existing constraints

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #35

## Context

`push_subscriptions.endpoint` was declared `t.string()` (→ `varchar(255)`),
which is not a real bound on Web Push endpoint URLs (issue #35). SQLite
doesn't enforce `varchar` length, so there's no live bug, but the declared
limit is inaccurate and sits on the table's unique dedup key. SQLite has no
`ALTER COLUMN`; Knex simulates a type change on this dialect by rebuilding
the table — copying columns, data, indexes, and foreign keys into a new
table under the same name. Architecture.md §2B requires schema changes to go
through Knex's query builder, not hand-written SQL.

## Decision

Widen the column with a bare `t.text("endpoint").notNullable().alter()` in
both `up` and `down` (reverting to `t.string()`), declaring only the
properties that are actually changing (nullability, type) and omitting
`.unique()` — Knex's table-rebuild already copies the existing
`push_subscriptions_endpoint_unique` index across, so redeclaring it is
both unnecessary and actively wrong.

## Alternatives considered

### Redeclare `.unique()` in the same `alter()` call
- **Pros:** reads as more explicit/self-documenting about what the final
  column looks like.
- **Cons:** throws `SQLITE_ERROR: index push_subscriptions_endpoint_unique
  already exists` — verified against a live migration. Knex's rebuild step
  already recreates the existing index; asking it to create the same index
  again is a duplicate declaration, not a no-op.

### Drop the column and re-add it as `text`, recreating the unique index with raw SQL
- **Pros:** full manual control over the exact DDL sequence.
- **Cons:** hand-written SQL bypassing the query builder, which
  architecture.md §2B rules out for schema changes; more moving parts (drop,
  add, re-add index) each of which can drift from the original definition;
  no benefit over the one-line `.alter()` that Knex already gets right.

### Bare `t.text("endpoint").notNullable().alter()` (chosen)
- **Pros:** one line per direction, matches the existing migration style in
  this repo, verified to preserve rows, the unique index, the `address_id`
  FK, and constraint enforcement across an up → down → up → down cycle.
- **Cons:** the rule ("don't redeclare a constraint that already exists on
  the column being altered") isn't documented by Knex itself and is easy to
  get backwards by analogy with `CREATE TABLE`, where declaring `.unique()`
  is required. A future migration that actually needs to change a
  constraint (e.g. drop the uniqueness requirement) must explicitly
  `t.dropUnique(["endpoint"])` first, in its own step, rather than expecting
  `alter()` to reconcile it.

## Trade-offs and consequences

Schema-widening migrations on this repo should default to declaring only
what changes and trusting Knex's SQLite rebuild to carry over everything
else. This trades a small amount of explicitness for correctness verified
against this specific Knex/SQLite version pairing. If a future migration
needs to actually drop or change (not just carry over) a constraint on an
altered column, it must do so as an explicit separate step in the same
migration, not by re-asserting the old constraint alongside the new type.
