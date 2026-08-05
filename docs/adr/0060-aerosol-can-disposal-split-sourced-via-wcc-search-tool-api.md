# ADR 0060: aerosol-can disposal split sourced via WCC's reverse-engineered search-tool API

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #119

## Context

Issue #70 / ADR 0054 confirmed 14 of 15 `sorting_rules` rows against live
wellington.govt.nz pages, leaving one gap: `aerosol-can`'s claim that an
empty can goes in general rubbish while a full one must go to a WCC
transfer station as hazardous waste. WCC's static "Domestic hazardous
waste" page lists exactly what it accepts as hazardous waste, and aerosols
aren't on that list at all — so no static WCC page could confirm or refute
the split either way. WCC does publish a JS-driven "What to do with your
waste" lookup widget at
`.../sorting-rubbish-recycling/what-to-do-with-your-waste`, which issue
#119 itself flagged as unscraped and backed by a POST to
`/Handlers/SearchBucketHandler.ashx`.

## Decision

Reverse-engineer that endpoint directly instead of driving a browser
against the rendered widget: fetch the search page's static HTML (browser
User-Agent, the same 403-bypass established in ADR 0054) to read the
hidden `bucketId` form field, then POST `action=showall&bucketid=<id>` as
multipart form data to `https://wellington.govt.nz/Handlers/SearchBucketHandler.ashx`
with the same browser User-Agent. The response is JSON containing every
item the tool knows, each with a `Title`, `Keywords`, and an HTML `Content`
field — read the "Aerosol and spray cans" item's `Content` directly as the
source for the corrected seed row.

## Alternatives considered

### A: Leave the split unconfirmed / keep inferring from other councils
- **Pros:** No extra research effort.
- **Cons:** This is exactly the gap issue #119 exists to close; leaving it
  open indefinitely means the dataset keeps a caveat this pass could have
  resolved, and PR #88's original sin (inventing corroboration for an
  unconfirmed claim) is only avoided, not fixed.

### B: Drive a headless browser against the rendered widget
- **Pros:** Doesn't depend on reverse-engineering an undocumented internal
  endpoint; reads the same DOM a real user sees.
- **Cons:** Adds a heavy new dependency (a headless-browser package) for a
  one-off content-sourcing task that never runs again at runtime — the
  result is baked into a seed file, not fetched live by the app. Pure
  overkill for what this needs.

### C (chosen): POST directly to the discovered `SearchBucketHandler.ashx` endpoint and parse its JSON
- **Pros:** No new dependency — reuses the curl-plus-browser-User-Agent
  technique already established in ADR 0054. Returns the exact same
  underlying data the widget renders, not a re-derived guess. Verified
  reliable by cross-checking four already-confirmed rows (paint,
  batteries, light bulbs, polystyrene) against this same API and finding
  identical conclusions to ADR 0054's independently-sourced ones. One-time
  fetch baked into a seed file — no ongoing maintenance burden and no
  runtime dependency on the endpoint.
- **Cons:** Depends on an undocumented internal API that WCC could change
  or remove without notice. Acceptable here because it's a one-time
  content-sourcing lookup for a static seed file, not something the
  running app calls.

## Trade-offs and consequences

The `aerosol-can` seed row is now backed by a live, authoritative WCC
source instead of inference from other councils' guidance, closing the
last gap ADR 0054 left open. This also establishes that the browser-User-
Agent bypass from ADR 0054 extends beyond static wellington.govt.nz pages
to its internal AJAX endpoints — worth trying first on any future issue
that needs content currently locked behind a JS-driven WCC widget rather
than a static page.
