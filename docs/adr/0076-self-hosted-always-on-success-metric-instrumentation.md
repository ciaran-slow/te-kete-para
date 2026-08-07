# ADR 0076: Self-hosted, always-on, PII-free instrumentation for the two PRD success metrics

- **Status:** accepted
- **Date:** 2026-08-08
- **Issue:** #179

## Context

PRD v1's NFR-04 names two success metrics from §1 — push notification
delivery success rate and onboarding time (<30s to find a schedule) — that
have been unmeasurable prose since v0.2 was written: no analytics/telemetry
package exists in this codebase, and no dispatch-outcome aggregation exists
beyond per-run logging. The issue's own guardrail, and this PRD's standing
no-telemetry-by-default posture (this is a prototype for a council
service), require an explicit, recorded decision on whether any
instrumentation is self-hosted, sampled, or opt-in — made *before* writing
any telemetry code, not discovered by reading the diff after the fact.

The per-attempt retry/alerting/pruning logic for push delivery already
exists (`dispatch-runner.ts`, `alerting.ts`, ADR 0057, ADR 0061) — this
issue is about surfacing an aggregate number, not new delivery logic. The
onboarding side has no equivalent: no timing of any kind is captured today
between initial page load and a resident seeing their real collection
schedule (`<ScheduleDisplay>`, `src/components/schedule-display.tsx`).

## Decision

No third-party analytics package is added. Both metrics are surfaced
entirely through this app's own API/log surface:

1. **Push delivery rate:** `GET /api/notifications/dispatch`'s success path
   now also emits one structured `console.log` line per run —
   `{ event: "nightly_dispatch_summary", attempted, succeeded, failed,
   successRatePercent, timestamp }` — reviewable in the same Vercel
   function-invocation logs operators already read for this route's
   existing `console.error`/webhook-alert paths (ADR 0061).
   `successRatePercent` is `null`, not `100`, when `attempted === 0`, so
   "no candidates that night" is never conflated with "perfect delivery."
   No change to the route's JSON response shape.
2. **Onboarding time:** a new, self-hosted, **always-on (100%, not
   sampled, not opt-in)** client report. `src/app/address-schedule.tsx`
   measures `performance.now()` (elapsed ms since the page's navigation
   start) the first time, per page load, a user's own fresh address
   *search-and-select* — never a cache-restored address (ADR 0052) —
   resolves to a real, displayable schedule
   (`computeSchedule(...).ruleSet !== null`,
   `src/components/schedule-display.tsx`), and POSTs `{ durationMs }` to a
   new route, `POST /api/metrics/onboarding-time`. That route validates
   the body and logs one structured line —
   `{ event: "onboarding_time_recorded", durationMs, timestamp }` — then
   returns `204`. No DB write, no cookie, no session/user identifier of
   any kind is sent, generated, or logged; the request carries nothing but
   a duration in milliseconds.

Always-on rather than sampled or opt-in: the payload is a single
anonymous, non-identifying integer, so there is no privacy incentive to
sample or gate it behind consent, and both alternatives cost something real
(a sampling-rate constant tuned against no actual volume problem; a
consent UI that directly undermines the "zero-friction onboarding"
experience this metric exists to measure) for no corresponding benefit at
this app's prototype scale.

## Alternatives considered

### A. Self-hosted, always-on structured log line (chosen)
- **Pros:** zero new dependencies, zero new persisted schema, symmetric
  with how ADR 0061 already surfaces dispatch failures; the payload
  contains no PII so nothing is lost by always collecting it; smallest
  diff that satisfies NFR-04's "at minimum" bar.
- **Cons:** not queryable or aggregable over time without external log
  tooling — a human must read raw log lines (or wire up log-based
  alerting/a dashboard later) to compute a rolling average. Acceptable for
  a prototype's "at minimum" instrumentation bar, not a finished
  observability story.

### B. Third-party analytics (e.g. a hosted product analytics or web-vitals SaaS)
- **Pros:** dashboards, retention, and aggregation without building any of
  it.
- **Cons:** exactly what this issue's guardrail and the PRD's
  no-telemetry-by-default posture forbid without a deliberate decision to
  add a new third-party data processor for a council-facing prototype —
  a real privacy/procurement conversation this issue is not the place to
  have unilaterally. Also a new dependency with no ADR of its own
  justifying it on the merits.

### C. DB-persisted metrics table (new Knex migration)
- **Pros:** queryable history that survives log-retention windows; could
  back a future "metrics" admin view.
- **Cons:** a new persisted-data-shape decision and migration for no
  acceptance-criteria-mandated need — NFR-04 asks only that the numbers be
  "reviewable," not stored durably or SQL-queryable. Mirrors ADR 0061's own
  rejection of a DB-backed dispatch-status endpoint for the identical
  reason, including the same failure mode: a metric meant partly to
  surface an unhealthy night is worse off if its own write path depends on
  the same DB that might be the thing failing.

### D. Sampled collection (e.g. 10% of page loads)
- **Pros:** lower log volume at scale.
- **Cons:** no volume problem exists yet at this app's prototype scale;
  adds a sampling-rate constant with no real traffic to tune it against,
  and actively works against a brand-new metric that needs every sample
  it can get to be useful at all.

### E. Opt-in collection (a consent control gating any report)
- **Pros:** the most privacy-conservative stance available.
- **Cons:** the payload has no PII to protect, so there is nothing for
  consent to guard here. A consent prompt is exactly the kind of friction
  the "zero-friction onboarding" metric exists to detect the *absence* of
  — gating the metric's own collection behind a UI interaction would bias
  it toward measuring only users willing to tolerate an extra step, which
  is close to the opposite of what NFR-04 wants measured. Also expands
  this PR's scope into new UI/UX and a persisted consent preference,
  beyond a single PR.

## Trade-offs and consequences

- Accepted: both metrics are only as durable as the deployment's log
  retention — there is no dashboard, alert threshold, or historical query
  today. A human must read raw log lines to see a trend.
- Accepted: `POST /api/metrics/onboarding-time` is unauthenticated and
  un-rate-limited, the same as the existing public
  `GET /api/suburbs/search` — a bad actor could spam it with fabricated
  durations, polluting the aggregate. No worse than any other public route
  in this app already, and adding auth/rate-limiting is not required by
  NFR-04's acceptance bar.
- Accepted: the onboarding-time sample only ever comes from a genuine,
  fresh, in-session address search-and-select — a returning visitor whose
  address loads instantly from the offline cache (ADR 0052) contributes no
  sample at all. This is deliberate, not a gap: it keeps the metric
  measuring true first-time-lookup latency (what the PRD's "<30 seconds to
  find a schedule" claim is actually about), not diluted by near-zero
  cache hits that would make the number look artificially good.
- Accepted: `successRatePercent` in the dispatch summary log line is a
  point-in-time percentage for that one run, not a rolling average across
  runs — computing a trend across multiple nights is left to whoever reads
  the logs.

## Revisit if

A future issue needs a queryable or alertable history of either metric
beyond raw log lines — at which point the DB-backed alternative rejected
here, or a proper log-aggregation/dashboard tool, should be reconsidered on
its own merits — or a real third-party analytics decision is made
deliberately, with its own ADR, for reasons this issue's guardrail does not
cover.
