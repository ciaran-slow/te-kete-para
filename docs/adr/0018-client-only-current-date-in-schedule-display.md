# ADR 0018: Client-only current date, computed only after address selection, with locale-neutral date formatting

- **Status:** accepted
- **Date:** 2026-07-31
- **Issue:** #14

## Context

`ScheduleDisplay` (issue #14) needs "today" to evaluate
`computeCollectionRuleSet(zone, date)` (`src/lib/schedule/rules.ts`) and to
show that date to the user. Three hazards apply at once:

1. **Hydration correctness.** This fork's Next.js docs
   (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`)
   show that computing a date directly in a Client Component's render body
   produces different output on the server (the Node process's own
   clock/offset) vs. the client (the browser's clock), causing a hydration
   mismatch and a visible flash. The documented fix is an inline `<script>`
   that patches the DOM before paint, or accepting the flash via
   `useEffect`.
2. **Time zone correctness.** `computeCollectionRuleSet` reads only the UTC
   calendar date of the `Date` passed to it (rules.ts, ADR 0017), and this
   app's users are assumed to be viewing from Wellington (NZST/NZDT,
   UTC+12/+13). A server process has no reliable claim to the visitor's
   real-world calendar day — Vercel's Node runtime is not guaranteed to run
   at Pacific/Auckland — so a `today` computed server-side, via either
   local or UTC getters, can name the wrong calendar day for a chunk of
   every 24 hours.
3. **Locale-name formatting.** Displaying `today` via
   `Intl.DateTimeFormat("mi-NZ", ...)` or `.toLocaleDateString()` depends on
   the runtime's ICU data for weekday/month names in `mi`, which is not
   guaranteed identical across Node versions/build flags and is never
   verified by this app's own translation dictionary (ADR 0010) — a `mi`
   render could silently fall back to English or a wrong term, undetected
   by the key-parity test, because Intl formatting never goes through
   `dictionaries.ts` at all.

## Decision

`ScheduleDisplay` (`src/components/schedule-display.tsx`) never computes
"today" on a render that could execute on the server. It relies on
composition, not an inline script or an effect:

- Its parent, `AddressSchedule` (`src/app/address-schedule.tsx`), holds
  `selected: SuburbSearchResult | null` via `useState(null)`. That initial
  value is identical in the server-rendered HTML and the client's first
  render — no mismatch is possible on mount.
- `selected` can only become non-null through `AddressSearch`'s `onSelect`
  callback, which only ever fires from a DOM event handler
  (`onClick`/`onKeyDown` in `address-search.tsx`) — i.e., only after
  hydration has completed, and only in the browser.
- `ScheduleDisplay` therefore only evaluates `now ?? new Date()` (its own
  `now` prop exists for tests only) at a point in its render provably
  reachable only client-side: the `address !== null` branch. There is no
  code path where this expression runs during SSR.
- The viewer's local calendar date is captured via **local** getters
  (`getFullYear`/`getMonth`/`getDate`), not the UTC ones — the opposite of
  rules.ts's own internal contract — and re-expressed as
  `Date.UTC(year, month, date)` before being passed to
  `computeCollectionRuleSet`, via the exported helper
  `todayAsUtcCalendarDate`. This is the one deliberate place in the app
  that converts "the viewer's wall-clock calendar day" into the
  UTC-normalised value the rule engine requires.
- The date is displayed as a locale-neutral, zero-padded `DD/MM/YYYY`
  string (`formatUtcCalendarDate`), not via `Intl.DateTimeFormat` or
  `.toLocaleDateString()`. No weekday or month name is shown, so no new
  ICU-dependent translation surface is introduced.

## Alternatives considered

### A. Compute `now` directly in the render body, unconditionally (chosen, gated by composition)
- **Pros:** simplest code; no state indirection; verified (via
  `npx eslint --print-config` + a probe file) to raise no ESLint error,
  including `react-hooks/purity`.
- **Cons:** this is only safe because of the address-null-gating property
  described above. A future engineer adding a second render path that can
  show `ScheduleDisplay` content during SSR (e.g. seeding `selected` from a
  URL query param on the server) would silently reintroduce the
  server/client date bug, with nothing structural to catch it — only
  end-to-end/manual QA. Chosen anyway, but documented here precisely so
  the risk is visible to whichever future issue changes this, rather than
  silent.

### B. Next.js's inline-script pattern (`preventing-flash-before-hydration.md`)
- **Pros:** works even if the component is later rendered with a non-null
  address during SSR; it's the framework's own general-purpose fix for
  this exact class of bug.
- **Cons:** requires `dangerouslySetInnerHTML` (a new CSP surface),
  `suppressHydrationWarning`, and a second, string-templated implementation
  of `todayAsUtcCalendarDate` inside the injected script — doubling the
  logic that must stay in sync, for a hazard that (per the Decision) cannot
  currently occur. Rejected as unnecessary complexity until a future issue
  actually needs server-rendered schedule content.

### C. `useEffect` + `setState` mount flag ("render nothing until mounted, then compute `now`")
- **Pros:** a common-looking pattern in other codebases.
- **Cons:** forbidden outright — `react-hooks/set-state-in-effect` is an
  ESLint error in this repo (verified via `npx eslint --print-config`).
  Per the Next.js guide above it also always shows the wrong value first,
  then corrects it: it trades a hydration-mismatch risk for a guaranteed
  flash. Rejected.

### D. `Intl.DateTimeFormat`/`.toLocaleDateString()` for the displayed date
- **Pros:** "for free" localized weekday/month names, if the runtime's ICU
  data has them.
- **Cons:** unverified by this app's own `en`/`mi` parity test (ADR 0010),
  since it bypasses `dictionaries.ts` entirely; behaviour varies by Node
  build and by whether `mi` locale data is present at all — exactly the
  kind of environment-dependent behaviour ADR 0017 was written to keep out
  of this test suite. Rejected in favour of the numeric `DD/MM/YYYY`
  format.

## Trade-offs and consequences

Gains: no hydration mismatch, no ICU dependency for the date, and the "get
'now' safely" contract is easy to state (`ScheduleDisplay` may only be
reached with a non-null `address` after a client event). Costs: that
contract is enforced by convention and this ADR, not by a compiler check —
a future PR that renders `ScheduleDisplay` with server-supplied initial data
must revisit this decision (most likely by adopting Alternative B) rather
than assuming the current code is still safe as-is. The numeric date format
is also a real product simplification: no weekday or month name is shown at
all, pending a vetted `mi` calendar-terms addition to `dictionaries.ts` — a
plausible follow-up issue, not a silent gap.
