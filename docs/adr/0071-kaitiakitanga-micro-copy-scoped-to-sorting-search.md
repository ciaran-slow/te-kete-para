# ADR 0071: Kaitiakitanga micro-copy scoped to SortingSearch's "done" state, as a dismissible StatusRegion banner

- **Status:** accepted
- **Date:** 2026-08-07
- **Issue:** #176

## Context

vision.md §2 names "Karakia / Kaitiakitanga Micro-Copy": positive
reinforcement banners highlighting environmental guardianship
(*kaitiakitanga*) "when users successfully complete a recycling cycle or
sort items correctly." `docs/prd1.md` FR-06 confirms zero references to
"kaitiakitanga"/"karakia" exist anywhere in the codebase outside vision.md
— this was never scoped into an issue when prd0.md was first written, not a
built-then-cut feature. FR-06 explicitly leaves three things to planning:
the trigger condition, the exact copy, and whether the mechanism is a
`<StatusRegion>` announcement, a visual banner, or both.

Two real "success" candidates exist in the app today: `<SortingSearch>`
(`src/components/sorting-search.tsx`) transitioning to its existing
`status === "done"` state (ADR 0026 — a correct-match result set, not a
selection), and `<ScheduleDisplay>` (`src/components/schedule-display.tsx`)
computing a non-null `ruleSet` for a selected address. FR-06's own wording
says "and/or," so building only one is a legitimate scope call for this
issue, not an unmet requirement, provided the reasoning for the cut is
recorded — which this ADR does.

## Decision

**Trigger: `<SortingSearch>`'s `status === "done"` transition only.**
`<ScheduleDisplay>`'s successful lookup is not wired to this micro-copy in
this issue.

