# ADR 0036: Lighthouse CI performance & accessibility budget

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #31

## Context

NFR-01 (docs/prd0.md) requires "First Contentful Paint under 1.5 seconds on
mobile 4G networks; Lighthouse Accessibility and Best Practices scores of
100." Nothing in the pipeline measures any of this today. ADR 0007 and ADR
0008 already name "the Lighthouse budget (#31)" as the compensating control
for two gaps jsdom's axe helper cannot decide — contrast ratios and
document-level rules (`html-has-lang`, landmarks-per-page) — because jsdom
performs no layout. ADR 0023 established the precedent for adding a new,
independently-scoped CI job alongside `gates` without folding it into the
fast four gates (ADR 0001), and for leaving branch-protection enforcement as
a manual maintainer follow-up rather than bundling it into the code PR that
introduces the job.

## Decision

Add `@lhci/cli` (`^0.15.1`) as a devDependency, a `lighthouserc.js` config at
the repo root, a `test:lighthouse` npm script (`lhci autorun
--config=lighthouserc.js`), and a third parallel job, `lighthouse` (`name:
lighthouse (perf & a11y budget)`), in `.github/workflows/ci.yml`. The job
builds the app, then runs `lhci autorun`, which starts `npm run start`
itself and audits `http://localhost:3000/` three times, asserting the
median run's `categories:accessibility` and `categories:best-practices`
scores are 1 (100) and `first-contentful-paint` is at most 1500ms. Chrome
runs headless with `--no-sandbox --disable-dev-shm-usage`, matching
`ubuntu-latest`'s preinstalled Chrome rather than installing a second
browser (Playwright's job already installs Chromium for a different
purpose — ADR 0023). Reports are written to `./.lighthouseci` and uploaded
as a build artifact (`actions/upload-artifact@v4`, `if: always()`) so a
failure is inspectable without re-running locally.

Like ADR 0023's `a11y (axe)` job, `lighthouse` is not made a required status
check in this PR — that branch-protection change is a manual maintainer
follow-up, mirroring #45's precedent, verified independently of this code
diff.

## Alternatives considered

### `@lhci/cli` with a filesystem-scoped, no-preset config (chosen)
- **Pros:** first-party Google tooling for exactly this use case; runs
  Lighthouse three times and asserts against the median, damping single-run
  noise; no preset means only NFR-01's three named metrics can fail the
  build — no surprise SEO/PWA-installability failures unrelated to this
  issue.
- **Cons:** a second headless-Chrome dependency in CI (Playwright's job
  already has one, for axe, not Lighthouse); FCP is a wall-clock timing
  metric on a shared CI runner, so its budget can be noisier than the
  deterministic accessibility/best-practices score assertions — the same
  category of cost ADR 0017 already accepts for suite timing, mitigated but
  not eliminated by the 3-run median.

### `lighthouse:recommended` preset, then override unwanted assertions
- **Pros:** less config to hand-write.
- **Cons:** the preset also gates on categories NFR-01 never mentions (SEO,
  PWA installability); overriding every assertion this issue does not want
  is more code than writing the three wanted ones directly, and a future
  Lighthouse version adding a new default assertion would silently expand
  this job's scope again.

### `lhci`'s `temporary-public-storage` upload target
- **Pros:** zero-config public report URLs, no artifact plumbing.
- **Cons:** uploads full page-content/report data to a third-party Google
  service on every CI run, including on forks/PRs from outside
  contributors; `filesystem` + `actions/upload-artifact` keeps report data
  inside the repo's own GitHub Actions storage.

### Fold Lighthouse into the existing `gates` job
- **Pros:** one job, already the sole required check.
- **Cons:** directly repeats ADR 0001's/ADR 0023's rejected alternative for
  the same reason — `gates` stays fast and browser/build-independent for
  the other three fast checks (lint, typecheck, test); a full `next build`
  + `next start` + three Lighthouse passes belongs with the other
  browser-dependent job, not the fast gate.

### Custom budget script (a Node script computing FCP via the Chrome
DevTools Protocol directly, no `@lhci/cli`)
- **Pros:** no new dependency.
- **Cons:** reimplements report parsing, median aggregation, and category
  scoring that `@lhci/cli` already does correctly and maintains; a
  hand-rolled equivalent is more code to keep correct than the config this
  ADR adds.

## Trade-offs and consequences

CI gains real, browser-measured signal for NFR-01's three numbers, closing
the compensating-control gap ADR 0007/ADR 0008 named in advance. The job
duplicates `npm ci` and now also a full `npm run build` that the `gates` job
already ran — an accepted cost, the same one ADR 0023 accepted for `npm ci`
duplication in the `a11y` job. FCP's 1500ms budget can fail on `ubuntu-latest`
CI-runner variance unrelated to a real regression; the 3-run median damps
but does not eliminate this — if it starts flaking, the fix is investigating
real render cost first, not silently raising the number. The job is scoped
to `/` only, since it is the only composed route; the plan for #31 records
this explicitly so it reads as a decision, not a silent gap. Revisit if
`@lhci/cli` moves to a runner-agnostic throttling mode that removes the
wall-clock variance, or when #69/#70/#78 close and a second route needs a
budget.
