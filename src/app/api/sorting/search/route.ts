import { getDb } from "@/lib/db";
import { escapeLikePattern } from "@/lib/api/escape-like-pattern";
import { tokenizeSearchQuery } from "@/lib/api/tokenize-search-query";

interface SortingRuleRow {
  item_key: string;
  description_en: string;
  description_mi: string;
  disposal_instructions_en: string;
  disposal_instructions_mi: string;
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
 * ADR 0025). No boolean columns here, so no Boolean(...) cast is needed.
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

// Fixed, hardcoded column names — never user input — so interpolating them
// into the raw SQL template below is safe; only the per-term `pattern`
// value is parameter-bound.
const MATCH_COLUMNS = [
  "item_key",
  "description_en",
  "description_mi",
  "keywords",
] as const;

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
    const terms = tokenizeSearchQuery(q);
    const rows: SortingRuleRow[] = await db("sorting_rules")
      .where((builder) => {
        for (const term of terms) {
          // Hyphens are stripped before escaping — escapeLikePattern only
          // touches `\`, `%`, `_`, so order between the two steps doesn't
          // affect correctness, but stripping first keeps the escaped
          // output easy to reason about.
          const pattern = `%${escapeLikePattern(term.replace(/-/g, ""))}%`;
          builder.andWhere((termBuilder) => {
            for (const column of MATCH_COLUMNS) {
              termBuilder.orWhereRaw(
                `REPLACE(${column}, '-', '') LIKE ? ESCAPE '\\'`,
                [pattern],
              );
            }
          });
        }
      })
      .orderBy("item_key")
      .select(
        "item_key",
        "description_en",
        "description_mi",
        "disposal_instructions_en",
        "disposal_instructions_mi",
      );

    return Response.json({ results: rows.map(toSortingRuleSearchResult) });
  } catch {
    return Response.json(
      { error: "Unable to search sorting rules." },
      { status: 503 },
    );
  }
}
