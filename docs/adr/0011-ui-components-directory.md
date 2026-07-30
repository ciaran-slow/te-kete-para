# ADR 0011: Shared UI components live in src/components/

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #8

## Context

#8 adds the app's first UI component that is neither a Next.js special file
(`page.tsx`, `layout.tsx`) nor i18n plumbing (`src/lib/i18n/`): a header
language toggle. ADR 0006 already named four more consumers of Radix
primitives on the way — address autocomplete (#12), sorting search (#21),
the shift-alert banner (#24), and push opt-in UI (#26) — so this issue is
the first of several, not a one-off, and where they live is worth deciding
once rather than re-deriving per issue.

## Decision

`src/components/`, flat, one file per component, named exports (e.g.
`src/components/language-toggle.tsx` exports `LanguageToggle`). Each
component declares its own `"use client"` boundary where it needs one;
Server Component pages and layouts import and render them directly.

## Alternatives considered

### Flat src/components/ (chosen)
- **Pros:** simple and immediately discoverable; mirrors the existing flat
  `src/lib/i18n/` convention already in this repo; matches common Next.js
  App Router community practice, so it is the least surprising choice for a
  future contributor; adding a component is just adding a file, no new
  decision.
- **Cons:** no subfolder-per-feature grouping; once #12/#21/#24/#26 land
  alongside #8 the directory could reasonably want structure — that is a
  cheap follow-up ADR if navigation actually becomes a problem, not a
  reason to pre-build structure now for components that do not exist yet.

### Route-colocated private folders (src/app/_components/)
- **Pros:** Next.js supports `_folder` names as routing-excluded private
  folders, keeping UI physically near the route that uses it.
- **Cons:** the language toggle is rendered from the root layout and is
  app-wide, not route-specific, and neither is most of what ADR 0006
  foreshadowed (address search, sorting search); forcing app-wide,
  cross-cutting components under a single route's private folder would
  misrepresent their scope.

### A separate internal package (e.g. packages/ui in a monorepo)
- **Pros:** enforces a stricter reuse boundary and versioned internal API.
- **Cons:** this is a single Next.js application, not a monorepo; the
  tooling and indirection cost has no current payoff at this scale.

## Trade-offs and consequences

Every future UI-primitive issue (#12, #21, #24, #26 at minimum) adds one
file to `src/components/` with no new placement decision. Accepted
knowingly: the directory will grow flat and, at some point, subfolders will
likely make sense — that reorganisation is deferred to whenever it is
actually needed, with its own superseding or additive ADR, rather than
guessed at now.
