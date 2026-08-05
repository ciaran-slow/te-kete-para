# ADR 0065: Downgrade the WCAG AAA claim to automated-checks-only for this prototype release

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** #65 (closed as out-of-scope-for-prototype by this ADR)

## Context

vision.md §3 and PRD FR-03 both claimed the app is "Fully tested with
VoiceOver (iOS), TalkBack (Android), and NVDA/JAWS." ADR 0024 explicitly
recorded that this pipeline — a headless coding agent with no interactive
GUI session — cannot operate any of those four tools, and substituted a
scriptable accessibility-tree snapshot proxy (`e2e/manual-screen-reader-
tree.spec.ts`) as the closest automatable approximation. ADR 0024 was
explicit that this proxy "does not close vision.md §3" and that #65 (a
human-operated pass with the real named tools) "must stay open... and must
not be closed" until that pass actually happens.

No such pass has happened. The product owner has confirmed this is a
prototype build with no time budget to arrange one, and has decided to
accept the gap rather than continue carrying an open-ended, unscheduled
blocker with no assignee (#65 had sat untouched since 2026-07-31).

## Decision

Close #65 as out-of-scope-for-prototype, superseding ADR 0024's instruction
that it must stay open. Update the two places that made the literal
"fully tested with named assistive technology" claim:

- `docs/vision.md` §3 — reworded to state automated checks only (axe-core
  + the ADR 0024 accessibility-tree proxy), with an explicit statement that
  a human-operated pass with real VoiceOver/TalkBack/NVDA/JAWS has not been
  performed.
- `docs/prd0.md` §1 success metrics and FR-03 — reworded from "100%
  compliance with WCAG 2.2 AAA accessibility standards" / "must adhere
  strictly to WCAG 2.2 AAA guidelines" to "100% pass rate on automated WCAG
  2.2 AAA checks," with the human-audit gap named explicitly.

ADR 0024 itself is not rewritten — it remains an accurate record of why the
accessibility-tree proxy was built and what it does and does not cover.
Only its "must not be closed" instruction for the follow-up issue is
amended by this ADR.

This does not weaken the automated a11y gates already in place: the
Vitest-embedded axe checks (ADR 0007), the CI axe suite (#17), the
Lighthouse budget (#31), and the ADR 0024 accessibility-tree proxy all
continue to run unchanged. What changes is only the claim that a human
verified the result with real assistive technology.

## Alternatives considered

### Downgrade the claim, close #65 (chosen)
- **Pros:** the docs stop asserting something that was never actually
  true in practice (only ADR 0024's proxy, never the real tools); removes
  an indefinitely-stalled, unowned issue from the open list; matches the
  product owner's explicit instruction for this prototype.
- **Cons:** the app genuinely has less assistive-technology verification
  than a "WCAG 2.2 AAA" label conventionally implies to a reader unfamiliar
  with this repo's specific ADR trail.

### Leave #65 open, don't touch the docs
- **Pros:** no claim changes; the gap stays visible only to whoever reads
  the issue tracker.
- **Cons:** explicitly rejected by the product owner — the docs would keep
  asserting "fully tested with VoiceOver/TalkBack/NVDA/JAWS," which ADR
  0024 already establishes has never been true, for an issue with no
  realistic path to closing in this prototype's timeframe.

### Attempt a lightweight partial human pass (e.g. one AT, one flow) instead of fully closing
- **Pros:** some genuine human-verified coverage rather than none.
- **Cons:** the product owner was explicit about having no time budget for
  this at all right now; a partial pass also risks being cited later as
  "the AAA claim was verified" when it covered one tool and one flow —
  worse than an honest "not done" if not clearly scoped and dated.

## Trade-offs and consequences

Accepted: this prototype does not have human-operated assistive-technology
verification, despite documentation elsewhere (this repo's own QA docs,
ADR 0024) describing in detail what such a pass would involve. If this app
moves beyond prototype status, re-open a human-operated screen-reader-pass
issue before making any external "WCAG 2.2 AAA" claim to real users or
stakeholders — the automated checks that remain in place are necessary but,
by ADR 0024's own analysis, not sufficient for that claim.
