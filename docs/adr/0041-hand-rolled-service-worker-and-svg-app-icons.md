# ADR 0041: Hand-rolled precaching service worker and SVG app icons

- **Status:** accepted
- **Date:** 2026-08-04
- **Issue:** #29

## Context

NFR-02 requires a service worker that precaches the app's core assets, and
a web app manifest with icons and Papa/Moana theme colours (vision.md §5).
This fork's own PWA guide
(`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`)
hand-writes `public/sw.js` directly as its baseline, and only mentions
Serwist as an optional later extension — noting it "currently requires
webpack configuration." There is also no existing brand mark or
icon-generation tooling in this repo to produce a raster PNG icon set.

## Decision

Ship a hand-written `public/sw.js` (no new dependency) registered from a
small feature-detected client component, precaching a fixed, versioned list
of five stable-path shell assets (`/`, `/manifest.webmanifest`,
`/favicon.ico`, and the two new icon SVGs) with a network-first strategy
for navigation and cache-first for the other shell assets. App icons are
authored as two hand-written SVGs (`purpose: "any"` and `purpose:
"maskable"`) using the Moana/Papa tokens, rather than a generated PNG set.

## Alternatives considered

### Serwist (workbox-based Next.js plugin)
- **Pros:** generates a precache manifest automatically from the build's
  actual hashed asset list, keeping precache and build output in sync
  without manual maintenance; handles cache versioning/cleanup for you.
- **Cons:** requires webpack-specific build configuration per its own
  docs, adding friction against this repo's existing build tooling
  (issue #93 already tracks a pre-existing Turbopack build-tooling
  friction); pulls in a new dependency and its own config surface for a
  precache list of five static files that doesn't need automatic
  generation.

### next-pwa (community Workbox wrapper)
- **Pros:** widely used, batteries-included Workbox strategies.
- **Cons:** effectively unmaintained; also webpack-plugin based; brings in
  Workbox's full runtime for a five-file precache list.

### Hand-rolled `public/sw.js` (chosen)
- **Pros:** zero new dependencies; the entire precache/fetch strategy is
  ~30 lines that are fully unit-testable by evaluating the script in a
  `vm` context; matches this fork's own documented PWA baseline.
- **Cons:** the precache list is manually maintained — it cannot safely
  include Next's hashed `_next/static` chunk URLs (they change every
  build and a stale hardcoded hash would 404), so this precache
  deliberately covers only stable-path shell assets, not the JS/CSS
  bundles themselves. A future issue that wants those precached will need
  either a build-time manifest-generation step or to adopt Serwist then.

### Generated PNG icon set (favicon-generator tooling, per the same PWA guide)
- **Pros:** universal OS/launcher support, including on older Android
  versions with incomplete SVG-icon support.
- **Cons:** requires an external tool/dependency this repo doesn't have;
  there's no existing brand mark to run through a generator yet.

### Hand-authored SVG icons (chosen)
- **Pros:** no new tooling dependency; scales losslessly; trivially kept
  in sync with the Moana/Papa design tokens as plain hex literals.
- **Cons:** maskable-purpose SVG icon support is slightly less universal
  than PNG on some older Android launchers — acceptable given there is no
  brand asset to generate a PNG set from yet.

## Trade-offs and consequences

The core app shell (HTML shell, manifest, favicon, icons) works offline
after a first visit; the actual JS/CSS bundles are not precached and will
still require network on a cold cache miss, which is an accepted gap for
this issue (NFR-02's "cache core assets", not "cache the entire bundle").
Revisit this decision (moving to Serwist or a custom build-time manifest
step) if a future issue needs guaranteed-offline full-bundle loading, or if
`_next/static` precaching becomes a requirement.
