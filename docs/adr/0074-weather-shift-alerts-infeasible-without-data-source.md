# ADR 0074: Weather-triggered shift alerts (FR-07) are infeasible without a data source

- **Status:** accepted
- **Date:** 2026-08-07
- **Issue:** #177

## Context

`vision.md` §4B envisions "Smart Holiday **and Weather** Shift Alerts" — Wellington's
southerlies disrupting routines the same way public holidays do.
`ShiftAlertBanner`/`computeHolidayShift` (`src/lib/schedule/holiday-shift.ts`, ADR
0030, ADR 0032) implement the holiday half completely, sourced from WCC's own
published policy (ADR 0029, ADR 0038). The weather half was never scoped as an issue
and never built. `docs/prd1.md`'s FR-07 added it as a new requirement but flagged an
open question ahead of any design work: does WCC publish a structured,
machine-readable weather-disruption-to-collection-schedule feed, equivalent to the
holiday policy page ADR 0029/0038 already sources? This issue's first and only job
was to answer that question via real search before any design, and explicitly ruled
out fabricating synthetic weather data to force the feature to exist regardless of
the answer.

## Decision

Do not build FR-07. No structured, machine-readable, WCC-published
weather-disruption-to-collection-schedule data source exists (research conducted
2026-08-07 — see "Alternatives considered" for what was checked). `ShiftAlertBanner`
and `computeHolidayShift` remain unchanged and holiday-only. FR-07 is infeasible
without a data source, not merely unscheduled.

## Alternatives considered

### A (chosen): Record infeasibility via this ADR; do not build
- **Pros:** Honest — matches what was actually found. No fabricated or
  proxy-derived weather data enters the app. Directly satisfies the issue's explicit
  instruction not to fabricate synthetic weather data.
- **Cons:** FR-07 stays unimplemented and `vision.md` §4B's weather half remains
  aspirational, with no committed path to closing it.

### B: Wire MetService's severe-weather CAP feed in as a proxy signal
- **Pros:** MetService does publish a real, structured, machine-readable severe
  weather warnings feed (CAP format, catalogued at
  `catalogue.data.govt.nz/dataset/metservice-severe-weather-watches-and-warnings`,
  RSS at `metservice.com/warnings`) — genuinely real data, not invented.
- **Cons:** The feed is a general regional weather-warning signal, not a WCC
  collection-disruption feed — it has no concept of "collection shifted by N days."
  Any wiring would require inventing a threshold mapping warning severity to a
  shift, which is exactly the fabrication this issue prohibits, just laundered
  through a real upstream feed. Worse, it would actively mislead: a fetched WCC news
  update from 16 February 2026, during an active MetService severe-weather warning
  for the Wellington region, states collection ran "as per normal" that day. A
  warning-triggered banner would have told residents their collection shifted when
  it did not — eroding trust in the same banner that correctly reports holiday
  shifts today.

### C: Manually monitor WCC's news-and-events posts and hand-enter shift days when they occur
- **Pros:** Only fires on real, WCC-confirmed decisions — no fabrication, mirrors
  how `holidays`/`sorting_rules` seed data was manually confirmed against real WCC
  pages (ADR 0038, ADR 0054).
- **Cons:** Not a data source the app can query — it requires an ongoing human
  monitoring/editorial process during every severe-weather event, with no defined
  trigger, cadence, or owner (unlike holidays' predictable once-a-year
  confirmation). Weather disruptions are unscheduled and irregular by nature.
  Scoping this is a staffing/process decision, not a technical one, and is out of
  scope for this investigation issue.

## Trade-offs and consequences

Accepts that `vision.md` §4B's weather half and PRD v1 FR-07 remain unimplemented
with no committed timeline — the same kind of standing, recorded trade-off ADR 0065
made for the WCAG AAA claim, not a scheduled backlog item. Revisit only if WCC (or
another authoritative source) publishes a real, structured feed with a deterministic
weather-to-shift-days rule; re-opening this means re-running the same search, not
re-architecting `ShiftAlertBanner`/`computeHolidayShift`.
