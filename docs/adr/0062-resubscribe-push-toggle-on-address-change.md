# ADR 0062: Re-POST on address change instead of a resubscribe prompt or new component state

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #126

## Context

`<PushSubscriptionToggle>` (`src/components/push-subscription-toggle.tsx`, #26) was
composed into `address-schedule.tsx` by #113 (ADR 0058), passed `addressId={selected.id}`,
conditionally rendered only when an address is selected. The component's mount effect
has an empty dependency array; nothing re-runs when `addressId` changes after an
initial subscribe. `handleSubscribe`'s POST only reads the current `addressId` prop
value when called from the user's own click — never from an effect keyed on the prop.
A resident who is already subscribed and then picks a *different* address keeps their
subscription's `address_id` FK (`push_subscriptions.address_id`) pointed at the old
address indefinitely. The nightly dispatcher
(`src/lib/notifications/dispatcher.ts`, `collectNightlyDispatchCandidates`) left-joins
on exactly that column to resolve zone/schedule data, so the resident keeps receiving
(or, if the two addresses are in different zones, silently stops correctly receiving)
reminders for a place they no longer track — until they manually toggle the switch
off and back on. ADR 0058 identified this as a pre-existing gap in #26's design,
newly *reachable* once #113 composed the component with a real, changeable address,
and deferred the fix to this issue.

`POST /api/notifications/subscribe` (`src/app/api/notifications/subscribe/route.ts`)
already upserts on `endpoint` and merges `address_id` on conflict — a repeat POST
for the same browser-level subscription with a different `addressId` already
produces the correct row. No API or schema change is needed; this is purely about
when the client sends that repeat POST.

## Decision

Add a `useEffect` in `PushSubscriptionToggle` keyed on `addressId` (plus `status` and
`locale`) that, when `addressId` has actually changed since last observed *and* the
toggle currently represents an active subscription (`subscribed`, or a previous
address-change POST failure), fetches the existing browser-level `PushSubscription`
via `getSubscription()` and re-POSTs it with the new `addressId` — the same request
shape `handleSubscribe` sends, extracted into a shared `postSubscription` helper. No
new browser-level `subscribe()` call; the endpoint/keys are unchanged, only the
server-side `address_id` needs to move. Failure surfaces a new `action-error`
variant (`from: "address-change"`, with copy specific to this action — see
Alternatives, option B) rather than reusing existing copy that would misdescribe
what happened; the browser-level subscription is left untouched on failure, exactly
like the existing unsubscribe-failure path leaves it untouched (`docs/architecture.md`
lines 137-142).

## Alternatives considered

### A (chosen): effect on `addressId`, re-POST via the existing upsert route
- **Pros:** closes the gap the moment it happens, with no resident action required;
  reuses the already-tested, already-correct server-side upsert-on-`endpoint`
  behavior; no new route, no schema change; matches the issue's own first suggested
  option.
- **Cons:** an address-change re-POST failure is invisible until the resident next
  looks at the toggle (no push/toast notification of the failure) — acceptable,
  because every other failure path in this component (subscribe/unsubscribe) has the
  identical property, and this component's only feedback channel today is its own
  status text.

### B: show a re-subscribe prompt and require explicit resident confirmation
- **Pros:** keeps every server write behind an explicit user action, arguably more
  consistent with "never subscribe without the resident clicking something" as the
  component's existing convention (both `handleSubscribe`/`handleUnsubscribe` are
  user-click-only, never effect-triggered).
- **Cons:** rejected — the resident already made the only decision that matters
  ("send me reminders"); re-prompting on every address change punishes exactly the
  residents this feature is for (people who move within the city, or are checking a
  second address) with a nag they'd have to dismiss/confirm every time, for a change
  that isn't actually opting them into anything new — the *subscription* isn't new,
  only which address it points at. Also does not fully close the gap by itself: if
  the resident ignores or misses the prompt, the stale `address_id` persists exactly
  as today.

### C: give the component a new "address changed, needs re-sync" display state
- **Pros:** most visible; would clearly separate "actively wrong" from the two
  existing action-error variants.
- **Cons:** rejected — the actual failure mode (re-POST rejected/failed) is
  indistinguishable in every observable way from the existing `action-error`
  variants (same disabled/checked shape, same "the browser-level subscription is
  fine, only the server write failed" recovery story); a full new `kind` would
  duplicate `checked`/`disabled`/`handleCheckedChange` branching that already exists
  for `action-error`, for a state whose only real difference is which words appear
  in the status text. The narrower fix — widening `action-error.from` by one value,
  §Decision — gets correct, non-misleading copy without that duplication.

### D: do nothing until the resident manually toggles (status quo)
- **Pros:** zero code change.
- **Cons:** rejected — this is the bug the issue exists to fix; ADR 0058 explicitly
  deferred it here rather than accepting it as permanent, on the basis that a
  resident who believes they're covered and isn't is the exact harm ADR 0048 was
  written to prevent.

## Trade-offs and consequences

Accepts that an address-change re-POST failure is silent until the resident revisits
the toggle — the same trade-off already accepted for subscribe/unsubscribe failures,
not a new one. Accepts one added value on `action-error.from` (three-way instead of
two-way) rather than a fully separate `kind`, trading a small amount of duplication
inside `statusTextKey`/`checked`/`handleCheckedChange` for not having to extend those
same three call sites with a fourth, near-identical branch. Revisit trigger: if a
future issue needs to distinguish "address-change error" from "subscribed" in more
than status copy (e.g. a retry button, telemetry), promoting it to its own `kind`
would be the natural next step — nothing here forecloses that.
