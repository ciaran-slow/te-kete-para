# ADR 0050: Server-side VAPID keys treated as a documented config gap, extending ADR 0047

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #28

## Context

ADR 0047 (#26) treated the client-side `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as a
documented config gap rather than a provisioned secret, explicitly naming
#27/#28 as "whichever...first needs the matching private key server-side"
and deferring that provisioning decision to whichever issue that turned out
to be. #28 is that issue: `webpush.setVapidDetails` needs the public key
again (server-side), the private key, and a `subject` (a `mailto:` or `https:`
URL identifying the sender, required by RFC 8292) to construct the VAPID
Authorization header. No `.env.example`, keypair, or subject value exists
anywhere in this repo.

## Decision

`src/lib/notifications/push-sender.ts`'s `loadVapidConfig()` reads
`process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `process.env.VAPID_PRIVATE_KEY`,
and `process.env.VAPID_SUBJECT` at the point of use (not module-level, same
per-test-stubbable rationale as ADR 0047). Any of the three missing or empty
is "not configured": `sendDispatchPayload` logs a clear message identifying
exactly which mechanism is missing and returns `{ success: false }` for that
one subscription, without calling `setVapidDetails` or `sendNotification`
and without throwing. No real keypair, subject address, or `.env.example` is
added by this PR.

## Alternatives considered

### Documented config gap, fail-per-subscription (chosen)
- **Pros:** consistent with ADR 0047's precedent and its stated revisit
  trigger; a nightly run with unset env vars logs loudly (once per
  subscription) rather than silently doing nothing or corrupting state;
  every environment that hasn't set the three vars — including this PR's own
  CI and local dev — fails safe instead of crashing.
- **Cons:** every environment without all three vars silently no-ops every
  nightly send until someone provisions them; there's no user-facing signal
  of this (unlike ADR 0047's client-side "misconfigured" UI state), only
  server logs.

### Throw / crash the whole nightly run if VAPID isn't configured
- **Pros:** impossible to miss in practice.
- **Cons:** one missing env var would take down delivery for every
  subscriber in the batch, including any whose send might otherwise have
  proceeded once configured -- directly contradicts this issue's own
  acceptance criterion that one subscriber's failure must not block others,
  and turns a config gap into a process crash.

### Generate and commit a real VAPID keypair + subject now
- **Pros:** fully live end-to-end delivery in every environment immediately.
- **Cons:** a VAPID private key is a secret; this repo's `.gitignore` already
  treats `.env*` as the place secrets don't get committed (ADR 0047's
  alternative A rejected this same move for the public key alone -- doubly
  true for the private half).

## Trade-offs and consequences

Identical shape to ADR 0047: silent until deploy config sets
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.
Revisit trigger: whichever of #110 (nightly invocation wiring) or a
dedicated deploy-setup issue first needs this to run for real should
generate the keypair, pick a real subject address, and set all three in the
relevant environment(s).
