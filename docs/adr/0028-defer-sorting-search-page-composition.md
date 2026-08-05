# ADR 0028: Build the sorting search UI now, defer composing it into a live route

- **Status:** superseded by ADR 0064
- **Date:** 2026-08-03
- **Issue:** #21

## Context

#21 is explicitly blocked by #69 and #70: the `sorting_rules` seed data
`<SortingSearch>` would render is unverified (machine-drafted Te Reo
Māori text, disposal instructions not confirmed against WCC's live
pages) — recorded on #21 itself and in `docs/architecture.md` §2C: "Do
not surface it to end users before both are closed." This app deploys
from `main` (architecture.md §1), so merging any change that renders
`<SortingSearch>` from a reachable route is equivalent to shipping that
content to real users. Both blocking issues were still open when this
plan was written.

## Decision

Build `<SortingSearch>` (`src/components/sorting-search.tsx`), its
supporting hook and types, and its full test suite in this PR. Do **not**
import or render it from `src/app/page.tsx` or any other route. The
component's own test file (`__tests__/components/sorting-search.test.tsx`)
exercises it directly via Testing Library, satisfying the issue's
acceptance criteria ("component test simulates keyboard typing...")
without any route rendering it. Wiring it into `page.tsx` — importing it
and adding one section, the same way `<AddressSchedule>` is composed
today — is left for a follow-up once #69 and #70 both close.

## Alternatives considered

### A. Build fully, leave unwired from any route (chosen)
- **Pros:** the PR is fully reviewable, tested, and mergeable now with
  zero risk of exposing unverified content, since merging changes nothing
  a user can reach; the follow-up to wire it in is small and mechanical.
- **Cons:** the feature isn't actually usable by anyone until a second,
  small change lands; a reviewer must know to check that no route renders
  it (mitigated: `git grep -n "SortingSearch"` outside
  `src/components/sorting-search.tsx` and its test file should show
  nothing under `src/app/`, and this ADR records the expectation
  explicitly for that check).

### B. Wire it in behind a feature flag / environment variable
- **Pros:** the composition code ships now; flipping a flag later is even
  smaller than adding an import.
- **Cons:** adds a flag with its own removal-tracking burden and a new
  "is the flag off in production" fact to verify at every deploy; the
  actual problem is the *content*, not the *code path* — a flag protects
  against the same single failure mode (someone forgets to check it) that
  simply not rendering the component already avoids for free, with less
  machinery.

### C. Do not build any of it until #69/#70 close
- **Pros:** avoids any chance of the block being misjudged.
- **Cons:** contradicts being handed #21 to plan/build now; the component
  carries no user-facing risk while it exists only in the source tree and
  its own tests — only rendering it from a route does.

## Trade-offs and consequences

Accepted: this PR ships a component nobody can reach yet. The follow-up
(wire `<SortingSearch>` into `page.tsx`) must happen once #69 and #70
close, or the feature stays permanently invisible despite being fully
built — revisit-trigger: close of both #69 and #70.
