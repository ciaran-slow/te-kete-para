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
the repo itself. Gate against both:

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
