# ADR 0034: DELETE on the same route for unsubscribe

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #25

## Context

Issue #25 asks for "a corresponding unsubscribe/delete route."
`push_subscriptions` is a single resource type identified by its unique
`endpoint`; the same route file already handles `POST` for create-or-update.

## Decision

`DELETE /api/notifications/subscribe` (same path, same `route.ts`, keyed by
`{ endpoint }` in the JSON request body) removes a subscription, rather
than a separate `/api/notifications/unsubscribe` route.

## Alternatives considered

### DELETE on the same route (chosen)
- **Pros:** one URL per resource (REST convention: verb varies, path
  doesn't); no new route directory; `Allow` header naturally reports
  `POST, DELETE` for anyone probing the endpoint.
- **Cons:** a `DELETE` request carrying a JSON body is slightly less
  common than query-string/path-param-keyed deletes — mitigated here
  because this is a same-origin PWA calling its own API via `fetch` (which
  fully supports a `DELETE` with a body), not a public webhook passing
  through third-party proxies that might strip it.

### Separate POST /api/notifications/unsubscribe route
- **Pros:** avoids `DELETE`-with-body entirely; literally matches the
  issue text's "unsubscribe" wording as a URL.
- **Cons:** two URLs for one resource type; duplicates the
  request-parsing/error-shape boilerplate across two route files instead
  of two exports in one; `architecture.md` §2B would need to document a
  second endpoint name for what is conceptually one operation surface.

## Trade-offs and consequences

Accepted: `DELETE` requests in this app carry bodies, which is untested
elsewhere in the repo (every existing route only reads query params or
nothing) — `__tests__/helpers/api.ts`'s `createRequestListener` already
forwards the body for any non-GET/HEAD verb (`method !== "GET" && method
!== "HEAD" && body.length > 0`), so no harness change is needed, but this
is the first test to exercise that path for `DELETE` specifically.
