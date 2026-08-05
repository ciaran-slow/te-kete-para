# ADR 0058: Compose the push opt-in toggle gated on address selection, not unconditionally

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #113

## Context

ADR 0048 deferred composing `<PushSubscriptionToggle>`
(`src/components/push-subscription-toggle.tsx`, #26) into any route until
#28 (bilingual payload delivery) and #110 (nightly cron invocation) both
closed — both now have.

Unlike ADR 0031/ADR 0053's `<ShiftAlertBanner>` precedent, this component
cannot simply be rendered unconditionally with `address={selected}` and
rely on its own internal null-handling, because it doesn't have any:
`PushSubscriptionToggle`'s optional `addressId` prop is not a display
concern, it is a **functional** dependency. `POST /api/notifications/subscribe`
stores it as the `address_id` FK on the subscription row
(`src/app/api/notifications/subscribe/route.ts`), and the nightly
dispatcher (`src/lib/notifications/dispatcher.ts`) left-joins on exactly
that column to resolve which zone's schedule to summarize —
`planDispatchForSubscription` returns `null` (a no-op) whenever
`address_id` is `null`, by the function's own docstring "the only no-op
path reachable today." A subscription created with no `addressId` will
**never** deliver a single reminder, silently, indefinitely.

That is the identical shape of harm ADR 0048 itself was written to
prevent (a resident opts in, believes they're covered, isn't) — just
surfaced one level down: instead of "no delivery mechanism exists at
all," it's "this specific subscription can never be delivered to."
Composing the toggle without addressing this would satisfy #113's
acceptance criteria on paper while reopening the exact problem ADR 0048
closed.

The component itself has no state for "no address selected yet" — its
`Status` union (`checking | unsupported | misconfigured | unsubscribed |
subscribing | subscribed | unsubscribing | denied | action-error`) has no
such variant, and its existing test suite (`push-subscription-toggle.test.tsx`)
exercises it standalone with no `addressId` at all, asserting normal
enabled `unsubscribed`/`subscribed` transitions. #113's own acceptance
criteria require that suite to keep passing **unmodified**, which rules
out adding a new gating state inside the component in this PR.

## Decision

Render `<PushSubscriptionToggle addressId={selected.id} />` from
`src/app/address-schedule.tsx`, **conditionally, only when
`selected !== null`** — appended after `<ScheduleDisplay>`. With no
address selected, the toggle is not in the tree at all, so there is no
path through this composition site that can ever produce a subscription
with a null `addressId`.

`push-subscription-toggle.tsx` and its test file are unmodified.

A separate, pre-existing gap this makes reachable for the first time —
the component doesn't re-subscribe when `addressId` changes after an
initial subscribe, so a resident who changes address while already
subscribed keeps notifications pointed at their old address until they
manually toggle off/on — is tracked as issue #126, not fixed here; see
Trade-offs.

## Alternatives considered

### A (chosen): conditional render, gated on `selected !== null`
- **Pros:** zero risk of ever creating a functionally-dead subscription
  from this composition site; requires no change to the already-tested
  component; mechanically simple, matching this issue's actual scope
  ("compose an already-built component," not "redesign its states").
- **Cons:** the toggle disappears and reappears as the resident
  searches/clears their address, rather than staying mounted like
  `<ShiftAlertBanner>`/`<ScheduleDisplay>` do. Acceptable: those two
  components have a real "no address" *display* state to fall back to;
  this one has no honest such state to show, so hiding it entirely is
  more correct than showing a switch that would misbehave if used.

### B: always render, passing `addressId={selected?.id ?? null}`
- **Pros:** visually consistent with how `<ShiftAlertBanner>` and
  `<ScheduleDisplay>` are always mounted.
- **Cons:** rejected — this is the harm this ADR exists to prevent. A
  resident with no address selected could still flip the switch on,
  creating a `addressId: null` subscription that the dispatcher will
  never deliver against, permanently and silently.

### C: modify `PushSubscriptionToggle` to add its own "no address selected" disabled state
- **Pros:** would let the composition site render it unconditionally,
  consistent with sibling components, and centralizes the gating logic
  where the other gating logic (`disabled` computation) already lives.
- **Cons:** rejected for this PR — it edits component behavior #113's own
  acceptance criteria pins as unmodified ("Existing component test suite
  for `<PushSubscriptionToggle>` still passes unmodified"), and expands
  this issue from "compose" into "redesign the component's state
  machine," disproportionate scope for a follow-up issue whose entire
  premise is that #26 already built and tested the component fully.

### D: a dedicated settings route instead of `address-schedule.tsx`
- **Pros:** matches the issue text's other suggested option; separates
  "notification preferences" from "today's schedule" conceptually.
- **Cons:** rejected — this is a single-route app (ADR 0011); a new route
  needs new navigation, a new page, and its own a11y/translation
  coverage, all unscoped and disproportionate to composing one component.
  It also wouldn't remove the addressId problem above — a settings page
  still needs to know *which* address to attach the subscription to, and
  the only address the app currently tracks is the one selected on this
  same page, so a separate route buys no real decoupling today.

## Trade-offs and consequences

Accepts that the toggle is only reachable once a resident has selected an
address, not unconditionally like its sibling components — the correct
trade-off given the component has no honest "no address" state to fall
back to, and building one is out of scope here. Accepts, and does not
fix, that the toggle doesn't reactively re-subscribe when the resident
changes address while already subscribed — a latent gap in #26's
component design that this composition makes reachable for the first
time; tracked as issue #126. Revisit trigger: that issue landing, or a
future decision to give the component its own "no address" state
(superseding Alternative C's rejection here).
