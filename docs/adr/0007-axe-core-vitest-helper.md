# ADR 0007: Accessibility assertions via a repo-owned axe-core helper

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #5

## Context

docs/architecture.md §2A and docs/prd0.md FR-03 say accessibility checks
run "via @axe-core/react embedded in Vitest". That package cannot do the
job: its API (`axe(React, ReactDOM, 1000)`) observes re-renders and logs
violations to the browser dev console, returning nothing a test can
assert on — it cannot fail a Vitest test, which is exactly what issue #5's
acceptance criteria require ("fails the test on any violation"). The issue
allows "a Vitest-compatible axe wrapper" instead. Candidates: jest-axe
(11.0.0, Jest-flavoured matchers that also run under Vitest), vitest-axe
(0.1.0, effectively unmaintained), or the axe-core engine (4.12.1)
wrapped by a small repo-owned helper. Two jsdom facts constrain any
choice: jsdom performs no layout or painting, so axe's contrast rules
cannot compute; and Testing Library renders fragments into a bare <div>,
so axe's best-practice "region" rule (all content inside landmarks)
false-positives on every component test.

## Decision

Add `axe-core` as a devDependency and own the integration:
`expectNoA11yViolations(container)` in `__tests__/helpers/a11y.ts` runs
`axe.run` with `color-contrast`, `color-contrast-enhanced`, and `region`
disabled, rejects detached containers with guidance, and throws one
formatted error listing every violation (rule id, impact, help text,
offending nodes, help URL). docs/architecture.md §2A is updated to match;
docs/prd0.md stays as written (it is a requirements snapshot — this
record documents the substitution).

## Alternatives considered

### axe-core + repo-owned helper (chosen)
- **Pros:** one small dev dependency — the engine itself; full control of
  rule configuration, with each exclusion documented next to its
  compensating control; failure formatting owned by the repo; the helper
  is the exact function the acceptance criteria name, not a wrapper
  around a wrapper; no Jest-typed API surface under Vitest.
- **Cons:** the repo owns ~40 lines of formatting and config that jest-axe
  would otherwise provide, plus responsibility for tracking axe-core
  major-version rule changes.

### jest-axe under Vitest
- **Pros:** battle-tested violation formatter and config merging;
  well-known `toHaveNoViolations` idiom.
- **Cons:** Jest-flavoured types and matcher registration under Vitest;
  the AC-named helper would wrap jest-axe wrapping axe-core; extra
  transitive dependencies for formatting the repo can write in 20 lines.

### vitest-axe
- **Pros:** literally a "Vitest-compatible axe wrapper".
- **Cons:** version 0.1.0 and effectively unmaintained; trails axe-core
  releases; adopting an abandoned wrapper as a quality gate is a worse
  risk than owning the 40 lines.

### @axe-core/react (the documented name)
- **Pros:** matches architecture.md/prd0.md wording; could someday serve
  as a dev-mode console overlay.
- **Cons:** not assertable — cannot fail a test, so it cannot meet the
  acceptance criteria at all; hooks ReactDOM at runtime, which fits an
  app entry point, not a test suite.

## Trade-offs and consequences

Unit-level a11y coverage becomes real and blocking, at the cost of a
documented gap: contrast and document-level rules are not checked in
jsdom. Compensating controls, by name: the CI-wired axe suite (#17), the
Lighthouse accessibility budget which does compute contrast (#31), and
manual screen-reader QA (#18). The helper is now the sanctioned way to
assert accessibility in Vitest — component tests must not import axe-core
directly, so rule exclusions stay in one place. Revisit this record if
the helper's configuration sprawls (jest-axe becomes the better trade) or
when an axe-core major renames rules the tests assert on.

A third gap is wider than the two rule exclusions above and is easy to
miss, because it is a property of axe rather than of this configuration.
`axe.run` returns three buckets — `violations`, `passes`, and `incomplete`
for checks it could not decide — and the helper fails only on
`violations`. Because jsdom performs no layout, every visibility-dependent
rule lands in `incomplete`: a focusable element inside `aria-hidden="true"`
(keyboard-reachable hidden content, a serious defect and a common mistake
with overlay primitives such as Dialog and Popover) returns
`violations: []` and `incomplete: ["aria-hidden-focus"]`, so the helper
passes it. A green Vitest a11y assertion therefore means "no violation axe
could decide here", not "accessible". This matters most for the Radix
overlay work in #8, #24, and #26; those rules return a real verdict only in
a browser, so #17 (Playwright-side axe) and #31 (Lighthouse) are the
compensating controls, the same pair that covers contrast.

Deliberately **not** resolved by failing on `incomplete`:
`aria-hidden-focus` goes indeterminate whenever content is hidden, so that
would turn legitimate tests red and train contributors to bypass the
helper — a worse outcome than a documented gap. Two changes would be safe
if the gap starts biting: appending incomplete rule ids to the failure
message (visible only on tests that already fail), or asserting on
`incomplete` in the specific tests where a rule is known to be
indeterminate. jest-axe checks only `violations` too, so switching wrappers
would not close this.
