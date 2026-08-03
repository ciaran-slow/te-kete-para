# ADR 0040: Macron- and case-insensitive search via post-fetch JS folding

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #72

## Context

`/api/sorting/search` (#20, ADR 0025) and `/api/suburbs/search` (#11, ADR
0013) both match with SQLite `LIKE ... ESCAPE '\'` (`escapeLikePattern`,
`src/lib/api/escape-like-pattern.ts`, shared by both routes). SQLite's
`LIKE` case-folds ASCII only and does no diacritic normalisation, so a Te
Reo Māori query is silently narrower than an equivalent English one:
`KĒNE`, `kene`, and `maturiki` all miss rows containing `kēne` / `matūriki`
that `kēne` and `Kēne` already match. FR-05 requires the sorting search be
"fully localized in English or Te Reo Māori"; a zero-result response reads
to a user as "not in the index," not "try again with macrons," and typing
te reo without macrons is extremely common on phone keyboards. Wellington
suburb names (`Kārori`, `Ōwhiro Bay`, `Tītahi`-style names) mean
`/api/suburbs/search` has the identical exposure, so the fix belongs in the
shared match layer, not one route.

The current dataset is small (16 sorting-rule rows, 16 addresses) with no
relevance-ranking requirement — results are ordered by a natural key
(`item_key` / `street_name`), not by match quality.

Issue #73 (ADR 0035, merged to `main` as PR #87 while this issue was in
flight) rewrote `/api/sorting/search`'s matching in the opposite direction:
from a single-substring SQL `LIKE` to a tokenized, hyphen-normalized,
AND-across-terms/OR-across-columns SQL match (`tokenizeSearchQuery` +
`REPLACE(column, '-', '') LIKE ...`), adding a curated `keywords` column.
Both ADRs touch the same file and the same "how does a query compare to a
column" question, so this ADR's decision below also absorbs ADR 0035's
tokenization logic into the JS filter, rather than leaving the two routes
on two different matching engines (one in SQL, one in JS).

## Decision

`/api/suburbs/search` fetches every `addresses` row (ordered as today —
`street_name`, unchanged) and filters in JavaScript: `street_name` and the
query are both passed through `foldDiacritics`
(`src/lib/api/fold-diacritics.ts`) — lower-case, then Unicode-NFD-decompose
and strip combining marks — and compared with a plain substring check
(`.includes(...)`).

`/api/sorting/search` fetches every `sorting_rules` row (ordered as today —
`item_key`, unchanged) and filters in JavaScript too, folding ADR 0035's
tokenized matching into the same JS pass rather than running it in SQL:
`q` is split into terms (`tokenizeSearchQuery`), each term and each of
`item_key`/`description_en`/`description_mi`/`keywords` are normalized
through the same function — hyphens stripped, then `foldDiacritics` — and a
row matches only if every term matches at least one column (AND across
terms, OR across columns, unchanged from ADR 0035). Folding both routes'
comparisons through one shared function per side means there's no way for
a column's stored form and a query's typed form to drift out of sync, in
either direction.

No schema change, no migration, no seed change, no new dependency beyond
what ADR 0035 already added (`keywords` column, `tokenizeSearchQuery`).
`escapeLikePattern` (ADR 0013) remains a standalone, tested helper but is
no longer called from either route's matching logic: a plain JS substring
check has no wildcard syntax to escape.

## Alternatives considered

### A. SQLite user-defined function via `pool.afterCreate` — attempted, rejected during implementation
Register a `fold_diacritics` SQL scalar function on every connection
`src/lib/db.ts`'s `getDb()` creates (mirroring how `knexfile.js` already
applies `PRAGMA foreign_keys = ON` per connection via the same
`pool.afterCreate` hook), then wrap every matched column and bound `LIKE`
pattern in `fold_diacritics(...)` in SQL.
- **Pros (if it had worked):** folds both sides of every comparison
  identically by construction — no way for a column's stored form and the
  query's typed form to drift out of sync; keeps matching entirely inside
  the SQL query, consistent with every other route in the app.
- **Cons — why it was rejected:** this project's pinned driver
  (`sqlite3@6.0.1`, `package.json`) is the N-API rewrite of node-sqlite3.
  Verified directly against the installed package: its native binding
  registers only `close`, `exec`, `wait`, `loadExtension`, `serialize`,
  `parallelize`, `configure`, `interrupt` as `Database` instance methods
  (`node_modules/sqlite3/src/database.cc`) — `function`/`aggregate`
  (the APIs that would let a JS callback register as a SQL scalar
  function) do not exist anywhere in this version, confirmed against the
  `.d.ts`, the JS wrapper, and the native addon's own prototype
  introspection. `conn.function(...)` in `pool.afterCreate` therefore threw
  `TypeError: conn.function is not a function` on every connection,
  failing every test that touches the database (9 suites). There is no
  SQL-string workaround, since registering a scalar function requires the
  C API (`sqlite3_create_function`), not a query. This is a driver-version
  limitation discovered during implementation, not a design trade-off —
  it forecloses option A entirely without a driver swap.

