# ADR 0002: App code reaches the database through a shared Knex singleton (src/lib/db.ts)

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #3

## Context

Route handlers need a Knex instance, and Supertest integration tests need the handler
under test to hit the SAME in-memory SQLite database the test's fixtures were written
to. SQLite `:memory:` exists per connection, and the sqlite3 dialect pool is pinned at
`{ min: 1, max: 1 }` (architecture.md §2C) — so "same database" literally means "same
Knex instance". Foreign-key enforcement also depends on the instance being built from
`knexfile.js` (its `pool.afterCreate` applies `PRAGMA foreign_keys = ON` per
connection); any hand-rolled config silently loses it.

## Decision

`src/lib/db.ts` exports `getDb()` (lazily creates one module-level Knex instance from
`knexfile.js`, selecting the `test` config when `NODE_ENV === "test"`, otherwise
`development`) and `destroyDb()`. All app code obtains its Knex instance from
`getDb()`; nothing constructs Knex directly. Because knex is not on this fork's
auto-external list and uses dynamic dialect requires that break under bundling,
`next.config.ts` sets `serverExternalPackages: ["knex"]` (`sqlite3` is already
auto-external).

`getDb()` reads knexfile.js through a **runtime require of a path built at call
time** (`createRequire(p)(p)` where `p = path.join(process.cwd(), "knexfile.js")`),
not a static `import`. knexfile.js is CommonJS that derives the `data/` directory
and the migrations/seeds directories from `__dirname`; a static import inlines it
into the route-handler bundle with `__dirname` rewritten to a `/ROOT` placeholder,
which fails `next build` at page-data collection (`ENOENT: mkdir '/ROOT/data'`) and
would hand Knex `/ROOT/...` paths at runtime. A path the bundler cannot resolve
statically keeps the file external, so the Knex CLI, Vitest and route handlers all
read the same real knexfile.

## Alternatives considered

### Shared singleton module, env-selected from knexfile.js (chosen)
- **Pros:** Tests and handlers share one instance by construction; FK pragma can never
  be dropped; Vitest's per-file module isolation gives each test file a fresh singleton
  with zero plumbing; smallest possible API surface.
- **Cons:** Implicit dependence on `NODE_ENV`; a future `production` environment needs
  a knexfile entry and a mapping change; module-level state is invisible in function
  signatures.

### Static `import knexConfigs from "../../knexfile.js"` in src/lib/db.ts
- **Pros:** Plainest possible dependency, matches how the existing db tests import the
  knexfile, type-checked by the compiler rather than cast.
- **Cons:** Does not build. Turbopack bundles the CommonJS knexfile into the route
  handler and replaces `__dirname` with `/ROOT`, so its load-time `mkdirSync` throws
  during `next build` and its db/migration paths are wrong wherever the bundle runs.

### Dependency injection (handlers take a db argument / factory)
- **Pros:** Explicit, no global state, easy to hand any test double in.
- **Cons:** Next.js owns route-handler signatures (`GET(request)`) — injecting requires
  a wrapper layer on every route; more ceremony on every consumer for a benefit the
  module-isolation model already provides.

### Per-call `Knex(knexConfigs[...])` in each route
- **Pros:** No shared state at all.
- **Cons:** Every call opens a new connection = a NEW empty in-memory DB under test —
  integration tests become impossible; connection churn in production.

## Trade-offs and consequences

- Accepted: global singleton state and `NODE_ENV`-driven config selection. Guard:
  `__tests__/db/harness.test.ts` asserts the FK pragma is ON through the singleton, so
  a config regression fails the suite.
- `NODE_ENV=production` currently maps to the `development` (file-based) config —
  acceptable until a deployment issue adds a `production` knexfile environment; that
  change extends this ADR rather than superseding it.
- `serverExternalPackages: ["knex"]` couples next.config.ts to the data layer; the
  entry is load-bearing and documented here.
- Accepted: the runtime require makes knexfile.js invisible to the compiler (its export
  shape is cast, not inferred) and to Next's output file tracing, and it assumes the
  server process runs from the repository root. Guards: `npm run build` catches a
  regression back to a static import, and the harness test asserts the FK pragma is on
  through `getDb()`, which only holds if the real knexfile was loaded.

## Revisit if

The app moves off SQLite/Knex, or a connection-pooled database makes per-request
connections viable.
