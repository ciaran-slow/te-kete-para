# Architecture Decision Records

One file per decision, numbered sequentially: `NNNN-short-slug.md` (next
number = highest existing + 1). Copy `0000-template.md` and fill in every
section — a record without alternatives and trade-offs is a changelog entry,
not a decision record.

What counts as an ADR-worthy decision: a new dependency, a persisted data
shape, a schema or migration strategy, a folder/state/rendering convention,
anything that destroys or migrates data, or any choice a future issue would
otherwise re-litigate.

Accepted ADRs are never edited into a different decision. To reverse one,
write a new ADR that supersedes it and update the old record's **Status** to
`superseded by ADR NNNN`.

`docs/architecture.md` stays the current-state picture; ADRs are the history
of why it looks that way. When an ADR changes the architecture, update
architecture.md and reference the ADR number.
