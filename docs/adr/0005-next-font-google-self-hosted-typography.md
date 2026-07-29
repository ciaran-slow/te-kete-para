# ADR 0005: Inter and Plus Jakarta Sans via next/font/google with latin-ext

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #4

## Context

FR-01 and docs/vision.md §2 require Inter (body) and Plus Jakarta Sans
(headings/UI) with crisp macron rendering (`ā ē ī ō ū`) and no fallback
glyphs. Macrons are Latin Extended-A code points, which sit in Google
Fonts' `latin-ext` subset, not `latin`. NFR-01 (FCP < 1.5s) and privacy
argue against runtime requests to third-party font CDNs. This fork's
`next/font` module self-hosts Google fonts at build time; both families
exist in its font data as variable fonts with `latin-ext` available.

## Decision

Load both fonts in `src/app/layout.tsx` from `next/font/google` as
variable fonts with `subsets: ["latin", "latin-ext"]`, `display: "swap"`,
and CSS variables `--font-inter` / `--font-plus-jakarta-sans` attached to
`<html>`. Map them in `src/app/globals.css` via `@theme inline` to
Tailwind's `--font-sans` (body) and a new `--font-heading` (headings/UI).

## Alternatives considered

### next/font/google, variable fonts, latin + latin-ext (chosen)
- **Pros:** build-time download, self-hosted with the static assets — no
  browser requests to Google (privacy, NFR-01); automatic fallback metrics
  prevent layout shift; `latin-ext` preloads the faces that carry macrons
  so Te Reo text renders from the primary font immediately.
- **Cons:** `next build` needs network access to fonts.gstatic.com the
  first time (already true today — the boilerplate loads Geist the same
  way); font versions float with Google's releases.

### next/font/local with committed .woff2 files
- **Pros:** fully offline builds; exact pinned font binaries.
- **Cons:** ~hundreds of KB of binaries in git; manual subsetting and
  upgrades; easy to commit files missing Latin Extended-A and lose macron
  coverage silently.

### <link> to the Google Fonts CDN
- **Pros:** trivial setup.
- **Cons:** runtime third-party request (privacy, FCP hit, offline-PWA
  breakage for NFR-02); flash of unstyled/fallback text; contradicts this
  fork's docs, which exist precisely to remove external font requests.

## Trade-offs and consequences

Typography becomes deterministic and self-hosted at the cost of
build-time network dependency and unpinned upstream font versions; if a
Google-side font update ever regresses rendering, the escape hatch is
switching to `next/font/local` with pinned files under a superseding ADR.
`--font-heading` becomes the sanctioned way to opt UI text into Plus
Jakarta Sans; components must not hard-code font-family. The e2e suite
asserts macron unicode-range coverage of both families, so a subset or
family regression fails CI rather than degrading Te Reo text silently.
