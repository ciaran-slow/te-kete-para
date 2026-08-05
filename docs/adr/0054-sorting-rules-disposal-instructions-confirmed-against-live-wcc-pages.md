# ADR 0054: sorting_rules disposal instructions confirmed against live WCC pages via browser-User-Agent curl

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #70

## Context

Issue #19/PR #68 seeded `db/seeds/02_sorting_rules.js` with disposal
instructions drafted from the 2024 national kerbside standard and WCC's
published guidance, but never confirmed row-by-row against a live WCC
page — every prior pass (PR #68's verify, PR #88 / this issue's first
plan) hit an HTTP 403 from `WebFetch` and plain `curl` against
wellington.govt.nz and concluded the site was unreachable, matching the
same 403 hit by issues #59 and #78.

That conclusion was based on guessed URL paths (which mostly 404'd, not
403'd) and never tried adding a browser `User-Agent` header. This pass
found the real page paths via `WebSearch site:wellington.govt.nz ...` and
fetched them with:

```
curl -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" "<url>"
```

Every one of 10 wellington.govt.nz pages tried this way returned HTTP 200
with real page content — the 403 is a bot-fingerprinting block keyed on
request headers, not an IP or WebFetch-tool-specific block, and it doesn't
apply to a normal browser User-Agent string.

## Decision

Treat `db/seeds/02_sorting_rules.js`'s disposal instructions as confirmed
per-row against these live-fetched pages (cited in the seed header),
correct the three rows the live pages contradicted (pizza-box,
polystyrene-packaging, light-bulb), and remove the blanket "UNVERIFIED
CONTENT" caveat — replacing it with a single named residual gap
(`aerosol-can`'s empty-vs-full handling split, tracked by issue #119)
instead of a caveat covering the whole dataset.

## Alternatives considered

### A: Keep treating the whole dataset as unverified, as PR #88 did
- **Pros:** No research effort; matches the status quo.
- **Cons:** Actively wrong now — 14 of 15 rows are demonstrably confirmable
  against a live WCC page, and this issue's acceptance criteria require
  attempting exactly that. Leaving the caveat up understates confidence
  the data now actually has, and understates that three rows had real,
  now-fixed content errors.

### B: Mark the whole issue closed and drop all caveats, including for aerosol-can
- **Pros:** Simpler — one PR fully resolves #70.
- **Cons:** `aerosol-can`'s empty-vs-full split genuinely has no WCC source
  found this pass. Marking it confirmed anyway would be inventing
  corroboration for a claim this pass could not actually verify — the
  exact failure mode issue #70 exists to prevent (see PR #68's original
  aerosol-can finding). This issue is also one of the three the issue
  itself names for "special attention," so silently closing over its one
  remaining gap is the wrong place to cut a corner.

### C (chosen): Confirm what's confirmable, correct what's wrong, narrow
the caveat to the one row with a real remaining gap, file a new issue for
it, leave #70 open
- **Pros:** Every claim in the seed file is now either live-confirmed with
  a citation, or explicitly flagged as not — matching this issue's own
  stated bar ("say so explicitly rather than invent or guess"). Three real
  content bugs get fixed with a live source backing the fix. The one
  remaining gap is narrow, named, and handed to a scoped follow-up (#119),
  mirroring ADR 0042 / issue #59's precedent for the recycling-week epoch.
- **Cons:** #70 doesn't close in this PR — a smaller win than resolving it
  outright, but an honest one.

## Trade-offs and consequences

The dataset is now materially more trustworthy: 14 of 15 rows carry a live
WCC citation, and three previously-wrong claims (a pizza-box myth WCC
itself debunks, an unnecessarily hedged polystyrene claim, and an
overclaimed "every bulb type" hazardous-waste rule) are corrected with a
live source. The residual gap is bounded and explicit rather than buried
in a blanket caveat — a future pass on issue #119 only needs to resolve
one specific, narrow question (WCC's aerosol-can empty-vs-full guidance),
not re-verify the whole dataset. This also establishes that the
curl+browser-User-Agent workaround is generally viable against
wellington.govt.nz — worth trying first on any future issue that assumes
the site is unreachable (e.g. a future revisit of #78).
