import { getDb } from "@/lib/db";
import { foldDiacritics } from "@/lib/api/fold-diacritics";
import { tokenizeSearchQuery } from "@/lib/api/tokenize-search-query";

interface SortingRuleRow {
  item_key: string;
  description_en: string;
  description_mi: string;
  disposal_instructions_en: string;
  disposal_instructions_mi: string;
  keywords: string;
}

export interface SortingRuleSearchResult {
  itemKey: string;
  descriptionEn: string;
  descriptionMi: string;
  disposalInstructionsEn: string;
  disposalInstructionsMi: string;
}

/**
 * Maps a raw `sorting_rules` row to the API's camelCase contract (ADR 0013,
 * ADR 0025). `keywords` is match-only (ADR 0035) and never part of the
 * response contract. No boolean columns here, so no Boolean(...) cast is
 * needed.
 */
export function toSortingRuleSearchResult(
  row: SortingRuleRow,
): SortingRuleSearchResult {
  return {
    itemKey: row.item_key,
    descriptionEn: row.description_en,
    descriptionMi: row.description_mi,
    disposalInstructionsEn: row.disposal_instructions_en,
    disposalInstructionsMi: row.disposal_instructions_mi,
  };
}

// Every column a query term may match against (ADR 0035, ADR 0037).
const MATCH_COLUMNS = [
  "item_key",
  "description_en",
  "description_mi",
  "keywords",
] as const;

/**
 * Normalizes a column value or query term for matching: strips hyphens (so
 * a hyphen-free query matches hyphenated stored text and vice versa, ADR
 * 0035) then folds case and diacritics (ADR 0037). Both sides of every
 * comparison go through this same function, so there's no way for a
 * column's stored form and the query's typed form to drift out of sync.
 */
function normalizeForMatch(value: string): string {
  return foldDiacritics(value.replace(/-/g, ""));
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length === 0) {
    return Response.json(
      { error: "Query parameter q is required." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const terms = tokenizeSearchQuery(q).map(normalizeForMatch);
    const rows: SortingRuleRow[] = await db("sorting_rules")
      .orderBy("item_key")
      .select(
        "item_key",
        "description_en",
        "description_mi",
        "disposal_instructions_en",
        "disposal_instructions_mi",
        "keywords",
      );

    const matches = rows.filter((row) => {
      const normalizedColumns = MATCH_COLUMNS.map((column) =>
        normalizeForMatch(row[column]),
      );
      return terms.every((term) =>
        normalizedColumns.some((column) => column.includes(term)),
      );
    });

    return Response.json({ results: matches.map(toSortingRuleSearchResult) });
  } catch {
    return Response.json(
      { error: "Unable to search sorting rules." },
      { status: 503 },
    );
  }
}
