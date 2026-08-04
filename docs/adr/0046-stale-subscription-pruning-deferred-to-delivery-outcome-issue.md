# ADR 0046: Stale push_subscriptions pruning deferred to #111 (delivery-outcome-based)

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #27

## Context

ADR 0039 (issue #34) added `created_at`/`updated_at` to `push_subscriptions`
specifically so "the nightly dispatcher (#27) can age out stale
subscriptions instead of retrying them forever" — a forward-looking claim
about this issue's scope. #27's actual posted acceptance criteria, however,
only ask for the payload-decision logic and say nothing about pruning,
retry-limiting, or reading either timestamp column. #27 also never sends a
push (that's #28) — it has no way to observe whether an endpoint is
actually dead. Web Push's real "this is dead" signal is a 410 Gone/404
response to an actual send attempt, which only #28's send integration will
ever produce. Row age alone, with no delivery outcome, is not evidence of
staleness: a subscriber who opted in months ago and still has notifications
enabled is not stale just because the row hasn't been touched since.

## Decision

#27 ships with no pruning/aging logic and does not read `created_at` or
`updated_at` at all. Issue #111 ("Prune push_subscriptions rows after
repeated Web Push delivery failures"), filed alongside this plan and
depending on #28, tracks building that pruning once #28's send integration
exists to produce the delivery-failure signal it should key off. This ADR
is the recorded pointer ADR 0039 anticipated needing.

## Alternatives considered

### Defer to a new delivery-outcome-based issue (chosen)
- **Pros:** Pruning triggers on a real signal (an actual send failure)
  instead of an arbitrary age threshold. Doesn't invent a product policy
  (e.g. "prune after 90 days untouched") that appears nowhere in
  `prd0.md`/`architecture.md`/`vision.md`.
- **Cons:** `created_at`/`updated_at` stay unused longer than ADR 0039
  assumed; the "retrying them forever" problem ADR 0039 named stays
  unsolved until #111 lands (which itself waits on #28).

### Add an age-based cutoff to #27 now
- **Pros:** Puts the columns ADR 0039 added to use immediately.
- **Cons:** The cutoff (N days) is an unspecified product decision with no
  source anywhere in the docs. Re-subscribing only happens on a Web Push
  key rotation or explicit re-opt-in, not on a schedule — an age cutoff
  would silently stop notifying genuinely-active users whose endpoint is
  still perfectly valid.

### Fold delivery-failure pruning directly into #28's scope
- **Pros:** One fewer issue.
- **Cons:** #28's acceptance criteria are already posted; changing another
  open issue's scope out-of-band from this plan risks the exact "silently
  retract what was posted" problem the planning process guards against. A
  dedicated new issue is the cleaner, explicit pointer.

## Trade-offs and consequences

The dead-row-pruning problem ADR 0039 flagged stays open behind #28 and
#111. Accepted because there is no way to build it correctly — i.e., without
either inventing an unfounded age policy or waiting for a real
delivery-failure signal — until #28's send path exists.
