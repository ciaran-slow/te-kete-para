// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as searchRoute from "@/app/api/suburbs/search/route";
import {
  escapeLikePattern,
  toSuburbSearchResult,
} from "@/app/api/suburbs/search/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(searchRoute);

const MISSING_QUERY_BODY = { error: "Query parameter q is required." };

describe("GET /api/suburbs/search", () => {
  beforeAll(async () => {
    await setupTestDb();
    await getDb()("addresses").insert([
      { street_name: "Cuba Mall", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true },
      { street_name: "Cuba Street", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true },
      { street_name: "Karori Road", suburb: "Karori", zone: "SUBURBAN-WEST", is_inner_city_night_collection: false },
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
    }
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
          (result: { streetName: string; isInnerCityNightCollection: boolean }) => ({
            streetName: result.streetName,
            isInnerCityNightCollection: result.isInnerCityNightCollection,
          }),
        ),
      ).toEqual([
        { streetName: "Cuba Mall", isInnerCityNightCollection: true },
        { streetName: "Cuba Street", isInnerCityNightCollection: true },
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

  it("toSuburbSearchResult casts sqlite's 1/0 to real JSON booleans", () => {
    const base = {
      id: 7,
      street_name: "Aro Street",
      suburb: "Aro Valley",
      zone: "CBD-INNER",
    };

    const truthy = toSuburbSearchResult({
      ...base,
      is_inner_city_night_collection: 1,
    });
    expect(truthy.isInnerCityNightCollection).toBe(true);
    expect(typeof truthy.isInnerCityNightCollection).toBe("boolean");

    const falsy = toSuburbSearchResult({
      ...base,
      is_inner_city_night_collection: 0,
    });
    expect(falsy.isInnerCityNightCollection).toBe(false);
    expect(typeof falsy.isInnerCityNightCollection).toBe("boolean");
  });
});
