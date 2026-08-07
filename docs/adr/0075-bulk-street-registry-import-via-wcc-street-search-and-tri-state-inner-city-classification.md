# ADR 0075: Bulk street registry import via WCC's street-search endpoint, with a genuinely tri-state `is_inner_city_night_collection`

- **Status:** accepted
- **Date:** 2026-08-08
- **Issue:** #178

## Context

FR-08 (prd1.md) requires the address search to find real Wellington
streets beyond the 17 hand-curated rows in `01_addresses.js`, without
fabricating any street's operational classification. FR-08's own text
names LINZ's "NZ Addresses" dataset for the street/suburb registry itself.

Testing `data.linz.govt.nz` directly this session found its layer catalog
browsable with no authentication, but its actual data (WFS query, CSV
export) returns `401 Unauthorized` without a real API key — not available
in this build environment, and there is no way to register for one here.

Separately, WCC's own street-search autocomplete endpoint
(`RubbishCollectionStreetsHandler.ashx`, already reverse-engineered by ADR
0059/0060) was confirmed reachable with **zero** authentication via the
same browser-User-Agent bypass those ADRs already established. It returns
WCC's own canonical per-street registry — the same one its per-street
classification lookup tool (the actual data source for `zone`,
`is_inner_city_night_collection`, `recycling_calendar_group`,
`collection_weekday`, per ADR 0059/0063) is built on.

Separately, adding real rows for streets whose classification isn't known
exposed a schema gap: `addresses.is_inner_city_night_collection` is
`NOT NULL DEFAULT false`. `computeCollectionRuleSet` (rules.ts) branches
immediately on this field — a defaulted `false` for a real but unchecked
street would silently compute a plausible suburban 7am schedule for what
might actually be a CBD night-collection address, which is a **worse**
outcome than the address not resolving at all (FR-08's own stated
priority).

## Decision

