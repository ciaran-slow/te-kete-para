# ADR 0057: Per-address `recycling_calendar_group` replaces the zone-uniform Calendar 1 default

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #102

## Context

ADR 0042 corrected `src/lib/schedule/rules.ts`'s alternating glass/mixed
epoch to a real, sourced WCC "Calendar 1" date, but — with no per-zone data
to do otherwise — applied Calendar 1's parity uniformly to all four seeded
suburban zones (`zone-east`, `zone-south`, `zone-west`, `zone-north`,
`db/seeds/01_addresses.js`), explicitly flagging the per-zone Calendar 1
vs. Calendar 2 assignment as an open question tracked by this issue.

WCC's own "when to put out your rubbish and recycling" page resolves the
calendar/week for a given address through a per-street search tool, not a
published static list. This is directly reachable by plain `curl` with a
realistic browser `User-Agent` (the same technique #70 used to bypass
wellington.govt.nz's 403-to-bare-request block) — it is **not** the ASP.NET
WebForms postback ADR 0042's research concluded it was:

- `GET https://wellington.govt.nz/handlers/RubbishCollectionStreetsHandler.ashx?term=<partial street name>`
  returns a plain JSON array of `{ label, value }` matches, `value` being a
  numeric `streetId` — the site's own autocomplete
  (`/assets/js/components/recycling-collection-search.js`).
- `GET https://wellington.govt.nz/rubbish-recycling-and-waste/when-to-put-out-your-rubbish-and-recycling/components/collection-search-results?streetId=<id>`
  returns the street's results fragment, including — for every suburban
  address — a direct link to "Collection Calendar 1" or "Collection
  Calendar 2" (the PDFs ADR 0042 already confirmed the parity of).

Querying both endpoints for every currently-seeded suburban street gives a
fully sourced result for **all 12 seeded suburban addresses**, not just
"one or two zones":

| Street, suburb | Seeded zone | WCC calendar |
| --- | --- | --- |
| Marjoribanks Street, Mount Victoria [^1] | zone-east | 1 |
| Hataitai Road, Hataitai | zone-east | 1 |
| Oriental Parade, Oriental Bay | zone-east | 1 |
| Riddiford Street, Newtown | zone-south | 1 |
| Constable Street, Newtown | zone-south | 1 |
| The Parade, Island Bay | zone-south | 2 |
| Adelaide Road, Mount Cook | zone-south | 2 |
| Karori Road, Karori | zone-west | 1 |
| Kelburn Parade, Kelburn | zone-west | 1 |
| Brooklyn Road, Brooklyn | zone-west | 2 |
| Tinakori Road, Thorndon | zone-north | 2 |
| Broderick Road, Johnsonville | zone-north | 1 |

[^1]: WCC's real street spelling is "Majoribanks Street"; the seed
  misspells it, and the real street's low house-number range (1-13/4-18)
  is actually inner-city night collection, not suburban kerbside — tracked
  separately by issue #125, out of scope here. This row's Calendar 1
  result is confirmed against the street's suburban (higher house-number)
  segment, which is what the seed row's existing
  `is_inner_city_night_collection: false` classification actually matches.

This directly falsifies this issue's own framing (and this repo's `zone`
taxonomy as a proxy for "recycling calendar area"): **zone-south,
zone-west, and zone-north each mix both calendars** — WCC's calendar
boundary follows real street/suburb geography that this repo's four
cardinal-direction zones do not track. Only zone-east happens to be
internally uniform (all three of its seeded streets are Calendar 1), which
is incidental, not structural.

## Decision

Add a nullable `recycling_calendar_group` integer column (`1`, `2`, or
`null`) to `addresses` — confirmed per-address exactly like
`is_inner_city_night_collection` already is (ADR 0015), not derived from
`zone`. Mirror the field onto `ZoneClassification` in
`src/lib/schedule/rules.ts` as `recyclingCalendarGroup:
RecyclingCalendarGroup | null` (`RecyclingCalendarGroup = 1 | 2`), and
thread it through every layer that already carries
`isInnerCityNightCollection` end-to-end: `GET /api/suburbs/search`'s
`SuburbSearchResult`, the `localStorage` address cache (bumping
`ADDRESS_CACHE_VERSION` 1 → 2, since the cached shape gains a required
field), `<ScheduleDisplay>`'s classification construction, and the nightly
dispatcher's `addresses` join.

