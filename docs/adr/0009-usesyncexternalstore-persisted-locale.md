# ADR 0009: useSyncExternalStore for the persisted locale

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #7

## Context

FR-01 requires a fully bilingual UI, and #7 requires the selected language to
persist to `localStorage` and be restored on load. Three repo facts constrain
how.

`react-hooks/set-state-in-effect` is an **error** in this repo (13 of the 16
resolved `react-hooks` rules are errors), so the textbook approach — default to
`en`, then `setLocale(stored)` inside a mount effect — does not pass lint:
"Avoid calling setState() directly within an effect". A standing repo rule also
forbids touching `localStorage` during render, because it breaks prerendering
and hydration, and `/` is currently statically prerendered (`○ /` in
`next build`) which NFR-01's FCP budget depends on.

Meanwhile this fork's own guide, `preventing-flash-before-hydration.md`,
prescribes a specific answer for exactly this problem: an inline `<script>` in
`<head>` that reads `localStorage` and mutates the DOM before first paint,
paired with a lazy `useState` initializer reading the same key so React's
initial state matches the DOM. That pattern eliminates the flash but requires
`dangerouslySetInnerHTML`, `suppressHydrationWarning`, and a `localStorage` read
during render.

## Decision

Hold the locale in `useSyncExternalStore(subscribeToLocale, readStoredLocale,
getServerLocale)`, with the store implemented in
`src/lib/i18n/locale-storage.ts`. `getServerLocale()` returns `en` so the server
render and the client's first render agree and `/` stays static. Writes go
through `writeStoredLocale`, which sets the key and dispatches a
`tkp:locale-change` event; `subscribeToLocale` listens for that plus the native
`storage` event for cross-tab sync. The provider mirrors the locale onto
`<html lang>` in an effect — a DOM write, not a `setState`, so the lint rule
does not apply.

## Alternatives considered

### useSyncExternalStore (chosen)

- **Pros:** the React-sanctioned way to read external mutable state, so no lint
  rule is bent and nothing is read during render; no `dangerouslySetInnerHTML`,
  which keeps the layout clear of the one pattern this repo's review checklist
  singles out; no `suppressHydrationWarning`, so genuine hydration mismatches
  still surface as errors instead of being masked; needs no CSP nonce when a
  policy is added later; `/` stays statically prerendered; trivially testable in
  jsdom, and cross-tab sync falls out of the `storage` listener for free.
- **Cons:** a visible flash of English before Te Reo on every hard load, because
  the server snapshot must be the static default; `<html lang>` is likewise only
  corrected after hydration, so the first painted frame can be announced in the
  wrong voice by a screen reader; `getServerSnapshot` is unreachable from a
  client-side test render and needs a direct assertion to stay covered.

### Inline script in <head> + lazy useState initializer (this fork's documented pattern)

- **Pros:** no flash at all — the script runs during HTML parsing, before first
  paint; `<html lang>` is correct in the first painted frame, which is the
  stronger WCAG 2.2 position given vision.md §3's screen-reader commitments; it
  is what this fork's own documentation prescribes, so it is the least surprising
  choice for a future maintainer reading those docs.
- **Cons:** requires `dangerouslySetInnerHTML` in the root layout, which this
  repo's review process treats as a security-review item — defensible here since
  the interpolated content is a hardcoded key and two hardcoded locale codes with
  no user input, but it establishes the pattern in the most sensitive file in the
  app; requires `suppressHydrationWarning` on `<html>`, which suppresses real
  mismatches too, not just the intended one; reads `localStorage` during render,
  against a standing repo rule; a future Content Security Policy needs a nonce
  threaded into the layout; and the correctness of the whole thing depends on the
  script and the lazy initializer reading the same key, a coupling nothing
  enforces.

### useEffect + setState after mount

- **Pros:** the most widely recognised pattern, so the least explanation needed.
- **Cons:** **does not pass lint** — `react-hooks/set-state-in-effect` is an
  error here, verified. It also has the same flash as the chosen option plus an
  extra render pass, so it is strictly worse even where it is legal.

### Cookie read server-side with cookies()

- **Pros:** no flash, nothing read from client storage during render, and the
  correct language and `lang` attribute in the server HTML.
- **Cons:** #7's acceptance criteria specify `localStorage`, so this fails the
  issue as written; reading cookies opts `/` out of static prerendering, turning
  it dynamic and working against NFR-01's FCP budget; and it adds cookie
  plumbing this issue otherwise has no need for.

## Trade-offs and consequences

The language preference survives reloads and syncs across tabs, with no
`dangerouslySetInnerHTML`, no suppressed hydration warnings, no CSP coupling,
and no `localStorage` in the render path — and `/` stays static.

The cost is paid by the exact user FR-01 exists to serve. PRD persona 3 prefers
the app entirely in Te Reo, and will see English paint first on every hard load
before it swaps. A screen reader may also announce that first frame with an
English voice, since `<html lang>` is corrected in an effect. Both are visible,
neither is a correctness bug, and both are the direct consequence of keeping the
route static.

Revisit when the flash is measured against NFR-01 in a real browser (#31's
Lighthouse budget will quantify it), or when a Content Security Policy lands and
the nonce cost of the inline-script alternative can be judged concretely. If it
is reversed, the replacement is the inline-script pattern above, and this record
should be marked superseded rather than edited. `subscribeToLocale` and
`readStoredLocale` are the only two functions that would change.
