# ADR 0004: Wellington design tokens as Tailwind v4 CSS-first @theme variables

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #4

## Context

docs/vision.md §3 defines the Wellington colour system (Kākāriki #1B4D3E,
Moana #003B46, Kōwhai #B45309, Papa #F8FAFC surface / #0F172A text) and every
UI issue after this one consumes it. The repo runs Tailwind CSS v4 via
`@tailwindcss/postcss` with no `tailwind.config` file; this fork's Next.js
docs document only the v4 CSS-first setup as current (the JS-config path is
relegated to a "Tailwind CSS v3" legacy guide). The tokens need stable,
named utility classes so later issues never hard-code hex values.

## Decision

Declare the palette in an `@theme` block in `src/app/globals.css`:
`--color-kakariki` #1b4d3e, `--color-moana` #003b46, `--color-kowhai`
#b45309, `--color-papa` #f8fafc, `--color-papa-ink` #0f172a. Tailwind v4
generates the utility families (`bg-kakariki`, `text-papa-ink`, …) from
these. Papa's paired text colour is named `papa-ink` because vision.md
defines Papa as a surface/text pair rather than two hues. The
create-next-app dark-mode boilerplate (`--background`/`--foreground` and the
`prefers-color-scheme` block) is removed: vision.md specifies a single
light Papa palette, and keeping an unmaintained dark variant would ship
untested, non-compliant contrast.

## Alternatives considered

### @theme block in globals.css (chosen)
- **Pros:** the documented Tailwind v4 mechanism in this fork's docs; zero
  new files or dependencies; tokens are simultaneously CSS variables and
  utility classes; single source of truth next to the styles that use it.
- **Cons:** values are not importable into TypeScript — code that needs a
  hex (e.g. a future PWA `theme_color` in #29) must read the CSS variable
  at runtime or duplicate the literal.

### tailwind.config.ts with theme.extend.colors
- **Pros:** familiar v3 idiom; values importable into TS.
- **Cons:** legacy path in v4 (this fork's docs file it under "Tailwind CSS
  v3"); adds a config file the current setup deliberately lacks; splits
  styling truth across two files.

### Plain CSS custom properties without @theme
- **Pros:** simplest possible declaration.
- **Cons:** no generated utilities, so every consumer writes
  `bg-[var(--color-moana)]` arbitrary values — verbose, unenforceable, and
  invisible to Tailwind tooling.

## Trade-offs and consequences

Styling stays in one file and later issues get semantic utilities instead
of hex literals. The accepted cost is that TypeScript cannot import token
values; if a future issue needs them in JS, it reads the CSS variable or
adds a tiny generated constants module — revisit this ADR if that
duplication spreads past a single site. Dark mode is consciously dropped
rather than half-shipped; reintroducing it requires a new ADR with a
vision-level palette. Token names are now API: renaming one is a
find-and-replace across the app plus this record's supersession.
