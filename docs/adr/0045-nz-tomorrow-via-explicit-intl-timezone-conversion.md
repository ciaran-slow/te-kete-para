# ADR 0045: NZ "tomorrow" resolved via explicit Pacific/Auckland Intl conversion

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #27

## Context

`computeCollectionRuleSet` (rules.ts) requires a UTC-midnight `Date`
representing the NZ calendar date (ADR 0017). The existing client-side
precedent for "today," `todayAsUtcCalendarDate` in schedule-display.tsx,
deliberately uses local `Date` getters (`getFullYear`/`getMonth`/`getDate`)
— correct there because it runs in the viewer's browser, physically in
Wellington (ADR 0018). The nightly dispatcher instead runs server-side,
where the host process's timezone is not guaranteed to be Pacific/Auckland.
Vitest pins `TZ=Pacific/Auckland` suite-wide (ADR 0017), but that pin covers
only the test process — a typical serverless/edge runtime defaults to UTC.
An implementation using local getters here would pass every test in this
suite (local getters already equal Pacific/Auckland time under the pin)
while silently computing the wrong NZ calendar date in production — the
same class of bug ADR 0017 exists to catch for rules.ts, but inverted: the
safety net that protects rules.ts is exactly what would hide this bug for a
naive dispatcher implementation.

## Decision

Compute NZ "today" via `Intl.DateTimeFormat("en-CA", { timeZone:
"Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit"
}).formatToParts(now)`, extract the Y/M/D integers, add one to the day, and
re-express via `Date.UTC(...)` for `computeCollectionRuleSet`. Never local
`Date` getters on `now`, and never a fixed UTC+12/+13 offset. A dedicated
test (`dispatcher.test.ts`) spies on the `Intl.DateTimeFormat` constructor
and asserts it is called with an explicit `timeZone: "Pacific/Auckland"` —
closing the blind spot the suite-wide TZ pin would otherwise leave open.
(An earlier draft of this test tried to prove the same thing by temporarily
reassigning `process.env.TZ` around the call; that doesn't work in this
Vitest process — once `TZ` is read once, per-process TZ caching means local
`Date` getters keep resolving against the original value for the rest of
the process's life, so a later reassignment is silently a no-op and the
local-getter shortcut this ADR rejects would have passed that test
unchanged. The constructor spy asserts the actual mechanism instead of an
environment side effect that doesn't take hold.)

## Alternatives considered

### Intl.DateTimeFormat with explicit timeZone (chosen)
- **Pros:** Correct regardless of the host process's `TZ`. Uses the real
  IANA transition dates (backed by Node's bundled ICU data) rather than a
  hand-maintained DST rule, so it stays correct in years beyond 2026 without
  a code change.
- **Cons:** Slightly more code than a getter call; `formatToParts` parsing
  is mildly verbose.

### Local Date getters (mirroring `todayAsUtcCalendarDate`)
- **Pros:** Simplest code, consistent with the existing client-side
  pattern.
- **Cons:** Only correct if `process.env.TZ` happens to already be
  Pacific/Auckland — true in the Vitest suite (masking the bug) and false on
  a UTC-default production server. Exactly the failure mode this issue's
  DST requirement exists to catch.

### Hardcoded fixed UTC+13 (or +12) offset arithmetic
- **Pros:** No `Intl` dependency.
- **Cons:** Wrong for roughly half the year (whichever regime isn't
  hardcoded), and specifically wrong on dates near the two annual
  transitions — the exact scenario this issue's tests target.

## Trade-offs and consequences

Takes a firm dependency on the host JS runtime shipping full ICU /
timezone data (Node does, by default, and nothing in this repo's build
restricts it). If that ever changed, `Pacific/Auckland` could become
unavailable to `Intl.DateTimeFormat` — accepted as extremely unlikely for
this stack.
