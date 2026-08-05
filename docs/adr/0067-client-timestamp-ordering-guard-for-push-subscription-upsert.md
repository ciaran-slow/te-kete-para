# ADR 0067: Client wall-clock timestamp as an ordering guard for the push-subscription upsert

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** #140

## Context

`<PushSubscriptionToggle>`'s address-change effect (`src/components/push-subscription-toggle.tsx`,
#126, ADR 0062) re-POSTs `/api/notifications/subscribe` whenever the selected
address changes while a subscription is active, using an `AbortController`
to stop the client from acting on a stale response if the address changes
again before the previous request settles. `AbortController.abort()` only
guarantees the client stops listening — it does not guarantee the server
never received or already started processing the request. `POST`'s upsert
(`src/app/api/notifications/subscribe/route.ts`, ADR 0033) is unconditional
last-write-wins on `endpoint`. If a request for an older selection completes
at the server after a request for a newer one — plausible under HTTP/2
multiplexing, retries, or ordinary jitter — `push_subscriptions.address_id`
ends up permanently pointed at the older address, with the UI and the
client both believing they're synced to the newer one, and nothing logging
or surfacing the mismatch.

## Decision

The client attaches `clientRequestedAt` (`Date.now()`, epoch milliseconds,
captured at the moment a subscribe/resubscribe is decided — not when the
network request resolves) to every `POST` body. A new nullable
`push_subscriptions.client_requested_at` column stores the value from the
most recent *accepted* write. The upsert becomes one atomic statement:

    INSERT INTO push_subscriptions (...)
    VALUES (...)
    ON CONFLICT(endpoint) DO UPDATE SET
      ...,
      client_requested_at = COALESCE(excluded.client_requested_at, push_subscriptions.client_requested_at),
      ...
    WHERE excluded.client_requested_at IS NULL
       OR push_subscriptions.client_requested_at IS NULL
       OR excluded.client_requested_at > push_subscriptions.client_requested_at
    RETURNING ...

A write whose `clientRequestedAt` is not newer than the stored value is a
no-op: every column, not just `address_id`, is left exactly as it was.
`clientRequestedAt` is optional on the wire — omitting it reproduces today's
unconditional merge for that one write, so no existing or future caller
that doesn't care about ordering is forced to change, and no existing test
needed to change for this PR. `<PushSubscriptionToggle>` — the only real
caller — always sends it. `RETURNING` yields zero rows for a rejected
write (verified directly against this repo's bundled SQLite, 3.52.0, before
choosing this design); the route falls back to a plain `SELECT` by
`endpoint` so the response contract (ADR 0033: always 200 with the current
row) is unaffected by a write being silently superseded.

## Alternatives considered

### A (chosen): client-supplied wall-clock timestamp + atomic conditional UPSERT
- **Pros:** survives page reloads and fresh component mounts with no
  persisted client-side state of its own (unlike a local counter, below);
  correctly orders "switched back to an earlier address" the same as any
  other later selection (unlike using `addressId` itself, below); the
  accept/reject decision and the write happen in one statement, so there's
  no read-then-write race window regardless of how many DB connections are
  ever in play.
- **Cons:** trusts the client's clock. A backward clock jump between two
  requests could cause a genuinely later selection to be wrongly rejected —
  see Trade-offs.

### B: client-local monotonically increasing sequence number
- **Pros:** no clock-skew concern; simple `useRef` counter.
- **Cons:** rejected. The counter lives in the component instance and
  resets to 0 on every fresh mount, including an ordinary page reload — but
  the server's stored value does not reset. Concretely: a resident changes
  address several times in one session (stored sequence reaches, say, 12),
  reloads the page, and changes address once more; the new mount's counter
  starts at 0 or 1, which is not greater than the stored 12, so the
  genuinely-latest write is rejected — and stays rejected on every
  subsequent change in the new session until the local counter organically
  climbs back past 12. This is a real, silent, indefinite lockout, not a
  rare edge case; the issue's own bug (a permanently-stale `address_id`)
  would simply move rather than close.

### C: the target `addressId` itself as the ordering token (the issue's other suggested option)
- **Pros:** zero new client state, zero new column — compare incoming
  `addressId` against the stored one directly.
- **Cons:** rejected. `addressId` is not monotonic with respect to
  selection time. A resident who selects address 5, then 2, then back to 5
  has made three real, time-ordered selections, but comparing raw
  `addressId` values would treat "2" as superseding "5" only by numeric
  luck and would then reject the later, legitimate return to "5" as
  "older" than "2" — the exact class of bug this ADR exists to close, just
  relocated to a different comparison.

### D: server-assigned receipt order (stamp arrival order at the route handler, before any DB work, instead of trusting a client-supplied value)
- **Pros:** doesn't trust the client's clock at all.
- **Cons:** rejected. The issue's own report is explicit that arrival order
  at the server is *not* guaranteed to match send order either (HTTP/2
  multiplexing, retries, jitter) — the whole premise of the bug. Stamping
  receipt order would just move the unreliable clock from "network
  completion order" to "network arrival order," which is the same failure
  mode with extra code.

### E: read-then-conditionally-write as two separate Knex calls instead of one atomic statement
- **Pros:** stays entirely within the query-builder API, no raw SQL.
- **Cons:** rejected. A separate `SELECT` to read the stored timestamp,
  compare in JavaScript, then `UPDATE` conditionally, opens a
  read-then-write race window between the two calls. This repo's SQLite
  pool is pinned to `{ min: 1, max: 1 }` specifically to keep an in-memory
  *test* database consistent (`knexfile.js`, architecture.md §2C) — that
  pinning is a test-environment property, not a correctness guarantee this
  fix should quietly depend on; relying on it here would make the guard
  fragile to a future pool-size change or a different DB backend. The
  single atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ...
  RETURNING` avoids the window entirely regardless of connection count, and
  is available in the project's bundled SQLite (3.52.0; the syntax has
  existed since 3.35).

## Trade-offs and consequences

Accepts trusting the client's wall clock for ordering. A backward clock
jump on the resident's device between two real, correctly-time-ordered
selections could cause the later one to be wrongly rejected — but this
fails *safe*, not silently-wrong-forever: the row simply keeps whatever the
last-accepted address was until a subsequent change carries a timestamp
that does exceed the (unusually) high stored value, rather than the
pre-fix bug's "wrong value, permanently, with the UI lying about it."
Revisit if this is ever observed in practice — e.g. by switching to a
server-issued monotonic token instead of a client-supplied one.

Accepts that the guard is opt-in per request (`clientRequestedAt` is
optional) rather than universally enforced — a caller that never sends it
gets exactly today's unconditional-merge behavior for that write. This
keeps every existing test and any future non-ordering-aware caller working
unchanged, at the cost of the guard not being a hard API-level guarantee.
Revisit if a second real caller of this route ever appears that also needs
ordering protection but might forget to send the field — at that point,
making the field required (and updating every caller/test) would be the
natural next step.

Deliberately does not add any guard between a `POST` (resubscribe) and a
`DELETE` (unsubscribe) racing for the same `endpoint` — out of scope for
this issue, which is specifically about two `POST`s racing each other. Not
known to be a live problem (a `DELETE` removes the row outright rather than
racing over a single column's value the way two `POST`s do), but flagged
here rather than left unmentioned in case a future issue needs to revisit
it.
