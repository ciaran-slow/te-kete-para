---
name: build
description: Implement one GitHub issue from the plan posted on it, with tests, then open a PR. Use when the user says "use the build skill", "build this issue", or hands over an issue number to implement.
---

# Build

You are the **do** stage. A plan already exists and was written by a different
context. Your job is to execute it, not to redesign it.

## 1. Load the brief, not the conversation

Everything you need is on the issue. Nothing is in your context.

```
gh issue view <n> --repo ciaran-slow/te-kete-para --comments
```

The plan is a comment on the issue. Read it fully before touching code.

Then read, in this order:

- `docs/architecture.md` — binding technical constraints
- `docs/prd0.md` — the product behaviour the issue serves
- only the source files the plan names

This fork's Next.js has breaking changes. List `node_modules/next/dist/docs/`
and read every guide covering an API the plan names — before writing code, not
after the gates disagree with your training data. Skimming `index.md` and
grepping is not reading; a UI-free issue got away with that once by luck.

Do not go exploring beyond that. If the plan does not mention a file, you almost
certainly should not be editing it.

## 2. Branch

```
git checkout -b issue-<n>-<short-slug>
```

One branch per issue. The challenge grades on a PR per issue, so this stage
never commits straight to `main`.

## 3. Implement exactly what the plan says

Follow it to the letter. Same file paths, same names, same shapes.

**If the plan is wrong, stop.** Say what is wrong and why, and wait. Silently
substituting your own design defeats the point of having planned — and the
verify stage will be checking the code against that plan, so a divergence reads
as a defect even when your version is better.

