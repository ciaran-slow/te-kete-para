# Screen-reader QA pass — 2026-07-31

Recorded results of one full pass of
`docs/qa/screen-reader-checklist.md` for issue #18.

## Methodology

This pass was executed as an **accessibility-tree snapshot proxy**, per
ADR 0024 (`docs/adr/0024-manual-a11y-pass-accessibility-tree-proxy.md`):
Playwright's `page.ariaSnapshot()` / `expect(page).toMatchAriaSnapshot()`
captured Chromium's computed accessibility tree — the same input
VoiceOver, TalkBack, NVDA, and JAWS consume via their platform
accessibility APIs — as committed `.aria.yml` golden files
(`e2e/manual-screen-reader-tree.spec.ts`), each cross-checked by hand
against the checklist and the WAI-ARIA APG pattern for the widget. This is
plainly **not** a literal VoiceOver/TalkBack/NVDA/JAWS session: rows whose
only verification is real-AT keyboard/speech behaviour are recorded N/A
here and are covered by the human-operated follow-up pass, issue #65.

Golden files live at
`e2e/manual-screen-reader-tree.spec.ts-snapshots/<name>.aria.yml`
(Playwright's default `snapshotPathTemplate` output for this spec — no
project/platform suffix was added for `.aria.yml` snapshots).

## Commands run

```
npm run migrate
# → Using environment: development / Already up to date

npm run seed
# → Using environment: development / Ran 1 seed files

npx playwright test e2e/manual-screen-reader-tree.spec.ts --update-snapshots
# → 8 passed (13.7s); generated 7 .aria.yml golden files in
#   e2e/manual-screen-reader-tree.spec.ts-snapshots/

npm run test:e2e:a11y-manual   # confirming re-run 1
# → 8 passed (5.5s)

npm run test:e2e:a11y-manual   # confirming re-run 2
# → 8 passed (4.6s)
```

Baseline generation ran once; both confirming re-runs passed 8/8 with no
snapshot drift.

**Pinned clock (amended same day, after PR review):** the initial capture
let the schedule tests use the real clock; Playwright generalized the
date/time text to regex patterns but captured the equally date-dependent
**bin list** literally — `src/lib/schedule/rules.ts` alternates the
suburban recycling bin weekly (ADR 0016 epoch) and adds "Cardboard" to the
inner-city list on Tuesdays, so those goldens would have red-failed on
every mixed week / every Tuesday. The three schedule tests now pin the
browser clock and timezone via `page.clock.setFixedTime(...)` +
`timezoneId: "Pacific/Auckland"` to
**`PINNED_SCHEDULE_TIME` = 2026-07-31T10:00:00+12:00** — a Friday in a
glass week, i.e. the same conditions as this pass, so the hand-checked
golden content is unchanged — and the schedule goldens assert the exact
`Date: 31/07/2026`, bin lists, and time-window text for that instant.
Verified load-bearing with a throwaway probe: pinning 2026-08-04 (a
mixed-week Tuesday) instead makes both schedule tests fail with
`Mixed recycling (paper, plastic, metal)` and an extra `Cardboard`
listitem, proving the pinned clock (not the run date) drives the content.

## Checklist results

### Language toggle

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Group role and name | `role="radiogroup"` + `aria-label` from `language.toggle.label` | Golden files | PASS | `radiogroup "Choose language"` in `home-default-en.aria.yml`; `radiogroup "Kōwhiria te reo"` in `home-default-mi.aria.yml` |
| Two radio items with language marked | Two `radio` items, `lang="en"` / `lang="mi"` | Golden files | PASS | `radio "English"` and `radio "Te Reo Māori"` in both goldens; `lang` attributes are not carried by aria snapshots — confirmed present in `language-toggle.tsx` source |
| Checked state exposed via `aria-checked` | Radix exposes checked state as `aria-checked`, not just `data-state` | Captured `.aria.yml` | PASS | `[checked]` on `radio "English"` in `home-default-en.aria.yml` and on `radio "Te Reo Māori"` in `home-default-mi.aria.yml` — state is in the tree, not just CSS |
| Arrow keys move focus **and** select | Native radio keyboard contract | Manual keyboard check (live pass) | N/A | Real-AT keyboard behaviour is not exercisable by this proxy; roles implying the contract verified above. Deferred to #65 |
| `Tab` enters group only at checked item | Roving tabindex | Manual keyboard check (live pass) | N/A | Deferred to #65 |
| Selecting a locale updates `<html lang>` | Provider mirrors locale onto `<html lang>` | `toHaveAttribute("lang", "mi")` | PASS | Asserted directly in the `(mi)` spec test — document-level attribute, outside the aria snapshot by design |

