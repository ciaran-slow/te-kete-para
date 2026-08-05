# ADR 0024: Accessibility-tree snapshot proxy for the manual screen-reader QA pass

- **Status:** accepted; follow-up closure amended by ADR 0065
- **Date:** 2026-07-31
- **Issue:** #18

## Context

vision.md §3 requires the app be "Fully tested with VoiceOver (iOS),
TalkBack (Android), and NVDA/JAWS." Issue #18 asks for a documented manual
checklist plus one recorded full pass. This repo's plan → build → verify
pipeline runs as a headless coding agent with no interactive GUI session:
it cannot toggle macOS VoiceOver (Cmd+F5) and read its speech output, has
no Android device or emulator for TalkBack, and has no Windows host for
NVDA or JAWS. That is true regardless of the host OS the agent happens to
run on (this one is macOS/Darwin) — none of the four named tools are
operable by a non-interactive process. A plan that asked the builder to
"test with VoiceOver" without resolving this would either stall
indefinitely or produce a fabricated "pass" that never touched real
assistive technology, which is worse than an honest, scoped substitute.

The existing browser-level a11y layer (`e2e/helpers/axe.ts`, ADR 0022)
already covers contrast and document-landmark rules axe-core can compute.
It does not cover what named AT actually announces: accessible name/role/
value/state correctness as vocalized, live-region timing, and reading
order — exactly the class of defect vision.md §3 calls out screen readers
specifically to catch.

## Decision

Use Playwright's `page.ariaSnapshot()` / `expect(page).toMatchAriaSnapshot()`
(`@playwright/test@1.62.0`, already a devDependency, no version bump) as a
scriptable proxy for what VoiceOver/TalkBack/NVDA/JAWS consume via their
platform accessibility APIs (macOS AX API, Android `AccessibilityNodeInfo`,
Windows UIA/MSAA): Chromium's computed accessibility tree is the same
input those tools read from. `e2e/manual-screen-reader-tree.spec.ts`
captures this tree as committed `.aria.yml` golden files for each surface's
key states, cross-checked by hand against the WAI-ARIA APG expected pattern
for that widget (combobox, listbox, radiogroup, live region) in
`docs/qa/screen-reader-checklist.md`. This new spec is deliberately **not**
added to `test:e2e:a11y` or any CI-invoked script — it is a manual/on-demand
QA tool, not a new automated gate; #17's axe suite already owns automated
CI a11y coverage, and folding this into it would blur two different kinds
of check into one.

This decision explicitly does **not** close vision.md §3: it substitutes
for the literal named tools where the pipeline cannot run them. A follow-up
issue requesting a human-operated pass with real VoiceOver, TalkBack, and
NVDA/JAWS is filed alongside this ADR (see docs/qa/screen-reader-pass-
2026-07-31.md) and must stay open until that pass happens.

## Alternatives considered

### Real device/software matrix (macOS VoiceOver, Android emulator + TalkBack, Windows VM + NVDA/JAWS)
- **Pros:** literal fulfillment of vision.md §3; catches real AT quirks a
  computed tree can't show — VoiceOver's rotor behaviour, TalkBack's
  explore-by-touch gesture order, JAWS virtual cursor quirks.
- **Cons:** not executable by this pipeline at all — no GUI session, no
  Android/Windows environment reachable from the build agent; would either
  silently stall the issue or force a fabricated "pass" never actually
  performed, which is a worse outcome than an honest documented gap.

### Rely solely on the existing automated axe suite (#17, ADR 0022)
- **Pros:** zero new work; already CI-gated.
- **Cons:** axe cannot detect reading order, live-region chattiness/timing,
  or name-as-computed-vs-name-as-intended mismatches — the exact defect
  class vision.md §3 calls out AT-specific testing to catch. Would not
  satisfy this issue's acceptance criteria at all, just restate #17.

### Accessibility-tree snapshot proxy + explicit written gap (chosen)
- **Pros:** scriptable, repeatable, code-reviewable, reuses the existing
  Playwright/axe stack with no new dependency; gives real additional
  coverage (accessible name/role/state correctness, live-region wiring,
  reading order) beyond axe; is honest about the remaining gap rather than
  hiding it — that gap gets its own filed, tracked issue.
- **Cons:** does not catch AT-implementation-specific quirks (rotor
  navigation, gesture order, verbosity settings differing between NVDA and
  JAWS); a rigorous proxy is still a heavier read for a future human
  reviewer than a real AT session would be for a human tester.

## Trade-offs and consequences

The pass recorded on #18 is a rigorous proxy, not literal VoiceOver/
TalkBack/NVDA/JAWS testing. The filed follow-up issue for a human-operated
pass is the actual closure of vision.md §3's claim and must not be closed
by this PR. If the app later gains a CI environment with real AT access
(unlikely for TalkBack/NVDA/JAWS, plausible for VoiceOver via a macOS
runner with accessibility permissions granted), revisit whether that
follow-up can be automated rather than staying a manual pass.
