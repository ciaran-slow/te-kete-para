---
name: plan
description: Write the implementation plan for one GitHub issue and post it on the issue. Use when the user says "use the plan skill", "plan this issue", or hands over an issue number to plan before building.
---

# Plan

You are the **plan** stage. A different context — probably a different model —
will build from what you write, and another will verify against it. Neither
will see this conversation. If it is not on the issue, it does not exist.

## 1. Load the issue and the docs

```
gh issue view <n> --repo ciaran-slow/te-kete-para --comments
```

Then read:

- `docs/architecture.md` — binding technical constraints
- `docs/prd0.md` — the product behaviour the issue serves
- the source files this issue will touch or build on

## 2. Check repo reality before prescribing anything

The two most expensive planning failures so far were plans that contradicted
the repo itself. Gate against both, then check the third recurring gap below:

- **Lint config.** For every code pattern the plan prescribes (a hook shape,
  an effect, a state approach), confirm the repo's ESLint setup allows it:

  ```
  npx eslint --print-config src/app/page.tsx
  ```

  This repo runs the compiler-backed `eslint-plugin-react-hooks` rules as
  errors — e.g. `react-hooks/set-state-in-effect` forbids the classic
  `setState`-inside-`useEffect` hydration pattern. A plan that prescribes a
  forbidden pattern forces the builder to choose between the plan and the
  gates.

- **This fork's Next.js docs.** AGENTS.md is not decoration: this Next.js has
  breaking changes. List `node_modules/next/dist/docs/` and read every guide
  covering an API the plan will name. Do not prescribe from training data.

- **Forward references from prior ADRs and migrations.** This repo's ADRs
  routinely predict work for a numbered future issue before that issue is
  planned — e.g. ADR 0016 named a future "#22" for per-date overrides, and
  ADR 0029 stated that "#23 is expected to" join the `holidays` table
  against `schedules` and populate `is_holiday_override`/`original_date`
  (a migration comment made the same claim). Search for these before
  narrowing scope:

  ```
  grep -rln "#<n>" docs/adr db/migrations
  ```

  If a prior ADR or migration comment describes work for this issue that
  the acceptance criteria alone don't require, the plan may still
  legitimately narrow away from it (e.g. deferring DB wiring while a
  dependency is unverified) — but the plan must say so explicitly: either
  fold the described work back in, or name the exact issue that now owns
  it (filing a new one with `gh issue create` if none exists) and record
  that pointer in this issue's own ADR. A prior ADR's stated expectation
  quietly going unmet, with no issue tracking it, is untracked scope, not
  a scope decision — and accepted ADRs shouldn't be edited after the fact
  to retract what they predicted (`docs/adr/README.md`), so the correction
  belongs in the new plan/ADR, not a rewrite of the old one.

## 3. Decide, don't defer

Unresolved decisions in a plan become the builder's improvisations. For
genuine forks — a new dependency, a persisted data shape, anything that
destroys or migrates data — ask the user now (AskUserQuestion) and record the
answer in the plan.

**Every architecture decision the plan makes gets its own ADR, drafted in the
plan.** Copy the format from `docs/adr/0000-template.md` (see
`docs/adr/README.md` for what qualifies and how numbering works): context,
the decision, each alternative considered with pros and cons, and the
trade-offs being accepted. Put the full draft in the plan under an "ADRs"
section with the target filename (`docs/adr/NNNN-slug.md`) so the builder
commits it verbatim alongside the code. A decision without alternatives and
trade-offs is not decided — it is deferred with extra steps.

A new dependency is always an architecture decision: it gets an ADR draft in
the plan, or it does not go in the plan.

These repo constraints bind every plan:

- The backend is Next.js API routes over SQLite3 via Knex.js (docs/architecture.md
  §2B/C). New or changed persistence goes through a Knex migration — no ad hoc
  schema changes, no hand-written SQL bypassing the query builder.
- `localStorage` is client-only state — language preference and offline-cached
  schedules (NFR-02) — never the primary data store. It is never touched during
  render; read and write it only in effects, after mount.
- Every Knex migration has a working `down`. Every persisted client-side cache
  blob carries a `version` field so a stale shape can be migrated or
  quarantined, never silently misread or discarded.
- Every API route needs a Supertest integration test against an in-memory
  SQLite DB (docs/architecture.md §2B): happy path, edge cases, failure path.
- Every new or changed UI string needs a matching key in both `en` and `mi` —
  the translation key-parity test is a gate (FR-01), not a suggestion.
- Every new page or interactive component needs an axe a11y test and must meet
  the touch-target / focus-ring / `aria-live` requirements in docs/vision.md §3.

## 4. Write the plan

Exact file paths, exact names, exact shapes. The build skill instructs the
builder to follow it to the letter and to stop if it is wrong — ambiguity here
becomes either a stall or a silent redesign.

Scope it to one PR. If the plan is growing sections, the issue is too big;
say so instead of planning it.

## 5. Specify the tests, not just the code

This is where the last plan failed: it asked for "malformed JSON" coverage,
the builder tested one read of one corrupt blob, and an unbounded-growth bug
walked through the gap.

For every behaviour the plan prescribes, the test requirements must cover:

- the happy path
- the failure path (bad input, missing key, quota full)
- **repetition** — the same operation twice or three times. Idempotence bugs
  (growth, duplication, drift) are invisible to single-shot tests.

Name the concrete cases. "Tests for error handling" is not a requirement; "a
corrupt blob read three times produces exactly one quarantine copy" is.

**When you write the fixture data yourself, check it can actually falsify the
mechanism it's meant to prove.** A test for ordering, dedup, sort direction,
or escaping is only real if the *wrong* implementation would produce a
different result against the exact fixtures you specified — not just if the
*right* implementation produces the asserted result. Issue #11's plan
specified insert order `Cuba Mall, Cuba Street, Karori Road` for a case
described as proving `.orderBy("street_name")`, but that insert order is
already alphabetical — SQLite's default rowid order matched the asserted
order with no `ORDER BY` at all, so the assertion passed identically whether
or not the clause under test existed. It happened once in the plan and was
then faithfully reproduced by two independent build attempts before verify
caught it both times. Before finalizing fixture data for this kind of
assertion, ask: "if the mechanism under test were deleted, would this exact
assertion still pass against this exact data?" If yes, reorder the fixtures
or add one until the answer is no.

## 6. Post the plan on the issue

```
gh issue comment <n> --body-file <plan.md>
```

The plan must survive `/clear`. A plan that lives only in this chat is a plan
the builder never sees. Draft it in the scratchpad, review it once against
the acceptance criteria on the issue, then post.

## 7. Stop. Do not build.

Planning and building in one context defeats the pipeline: the builder must
execute the plan cold, and the verifier must be able to read the plan as a
contract, not a memory.

End by telling the user to `/clear` and run the build skill on a fresh
context. The issue now carries everything the builder needs.
