# ADR 0014: Manual ARIA combobox pattern for address search (no Radix primitive)

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #12

## Context

ADR 0006 named address autocomplete (#12) as an upcoming consumer of the
unified `radix-ui` package, alongside sorting search (#21), the shift-alert
banner (#24), and push opt-in UI (#26). `radix-ui` 1.6.7 (verified against
`node_modules/radix-ui/dist/*.d.ts`) ships no Combobox, Autocomplete, or
Listbox primitive — the closest primitives are `Popover` (a floating panel
with its own focus-management defaults) and `Select` (a native-select
replacement with a fundamentally different interaction model: it does not
support free-text filtering of its options). #12's acceptance criteria call
for the WAI-ARIA 1.2 combobox/listbox pattern specifically (arrow keys +
Enter to select over a filtered list), which neither primitive is designed
for. #21 (sorting search) will need the same shape, so how this gets built
is worth deciding once.

## Decision

Build the combobox by hand with plain elements, wired directly to the
WAI-ARIA 1.2 Combobox (list autocomplete) pattern: a text `<input
role="combobox">` with `aria-expanded`, `aria-controls`, `aria-autocomplete
="list"`, and `aria-activedescendant`, paired with a `<ul role="listbox">`
of `<li role="option" aria-selected>` rows. Focus never leaves the input;
"moving" between options only updates `aria-activedescendant` and a visual
highlight. No Radix primitive is used for the popup panel or the option
list. The debounce/fetch/keyboard state lives entirely inside
`src/components/address-search.tsx` as local component state — no shared
hook is extracted yet, since there is exactly one consumer today.

## Alternatives considered

### Manual ARIA combobox, no Radix primitive (chosen)
- **Pros:** matches the WAI-ARIA combobox contract exactly, with nothing to
  override; no dependency on a primitive whose defaults fight that contract;
  the full interaction (open/close, active-descendant movement, selection,
  debounce, request cancellation) is ~180 lines in one file, auditable in
  one read; verified lint-clean against this repo's
  `react-hooks/set-state-in-effect` and axe-clean against this repo's jsdom
  helper.
- **Cons:** the builder owns keyboard handling, focus management, and ARIA
  wiring by hand instead of delegating it to a maintained primitive; more
  test surface than "mount a primitive and assert it renders."

### Radix `Popover` + manual listbox inside `Popover.Content`
- **Pros:** positioning, portal rendering, and outside-click dismissal come
  for free.
- **Cons:** `Popover.Content` auto-focuses itself on open by default, which
  must be suppressed (`onOpenAutoFocus={(e) => e.preventDefault()}`) to keep
  focus on the input, as the combobox contract requires; `Popover.Content`
  unmounts when closed unless `forceMount` is set, which fights
  `aria-controls` always needing to reference an existing element; adds a
  dependency surface and required-override list for something four plain
  elements already do correctly. Net: not actually simpler, and the
  overrides needed are exactly the primitive's own defaults.

### A third-party combobox/autocomplete library (e.g. downshift, react-aria's `useComboBox`)
- **Pros:** batteries-included keyboard handling and ARIA wiring, tested
  across browsers.
- **Cons:** a new dependency requires its own ADR under this repo's policy;
  contradicts ADR 0006's decision to standardise on one headless library
  (Radix) rather than mixing in a second (react-aria was already rejected
  there); no current pain this repo has actually hit that justifies it.

## Trade-offs and consequences

Accepted: this component and #21's sorting search will share a similar
shape (debounced query → fetch → listbox) without a shared abstraction yet.
That is deliberate, not an oversight — extracting a shared hook before a
second consumer exists is speculative. Revisit when #21 lands: if its
combobox logic duplicates this one closely, extract a shared hook (e.g.
`src/lib/hooks/use-combobox-search.ts`) then, under its own ADR entry
describing the extraction; until then this ADR's "no shared hook" holds.

Accepted: keyboard/ARIA correctness is this repo's responsibility to
maintain, not a library's. Mitigated by the test suite in
`__tests__/components/address-search.test.tsx`, which exercises the
combobox contract (arrow-key movement without DOM focus loss, Enter/Escape
semantics, `aria-activedescendant` wiring) directly rather than trusting a
primitive's own test suite.
