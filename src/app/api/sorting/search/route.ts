import { getDb } from "@/lib/db";
import { escapeLikePattern } from "@/lib/api/escape-like-pattern";

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
    const pattern = `%${escapeLikePattern(q)}%`;
    const rows: SortingRuleRow[] = await db("sorting_rules")
      .where((builder) => {
        builder
          .whereRaw("item_key LIKE ? ESCAPE '\\'", [pattern])
          .orWhereRaw("description_en LIKE ? ESCAPE '\\'", [pattern])
          .orWhereRaw("description_mi LIKE ? ESCAPE '\\'", [pattern]);
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
