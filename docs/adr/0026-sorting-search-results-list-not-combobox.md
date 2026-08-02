# ADR 0026: Sorting search UI is a live results list, not an ARIA combobox

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #21

## Context

ADR 0014 named #21 as a second consumer of the same debounced-search shape
built for `AddressSearch`, and flagged "extract a shared hook when #21
lands" as something to revisit. `AddressSearch`'s shape is a WAI-ARIA 1.2
combobox because it has a genuine selection step: the user picks one
matching address, which is then handed to `ScheduleDisplay` via
`onSelect`. Sorting search (FR-05) has no such handoff — the API's
matched rows (`descriptionEn`/`Mi`, `disposalInstructionsEn`/`Mi`) *are*
the answer the user is looking for; there is nothing further to "select."
Forcing `role="combobox"`/`role="listbox"`/`aria-activedescendant` and
arrow-key navigation onto a case with no selection semantics would
advertise interaction (SC 4.1.2) the component doesn't actually offer.

## Decision

`src/components/sorting-search.tsx` renders a plain labelled `<input
type="text">` (debounced 300ms, same `DEBOUNCE_MS` as `AddressSearch`) and
a plain `<ul aria-label>` of result `<li>` rows — the same implicit
list/listitem convention already used for the homepage's colour-token
list. Status (loading/empty/error/done) renders through the shared
`<StatusRegion>` (ADR 0021), identically to `AddressSearch`. No
`aria-expanded`, `aria-controls`, `aria-autocomplete`, or
`aria-activedescendant` — there is no popup to expand/collapse and no
active descendant to track. The debounce/fetch/cancel logic is
structurally similar to `AddressSearch`'s but is not extracted into a
shared hook in this issue: the two components' *result-handling* diverges
completely (one hands off a selection, one renders terminal content
in-place), so the only shared shape is "debounce a fetch," which is a
handful of lines not worth a hook's indirection yet.

## Alternatives considered

### A. Live results list, no combobox semantics (chosen)
- **Pros:** ARIA state always matches what's actually interactive (SC
  4.1.2); no keyboard-navigation contract to build, test, and maintain for
  a set of rows that were never selectable; simpler component, smaller
  test surface than a full combobox.
- **Cons:** ADR 0014's anticipated "same shape" for #21 doesn't fully
  materialize — the two components share a debounce pattern, not an ARIA
  pattern.

### B. Reuse the full ARIA combobox/listbox pattern from `AddressSearch`
- **Pros:** visual/interaction consistency with address search; ADR 0014's
  shared-hook revisit note would apply more directly.
- **Cons:** would require inventing a meaning for "selecting" a sorting
  result (there is nothing to hand off to), `aria-activedescendant`
  pointing at a row that does nothing when "chosen" via Enter, and extra
  keyboard handling (arrow keys, Escape) that exists only to satisfy a
  pattern the content doesn't need — a worse fit for SC 4.1.2, not a
  better one.

## Trade-offs and consequences

Accepted: `AddressSearch` and `SortingSearch` will keep independent
debounce/fetch implementations rather than sharing a hook. Revisit if a
third consumer of "debounced search against this repo's API envelope"
appears — extract then, under its own ADR, per ADR 0014's original
guidance.
