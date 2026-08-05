# ADR 0056: Vercel Cron Job triggers an authenticated route to invoke the nightly dispatcher

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #110

## Context

`architecture.md` §3 says "Cron workers execute nightly at 6:00 PM NZST."
#27 (ADR 0044) deliberately built only the pure decision logic
(`collectNightlyDispatchCandidates`, `src/lib/notifications/dispatcher.ts`)
and #28 (ADR 0049/0050) built the send integration
(`runNightlyDispatch`, `src/lib/notifications/dispatch-runner.ts`), both
explicitly deferring "how this actually runs nightly in production" to this
issue — there is no cron/scheduler infrastructure anywhere in this app
today (no `vercel.json`, no background worker runtime), and
`architecture.md` §1 leaves the hosting platform ambiguous ("hosted via
Vercel or Netlify"). Both #27 and #28 are merged, so there is now something
real for a trigger to invoke.

## Decision

Add `vercel.json` with a single `crons` entry: `GET /api/notifications/dispatch`
at `"0 6 * * *"` (06:00 UTC daily = 18:00 NZST — a fixed offset, matching
`architecture.md`'s literal "6:00 PM **NZST**" framing rather than a
DST-following "6pm NZ local time", since Vercel Cron schedules are always
UTC and never DST-adjusted). The new route
(`src/app/api/notifications/dispatch/route.ts`) exports only `GET` (Vercel
Cron cannot invoke a route with any other method) and checks
`Authorization: Bearer <CRON_SECRET>` against `process.env.CRON_SECRET` —
Vercel's own documented convention for securing Cron Job routes: when a
`CRON_SECRET` env var is set on the project, Vercel automatically attaches
that header to its own trigger requests, so no custom cron-side
configuration is needed beyond setting the env var. An unset
`CRON_SECRET` is treated as a documented config gap, extending ADR
0047/0050's pattern: the route responds `503` (distinct from a present-but-
wrong secret's `401`) rather than either accepting every request (unsafe)
or crashing. On success it calls `runNightlyDispatch(new Date())` (#28) —
which internally calls `collectNightlyDispatchCandidates` (#27) — and
returns `{ attempted, succeeded, failed }` (ADR 0013's "always an object"
convention; a non-collection endpoint's own top-level keys, decided here).
No real `CRON_SECRET` value is generated or committed by this PR.

## Alternatives considered

### Vercel Cron Job + authenticated API route (chosen)
- **Pros:** Zero new infrastructure to operate — Vercel's own scheduler,
  configured entirely in a checked-in `vercel.json`; the auth pattern
  (`CRON_SECRET` bearer header) is Vercel's own documented convention, so
  there's no bespoke scheme to design, test, or explain; matches
  `architecture.md` §1's "Vercel Edge / Serverless API Layer" framing,
  which every existing route already runs under.
- **Cons:** Commits this repo to Vercel specifically — `architecture.md`
  §1's "Vercel or Netlify" ambiguity is now resolved in Vercel's favor by
  this ADR, not a dedicated hosting-decision issue; a project not actually
  deployed on Vercel gets a `vercel.json` that does nothing.

### Netlify Scheduled Functions
- **Pros:** Resolves the same ambiguity in Netlify's favor; Netlify's
  scheduled functions are a comparable managed-cron primitive.
- **Cons:** No existing code in this repo assumes Netlify-specific
  conventions anywhere (no `netlify.toml`, no `@netlify/functions` usage);
  would need its own trigger-auth story invented from scratch (Netlify's
  scheduled functions don't have Vercel Cron's built-in `CRON_SECRET`
  header convention) rather than following a documented platform pattern.

### GitHub Actions scheduled workflow that `curl`s the deployed route
- **Pros:** Platform-agnostic — works identically regardless of where the
  app is hosted; already have `.github/workflows/ci.yml` as precedent for
  workflow-file conventions in this repo.
- **Cons:** Couples nightly delivery to GitHub Actions' scheduler
  reliability/latency guarantees (minutes of drift are explicitly
  undocumented/best-effort) for a time-sensitive nightly job; still needs
  the exact same authenticated-route + shared-secret design this ADR
  already specifies, so it only changes who calls the route, not the
  route's own auth story — strictly more moving parts for no benefit given
  the app is already Vercel-shaped everywhere else.

### Self-hosted scheduler (e.g. `node-cron` inside a long-running process)
- **Pros:** No platform lock-in at all.
- **Cons:** `architecture.md` §1 and §2B describe this app as serverless
  functions with no long-running process to host an in-memory scheduler in
  — would require standing up genuinely new infrastructure (a persistent
  worker), which no other part of this repo has, for a problem Vercel
  Cron already solves as a config file.

## Trade-offs and consequences

- Accepted: this ADR is the de facto resolution of `architecture.md` §1's
  Vercel-vs-Netlify ambiguity, decided as a side effect of this issue
  rather than a dedicated platform-decision issue — recorded here so a
  future contributor doesn't need to guess why routes assume Vercel Cron
  specifically. `architecture.md` §1 should be revisited to state Vercel
  directly rather than "Vercel or Netlify" the next time it's touched.
- Accepted: `CRON_SECRET` is unset in every environment today, including
  this PR's own CI and local dev — the route 503s until someone sets it in
  Vercel's project settings. Identical shape to ADR 0047/0050's VAPID gap;
  no user-facing surface is affected (this route has no UI consumer), only
  server logs / cron run history.
- Accepted: no retry/backoff if a nightly run's `runNightlyDispatch` call
  itself rejects (e.g. a DB outage at 6pm) — Vercel Cron does not
  automatically retry a failed invocation. Filed as #122 (retry/backoff
  and failure alerting for the nightly dispatch cron run) rather than
  expanding this issue's scope.

## Revisit if

`architecture.md` §1's hosting ambiguity is formally resolved in a
dedicated issue (fold this ADR's Vercel commitment into that decision
instead of leaving it implicit here), or #122 lands and changes this
route's failure-handling shape.
