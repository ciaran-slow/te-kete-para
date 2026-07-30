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
gh issue view <n> --repo ciaran-slow/te-kete-para --json title,body -q '.title + "\n\n" + .body'
gh issue view <n> --repo ciaran-slow/te-kete-para --comments
git diff main...HEAD --stat
git diff main...HEAD -- . ':(exclude)package-lock.json'
git log main..HEAD --oneline
```

The `--json title,body` call is the one that returns the acceptance criteria —
`--comments` shows the comment thread but not reliably the issue body. The
diff excludes `package-lock.json` because lockfile churn drowns the real
changes; use the `--stat` line to confirm the lockfile changed only when
`package.json` dependencies did.

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
npm run test:coverage
npm run build
```

Never take "tests pass" on trust. Run them. A green claim in a PR body is a
claim, not evidence. Run `npm run test:coverage`, not `npm test` — that is the
gate `.github/workflows/ci.yml` actually enforces (docs/architecture.md §4,
90% lines/statements). `npm test` passes without evaluating that threshold,
so a pass that only runs `npm test` can report four green gates while
skipping the one that can actually fail on coverage.

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
- Does anything depend on test execution order? Supertest integration tests
  share an in-memory SQLite DB per test file (docs/architecture.md §2B) —
  confirm it's reset between tests. jsdom also keeps `localStorage` between
  tests in a file.

## 6. Look specifically for

Ordered by what actually bites in this codebase:

- **Data loss.** Any migration or query that overwrites or discards rows a
  user cannot recreate (addresses, subscriptions, sorting rules) without a
  reversible path.
- **Unversioned migrations or cache blobs.** A Knex migration with no working
  `down`, or a persisted client-side cache shape with no `version` field, is a
  future migration that cannot happen.
- **Unparameterized SQL.** Knex's query builder should make this hard to get
  wrong — flag any raw SQL string built from user input.
- **`localStorage` during render.** Any access outside an effect breaks
  prerendering and hydration.
- **Cross-user leakage.** One user's address, language preference, or push
  subscription read or overwritten via another user's request.
- **Plan divergence.** Did it build what was planned? If it deviated, is the
  deviation justified and stated?
- **Unmerged cross-PR dependency.** If this branch calls, imports, or
  otherwise depends on code the plan attributes to a different issue's PR
  (e.g. a fetch against an API route another issue owns), check whether that
  dependency is actually on `main` yet — `git ls-tree main -- <path>` or
  `git log main --oneline -- <path>`, not the plan's say-so, since a plan can
  be written before its assumed prerequisite lands. If it is not on `main`,
  merging this PR alone ships a feature that is dead or broken for every user
  until the other PR lands, no matter how gracefully it degrades. **This is
  not a soft condition to note and clear anyway — it makes the verdict "not
  ready to merge."** There is no third "ready, pending someone else's PR"
  verdict: the report is read as a binary merge/no-merge signal, so anything
  short of "ready" must actually say "not ready." Name the exact PR/issue
  that must land first and say so plainly in the verdict line, not buried in
  a "worth doing later" or "merge condition" section that reads as approval.
- **Missing or hollow ADRs.** Every ADR drafted in the plan's "ADRs" section
  must exist in the diff at its stated `docs/adr/NNNN-slug.md` path — a
  promised ADR that never landed is an unmet deliverable, same as a missing
  test. Conversely, any architecture decision visible in the diff (a new
  dependency, a persisted data shape, a new convention) with no ADR is a
  finding. Check the records against `docs/adr/0000-template.md`: one with no
  alternatives or trade-offs filled in is a changelog entry, not a decision
  record. If an ADR changed the architecture, `docs/architecture.md` must
  match it and cite the ADR number.
- **Accessibility.** Hand-rolled interactive elements where a Radix primitive
  exists; missing labels; keyboard traps; missing `aria-live` on dynamic
  schedule/status changes; contrast or touch-target regressions
  (docs/vision.md §3).
- **i18n key parity.** A new UI string added to `en` without a matching `mi`
  entry, or vice versa.
- **Security.** `dangerouslySetInnerHTML`, unescaped user text, anything
  executing stored strings.
- **Scope creep.** Code beyond the issue is not a bonus. It is unreviewed,
  unplanned work.

## 7. Report

Lead with the verdict: **ready to merge**, or **not, and why**. There is no
third option. A dependency on another unmerged PR (see "Unmerged cross-PR
dependency" above) is a **not ready** verdict, even when nothing in this
diff itself needs to change — the fix is sequencing, not code, but the
verdict still gates the merge and must say so.

Then findings, most serious first. For each: file and line, what is wrong, and
the concrete case where it goes wrong. A finding you cannot make fail with a
specific input is a suspicion — say so, or drop it.

Proving a finding usually means a throwaway test. Vitest here collects
`*.test.ts(x)` anywhere outside `node_modules` except `e2e/**`, so put it in
`__tests__/` — never under `src/`, where `next build`'s TypeScript pass would
also sweep it up — and delete it in the same command that runs it:

```
npx vitest run __tests__/verify-scratch.test.tsx; rm __tests__/verify-scratch.test.tsx
```

Use `.tsx` for any probe that renders a component. Two gotchas that waste a run:
Vitest v4 here **suppresses `console.log` from passing tests**, so a probe that
only logs looks like it ran and told you nothing — collect findings and `throw`
them at the end of the file (or pass `--silent=false`). And a probe that asserts
nothing proves nothing: make it assert the behaviour you claim, so a green run is
evidence rather than absence of evidence.

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

If this skill itself gave you a wrong command or a claim that didn't match the
repo during the review, fixing the skill file is part of the report — future
verify passes inherit whatever you leave uncorrected.

## 8. Only then fix

Do not fix anything until you have reported. When the user asks you to, fix and
re-run all four gates.
