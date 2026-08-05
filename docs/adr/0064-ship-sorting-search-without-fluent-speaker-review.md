# ADR 0064: Compose SortingSearch now; ship the Te Reo Māori machine draft as an accepted prototype-scope risk

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** #69, #75 (both closed as won't-fix-for-prototype by this ADR)

## Context

ADR 0028 built `<SortingSearch>` in full but deliberately deferred composing
it into any route until both #69 (fluent Te Reo Māori speaker review of the
30 `_mi` fields in `db/seeds/02_sorting_rules.js`) and #70 (row-by-row
confirmation of the English disposal instructions against WCC's live pages)
closed. #70 closed as part of the #119/#137 aerosol-can correction pass;
the seed header now reads "CONFIRMED CONTENT (issues #70, #119)" for the
English text. #69 never closed — no fluent Te Reo Māori speaker has been
available to do the review, and the product owner has confirmed this is a
prototype build with no time budget to source one.

Leaving #69 open indefinitely means the fully-built, fully-tested
`<SortingSearch>` component stays permanently unreachable by any user —
exactly the outcome ADR 0028's own "Trade-offs and consequences" section
warned about ("the feature stays permanently invisible despite being fully
built"). The product owner has explicitly decided, knowing the risk, that
shipping a machine-drafted Te Reo translation is an acceptable trade-off
for this prototype, rather than leaving the feature dark.

This is not a claim that the Te Reo content is now correct. It is the same
category of decision as ADR 0016's original recycling-week epoch guess or
ADR 0059's "rejected unknown" framing: an explicit, recorded, product-level
acceptance of a known gap, not a silent one.

## Decision

Compose `<SortingSearch>` into `src/app/page.tsx`, in its own section
following `<AddressSchedule>`, the same mechanical composition #75's
acceptance criteria described. Add the previously-missing
`sortingSearch.heading` render (`src/components/sorting-search.tsx`) as
part of this change, since #75's acceptance criteria required it and it
was still unrendered at the time this ADR was written (last review, item:
"Sorting search will ship headless").

Close #69 and #75 as won't-fix-for-prototype rather than leaving them open
indefinitely. Update the seed file's header comment
(`db/seeds/02_sorting_rules.js`) to record that the machine-draft risk was
knowingly accepted, not resolved, so a future contributor doing a real
fluent-speaker pass knows to re-open a tracking issue rather than assume
the existing "CONFIRMED CONTENT" header already covers the `_mi` fields —
it does not; that header is scoped to the English-language WCC-sourced
disposal instructions only.

No user-facing disclaimer is added to the UI. The component's UI itself
does not change in kind — a user cannot distinguish machine-drafted Te Reo
text from reviewed text by looking at the page — only the internal
engineering record (this ADR, the seed comment, the closed issues)
documents the gap.

## Alternatives considered

### Ship now, accept the risk, close the tracking issues (chosen)
- **Pros:** unblocks FR-05 entirely for this prototype; the component and
  its English content are both already tested and WCC-confirmed; matches
  the product owner's explicit, time-boxed instruction.
- **Cons:** real users navigating in Te Reo Māori (PRD persona 3) may see
  translation errors — the same defect class two prior verify passes on
  PR #68 each found examples of. No mitigation beyond the internal record
  below is added.

### Leave #69/#75 open, keep the component dark
- **Pros:** never exposes unreviewed Te Reo content.
- **Cons:** explicitly rejected by the product owner for this prototype —
  a fully-built, fully-tested feature stays invisible with no path to
  shipping, which is the exact failure mode ADR 0028 flagged as a risk if
  the follow-up never landed.

### Add a visible "unreviewed translation" banner to the UI
- **Pros:** honest to end users, not just to future engineers reading the
  seed file.
- **Cons:** the product owner's instruction was to ship without a
  user-facing warning; a banner also only meaningfully applies to the `mi`
  locale, adding one-off conditional UI to a component that otherwise
  treats both locales identically — reasonable to revisit if this app ever
  leaves prototype status.

## Trade-offs and consequences

Accepted: the `_mi` fields in `db/seeds/02_sorting_rules.js` may contain
translation errors visible to real users, with no in-UI indication. The
seed file's own header comment is the only record of this, alongside this
ADR. If this app moves beyond prototype status, re-open a fluent-speaker
review issue before relying on the current Te Reo text being correct —
do not treat #69's closure as evidence the content was reviewed.