One exception: when the plan collides with a repo gate — a lint rule or
typecheck error forbids the prescribed pattern, **or a specified test case
cannot be made to pass as literally written** (e.g. it asserts a hook value at
a lifecycle moment the test runner doesn't actually expose — verify this with
a throwaway scratch test before assuming it, don't just guess) — make the
**minimal** deviation that satisfies the gate, and flag it explicitly in the
PR body: what the plan said, what the gate said, what you did instead.
Structural conflicts (wrong data shape, wrong file layout, wrong approach)
still stop.

Silently substituting a weaker test for one the plan required is the same
violation as silently substituting your own design — it must be flagged, not
swapped in quietly. Dropping coverage of a code path (a hydration gate, an
error branch) without saying so reads as done when it isn't.

Small judgment calls the plan did not cover are yours to make. Structural
changes are not.

When a test fails with a "missing provider" / "hook must be used within" /
"invariant expected X to be mounted" style error, the fix is almost never
local to the failing test file. Grep for every place that renders the
component whose hook is unmet (`grep -rn "<ComponentName" src/`) before
patching — the same unmet dependency usually needs the same fix in every one
of those call sites, not just the first one you tripped over. Patching only
the failing file and iterating file-by-file burns cycles rediscovering the
same root cause each time.

## 4. Repo constraints

These hold regardless of what any individual plan says:

- **New or changed persistence goes through a Knex migration.** SQLite3 via
  Knex.js is the data layer (docs/architecture.md §2B/C) — no ad hoc schema
  changes, no hand-written SQL bypassing the query builder.
- **`localStorage` is client-only state, not the backend**: language
  preference and offline-cached schedules (NFR-02). Never touch it during
  render — read and write it only in an effect, after mount. A top-level
  access breaks prerendering and causes hydration mismatch.
- **Every Knex migration has a working `down`.** Every persisted client-side
  cache blob carries a `version` field. **Never destroy data you cannot
  regenerate** — unreadable cached or stored data gets quarantined, not
  discarded.
- **Every API route gets a Supertest integration test** against an in-memory
  SQLite DB (docs/architecture.md §2B) — happy path, edge cases, and the
  failure path.
- **Every new or changed UI string needs a matching key in both `en` and
  `mi`.** The translation key-parity test is a gate (FR-01), not optional
  coverage.
- **Every new page or interactive component gets an axe a11y test** and must
  meet the touch-target / focus-ring / `aria-live` requirements in
  docs/vision.md §3.
- **New dependency = an architecture decision.** It gets an ADR in
  `docs/adr/` (normally drafted in the plan), or it does not go in.

## 5. Tests are yours, not the verifier's

You write the code *and* the tests. Arriving at verify with no tests is a
failed build.

- Vitest + React Testing Library, `*.test.ts(x)` next to what it tests.
- Test behaviour a user can observe, not internals. Query by role and label,
  never by test id.
- A test that passes whether or not the code works is worse than no test. For
  each one, ask what change to the source would make it fail.
- **A tunable numeric/date constant (a lookahead window, a retry count, a
  timeout) is not pinned by a fixture derived from that same constant.**
  `today = Date.UTC(...) - LOOKAHEAD_DAYS * MS_PER_DAY` only proves the loop's
  boundary is inclusive — it cannot fail if `LOOKAHEAD_DAYS` itself silently
  regresses to a smaller (or zero) value, because the fixture shrinks right
  along with it (#24: `LOOKAHEAD_DAYS = 0` — the rejected today-only
  alternative in that issue's own ADR — passed the entire suite). Pin the
  constant with at least one assertion built from literal, independent
  values on each side of the boundary (a concrete date/number the test
  chose, not one computed from the constant), so a regression to the
  constant's value itself is what the test is protecting.

## 6. Gates — all four, all green, all together, last

```
npm run typecheck
npm run lint
npm run test:coverage
npm run build
```

Run `npm run test:coverage`, not `npm test` — that is the gate
`.github/workflows/ci.yml` actually enforces (docs/architecture.md §4, 90%
lines/statements). `npm test` runs the same suite without evaluating that
threshold, so a build that only ran `npm test` can look green locally and
still fail CI on coverage.

`npm run build` is not optional. It is the only check that catches a
`localStorage` access during prerender.

If a gate fails, fix it. Do not report "done with one failing test".

**Re-run all four from scratch as the literal final step before you commit —
after every edit, including edits made to fix a gate failure.** A fix for one
gate can silently break another: a workaround for a failing test (an
untyped cast, a new shared mock) is exactly the kind of change that passes
`npm run test:coverage` while failing `npm run lint`. Running only the gate you just fixed,
or only the gates you remember touching, is how "all four passed" ends up
being false by the time you commit. There is no partial-credit order here —
run all four, in one sitting, after the last line you changed.

## 7. Record decisions as ADRs

Architecture decisions are logged individually in `docs/adr/`, one file per
decision (`docs/adr/README.md` has the convention, `0000-template.md` the
format).

- **Decisions the plan already made** arrive as ADR drafts in the plan's
  "ADRs" section. Commit each one verbatim at its stated path. Do not skip
  this because the code "speaks for itself" — the ADR is a deliverable of the
  issue, same as the tests.
- **Decisions you made while building** — a folder convention, a state
  approach, how migrations work, any gate-forced deviation with architectural
  consequences — get their own ADR, written by you from the template: context,
  the decision, the alternatives you weighed with pros and cons, and the
  trade-offs accepted. If you cannot name an alternative you rejected, it was
  not an architecture decision; leave it out.

When an ADR changes the current architecture, also update
`docs/architecture.md` to match and cite the ADR number — architecture.md
stays the current-state picture; the ADR carries the reasoning.

ADRs ship in the same PR as the code they justify.

## 8. Commit, push, PR

Commit message: what changed and why, not a restatement of the diff. End it
with a `Co-Authored-By: Claude <model>` trailer — the verify stage reads this
to confirm it is running on a different model than the one that built.

```
gh pr create --title "<issue title>" --body "Closes #<n> ..."
```

The PR body should say what was built, anything that deviated from the plan and
why, and how it was verified.

## 9. Stop. Do not verify your own work.

You have just written this code. You cannot review it — to you, the code and the
plan are the same thought.

End by telling the user to `/clear` and run the verify skill **on a different
model**. Do not summarise it as "verified" or "complete". It is built, not
verified.
