# ADR 0051: Client-side push display (`public/sw.js`) deferred to #115

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #28

## Context

#28's posted acceptance criteria are "payload builder renders localized
title/body," "Web Push send integration...wired into the dispatcher, with
delivery failures logged," and "unit test asserts payload shape/localization"
-- all describing the server side of delivery: building and POSTing an
encrypted message to each subscriber's push service endpoint. None of them
describe what the browser does on receipt. `public/sw.js` (ADR 0041) has no
`push` or `notificationclick` event listener today, and a delivered Web Push
message is inert without one -- the browser has nothing to call
`showNotification()`.

## Decision

This PR sends the payload and stops there; it does not touch `public/sw.js`.
Issue #115 ("Service worker push-display handling"), filed alongside this
plan, tracks adding the `push`/`notificationclick` listeners and depends on
#28 for the JSON payload shape (`{ title, body, collectionDate }`) it needs
to parse.

## Alternatives considered

### Defer to a new issue, #115 (chosen)
- **Pros:** matches #28's literal posted acceptance criteria exactly, same
  reasoning ADR 0044 used to scope #27; keeps this PR's tests focused on the
  server-side send path it actually changes; the payload shape is fixed by
  this PR either way, so #115 has a stable contract to build against.
- **Cons:** the feature is not visibly end-to-end demonstrable in a real
  browser until #115 also lands -- tracked explicitly rather than silently
  dropped.

### Add the `push`/`notificationclick` listeners to #28's own scope
- **Pros:** one fewer issue; feature is demoable sooner.
- **Cons:** #28's acceptance criteria as posted don't ask for it; folding it
  in expands this PR's test surface (sw.js `vm`-context testing, per ADR
  0041's technique) beyond what was scoped when the issue was written --
  the same "silently retract/expand what was posted" concern ADR 0046 named
  when it explicitly declined to fold pruning into #28 instead of filing
  #111.

## Trade-offs and consequences

FR-04's reminder is not visible to a real user until #115 closes on top of
this PR. Accepted because the split matches this issue's own posted scope
and keeps #115 building against a payload shape that's already finalized
rather than co-designed under time pressure inside this PR.
