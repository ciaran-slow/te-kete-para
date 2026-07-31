# ADR 0015: Explicit zone classification input for the collection rule engine

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #13

## Context

`#13` requires a pure function that takes a zone and a date and returns the
applicable collection rule set (bin types, time window, alternating
recycling week; vision.md §4A). `addresses` (architecture.md §2C) carries
two zone-related columns: `zone`, a loose grouping string (`schedules.zone`
matches it informally, per architecture.md §2C — not a candidate key), and
`is_inner_city_night_collection`, an explicit boolean that is the actual
authoritative suburban-vs-inner-city classification. The rule engine needs
that classification for every zone it is asked about.

## Decision

`computeCollectionRuleSet` takes a `ZoneClassification` object
(`{ zone: string; isInnerCityNightCollection: boolean }`) rather than a bare
zone string. The module contains no zone-naming logic of its own; the caller
supplies both fields, sourced from `addresses.zone` and
`addresses.is_inner_city_night_collection`.

## Alternatives considered

### A: Hardcoded zone-string lookup table inside the rules module

- **Pros:** Matches the issue text most literally ("takes a zone", read as a
  bare string); call sites pass one value instead of two.
- **Cons:** Duplicates classification knowledge that already lives in
  `addresses.is_inner_city_night_collection`. The current seed data's 1:1
  correlation between `zone === "zone-cbd"` and inner-city collection is
  incidental to five hardcoded seed rows, not a schema guarantee — nothing
  stops a future zone spanning both collection types. A second, hardcoded
  mapping would silently drift from the database whenever zones are added or
  reclassified, and pure-function unit tests can never catch that drift
  because they never see the DB.

### B (chosen): Explicit `ZoneClassification` input

- **Pros:** `addresses.is_inner_city_night_collection` stays the single
  source of truth; the rules module has zero knowledge of real-world zone
  naming, so adding, renaming, or reclassifying a zone never touches this
  module or its tests. `zone` is retained on input and output purely as a
  passthrough label.
- **Cons:** Every call site (the future API/UI work in `#14` or later) must
  fetch and plumb `isInnerCityNightCollection` alongside `zone` rather than
  passing a single string. The literal "takes a zone" reading in the issue
  is satisfied by a structured value, not a bare string — worth flagging so
  a future reader doesn't "fix" it back to a string.

## Trade-offs and consequences

Accepts one extra field of plumbing at every call site in exchange for
never having a second, drift-prone copy of the suburban/inner-city
classification. Revisit only if a future requirement needs classification
computed purely from a zone code with no address context at all — nothing
in the current schema or roadmap (`#14`, `#22`, `#23`) calls for that.
