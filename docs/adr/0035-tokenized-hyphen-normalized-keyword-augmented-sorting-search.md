# ADR 0035: Tokenized, hyphen-normalized, keyword-augmented sorting search match

- **Status:** accepted
- **Date:** 2026-08-03
- **Issue:** #73

## Context

`GET /api/sorting/search` matched the whole query as one contiguous
substring against `item_key`, `description_en`, `description_mi` (ADR 0025
decision 1). Probed against the real seed (`db/seeds/02_sorting_rules.js`),
two ordinary English queries for rows that exist returned nothing:

- `battery` — the seeded description only has the plural "batteries";
  the singular form appears solely in `disposal_instructions_en` ("a
  battery recycling drop-off point"), which ADR 0025 excluded from the
  match.
- `plastic bag` — `description_en` reads "...soft plastic shopping bag...":
  `plastic` and `bag` both appear but not contiguously, so a
  single-substring match misses the row.

A third gap, `ewaste` vs. seeded `e-waste`, is a hyphenation mismatch, not a
match-scope problem.

ADR 0025 Alternative A accepted excluding `disposal_instructions_*` from the
match on the grounds that an instructions-only match was "rare". `battery`
disproves that: it is an entirely ordinary English query for a real seeded
item, and it is instructions-only. The premise was wrong, but — see
Alternatives below — the underlying cost ADR 0025 was weighing (Alternative
B's noise problem) is not: a bare LIKE over the verbose, repetitive
disposal-instructions text would still turn common queries into a table
dump with no ranking to sort by relevance. This ADR corrects the "rare"
characterisation without reopening that trade-off. Per `docs/adr/README.md`
ADR 0025's own text is left unedited; this record is the correction.

This is the English-side sibling of #72 (Te Reo macron/case folding), same
route/WHERE-building code (`src/app/api/sorting/search/route.ts`). The two
issues were designed independently per instruction; a merge conflict in that
file is expected and resolved at merge time.

## Decision

1. **Tokenize** `q` on whitespace into terms (`tokenizeSearchQuery`,
   `src/lib/api/tokenize-search-query.ts`).
2. **AND across terms, OR across columns**: a row matches only if every term
   matches in at least one of `item_key`, `description_en`, `description_mi`,
   or the new `keywords` column — replacing the old single-contiguous-
   substring match. This supersedes ADR 0025 decision 1's 3-column list;
   decisions 2–4 (bilingual response shape, ordering, `itemKey` identifier)
   are unchanged.
3. **Hyphen normalization**, symmetric on both sides: `REPLACE(column, '-',
   '')` in SQL against a term with its own hyphens stripped in JS, so a
   hyphen-free query matches a hyphenated stored value in either direction.
4. **New `sorting_rules.keywords` column** (migration
   `db/migrations/20260803120000_add_keywords_to_sorting_rules.js`): a
   plain, author-curated text field of extra search terms, in the match
   scope alongside the three existing columns. Seeded today with exactly one
   value — `"battery"` on `household-batteries` — populated incrementally as
   real gaps are found, not backfilled in bulk.
5. `disposal_instructions_en`/`_mi` remain outside the match scope. ADR
   0025's exclusion decision stands; only its "rare" cost characterisation
   is corrected (see Context).

## Alternatives considered

### A. Tokenize + AND-per-term across columns + hyphen normalization + curated `keywords` column (chosen)
- **Pros:** fixes all three named recall gaps without widening the match
  into free text; `keywords` is opt-in and curated, so noise stays bounded
  and auditable per row; AND-ing terms *increases* precision for multi-word
  queries instead of decreasing it.
- **Cons:** `keywords` needs ongoing manual curation as new gaps surface —
  no automatic synonym/stemming generation; hyphen-stripping merges
  kebab-case segments, so a pathological term could straddle a hyphen
  boundary in an unintended way (accepted, low risk on a 15-row curated
  dataset).

### B. Include `disposal_instructions_en`/`_mi` in the match scope
- **Pros:** maximum recall with the least code; matches "battery" in its
  real sentence with no new column.
- **Cons:** reopens ADR 0025 Alternative B's exact concern — the
  instructions repeat a small set of phrases ("general rubbish",
  "recycling", "transfer station") across most rows, so common queries
  would return most of the table with no ranking to sort by relevance.
  Rejected for the same reason ADR 0025 rejected it; the "rare" premise was
  wrong, the noise cost is not.

### C. Stemming / suffix-stripping (e.g. simple plural removal)
- **Pros:** would generically fix `battery`/`batteries` without per-row
  curation.
- **Cons:** doesn't fix `plastic bag` (not a stemming problem) or `ewaste`
  (not a stemming problem) — still needs tokenization and hyphen
  normalization alongside it. English stemming heuristics are fragile
  (irregular plurals, false-positive stems), a maintenance burden
  disproportionate to a 15-row curated dataset where a `keywords` column is
  simpler and fully auditable.

### D. SQLite FTS5 virtual table with a stemming/synonym-aware tokenizer
- **Pros:** real relevance ranking (`bm25()`), built-in tokenization and
  (`unicode61`) diacritic folding — would also address #72's macron/case
  folding in the same layer.
- **Cons:** a materially bigger change: a new virtual table kept in sync
  with `sorting_rules` via triggers or re-indexing on every seed run, a
  migration shape this codebase hasn't used yet, and re-plumbing the route
  and its tests. Out of proportion to a 15-row seed and this issue's three
  named gaps.

## Trade-offs and consequences

- Accepted: `keywords` starts curated for exactly one row
  (`household-batteries`); other singular/plural or synonym gaps remain
  until someone notices and adds a keyword — the same maintenance model as
  any curated dataset.
- Accepted: hyphen normalization is symmetric and applies to all four match
  columns, including the existing `e-waste` query path — verified as a
  non-regression by Supertest coverage (it still matches `small-e-waste`).
- ADR 0025's Status line is updated to note decision 1 is superseded by this
  ADR; its Decision/Alternatives/Trade-offs text is left unedited per
  `docs/adr/README.md`.

## Revisit if

Alternative D (FTS5) becomes worth its migration cost once #70's content
review grows the seed meaningfully, or `keywords` curation burden grows
unmanageable across many rows.