**Mechanism: a visible banner, rendered through the existing
`<StatusRegion as="div" atomic>` component (ADR 0021).** Using
`StatusRegion` means the visible banner is *also* the aria-live
announcement — no separate sr-only-only region needed, and no new ARIA
plumbing invented. Styled with the `kakariki` design token (`--color-
kakariki`, `docs/vision.md` §3's designated "success states" colour,
already used for `<PushSubscriptionToggle>`'s checked state) rather than
`kowhai` (reserved for yellow-bag/warning-adjacent contexts, per
`schedule-display.tsx`'s bin-pill comments) or `moana` (structural/
navigation).

**Dismissal: an explicit dismiss button** (`lucide-react`'s `X` icon, ADR
0070, already a dependency), not an auto-hide timer. Clicking it returns
focus to the search input rather than letting focus fall through to
`<body>`.

A new `dismissedKaitiakitanga` boolean resets to `false` at the top of
`runSearch` (the single function both the typed and voice-dictated paths
call before a fetch fires), so a fresh successful match always shows the
banner again even if a previous one was dismissed. The banner condition is
`status === "done" && !dismissedKaitiakitanga`.

## Alternatives considered

### Trigger: `<SortingSearch>` only (chosen)
- **Pros:** `status === "done"` is a genuinely bounded, discrete event —
  it fires only on a new correct match, never on every render. It also
  matches FR-06's own primary wording, "correctly identifies a sorting
  item," verbatim, with zero new state needed beyond what `SortingSearch`
  already tracks.
- **Cons:** the "complete a recycling cycle" half of vision.md §2's wording
  is not literally built — see the next alternative for why that's not
  simply the same feature under a different name.

### Trigger: `<ScheduleDisplay>`'s successful lookup, or both
- **Pros:** would build FR-06's other named scenario, "successful
  recycling action," verbatim; `<ScheduleDisplay>` already computes a
  clean success/failure boolean (`ruleSet !== null`) to key off.
- **Cons:** rejected. A resident sees their schedule on effectively every
  visit with a previously-selected or newly-searched address (ADR 0052
  caches the selection) — it is the app's default, steady-state view, not
  a discrete accomplishment the way a correct sorting match is. Firing
  positive-reinforcement copy on *every* routine schedule view (including
  page reloads restoring the cached address) would read as noise, not
  reinforcement, and risks colliding with `<ShiftAlertBanner>`, which
  already occupies the same visual slot above/beside the schedule for a
  different kind of message. Building both in one PR also doubles the
  test surface (two independent dismiss/trigger state machines) for a
  requirement whose own wording ("and/or") does not demand it. If a future
  issue wants the schedule-lookup half, it should be scoped and planned on
  its own terms rather than bolted onto this one.

### Mechanism: `<StatusRegion>` announcement only, no visible banner
- **Pros:** simplest possible change — no new visible markup, no dismiss
  interaction to build or test; ARIA-only announcements already work well
  for `SortingSearch`'s existing "Results are available below." message.
- **Cons:** rejected. vision.md §2 explicitly says "banners" (visual), not
  "announcements." An sr-only-only implementation would satisfy the letter
  of "positive-reinforcement... surfaces" for screen-reader users only,
  leaving sighted users with nothing — the opposite of what a banner is
  for.

### Mechanism: visible banner only, no aria-live announcement
- **Pros:** avoids any risk of a screen reader hearing "Results are
  available below." and then this message back-to-back as a small
  announcement-order fuss.
- **Cons:** rejected outright — every other dynamic status surface in this
  app (`ScheduleDisplay`, `AddressSearch`, `ShiftAlertBanner`,
  `SortingSearch` itself) goes through `<StatusRegion>` (ADR 0021);
  building a visible-only, non-live-region banner would be the first
  exception to that convention for no accessibility gain, and would fail
  FR-03/vision.md §3's "descriptive ARIA labels for... status changes"
  intent for this specific new copy. In practice the two announcements
  land in the same `aria-live="polite"` batch a beat apart, which is
  standard and not a real ordering hazard.

### Dismissal: auto-hide after a fixed delay
- **Pros:** zero new interactive element, no dismiss button to style,
  label, or test; a common toast-notification pattern elsewhere.
- **Cons:** rejected. vision.md §3 states "zero time-out constraints on
  interactive forms" as a hard accessibility floor for this app; while a
  results list isn't itself a form, the same reasoning applies to reading
  time for dynamically-appearing content — a fixed-duration auto-hide
  imposes a reading deadline a low-vision or cognitively-disabled user did
  not ask for and cannot extend. It would also need a `useEffect` timer
  keyed off `status`, adding cleanup-on-unmount and cleanup-on-next-search
  edge cases (already a pattern this component manages carefully for its
  debounce timer) for a UX property (bounded persistence) a dismiss button
  gets for free without a clock.

### Dismissal: dismiss button (chosen)
- **Pros:** no time-out at all — the user controls when it goes away;
  reuses an icon already in the dependency graph; simple boolean state,
  no timer/cleanup surface.
- **Cons:** clicking dismiss removes the button itself from the DOM,
  which would otherwise drop focus to `<body>` with no signal to
  assistive-tech users about where they landed — mitigated by explicitly
  focusing the search input on dismiss (see Decision).

## Trade-offs and consequences

The kaitiakitanga concept is introduced in exactly one place. A future
issue wanting the `<ScheduleDisplay>` half of vision.md §2 starts from a
clean slate — this ADR's "Alternatives considered" section is the record of
why it wasn't bundled here, not a silent gap. The new Te Reo Māori copy
(`sortingSearch.kaitiakitanga.message`, `.dismiss`) is written to the same
standard as the rest of `sorting_rules`' Te Reo text: a good-faith
non-fluent draft, not a fluent-speaker-reviewed translation — it inherits
ADR 0064's accepted, recorded trade-off rather than quietly claiming a
higher bar than the rest of the sorting-search surface already carries.
Revisit this ADR's trigger scope if FR-06's "recycling cycle" half is ever
separately planned, or if `<ShiftAlertBanner>` and a future
schedule-lookup banner would visually collide in the same composed layout.