`computeCollectionRuleSet` keeps ADR 0042's `RECYCLING_EPOCH_UTC_MS`
Calendar-1 anchor unchanged, computes that anchor's parity as before, and
inverts it when `recyclingCalendarGroup === 2` — Calendar 2 is Calendar 1's
confirmed exact inverse (ADR 0042), not an independently-anchored second
epoch. A suburban classification with no resolvable
`recyclingCalendarGroup` throws a `RangeError`, matching the existing
empty-`zone`-string validation, rather than silently defaulting to
Calendar 1.

This supersedes **ADR 0042** — not ADR 0041, which the issue's original
scope text named by mistake: ADR 0041 covers the service-worker/icon
decision (#29) and has nothing to do with recycling calendars. ADR 0042 is
the record that actually named this gap and tracked it to issue #102.

## Alternatives considered

### A: Confirm and store `recyclingCalendarGroup` per `zone` (the issue's literal framing)
- **Pros:** Matches the issue title/scope text exactly; smallest schema
  footprint (one value per zone string, no `addresses` column).
- **Cons:** Directly contradicted by the sourced data above — 3 of 4
  seeded zones mix both calendars. Picking either value for zone-south,
  zone-west, or zone-north would be correct for some of that zone's seeded
  addresses and wrong for others — the exact "confirmed but still broken
  for a real user" failure mode ADR 0042 accepted as a temporary gap and
  this issue exists to close.

### B: A new per-suburb grouping (finer than zone, coarser than address)
- **Pros:** One step finer than zone; might have been enough if the
  calendar boundary tracked suburb names exactly.
- **Cons:** No evidence the boundary reliably tracks suburb either — most
  seeded suburbs here were sampled with only one street, so suburb-level
  uniformity is unconfirmed, not disproven, but also unnecessary to
  introduce: `addresses` already carries `suburb` as a plain string per
  row, so a per-suburb value would still need to live somewhere per-row (a
  new lookup table keyed on suburb, or duplicated onto every row anyway) —
  no simpler than storing it directly on `addresses`.

### C (chosen): Per-address column on `addresses`
- **Pros:** Matches the real WCC granularity exactly (the per-street lookup
  tool *is* the source of truth); matches the existing
  `is_inner_city_night_collection` pattern already on this table and
  already explicit-input per ADR 0015; every currently-seeded suburban
  address is fully confirmable this way, with zero zones left as an open
  guess.
- **Cons:** Every future seeded address needs an individually-confirmed
  value — there is no zone- or suburb-level default to fall back on, and
  `computeCollectionRuleSet` now rejects a suburban classification that
  omits one rather than guessing. This is accepted as correct: a rejected
  unknown is safer than a silently-wrong assumed Calendar 1.

## Trade-offs and consequences

Every seeded suburban address's glass/mixed week is now backed by a real,
directly-sourced-today WCC assignment, closing the gap ADR 0042 accepted
knowingly. The residual cost is per-address seeding discipline going
forward (documented in the seed file's own comments) — cheaper than it
sounds, since the same two live GET endpoints this ADR documents
(`RubbishCollectionStreetsHandler.ashx` for street → `streetId`,
`collection-search-results?streetId=` for the assigned calendar) resolve
any future Wellington street in one or two `curl` calls, with no
JS-rendering or session/postback state required. `zone` remains in the
schema and in `computeCollectionRuleSet`'s output as a display/grouping
label — this ADR does not claim it tracks anything about recycling
calendars, and no code has ever derived recycling behaviour from it (only
`isInnerCityNightCollection`, already explicit-per-address, has ever done
that). A follow-up (issue #125) tracks the one seed-data spelling/scope
discrepancy (Marjoribanks/Majoribanks Street) found incidentally during
this research, out of scope here.
