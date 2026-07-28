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
gh issue view <n> --repo ciaran-slow/nextjs-project --comments
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

- **No backend, no API calls, no network.** `localStorage` is the whole data
  layer.
- **Never touch `localStorage` during render.** Read it in an effect, after
  mount. A top-level access breaks prerendering and causes hydration mismatch.
- **Every persisted blob carries a `version` field.**
- **Never destroy data you cannot regenerate.** Unreadable stored data gets
  quarantined, not discarded.
- **New dependency = an architecture decision.** It goes in
  `docs/architecture.md` with the reason, or it does not go in.

## 5. Tests are yours, not the verifier's

You write the code *and* the tests. Arriving at verify with no tests is a
failed build.

- Vitest + React Testing Library, `*.test.ts(x)` next to what it tests.
- Test behaviour a user can observe, not internals. Query by role and label,
  never by test id.
- A test that passes whether or not the code works is worse than no test. For
  each one, ask what change to the source would make it fail.

## 6. Gates — all four, all green, all together, last

```
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` is not optional. It is the only check that catches a
`localStorage` access during prerender.

If a gate fails, fix it. Do not report "done with one failing test".

**Re-run all four from scratch as the literal final step before you commit —
after every edit, including edits made to fix a gate failure.** A fix for one
gate can silently break another: a workaround for a failing test (an
untyped cast, a new shared mock) is exactly the kind of change that passes
`npm test` while failing `npm run lint`. Running only the gate you just fixed,
or only the gates you remember touching, is how "all four passed" ends up
being false by the time you commit. There is no partial-credit order here —
run all four, in one sitting, after the last line you changed.

## 7. Record decisions

`docs/architecture.md` is a living document. If you made a real architectural
choice while building — a folder convention, a state approach, how migrations
work — add the decision and its reason. Not a rewrite; a few lines.

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
