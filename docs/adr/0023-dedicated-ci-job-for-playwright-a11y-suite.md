# ADR 0023: Dedicated CI job for the Playwright a11y suite

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #17

## Context

ADR 0001 deliberately keeps Playwright out of the four fast gates
(`lint, typecheck, test, build`) because E2E needs a production build and a
browser install and runs in minutes, not seconds; it explicitly leaves
"when E2E runs are required" to be decided per issue. #17's acceptance
criteria require "CI fails the build on any axe violation," which needs the
new suite wired into `.github/workflows/ci.yml` somehow. Separately, #45/#47
already established that adding a job to `ci.yml` is a code change, while
making a check *required* (so a red run actually blocks a merge) is a
`branches/main/protection` repository setting — deliberately done as a
separate, manually-verified step outside the PR that introduces the job.

## Decision

Add a second job, `a11y` (`name: a11y (axe)`), to the existing
`.github/workflows/ci.yml`, running in parallel with `gates` (no `needs:`).
It runs `npm ci`, `npx playwright install --with-deps chromium`, then a new
script, `npm run test:e2e:a11y`, scoped to only the two new axe spec files
(`e2e/a11y.spec.ts`, `e2e/a11y-harness.spec.ts`) — not the full
`npm run test:e2e` suite, so `e2e/home.spec.ts`/`e2e/design-tokens.spec.ts`
stay exactly as un-wired-into-CI as they are today. This PR does not touch
branch-protection settings; making `a11y (axe)` a required check on `main`
is a follow-up for the maintainer, mirroring #45's precedent.

## Alternatives considered

### Second parallel job, scoped to only the two new axe specs (chosen)
- **Pros:** `gates` stays exactly as fast as ADR 0001 intends; a red a11y
  run is visible on every PR immediately, satisfying "CI fails the build"
  literally, without silently pulling the two pre-existing, never-CI-run
  specs into a path where their flakiness would newly block unrelated PRs;
  reversible/extensible independently of a later "wire all of E2E into CI"
  decision.
- **Cons:** two jobs both run `npm ci` (and this one also installs a
  browser), costing more total CI minutes than one job would;
  `home.spec.ts`/`design-tokens.spec.ts` remain untested in CI — an
  unchanged, pre-existing gap this issue does not close.

### Add the axe checks as extra steps inside the existing `gates` job
- **Pros:** one job, already the sole required check — no branch-protection
  follow-up needed to make it enforced.
- **Cons:** directly contradicts ADR 0001's explicit "stays a separate
  script rather than joining the four fast gates" — folding a production
  build and browser install into the fast gate reimposes exactly the cost
  ADR 0001 chose to avoid, on every PR regardless of whether it touches
  anything a11y-relevant.

### Run the full `npm run test:e2e` suite in the new job
- **Pros:** would also close the pre-existing "E2E never runs in CI" gap in
  the same PR.
- **Cons:** conflates two separate decisions — wiring the axe suite this
  issue asks for, versus wiring the *entire* E2E suite, which is not this
  issue's acceptance criteria — into one PR; making
  `design-tokens.spec.ts`'s font/contrast-adjacent checks merge-relevant is
  a decision of its own weight, better reviewed on its own issue.

### Fold branch-protection enforcement into this PR too
- **Pros:** closes the loop fully — a violation would actually block a
  merge, not just show red.
- **Cons:** #45 already established this as a repository-setting change,
  verified manually outside the code diff (including a probe-PR negative
  proof); doing it silently inside this code PR would blur that precedent
  and skip the negative-proof verification #45 did.

## Trade-offs and consequences

Keeps the fast gates fast and keeps the merge-enforcement decision where the
repo already keeps it — a manual, audited step — at the cost of the new job
being visible-but-not-yet-blocking until a maintainer opts it into branch
protection, and at the cost of leaving the two pre-existing e2e specs still
unwired. Revisit when a future issue decides to wire the complete `e2e/`
suite into CI — at that point this job's scope may fold into that broader
one.
