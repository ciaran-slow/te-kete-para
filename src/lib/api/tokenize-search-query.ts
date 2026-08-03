/**
 * Splits a trimmed search query into whitespace-separated terms, used by
 * GET /api/sorting/search to AND-match each term across columns (ADR 0035).
 * Collapses repeated whitespace. Returns [] on an empty/whitespace-only
 * input rather than throwing, though the route already rejects that case
 * with a 400 before calling this.
 */
export function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}
