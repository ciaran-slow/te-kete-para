# ADR 0017: Vitest suite pinned to TZ=Pacific/Auckland

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #13

## Context

`src/lib/schedule/rules.ts` promises to read only the **UTC calendar date**
of the `Date` it is given (architecture.md §2B), and
`__tests__/schedule/rules.test.ts` has a contract test for that promise. But
CI runs on `ubuntu-latest` at `TZ=UTC`, where every local-time `Date` getter
(`getDay`, `getFullYear`, ...) returns exactly the same value as its
`getUTC*` twin. At UTC the contract test is therefore unfalsifiable: a
regression from `getUTCDay()` to `getDay()` passes CI unchanged and shifts
every Wellington collection result by a day once the code runs at NZDT/NZST
(UTC+13/+12). The same blind spot would apply to all future date math —
notably #22 (holiday calendar schema) and #23 (holiday shift calculation).
The fork forced here: how to make the suite's clock diverge from UTC so
UTC-vs-local mistakes can actually fail.

## Decision

`vitest.setup.ts` sets `process.env.TZ = "Pacific/Auckland"` at the top of
the file, before any imports that could construct `Date`s. The **entire**
Vitest suite — every worker, every test file — runs at UTC+12/+13, never
UTC. Test authors must assume `new Date(...)` local-time constructors and
local getters resolve at Pacific/Auckland, not at the machine's or CI's
native zone.

## Alternatives considered

### A (chosen): `process.env.TZ` in `vitest.setup.ts`

- **Pros:** One line, applied uniformly to every current and future test
  file with zero per-test ceremony; the explanatory comment lives directly
  on the assignment, where anyone debugging a date test will find it.
  Node ≥ 16 re-reads `process.env.TZ` on `Date` operations, and setup files
  run in each worker before test modules are imported, so the pin is in
  force before any code under test touches a `Date`.
- **Cons:** Global, implicit shared state — a contributor who has not read
  this ADR or architecture.md §4 may be surprised that `getDay()` in a test
  disagrees with their laptop's clock. Cannot express a per-test zone.

### B: `test.env: { TZ: "Pacific/Auckland" }` in `vitest.config.mts`

- **Pros:** Same uniform effect, declared in configuration rather than
  executable setup code.
- **Cons:** No better guarantee than A, and the config file is a worse home
  for the six-line "why" comment: `vitest.config.mts` documents *how the
  suite runs*, while the setup file is where the other runtime-global
  test-environment concerns (`jest-dom` matchers) already live. Splitting
  the TZ pin away from them creates two places to check.

### C: Per-test `vi.stubEnv("TZ", ...)` in date-sensitive files

- **Pros:** Explicit at the point of use; tests that don't care about time
  zones keep the host zone.
- **Cons:** Opt-in is exactly the failure mode being closed: the authors of
  #22/#23 date-math tests won't know to opt in, and an unstubbed test
  silently runs at UTC on CI where the UTC-vs-local distinction vanishes.
  Also unreliable mid-process: TZ must be set before the module under test
  first exercises `Date`, which a per-test stub cannot guarantee.

### D: Leave CI at UTC; assert explicit offsets in test inputs

- **Pros:** No change to shared test infrastructure.
- **Cons:** Does not work. Inputs like `2025-03-03T23:00:00+13:00` are
  normalised to a UTC instant at parse time; with the process at UTC, local
  getters on that instant still equal the `getUTC*` getters, so no
  assertion written at TZ=UTC can distinguish correct code from the
  local-getter mutant. The contract test would stay green either way —
  security theatre.

## Trade-offs and consequences

Every existing and future Vitest test runs at Pacific/Auckland, matching the
product's real deployment audience (Wellington) and making UTC-vs-local
regressions fail loudly on CI. The accepted cost is non-obvious global
state: `new Date(2025, 0, 1)` in any test is 2025-01-01 NZDT (2024-12-31T11:00Z),
not UTC — date-math tests must construct instants via `Date.UTC(...)` or
`Z`-suffixed ISO strings when they mean UTC. This is recorded in
architecture.md §4 so future contributors (#22, #23) reason from the pinned
zone. Revisit (superseding ADR) only if a suite ever needs to run across
multiple zones — e.g. property-testing DST boundaries — in which case a
per-file override mechanism would replace the single global pin.
