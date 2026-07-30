# ADR 0012: JSON API response envelope and field casing

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #11

## Context

`/api/suburbs/search` (#11) is the first endpoint to return real domain data
— `/api/health` only ever returns `{ status: "ok" | "unavailable" }`. Later
issues (#20 sorting search, #13/#14 schedule display, #25 push subscriptions)
will add more data-returning endpoints. Without a documented convention here,
each one re-decides envelope shape, field casing, and error shape
independently, and the client ends up handling several incompatible response
shapes across the same API surface.

`addresses` (and every other table in architecture.md §2C) uses snake_case
column names, matching SQL convention. The rest of this codebase's
TypeScript/React surface — `src/lib/i18n/dictionaries.ts`'s keys,
component prop names — uses camelCase, matching TS/JS convention. Knex
returns rows with the driver's native column names verbatim; nothing
translates casing automatically.

## Decision

Every JSON API response in this app is a top-level object, never a bare
array or scalar:
- Success: `{ "results": [...] }` for collection endpoints (or another
  named key for a single-resource endpoint, decided when that endpoint is
  planned).
- Error: `{ "error": "<human-readable message>" }`, English text, not
  translated — this is a developer/log-facing message for a JSON API
  contract, not UI copy, so FR-01's key-parity gate does not apply to it. A
  client wanting a localized user-facing error string maps the HTTP status
  code to its own `mi`/`en` dictionary entry; it does not display `error`
  verbatim.

Every field in a JSON response body is camelCase, regardless of the source
column's name. Route handlers map raw Knex rows to response objects through
an explicit, named function (e.g. `toSuburbSearchResult`) rather than
relying on Knex's `.select({ alias: "column" })` aliasing — the mapping step
is also where any driver-representation gaps get closed explicitly (see
"boolean columns" below), which a passthrough alias cannot do.

**Boolean columns:** Knex's sqlite3 dialect does not cast `boolean`-typed
columns back to JS booleans on read (verified against this repo's
`knex@3.3.0`: a `t.boolean(...)` column reads back as the JS number `1`/`0`).
Every mapping function MUST wrap such a field in `Boolean(...)` before it
reaches a `Response.json(...)` call — a raw passthrough leaks SQLite's
on-disk representation into the API contract.

## Alternatives considered

### Enveloped object, camelCase fields (chosen)
- **Pros:** `{ results }` leaves room to add `{ results, total, cursor }`
  for pagination (#20 will likely need paging over a larger sorting-rules
  index) without a breaking response-shape change; `{ error }` gives a
  single consistent shape for every failure across every endpoint; camelCase
  matches every other identifier in the TS/React codebase, so no consumer
  needs a snake_case-aware type or a runtime remapper.
- **Cons:** every route needs an explicit row→response mapping function
  instead of returning Knex rows directly; one extra function to keep in
  sync when a column is added.

### Bare array / bare value response (`[{...}]` directly)
- **Pros:** less code — no envelope object, no mapping step; matches the
  simplest possible REST collection response.
- **Cons:** cannot add response metadata later without a breaking shape
  change (array → object is not backward compatible for any consumer doing
  `response.map(...)` directly); a bare-array success response and an
  object-shaped error response (`{ error }`) are two different top-level
  shapes a client must branch on by type-checking, rather than one
  consistent envelope.

### Pass Knex rows through unmapped (snake_case fields, as stored)
- **Pros:** zero mapping code; matches the DB schema exactly, so no
  translation step to keep in sync with migrations.
- **Cons:** leaks persistence-layer naming into the API contract, so a
  schema rename becomes an API breaking change instead of an internal
  detail; does not fix the boolean-representation gap above at all — a
  passthrough would ship `is_inner_city_night_collection: 1`, which is not
  valid JSON boolean semantics, silently, until a client's strict-boolean
  check breaks on it later.

## Trade-offs and consequences

- Accepted: every new endpoint writes a small explicit mapping function
  rather than returning query results directly — slightly more code per
  route, in exchange for a stable, deliberate API contract independent of
  storage details.
- Accepted: `{ error: string }` is unstructured (no machine-readable error
  `code`). Fine for the current four endpoints (#11, health); revisit if a
  future issue needs client-side branching on error type rather than just
  displaying/logging the message and the HTTP status.
- Future endpoints that are not row collections (e.g. a single schedule
  lookup) choose their own top-level key when planned, but stay inside the
  "always an object, never bare" rule this ADR sets.

## Revisit if

A future endpoint's natural response is not a list (revisit the envelope
key naming then, not the "always an object" rule), or error responses need
a machine-readable `code` field for client branching.