### B. Stored normalised/folded shadow column
- **Pros:** index-able — a shadow column could carry its own index and
  make the folded comparison as fast as any other indexed `LIKE`, at any
  table size; keeps matching inside SQL.
- **Cons:** needs a migration adding a shadow column per matched text
  column across two tables (`item_key`, `description_en`, `description_mi`,
  `street_name` — four columns), a seed change to populate them, and every
  future insert path (there is currently exactly one seed-based write path
  per table, but any future admin-write feature would need to remember to
  keep the shadow column in sync) becomes a second thing to keep correct
  per write. Pure schema/process overhead with no payoff at this table
  size — see "Revisit if" below.

### C. SQLite FTS5 with `unicode61 remove_diacritics=2`
- **Pros:** most powerful option — real tokenized search with built-in
  diacritic folding and no custom function to maintain; would also open the
  door to relevance ranking if that's ever wanted.
- **Cons:** replaces `LIKE ... ESCAPE '\'` with `MATCH`, a different query
  interface with different escaping/wildcard semantics, so
  `escapeLikePattern`'s wildcard-escaping guarantee (ADR 0013) would need
  to be re-derived for FTS5's query syntax rather than reused unchanged;
  requires a parallel virtual table kept in sync with `sorting_rules` /
  `addresses` via triggers (or reseeded together), which is more moving
  parts than either the current LIKE-based approach or option B; no
  relevance-ranking requirement exists today to justify the jump.

### D. Post-fetch JS filtering with `foldDiacritics` (chosen)
- **Pros:** no schema/migration/seed change and no new dependency, same as
  option A would have offered; sidesteps the driver limitation entirely by
  never asking SQLite to run the fold; folds both sides identically by
  construction (same JS function, called on both the column value and the
  query), so there's no drift risk; the change is contained to the two
  route files (drop the SQL `WHERE`/`LIKE` clause, fetch all rows, filter
  after) and the already-built `foldDiacritics` helper. For
  `/api/sorting/search`, also lets ADR 0035's tokenize/AND/OR/keywords logic
  move into the same JS pass instead of living beside a separate SQL
  matching path — one matching engine per route instead of two.
- **Cons:** every request fetches and deserialises every row of the table,
  then filters in the Node process rather than the database — strictly
  more data crosses the DB boundary than a `WHERE`-filtered query would
  need. At 16–30 rows this is free; at large scale it would cost more than
  option A's per-row SQL function call would have, since the whole row set
  moves over the connection every time, not just the matched rows. Not
  indexable, same ceiling option A already accepted. Also gives up
  `REPLACE`-in-SQL's dubious-but-real ceiling advantage over a scalar
  function (it was already accepted as blocked by option A's driver
  limitation, so this is not a new cost — noted here because ADR 0035 was
  written assuming SQL-side matching would remain the sorting-search
  strategy going forward, and this ADR changes that assumption).

## Trade-offs and consequences

- Accepted: no matching happens inside SQL for these two routes anymore —
  every request fetches the full table and filters in JavaScript. Fine at
  16–30 rows; explicitly not fine at, say, 10,000+ rows, and worse at that
  scale than an indexed shadow column (option B) or even the originally
  intended SQL scalar function (option A) would have been, since the full
  row set (not just matches) crosses the DB connection on every request.
- Accepted: this project's `sqlite3` driver version cannot register custom
  SQL functions at all — any future feature that would benefit from one
  (this fold, or anything similar) is blocked the same way unless the
  driver changes. That is a standing constraint on this codebase, not
  specific to search.
- Accepted: folding is Unicode-diacritic-general (NFD decompose + strip
  combining marks), not Māori-vowel-specific — it will also fold, say,
  French or Spanish accented text the same way. No current column stores
  non-Māori diacritic text, so this is inert today, not a defect.

## Revisit if

Either table's row count grows enough that fetching the full table on
every search becomes measurably slow — revisit toward option B's indexed
shadow column, which needs no custom SQL function and so isn't blocked by
the driver limitation that forecloses option A. A future issue asking for
relevance-ranked or fuzzy search should revisit toward option C's FTS5. A
future driver swap (e.g. to `better-sqlite3`, which does support
registering scalar functions) would reopen option A, but that swap is a
standalone architecture decision with its own trade-offs, not something
to fold into a search-matching fix.
