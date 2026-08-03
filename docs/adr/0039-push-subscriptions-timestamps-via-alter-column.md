# ADR 0039: push_subscriptions timestamps added via direct ALTER, not a table rebuild

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #34

## Context

`push_subscriptions` (#2) has no way to tell how old a subscription is,
which the nightly dispatcher (#27) needs to prune dead rows instead of
retrying them forever. The issue also flagged a related fork: whether to
add `updated_at` in the same migration, contingent on whether #25's
subscribe endpoint upserts on the unique `endpoint` column rather than
rejecting duplicates. #25's plan (posted on that issue, not yet built)
confirms upsert-on-conflict as its own ADR 0033 — so at plan time for #34,
the answer to "does #25 upsert" is already yes, even though #25's code
doesn't exist yet.

Separately, adding these columns to an *existing* table (rather than at
`CREATE TABLE` time) runs into a real SQLite restriction: `ALTER TABLE ADD
COLUMN` refuses a `NOT NULL` column with a non-constant default
(`CURRENT_TIMESTAMP`) once the table has any rows, raising `SQLITE_ERROR:
Cannot add a column with non-constant default`. Verified directly against
this repo's `knex@3.3.0`/`sqlite3@6.0.1` (engine 3.52.0): the same column
definition works fine at `CREATE TABLE` time regardless of row count, and
also works via `ALTER TABLE ADD COLUMN` on a table with zero rows — the
restriction is specifically non-empty-table + non-constant default.

## Decision

Add both `created_at` and `updated_at` in this one migration (not
`created_at` alone, and not deferred to a second migration), each
`t.timestamp(...).notNullable().defaultTo(knex.fn.now())`, via a direct
`knex.schema.alterTable` with two `ADD COLUMN`s — the same shape every
other migration in this repo already uses, no table rebuild.

This is safe because `push_subscriptions` has zero rows in every
environment that will run this migration: #25's subscribe endpoint (the
table's only writer) does not exist on `main` yet, so this migration will
always land before the table's first real row. That is an accepted
constraint, not an incidental fact: **this migration must never be
re-applied against a `push_subscriptions` table that already has rows** —
if that ever became necessary (e.g. a rebase/replay scenario), it would
need to change strategy to a create-copy-drop-rename rebuild.

## Alternatives considered

### Direct ALTER TABLE ADD COLUMN (chosen)
- **Pros:** Matches every existing migration's style in this repo (all
  straightforward `createTable`/`alterTable` calls, no rebuilds). Minimal
  code, easy to review, easy `down()`. Correct for every environment that
  will actually execute it.
- **Cons:** Not generally safe against SQLite's non-constant-default
  restriction — would throw if ever run against a table with existing
  rows. Relies on an external fact (table is currently unwritten) rather
  than being correct by construction.

### create-copy-drop-rename table rebuild
- **Pros:** Correct regardless of existing row count; the standard SQLite
  workaround for adding a NOT-NULL-with-computed-default column to a live
  table.
- **Cons:** Would be the first rebuild-style migration in this repo — more
  code, and it must reproduce `push_subscriptions`' exact unique index name
  (`push_subscriptions_endpoint_unique`) and FK (`address_id` → `addresses.id`
  `ON DELETE SET NULL`) so `__tests__/db/schema.test.ts` keeps passing.
  Meaningfully more risk and review surface for a table that, in every
  real environment, is still empty.

### created_at only, defer updated_at to a later migration
- **Pros:** Scopes exactly to the issue's checked acceptance criteria;
  avoids adding a column (`updated_at`) that nothing writes yet.
- **Cons:** The issue explicitly asks to decide this once, now that #25's
  upsert design is confirmed, specifically to avoid a second migration for
  what is "the same migration" in spirit. Rejected per user confirmation
  during planning.

## Trade-offs and consequences

Accepts a real constraint on when this migration is safe to run (empty
table only) in exchange for staying consistent with every other migration
in this repo and avoiding unnecessary complexity for a table nothing has
written to yet. If a future issue ever needs to alter `push_subscriptions`
again after it holds real rows, that migration cannot copy this one's
`ADD COLUMN` shape for a non-constant-default NOT NULL column — it must use
the create-copy-drop-rename rebuild instead. `updated_at` is added now but
not yet touched by any write path; #25's build is expected to set it
explicitly in its upsert's `.merge([...])` column list when it lands.
