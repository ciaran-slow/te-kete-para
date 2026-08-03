# ADR 0025: Sorting search match columns and bilingual response shape

- **Status:** accepted — decision 1 (match columns) superseded by ADR 0033;
  decisions 2–4 (response shape, ordering, identifier) unchanged.
- **Date:** 2026-08-02
- **Issue:** #20

## Context

FR-05 needs a server-side lookup over `sorting_rules` (architecture.md
§2C): item key, bilingual descriptions, and bilingual disposal instructions,
seeded by #19. The sorting search UI (#21, not yet built) will let a user
type or dictate an item name in whichever language they're currently using
and see results rendered in that same language — the same client-owns-locale
pattern the rest of the app already uses (`useTranslation()`, ADR 0009,
ADR 0010), not a server-side language switch. Two things this endpoint's
design has to settle that `/api/suburbs/search` (#11, ADR 0013) didn't need
to: which columns count as a "match" when a row has five text columns
instead of one, and whether the response carries one language or both.

## Decision

1. **Match columns:** `item_key`, `description_en`, `description_mi` only,
   OR'd together behind the same case-insensitive, wildcard-escaped
   `LIKE ... ESCAPE '\'` pattern ADR 0013 established, reusing one shared
   `escapeLikePattern` (relocated to `src/lib/api/escape-like-pattern.ts`
   so `/api/suburbs/search` and `/api/sorting/search` both import the same
   implementation instead of duplicating it). `disposal_instructions_en`/
   `_mi` are selected in the response but excluded from the match.
2. **Response shape:** every matched row returns both locales'
   `description*` and `disposalInstructions*` fields in one object — never
   a single language chosen server-side by a `lang`/`locale` parameter.
3. **Ordering:** results are ordered by `item_key` ascending, mirroring
   `/api/suburbs/search`'s `ORDER BY street_name` (ADR 0013).
4. **Identifier:** the response's stable identifier is `itemKey` (already
   `unique()` in the migration), not the internal numeric `id` — the same
   natural-key precedent as `push_subscriptions.endpoint` (architecture.md
   §2C), since `sorting_rules` already has a unique, human-meaningful key
   and exposing the internal row id would add nothing.

## Alternatives considered

### A. Match `description_en`/`description_mi`/`item_key` only (chosen)
- **Pros:** keeps result sets narrow and relevant to the searched item.
- **Cons:** a query term that appears only inside some row's
  `disposal_instructions` text (rare) would not surface that row.

### B. Match all four text columns (also include `disposal_instructions_*`)
- **Pros:** maximum recall — nothing in the table is unsearchable.
- **Cons:** the disposal instructions are verbose free text that repeats a
  small set of phrases across most rows ("general rubbish", "recycling",
  "WCC transfer station"), so a broad query would return most of the table
  almost regardless of relevance — a plain LIKE match with no relevance
  ranking turns "keyword search" into "table dump" for exactly the
  common-word queries a real user is most likely to type.

### C. Locale-specific single-language response (`?lang=en|mi`, one
    `description`/`instructions` field back)
- **Pros:** smaller per-row payload; lets the server restrict matching to
  just that locale's columns too.
- **Cons:** forces every caller to know and pass its locale, a coupling
  point the rest of the app's i18n system doesn't have today — locale is a
  pure client-side concern (ADR 0009); a user flipping the language toggle
  after already searching would need a refetch instead of an instant
  re-render from data already on hand; breaks the "server is locale-
  agnostic" precedent set by `dictionaries.ts` holding both locales in one
  static object.

## Trade-offs and consequences

- Accepted: a query matching only inside `disposal_instructions` text is
  unreachable (Alternative A's con). Revisit if #70's row-by-row content
  verification surfaces a real case where this matters.
- Accepted: every result ships both languages over the wire even though the
  client renders one — negligible at the current 16-row seed; revisit
  alongside the pagination question below if the table grows enough for
  payload size to matter.
- Pagination is out of scope for this issue. ADR 0013 flagged pagination as
  a likely future need for #20 ("#20 will likely need paging over a larger
  sorting-rules index"); at 16 seeded rows there is no such need yet.
  Revisit when #70's real WCC content review materially grows the table.

## Revisit if

The seed dataset grows large enough that unranked LIKE matching or
returning the full unpaginated result set becomes a real cost, or a genuine
disposal-instructions-only search need is found.
