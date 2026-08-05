# Manual screen-reader QA checklist

Reusable checklist for the manual screen-reader QA pass required by
vision.md §3 and issue #18. It is keyed to the actual ARIA contract of the
shipped surfaces and cross-checked against the WAI-ARIA APG pattern for
each widget. The verification method is the accessibility-tree snapshot
proxy described in ADR 0024 (`e2e/manual-screen-reader-tree.spec.ts`,
committed `.aria.yml` golden files) — not literal VoiceOver / TalkBack /
NVDA / JAWS sessions, which this pipeline cannot drive; a human-operated
pass with the real tools is tracked as a separate follow-up issue (see
ADR 0024, §Trade-offs and consequences).

To run a pass: copy each table into a dated log file
(`docs/qa/screen-reader-pass-<date>.md`), fill in the Result column with
PASS / FAIL / N/A / BLOCKED, and file one issue per distinct FAIL.

## What a green run actually enforces

`toMatchAriaSnapshot`'s default `contain` child-matching mode only checks
that the expected nodes/attributes are present in the actual tree — it does
not fail on extra sibling nodes, and a template that omits an attribute
still matches an actual node that has it (verified against
`@playwright/test@1.62.0`, issue #67). So a golden file's *absence* of a
node or attribute is not, by itself, evidence that the real page doesn't
render it. Rows below whose "How to verify" cites a direct Playwright
assertion (`toHaveAttribute`, `toBeHidden`, `toHaveCount`) are enforced by a
green `npm run test:e2e:a11y-manual` run. Rows that cite only "absent in
the golden" with no such assertion are not — they still need a hand check
against a freshly captured `.aria.yml` diff (`--update-snapshots`, reviewed
by eye) each pass.

## Language toggle (`src/components/language-toggle.tsx`)

APG pattern: Radio Group.

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Group role and name | `role="radiogroup"` with `aria-label` from `language.toggle.label` ("Choose language" / "Kōwhiria te reo") (language-toggle.tsx, ADR 0006) | `radiogroup` node with that accessible name in `home-default-en.aria.yml` / `home-default-mi.aria.yml` | | |
| Two radio items with language marked | Two `radio` items, `lang="en"` / `lang="mi"` on the rendered buttons, named "English" and "Te Reo Māori" (language-toggle.tsx) | Two `radio` nodes under the group in the golden files | | |
| Checked state exposed via `aria-checked` | Radix `RadioGroup.Item` exposes checked state as `aria-checked`, not just the visual `data-state` class (Radix semantics) | `[checked]` on the selected `radio` node in the captured `.aria.yml` — verify in the tree, not the CSS | | |
| Arrow keys move focus **and** select | Native radio keyboard contract: arrow keys select as they move focus — `RadioGroup`, not `ToggleGroup`, is used precisely for this (code comment in language-toggle.tsx, architecture.md §2A) | Manual keyboard check when running a live pass; proxy pass verifies the roles that imply the contract | | |
| `Tab` enters the group only at the checked item | Roving tabindex: one tab stop for the whole group (Radix `RadioGroup`) | Manual keyboard check when running a live pass | | |
| Selecting a locale updates `<html lang>` | `LanguageProvider` mirrors locale onto `<html lang>` in an effect so screen readers pick the right voice (architecture.md §2A, vision.md §3) | `expect(page.locator("html")).toHaveAttribute("lang", "mi")` in the spec — the aria snapshot does not carry document-level attributes | | |

## Address search (`src/components/address-search.tsx`)

APG pattern: Editable Combobox With List Autocomplete (hand-built, no
Radix primitive — ADR 0014).

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Input role and label | Input is `role="combobox"` with an associated `<label>` (`address.search.label`) | `combobox` node with accessible name "Search for your street address" in `address-search-results.aria.yml` | | |
| `aria-autocomplete="list"` | Advertises list autocomplete (address-search.tsx) | Attribute present on the input in the DOM; snapshot shows the combobox role | | |
| `aria-controls` → listbox id | Input's `aria-controls` points at the listbox element's id | DOM check while capturing; ids are React `useId` values so they are not asserted byte-for-byte | | |
| `aria-expanded` true only when results are loaded | `aria-expanded` derives from `isOpen && status === "done"` (`isPopupVisible`), never true during loading/empty/error (address-search.tsx SC 4.1.2 comment) | `[expanded]` on the combobox in `address-search-results.aria.yml`; absent in `address-search-no-results.aria.yml` / `address-search-error.aria.yml`; also asserted directly (`toHaveAttribute("aria-expanded", "false")`) in the no-results, error, and popup-close-transition spec tests | | |
| `aria-activedescendant` tracks highlighted option | Arrow keys move the active descendant without moving real DOM focus off the input (ADR 0014) | Manual keyboard check when running a live pass; `aria-selected` movement is visible in the tree | | |
| Listbox role and name | `role="listbox"` with `aria-label` from `address.search.resultsLabel` ("Matching addresses"), `hidden` when the popup is closed | `listbox` node named "Matching addresses" present only in `address-search-results.aria.yml`; the closed-state absence is also asserted directly (`getByRole("listbox", { includeHidden: true }).toBeHidden()`) in the no-results, error, and popup-close-transition spec tests | | |
| Options with `aria-selected` on highlighted row only | Each row is `role="option"`; `aria-selected="true"` only on the arrow-key-highlighted one | `option` nodes in `address-search-results.aria.yml`; exactly one `[selected]` when a row is highlighted; the zero-selected half is also asserted directly (`getByRole("option", { selected: true })` count 0) in the results test. The "exactly one selected when a row *is* highlighted" half has no automated coverage — no golden or spec state exercises a keyboard highlight — and still needs a hand check on a live pass | | |
| Loading / empty / error status announced | Status messages render through the shared `<StatusRegion>` (`aria-live="polite"`, no `aria-atomic`; ADR 0021); loading/empty/error text is visibly shown | Status text visible in `address-search-no-results.aria.yml` and `address-search-error.aria.yml` | | |
| "Results available" message announced despite `sr-only` | On a successful search the status text (`address.search.resultsAvailable`) is `sr-only` but sits inside the always-mounted live region, so it must still be announced — and not missed or double-announced across a loading → done transition | Message present in the accessibility tree in `address-search-results.aria.yml` (visually hidden content still exposed); the region is a single always-mounted element, so one transition produces one announcement | | |
| Escape closes the popup without clearing the query | `Escape` handler closes and cancels pending work but leaves `query` untouched (address-search.tsx) | Manual keyboard check when running a live pass | | |

## Schedule display (`src/components/schedule-display.tsx`)

APG pattern: live region (`aria-live="polite"` + `aria-atomic`) around a
labelled `<section>`.

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Outer `<section>` is an atomic polite live region | `<StatusRegion as="section" atomic ...>` renders `aria-live="polite"` `aria-atomic="true"` (ADR 0021) | DOM attributes while capturing; region content appears whole in `schedule-suburban.aria.yml` / `schedule-inner-city.aria.yml` | | |
| `aria-labelledby` points at the rendered `<h2>` | `headingId` is passed only when a rule set rendered, so `aria-labelledby` references a real heading (schedule-display.tsx) | `region` node named "Your next collection" in `schedule-suburban.aria.yml` — a section is only exposed as `region` when it has an accessible name | | |
| `aria-labelledby` absent (not dangling) in "no address" / "error" states | `headingId` is `undefined` in those states because no heading id exists then (status-region.tsx doc comment) | `home-default-en.aria.yml`: no named `region`, only the "Search for your address above…" paragraph text; this row still relies on golden-absence only (no direct assertion) — same limitation issue #67 found elsewhere in this checklist — and needs a hand check against a fresh capture each pass | | |
| Suburban rules content | Heading, date, "Bins to put out" list, and time window render for a suburban address (Karori Road, `zone-west`) | `schedule-suburban.aria.yml` | | |
| Inner-city night-collection content | Same structure with night-collection rules for Cuba Street (`zone-cbd`, `is_inner_city_night_collection: true`) | `schedule-inner-city.aria.yml` | | |
| "Bins to put out" is a paragraph, not a heading | The `<p className="font-medium">` for `schedule.binsHeading` is deliberately a paragraph — record the verdict as "verified intentional, not a missed heading", do not silently pass or silently flag it as a bug | Confirm in `schedule-suburban.aria.yml` that no `heading` node exists for "Bins to put out" and note the verdict explicitly | | |
| Repeated capture is stable | The settled tree for the same state is deterministic across repeats | Spec test 8: three fresh captures of the Karori flow compared for exact string equality | | |

## Sorting search ("He Aha Tēnei?")

**Blocked — not implemented (#19 seed data, #20 API, #21 UI all open).**

Acceptance criterion from issue #18, verbatim:

> A documented manual test checklist covering address search, schedule
> display, language toggle, and sorting search

This section will be checked once #19/#20/#21 land. No behaviour is
invented to check against in the meantime.

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Sorting search surface | Not yet built (#19/#20/#21 open) | N/A until the surface exists | BLOCKED | Re-check after #19/#20/#21 |

## How to reproduce a pass

1. `npm run migrate`
2. `npm run seed`
3. `npm run build && npm run start` (or let Playwright's `webServer` start
   the production server for you)
4. After an **intentional** UI change, regenerate the baselines once:
   `npx playwright test e2e/manual-screen-reader-tree.spec.ts --update-snapshots`
   — review the `.aria.yml` diff by hand against this checklist before
   committing it.
5. Verify: `npm run test:e2e:a11y-manual`

The three schedule-display tests run under a **pinned clock and timezone**
(`PINNED_SCHEDULE_TIME` in the spec: 2026-07-31T10:00:00+12:00,
Pacific/Auckland — a Friday in an ADR 0016 glass week), because the
schedule content is date-dependent: `src/lib/schedule/rules.ts` alternates
the suburban recycling bin weekly and adds "Cardboard" to the inner-city
list on Tuesdays. The schedule goldens therefore assert the **exact** date
and bin list for that instant and stay green on any real-world run date.
Do not "fix" a schedule-golden failure by regenerating on a different
date — if the pinned instant must change (e.g. real WCC calendar data
replaces the ADR 0016 placeholder), update `PINNED_SCHEDULE_TIME`,
regenerate, and record the new instant here and in the pass log.
