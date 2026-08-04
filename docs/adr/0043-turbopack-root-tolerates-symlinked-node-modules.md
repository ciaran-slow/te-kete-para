# ADR 0043: Turbopack root computed dynamically to tolerate symlinked node_modules

- **Status:** accepted
- **Date:** 2026-08-04
- **Issue:** #93

## Context

Every non-main worktree in this repo shares a single `node_modules` via a
symlink back to the main worktree (`.workmux.yaml`: `files.symlink:
[node_modules]`), so that `workmux add` can spin up a new worktree without
paying a full `npm install`. Turbopack (this fork's Next.js 16.2.12 default
build engine) auto-detects a project root from the nearest lockfile and
refuses to resolve modules through a symlink whose real target lies outside
that root:

```
Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid, it points out of the filesystem root
```

This made `npm run build` — one of the four required CI gates
(docs/architecture.md §4) — impossible to run to a trustworthy result from
inside any worktree except the main one; verify passes had been falling
back to building from the main worktree instead, which only incidentally
worked when the branch under test happened to be compatible with whatever
was checked out there.

## Decision

`next.config.ts` sets `turbopack.root` explicitly, computed by
`resolveTurbopackRoot()` (`src/lib/turbopack-root.ts`): when `node_modules`
is a real directory (or absent), the root is unchanged from Turbopack's own
auto-detection (the project directory itself, since every worktree has its
own real `package-lock.json`); when `node_modules` is a symlink whose real
target lies outside the project directory, the root becomes the common
filesystem ancestor of the project directory and the symlink's real target,
computed at config-load time via `fs.realpathSync` rather than assumed from
worktree directory-naming conventions.

## Alternatives considered

### Dynamic `turbopack.root` (chosen)

- **Pros:** zero added disk usage and zero added time cost per worktree —
  preserves the entire point of symlinking `node_modules` in the first
  place (fast parallel worktree creation for multiple agents, per the
  `workmux` skill). One small, self-contained, unit-tested config change;
  no change to `workmux`'s existing worktree-provisioning behavior. Handles
  arbitrary worktree nesting/depth since it's computed from real paths, not
  a hardcoded relative offset.
- **Cons:** fork/Turbopack-specific knowledge (`turbopack.root`'s exact
  semantics could change in a future Next.js major); widens Turbopack's
  filesystem-watch/cache-validation boundary from the project directory to
  its common ancestor with the real `node_modules` location (in this repo's
  layout, the parent of `te-kete-para` and `te-kete-para__worktrees`) —
  negligible for `next build` (one-shot, non-watching), a minor and
  bounded cost for `next dev`.

### Give every worktree a real `node_modules` via `npm ci`

- **Pros:** no Next.js/Turbopack-specific config at all; every worktree's
  dependency tree is genuinely isolated (no shared-mutation risk between
  concurrent worktrees); works identically regardless of future Turbopack
  symlink-handling changes.
- **Cons:** duplicates the full `node_modules` tree (Next.js + Playwright +
  Lighthouse CI + native `sqlite3` builds, hundreds of MB) per worktree,
  multiplied by however many worktrees are open concurrently — directly
  works against why the symlink exists (`.workmux.yaml` comment: "saves
  disk space, shares caches"). Adds real wall-clock time (`npm ci`, likely
  30s-2min+) to every `workmux add`, which is on the critical path for
  spinning up parallel agent worktrees — the exact workflow this repo's
  `workmux` tooling is built around. Would require changing
  `.workmux.yaml`'s `files.symlink` to `files.copy`-equivalent behavior
  (workmux has no built-in "install fresh" file op; would need a
  `post_create` hook doing `npm ci`), a bigger and more disruptive change
  than a config-level fix for the same acceptance criteria.

## Trade-offs and consequences

Accepting a small, fork-specific Turbopack config surface in exchange for
keeping the symlink-based fast-worktree-creation workflow fully intact. If
a future Next.js major changes `turbopack.root`'s symlink-tolerance
semantics, `resolveTurbopackRoot`'s unit tests (`__tests__/turbopack-root.test.ts`)
will keep passing (they test the pure path-resolution logic, not Turbopack
itself) but the actual `npm run build` gate could regress again in
worktrees — this ADR's fix does not include an end-to-end regression test
that runs `next build` inside a real symlinked worktree (deliberately out
of scope: spinning up a real worktree fixture inside the Vitest suite is
disproportionate to this fix; the existing CI `build` gate already runs
`next build` against a real, non-symlinked `node_modules` and would not
catch a symlink-specific regression). If this recurs, the fix should be
re-verified manually inside a worktree the same way it was verified while
writing this ADR, and that manual step should be added to the `build`
skill's verification checklist at that time.
