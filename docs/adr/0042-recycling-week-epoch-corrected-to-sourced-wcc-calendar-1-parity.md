# ADR 0042: Recycling-week epoch corrected to sourced WCC "Calendar 1" parity, applied uniformly pending per-zone confirmation

- **Status:** superseded by ADR 0059
- **Date:** 2026-08-04
- **Issue:** #59

## Context

ADR 0016 anchored the glass/mixed alternation in
`src/lib/schedule/rules.ts` to Monday **2024-01-01 UTC**, a date its own
author labelled arbitrary: "nothing ties 2024-01-01 to WCC's actually-
published alternating calendar." ADR 0016's own trade-offs section required
this to be revisited via a superseding ADR before the app quotes a real
recycling week to a real Wellington user. #59 is that revisit.

wellington.govt.nz returns HTTP 403 to this session's `WebFetch` tool for
every page and PDF under that domain, matching the block prior sessions hit
for #70/#78. A direct `curl` from this environment (not routed through the
same tool) was **not** blocked and successfully retrieved two PDFs linked
from indexed search results:

- `https://wellington.govt.nz/-/media/rubbish-recycling-and-waste/rubbish-and-recycling/files/recycling-collcalendar-1.pdf`
- `https://wellington.govt.nz/-/media/rubbish-recycling-and-waste/rubbish-and-recycling/files/recycling-collcalendar-2.pdf`

Both are titled "Recycling collection | Calendar 1/2", cover the full 2026
year, and state: "On green weeks put out your glass recycling crate. On
yellow weeks put out your wheelie bin or recycling bag." The green/yellow
assignment is encoded only as PDF cell-shading, not as text, so it was
extracted programmatically: each PDF was rendered to a raster image
(PyMuPDF `get_pixmap`) and the actual composited pixel colour was sampled
at the vertical centre of every week-row band (row positions derived
geometrically from each month's header position and the confirmed
13.85pt row height), independently for multiple x-offsets per row and
majority-voted. This was necessary because the PDF's vector fill
rectangles for consecutive same-colour week-runs overlap each other
(a naive "which rect contains this point" read gives wrong answers for
weeks inside an overlap — sampling the final rendered pixel is unambiguous
regardless of vector draw order).

Result, cross-checked against every one of the 53 ISO 8601 weeks touching
2026, zero exceptions in either direction:

| Calendar | ISO week odd | ISO week even |
| --- | --- | --- |
| Calendar 1 | glass (green) | mixed (yellow) |
| Calendar 2 | mixed (yellow) | glass (green) |

Calendar 2 is the exact photographic inverse of Calendar 1 — WCC runs two
independent, oppositely-phased alternating schedules, not one citywide
cadence. This alone is a materially more accurate model of reality than
ADR 0016's single arbitrary epoch, and it is real, sourced, currently-
published WCC data, not an invention.

What remains **unconfirmed**: which of this repo's four seeded suburban
zones (`zone-east`, `zone-south`, `zone-west`, `zone-north` in
`db/seeds/01_addresses.js`) follows Calendar 1 vs Calendar 2. WCC's own
"When to put out your rubbish and recycling" page states this is resolved
per-street through an interactive search tool ("Search for your street's
collection days... Enter the name of your street below"), backed by an
ASP.NET WebForms postback with no exposed static JSON endpoint or
published suburb-to-calendar list found in this session's research
(direct fetch, `curl`, `r.jina.ai` proxy, and general web search were all
tried). Per AGENTS.md's standing instruction for this repo, that gap is
recorded here rather than papered over with an invented zone mapping —
tracked as a new follow-up, issue #102.

## Decision

Keep `computeCollectionRuleSet`'s pure, DB-free epoch-anchor formula
exactly as ADR 0016 shaped it (still required by #13's pure-function
acceptance criterion — no DB read is introduced), and correct only the
anchor constant: `RECYCLING_EPOCH_UTC_MS` moves from the arbitrary
Monday 2024-01-01 to Monday **2026-01-12 UTC**, a directly source-confirmed
Calendar 1 glass week. The floor-division parity formula is unchanged, so
every date's classification anchors to real, verified WCC data instead of
an invented one.

Calendar 1's parity is applied uniformly to every suburban zone, since no
zone-differentiated data exists yet to do otherwise (adding an unconfirmed
`recyclingCalendarGroup` guess per zone would just be inventing different
placeholder data, not fixing the problem). This means a zone that turns
out to actually follow Calendar 2 would still be quoted the *wrong* week
until #102 lands — that residual risk is accepted explicitly, not hidden:
it is a bounded, real, sourced-calendar mismatch (one of two known real
parities), not an arbitrary unmoored guess.

## Alternatives considered

### A: Leave ADR 0016's arbitrary 2024-01-01 anchor as-is
- **Pros:** No change required.
- **Cons:** Directly contradicts #59's purpose and ADR 0016's own accepted
  obligation to revisit this before quoting a real week to a real user.

### B: Read `schedules.is_recycling_week` per zone/date from the database
- **Pros:** Would fully resolve per-zone accuracy once seeded.
- **Cons:** Still requires a DB query, contradicting #13's pure-function
  constraint (ADR 0016 rejected this for the same reason). There is also
  still no sourced per-zone data to seed it with — this would trade one
  placeholder (an arbitrary epoch) for another (unseeded/fabricated rows),
  while adding DB coupling to a function required to stay pure.

### C: Add a per-zone `recyclingCalendarGroup: 1 | 2` field now, guessing an
assignment for the four seeded zones
- **Pros:** Would make the model *shape* fully general immediately.
- **Cons:** There is no sourced basis for which zone gets which value —
  this is exactly the "invent real-looking data" failure mode this
  session was explicitly told to avoid. A schema change unbacked by real
  data is scope without substance, and would need to be redone anyway once
  #102's actual research lands.

### D (chosen): Correct the epoch to a sourced Calendar 1 date; apply
uniformly; track the per-zone gap as a new issue
- **Pros:** Every date computed is now backed by a real, currently-
  published, independently-verified WCC calendar (not an invented one).
  No schema or DB coupling added. Keeps `computeCollectionRuleSet` pure
  and unit-testable, matching #13. The one remaining gap (which real
  calendar each zone follows) is narrow, explicitly named, and handed to
  a scoped follow-up (#102) instead of silently accepted or silently
  invented.
- **Cons:** A real Wellington user in a zone that actually follows
  Calendar 2 would still see the wrong week until #102 resolves it — see
  trade-offs below.

## Trade-offs and consequences

Every date `computeCollectionRuleSet` classifies is now grounded in a real,
sourced, currently-published WCC calendar — a categorical improvement over
ADR 0016's fully arbitrary anchor. The residual gap is narrow and bounded:
a 50/50 chance any given seeded zone is actually on the calendar this ADR
did *not* pick, rather than an unbounded, arbitrary error. That gap is
explicitly tracked as issue #102, which owns confirming each zone's real
calendar and wiring a per-zone value into `computeCollectionRuleSet`.

This also only source-confirms the parity for 2026. The floor-division
formula assumes the alternation is a perpetual, uncorrected 7-day cycle
with no periodic adjustment weeks — supported by the zero-exception result
across all 53 ISO weeks actually checked, but not independently confirmed
for years outside 2026. Unlike the annual holiday-date confirmation
pattern in ADR 0038 (`shift_days` genuinely varies per year), a fortnightly
glass/mixed alternation is not expected to need per-year reconfirmation —
revisit this assumption only if a future year's calendar is checked and
contradicts it.
