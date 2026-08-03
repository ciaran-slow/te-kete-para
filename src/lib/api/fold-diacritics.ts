/**
 * Normalises a string for macron- and case-insensitive matching:
 * lower-cases it, then Unicode-decomposes and strips combining diacritical
 * marks - so a/A, e/E, i/I, o/O, u/U with macrons all fold to their bare
 * vowel. Called on both the column value and the query in a post-fetch JS
 * filter (`src/app/api/sorting/search/route.ts`,
 * `src/app/api/suburbs/search/route.ts`) so both sides fold the same way
 * (ADR 0037) — the project's pinned sqlite3 driver can't register this as
 * a SQL scalar function (ADR 0037's rejected Option A).
 */
export function foldDiacritics(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
}
