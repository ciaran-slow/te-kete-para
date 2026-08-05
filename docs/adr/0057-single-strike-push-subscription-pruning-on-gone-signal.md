# ADR 0057: Single-strike push_subscriptions pruning on a Web Push "gone" signal

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #111

## Context

ADR 0039 (#34) added `created_at`/`updated_at` to `push_subscriptions`
anticipating that the nightly dispatcher would "age out stale subscriptions
instead of retrying them forever." ADR 0046 deferred that pruning to this
issue specifically because age alone is not evidence of death — the real
signal is a 410 Gone/404 response to an actual Web Push send, which only
existed once #28 (`push-sender.ts`) shipped. It has now shipped.
`web-push@3.6.7`'s `sendNotification` rejects with a `WebPushError` carrying
`.statusCode` whenever the push service responds outside 2xx; 404/410 are
Web Push's documented convention (used by both major push services and the
`web-push` library's own docs) for "this endpoint is permanently invalid" —
distinct from a 5xx or network failure, which says nothing about whether the
endpoint is still good.

The issue's acceptance criteria left open how many consecutive gone-signals
to require before deleting a row ("some bounded number of times... or once
— decide and record as an ADR"), and asked for planning to make that call.

## Decision

Delete the `push_subscriptions` row on the very first 410/404 "gone"
signal. No retry counter, no new column, no migration. `push-sender.ts`'s
`sendDispatchPayload` classifies every non-2xx rejection's `.statusCode`
into `"gone"` (404/410) or `"transient"` (everything else) and returns it on
`DispatchOutcome.failureReason`; `dispatch-runner.ts`'s `runNightlyDispatch`
calls the new `subscription-pruner.ts`'s `pruneGoneSubscriptions` after
every send in the batch has been attempted, deleting every row whose
outcome carried `"gone"`. Transient failures and successes never delete a
row.

This makes acceptance-criteria unit test #3 ("a successful send resets any
failure count") not literally applicable: there is no persisted failure
count to reset under a single-strike design. The property that actually
matters and is what the test suite instead verifies is that **a successful
send never deletes or otherwise mutates the subscription row** — the
practical guarantee AC3 was reaching for.

## Alternatives considered

### Retry N times before pruning, via a new counter column (rejected)
- **Pros:** Guards against a hypothetical misclassified or flaky
  gone-signal; gives literal meaning to a "resets a failure count"
  mechanic; a constant-default `ADD COLUMN` (e.g. `.defaultTo(0)`) would
  have been safe regardless of existing row count, unlike ADR 0039's
  non-constant-default restriction.
- **Cons:** 404/410 are specified as definitive, permanent signals, not
  flaky ones — a retry budget invents robustness against a failure mode
  the protocol doesn't describe. Costs up to N-1 additional nightly no-op
  send attempts to a confirmed-dead endpoint before pruning it. Adds a
  schema column and migration for no corresponding real-world benefit.
  Explicitly declined by the user during planning in favour of the
  simpler single-strike design.

### Age-based cutoff on created_at/updated_at (rejected in ADR 0046)
- Superseded reasoning unchanged from ADR 0046: age alone is not evidence
  of staleness for a still-genuinely-subscribed user.

### Delete inside push-sender.ts itself, at send time
- **Pros:** One fewer module/file.
- **Cons:** Breaks the DB-free-core / DB-aware-caller split ADR 0015
  established and every notifications module since (`dispatcher.ts`,
  `payload-builder.ts`) has followed; `sendDispatchPayload` is documented as
  never throwing and never touching the DB, and per-payload sends may be
  called from contexts (e.g. a future manual "send test push" path) that
  should not have an automatic delete side effect baked in. Rejected in
  favour of a dedicated `subscription-pruner.ts` called only from the
  DB-aware `runNightlyDispatch`.

## Trade-offs and consequences

A single 410/404 is trusted as final: if a push provider were to return one
erroneously (a bug on their end, not a documented Web Push behaviour), the
row is deleted immediately and the user would need to re-subscribe.
`<PushSubscriptionToggle>` isn't composed into any route yet (ADR 0048), so
there's currently no UI path where a client/server "subscribed" mismatch
would even surface — this risk is real but presently inert. `created_at`/
`updated_at` remain unread by any pruning logic; ADR 0046's "age alone is
not evidence" reasoning still holds, so this is not revisited here.
