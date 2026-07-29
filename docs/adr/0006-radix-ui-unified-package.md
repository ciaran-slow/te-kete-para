# ADR 0006: Radix UI via the unified radix-ui package

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #5

## Context

docs/architecture.md §2A and docs/vision.md §5 mandate Radix UI headless
primitives as the accessibility foundation. The first consumer lands with
#5 (a Separator on the homepage and a Switch exercised by the a11y
harness), and a queue of issues follows: the language toggle (#8), address
autocomplete (#12), sorting search (#21), shift-alert banner (#24), and
push opt-in UI (#26). Radix ships in two forms: one `@radix-ui/react-*`
package per primitive, or the unified `radix-ui` package (1.6.7 at
planning time) exposing every primitive as a tree-shakeable namespace.
Which form the repo standardises on decides how every later UI issue adds
primitives.

## Decision

Depend on the unified `radix-ui` package (in `dependencies`). Primitives
import as namespaces — `import { Separator, Switch } from "radix-ui"` —
and later issues use new primitives without touching `package.json`.

## Alternatives considered

### Unified radix-ui package (chosen)
- **Pros:** one dependency and one version for all primitives; no
  per-issue dependency decisions or lockfile churn; internal Radix
  utilities stay version-aligned; tree-shaking keeps unused primitives out
  of the bundle; it is Radix's currently recommended installation.
- **Cons:** a version bump moves every primitive at once, so a regression
  in one primitive's release can block an unrelated upgrade; marginally
  larger `node_modules` than a single-primitive install.

### Per-primitive @radix-ui/react-* packages
- **Pros:** smallest possible install per issue; primitives can be pinned
  and upgraded independently.
- **Cons:** every future primitive is a new dependency decision (per repo
  policy, a new ADR each time); versions drift between primitives that
  share internal utilities; repeated lockfile churn across #8/#12/#21/#24/#26.

### A different headless library (React Aria, Headless UI)
- **Pros:** credible accessibility pedigrees; React Aria has broader
  behaviour coverage in places.
- **Cons:** architecture.md and vision.md already mandate Radix; swapping
  libraries is a product-architecture reversal far beyond this issue's
  packaging question and would need its own superseding ADR.

## Trade-offs and consequences

All primitives ride one version line: upgrades are simpler to reason about
but all-or-nothing. Accepted knowingly — if a Radix release regresses one
primitive, the escape hatch is pinning the previous unified version until
fixed (or, in the extreme, vendoring that primitive under a superseding
ADR). Bundle size is governed by tree-shaking, so importing the unified
package costs nothing for unused primitives. This decision is packaging
only; it does not pre-commit any future issue to a particular primitive.
