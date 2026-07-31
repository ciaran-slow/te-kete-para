# ADR 0021: Shared `StatusRegion` component for aria-live status announcements

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #16

## Context

FR-03 (docs/prd0.md) and vision.md §3 require "proper `aria-live` region
announcements for dynamic schedule changes" and "descriptive ARIA labels
for dynamic countdowns and status changes." Two real consumers already
duplicate this today: `ScheduleDisplay`'s `<section aria-live="polite"
aria-atomic="true">` wrapping today's computed collection rules (ADR
0019), and `AddressSearch`'s `<p aria-live="polite">` status paragraph
reporting the combobox's loading/empty/error state. They differ in host
element, atomicity, and optional heading association, so a single
hard-coded shape cannot serve both without changing one of their existing,
already-tested behaviours.

The issue's acceptance criteria ask for a shared pattern "used by schedule
display and holiday shift alerts." The shift-alert banner is #24, and its
own dependencies (#22 Wellington public holiday calendar & override
schema, #23 holiday shift calculation logic) are unbuilt, so #24 cannot be
a real consumer in this PR without pulling unrelated, out-of-scope work
forward. `AddressSearch` is used instead as the second real consumer, so
the shared component is proven shared by usage today, not only in
principle; #24 is expected to adopt the same component when it lands (ADR
0011 already named the shift-alert banner as a future consumer of shared
UI primitives).

## Decision

Add `src/components/status-region.tsx` exporting `StatusRegion`: a
presentational, stateless component taking `as` (`"section" | "p" |
"div"`, default `"div"`), `atomic` (boolean, default `false` — when false
the `aria-atomic` attribute is omitted entirely rather than written as
`"false"`), `headingId` (sets `aria-labelledby`; omitted attribute when
absent), `className`, and `children`. It always sets `aria-live="polite"`.
`ScheduleDisplay` and `AddressSearch` are refactored to render it in place
of their inline markup, passing exactly the props that reproduce their
current DOM output (`atomic` + `headingId` for `ScheduleDisplay`'s
`<section>`; `as="p"` only for `AddressSearch`'s status paragraph), so
their existing component test suites require no assertion changes.

## Alternatives considered

### A: Global singleton live-announcer (portal + `useAnnounce()` hook)
- **Pros:** a common pattern for toast-style announcements; would also
  suit a future transient shift-alert banner not tied to a specific
  visible element.
- **Cons:** introduces a new architectural concept (a single mounted
  portal, imperative announce calls) this repo has none of yet; changes
  the *visible* UI contract of both existing consumers, whose live text is
  deliberately visible in place rather than routed through a hidden global
  region; no current requirement for a transient/ephemeral announcement
  that outlives its trigger.

### B (chosen): Parameterized local `<StatusRegion>` component
- **Pros:** matches both existing consumers' actual shapes with no
  behaviour change (verified: `schedule-display.test.tsx` and
  `address-search.test.tsx` assertions pass unmodified); zero new
  dependencies; small and stateless; composes into whatever markup #24's
  shift-alert banner turns out to need (a visible element announcing
  "Collection shifted to Saturday" is exactly this shape).
- **Cons:** the `as` prop is a small API surface future callers must
  remember to set correctly (`atomic`/`headingId` are meaningful only
  together); does not solve a global/toast-style announcement need if one
  arises later — that would be a new, additive decision (Alternative A)
  once a real consumer needs it.

### C: Leave the two inline aria-live blocks as they are
- **Pros:** zero risk, zero code change.
- **Cons:** does not satisfy the issue's acceptance criterion of an actual
  shared component; leaves the two blocks free to drift out of sync
  exactly as the focus-ring/touch-target styling drifted before ADR 0020
  fixed that for a parallel case.

## Trade-offs and consequences

Accepts that `StatusRegion`'s two current real consumers were reached by
refactoring already-shipped, already-tested markup rather than by building
genuinely new UI — the risk carried here is a byte-for-byte DOM regression
in either, which is why both existing component test suites are the
acceptance gate for the refactor (§5 of the issue #16 plan), not new
assertions written to match new output. #24 (shift-alert banner) is
expected to render its content through `StatusRegion` too; if its needs
turn out to require imperative/global announcement (Alternative A) rather
than a locally-rendered region, that is a future superseding decision, not
one this ADR forecloses.
