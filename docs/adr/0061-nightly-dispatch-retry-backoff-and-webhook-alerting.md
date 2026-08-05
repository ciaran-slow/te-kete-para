# ADR 0061: In-request exponential-backoff retry and webhook alerting for nightly dispatch failures

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #122

## Context

ADR 0056 (#110) wired a Vercel Cron trigger to `GET
/api/notifications/dispatch`, which calls `runNightlyDispatch` (#28), and
explicitly deferred what happens when that call rejects (e.g. a transient
DB outage at 6pm): "no retry/backoff... Filed as #122." Vercel Cron does not
retry a failed invocation itself. Today the route just logs and returns 503
— a bad night means zero subscribers get reminded, discoverable only by
someone reading logs afterward.

`runNightlyDispatch` (`src/lib/notifications/dispatch-runner.ts`) composes
three steps: `collectNightlyDispatchCandidates` (a DB read), `sendDispatchBatch`
(never rejects — every `sendDispatchPayload` call resolves regardless of
delivery outcome, ADR 0050), and `pruneGoneSubscriptions` (a DB write). Before
this issue, a `pruneGoneSubscriptions` failure rejected the whole call even
though every push in the batch had, by that point, already been sent —
meaning any retry of the *whole* `runNightlyDispatch` call risked re-sending
pushes to subscribers who'd already received one that same night.

## Decision

Two changes:

1. `runNightlyDispatch` now catches and logs a `pruneGoneSubscriptions`
   failure instead of letting it reject the call. Pruning is cleanup, not
   delivery — its failure shouldn't make a successful send look like a
   failed run, and it removes the only rejection source that occurs *after*
   sends happen. The only remaining rejection source is
   `collectNightlyDispatchCandidates`'s DB read, which always happens
   *before* any push is sent — making it safe to retry blindly.
2. The route (`src/app/api/notifications/dispatch/route.ts`) wraps its call
   to `runNightlyDispatch` in `withRetry` (`src/lib/notifications/retry.ts`):
   3 attempts total, exponential backoff starting at 500ms (500ms, then
   1000ms between attempts). If every attempt fails, the route calls
   `alertNightlyDispatchFailure` (`src/lib/notifications/alerting.ts`), which
   POSTs a JSON payload (`{ event, message, attempts, timestamp }`) to
   `process.env.DISPATCH_ALERT_WEBHOOK_URL` — a generic webhook endpoint
   (e.g. a Slack incoming webhook, a PagerDuty Events API integration, or any
   other JSON-accepting alert intake), read at the point of use. An unset
   `DISPATCH_ALERT_WEBHOOK_URL` is a documented config gap: the route still
   logs and returns 503, it just doesn't send an external alert — same shape
   as `CRON_SECRET` (ADR 0056) and the VAPID keys (ADR 0047/0050). No real
   webhook URL is provisioned by this PR.

## Alternatives considered

### In-request retry + webhook alert (chosen)
- **Pros:** No new infrastructure or persisted state. Recovers from
  sub-backoff-window transient failures (the dominant real-world case named
  in this issue — "a transient DB outage at 6pm") without waiting for a
  human. The alert path is an outbound HTTP call, independent of this app's
  own DB — the exact store a DB-outage failure could otherwise leave
  unreadable.
- **Cons:** Backoff is bounded by the serverless function's own execution
  window — a multi-minute outage still just gets one alert, not a
  self-healing retry loop. `DISPATCH_ALERT_WEBHOOK_URL` is unprovisioned in
  every environment until a real endpoint exists.

### A second Vercel Cron trigger at a later time (e.g. 18:15)
- **Pros:** Needs no code-level retry logic — Vercel's own scheduler does
  the re-invocation.
- **Cons:** Cron triggers are unconditional — the second run has no way to
  know the first one already succeeded, short of persisting run status
  somewhere (see the rejected status-endpoint alternative below) and
  checking it, which is strictly more moving parts than an in-request retry.
  Without that check, a first run that partially succeeded (e.g. sent 90% of
  pushes, then the DB read for the remaining 10% failed) would have those
  90% of subscribers double-notified by a second unconditional full run.

### Retry counter persisted on the push_subscriptions/a new table, with a DB-backed status endpoint
- **Pros:** Gives a human a `GET` endpoint to check ("did last night's run
  succeed?") without waiting for an alert to fire; a durable record of run
  history.
- **Cons:** Requires a new migration and schema decision for no
  acceptance-criteria-mandated need. Worse, it is least reliable exactly
  during the failure mode this issue targets: if the DB is down, writing
  "the run failed" to that same DB can itself fail, and the endpoint reading
  it would 503 too — indistinguishable from "nobody's checked recently."
  An outbound webhook alert has no such circular dependency.

### Email alert via a transactional email provider
- **Pros:** Reaches a human directly, no dashboard to check.
- **Cons:** Needs a new dependency (e.g. an email API client) and a second
  unprovisioned secret/credential on top of the webhook URL, for no benefit
  over a webhook that can itself point at an email-via-webhook bridge (e.g.
  Slack, Zapier, or a monitoring service's own email-on-alert rule) if that's
  what's ultimately wanted. Deferred rather than building a second delivery
  channel this issue doesn't require.

### No retry, alert only
- **Pros:** Simplest possible change — one webhook call added to the
  existing catch block, no backoff logic.
- **Cons:** Gives up on transient failures (a DB blip lasting a few seconds)
  that a bounded retry would likely recover from at essentially no cost,
  leaving every subscriber unnotified for a failure mode the retry could
  have silently fixed.

## Trade-offs and consequences

- Accepted: `DISPATCH_ALERT_WEBHOOK_URL` is unset in every environment
  today, including this PR's own CI and local dev — alerting silently
  no-ops until someone configures it, identical in shape to the
  `CRON_SECRET`/VAPID config gaps (ADR 0047/0050/0056).
- Accepted: retry backoff (up to 1.5s) plus the alert's own 3s fetch timeout
  adds up to ~4.5s of worst-case latency to the route. No `vercel.json`
  change (no second cron entry, no `maxDuration`) — this stays comfortably
  under every Vercel plan's default function timeout.
- Accepted: the alert payload is a generic JSON envelope
  (`{ event, message, attempts, timestamp }`), not shaped for any one
  specific third-party service's exact ingestion schema (e.g. PagerDuty
  Events API v2's `routing_key`/`payload.summary` shape). Whoever provisions
  the real webhook may need a small relay/adapter if the target service
  needs a different body shape — accepted rather than guessing a specific
  vendor's schema with no real integration to test against.
- Accepted: a multi-minute or longer outage still only produces one alert
  after ~1.5s of retrying, not a longer-running retry loop or a repeat
  alert — proportionate to a nightly (not latency-critical, but also not
  infinitely retriable within one serverless invocation) job.

## Revisit if

A real `DISPATCH_ALERT_WEBHOOK_URL` is provisioned and its target service
needs a specific payload shape this generic envelope doesn't satisfy, or a
future issue needs persisted run history (a status endpoint) for reasons
beyond "alert a human faster than reading logs" — at which point the
DB-backed alternative rejected here should be reconsidered on its own
merits, not smuggled into this ADR.
