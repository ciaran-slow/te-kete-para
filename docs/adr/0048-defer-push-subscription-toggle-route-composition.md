# ADR 0048: Build the push opt-in toggle now, defer composing it into a route

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #26

## Context

ADR 0028 and ADR 0031 already established this repo's pattern for
"build and test a component fully, but don't render it from any route
yet" — both for the same underlying reason: this app deploys straight
from `main` (architecture.md §1), so composing a component into a
reachable route is equivalent to shipping whatever it does to real
users immediately. Those two ADRs gated on *content* correctness
(unverified `sorting_rules`/`holidays` seed data, #69/#70 and #78). This
issue's gate is different in kind but the same in shape: #27 (nightly
cron dispatcher) and #28 (bilingual payload delivery) are both still
open, so even with a correctly configured VAPID key, no code anywhere
in this app can actually send a push notification yet. Composing
`<PushSubscriptionToggle>` into a route now would let a real resident
opt in, grant notification permission, and receive a subscription
confirmation — and then never receive a single reminder, indefinitely,
with no way for them to know why. That's a promise the app can't keep,
the same class of problem 0028/0031 avoided, just triggered by
*functional* incompleteness instead of *content* incompleteness.

## Decision

Build `<PushSubscriptionToggle>` (`src/components/push-subscription-toggle.tsx`)
and its full test suite in this PR. Do **not** import or render it from
`src/app/page.tsx`, `src/app/layout.tsx`, or any other route. #26's
acceptance criteria are satisfied entirely by
`__tests__/components/push-subscription-toggle.test.tsx` rendering the
component directly, the same way `sorting-search.test.tsx` and
`shift-alert-banner.test.tsx` satisfy #21/#24's equivalent criteria.
Filed issue #113 — "Compose <PushSubscriptionToggle> into a route once
#27 and #28 close" — mirroring #75 (ADR 0028 follow-up) and #83 (ADR 0031
follow-up).

## Alternatives considered

### A. Build fully, leave unwired from any route (chosen)
- **Pros:** fully reviewable, tested, and mergeable now with zero risk
  of a resident opting in to a feature that can't deliver anything yet;
  applies the same rule reviewers already know from ADR 0028/0031
  instead of re-deciding it; the follow-up to wire it in is small and
  mechanical, same as #75/#83.
- **Cons:** the feature isn't reachable by anyone until a second PR
  lands; a reviewer must know to check no route renders it (mitigated:
  `git grep -n "PushSubscriptionToggle"` outside
  `src/components/push-subscription-toggle.tsx` and its test file should
  show nothing under `src/app/`, same check ADR 0028/0031 recorded).

### B. Wire it in behind a feature flag / environment variable
- **Pros:** composition code ships now; flipping a flag later is small.
- **Cons:** same rejection as ADR 0028/0031's Alternative B — the actual
  blocker is that #27/#28 don't exist yet, not which code path is live;
  a flag adds its own removal-tracking burden to guard against the same
  single failure mode (forgetting to check it) that simply not
  rendering the component already avoids for free.

### C. Wire it in now, since opting in itself is harmless
- **Pros:** ships something visible now; a stored-but-undelivered
  subscription genuinely causes no harm on its own.
- **Cons:** "opt in to reminders" is an affirmative promise to a real
  resident that reminders are coming — the same trust concern ADR
  0031's rejected Alternative D raised for a caveated holiday banner.
  Shipping the *offer* before the *delivery* exists risks a resident
  believing they're covered for their very next collection day when
  they are not.

## Trade-offs and consequences

This PR ships a component nobody can reach yet. The follow-up (wire
`<PushSubscriptionToggle>` into a route — most likely near
`<ShiftAlertBanner>`/`<ScheduleDisplay>` in `address-schedule.tsx`, or a
new settings surface, to be decided when it's actually composed) must
happen once #27 and #28 both close, or the feature stays invisible
despite being fully built — revisit trigger: close of both #27 and #28.
