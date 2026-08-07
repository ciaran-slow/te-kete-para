// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as searchRoute from "@/app/api/suburbs/search/route";
import { toSuburbSearchResult } from "@/app/api/suburbs/search/route";
import { escapeLikePattern } from "@/lib/api/escape-like-pattern";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(searchRoute);

const MISSING_QUERY_BODY = { error: "Query parameter q is required." };

describe("GET /api/suburbs/search", () => {
  beforeAll(async () => {
    await setupTestDb();
    // Deliberately inserted in NON-alphabetical order ("Cuba Street" before
    // "Cuba Mall"): sqlite's default rowid order then differs from
    // ORDER BY street_name, so the ordering assertions below actually fail
    // if the route drops its .orderBy("street_name") clause.
    await getDb()("addresses").insert([
      { street_name: "Cuba Street", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
      { street_name: "Karori Road", suburb: "Karori", zone: "SUBURBAN-WEST", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 3 },
      { street_name: "Cuba Mall", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
      { street_name: "Ōwhiro Bay Parade", suburb: "Owhiro Bay", zone: "SUBURBAN-SOUTH", is_inner_city_night_collection: false, recycling_calendar_group: 2, collection_weekday: 4 },
    ]);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("returns the exact match with camelCase fields and a real JSON boolean", async () => {
    const fixture = await getDb()("addresses")
      .where({ street_name: "Karori Road" })
      .first("id");

    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Karori Road")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toEqual({
      id: fixture.id,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
      recyclingCalendarGroup: 1,
      collectionWeekday: 3,
    });
    // The JSON *type* matters: sqlite hands knex 0/1, and 0 == false would
    // satisfy a loose comparison — assert the mapped value is a boolean.
    expect(typeof response.body.results[0].isInnerCityNightCollection).toBe(
      "boolean",
    );
  });

  it("matches partial street names case-insensitively, ordered by street name", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("cuba")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(2);
    expect(
      response.body.results.map(
        (result: { streetName: string }) => result.streetName,
      ),
    ).toEqual(["Cuba Mall", "Cuba Street"]);
    for (const result of response.body.results) {
      expect(result.isInnerCityNightCollection).toBe(true);
      expect(typeof result.isInnerCityNightCollection).toBe("boolean");
      expect(result.recyclingCalendarGroup).toBeNull();
      expect(result.collectionWeekday).toBeNull();
    }
  });

  it("matches a macron-less query against macron-bearing street_name (owhiro)", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("owhiro")}`,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.results.map(
        (result: { streetName: string }) => result.streetName,
      ),
    ).toEqual(["Ōwhiro Bay Parade"]);
  });

  it("matches an all-caps macron query (ŌWHIRO BAY PARADE)", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("ŌWHIRO BAY PARADE")}`,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.results.map(
        (result: { streetName: string }) => result.streetName,
      ),
    ).toEqual(["Ōwhiro Bay Parade"]);
  });

  it("matches the exact macron-bearing text unchanged (Ōwhiro Bay Parade)", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Ōwhiro Bay Parade")}`,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.results.map(
        (result: { streetName: string }) => result.streetName,
      ),
    ).toEqual(["Ōwhiro Bay Parade"]);
  });

  it("returns an empty result set for a typo, not an error", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Cubaa Streetz")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("rejects an empty query value with 400", async () => {
    const response = await request(app).get("/api/suburbs/search?q=");

    expect(response.status).toBe(400);
    expect(response.body).toEqual(MISSING_QUERY_BODY);
  });

  it("rejects a request with no q parameter at all with 400", async () => {
    const response = await request(app).get("/api/suburbs/search");

    expect(response.status).toBe(400);
    expect(response.body).toEqual(MISSING_QUERY_BODY);
  });

  it("rejects a whitespace-only query with 400 (trimming happens before the emptiness check)", async () => {
    const response = await request(app).get("/api/suburbs/search?q=%20%20%20");

    expect(response.status).toBe(400);
    expect(response.body).toEqual(MISSING_QUERY_BODY);
  });

  it("treats a literal % as a character to match, not a wildcard", async () => {
    // No fixture contains a literal "%": a non-empty result here would mean
    // the escaping failed and "%" matched every row.
    const response = await request(app).get("/api/suburbs/search?q=%25");

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("answers repeated identical requests with identical results", async () => {
    // The sqlite3 pool is { min: 1, max: 1 }: a handler that leaks the one
    // connection, or a read path with side effects, drifts on later calls.
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).get(
        `/api/suburbs/search?q=${encodeURIComponent("cuba")}`,
      );

      expect(response.status).toBe(200);
      expect(
        response.body.results.map(
          (result: {
            streetName: string;
            isInnerCityNightCollection: boolean;
            recyclingCalendarGroup: number | null;
            collectionWeekday: number | null;
          }) => ({
            streetName: result.streetName,
            isInnerCityNightCollection: result.isInnerCityNightCollection,
            recyclingCalendarGroup: result.recyclingCalendarGroup,
            collectionWeekday: result.collectionWeekday,
          }),
        ),
      ).toEqual([
        {
          streetName: "Cuba Mall",
          isInnerCityNightCollection: true,
          recyclingCalendarGroup: null,
          collectionWeekday: null,
        },
        {
          streetName: "Cuba Street",
          isInnerCityNightCollection: true,
          recyclingCalendarGroup: null,
          collectionWeekday: null,
        },
      ]);
    }
  });

  it("rejects a verb the route does not export with 405 and an Allow header", async () => {
    const response = await request(app).post("/api/suburbs/search");

    expect(response.status).toBe(405);
    expect(response.headers["allow"]).toBe("GET");
  });

  it("escapeLikePattern escapes %, _ and \\ individually and leaves plain text alone", () => {
    expect(escapeLikePattern("50% off_deal\\path")).toBe(
      "50\\% off\\_deal\\\\path",
    );
    expect(escapeLikePattern("Cuba")).toBe("Cuba");
  });

  it("toSuburbSearchResult casts sqlite's 1/0 to real JSON booleans and maps recycling_calendar_group/collection_weekday", () => {
    const base = {
      id: 7,
      street_name: "Aro Street",
      suburb: "Aro Valley",
      zone: "CBD-INNER",
    };

    const truthy = toSuburbSearchResult({
      ...base,
      is_inner_city_night_collection: 1,
      recycling_calendar_group: null,
      collection_weekday: null,
    });
    expect(truthy.isInnerCityNightCollection).toBe(true);
    expect(typeof truthy.isInnerCityNightCollection).toBe("boolean");
    expect(truthy.recyclingCalendarGroup).toBeNull();
    expect(truthy.collectionWeekday).toBeNull();

    const falsy = toSuburbSearchResult({
      ...base,
      is_inner_city_night_collection: 0,
      recycling_calendar_group: 2,
      collection_weekday: 5,
    });
    expect(falsy.isInnerCityNightCollection).toBe(false);
    expect(typeof falsy.isInnerCityNightCollection).toBe("boolean");
    expect(falsy.recyclingCalendarGroup).toBe(2);
    expect(falsy.collectionWeekday).toBe(5);

    const unexpectedRawValue = toSuburbSearchResult({
      ...base,
      is_inner_city_night_collection: 0,
      recycling_calendar_group: 3,
      collection_weekday: 7,
    });
    expect(unexpectedRawValue.recyclingCalendarGroup).toBeNull();
    expect(unexpectedRawValue.collectionWeekday).toBeNull();

    const unconfirmedClassification = toSuburbSearchResult({
      ...base,
      is_inner_city_night_collection: null,
      recycling_calendar_group: null,
      collection_weekday: null,
    });
    expect(unconfirmedClassification.isInnerCityNightCollection).toBeNull();
  });
});
