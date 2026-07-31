# ADR 0022: Browser-level axe checks via a hand-rolled Playwright helper

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #17

## Context

ADR 0007 documents three gaps in the jsdom-based Vitest a11y helper
(`__tests__/helpers/a11y.ts`): `color-contrast`/`color-contrast-enhanced`
and `region` are disabled because jsdom performs no layout, and
visibility-dependent rules land in axe's `incomplete` bucket rather than a
real pass/fail. Both docs/architecture.md §2A and ADR 0007 name "the CI axe
suite (#17)" as the compensating control for the first two. The Playwright
E2E layer already exists (ADR 0001) and axe-core (4.12.1) is already a
devDependency the jsdom helper depends on. This issue needs a way to run
real axe-core audits against pages rendered in Playwright's Chromium.

## Decision

Add a repo-owned helper, `e2e/helpers/axe.ts`, exporting
`expectNoA11yViolations(page)`. It injects the already-installed
`axe-core/axe.min.js` into the page via
`page.addScriptTag({ path: ... })` (resolved with
`createRequire(import.meta.url)`, not a new dependency), runs
`window.axe.run()` inside the browser via `page.evaluate`, and throws a
formatted error (rule id, impact, help text, offending nodes, help URL —
the same shape as the jsdom helper's message) if any violations are
returned. No rules are disabled: a real Chromium layout computes contrast
and landmark/region checks correctly, which is the entire reason this tier
exists.

## Alternatives considered

### Hand-rolled helper injecting the existing axe-core devDependency (chosen)
- **Pros:** no new dependency; one axe-core version (4.12.1) shared by both
  the jsdom and browser tiers, so an axe major that renames or adds rules
  shows up identically in both suites instead of two independently-versioned
  packages drifting apart; mirrors ADR 0007's established precedent of
  owning ~40 lines of integration rather than pulling in a wrapper; the
  failure-message format matches the jsdom helper's, so every a11y test in
  the repo reads one format.
- **Cons:** the repo owns the injection/evaluation glue (~30 lines) that a
  maintained wrapper would otherwise provide; no built-in `include()`/
  `exclude()`/multi-frame API if the app grows enough routes/iframes to need
  one.

### @axe-core/playwright (Deque's official Playwright wrapper)
- **Pros:** official, maintained by the same team as axe-core; `AxeBuilder`
  gives structured `include()`/`exclude()`/`disableRules()` and frame
  handling without hand-rolled script injection; the natural choice for a
  many-route, many-iframe app.
- **Cons:** a new dependency, which per this repo's own discipline needs its
  own ADR-worthy justification; pins its own axe-core version as a
  transitive/peer dependency, which can drift from the 4.12.1 already
  pinned for the jsdom helper — two different rule sets silently deciding
  "accessible" under two different axe versions is exactly the
  inconsistency ADR 0007 chose to avoid by owning the integration; for a
  one-route app today, the extra API surface buys nothing yet.

### @axe-core/react
- **Pros:** none new — restates ADR 0007's rejection.
- **Cons:** cannot fail a test at all (logs to the console); would not
  satisfy "CI fails the build on any axe violation" regardless of which
  runner hosted it.

## Trade-offs and consequences

Keeps the dependency graph flat and keeps axe-core single-sourced across
both test tiers, at the cost of owning slightly more glue code and losing
`@axe-core/playwright`'s multi-frame/include-exclude conveniences. Revisit
if the app grows enough routes or iframes that hand-rolled scoping becomes
painful, or if axe-core changes its browser-injection shape in a way that
breaks `page.addScriptTag`.
