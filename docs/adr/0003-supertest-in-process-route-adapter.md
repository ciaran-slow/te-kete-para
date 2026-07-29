# ADR 0003: Supertest drives route handlers in-process through a listener adapter

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #3

## Context

Architecture §2B mandates Supertest integration tests against in-memory SQLite running
real Knex migrations. An in-memory SQLite DB lives inside the test process's single
connection, so the code under test must execute in the SAME process as the test — and
this fork's route handlers are Web-standard functions (`Request` → `Response`), while
Supertest speaks Node's http listener interface. Something must bridge them.

## Decision

`__tests__/helpers/api.ts` exports `createRequestListener(routeModule)`: a small typed
adapter that converts an incoming Node request (method, URL + query, headers, body)
into a Web `Request`, invokes the matching exported handler (405 with an `Allow` header
when there is none), and writes the returned `Response` back. Tests call
`supertest(createRequestListener(routeModule))` directly. Convention: route handlers
use standard Web APIs only (`Request`, `Response.json`,
`new URL(request.url).searchParams`) — not `NextRequest` conveniences or
`next/headers` — so they behave identically under the adapter and inside Next.

## Alternatives considered

### In-process listener adapter (chosen)
- **Pros:** Same process = same in-memory DB, the non-negotiable; fast (no server
  boot per file); no extra dependency beyond supertest itself; adapter is ~40 lines of
  typed, repo-owned code.
- **Cons:** Does not exercise Next's router, middleware, or `next/headers` request
  context; a handler relying on those needs the adapter extended or a different
  strategy; adapter fidelity is our responsibility.

### Spawn the real server (`next dev`/`next start`) and point Supertest at it
- **Pros:** Highest fidelity — real routing, middleware, headers.
- **Cons:** Separate process cannot share the in-memory DB, breaking the acceptance
  criterion outright; seconds of boot per test file; port juggling in parallel runs.

### `next-test-api-route-handler` (community package)
- **Pros:** Purpose-built, handles dynamic params and app/pages routers.
- **Cons:** A dependency whose compatibility with this Next fork is unknown (the fork
  has breaking changes); wraps its own fetch-style client rather than Supertest, which
  §2B names explicitly; less transparent than 40 owned lines.

### Call handlers directly with `new Request(...)` and assert on the `Response`
- **Pros:** Zero adapter code.
- **Cons:** Architecture §2B explicitly mandates Supertest; loses Supertest's
  status/header assertion ergonomics the team standardized on; every test hand-builds
  URLs and bodies.

## Trade-offs and consequences

- Accepted: the harness tests handler + data logic, not Next's routing table. A typo'd
  folder name under `src/app/api/` is invisible to these tests — Playwright E2E
  (ADR 0001) is the layer that would catch it against the real server.
- Accepted: handlers must stay on Web-standard APIs. `request.nextUrl`, `cookies()`,
  `headers()` are unavailable under the adapter; the first route that genuinely needs
  them forces an adapter extension (documented as a superseding or extending ADR).
- Dynamic route segments (`[id]`) are not yet supported by the adapter — none of the
  currently planned API issues (#11, #20, #25) need them; extend the adapter with a
  params argument when one does.

## Revisit if

A route needs Next-specific request context, dynamic segments, or middleware coverage
that the adapter cannot honestly simulate.
