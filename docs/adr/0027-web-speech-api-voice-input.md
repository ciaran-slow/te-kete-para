# ADR 0027: Web Speech API voice input, feature-detected with silent fallback

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #21

## Context

FR-05 and the issue's acceptance criteria call for optional voice input
"where supported, with a documented graceful fallback when unsupported."
The browser-native Web Speech API (`SpeechRecognition`, prefixed
`webkitSpeechRecognition` in Safari/older Chromium) covers this without a
new npm dependency, but TypeScript's bundled DOM lib
(`tsconfig.json`: `"lib": ["dom", ...]`) ships no types for it — it
remains an experimental API outside the spec TypeScript tracks — and the
API only exists in `window` in a browser, never during this app's SSR
pass, which matters for hydration (this repo already hit the identical
problem for `localStorage`-backed locale, ADR 0009).

## Decision

1. Add a small ambient `src/lib/speech/speech-recognition-types.d.ts`
   declaring only the shape this component uses (`SpeechRecognition`,
   its two event types, and the `Window.SpeechRecognition` /
   `Window.webkitSpeechRecognition` properties) rather than installing a
   third-party `@types` package — no new dependency, no dependency ADR
   triggered.
2. Detect support with `useSpeechRecognitionSupport()`
   (`src/lib/speech/use-speech-recognition-support.ts`), built on
   `useSyncExternalStore` exactly the way `LanguageProvider` reads
   `localStorage` (ADR 0009): `getServerSnapshot` returns `false`
   unconditionally (SSR has no `window`), and the real client snapshot is
   picked up in React's reserved post-hydration re-render for
   `useSyncExternalStore` mismatches — never via `useEffect` + `setState`,
   which this repo's `react-hooks/set-state-in-effect` lint rule forbids
   and which would race hydration identically to what ADR 0009 already
   ruled out for locale.
3. When unsupported, the mic button is not rendered at all — no disabled
   button, no inline "voice not supported" message. Typed search (the
   acceptance criteria's other, non-optional bullet) is the fallback, and
   it needs no further UI to explain since nothing is broken or degraded
   from the user's point of view; a support browser simply shows one more
   button. This is the "documented graceful fallback" the acceptance
   criteria asks for — documented here and in code comments, not surfaced
   as user-visible copy.
4. `recognition.lang` is set from the app's current locale
   (`en-NZ`/`mi`) rather than left at the browser default, so a Te Reo
   Māori speaker's dictation is at least attempted in the right language
   model; real-world recognition-engine coverage for `mi` is expected to
   be inconsistent across browsers today, and typed input remains the
   universal path regardless of recognition quality.

## Alternatives considered

### A. Feature-detect, hide the button when unsupported (chosen)
- **Pros:** zero new UI states to translate/test for the unsupported case;
  no dependency; hydration-safe by construction via `useSyncExternalStore`.
- **Cons:** a user on an unsupported browser has no on-screen indication
  that voice input exists at all elsewhere — acceptable, since it isn't
  available to them regardless of what the UI says.

### B. Always render the mic button, disable + explain when unsupported
- **Pros:** discoverable — a user learns the feature exists even if their
  browser can't do it.
- **Cons:** an extra disabled affordance and at least one more translated
  string pair for a state that changes nothing about what the user can
  actually do; more component states to keep accessible (a disabled
  button still needs a correct accessible name/description) for no
  functional benefit over simply not showing it.

### C. Third-party speech-to-text library or cloud API
- **Pros:** consistent behaviour/accuracy across browsers, potential
  Te Reo Māori model quality better than a given browser's built-in
  engine.
- **Cons:** a new dependency requiring its own ADR under this repo's
  policy; most such services also require a network call and API
  key/secret, which is a materially bigger scope than "the browser can
  already do this locally" for what the acceptance criteria asks for.

## Trade-offs and consequences

Accepted: voice input quality (especially for `mi`) depends entirely on
the end user's browser/OS speech engine, which this repo has no control
over and cannot unit-test beyond mocking the `SpeechRecognition`
interface's event contract. Revisit if real-world QA (or the manual
screen-reader/QA process, ADR 0024) surfaces a browser whose `mi`
recognition is unusable — at that point the fallback (typed search) is
already the safety net, so no code change would be forced, only a
documentation update.