**Registry source:** import the street/suburb registry from WCC's
`RubbishCollectionStreetsHandler.ashx` endpoint instead of LINZ, via a
one-time script (`scripts/import-wellington-streets.js`) that enumerates
two-letter prefixes (escalating to three letters for any prefix near the
endpoint's ~100-result cap), dedupes by the endpoint's own numeric
`streetId`, and writes the result as a static, checked-in JSON fixture
(`db/seeds/data/wellington-streets.json`) — no network dependency at seed
or test time, mirroring ADR 0060's "one-time fetch baked into a seed file"
precedent. The live run against the real endpoint (2026-08-07/08) found
2,089 unique streets not already covered by the 17 curated rows (15 of the
endpoint's raw rows collapsed into already-curated street/suburb pairs and
were excluded), with 0 rows skipped as unparseable.

**Schema:** widen `addresses.is_inner_city_night_collection` to nullable.
Every bulk-imported row gets `zone: "zone-unconfirmed"`,
`is_inner_city_night_collection: null`, `recycling_calendar_group: null`,
`collection_weekday: null` — a real, distinct "not yet classified" state,
not a guessed default. A new `UnresolvedZoneClassificationError` (mirrors
ADR 0068's `UnresolvedRecyclingCalendarGroupError` exactly) makes every
caller that would otherwise silently misuse a null value fail loudly
instead.

`zone` itself stays `NOT NULL` — it never drives rule computation (ADR
0059), so the sentinel string `"zone-unconfirmed"` is sufficient and avoids
a second nullable ripple through every layer that already threads `zone`
end-to-end.

**Bulk insert mechanism:** `01_addresses.js` inserts the ~2,100-row combined
dataset via `knex.batchInsert("addresses", BULK_ADDRESSES, 200)` for the
bulk tier, not a single `insert()` call across the whole dataset. sqlite3's
`SQLITE_MAX_COMPOUND_SELECT` limit (default 500) rejects the
`insert ... select ... union all select ...` statement knex's sqlite3
dialect builds for a single multi-row `insert()` once the row count is this
large — confirmed empirically against this driver during implementation,
not assumed. `batchInsert` chunks the statement safely under that limit;
idempotency (delete-then-reinsert, ADR 0012) and the final row set are
unchanged.

## Alternatives considered

### Registry source

#### A: LINZ NZ Addresses dataset, as FR-08's text names
- **Pros:** Matches the PRD text exactly; a genuinely authoritative national
  address dataset, not council-specific.
- **Cons:** Requires a LINZ Data Service API key to fetch anything beyond
  the public layer catalog — confirmed via a live `401` this session. Not
  obtainable in this environment. Would also need a second reconciliation
  pass later against WCC's own per-street IDs for phase 2 classification
  work, since LINZ's address IDs and WCC's `streetId`s are two independent
  numbering schemes.

#### B (chosen): WCC's `RubbishCollectionStreetsHandler.ashx` street-search endpoint
- **Pros:** No credentials needed — reachable today with the same
  browser-User-Agent bypass ADR 0054/0059/0060 already established. Returns
  WCC's own canonical registry, so every bulk-imported street's `streetId`
  is already the exact key phase 2 (#188) needs for classification
  lookups — no separate ID-reconciliation step. Consistent with this repo's
  existing pattern of sourcing real content from WCC's own tooling rather
  than a third-party dataset.
- **Cons:** Depends on an undocumented internal endpoint WCC could change or
  remove without notice (same accepted trade-off ADR 0060 already took).
  Its ~100-result-per-query cap requires an escalating prefix-enumeration
  strategy rather than a single bulk export call — more script complexity
  than a one-shot CSV download would have been.

#### C: Scope this PR to import tooling only, no live data pull
- **Pros:** Avoids committing to a registry source before phase 2's
  classification mechanism is designed.
- **Cons:** Doesn't actually expand coverage — FR-08's whole point. Rejected
  by the user when offered as an option.

### `is_inner_city_night_collection` nullability

#### A: Default new rows to `false` (today's schema)
- **Pros:** No migration, no ripple through the seven files that read this
  field.
- **Cons:** Exactly the fabrication FR-08 forbids — a real CBD street
  defaulted to `false` gets a wrong, plausible-looking suburban schedule
  instead of an honest "unresolved" state.

#### B: A separate `classification_confirmed` boolean flag, leaving the existing field's type untouched
- **Pros:** Doesn't touch `is_inner_city_night_collection`'s type; arguably
  more self-documenting as a standalone flag.
- **Cons:** Every caller still has to thread and check a second field
  alongside the first, so the ripple through the same seven files is no
  smaller — and it breaks from this repo's own established precedent, where
  both prior "not yet confirmed" fields (`recycling_calendar_group`,
  `collection_weekday`) already use `null` as the unresolved signal
  directly, not a companion flag.

#### C (chosen): Widen `is_inner_city_night_collection` to nullable; `null` is the unresolved signal
- **Pros:** Consistent with the existing `recycling_calendar_group`/
  `collection_weekday` precedent exactly. One field, one meaning, no
  companion flag to keep in sync.
- **Cons:** Ripples through `rules.ts`, `collection-day.ts`, `route.ts`,
  `address-search.tsx`, `address-cache.ts`, `dispatcher.ts`, and
  `schedule-display.tsx` — the same seven-file surface ADR 0059 already
  accepted when it added `recycling_calendar_group` end-to-end. `zone`
  deliberately does *not* get the same treatment (see Decision) — only the
  field that actually gates rule computation needs it.

### Bulk-insert mechanism

#### A (chosen): `knex.batchInsert` chunked at 200 rows
- **Pros:** Small, local change confined to `01_addresses.js`; preserves the
  plan's intended final row set and idempotency semantics exactly; the
  chunk size (200) is comfortably under sqlite3's 500-term compound-select
  limit with headroom for future registry growth.
- **Cons:** A second insert call shape (batched) alongside the single
  `insert()` still used for the 17 curated rows, rather than one uniform
  call — a minor readability cost, accepted because unifying them would
  mean batching the small curated insert too, for no benefit.

#### B: Raise `SQLITE_MAX_COMPOUND_SELECT` via a `PRAGMA` or a custom sqlite3 build
- **Pros:** Would let a single `insert()` call keep working unchanged.
- **Cons:** `SQLITE_MAX_COMPOUND_SELECT` is a compile-time limit in the
  `sqlite3` npm package's bundled SQLite, not a runtime `PRAGMA` — not
  achievable without rebuilding the native dependency, which is out of
  scope for a seed-data change.

## Trade-offs and consequences

Every real Wellington street WCC's own registry recognizes is now
findable by name (FR-08's core ask), while every unconfirmed row stays
honestly unresolved rather than silently misclassified — closing exactly
the gap FR-08 was written to prevent. The residual cost is phase 2 (#188):
confirming classification for the 2,089 bulk-imported rows this PR's live
run produced, which this PR deliberately does not attempt. `zone-unconfirmed`
is a new sentinel value with no computation depending on it; if a future
issue ever does derive behaviour from `zone` (nothing does today, per ADR
0059), that issue would need to handle this sentinel explicitly.
`ADDRESS_CACHE_VERSION` is deliberately *not* bumped: unlike the two prior
bumps (each added a wholly new required field an old cached payload would
lack), this widens an existing field's allowed value set — every payload
cached under version 3 already has a real `boolean` there, which is still
valid under the new `boolean | null` type — a narrower trade-off than the
prior two bumps, recorded here so it doesn't read as an inconsistency next
to them.
