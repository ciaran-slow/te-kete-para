# ADR 0020: Shared `.focus-ring` / `.touch-target` utility classes instead of new Button/Link/Input components

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #15

## Context

vision.md §3 requires a consistent 3px/2px-offset keyboard focus ring and a
48x48px minimum touch target on every interactive element. Two real
interactive elements exist today — `LanguageToggle`'s Radix
`RadioGroup.Item`s and `AddressSearch`'s hand-built combobox `<input>` — and
both already duplicate ad hoc Tailwind strings for this (`language-toggle.tsx`
correctly gates its ring on `:focus-visible`; `address-search.tsx`'s input
incorrectly gates on plain `:focus`, showing the ring on mouse clicks too).
Nothing else in the app is interactive yet: no shared `<Button>`, `<Link>`,
or `<Input>` component exists (ADR 0011 covers where components *would* live,
not a generic input primitive).

## Decision

Two Tailwind v4 `@layer components` classes, `.focus-ring` and
`.touch-target`, declared once in `src/app/globals.css` and applied via
`className` on each real interactive element. `address-search.tsx`'s input
is also switched from `:focus` to `:focus-visible` gating to match, closing
the inconsistency.

## Alternatives considered

### A: New generic `<Button>` / `<Input>` / `<Link>` components in `src/components/`
- **Pros:** matches the issue's literal "shared button/link/input
  components" wording; a natural home for future issues (#21 sorting
  search, #24 shift-alert banner, #26 push opt-in) that will add more
  interactive UI.
- **Cons:** today's two consumers are a Radix `RadioGroup.Item` (which
  cannot be wrapped by a generic `<Button>` without fighting Radix's own
  `asChild` composition) and a hand-built ARIA combobox `<input>` (ADR 0014
  — deliberately not a Radix primitive). Neither can be swapped for a new
  generic component without an unrelated, riskier refactor of working,
  already-tested markup. Building `<Button>`/`<Link>` components with zero
  real call sites is exactly the premature abstraction this repo avoids
  elsewhere (e.g. ADR 0011's own "cheap follow-up... not a reason to
  pre-build structure now for components that do not exist yet").

### B (chosen): Shared `@layer components` CSS classes
- **Pros:** single source of truth enforced at the styling layer, which is
  where the duplication actually lives today; zero new components, zero new
  dependencies; retrofits both existing consumers with a one-line className
  change each; composes onto whatever markup a future component (Radix-based
  or hand-built) turns out to need, so it does not foreclose option A later.
- **Cons:** does not literally give future issues a `<Button>` to import —
  they will still write their own markup and add `focus-ring`/`touch-target`
  by hand. If enough new interactive components land needing more shared
  behaviour than styling (e.g. shared keyboard handling), a real `<Button>`
  component may become worth it — that is a future, cheap, additive decision
  once a second and third real consumer exists, not a reason to build it now.

### C: Per-component duplication, formalized as a documented convention only
- **Pros:** zero code change; "consistent" enforced by review discipline.
- **Cons:** this is the status quo that already drifted (the `:focus` vs
  `:focus-visible` inconsistency this PR fixes) — a convention with no
  single source of truth is not a fix, it is the bug being described as a
  policy.

## Trade-offs and consequences

Accepts that future interactive components must remember to add
`focus-ring`/`touch-target` by hand (no compiler or lint enforcement of
this), in exchange for zero new dependencies, zero unused components, and a
one-line retrofit of both existing consumers today. Revisit if a third or
fourth real interactive component lands needing more than styling in common
— at that point a real shared component (Alternative A) composes cleanly on
top of these same two CSS classes rather than replacing them.
