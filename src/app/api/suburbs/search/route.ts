import { getDb } from "@/lib/db";

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

/**
 * Backslash-escapes SQLite LIKE wildcards (`%`, `_`) and the escape
 * character itself (`\`) so a user's query is matched literally, never as
 * a pattern — paired with `ESCAPE '\'` in the query below (ADR 0012).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Maps a raw `addresses` row to the API's camelCase contract (ADR 0012).
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
    const pattern = `%${escapeLikePattern(q)}%`;
    const rows: AddressRow[] = await db("addresses")
      .whereRaw("street_name LIKE ? ESCAPE '\\'", [pattern])
      .orderBy("street_name")
      .select("id", "street_name", "suburb", "zone", "is_inner_city_night_collection");

    return Response.json({ results: rows.map(toSuburbSearchResult) });
  } catch {
    return Response.json(
      { error: "Unable to search addresses." },
      { status: 503 },
    );
  }
}