### Address search

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Input role and label | `role="combobox"` with associated `<label>` | Golden file | PASS | `combobox "Search for your street address"` in `address-search-results.aria.yml` (and named `"Rapua tō wāhitau tiriti"` in the mi golden) |
| `aria-autocomplete="list"` | Advertised on the input | DOM/code check | PASS | Attribute set unconditionally in `address-search.tsx`; combobox role exposure confirmed in goldens |
| `aria-controls` → listbox id | Input controls the listbox element | DOM/code check | PASS | `aria-controls={listboxId}` wired to the `<ul id={listboxId}>` in `address-search.tsx`; ids are React `useId` values, so not asserted byte-for-byte |
| `aria-expanded` true only when results loaded | Derives from `isOpen && status === "done"` | Goldens across states | PASS | `[expanded]` present on the combobox in `address-search-results.aria.yml`; **absent** in `address-search-no-results.aria.yml` and `address-search-error.aria.yml` |
| `aria-activedescendant` tracks highlighted option | Highlight moves without moving DOM focus | Manual keyboard check (live pass) | N/A | Deferred to #65; wiring (`aria-activedescendant={optionId(activeOption)}`) confirmed in source |
| Listbox role and name | `role="listbox"` named "Matching addresses", hidden when closed | Goldens | PASS | `listbox "Matching addresses"` with `option "Karori Road, Karori"` present only in `address-search-results.aria.yml`; no listbox node in the closed-state goldens |
| Options with `aria-selected` on highlighted row only | `role="option"`, one `[selected]` when highlighted | Golden | PASS | Captured state has no keyboard highlight and correctly exposes **zero** `[selected]` options; highlight movement itself is the N/A `aria-activedescendant` row above |
| Loading / empty / error status announced | Via `<StatusRegion>` `aria-live="polite"`, no `aria-atomic` | Goldens | PASS | "No matching addresses…" visible in `address-search-no-results.aria.yml`; "We couldn't search addresses right now…" in `address-search-error.aria.yml` |
| "Results available" announced despite `sr-only` | Inside the always-mounted live region; one announcement per loading → done transition | Golden | PASS | "Results are available below. Use the up and down arrow keys to choose one." is present in the tree in `address-search-results.aria.yml` even though visually hidden. The region is one always-mounted element (visible as the empty `paragraph` node in the idle goldens), so the loading → done transition is a single text swap in a single polite region — announced once, not missed, not doubled |
| Escape closes popup without clearing query | `Escape` handler leaves `query` untouched | Manual keyboard check (live pass) | N/A | Deferred to #65; behaviour confirmed in `address-search.tsx` source |

### Schedule display

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Outer `<section>` is atomic polite live region | `aria-live="polite"` `aria-atomic="true"` (ADR 0021) | DOM/code + goldens | PASS | `StatusRegion as="section" atomic` in `schedule-display.tsx`; region content appears whole in `schedule-suburban.aria.yml` / `schedule-inner-city.aria.yml` (live-region attributes themselves are not carried by aria snapshots) |
| `aria-labelledby` points at rendered `<h2>` | Section named by its heading | Golden | PASS | `region "Today's collection"` node in both schedule goldens — a `<section>` is only exposed as `region` when it has an accessible name, so the name proves the wiring |
| `aria-labelledby` absent (not dangling) in "no address" / "error" states | `headingId` passed only when a rule set rendered | Golden + code | PASS | `home-default-en.aria.yml` has no named `region` — just the "Search for your address above…" paragraph. The rule-engine error state renders through the same `headingId={ruleSet ? headingId : undefined}` guard (code-verified; that state is not reachable from seeded data) |
| Suburban rules content | Heading, date, bins list, time window (Karori Road, `zone-west`) | Golden | PASS | `schedule-suburban.aria.yml`: heading level 2, exact `Date: 31/07/2026` line (pinned clock), list of "General rubbish" + "Glass recycling crate" (glass week at the pinned instant), exact "Put out by 07:00" line |
| Inner-city night-collection content | Cuba Street (`zone-cbd`, night collection) | Golden | PASS | `schedule-inner-city.aria.yml`: "Yellow rubbish bag" list item (no "Cardboard" — the pinned instant is a Friday, not Tuesday) and exact "Collection window: 17:30–22:00" line |
| "Bins to put out" is a paragraph, not a heading | Deliberate paragraph | Golden | PASS | **Verified intentional, not a missed heading**: exposed as `paragraph: Bins to put out` in both schedule goldens, no `heading` node — matches the component's deliberate `<p className="font-medium">` |
| Repeated capture is stable | Deterministic settled tree | Spec test 8 | PASS | Three fresh-load captures of the Karori flow byte-identical (`repeated capture of the same settled state is stable`, green on all three runs) |

### Sorting search ("He Aha Tēnei?")

| Item | Expected (source) | How to verify | Result | Notes |
| --- | --- | --- | --- | --- |
| Sorting search surface | Not yet built (#19/#20/#21 open) | N/A until the surface exists | BLOCKED | Not exercised — see "Sorting search" below |

## Findings

**Zero FAIL results from this pass.** Every checked row passed; no
follow-up defect issues were filed because none were found. Two
non-defect observations, recorded for future passes:

- Every golden ends with an empty `- alert` node: this is Next.js's
  built-in route announcer (`<next-route-announcer>`), present on every
  page by framework design. It is empty at rest and is not a defect.
- Rows marked N/A (arrow-key selection, roving tabindex,
  `aria-activedescendant` tracking, Escape behaviour) are keyboard/speech
  interactions only a live AT session can meaningfully judge; their static
  wiring was code-verified and they are explicitly in scope for the
  human-operated pass (#65).

## Follow-up filed

- **#65 — Human-operated VoiceOver/TalkBack/NVDA/JAWS pass to close the
  ADR 0024 gap on #18.** Filed regardless of findings, per ADR 0024: this
  proxy pass does not close vision.md §3's named-tool claim; #65 must stay
  open until a person runs the checklist with real assistive technology.
- No other issues filed — this pass produced zero FAILs (see Findings).

## Sorting search

The sorting-search section of the checklist is **blocked on #19 (seed
data), #20 (API), and #21 (UI)**, all open at the time of this pass. It
was not exercised, and no behaviour was invented to check against. It will
be checked in a future pass once those issues land.
