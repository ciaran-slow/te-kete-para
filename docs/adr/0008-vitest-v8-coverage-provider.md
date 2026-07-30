# ADR 0008: v8 coverage provider, gating lines and statements only

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #6

## Context

docs/prd0.md §1 requires ">90% test code coverage enforced via Vitest" and
architecture.md §4 requires CI to "fail builds if test code coverage drops
below 90%". Vitest ships no coverage engine in core: `vitest run --coverage`
needs a provider package, so enforcing the number at all means adding a
dependency. Three repo facts constrain the choice. Coverage measured with no
`include` configured reports `__tests__/helpers/*.ts` as product code, giving a
meaningless 96% — so the measured file set has to be pinned deliberately.
`src/app/layout.tsx` could not be imported under Vitest at all, because
`next/font/google` is a build-time transform that throws "Inter is not a
function" at runtime, leaving it at 0% and the repo at 75% overall. And
`src/lib/db.ts` picks its Knex config with `process.env.NODE_ENV === "test"`,
whose `development` side no Vitest run can reach.

## Decision

Add `@vitest/coverage-v8` as a devDependency and configure coverage in
`vitest.config.mts` to measure `src/**/*.{ts,tsx}` only, with
`thresholds: { lines: 90, statements: 90 }`. Branches and functions are
reported but not gated. `npm run test:coverage` (`vitest run --coverage`) is
the CI gate; `npm test` stays coverage-free for the fast local loop.

## Alternatives considered

### @vitest/coverage-v8 (chosen)

- **Pros:** Vitest's default provider and the one its docs assume; uses V8's
  built-in coverage, so there is no source instrumentation step and the suite
  stays fast; version-locked to the installed Vitest (peer `vitest@4.1.10`),
  so provider drift shows up as an install error rather than wrong numbers;
  one dependency, already maintained by the Vitest team.
- **Cons:** V8 coverage is derived from bytecode ranges mapped back through
  source maps, so branch attribution is coarser than instrumented coverage and
  occasionally counts a transpiled construct oddly; ties us to the exact
  Vitest version on every upgrade.

### @vitest/coverage-istanbul

- **Pros:** instrumented coverage with finer-grained, more literal branch and
  statement mapping, which matters if branch coverage is ever gated; long
  history and familiar report semantics.
- **Cons:** instruments every source file before running, which is slower for
  no benefit while branches are not gated; a second toolchain's report
  semantics to reason about; still a peer-locked dependency, so it trades none
  of the upgrade cost.

### Gate all four metrics at 90%

- **Pros:** closest to the PRD's blanket ">90% test code coverage" wording;
  no explanation needed for why some metrics are advisory.
- **Cons:** branches is 50% (1/2) today and the uncovered half is
  `src/lib/db.ts:33`'s `development` config path, unreachable while Vitest
  forces `NODE_ENV=test`; enabling it fails every run immediately
  (`ERROR: Coverage for branches (50%) does not meet global threshold (90%)`,
  exit 1). The issue's own criteria name lines and statements.

### Exclude src/app/layout.tsx instead of testing it

- **Pros:** reaches 90% with no new tests, keeping #6 purely about CI wiring.
- **Cons:** buys the number by shrinking the denominator and leaves a real
  file untested; sets the precedent that files awkward to test get excluded,
  which is how a coverage gate becomes decorative.

## Trade-offs and consequences

Coverage enforcement becomes real and blocking on every pull request, and the
measured set is honest — product code only, no test helpers padding it. The
cost is a coverage number that is deliberately partial: lines and statements
are gated, branches and functions are visible but toothless, so a change that
adds only untaken branches passes the gate. Mocking `next/font/google` to make
`layout.tsx` testable is a second, smaller cost: those tests assert against a
stub, so they verify that the layout *requests* the `latin-ext` subset rather
than that the glyphs render — that end of FR-01 stays with the Lighthouse
budget (#31) and manual QA (#18).

Revisit when `src/lib/db.ts:33`'s `development` branch becomes reachable (then
gate branches too), if V8's branch attribution ever disagrees with a reviewer
about a real gap (then reconsider istanbul), or when the codebase is large
enough that 90% on lines alone stops being a meaningful signal.
