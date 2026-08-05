# ADR 0068: Named error subclass distinguishes an unresolved recyclingCalendarGroup from other rules.ts rejections

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** #131

## Context

ADR 0059 made `computeCollectionRuleSet` (`src/lib/schedule/rules.ts`) throw
a `RangeError` when a suburban zone has no resolvable
`recyclingCalendarGroup`, deliberately preferring a rejected unknown over a
silently-wrong assumed Calendar 1. Every current caller —
`schedule-display.tsx`'s `computeSchedule` and `dispatcher.ts`'s
`planDispatchForSubscription` — already wrapped the call in a `try/catch`
that predates ADR 0059 and treats *any* thrown error identically: "no
schedule for this address." That collapses three distinct situations into
one:

1. An unresolved `recyclingCalendarGroup` — a real, addressable data gap
   (ADR 0059's own "Cons" section: every future seeded address needs an
   individually-confirmed value).
2. A blank/whitespace `zone` string — a defensive-only branch; both existing
   test suites label their fixture for this "can't happen from real data."
3. An invalid `Date` — also can't happen from real production call sites.

The nightly dispatcher's silent catch made case 1 worse than "no schedule
today": because `planDispatchForSubscription` returns `null` before
`sendDispatchPayload` is ever called, the subscription never appears in
`sendDispatchBatch`'s output either, so `pruneGoneSubscriptions` never sees
it — it is excluded from *every future nightly run, forever*, with no log
line anywhere (issue #131). Fixing that, and letting the client show a more
specific message than the generic schedule-error placeholder for case 1,
both require each caller to tell case 1 apart from cases 2 and 3.

## Decision

Export a new `UnresolvedRecyclingCalendarGroupError` class from `rules.ts`
that extends `RangeError` and carries the exact same message text as today,
thrown only from the `recyclingCalendarGroup` validation branch. Both
callers catch broadly as before but branch on
`err instanceof UnresolvedRecyclingCalendarGroupError` to decide whether to
log (dispatcher) or show the more specific message (client). Cases 2 and 3
keep throwing a plain `RangeError` and both callers keep treating them
exactly as before (silent no-op / generic error message) — this ADR touches
only case 1.

## Alternatives considered

### A: Re-check the raw classification fields in each caller
- **Pros:** No change to `rules.ts`'s public surface at all.
- **Cons:** Duplicates the exact condition
  (`zone.recyclingCalendarGroup !== 1 && !== 2`, gated on
  `!isInnerCityNightCollection`) in two call sites that must then stay in
  sync with `rules.ts`'s own gate forever — the two are trivially easy to
  drift apart (e.g. a future change to the suburban/inner-city split in
  `rules.ts` silently stops being reflected in one caller's pre-check).
  Exactly the kind of duplication ADR 0015 already rejected once by keeping
  classification logic out of callers.

### B: Return a discriminated-union `Result` type instead of throwing
- **Pros:** No exceptions at all; every caller is forced by the type system
  to handle both branches.
- **Cons:** A much larger change to `computeCollectionRuleSet`'s existing
  contract, touching its two other throw sites (invalid date, blank zone)
  and every existing test in `rules.test.ts`, `dispatcher.test.ts`,
  `dispatch-runner.test.ts`, `push-sender.test.ts`, and
  `payload-builder.test.ts` that calls it directly or asserts its `toThrow`
  behavior. Disproportionate to a log-line-scale fix; not worth relitigating
  `rules.ts`'s exception-based contract for this issue.

### C (chosen): Named `RangeError` subclass
- **Pros:** Single source of truth for the validation condition stays in
  `rules.ts`; both callers gain a precise, type-safe way to distinguish one
  rejection reason from another; `instanceof RangeError` still holds, so any
  existing or future broad catch/check keeps working unchanged; the message
  text is unchanged, so the existing `rules.test.ts` assertion needs no
  edit.
- **Cons:** Adds one class to `rules.ts`'s public surface. If a future issue
  (e.g. #134's `collection_weekday` wiring) needs the same distinguishing
  power for a different rejection, it either reuses this pattern (another
  named subclass) or this ADR gets revisited.

## Trade-offs and consequences

The nightly dispatcher now logs every night a subscription is silently
excluded for this reason, until the address's `recycling_calendar_group` is
confirmed and seeded — visible in whatever monitoring already reads the
dispatcher's `console.error` output, closing the "no log line anywhere" gap
this issue reported. The client shows a more specific, still-generic (no
per-address detail is exposed to avoid implying a false ETA) message for the
same condition. This does not change ADR 0059's decision to reject rather
than default — a suburban address with no resolvable
`recyclingCalendarGroup` still never gets a computed schedule; it is just no
longer silent about it.
