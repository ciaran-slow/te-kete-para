# ADR 0033: Push subscription upsert and response shape

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #25

## Context

ADR 0013 deferred the response envelope key and error-code granularity for
#25 to "when that endpoint is planned" — this is that decision. Separately,
architecture.md §2C already states `push_subscriptions.endpoint` is unique
"as the natural dedup key for repeat subscribe calls," which implies repeat
subscribes are an expected, not exceptional, client behavior (a service
worker re-subscribing after its push keys rotate has no way to know if it
was already subscribed).

## Decision

`POST /api/notifications/subscribe` upserts on `endpoint` via `knex`'s
`.onConflict("endpoint").merge([...])`, always returning `200
{ subscription: {...} }` (never 201) whether the row was inserted or
updated — the client has no need to distinguish the two, and returning 201
only sometimes would mean branching the handler on "was this new" for no
behavioral benefit. The response omits `p256dh`/`auth` (the client already
has them). Unknown `addressId` values are validated at the DB layer (FK
constraint) and surfaced as `400`, not `503`.

## Alternatives considered

### Upsert via onConflict/merge (chosen)
- **Pros:** idempotent, matches the architecture note's framing, one code
  path for first-subscribe and re-subscribe.
- **Cons:** a silent overwrite if two different browsers/devices ever
  coincidentally shared an `endpoint` (practically impossible — Web Push
  endpoints are per-installation unique URLs issued by the browser's push
  service).

### Reject duplicates with 409
- **Pros:** simpler write (`insert` only, no conflict clause); makes
  "already subscribed" explicit to the caller.
- **Cons:** pushes the "am I already subscribed" check onto the client,
  which doesn't have a reliable way to know that without calling the API
  first; breaks the re-subscribe-after-key-rotation flow that Web Push
  actually needs, since the client has no separate mechanism to "update" a
  stale subscription short of unsubscribing first.

### Read row(s) with `.where(...).first()`, branch insert vs. update in application code
- **Pros:** doesn't depend on `onConflict`/`merge` behaving a certain way
  in this specific sqlite3/knex pairing.
- **Cons:** two round trips instead of one atomic statement, and a
  check-then-write race between concurrent requests for the same `endpoint`
  (unlikely in this app's traffic pattern, but avoidable for free with the
  single-statement upsert).

## Trade-offs and consequences

Accepted: a `POST` can never signal "this was a brand-new subscription" vs.
"this updated an existing one" to the caller — fine, since no current UI
need distinguishes them. Revisit if a future issue needs to know
new-vs-updated (e.g. analytics on subscriber growth) — that would need
either a response field or a separate counter, not a reversal of the
upsert behavior itself.
