import { getDb } from "@/lib/db";
import { foldDiacritics } from "@/lib/api/fold-diacritics";
import type { RecyclingCalendarGroup } from "@/lib/schedule/rules";
import {
  toCollectionDayClassification,
  type Weekday,
} from "@/lib/schedule/collection-day";

interface AddressRow {
  id: number;
  street_name: string;
  suburb: string;
  zone: string;
  is_inner_city_night_collection: number | boolean;
  recycling_calendar_group: number | null;
  collection_weekday: number | null;
}

export interface SuburbSearchResult {
  id: number;
  streetName: string;
  suburb: string;
  zone: string;
  isInnerCityNightCollection: boolean;
  recyclingCalendarGroup: RecyclingCalendarGroup | null;
  collectionWeekday: Weekday | null;
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
    recyclingCalendarGroup:
      row.recycling_calendar_group === 1 || row.recycling_calendar_group === 2
        ? row.recycling_calendar_group
        : null,
    collectionWeekday: toCollectionDayClassification(row).collectionWeekday,
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
      .select(
        "id",
        "street_name",
        "suburb",
        "zone",
        "is_inner_city_night_collection",
        "recycling_calendar_group",
        "collection_weekday",
      );

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
