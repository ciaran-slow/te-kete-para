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

describe("GET /api/suburbs/search", () => {
  beforeAll(async () => {
    await setupTestDb();
    // Deliberately inserted in non-alphabetical order so the "ordered by
    // street name" assertion fails if the route ever drops its ORDER BY:
    // sqlite's default rowid order would return Cuba Street before Cuba Mall.
    await getDb()("addresses").insert([
      { street_name: "Karori Road", suburb: "Karori", zone: "SUBURBAN-WEST", is_inner_city_night_collection: false },
      { street_name: "Cuba Street", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true },
      { street_name: "Cuba Mall", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true },
    ]);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("returns the exact match with camelCase fields and a real JSON boolean", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Karori Road")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);

    const { id } = (await getDb()("addresses")
      .where({ street_name: "Karori Road" })
      .first("id")) as { id: number };
    expect(response.body.results[0]).toEqual({
      id,
      streetName: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      isInnerCityNightCollection: false,
    });
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

  it("returns an empty result list for a typo, not an error", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Cubaa Streetz")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("rejects an empty query value with 400", async () => {
    const response = await request(app).get("/api/suburbs/search?q=");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Query parameter q is required." });
  });

  it("rejects a request with no q parameter at all with 400", async () => {
    const response = await request(app).get("/api/suburbs/search");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Query parameter q is required." });
  });

  it("rejects a whitespace-only query with 400 (trims before the emptiness check)", async () => {
    const response = await request(app).get("/api/suburbs/search?q=%20%20%20");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Query parameter q is required." });
  });

  it("treats a literal % as a character to match, not a wildcard", async () => {
    // No fixture contains a literal %; a non-empty result here would mean the
    // escaping failed and % matched every row.
    const response = await request(app).get("/api/suburbs/search?q=%25");

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("answers repeated identical requests with identical results", async () => {
    // The sqlite3 pool is { min: 1, max: 1 }: a leaked connection or a read
    // path with side effects shows up on the second or third call, not the
    // first.
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).get(
        `/api/suburbs/search?q=${encodeURIComponent("cuba")}`,
      );
      expect(response.status).toBe(200);
      expect(
        response.body.results.map(
          (result: { streetName: string; isInnerCityNightCollection: boolean }) => [
            result.streetName,
            result.isInnerCityNightCollection,
          ],
        ),
      ).toEqual([
        ["Cuba Mall", true],
        ["Cuba Street", true],
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

  it("toSuburbSearchResult casts sqlite's 1/0 storage representation to JSON booleans", () => {
    const truthy = toSuburbSearchResult({
      id: 1,
      street_name: "Cuba Street",
      suburb: "Te Aro",
      zone: "CBD-INNER",
      is_inner_city_night_collection: 1,
    });
    expect(truthy.isInnerCityNightCollection).toBe(true);
    expect(typeof truthy.isInnerCityNightCollection).toBe("boolean");

    const falsy = toSuburbSearchResult({
      id: 2,
      street_name: "Karori Road",
      suburb: "Karori",
      zone: "SUBURBAN-WEST",
      is_inner_city_night_collection: 0,
    });
    expect(falsy.isInnerCityNightCollection).toBe(false);
    expect(typeof falsy.isInnerCityNightCollection).toBe("boolean");
  });
});
