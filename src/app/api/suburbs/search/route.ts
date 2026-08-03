import { getDb } from "@/lib/db";
import { foldDiacritics } from "@/lib/api/fold-diacritics";

interface AddressRow {
  id: number;
  street_name: string;
  suburb: string;
  zone: string;
  is_inner_city_night_collection: number | boolean;
}

export interface SuburbSearchResult {
  id: number;
  streetName: string;
  suburb: string;
  zone: string;
  isInnerCityNightCollection: boolean;
}

export { escapeLikePattern } from "@/lib/api/escape-like-pattern";

/**
 * Maps a raw `addresses` row to the API's camelCase contract (ADR 0013).
 * `Boolean(...)` closes the gap where knex's sqlite3 dialect returns
 * `boolean` columns as the JS number 1/0, not true/false.
 */
export function toSuburbSearchResult(row: AddressRow): SuburbSearchResult {
  return {
    id: row.id,
    streetName: row.street_name,
    suburb: row.suburb,
    zone: row.zone,
    isInnerCityNightCollection: Boolean(row.is_inner_city_night_collection),
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
    const foldedQuery = foldDiacritics(q);
    const rows: AddressRow[] = await db("addresses")
      .orderBy("street_name")
      .select("id", "street_name", "suburb", "zone", "is_inner_city_night_collection");

    const matches = rows.filter((row) =>
      foldDiacritics(row.street_name).includes(foldedQuery),
    );

    return Response.json({ results: matches.map(toSuburbSearchResult) });
  } catch {
    return Response.json(
      { error: "Unable to search addresses." },
      { status: 503 },
    );
  }
}
