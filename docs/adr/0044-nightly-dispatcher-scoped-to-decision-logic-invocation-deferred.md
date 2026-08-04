# ADR 0044: Nightly dispatcher scoped to decision logic; invocation wiring deferred to #110

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #27

## Context

Issue #27's acceptance criteria ask for "a worker module [that] determines,
for each active subscription, whether tomorrow is a collection day and
builds a payload" and unit tests for that decision — nothing about how the
module gets invoked nightly. There is no cron/scheduler infrastructure
anywhere in this app today: no `vercel.json`, no background worker runtime,
no existing scheduled-trigger route to follow as precedent. `architecture.md`
§1 also leaves the hosting platform ambiguous ("Vercel Edge / Serverless API
Layer... hosted via Vercel or Netlify"), which any concrete cron
mechanism (e.g. a Vercel Cron Job) would have to pick one of. Issue #28
("Bilingual push payload delivery") is the one that actually sends via
Web Push and is explicitly blocked on #27 existing first.

## Decision

#27 delivers only `src/lib/notifications/dispatcher.ts` — the pure "given
now, which subscriptions need a payload" decision logic plus the DB join
that feeds it, invocable directly by tests and later by whatever calls it.
It adds no cron config, no authenticated trigger route, and makes no
hosting-platform choice. Issue #110 ("Wire the nightly dispatcher into an
actual invocation mechanism"), filed alongside this plan, tracks building
that trigger, and depends on both #27 and #28.

## Alternatives considered

### Decision logic only, invocation deferred (chosen)
- **Pros:** Matches the issue's literal acceptance criteria exactly.
  Testable in complete isolation, with no dependency on a deployment
  platform decision this repo hasn't made. Doesn't force inventing an auth
  scheme for a trigger route that would have nothing real to send until #28
  lands anyway.
- **Cons:** The feature isn't end-to-end runnable after this issue alone —
  needs #110 tracked explicitly so the gap isn't silently dropped.

### Also build a Vercel Cron Job + authenticated API route trigger now
- **Pros:** Closer to a demoable nightly job once #28 also lands; matches
  `architecture.md` §3's "cron workers execute nightly" framing literally.
- **Cons:** Forces a Vercel-vs-Netlify choice `architecture.md` leaves open.
  Forces inventing a trigger-auth scheme (e.g. a `CRON_SECRET` header) for a
  route that, until #28 exists, would have no payload worth sending —
  testing it end-to-end would be theater. Couples this issue's scope to an
  infrastructure decision unrelated to the actual date/rule-set logic under
  test.

## Trade-offs and consequences

Defers a real "does this run nightly in production" answer until #110 (and,
transitively, #28) land. Accepted because the acceptance criteria and the
existing dependency graph (this issue explicitly precedes #28, which #110
also depends on) support building the decision logic first and wiring it in
once there's something real for the trigger to invoke.
