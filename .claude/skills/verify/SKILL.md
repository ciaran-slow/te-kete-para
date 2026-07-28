---
name: verify
description: Independently review work built for a GitHub issue against its plan and acceptance criteria before merge. Use when the user says "use the verify skill", "verify this work", or asks for a review of a built issue.
---

# Verify

You are the **verify** stage: a different pass with different eyes. You did not
write this code and you must not treat it as yours.

Check you are on a **different model** than the one that built it. The
builder's model is in the commit trailer — `git log main..HEAD` and read the
`Co-Authored-By: Claude <model>` line. If the trailer is missing, say the
check is unverifiable; if the model matches yours, say so — a clean context
stops self-defence, but only a different model has different blind spots.

## 1. Assess before you touch anything

Your first job is judgement, not repair. Resist fixing things as you read; you
will lose the thread and end up half-reviewing.

## 2. Gather

```
gh issue view <n> --repo ciaran-slow/nextjs-project --comments
git diff main...HEAD
git log main..HEAD --oneline
```

Read the plan comment and the acceptance criteria on the issue, then
`docs/architecture.md`. If the issue touches product behaviour a user can
see, read the relevant part of `docs/prd0.md` too; for pure infrastructure
issues it can be skipped — deliberately, not silently.

Read the **whole diff**. A review of the parts that looked interesting is not a
review.

If you need to check whether something is pre-existing on `main` rather than
introduced by this branch, use `git show main:<path>` or `git diff main --
<path>` — never `git checkout main -- .` (or any other branch) inside the
worktree you're reviewing; it silently overwrites the branch's working tree
with the other branch's files. If a full checkout of `main` is genuinely
useful for comparison, use `git worktree add` and do the comparison there
instead of touching the tree you're actively reviewing.

## 3. Run the gates yourself

```
npm run typecheck
npm run lint
npm test
npm run build
```

Never take "tests pass" on trust. Run them. A green claim in a PR body is a
claim, not evidence.

## 4. Check each acceptance criterion individually

Go through them one at a time. For each, name the file and line that satisfies
it, or record it as unmet. "Looks done" is not a verdict.

An issue is not complete because the code exists. It is complete when each
criterion has evidence behind it.

## 5. Interrogate the tests

This is where reviews are usually weakest.

- For each test, ask: **what change to the source would make this fail?** If
  nothing obvious would, the test is decorative.
- Are the assertions about observable behaviour, or about internals?
- Are the failure cases tested, or only the happy path?
- Are queries by role and label rather than test id?
- Does anything depend on test execution order? `localStorage` is this app's data
  layer and jsdom keeps it between tests in a file.

## 6. Look specifically for

Ordered by what actually bites in this codebase:

- **Data loss.** Anything that overwrites or discards stored data a user cannot
  recreate. Reflections have no backup and no backend.
- **Unversioned blobs.** A persisted shape with no `version` field is a future
  migration that cannot happen.
- **`localStorage` during render.** Any access outside an effect breaks
  prerendering and hydration.
- **Profile leakage.** One profile reading or writing another's keys.
- **Plan divergence.** Did it build what was planned? If it deviated, is the
  deviation justified and stated?
- **Accessibility.** Hand-rolled interactive elements where a Radix/shadcn
  primitive exists; missing labels; keyboard traps. This app is mostly forms.
- **Security.** `dangerouslySetInnerHTML`, unescaped user text, anything
  executing stored strings.
- **Scope creep.** Code beyond the issue is not a bonus. It is unreviewed,
  unplanned work.

## 7. Report

Lead with the verdict: **ready to merge**, or **not, and why**.

Then findings, most serious first. For each: file and line, what is wrong, and
the concrete case where it goes wrong. A finding you cannot make fail with a
specific input is a suspicion — say so, or drop it.

Proving a finding usually means a throwaway test. It must live under `src/`
(vitest's include pattern ignores everything else) and be deleted in the same
command that runs it:

```
npx vitest run src/verify-scratch.test.ts; rm src/verify-scratch.test.ts
```

Separate **must fix before merge** from **worth doing later**. Not everything is
a blocker, and treating it that way makes the review easy to ignore.

If it is genuinely good, say so plainly and merge-ready. Manufacturing findings
to look thorough wastes the stage.

Then **post the report on the PR** so it survives `/clear`:

```
gh pr review <n> --comment --body-file <report.md>
```

A review that lives only in this chat leaves the merged PR with no record of
what was checked, what was deferred, or why. Deferred "worth doing later"
findings especially: name the future issue each one belongs to, or file one.

## 8. Only then fix

Do not fix anything until you have reported. When the user asks you to, fix and
re-run all four gates.
